const { executeSql, sql } = require('../db');
const fs = require('fs');
const path = require('path');


/* ============================================================
   FIELD DEFINITIONS (single source of truth)

   Every editable Flats column is declared once here, along with how
   to parse it from form-data. createFlat/updateFlat both read from
   this list, so adding a new field only ever means editing this one
   place (plus the matching input in Frontend/edit-flat.html).
============================================================ */

const TEXT_FIELDS = [
    'Title', 'Description', 'Purpose', 'PropertyType', 'RentPeriod',
    'AreaUnit', 'LandAreaUnit', 'Furnished', 'Address', 'AreaName', 'City',
    'District',
    'ConstructionStatus', 'TransactionType', 'Facing', 'FloorAvailableOn'
];

const INT_FIELDS = [
    'Bedrooms', 'Bathrooms', 'Balconies', 'LivingRooms', 'DiningRooms',
    'Kitchen', 'ServantRooms', 'StoreRooms', 'Floor', 'TotalFloors',
    'Parking', 'CoveredParking'
];

const DECIMAL_FIELDS = [
    'Price', 'SecurityDeposit', 'Area', 'LandArea', 'Latitude', 'Longitude'
];

// Every amenity is a simple 0/1 flag.
const AMENITY_FIELDS = [
    'Lift', 'Security', 'CCTV', 'Guard', 'Generator', 'Water', 'Gas',
    'Electricity', 'Internet', 'CableTV', 'AirConditioning', 'Heating',
    'SwimmingPool', 'Gym', 'CommunityHall', 'Rooftop', 'Garden',
    'Playground', 'PetFriendly', 'Laundry', 'MosquePrayerRoom', 'FireExit',
    'WASAConnection', 'SelfWaterSupply', 'HotWater', 'CylinderGas',
    'TelephoneLine', 'Intercom', 'WifiConnectivity', 'SecurityAlarmSystem',
    'ElectronicSecurity', 'SolarPanels', 'GuestParking', 'ServantQuarter',
    'ServantToilet', 'FireProtection', 'DepartmentalStore'
];

const ALL_EDITABLE_FIELDS = [...TEXT_FIELDS, ...INT_FIELDS, ...DECIMAL_FIELDS, ...AMENITY_FIELDS];

/**
 * Guards against the exact class of bug that once broke "Add Property"
 * entirely: a field listed in more than one category (which produces a
 * duplicate column in the generated INSERT and Postgres rejects the
 * whole statement). This runs once when the server starts, so a mistake
 * here is caught immediately and loudly instead of surfacing as a mystery
 * 500 error the next time someone tries to list a property.
 */
function assertNoDuplicateFields() {
    const seen = new Map();
    for (const field of ALL_EDITABLE_FIELDS) {
        if (seen.has(field)) {
            throw new Error(
                `flatController: field "${field}" appears in more than one of ` +
                `TEXT_FIELDS/INT_FIELDS/DECIMAL_FIELDS/AMENITY_FIELDS. This WILL break ` +
                `property creation with a "column specified more than once" database error.`
            );
        }
        seen.set(field, true);
    }

    // AvailabilityStatus is intentionally NOT in ALL_EDITABLE_FIELDS — it's
    // hardcoded on create and only ever changed via updateAvailabilityStatus
    // (which enforces its own business rules). If someone re-adds it here,
    // fail loudly rather than reintroducing the duplicate-column bug.
    if (ALL_EDITABLE_FIELDS.includes('AvailabilityStatus')) {
        throw new Error(
            'flatController: AvailabilityStatus must not be in the general editable-fields ' +
            'list — it is appended separately in createFlat() and changed only via ' +
            'updateAvailabilityStatus(). Having it in both places creates a duplicate column.'
        );
    }
}

assertNoDuplicateFields();


/* ============================================================
   Parsing helpers
============================================================ */

function nullableString(value) {
    const v = value === undefined || value === null ? '' : String(value).trim();
    return v === '' ? null : v;
}

function nullableInt(value) {
    if (value === undefined || value === null || String(value).trim() === '') return null;
    const n = Number.parseInt(value, 10);
    return Number.isFinite(n) ? n : null;
}

function nullableDecimal(value) {
    if (value === undefined || value === null || String(value).trim() === '') return null;
    const n = Number.parseFloat(value);
    return Number.isFinite(n) ? n : null;
}

function toBit(value) {
    if (value === true || value === 1 || value === '1') return 1;
    if (typeof value === 'string') {
        return ['true', 'yes', 'on'].includes(value.toLowerCase()) ? 1 : 0;
    }
    return 0;
}

function typeForField(field) {
    if (field === 'Description') return sql.NVarChar(sql.MAX);
    if (TEXT_FIELDS.includes(field)) return sql.NVarChar(500);
    if (INT_FIELDS.includes(field)) return sql.Int;
    if (field === 'Price' || field === 'SecurityDeposit') return sql.Decimal(18, 2);
    if (field === 'Area' || field === 'LandArea') return sql.Decimal(12, 2);
    if (field === 'Latitude') return sql.Decimal(10, 8);
    if (field === 'Longitude') return sql.Decimal(11, 8);
    if (AMENITY_FIELDS.includes(field)) return sql.Int;
    return sql.NVarChar(255);
}

function parseForField(field, rawValue) {
    if (TEXT_FIELDS.includes(field)) return nullableString(rawValue);
    if (INT_FIELDS.includes(field)) return nullableInt(rawValue);
    if (DECIMAL_FIELDS.includes(field)) return nullableDecimal(rawValue);
    if (AMENITY_FIELDS.includes(field)) return toBit(rawValue);
    return null;
}


// =====================================================
// Helper: Get flat with its media
// =====================================================
async function getFlatById(id) {
    const flats = await executeSql(
        'SELECT * FROM Flats WHERE Id = @id',
        [{ name: 'id', type: sql.Int, value: id }]
    );

    if (flats.length === 0) return null;

    const flat = flats[0];

    const media = await executeSql(
        'SELECT * FROM FlatMedia WHERE FlatId = @id ORDER BY MediaType, Id',
        [{ name: 'id', type: sql.Int, value: id }]
    );

    flat.media = media;

    return flat;
}


// =====================================================
// Get all active flats
// =====================================================
async function getFlats(req, res) {
    try {
        const {
            location, purpose, propertyType, minPrice, maxPrice,
            bedrooms, bathrooms, furnishing, amenities
        } = req.query;

        const conditions = ["IsActive = 1", "AvailabilityStatus NOT IN ('Hidden','Expired')"];
        const params = [];

        if (location) {
            conditions.push('(AreaName LIKE @loc OR City LIKE @loc OR Address LIKE @loc)');
            params.push({ name: 'loc', type: sql.NVarChar(500), value: `%${location}%` });
        }

        if (purpose && purpose !== 'Any') {
            conditions.push('Purpose = @purpose');
            params.push({ name: 'purpose', type: sql.NVarChar(20), value: purpose });
        }

        if (propertyType && propertyType !== 'Any') {
            conditions.push('PropertyType = @type');
            params.push({ name: 'type', type: sql.NVarChar(50), value: propertyType });
        }

        if (minPrice) {
            conditions.push('Price >= @min');
            params.push({ name: 'min', type: sql.Decimal(18, 2), value: parseFloat(minPrice) });
        }

        if (maxPrice) {
            conditions.push('Price <= @max');
            params.push({ name: 'max', type: sql.Decimal(18, 2), value: parseFloat(maxPrice) });
        }

        if (bedrooms && bedrooms !== 'Any') {
            if (bedrooms === '5+') {
                conditions.push('Bedrooms >= 5');
            } else {
                conditions.push('Bedrooms = @beds');
                params.push({ name: 'beds', type: sql.Int, value: parseInt(bedrooms, 10) });
            }
        }

        if (bathrooms && bathrooms !== 'Any') {
            if (bathrooms === '4+') {
                conditions.push('Bathrooms >= 4');
            } else {
                conditions.push('Bathrooms = @baths');
                params.push({ name: 'baths', type: sql.Int, value: parseInt(bathrooms, 10) });
            }
        }

        if (furnishing && furnishing !== 'Any') {
            conditions.push('Furnished = @furn');
            params.push({ name: 'furn', type: sql.NVarChar(20), value: furnishing });
        }

        // Amenities (comma-separated list of column names, or the
        // Parking/CoveredParking counts which just need to be > 0).
        if (amenities) {
            const amenityList = amenities.split(',').map(a => a.trim());

            amenityList.forEach(name => {
                if (name === 'Parking' || name === 'CoveredParking') {
                    conditions.push(`${name} > 0`);
                } else if (AMENITY_FIELDS.includes(name)) {
                    conditions.push(`${name} = 1`);
                }
            });
        }

        let query = `SELECT * FROM Flats WHERE ${conditions.join(' AND ')}`;

        const sort = req.query.sort || 'Newest';
        if (sort === 'Price: Low to High') query += ' ORDER BY Price ASC, CreatedAt DESC';
        else if (sort === 'Price: High to Low') query += ' ORDER BY Price DESC, CreatedAt DESC';
        else if (sort === 'Largest Area') query += ' ORDER BY Area DESC NULLS LAST, CreatedAt DESC';
        else if (sort === 'Most Viewed') query += ' ORDER BY ViewCount DESC, CreatedAt DESC';
        else query += ' ORDER BY CreatedAt DESC';

        const page = Math.max(1, Number.parseInt(req.query.page || '1', 10) || 1);
        const limit = Math.min(48, Math.max(1, Number.parseInt(req.query.limit || '12', 10) || 12));
        const offset = (page - 1) * limit;
        query += ` LIMIT ${limit} OFFSET ${offset}`;

        const flats = await executeSql(query, params);

        for (const flat of flats) {
            const media = await executeSql(
                `SELECT Url FROM FlatMedia WHERE FlatId = @id AND MediaType = 'image' ORDER BY Id LIMIT 1`,
                [{ name: 'id', type: sql.Int, value: flat.Id }]
            );
            flat.mainImage = media.length > 0 ? media[0].Url : null;
        }

        res.json(flats);

    } catch (err) {
        console.error('Get flats error:', err);
        res.status(500).json({ error: 'Failed to fetch flats' });
    }
}


// =====================================================
// Get single flat details
// =====================================================
async function getFlatDetail(req, res) {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });

    try {
        const flat = await getFlatById(id);
        if (!flat) return res.status(404).json({ error: 'Flat not found' });

        const requesterId = Number(req.session?.userId || 0);
        if (requesterId !== Number(flat.OwnerId)) {
            await executeSql(`UPDATE Flats SET ViewCount = COALESCE(ViewCount,0) + 1 WHERE Id = @id`, [{name:'id',type:sql.Int,value:id}]);
            flat.ViewCount = Number(flat.ViewCount || 0) + 1;
        }
        if (!flat.IsActive && Number(flat.OwnerId) !== requesterId) {
            return res.status(404).json({ error: 'Property is no longer available.' });
        }

        const owner = await executeSql(
            `SELECT Id, Name, Email, Phone, AvatarUrl FROM Users WHERE Id = @id`,
            [{ name: 'id', type: sql.Int, value: flat.OwnerId }]
        );

        flat.owner = owner.length > 0 ? owner[0] : null;

        res.json(flat);

    } catch (err) {
        console.error('Get flat detail error:', err);
        res.status(500).json({ error: 'Failed to fetch flat' });
    }
}


// =====================================================
// Create flat
// =====================================================
async function createFlat(req, res) {
    if (!req.session || !['Owner','Both'].includes(String(req.session.role))) {
        return res.status(403).json({ error: 'Only owners can create listings' });
    }

    const ownerId = req.session.userId;
    const data = req.body;

    if (!data.Title || !data.Purpose || !data.PropertyType || !data.Price) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    try {
        const columns = ['OwnerId', ...ALL_EDITABLE_FIELDS, 'IsActive', 'AvailabilityStatus'];
        const placeholders = ['@OwnerId', ...ALL_EDITABLE_FIELDS.map(f => `@${f}`), '1', "'Available'"];

        const params = [
            { name: 'OwnerId', type: sql.Int, value: ownerId },
            ...ALL_EDITABLE_FIELDS.map(field => ({
                name: field,
                type: typeForField(field),
                value: parseForField(field, data[field])
            }))
        ];

        const result = await executeSql(
            `INSERT INTO Flats (${columns.join(', ')}) VALUES (${placeholders.join(', ')}) RETURNING Id`,
            params
        );

        const flatId = result[0].Id;

        await saveUploadedMedia(req, flatId);

        return res.status(201).json({ message: 'Flat created successfully', id: flatId });

    } catch (err) {
        console.error('Create flat error:', err);
        return res.status(500).json({ error: 'Failed to create flat', details: err.message });
    }
}


// =====================================================
// Shared: save newly-uploaded images/video for a flat
// =====================================================
async function saveUploadedMedia(req, flatId) {
    if (!req.files) return;

    const images = req.files.images || [];
    const video = req.files.video ? req.files.video[0] : null;

    for (const img of images) {
        await executeSql(
            `INSERT INTO dbo.FlatMedia (FlatId, Url, MediaType) VALUES (@fid, @url, 'image')`,
            [
                { name: 'fid', type: sql.Int, value: flatId },
                { name: 'url', type: sql.NVarChar(500), value: `/uploads/images/${img.filename}` }
            ]
        );
    }

    if (video) {
        await executeSql(
            `INSERT INTO dbo.FlatMedia (FlatId, Url, MediaType) VALUES (@fid, @url, 'video')`,
            [
                { name: 'fid', type: sql.Int, value: flatId },
                { name: 'url', type: sql.NVarChar(500), value: `/uploads/videos/${video.filename}` }
            ]
        );
    }
}


// =====================================================
// Update flat
// =====================================================
async function updateFlat(req, res) {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });

    const userId = req.session.userId;
    const role = req.session.role;

    try {
        const existing = await executeSql(
            'SELECT OwnerId FROM Flats WHERE Id = @id',
            [{ name: 'id', type: sql.Int, value: id }]
        );

        if (existing.length === 0) return res.status(404).json({ error: 'Flat not found' });

        if (Number(existing[0].OwnerId) !== Number(userId) && !['Admin','Owner','Both'].includes(String(role))) {
            return res.status(403).json({ error: 'You are not the owner' });
        }

        const data = req.body;
        const fields = Object.keys(data).filter(key => ALL_EDITABLE_FIELDS.includes(key));

        const removeImageIds = parseRemoveImageIds(data.removeImageIds);

        if (fields.length === 0 && !req.files && removeImageIds.length === 0) {
            return res.status(400).json({ error: 'No valid fields provided' });
        }

        if (fields.length) {
            const params = fields.map(field => ({
                name: field,
                type: typeForField(field),
                value: parseForField(field, data[field])
            }));

            const assignments = fields.map(field => `${field} = @${field}`);
            params.push({ name: 'id', type: sql.Int, value: id });

            await executeSql(
                `UPDATE dbo.Flats SET ${assignments.join(', ')}, UpdatedAt = GETDATE() WHERE Id = @id`,
                params
            );
        }

        // Remove any images/video the owner unchecked in the edit form.
        if (removeImageIds.length) {
            await removeFlatMedia(id, removeImageIds);
        }

        // New media can be appended while editing.
        await saveUploadedMedia(req, id);

        res.json({ message: 'Flat updated successfully' });

    } catch (err) {
        console.error('Update flat error:', err);
        res.status(500).json({ error: 'Update failed', details: err.message });
    }
}

function parseRemoveImageIds(raw) {
    if (!raw) return [];
    try {
        const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
        if (!Array.isArray(parsed)) return [];
        return parsed
            .map(v => Number.parseInt(v, 10))
            .filter(v => Number.isInteger(v) && v > 0);
    } catch (_) {
        return [];
    }
}

/** Deletes the DB rows AND the underlying uploaded files for the given FlatMedia ids. */
async function removeFlatMedia(flatId, mediaIds) {
    const idParams = mediaIds.map((id, i) => ({ name: `mid${i}`, type: sql.Int, value: id }));
    const placeholders = idParams.map(p => `@${p.name}`).join(', ');

    const rows = await executeSql(
        `SELECT Id, Url FROM dbo.FlatMedia WHERE FlatId = @fid AND Id IN (${placeholders})`,
        [{ name: 'fid', type: sql.Int, value: flatId }, ...idParams]
    );

    if (!rows.length) return;

    await executeSql(
        `DELETE FROM dbo.FlatMedia WHERE FlatId = @fid AND Id IN (${placeholders})`,
        [{ name: 'fid', type: sql.Int, value: flatId }, ...idParams]
    );

    for (const row of rows) {
        const filePath = path.join(__dirname, '..', '..', row.Url.replace(/^\//, ''));
        fs.unlink(filePath, (err) => {
            if (err && err.code !== 'ENOENT') {
                console.warn('Could not delete removed media file:', filePath, err.message);
            }
        });
    }
}


// =====================================================
// Update availability status
// =====================================================
async function updateAvailabilityStatus(req, res) {
    const id = parseInt(req.params.id, 10);
    const status = String(req.body.status || '').trim();
    const allowed = new Set(['Available', 'Rented', 'Sold', 'Hidden', 'Expired']);

    if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({ success: false, error: 'Invalid property ID.' });
    }
    if (!allowed.has(status)) {
        return res.status(400).json({ success: false, error: 'Invalid availability status.' });
    }

    try {
        const rows = await executeSql(
            `SELECT OwnerId, Purpose FROM dbo.Flats WHERE Id = @id`,
            [{ name: 'id', type: sql.Int, value: id }]
        );
        if (!rows.length) return res.status(404).json({ success: false, error: 'Property not found.' });
        if (Number(rows[0].OwnerId) !== Number(req.session.userId)) {
            return res.status(403).json({ success: false, error: 'You do not own this property.' });
        }

        const purpose = String(rows[0].Purpose || '');
        if (status === 'Rented' && !purpose.includes('Rent')) {
            return res.status(400).json({ success: false, error: 'This property is not listed for rent.' });
        }
        if (status === 'Sold' && !purpose.includes('Sale')) {
            return res.status(400).json({ success: false, error: 'This property is not listed for sale.' });
        }

        const result = await executeSql(
            `UPDATE dbo.Flats
             SET AvailabilityStatus = @status, UpdatedAt = GETDATE()
             WHERE Id = @id
             RETURNING Id, AvailabilityStatus, UpdatedAt`,
            [
                { name: 'status', type: sql.NVarChar(20), value: status },
                { name: 'id', type: sql.Int, value: id }
            ]
        );

        if (status !== 'Available') {
            await executeSql(
                `UPDATE dbo.Requests
                 SET Status = 'Rejected', UpdatedAt = GETDATE()
                 WHERE FlatId = @id AND Status IN ('Pending', 'Contacted')`,
                [{ name: 'id', type: sql.Int, value: id }]
            );
        }

        return res.json({ success: true, message: `Property marked ${status.toLowerCase()}.`, flat: result[0] });
    } catch (err) {
        console.error('Update availability status error:', err);
        return res.status(500).json({ success: false, error: 'Could not update property status.' });
    }
}

// =====================================================
// Delete / deactivate flat
// =====================================================
async function deleteFlat(req, res) {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });

    const userId = req.session.userId;

    try {
        const existing = await executeSql(
            'SELECT OwnerId FROM Flats WHERE Id = @id',
            [{ name: 'id', type: sql.Int, value: id }]
        );

        if (existing.length === 0) return res.status(404).json({ error: 'Flat not found' });

        if (Number(existing[0].OwnerId) !== Number(userId)) {
            return res.status(403).json({ error: 'Not your property' });
        }

        await executeSql(
            'UPDATE Flats SET IsActive = 0 WHERE Id = @id',
            [{ name: 'id', type: sql.Int, value: id }]
        );

        res.json({ message: 'Flat deactivated successfully' });

    } catch (err) {
        console.error('Delete flat error:', err);
        res.status(500).json({ error: 'Deletion failed' });
    }
}


module.exports = {
    getFlats,
    getFlatDetail,
    createFlat,
    updateFlat,
    updateAvailabilityStatus,
    deleteFlat,
    // Exported for tests and for other modules (e.g. the AI bot) that need
    // to know which fields/amenities exist.
    TEXT_FIELDS,
    INT_FIELDS,
    DECIMAL_FIELDS,
    AMENITY_FIELDS,
    ALL_EDITABLE_FIELDS,
    parseForField,
    typeForField,
    toBit,
    nullableString,
    nullableInt,
    nullableDecimal
};
