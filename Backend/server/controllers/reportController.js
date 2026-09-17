const { executeSql, sql } = require('../db');
const { sendPropertyReportEmail } = require('../services/mailService');

const reasons = new Set([
    'Fake property',
    'Scam or suspicious behavior',
    'Wrong information',
    'Duplicate listing',
    'Already rented/sold',
    'Inappropriate content',
    'Other'
]);

async function reportFlat(req, res) {
    const flatId = Number(req.params.id);
    const userId = Number(req.session.userId);
    const reason = String(req.body.reason || '').trim();
    const details = String(req.body.details || '').trim().slice(0, 2000);

    if (!Number.isInteger(flatId) || !reasons.has(reason)) {
        return res.status(400).json({
            success: false,
            error: 'Choose a valid report reason.'
        });
    }

    try {
        const rows = await executeSql(
            `SELECT
                f.Id,
                f.Title,
                f.OwnerId,
                f.IsActive,
                f.AvailabilityStatus,
                o.Name AS OwnerName,
                o.Email AS OwnerEmail,
                r.Name AS ReporterName,
                r.Email AS ReporterEmail,
                r.Phone AS ReporterPhone
             FROM dbo.Flats f
             INNER JOIN dbo.Users o ON o.Id = f.OwnerId
             INNER JOIN dbo.Users r ON r.Id = @uid
             WHERE f.Id = @fid`,
            [
                { name: 'fid', type: sql.Int, value: flatId },
                { name: 'uid', type: sql.Int, value: userId }
            ]
        );

        if (!rows.length) {
            return res.status(404).json({
                success: false,
                error: 'Property not found.'
            });
        }

        const flat = rows[0];

        if (Number(flat.OwnerId) === userId) {
            return res.status(400).json({
                success: false,
                error: 'You cannot report your own property.'
            });
        }

        const duplicate = await executeSql(
            `SELECT Id
             FROM dbo.PropertyReports
             WHERE FlatId = @fid
               AND ReporterId = @uid
               AND Status = 'Open'
             LIMIT 1`,
            [
                { name: 'fid', type: sql.Int, value: flatId },
                { name: 'uid', type: sql.Int, value: userId }
            ]
        );

        if (duplicate.length) {
            return res.status(409).json({
                success: false,
                error: 'You already reported this property.'
            });
        }

        await executeSql(
            `INSERT INTO dbo.PropertyReports
                (FlatId, ReporterId, Reason, Details)
             VALUES
                (@fid, @uid, @reason, @details)`,
            [
                { name: 'fid', type: sql.Int, value: flatId },
                { name: 'uid', type: sql.Int, value: userId },
                { name: 'reason', type: sql.NVarChar(100), value: reason },
                { name: 'details', type: sql.NVarChar(2000), value: details || null }
            ]
        );

        // MAIL_TO is the website owner's configured report recipient.
        // The property owner receives the same report as well.
        const websiteOwnerEmail = String(process.env.MAIL_TO || process.env.SMTP_USER || '').trim();

        try {
            await sendPropertyReportEmail({
                ownerEmail: flat.OwnerEmail,
                ownerName: flat.OwnerName,
                websiteOwnerEmail,
                reporterName: flat.ReporterName,
                reporterEmail: flat.ReporterEmail,
                reporterPhone: flat.ReporterPhone,
                flatTitle: flat.Title,
                flatId,
                reason,
                details
            });
        } catch (mailError) {
            console.error('Property report email failed:', mailError);
            return res.status(201).json({
                success: true,
                message: 'Your report was submitted. Email delivery could not be completed right now.'
            });
        }

        return res.status(201).json({
            success: true,
            message: 'Your report was submitted and sent to the property owner and FlatMate team.'
        });
    } catch (error) {
        console.error('Property report error:', error);
        return res.status(500).json({
            success: false,
            error: 'Could not submit report.'
        });
    }
}

module.exports = { reportFlat };
