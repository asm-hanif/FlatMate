const express = require('express');
const router = express.Router();
const { isAuthenticated } = require('../middleware/auth');
const { submitContact, emailOwner } = require('../controllers/contactController');

router.post('/', submitContact);
router.post('/owner/:flatId', isAuthenticated, emailOwner);

module.exports = router;
