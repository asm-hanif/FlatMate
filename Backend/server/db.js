/**
 * ============================================================
 * FlatMate database layer — PostgreSQL (via node-postgres / pg)
 * ============================================================
 *
 * This replaces the old SQL Server (mssql/msnodesqlv8) layer. To avoid
 * touching every controller/route in the app, executeSql() keeps the
 * EXACT SAME calling convention the whole codebase already uses:
 *
 *   executeSql('SELECT * FROM dbo.Flats WHERE Id = @id', [
 *       { name: 'id', type: sql.Int, value: 5 }
 *   ])
 *
 * Internally this:
 *   1. Rewrites "@name" placeholders to Postgres's positional "$1, $2..."
 *      (repeated uses of the same @name are collapsed to one parameter).
 *   2. Ignores the mssql-style `type` field — Postgres/node-postgres
 *      infers types from the JS value, so `sql.Int`, `sql.NVarChar(n)`
 *      etc. below are harmless no-op stand-ins kept only so existing
 *      code (which references them) doesn't need to change.
 *   3. Re-cases every returned row's keys back to the PascalCase the
 *      rest of the app expects (Postgres folds unquoted identifiers to
 *      lowercase) — see columnCase.js.
 *
 * All tables live in a Postgres schema named "dbo" (created by
 * schema.js) purely so the extensive "dbo.TableName" references
 * throughout the existing SQL text keep working unchanged. The
 * connection's search_path also includes "dbo", so the handful of
 * queries written without the prefix work too.
 */

const { Pool } = require('pg');
const { recaseRows } = require('./columnCase');

/* ------------------------------------------------------------
   sql / TYPES compatibility shim
   Every property access (sql.Int) or call (sql.NVarChar(255)) just
   returns an inert value — executeSql() never looks at it.
------------------------------------------------------------ */

function noop() { return null; }

const sql = new Proxy({ MAX: 'MAX' }, {
    get(target, prop) {
        if (prop in target) return target[prop];
        return noop;
    }
});

const TYPES = sql;


/* ------------------------------------------------------------
   Connection pool
------------------------------------------------------------ */

function buildPoolConfig() {
    const connectionString = process.env.DATABASE_URL;

    // Render (and most managed Postgres hosts) require SSL, but a local
    // dev Postgres install usually doesn't support/need it. DB_SSL lets
    // this be controlled explicitly; otherwise we guess from the host.
    const sslEnvValue = String(process.env.DB_SSL || '').toLowerCase();
    const explicitSSL = sslEnvValue === 'true' ? true : sslEnvValue === 'false' ? false : null;

    const looksManaged = connectionString && !/localhost|127\.0\.0\.1/.test(connectionString);
    const useSSL = explicitSSL !== null ? explicitSSL : Boolean(looksManaged);

    const sslOption = useSSL ? { rejectUnauthorized: false } : false;

    if (connectionString) {
        return {
            connectionString,
            ssl: sslOption,
            // Every table lives in the "dbo" schema; this lets both
            // "dbo.Flats" and bare "Flats" resolve the same way.
            options: '-c search_path=dbo,public'
        };
    }

    // Fallback: discrete PG*-style variables (useful for local dev).
    return {
        host: process.env.PGHOST || process.env.DB_HOST || 'localhost',
        port: Number(process.env.PGPORT || process.env.DB_PORT || 5432),
        database: process.env.PGDATABASE || process.env.DB_NAME || 'flatmatedb',
        user: process.env.PGUSER || process.env.DB_USER || 'postgres',
        password: String(process.env.PGPASSWORD ?? process.env.DB_PASSWORD ?? ''),
        ssl: sslOption,
        options: '-c search_path=dbo,public'
    };
}

let pool = null;

function getPool() {
    if (pool) return pool;

    pool = new Pool(buildPoolConfig());

    pool.on('error', (err) => {
        // Errors on idle clients shouldn't crash the whole process.
        console.error('✗ Unexpected PostgreSQL pool error:', err.message);
    });

    return pool;
}

/** Kept for backward compatibility with any code expecting a connection handle. */
async function getConnection() {
    const p = getPool();
    // Verify we can actually reach the database.
    await p.query('SELECT 1');
    return p;
}


/* ------------------------------------------------------------
   @param -> $1,$2... conversion
------------------------------------------------------------ */

function toPositionalQuery(query, params) {
    const nameToIndex = new Map();
    const orderedNames = [];

    const text = query.replace(/@([A-Za-z_][A-Za-z0-9_]*)/g, (match, name) => {
        if (!nameToIndex.has(name)) {
            orderedNames.push(name);
            nameToIndex.set(name, orderedNames.length); // 1-based
        }
        return '$' + nameToIndex.get(name);
    });

    const values = orderedNames.map((name) => {
        const found = params.find((p) => p.name === name);
        return found ? found.value ?? null : null;
    });

    return { text, values };
}


/* ------------------------------------------------------------
   executeSql(query, params) -> rows (PascalCase keys)
------------------------------------------------------------ */

async function executeSql(query, params = []) {
    const { text, values } = toPositionalQuery(query, params);

    const client = getPool();
    const result = await client.query(text, values);

    return recaseRows(result.rows || []);
}

async function withTransaction(callback) {
    const client = await getPool().connect();
    try {
        await client.query('BEGIN');
        const tx = {
            query: async (query, params = []) => {
                const { text, values } = toPositionalQuery(query, params);
                const result = await client.query(text, values);
                return recaseRows(result.rows || []);
            }
        };
        const result = await callback(tx);
        await client.query('COMMIT');
        return result;
    } catch (error) {
        try { await client.query('ROLLBACK'); } catch (_) {}
        throw error;
    } finally {
        client.release();
    }
}

module.exports = { sql, TYPES, getConnection, getPool, executeSql, withTransaction };
