/**
 * Standalone SMTP diagnostic — tests ONLY the mail connection, completely
 * isolated from the rest of the app, so a failure here is unambiguous:
 * either the config is wrong, or Google is rejecting these credentials.
 *
 * Usage:  npm run test:mail
 */

require('dotenv').config();
const nodemailer = require('nodemailer');

function mask(value) {
    if (!value) return '(not set)';
    if (value.length <= 4) return '*'.repeat(value.length);
    return value.slice(0, 2) + '*'.repeat(value.length - 4) + value.slice(-2);
}

async function run() {
    console.log('FlatMate — SMTP diagnostic\n');

    const host = process.env.SMTP_HOST;
    const port = Number(process.env.SMTP_PORT || 465);
    const secure = String(process.env.SMTP_SECURE).toLowerCase() === 'true';
    const user = process.env.SMTP_USER;
    const rawPass = process.env.SMTP_PASS || '';
    const pass = rawPass.replace(/\s/g, '');

    console.log('Configuration read from .env:');
    console.log('  SMTP_HOST  :', host || '(not set)');
    console.log('  SMTP_PORT  :', port);
    console.log('  SMTP_SECURE:', secure);
    console.log('  SMTP_USER  :', user || '(not set)');
    console.log('  SMTP_PASS  :', mask(pass), `(${pass.length} characters${rawPass !== pass ? ', had whitespace stripped' : ''})`);
    console.log('');

    if (!host || !user || !rawPass) {
        console.error('✗ Missing configuration. SMTP_HOST, SMTP_USER and SMTP_PASS must all be set in .env.');
        process.exit(1);
    }

    const isGmail = /gmail\.com$/i.test(host) || /gmail\.com$/i.test(user);

    if (isGmail && pass.length !== 16) {
        console.warn(
            `⚠ This password is ${pass.length} characters. Gmail App Passwords are ALWAYS exactly 16.\n` +
            '  This alone will cause authentication to fail — generate a fresh one at\n' +
            '  https://myaccount.google.com/apppasswords and update SMTP_PASS.\n'
        );
    }

    console.log('Connecting to', `${host}:${port}`, '...\n');

    const transporter = nodemailer.createTransport({
        host, port, secure,
        auth: { user, pass }
    });

    try {
        await transporter.verify();
        console.log('✓ SUCCESS — SMTP login accepted. Mail sending should work.');
        process.exit(0);
    } catch (error) {
        console.error('✗ FAILED —', error.message);
        console.log('');

        if (error.code === 'EAUTH' || /invalid login|username and password/i.test(error.message || '')) {
            if (isGmail) {
                console.log('This is Gmail rejecting the login itself (not a bug in the app). In order,');
                console.log('the most common causes when a *correctly-formatted* 16-character App');
                console.log('Password still fails:\n');
                console.log('  1. 2-Step Verification is OFF for this Google account.');
                console.log('     App Passwords ONLY work when 2FA is enabled — if it\'s off, EVERY');
                console.log('     app password will fail with exactly this error, no matter how many');
                console.log('     new ones you generate. Check: https://myaccount.google.com/security\n');
                console.log('  2. The app password was revoked or was never actually saved.');
                console.log('     Check the list here (it should show this password\'s label):');
                console.log('     https://myaccount.google.com/apppasswords\n');
                console.log('  3. SMTP_USER does not match the Google account the app password');
                console.log('     belongs to (App Passwords are tied to one specific account).\n');
                console.log('  4. If deployed (Render, etc.), the SAME value must ALSO be set in that');
                console.log('     platform\'s environment variables — .env is never uploaded there.\n');
            }
        } else if (error.code === 'ETIMEDOUT' || error.code === 'ECONNREFUSED') {
            console.log('Could not reach the SMTP server at all — check SMTP_HOST/SMTP_PORT,');
            console.log('your internet connection, and whether a firewall is blocking outbound');
            console.log('connections on port', port + '.');
        }

        process.exit(1);
    }
}

run();
