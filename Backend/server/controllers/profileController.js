const { executeSql, TYPES } = require('../db');
const bcrypt = require('bcrypt');
const fs = require('fs');
const path = require('path');
const { validatePassword } = require('../validators');

function clean(value, max) {
    if (value === undefined || value === null) return '';
    return String(value).trim().slice(0, max);
}

function deleteLocalAvatar(avatarUrl) {
    if (!avatarUrl || !avatarUrl.startsWith('/uploads/profiles/')) return;
    const filePath = path.join(__dirname, '..', '..', avatarUrl.replace(/^\//, ''));
    try {
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    } catch (error) {
        console.warn('Could not remove old avatar:', error.message);
    }
}

async function getProfile(req, res) {
    const userId = Number(req.session.userId);
    try {
        const users = await executeSql(`
            SELECT Id, Name, Email, Phone, Role, AvatarUrl, Address, Bio, CreatedAt
            FROM dbo.Users WHERE Id = @id
        `, [{ name: 'id', type: TYPES.Int, value: userId }]);
        if (!users.length) return res.status(404).json({ success: false, error: 'User not found.' });
        return res.json(users[0]);
    } catch (err) {
        console.error('Get profile error:', err);
        return res.status(500).json({ success: false, error: 'Failed to fetch profile.' });
    }
}

async function updateProfile(req, res) {
    const userId = Number(req.session.userId);
    const name = clean(req.body.name, 100);
    const phone = clean(req.body.phone, 20);
    const address = clean(req.body.address, 500);
    const bio = clean(req.body.bio, 1000);
    const password = req.body.password ? String(req.body.password) : '';
    const role = String(req.body.role || '').trim();

    if (!name) return res.status(400).json({ success: false, error: 'Name is required.' });

    try {
        const currentRows = await executeSql(
            `SELECT Id, Name, Email, Phone, Role, AvatarUrl, Address, Bio, CreatedAt FROM dbo.Users WHERE Id = @id`,
            [{ name: 'id', type: TYPES.Int, value: userId }]
        );
        if (!currentRows.length) return res.status(404).json({ success: false, error: 'User not found.' });

        const current = currentRows[0];
        const fields = [
            'Name = @name',
            'Phone = @phone',
            'Address = @address',
            'Bio = @bio'
        ];
        const params = [
            { name: 'name', type: TYPES.NVarChar(100), value: name },
            { name: 'phone', type: TYPES.NVarChar(20), value: phone || null },
            { name: 'address', type: TYPES.NVarChar(500), value: address || null },
            { name: 'bio', type: TYPES.NVarChar(1000), value: bio || null }
        ];

        if (role) {
            if (!['User','Owner','Both'].includes(role)) return res.status(400).json({success:false,error:'Invalid account type.'});
            fields.push('Role = @role');
            params.push({name:'role',type:TYPES.NVarChar(20),value:role});
        }

        if (req.file) {
            const newAvatar = `/uploads/profiles/${req.file.filename}`;
            fields.push('AvatarUrl = @avatar');
            params.push({ name: 'avatar', type: TYPES.NVarChar(500), value: newAvatar });
            if (current.AvatarUrl !== newAvatar) deleteLocalAvatar(current.AvatarUrl);
        } else if (req.body.removeAvatar === 'true') {
            fields.push('AvatarUrl = NULL');
            deleteLocalAvatar(current.AvatarUrl);
        }

        if (password) {
            const passwordError = validatePassword(password);
            if (passwordError) return res.status(400).json({ success: false, error: passwordError });
            fields.push('PasswordHash = @hash');
            params.push({ name: 'hash', type: TYPES.NVarChar(255), value: await bcrypt.hash(password, 10) });
        }

        params.push({ name: 'id', type: TYPES.Int, value: userId });
        await executeSql(`UPDATE dbo.Users SET ${fields.join(', ')} WHERE Id = @id`, params);

        const updatedRows = await executeSql(`
            SELECT Id, Name, Email, Phone, Role, AvatarUrl, Address, Bio, CreatedAt
            FROM dbo.Users WHERE Id = @id
        `, [{ name: 'id', type: TYPES.Int, value: userId }]);
        const updated = updatedRows[0];

        // Keep the current session in sync with profile changes.
        req.session.user = {
            ...(req.session.user || {}),
            id: updated.Id,
            Id: updated.Id,
            name: updated.Name,
            Name: updated.Name,
            email: updated.Email,
            Email: updated.Email,
            phone: updated.Phone || null,
            Phone: updated.Phone || null,
            role: updated.Role,
            Role: updated.Role,
            avatarUrl: updated.AvatarUrl || null,
            AvatarUrl: updated.AvatarUrl || null,
            address: updated.Address || null,
            Address: updated.Address || null,
            bio: updated.Bio || null,
            Bio: updated.Bio || null,
            createdAt: updated.CreatedAt || null,
            CreatedAt: updated.CreatedAt || null
        };
        req.session.userName = updated.Name;
        req.session.role = updated.Role;

        return res.json({ success: true, message: 'Profile updated successfully.', user: updated });
    } catch (err) {
        console.error('Update profile error:', err);
        return res.status(500).json({ success: false, error: 'Update failed.', details: err.message });
    }
}

module.exports = { getProfile, updateProfile };
