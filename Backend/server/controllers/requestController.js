const { executeSql, sql } = require('../db');

const ALLOWED_TYPES = new Set(['Rent', 'Buy', 'Inquiry']);
const ALLOWED_STATUSES = new Set(['Pending', 'Contacted', 'Approved', 'Rejected', 'Completed']);

function cleanString(value, max = 5000) {
    if (value === undefined || value === null) return '';
    return String(value).trim().slice(0, max);
}

async function createRequest(req, res) {
    const userId = Number(req.session.userId);
    const flatId = Number(req.body.flatId);
    const type = cleanString(req.body.type, 20);
    const message = cleanString(req.body.message, 5000);
    const moveInDate = req.body.moveInDate ? String(req.body.moveInDate) : null;

    // Only home seekers should submit property requests.
    if (!['User','Both'].includes(String(req.session.role))) {
        return res.status(403).json({ error: 'Only home seekers can submit requests. Choose Seeker or Both in your profile.' });
    }

    if (!Number.isInteger(flatId) || flatId <= 0 || !ALLOWED_TYPES.has(type)) {
        return res.status(400).json({ error: 'Valid property ID and request type are required.' });
    }

    if (message.length > 5000) {
        return res.status(400).json({ error: 'Message cannot exceed 5000 characters.' });
    }

    if (moveInDate && !/^\d{4}-\d{2}-\d{2}$/.test(moveInDate)) {
        return res.status(400).json({ error: 'Invalid move-in date.' });
    }

    try {
        const flats = await executeSql(
            `SELECT Id, OwnerId, Purpose, IsActive, AvailabilityStatus FROM dbo.Flats WHERE Id = @fid`,
            [{ name: 'fid', type: sql.Int, value: flatId }]
        );

        if (!flats.length) {
            return res.status(404).json({ error: 'Property not found.' });
        }

        const flat = flats[0];

        if (!flat.IsActive) {
            return res.status(400).json({ error: 'This property is no longer available.' });
        }
        if (String(flat.AvailabilityStatus || 'Available') !== 'Available') {
            return res.status(400).json({ error: `This property has been marked ${String(flat.AvailabilityStatus).toLowerCase()} and is not accepting requests.` });
        }

        if (Number(flat.OwnerId) === userId) {
            return res.status(400).json({ error: 'You cannot request your own property.' });
        }

        const purpose = String(flat.Purpose || '');
        if (type === 'Rent' && !purpose.includes('Rent')) {
            return res.status(400).json({ error: 'This property is not available for rent.' });
        }
        if (type === 'Buy' && !purpose.includes('Sale')) {
            return res.status(400).json({ error: 'This property is not available for sale.' });
        }

        // Prevent accidental duplicate active requests for the same property.
        const existing = await executeSql(
            `SELECT Id, Status FROM dbo.Requests
             WHERE FlatId = @fid AND UserId = @uid
             AND Status IN ('Pending', 'Contacted', 'Approved')
             ORDER BY Id DESC
             LIMIT 1`,
            [
                { name: 'fid', type: sql.Int, value: flatId },
                { name: 'uid', type: sql.Int, value: userId }
            ]
        );

        if (existing.length) {
            return res.status(409).json({
                error: `You already have an active request for this property (${existing[0].Status}).`
            });
        }

        const result = await executeSql(
            `INSERT INTO dbo.Requests
                (FlatId, UserId, Type, Message, MoveInDate, Status, CreatedAt, UpdatedAt)
             VALUES (@fid, @uid, @type, @msg, @date, 'Pending', GETDATE(), GETDATE())
             RETURNING Id, FlatId, UserId, Type, Message, MoveInDate, Status, CreatedAt, UpdatedAt`,
            [
                { name: 'fid', type: sql.Int, value: flatId },
                { name: 'uid', type: sql.Int, value: userId },
                { name: 'type', type: sql.NVarChar(20), value: type },
                { name: 'msg', type: sql.NVarChar(sql.MAX), value: message || null },
                { name: 'date', type: sql.Date, value: moveInDate ? new Date(`${moveInDate}T00:00:00`) : null }
            ]
        );

        const requester = await executeSql(`SELECT Name FROM dbo.Users WHERE Id=@id`, [{name:'id',type:sql.Int,value:userId}]);
        await executeSql(`INSERT INTO Notifications(UserId,Type,Title,Message,Link) VALUES(@uid,'request','New property request',@msg,@link)`, [
            {name:'uid',type:sql.Int,value:Number(flat.OwnerId)},
            {name:'msg',type:sql.NVarChar(1000),value:`${requester[0]?.Name || 'A user'} sent a ${type.toLowerCase()} request for your property.`},
            {name:'link',type:sql.NVarChar(500),value:'/owner-dashboard.html'}
        ]);

        return res.status(201).json({
            success: true,
            message: 'Request sent successfully.',
            request: result[0] || null
        });
    } catch (err) {
        console.error('Create request error:', err);
        return res.status(500).json({ error: 'Failed to create request.' });
    }
}

async function getMyRequests(req, res) {
    const userId = Number(req.session.userId);
    try {
        const requests = await executeSql(
            `SELECT r.*, f.Title AS FlatTitle, f.Purpose, f.Price,
                    f.City, f.AreaName, f.IsActive,
                    u.Name AS OwnerName, u.Email AS OwnerEmail, u.Phone AS OwnerPhone
             FROM dbo.Requests r
             INNER JOIN dbo.Flats f ON r.FlatId = f.Id
             INNER JOIN dbo.Users u ON f.OwnerId = u.Id
             WHERE r.UserId = @uid
             ORDER BY r.CreatedAt DESC`,
            [{ name: 'uid', type: sql.Int, value: userId }]
        );
        return res.json(requests);
    } catch (err) {
        console.error('Get my requests error:', err);
        return res.status(500).json({ error: 'Failed to fetch requests.' });
    }
}

async function getOwnerRequests(req, res) {
    if (!['Owner','Both'].includes(String(req.session.role))) {
        return res.status(403).json({ error: 'Owner access required.' });
    }

    const ownerId = Number(req.session.userId);
    try {
        const requests = await executeSql(
            `SELECT r.*, f.Title AS FlatTitle, f.Purpose, f.Price, f.City, f.AreaName,
                    u.Name AS UserName, u.Email AS UserEmail, u.Phone AS UserPhone,
                    u.AvatarUrl AS UserAvatar
             FROM dbo.Requests r
             INNER JOIN dbo.Flats f ON r.FlatId = f.Id
             INNER JOIN dbo.Users u ON r.UserId = u.Id
             WHERE f.OwnerId = @oid
             ORDER BY r.CreatedAt DESC`,
            [{ name: 'oid', type: sql.Int, value: ownerId }]
        );
        return res.json(requests);
    } catch (err) {
        console.error('Get owner requests error:', err);
        return res.status(500).json({ error: 'Failed to fetch owner requests.' });
    }
}

async function updateRequestStatus(req, res) {
    if (!['Owner','Both'].includes(String(req.session.role))) {
        return res.status(403).json({ error: 'Owner access required.' });
    }

    const requestId = Number(req.params.id);
    const status = cleanString(req.body.status, 20);

    if (!Number.isInteger(requestId) || requestId <= 0) {
        return res.status(400).json({ error: 'Invalid request ID.' });
    }

    if (!ALLOWED_STATUSES.has(status)) {
        return res.status(400).json({ error: 'Invalid request status.' });
    }

    try {
        const check = await executeSql(
            `SELECT r.Id, r.UserId, r.Status, f.AvailabilityStatus
             FROM dbo.Requests r
             INNER JOIN dbo.Flats f ON r.FlatId = f.Id
             WHERE r.Id = @rid AND f.OwnerId = @oid`,
            [
                { name: 'rid', type: sql.Int, value: requestId },
                { name: 'oid', type: sql.Int, value: Number(req.session.userId) }
            ]
        );

        if (!check.length) {
            return res.status(404).json({ error: 'Request not found or not owned by you.' });
        }

        if (status === 'Approved' && String(check[0].AvailabilityStatus || 'Available') !== 'Available') {
            return res.status(400).json({ error: 'This property is no longer available, so this request cannot be approved.' });
        }

        const result = await executeSql(
            `UPDATE dbo.Requests
             SET Status = @status, UpdatedAt = GETDATE()
             WHERE Id = @rid
             RETURNING Id, Status, UpdatedAt`,
            [
                { name: 'status', type: sql.NVarChar(20), value: status },
                { name: 'rid', type: sql.Int, value: requestId }
            ]
        );

        await executeSql(`INSERT INTO Notifications(UserId,Type,Title,Message,Link) VALUES(@uid,'request-status','Request updated',@msg,@link)`, [
            {name:'uid',type:sql.Int,value:Number(check[0].UserId || 0)},
            {name:'msg',type:sql.NVarChar(1000),value:`Your request has been ${status.toLowerCase()}.`},
            {name:'link',type:sql.NVarChar(500),value:'/profile.html'}
        ]);

        return res.json({
            success: true,
            message: 'Request status updated.',
            request: result[0] || null
        });
    } catch (err) {
        console.error('Update request status error:', err);
        return res.status(500).json({ error: 'Update failed.' });
    }
}

module.exports = { createRequest, getMyRequests, getOwnerRequests, updateRequestStatus };
