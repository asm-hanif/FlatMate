const { executeSql, sql } = require('../db');
const {
    sendContactEmail,
    sendContactAutoReply,
    sendOwnerInquiryEmail
} = require('../services/mailService');

function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
function clean(value, max) {
    return String(value || '').trim().slice(0, max);
}

async function submitContact(req, res) {
    const name = clean(req.body.name, 100);
    const email = clean(req.body.email, 255);
    const phone = clean(req.body.phone, 20);
    const subject = clean(req.body.subject, 200);
    const message = clean(req.body.message, 5000);

    if (!name || !email || !message) return res.status(400).json({ error: 'Name, email and message are required' });
    if (!isValidEmail(email)) return res.status(400).json({ error: 'Please provide a valid email address' });

    try {
        await sendContactEmail({ name, email, phone, subject, message });
        try { await sendContactAutoReply({ name, email, subject }); } catch (e) { console.error('Contact auto-reply failed:', e.message); }
        return res.status(201).json({ success: true, message: 'Your message has been sent successfully.' });
    } catch (error) {
        console.error('Contact email failed:', error);
        return res.status(500).json({ error: 'Unable to send your message right now. Please try again later.' });
    }
}

async function emailOwner(req, res) {
    const userId = Number(req.session?.userId);
    const flatId = Number(req.params.flatId);
    const message = clean(req.body.message, 5000);
    if (!userId) return res.status(401).json({ success: false, error: 'Please log in first.' });
    if (!Number.isInteger(flatId) || flatId <= 0) return res.status(400).json({ success: false, error: 'Invalid property ID.' });
    if (!message) return res.status(400).json({ success: false, error: 'Please enter a message.' });
    if (!['User','Both'].includes(String(req.session.role))) return res.status(403).json({ success: false, error: 'Only home seekers can email a property owner.' });

    try {
        const rows = await executeSql(
            `SELECT f.Id, f.Title, f.OwnerId, f.IsActive, f.AvailabilityStatus,
                    o.Name AS OwnerName, o.Email AS OwnerEmail,
                    u.Name AS SenderName, u.Email AS SenderEmail, u.Phone AS SenderPhone
             FROM dbo.Flats f
             INNER JOIN dbo.Users o ON o.Id = f.OwnerId
             INNER JOIN dbo.Users u ON u.Id = @uid
             WHERE f.Id = @fid`,
            [
                { name: 'fid', type: sql.Int, value: flatId },
                { name: 'uid', type: sql.Int, value: userId }
            ]
        );
        if (!rows.length) return res.status(404).json({ success: false, error: 'Property not found.' });
        const flat = rows[0];
        if (Number(flat.OwnerId) === userId) return res.status(400).json({ success: false, error: 'You cannot email yourself about your own property.' });
        if (!flat.IsActive) return res.status(400).json({ success: false, error: 'This property is inactive.' });
        if (String(flat.AvailabilityStatus || 'Available') !== 'Available') {
            return res.status(400).json({ success: false, error: `This property has been marked ${String(flat.AvailabilityStatus).toLowerCase()}. Email is disabled.` });
        }
        if (!isValidEmail(flat.OwnerEmail)) return res.status(503).json({ success: false, error: 'The owner has no valid email address.' });

        await sendOwnerInquiryEmail({
            ownerEmail: flat.OwnerEmail,
            ownerName: flat.OwnerName,
            senderName: flat.SenderName,
            senderEmail: flat.SenderEmail,
            senderPhone: flat.SenderPhone,
            flatTitle: flat.Title,
            flatId,
            message
        });

        return res.status(201).json({ success: true, message: 'Your email has been sent to the owner.' });
    } catch (error) {
        console.error('Owner email failed:', error);
        return res.status(500).json({ success: false, error: 'Unable to send email right now. Please try again later.' });
    }
}

module.exports = { submitContact, emailOwner };
