const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { isAuthenticated, isOwner } = require('../middleware/auth');
const {
    getFlats,
    getFlatDetail,
    createFlat,
    updateFlat,
    updateAvailabilityStatus,
    deleteFlat
} = require('../controllers/flatController');

const router = express.Router();
const imageDir = path.join(__dirname, '..', '..', 'uploads', 'images');
const videoDir = path.join(__dirname, '..', '..', 'uploads', 'videos');
fs.mkdirSync(imageDir, { recursive: true });
fs.mkdirSync(videoDir, { recursive: true });

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, file.fieldname === 'video' ? videoDir : imageDir),
    filename: (req, file, cb) => cb(null, `${uuidv4()}${path.extname(file.originalname).toLowerCase()}`)
});

const upload = multer({
    storage,
    limits: { fileSize: 50 * 1024 * 1024, files: 16 },
    fileFilter: (req, file, cb) => {
        if (file.fieldname === 'images') {
            if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(String(file.mimetype).toLowerCase())) {
                return cb(new Error('Only JPG, PNG, WEBP and GIF images are allowed.'), false);
            }
            return cb(null, true);
        }
        if (file.fieldname === 'video') {
            if (!file.mimetype.startsWith('video/')) return cb(new Error('Only video files are allowed.'), false);
            return cb(null, true);
        }
        cb(null, true);
    }
});

router.get('/', getFlats);
router.get('/:id', getFlatDetail);
router.post('/', isAuthenticated, isOwner, upload.fields([{ name: 'images', maxCount: 15 }, { name: 'video', maxCount: 1 }]), createFlat);
router.put('/:id/availability-status', isAuthenticated, isOwner, updateAvailabilityStatus);
router.put('/:id', isAuthenticated, isOwner, upload.fields([{ name: 'images', maxCount: 15 }, { name: 'video', maxCount: 1 }]), updateFlat);
router.delete('/:id', isAuthenticated, isOwner, deleteFlat);

module.exports = router;
