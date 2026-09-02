require('dotenv').config();

const express = require('express');
const session = require('express-session');
const cors = require('cors');
const path = require('path');

const { executeSql, getPool } = require('./server/db');
const { ensureSchema } = require('./server/schema');
const { ensureModelReady: ensurePriceModelReady } = require('./ai/priceModel');
const {
    verifyMailConnection
} = require('./server/services/mailService');

const app = express();

const PORT = process.env.PORT || 3000;

if (!process.env.SESSION_SECRET) {
    console.warn('⚠ SESSION_SECRET is not configured. Set it in .env before deployment.');
}

/* ============================================================
   BASIC APP CONFIGURATION
============================================================ */

app.disable('x-powered-by');

// Render puts this app behind a reverse proxy (and so does Vercel for
// the frontend, though that's a separate deployment). Trusting the
// proxy is required for secure cookies to work correctly in production.
app.set('trust proxy', 1);


/* ============================================================
   CORS

   The Frontend (Vercel) and Backend (Render) run on different
   domains in production, so the browser treats every request as
   cross-origin. FRONTEND_URL (comma-separated for multiple allowed
   origins, e.g. a production domain + Vercel preview URLs) controls
   which origins may call this API with credentials (cookies).

   Locally, with no FRONTEND_URL set, this app usually serves the
   Frontend itself (see STATIC FILES below) so requests are same-origin
   and CORS doesn't come into play — but allowing localhost origins too
   means the Frontend can also be run separately (e.g. `vercel dev`)
   during local development.
============================================================ */

const configuredOrigins = (process.env.FRONTEND_URL || '')
    .split(',')
    .map(origin => origin.trim())
    .filter(Boolean);

const defaultDevOrigins = ['http://localhost:3000', 'http://127.0.0.1:3000', 'http://localhost:5173'];
const allowedOrigins = [...new Set([...configuredOrigins, ...defaultDevOrigins])];

app.use(cors({
    origin(origin, callback) {
        // Same-origin requests, curl, server-to-server calls, etc. have no Origin header.
        if (!origin) return callback(null, true);
        if (allowedOrigins.includes(origin)) return callback(null, true);
        console.warn(`⚠ Blocked CORS request from unrecognized origin: ${origin}`);
        return callback(new Error('Not allowed by CORS'));
    },
    credentials: true
}));


/* ============================================================
   SESSION CONFIGURATION

   Sessions are stored in Postgres (connect-pg-simple), not memory,
   so logins survive server restarts — this matters a lot on Render,
   where free/starter services can spin down and restart.
============================================================ */

const pgSession = require('connect-pg-simple')(session);
const isProduction = process.env.NODE_ENV === 'production';

app.use(
    session({
        store: new pgSession({
            pool: getPool(),
            tableName: 'session',
            createTableIfMissing: true
        }),

        secret: process.env.SESSION_SECRET || 'development-only-secret',

        resave: false,

        saveUninitialized: false,

        // Rolling: every request refreshes the expiry, so an active user
        // is never logged out mid-session — only after 30 days of no
        // activity at all.
        rolling: true,

        cookie: {
            secure: isProduction,
            httpOnly: true,
            // Cross-origin (Vercel <-> Render) cookies require SameSite=None,
            // which in turn requires Secure — both true in production.
            sameSite: isProduction ? 'none' : 'lax',
            maxAge: 30 * 24 * 60 * 60 * 1000 // 30 days
        }
    })
);


/* ============================================================
   BODY PARSERS
============================================================ */

app.use(express.json({ limit: '10mb' }));

app.use(
    express.urlencoded({
        extended: true,
        limit: '10mb'
    })
);


/* ============================================================
   STATIC FILES

   The project is split into two folders:
     FlatMate/Frontend  -> all HTML/CSS/JS the browser loads
     FlatMate/Backend   -> this server (and user-uploaded files)

   User uploads (property photos/videos, avatars) are written by
   multer into Backend/uploads, so they get their own static route.
   Everything else (pages, styles, scripts) is served from ../Frontend.
============================================================ */

app.use('/uploads', express.static(path.join(__dirname, 'uploads'), { maxAge: '7d' }));

app.use(
    express.static(
        path.join(__dirname, '..', 'Frontend')
    )
);


/* ============================================================
   API ROUTES
============================================================ */

app.use(
    '/api/auth',
    require('./server/routes/authRoutes')
);

app.use(
    '/api/flats',
    require('./server/routes/flatRoutes')
);

app.use(
    '/api/profile',
    require('./server/routes/profileRoutes')
);

app.use(
    '/api/requests',
    require('./server/routes/requestRoutes')
);

app.use(
    '/api/favorites',
    require('./server/routes/favoriteRoutes')
);

app.use(
    '/api/chat',
    require('./server/routes/chatRoutes')
);

app.use(
    '/api/contact',
    require('./server/routes/contactRoutes')
);

app.use('/api/bot', require('./server/routes/botRoutes'));
app.use('/api/notifications', require('./server/routes/notificationRoutes'));
app.use('/api/reports', require('./server/routes/reportRoutes'));


/* ============================================================
   API HEALTH CHECK
============================================================ */

app.get('/api/health', async (req, res) => {
    try {
        await executeSql('SELECT 1 AS OK');

        res.json({
            success: true,
            message: 'FlatMate API is running.',
            database: 'connected',
            timestamp: new Date().toISOString()
        });

    } catch (error) {

        console.error(
            'Health check database error:',
            error.message
        );

        res.status(503).json({
            success: false,
            message: 'FlatMate API is running, but database is unavailable.',
            database: 'disconnected',
            timestamp: new Date().toISOString()
        });
    }
});


/* ============================================================
   API 404 HANDLER
============================================================ */

app.use('/api', (req, res) => {

    res.status(404).json({
        success: false,
        error: 'API endpoint not found.',
        path: req.originalUrl
    });

});


/* ============================================================
   FRONTEND FALLBACK
============================================================ */

/*
   This allows normal frontend routes to load index.html
   without interfering with API routes.
*/

app.get(/.*/, (req, res) => {

    res.sendFile(
        path.join(
            __dirname,
            '..',
            'Frontend',
            'index.html'
        )
    );

});


/* ============================================================
   GLOBAL ERROR HANDLER
============================================================ */

app.use((err, req, res, next) => {
    console.error('Unhandled server error:', err);
    if (res.headersSent) return next(err);

    const uploadError = err && (err.code === 'LIMIT_FILE_SIZE' || err.message?.includes('Only JPG') || err.message?.includes('Only PNG') || err.message?.includes('Only video'));
    res.status(uploadError ? 400 : 500).json({
        success: false,
        error: uploadError ? err.message : 'Internal server error.'
    });
});


/* ============================================================
   DATABASE CONNECTION TEST
============================================================ */

async function testDatabaseConnection() {

    try {

        await executeSql(
            'SELECT 1 AS OK'
        );

        console.log(
            '✓ PostgreSQL connection test passed.'
        );

        return true;

    } catch (error) {

        console.error(
            '✗ PostgreSQL connection test failed:'
        );

        console.error(
            error && error.message
                ? error.message
                : error
        );

        return false;
    }
}


/* ============================================================
   MAIL CONNECTION TEST
============================================================ */

async function testMailConnection() {

    try {

        await verifyMailConnection();

        console.log(
            '✓ Mail server connection test passed.'
        );

        return true;

    } catch (error) {

        console.error(
            '✗ Mail server connection test failed:'
        );

        console.error(
            error && error.message
                ? error.message
                : error
        );

        return false;
    }
}


/* ============================================================
   START SERVER
============================================================ */

async function start() {

    console.log('');
    console.log('==============================================');
    console.log('              FLATMATE SERVER');
    console.log('==============================================');
    console.log('');


    /*
       Test PostgreSQL.
       The server will still start if the database
       is temporarily unavailable.
    */

    const databaseReady =
        await testDatabaseConnection();

    if (!databaseReady) {
        console.error('✗ FlatMate will NOT start because PostgreSQL is unavailable.');
        process.exit(1);
    }

    try {
        await ensureSchema();
    } catch (schemaError) {
        console.error('✗ Schema verification failed:', schemaError.message);
        console.error('✗ FlatMate will NOT start with an unverified database schema.');
        process.exit(1);
    }


    /*
       Test email service.
       The server will still start if email is not
       configured correctly yet.
    */

    const mailReady =
        await testMailConnection();

    if (!mailReady) {
        console.warn('⚠ Mail service is unavailable. The website will still run, but email features will not work until SMTP is configured.');
    }


    /*
       Train (or load a cached) price model.
       The server will still start if this fails — the price
       advisor feature just won't work until it's fixed.
    */

    let priceModelReady = false;

    try {
        await ensurePriceModelReady();
        priceModelReady = true;
    } catch (modelError) {
        console.error('✗ Price model failed to train:', modelError.message);
        console.warn('⚠ The AI price advisor will be unavailable until this is resolved.');
    }


    /*
       Start Express server.
    */

    app.listen(PORT, () => {

        console.log('');
        console.log(
            `✓ FlatMate server running on http://localhost:${PORT}`
        );

        console.log(
            `✓ API health: http://localhost:${PORT}/api/health`
        );

        console.log('');

        console.log(
            `Database: ${databaseReady ? '✓ Connected' : '✗ Not connected'}`
        );

        console.log(
            `Mail:     ${mailReady ? '✓ Connected' : '✗ Not connected'}`
        );

        console.log(
            `AI model: ${priceModelReady ? '✓ Trained & ready' : '✗ Not ready'}`
        );

        console.log('');

        console.log('Available API modules:');
        console.log('  ✓ Authentication');
        console.log('  ✓ Properties');
        console.log('  ✓ Profiles');
        console.log('  ✓ Requests');
        console.log('  ✓ Chat');
        console.log('  ✓ Contact / Email');
        console.log('  ✓ AI Price Advisor & Flat-Finder Bot');

        console.log('');
        console.log('==============================================');
        console.log('');
    });
}


/* ============================================================
   START APPLICATION
============================================================ */

start().catch((error) => {

    console.error('');
    console.error(
        '✗ Failed to start FlatMate server:'
    );

    console.error(error);

    process.exit(1);
});