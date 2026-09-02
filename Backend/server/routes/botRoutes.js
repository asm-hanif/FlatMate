const express = require('express');
const router = express.Router();

const { isAuthenticated, isOwner } = require('../middleware/auth');
const { getMeta, priceSuggest, findFlats } = require('../controllers/botController');

// Public reference data used to build the chat widget's quick-reply chips.
router.get('/meta', getMeta);

// Owner-only: "what should I price my property at?"
router.post('/price-suggest', isAuthenticated, isOwner, priceSuggest);

// Both Users and Owners: "find me flats matching my criteria."
router.post('/suggest-flats', isAuthenticated, findFlats);

module.exports = router;
