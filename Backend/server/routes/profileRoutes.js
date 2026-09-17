const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const router = express.Router();
const { isAuthenticated } = require('../middleware/auth');
const { getProfile, updateProfile } = require('../controllers/profileController');

const profileDir = path.join(__dirname, '..', '..', 'uploads', 'profiles');
fs.mkdirSync(profileDir, { recursive: true });

const storage = multer.diskStorage({
    destination: profileDir,
    filename: (req, file, cb) => cb(null, `${uuidv4()}${path.extname(file.originalname).toLowerCase()}`)
});

const upload = multer({
    storage,
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const allowed = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
        if (!allowed.has(String(file.mimetype).toLowerCase())) {
            return cb(new Error('Only JPG, PNG, WEBP and GIF profile images are allowed.'));
        }
        cb(null, true);
    }
});

router.get('/', isAuthenticated, getProfile);
router.put('/', isAuthenticated, upload.single('avatar'), updateProfile);

module.exports = router;
