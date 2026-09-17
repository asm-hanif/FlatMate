const { executeSql, sql } = require('../db');

async function listFavorites(req, res) {
    const userId = Number(req.session.userId);
    try {
        const rows = await executeSql(
            `SELECT f.*, fav.Id AS FavoriteId, fav.CreatedAt AS FavoritedAt,
                    (SELECT fm.Url FROM dbo.FlatMedia fm
                     WHERE fm.FlatId = f.Id AND fm.MediaType = 'image'
                     ORDER BY fm.Id LIMIT 1) AS mainImage
             FROM dbo.Favorites fav
             INNER JOIN dbo.Flats f ON f.Id = fav.FlatId
             WHERE fav.UserId = @uid
             ORDER BY fav.CreatedAt DESC`,
            [{ name: 'uid', type: sql.Int, value: userId }]
        );
        return res.json({ success: true, favorites: rows });
    } catch (error) {
        console.error('List favorites error:', error);
        return res.status(500).json({ success: false, error: 'Failed to load favorites.' });
    }
}

async function addFavorite(req, res) {
    const userId = Number(req.session.userId);
    const flatId = Number(req.params.flatId);
    if (!Number.isInteger(flatId) || flatId <= 0) {
        return res.status(400).json({ success: false, error: 'Invalid property ID.' });
    }

    try {
        const flats = await executeSql(
            `SELECT Id, IsActive FROM dbo.Flats WHERE Id = @fid`,
            [{ name: 'fid', type: sql.Int, value: flatId }]
        );
        if (!flats.length) return res.status(404).json({ success: false, error: 'Property not found.' });
        if (!flats[0].IsActive) return res.status(400).json({ success: false, error: 'This property is unavailable.' });

        await executeSql(
            `INSERT INTO dbo.Favorites (UserId, FlatId) VALUES (@uid, @fid)
             ON CONFLICT (UserId, FlatId) DO NOTHING`,
            [
                { name: 'uid', type: sql.Int, value: userId },
                { name: 'fid', type: sql.Int, value: flatId }
            ]
        );
        return res.status(201).json({ success: true, favorited: true });
    } catch (error) {
        console.error('Add favorite error:', error);
        return res.status(500).json({ success: false, error: 'Failed to add favorite.' });
    }
}

async function removeFavorite(req, res) {
    const userId = Number(req.session.userId);
    const flatId = Number(req.params.flatId);
    if (!Number.isInteger(flatId) || flatId <= 0) {
        return res.status(400).json({ success: false, error: 'Invalid property ID.' });
    }
    try {
        await executeSql(
            `DELETE FROM dbo.Favorites WHERE UserId = @uid AND FlatId = @fid`,
            [
                { name: 'uid', type: sql.Int, value: userId },
                { name: 'fid', type: sql.Int, value: flatId }
            ]
        );
        return res.json({ success: true, favorited: false });
    } catch (error) {
        console.error('Remove favorite error:', error);
        return res.status(500).json({ success: false, error: 'Failed to remove favorite.' });
    }
}

async function favoriteStatus(req, res) {
    const userId = Number(req.session.userId);
    const flatId = Number(req.params.flatId);
    if (!Number.isInteger(flatId) || flatId <= 0) {
        return res.status(400).json({ success: false, error: 'Invalid property ID.' });
    }
    try {
        const rows = await executeSql(
            `SELECT Id FROM dbo.Favorites WHERE UserId = @uid AND FlatId = @fid LIMIT 1`,
            [
                { name: 'uid', type: sql.Int, value: userId },
                { name: 'fid', type: sql.Int, value: flatId }
            ]
        );
        return res.json({ success: true, favorited: rows.length > 0 });
    } catch (error) {
        console.error('Favorite status error:', error);
        return res.status(500).json({ success: false, error: 'Failed to check favorite.' });
    }
}

module.exports = { listFavorites, addFavorite, removeFavorite, favoriteStatus };
