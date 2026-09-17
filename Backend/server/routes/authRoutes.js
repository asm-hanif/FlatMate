const express = require('express');
const { isAuthenticated } = require('../middleware/auth');
const router = express.Router();
const { register, login, logout, getSession, forgotPassword, resetPassword, deleteAccount } = require('../controllers/authController');

router.post('/register', register);
router.post('/login', login);
router.post('/logout', logout);
router.get('/session', getSession);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);
router.delete('/account', isAuthenticated, deleteAccount);

module.exports = router;