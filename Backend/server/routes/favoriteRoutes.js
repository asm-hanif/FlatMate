const express = require('express');
const router = express.Router();
const { isAuthenticated, isUser } = require('../middleware/auth');
const { listFavorites, addFavorite, removeFavorite, favoriteStatus } = require('../controllers/favoriteController');

router.use(isAuthenticated, isUser);
router.get('/', listFavorites);
router.get('/:flatId/status', favoriteStatus);
router.post('/:flatId', addFavorite);
router.delete('/:flatId', removeFavorite);

module.exports = router;
