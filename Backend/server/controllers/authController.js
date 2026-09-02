const { executeSql, sql } = require('../db');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const { validatePassword, validateGmailAddress } = require('../validators');
const { sendPasswordResetEmail, isMailConfigured } = require('../services/mailService');


// ============================================================
// SHARED: establish a logged-in session for a user row
// Used by both login() and register() (registration auto-signs the
// person in — no separate login step needed right after creating
// an account).
// ============================================================

function establishSession(req, user) {
    return new Promise((resolve, reject) => {
        req.session.user = {
            id: user.Id,
            Id: user.Id,

            name: user.Name,
            Name: user.Name,

            email: user.Email,
            Email: user.Email,

            phone: user.Phone || null,
            Phone: user.Phone || null,

            role: user.Role,
            Role: user.Role,

            avatarUrl: user.AvatarUrl || null,
            AvatarUrl: user.AvatarUrl || null,

            address: user.Address || null,
            Address: user.Address || null,

            bio: user.Bio || null,
            Bio: user.Bio || null,

            createdAt: user.CreatedAt || null,
            CreatedAt: user.CreatedAt || null
        };

        req.session.userId = user.Id;
        req.session.userName = user.Name;
        req.session.role = user.Role;

        req.session.save((saveError) => {
            if (saveError) return reject(saveError);
            resolve();
        });
    });
}

function publicUserShape(user) {
    return {
        id: user.Id,
        name: user.Name,
        email: user.Email,
        phone: user.Phone || null,
        role: user.Role,
        avatarUrl: user.AvatarUrl || null,
        address: user.Address || null,
        bio: user.Bio || null,
        createdAt: user.CreatedAt || null
    };
}


// ============================================================
// REGISTER
// ============================================================

async function register(req, res) {
    const { name, email, phone, password, role } = req.body;

    // --------------------------------------------------------
    // Validate input
    // --------------------------------------------------------

    if (!name || !email || !password || !role) {
        return res.status(400).json({
            success: false,
            error: 'Name, email, password and role are required.'
        });
    }

    // Only normal user registration roles are allowed.
    if (!['User', 'Owner', 'Both'].includes(role)) {
        return res.status(400).json({
            success: false,
            error: 'Invalid role. Role must be User, Owner or Both.'
        });
    }

    try {
        const cleanName = String(name).trim();
        const cleanEmail = String(email).trim().toLowerCase();
        const cleanPhone = phone
            ? String(phone).trim()
            : null;

        // ----------------------------------------------------
        // Basic validation
        // ----------------------------------------------------

        if (cleanName.length < 2) {
            return res.status(400).json({
                success: false,
                error: 'Name must contain at least 2 characters.'
            });
        }

        const emailError = validateGmailAddress(cleanEmail);
        if (emailError) {
            return res.status(400).json({
                success: false,
                error: emailError
            });
        }

        const passwordError = validatePassword(password);
        if (passwordError) {
            return res.status(400).json({
                success: false,
                error: passwordError
            });
        }

        // ----------------------------------------------------
        // Check whether email already exists
        // ----------------------------------------------------

        const existing = await executeSql(
            `
            SELECT Id
            FROM dbo.Users
            WHERE LOWER(Email) = @email
            `,
            [
                {
                    name: 'email',
                    type: sql.NVarChar(255),
                    value: cleanEmail
                }
            ]
        );

        // executeSql() returns rows directly in this project.
        if (existing && existing.length > 0) {
            return res.status(409).json({
                success: false,
                error: 'Email already registered.'
            });
        }

        // ----------------------------------------------------
        // Hash password
        // ----------------------------------------------------

        const passwordHash = await bcrypt.hash(
            String(password),
            10
        );

        // ----------------------------------------------------
        // Insert new user
        // ----------------------------------------------------

        const insertedRows = await executeSql(
            `
            INSERT INTO dbo.Users
            (
                Name,
                Email,
                Phone,
                PasswordHash,
                Role,
                CreatedAt
            )
            VALUES
            (
                @name,
                @email,
                @phone,
                @passwordHash,
                @role,
                GETDATE()
            )
            RETURNING
                Id,
                Name,
                Email,
                Phone,
                Role,
                CreatedAt
            `,
            [
                {
                    name: 'name',
                    type: sql.NVarChar(100),
                    value: cleanName
                },
                {
                    name: 'email',
                    type: sql.NVarChar(255),
                    value: cleanEmail
                },
                {
                    name: 'phone',
                    type: sql.NVarChar(20),
                    value: cleanPhone
                },
                {
                    name: 'passwordHash',
                    type: sql.NVarChar(255),
                    value: passwordHash
                },
                {
                    name: 'role',
                    type: sql.NVarChar(20),
                    value: role
                }
            ]
        );

        // ----------------------------------------------------
        // Make sure insertion returned a user
        // ----------------------------------------------------

        if (!insertedRows || insertedRows.length === 0) {
            console.error(
                'Registration failed: INSERT returned no user.'
            );

            return res.status(500).json({
                success: false,
                error: 'User could not be created.'
            });
        }

        const newUser = insertedRows[0];

        // ----------------------------------------------------
        // Auto-login: the person shouldn't have to sign in again
        // right after creating their account.
        // ----------------------------------------------------

        try {
            await establishSession(req, newUser);
        } catch (sessionError) {
            console.error('Session save error after registration:', sessionError);
            // The account was created successfully either way — just fall
            // back to asking them to log in manually this one time.
            return res.status(201).json({
                success: true,
                message: 'Account created. Please log in.',
                user: publicUserShape(newUser)
            });
        }

        // ----------------------------------------------------
        // Return created + logged-in user
        // ----------------------------------------------------

        return res.status(201).json({
            success: true,
            message: 'Account created successfully.',
            user: publicUserShape(newUser)
        });

    } catch (err) {
        console.error('Registration error:', err);

        // Handle duplicate email at database level too.
        if (
            err &&
            (
                err.code === 'EREQUEST' ||
                String(err.message || '')
                    .toLowerCase()
                    .includes('duplicate')
            )
        ) {
            return res.status(409).json({
                success: false,
                error: 'Email already registered.'
            });
        }

        return res.status(500).json({
            success: false,
            error: 'Registration failed.'
        });
    }
}


// ============================================================
// LOGIN
// ============================================================

async function login(req, res) {
    const { email, password } = req.body;

    // --------------------------------------------------------
    // Validate input
    // --------------------------------------------------------

    if (!email || !password) {
        return res.status(400).json({
            success: false,
            error: 'Email and password are required.'
        });
    }

    try {
        const cleanEmail = String(email)
            .trim()
            .toLowerCase();

        // ----------------------------------------------------
        // Find user
        // ----------------------------------------------------

        const users = await executeSql(
            `
            SELECT
                Id,
                Name,
                Email,
                Phone,
                PasswordHash,
                Role,
                AvatarUrl,
                Address,
                Bio,
                CreatedAt
            FROM dbo.Users
            WHERE LOWER(Email) = @email
            `,
            [
                {
                    name: 'email',
                    type: sql.NVarChar(255),
                    value: cleanEmail
                }
            ]
        );

        if (!users || users.length === 0) {
            return res.status(401).json({
                success: false,
                error: 'Invalid email or password.'
            });
        }

        const user = users[0];

        // ----------------------------------------------------
        // Verify password
        // ----------------------------------------------------

        const passwordMatch = await bcrypt.compare(
            String(password),
            user.PasswordHash
        );

        if (!passwordMatch) {
            return res.status(401).json({
                success: false,
                error: 'Invalid email or password.'
            });
        }

        // ----------------------------------------------------
        // Create session
        // ----------------------------------------------------

        try {
            await establishSession(req, user);
        } catch (saveError) {
            console.error('Session save error:', saveError);
            return res.status(500).json({
                success: false,
                error: 'Login successful, but session could not be saved.'
            });
        }

        return res.json({
            success: true,
            message: 'Login successful.',
            user: publicUserShape(user)
        });

    } catch (err) {
        console.error('Login error:', err);

        return res.status(500).json({
            success: false,
            error: 'Login failed.'
        });
    }
}


// ============================================================
// LOGOUT
// ============================================================

function logout(req, res) {
    if (!req.session) {
        return res.json({
            success: true,
            message: 'Logged out successfully.'
        });
    }

    req.session.destroy((err) => {
        if (err) {
            console.error('Logout error:', err);

            return res.status(500).json({
                success: false,
                error: 'Logout failed.'
            });
        }

        res.clearCookie('connect.sid');

        return res.json({
            success: true,
            message: 'Logged out successfully.'
        });
    });
}


// ============================================================
// GET CURRENT SESSION
// GET /api/auth/session
// ============================================================

function getSession(req, res) {

    // --------------------------------------------------------
    // Preferred session format
    // --------------------------------------------------------

    if (req.session && req.session.user) {
        const user = req.session.user;

        return res.json({
            success: true,
            authenticated: true,
            user: {
                id: user.id || user.Id,
                name: user.name || user.Name,
                email: user.email || user.Email || null,
                phone: user.phone || user.Phone || null,
                role: user.role || user.Role || null,
                avatarUrl:
                    user.avatarUrl ||
                    user.AvatarUrl ||
                    null,
                address:
                    user.address ||
                    user.Address ||
                    null,
                bio:
                    user.bio ||
                    user.Bio ||
                    null,
                createdAt:
                    user.createdAt ||
                    user.CreatedAt ||
                    null
            }
        });
    }

    // --------------------------------------------------------
    // Backward-compatible session format
    // --------------------------------------------------------

    if (req.session && req.session.userId) {
        return res.json({
            success: true,
            authenticated: true,
            user: {
                id: req.session.userId,
                name: req.session.userName || null,
                email: null,
                phone: null,
                role: req.session.role || null,
                avatarUrl: null,
                address: null,
                bio: null,
                createdAt: null
            }
        });
    }

    // --------------------------------------------------------
    // Not logged in
    // --------------------------------------------------------

    return res.json({
        success: true,
        authenticated: false,
        user: null
    });
}


// ============================================================
// FORGOT PASSWORD — request an OTP code by email
// ============================================================

const OTP_EXPIRY_MINUTES = 10;
const OTP_RESEND_COOLDOWN_SECONDS = 60;
const OTP_MAX_ATTEMPTS = 5;

// Always the exact same response whether or not the email is registered,
// so this endpoint can't be used to discover which emails have accounts.
const GENERIC_FORGOT_PASSWORD_MESSAGE =
    'If that email is registered with FlatMate, a verification code has been sent.';

function generateOtpCode() {
    return String(crypto.randomInt(100000, 1000000)); // always 6 digits
}

async function forgotPassword(req, res) {
    try {
        const email = String(req.body.email || '').trim().toLowerCase();

        if (!email) {
            return res.status(400).json({ success: false, error: 'Please provide your email address.' });
        }

        const users = await executeSql(
            `SELECT Id, Name, Email FROM dbo.Users WHERE LOWER(Email) = @email LIMIT 1`,
            [{ name: 'email', type: sql.NVarChar(255), value: email }]
        );

        // Deliberately identical response whether or not the account exists.
        if (users.length === 0) {
            return res.json({ success: true, message: GENERIC_FORGOT_PASSWORD_MESSAGE });
        }

        const user = users[0];

        // Cooldown: silently skip sending another code if one went out very
        // recently, without telling the caller anything different either way.
        const recent = await executeSql(
            `SELECT CreatedAt FROM dbo.PasswordResets
             WHERE UserId = @userId
             ORDER BY CreatedAt DESC
             LIMIT 1`,
            [{ name: 'userId', type: sql.Int, value: user.Id }]
        );

        const onCooldown =
            recent.length > 0 &&
            (Date.now() - new Date(recent[0].CreatedAt).getTime()) < OTP_RESEND_COOLDOWN_SECONDS * 1000;

        if (!onCooldown) {
            if (!isMailConfigured()) {
                console.error('Forgot-password requested but SMTP is not configured — cannot send OTP.');
                return res.status(500).json({
                    success: false,
                    error: 'Email service is currently unavailable. Please try again later.'
                });
            }

            const code = generateOtpCode();
            const codeHash = await bcrypt.hash(code, 10);
            const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

            await executeSql(
                `INSERT INTO dbo.PasswordResets (UserId, CodeHash, ExpiresAt, Attempts, Used)
                 VALUES (@userId, @codeHash, @expiresAt, 0, 0)`,
                [
                    { name: 'userId', type: sql.Int, value: user.Id },
                    { name: 'codeHash', type: sql.NVarChar(255), value: codeHash },
                    { name: 'expiresAt', type: sql.DateTime, value: expiresAt }
                ]
            );

            try {
                await sendPasswordResetEmail({ name: user.Name, email: user.Email, code });
            } catch (mailError) {
                console.error('Failed to send password reset email:', mailError.message);
                return res.status(500).json({
                    success: false,
                    error: 'Could not send the verification email right now. Please try again shortly.'
                });
            }
        }

        return res.json({ success: true, message: GENERIC_FORGOT_PASSWORD_MESSAGE });

    } catch (err) {
        console.error('Forgot password error:', err);
        return res.status(500).json({ success: false, error: 'Something went wrong. Please try again.' });
    }
}


// ============================================================
// RESET PASSWORD — verify the OTP code and set a new password
// ============================================================

const INVALID_CODE_MESSAGE = 'That code is invalid or has expired. Please request a new one.';

async function resetPassword(req, res) {
    try {
        const email = String(req.body.email || '').trim().toLowerCase();
        const code = String(req.body.code || '').trim();
        const newPassword = req.body.newPassword || '';

        if (!email || !code) {
            return res.status(400).json({ success: false, error: 'Email and verification code are required.' });
        }

        const passwordError = validatePassword(newPassword);
        if (passwordError) {
            return res.status(400).json({ success: false, error: passwordError });
        }

        const users = await executeSql(
            `SELECT Id, Name, Email, Phone, Role, AvatarUrl, Address, Bio, CreatedAt
             FROM dbo.Users WHERE LOWER(Email) = @email LIMIT 1`,
            [{ name: 'email', type: sql.NVarChar(255), value: email }]
        );

        if (users.length === 0) {
            // Same message as an invalid code — don't reveal whether the email exists.
            return res.status(400).json({ success: false, error: INVALID_CODE_MESSAGE });
        }

        const user = users[0];

        const resets = await executeSql(
            `SELECT Id, CodeHash, ExpiresAt, Attempts
             FROM dbo.PasswordResets
             WHERE UserId = @userId AND Used = 0
             ORDER BY CreatedAt DESC
             LIMIT 1`,
            [{ name: 'userId', type: sql.Int, value: user.Id }]
        );

        if (resets.length === 0) {
            return res.status(400).json({ success: false, error: INVALID_CODE_MESSAGE });
        }

        const reset = resets[0];

        if (new Date(reset.ExpiresAt).getTime() < Date.now()) {
            return res.status(400).json({ success: false, error: INVALID_CODE_MESSAGE });
        }

        if (Number(reset.Attempts) >= OTP_MAX_ATTEMPTS) {
            await executeSql(
                `UPDATE dbo.PasswordResets SET Used = 1 WHERE Id = @id`,
                [{ name: 'id', type: sql.Int, value: reset.Id }]
            );
            return res.status(400).json({
                success: false,
                error: 'Too many incorrect attempts. Please request a new code.'
            });
        }

        const codeMatches = await bcrypt.compare(code, reset.CodeHash);

        if (!codeMatches) {
            await executeSql(
                `UPDATE dbo.PasswordResets SET Attempts = Attempts + 1 WHERE Id = @id`,
                [{ name: 'id', type: sql.Int, value: reset.Id }]
            );
            return res.status(400).json({ success: false, error: INVALID_CODE_MESSAGE });
        }

        // Code is valid — update the password and burn every outstanding
        // reset code for this user (the one just used, and any older ones).
        const newHash = await bcrypt.hash(newPassword, 10);

        await executeSql(
            `UPDATE dbo.Users SET PasswordHash = @hash WHERE Id = @userId`,
            [
                { name: 'hash', type: sql.NVarChar(255), value: newHash },
                { name: 'userId', type: sql.Int, value: user.Id }
            ]
        );

        await executeSql(
            `UPDATE dbo.PasswordResets SET Used = 1 WHERE UserId = @userId AND Used = 0`,
            [{ name: 'userId', type: sql.Int, value: user.Id }]
        );

        // Convenience: sign the person straight in, matching how
        // registration auto-logs-in rather than sending them to /login.
        try {
            await establishSession(req, user);
        } catch (sessionError) {
            console.error('Session save error after password reset:', sessionError);
        }

        return res.json({
            success: true,
            message: 'Password updated successfully.',
            user: publicUserShape(user)
        });

    } catch (err) {
        console.error('Reset password error:', err);
        return res.status(500).json({ success: false, error: 'Something went wrong. Please try again.' });
    }
}


// ============================================================
// EXPORTS
// ============================================================



// ============================================================
// DELETE ACCOUNT
// ============================================================
async function deleteAccount(req, res) {
    const userId = Number(req.session?.userId);
    if (!Number.isInteger(userId) || userId <= 0) return res.status(401).json({ success:false, error:'Unauthorized.' });
    const confirmation = String(req.body?.confirmation || '').trim();
    const password = String(req.body?.password || '');
    if (confirmation !== 'DELETE') return res.status(400).json({ success:false, error:'Type DELETE to confirm account deletion.' });
    if (!password) return res.status(400).json({ success:false, error:'Current password is required.' });
    try {
        const { withTransaction } = require('../db');
        const rows = await executeSql(`SELECT Id, PasswordHash FROM dbo.Users WHERE Id=@id`, [{name:'id',type:sql.Int,value:userId}]);
        if (!rows.length) return res.status(404).json({success:false,error:'User not found.'});
        if (!(await bcrypt.compare(password, rows[0].PasswordHash))) return res.status(403).json({success:false,error:'Current password is incorrect.'});
        const media = await executeSql(`SELECT fm.Url FROM dbo.FlatMedia fm INNER JOIN dbo.Flats f ON f.Id=fm.FlatId WHERE f.OwnerId=@id`, [{name:'id',type:sql.Int,value:userId}]);
        const owned = await executeSql(`SELECT AvatarUrl FROM dbo.Users WHERE Id=@id`, [{name:'id',type:sql.Int,value:userId}]);
        await withTransaction(async tx => {
            await tx.query(`DELETE FROM dbo.ChatMessages WHERE ConversationId IN (SELECT Id FROM dbo.ChatConversations WHERE UserId=@id OR OwnerId=@id)`, [{name:'id',type:sql.Int,value:userId}]);
            await tx.query(`DELETE FROM dbo.ChatConversations WHERE UserId=@id OR OwnerId=@id`, [{name:'id',type:sql.Int,value:userId}]);
            await tx.query(`DELETE FROM dbo.Requests WHERE UserId=@id OR FlatId IN (SELECT Id FROM dbo.Flats WHERE OwnerId=@id)`, [{name:'id',type:sql.Int,value:userId}]);
            await tx.query(`DELETE FROM dbo.Favorites WHERE UserId=@id OR FlatId IN (SELECT Id FROM dbo.Flats WHERE OwnerId=@id)`, [{name:'id',type:sql.Int,value:userId}]);
            await tx.query(`DELETE FROM dbo.PropertyReports WHERE ReporterId=@id OR FlatId IN (SELECT Id FROM dbo.Flats WHERE OwnerId=@id)`, [{name:'id',type:sql.Int,value:userId}]);
            await tx.query(`DELETE FROM dbo.Notifications WHERE UserId=@id`, [{name:'id',type:sql.Int,value:userId}]);
            await tx.query(`DELETE FROM dbo.PasswordResets WHERE UserId=@id`, [{name:'id',type:sql.Int,value:userId}]);
            await tx.query(`DELETE FROM dbo.Flats WHERE OwnerId=@id`, [{name:'id',type:sql.Int,value:userId}]);
            await tx.query(`DELETE FROM dbo.Users WHERE Id=@id`, [{name:'id',type:sql.Int,value:userId}]);
        });
        for (const row of media) {
            if (row.Url && String(row.Url).startsWith('/uploads/')) {
                const filePath = path.join(__dirname, '..', '..', String(row.Url).replace(/^\//,''));
                try { if (fs.existsSync(filePath)) fs.unlinkSync(filePath); } catch (_) {}
            }
        }
        const avatar = owned[0]?.AvatarUrl;
        if (avatar && String(avatar).startsWith('/uploads/')) { const filePath=path.join(__dirname,'..','..',String(avatar).replace(/^\//,'')); try{if(fs.existsSync(filePath))fs.unlinkSync(filePath);}catch(_){} }
        req.session.destroy(() => res.clearCookie('connect.sid'));
        return res.json({success:true,message:'Your FlatMate account has been permanently deleted.'});
    } catch (err) {
        console.error('Delete account error:', err);
        return res.status(500).json({success:false,error:'Could not delete account. No changes were kept.'});
    }
}

module.exports = {
    register,
    login,
    logout,
    getSession,
    forgotPassword,
    resetPassword,
    deleteAccount
};