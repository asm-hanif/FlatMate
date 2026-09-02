const nodemailer = require('nodemailer');

const smtpHost = process.env.SMTP_HOST;
const smtpPort = Number(process.env.SMTP_PORT || 465);
const smtpSecure =
    String(process.env.SMTP_SECURE).toLowerCase() === 'true';

const smtpUser = process.env.SMTP_USER;
const smtpPass = process.env.SMTP_PASS;

const mailFrom =
    process.env.MAIL_FROM ||
    `FlatMate <${smtpUser || 'no-reply@flatmate.local'}>`;

const mailTo =
    process.env.MAIL_TO ||
    smtpUser;

let transporter = null;
warnIfPasswordLooksInvalid();

function isMailConfigured() {
    return Boolean(
        smtpHost &&
        smtpUser &&
        smtpPass
    );
}

function warnIfPasswordLooksInvalid() {
    if (!smtpHost || !smtpPass) return;

    const isGmail = /gmail\.com$/i.test(smtpHost) || /gmail\.com$/i.test(smtpUser || '');
    const cleanedLength = smtpPass.replace(/\s/g, '').length;

    // Gmail App Passwords are always exactly 16 characters (letters only).
    // A shorter/longer value almost always means it was copied incorrectly,
    // and Gmail will reject it with an authentication error at send time.
    if (isGmail && cleanedLength !== 16) {
        console.warn(
            `⚠ SMTP_PASS looks incorrect for Gmail (found ${cleanedLength} characters, expected 16). ` +
            'Generate a fresh 16-character App Password at https://myaccount.google.com/apppasswords ' +
            'and paste it into .env exactly (spaces are stripped automatically).'
        );
    }
}

function getTransporter() {
    if (!isMailConfigured()) {
        throw new Error(
            'SMTP is not configured. Check SMTP_HOST, SMTP_USER, SMTP_PASS and MAIL_TO in .env'
        );
    }

    if (!transporter) {
        transporter = nodemailer.createTransport({
            host: smtpHost,
            port: smtpPort,
            secure: smtpSecure,
            auth: {
                user: smtpUser,
                pass: smtpPass.replace(/\s/g, '')
            }
        });
    }

    return transporter;
}

function escapeHtml(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

async function sendMail({
    to,
    subject,
    text,
    html,
    replyTo
}) {
    const mailer = getTransporter();

    return mailer.sendMail({
        from: mailFrom,
        to,
        subject,
        text,
        html,
        replyTo
    });
}

async function verifyMailConnection() {
    if (!isMailConfigured()) {
        console.warn(
            '⚠ Email service is not configured. Email features will be disabled.'
        );
        return false;
    }

    try {
        const mailer = getTransporter();
        await mailer.verify();

        console.log('✓ SMTP email connection verified');
        console.log(`✓ SMTP server: ${smtpHost}:${smtpPort}`);

        return true;
    } catch (error) {
        console.error('✗ SMTP connection failed');
        console.error(error.message);

        if (error.code === 'EAUTH' || /invalid login|username and password/i.test(error.message || '')) {
            warnIfPasswordLooksInvalid();

            const isGmail = /gmail\.com$/i.test(smtpHost) || /gmail\.com$/i.test(smtpUser || '');
            if (isGmail) {
                console.warn(
                    '⚠ Gmail rejected this login. If SMTP_PASS is a correctly-formatted 16-character ' +
                    'App Password and this still happens, the #1 cause is 2-Step Verification being OFF ' +
                    'for this Google account — App Passwords only work when 2FA is enabled ' +
                    '(https://myaccount.google.com/security). Run "npm run test:mail" for a full diagnosis.'
                );
            }
        }

        return false;
    }
}

async function sendContactEmail({
    name,
    email,
    phone,
    subject,
    message
}) {
    if (!mailTo) {
        throw new Error('MAIL_TO is not configured for contact messages.');
    }

    const safeName = escapeHtml(name);
    const safeEmail = escapeHtml(email);
    const safePhone = escapeHtml(phone || 'Not provided');
    const safeSubject = escapeHtml(subject || 'General Inquiry');
    const safeMessage = escapeHtml(message);

    return sendMail({
        to: mailTo,
        replyTo: email,
        subject: `[FlatMate Contact] ${subject || 'General Inquiry'}`,

        text: `
FlatMate Contact Message

Name: ${name}
Email: ${email}
Phone: ${phone || 'Not provided'}
Subject: ${subject || 'General Inquiry'}

Message:
${message}
        `.trim(),

        html: `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>FlatMate Contact Message</title>
</head>

<body style="
    margin:0;
    padding:30px;
    background:#f5f4ef;
    font-family:Arial,sans-serif;
    color:#292a26;
">

    <div style="
        max-width:650px;
        margin:auto;
        background:#ffffff;
        border:1px solid #deddd7;
        border-radius:12px;
        overflow:hidden;
    ">

        <div style="
            padding:28px;
            background:#292a26;
            color:#ffffff;
        ">
            <div style="
                font-size:24px;
                font-weight:bold;
                letter-spacing:2px;
            ">
                FLATMATE
            </div>

            <div style="
                margin-top:6px;
                font-size:11px;
                letter-spacing:2px;
                opacity:.75;
            ">
                PROPERTY &amp; LIVING
            </div>
        </div>

        <div style="padding:30px;">

            <h2 style="
                margin-top:0;
                font-family:Georgia,serif;
                font-weight:500;
            ">
                New Contact Message
            </h2>

            <table style="
                width:100%;
                border-collapse:collapse;
                margin-bottom:25px;
            ">

                <tr>
                    <td style="padding:10px 0;font-weight:bold;width:120px;">
                        Name
                    </td>
                    <td style="padding:10px 0;">
                        ${safeName}
                    </td>
                </tr>

                <tr>
                    <td style="padding:10px 0;font-weight:bold;">
                        Email
                    </td>
                    <td style="padding:10px 0;">
                        ${safeEmail}
                    </td>
                </tr>

                <tr>
                    <td style="padding:10px 0;font-weight:bold;">
                        Phone
                    </td>
                    <td style="padding:10px 0;">
                        ${safePhone}
                    </td>
                </tr>

                <tr>
                    <td style="padding:10px 0;font-weight:bold;">
                        Subject
                    </td>
                    <td style="padding:10px 0;">
                        ${safeSubject}
                    </td>
                </tr>

            </table>

            <div style="
                padding:20px;
                background:#f5f4ef;
                border-radius:8px;
                line-height:1.7;
                white-space:pre-wrap;
            ">
                ${safeMessage}
            </div>

        </div>

        <div style="
            padding:18px 30px;
            border-top:1px solid #e5e4df;
            color:#77776f;
            font-size:12px;
        ">
            This message was submitted through the FlatMate website.
        </div>

    </div>

</body>
</html>
        `
    });
}

async function sendContactAutoReply({
    name,
    email,
    subject
}) {
    const safeName = escapeHtml(name);

    return sendMail({
        to: email,
        subject: 'We received your message — FlatMate',

        text: `
Hello ${name},

Thank you for contacting FlatMate.

We have received your message regarding:
${subject || 'General Inquiry'}

Our team will review your message and get back to you if necessary.

Regards,
FlatMate
Property & Living
        `.trim(),

        html: `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
</head>

<body style="
    margin:0;
    padding:30px;
    background:#f5f4ef;
    font-family:Arial,sans-serif;
    color:#292a26;
">

    <div style="
        max-width:600px;
        margin:auto;
        background:#ffffff;
        border:1px solid #deddd7;
        border-radius:12px;
        padding:35px;
    ">

        <div style="
            font-size:24px;
            font-weight:bold;
            letter-spacing:2px;
        ">
            FLATMATE
        </div>

        <div style="
            margin-top:5px;
            color:#77776f;
            font-size:11px;
            letter-spacing:2px;
        ">
            PROPERTY &amp; LIVING
        </div>

        <hr style="
            margin:25px 0;
            border:none;
            border-top:1px solid #e5e4df;
        ">

        <h2 style="
            font-family:Georgia,serif;
            font-weight:500;
        ">
            Thank you, ${safeName}
        </h2>

        <p style="line-height:1.7;">
            We have successfully received your message.
        </p>

        <p style="line-height:1.7;">
            Our team will review your inquiry and respond as soon as possible.
        </p>

        <p style="
            margin-top:30px;
            color:#77776f;
            font-size:13px;
        ">
            Regards,<br>
            <strong>FlatMate</strong><br>
            Property &amp; Living
        </p>

    </div>

</body>
</html>
        `
    });
}


async function sendOwnerInquiryEmail({
    ownerEmail,
    ownerName,
    senderName,
    senderEmail,
    senderPhone,
    flatTitle,
    flatId,
    message
}) {
    const safeOwnerName = escapeHtml(ownerName || 'Property Owner');
    const safeSenderName = escapeHtml(senderName);
    const safeSenderEmail = escapeHtml(senderEmail);
    const safeSenderPhone = escapeHtml(senderPhone || 'Not provided');
    const safeFlatTitle = escapeHtml(flatTitle);
    const safeMessage = escapeHtml(message);
    const propertyUrl = `${process.env.APP_BASE_URL || `http://localhost:${process.env.PORT || 3000}`}/flat.html?id=${encodeURIComponent(flatId)}`;

    return sendMail({
        to: ownerEmail,
        replyTo: senderEmail,
        subject: `[FlatMate] New inquiry about ${flatTitle}`,
        text: `
Hello ${ownerName || 'Property Owner'},

${senderName} (${senderEmail}) sent you an inquiry about your FlatMate property: ${flatTitle}.

Phone: ${senderPhone || 'Not provided'}
Property: ${propertyUrl}

Message:
${message}
        `.trim(),
        html: `
<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;background:#f5f4ef;padding:30px;color:#292a26;">
<div style="max-width:650px;margin:auto;background:#fff;border:1px solid #ddd;border-radius:12px;overflow:hidden;">
<div style="background:#292a26;color:#fff;padding:24px;font-size:24px;font-weight:bold;letter-spacing:2px;">FLATMATE</div>
<div style="padding:30px;">
<h2 style="margin-top:0;">New Property Inquiry</h2>
<p>Hello ${safeOwnerName},</p>
<p><strong>${safeSenderName}</strong> would like to contact you about <strong>${safeFlatTitle}</strong>.</p>
<table style="width:100%;border-collapse:collapse;"><tr><td style="padding:8px 0;font-weight:bold;">Email</td><td>${safeSenderEmail}</td></tr><tr><td style="padding:8px 0;font-weight:bold;">Phone</td><td>${safeSenderPhone}</td></tr></table>
<div style="margin:20px 0;padding:18px;background:#f5f4ef;border-radius:8px;white-space:pre-wrap;line-height:1.7;">${safeMessage}</div>
<a href="${escapeHtml(propertyUrl)}" style="display:inline-block;padding:12px 18px;background:#292a26;color:#fff;text-decoration:none;border-radius:6px;">View Property</a>
<p style="font-size:12px;color:#777;margin-top:25px;">Reply directly to this email to contact the sender.</p>
</div></div></body></html>`
    });
}

async function sendPasswordResetEmail({
    name,
    email,
    code
}) {
    const safeName = escapeHtml(name || 'there');
    const safeCode = escapeHtml(code);

    return sendMail({
        to: email,
        subject: 'Your FlatMate password reset code',

        text: `
Hi ${name || 'there'},

We received a request to reset your FlatMate password. Use the code below
to continue — it expires in 10 minutes.

Verification code: ${code}

If you didn't request this, you can safely ignore this email — your
password will not be changed.
        `.trim(),

        html: `
<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;background:#f5f4ef;padding:30px;color:#292a26;">
<div style="max-width:520px;margin:auto;background:#fff;border:1px solid #ddd;border-radius:12px;overflow:hidden;">
<div style="background:#292a26;color:#fff;padding:24px;font-size:24px;font-weight:bold;letter-spacing:2px;">FLATMATE</div>
<div style="padding:30px;">
<h2 style="margin-top:0;">Reset your password</h2>
<p>Hi ${safeName},</p>
<p>We received a request to reset your FlatMate password. Enter the code below to continue — it expires in <strong>10 minutes</strong>.</p>
<div style="margin:24px 0;padding:20px;background:#f5f4ef;border-radius:8px;text-align:center;">
<span style="font-size:34px;font-weight:bold;letter-spacing:10px;color:#292a26;">${safeCode}</span>
</div>
<p style="font-size:13px;color:#777;">If you didn't request this, you can safely ignore this email — your password will not be changed.</p>
</div></div></body></html>`
    });
}

module.exports = {
    sendMail,
    sendContactEmail,
    sendContactAutoReply,
    sendOwnerInquiryEmail,
    sendPasswordResetEmail,
    verifyMailConnection,
    isMailConfigured
};