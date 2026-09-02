const express = require('express');
const router = express.Router();
const { isAuthenticated } = require('../middleware/auth');
const { createRequest, getMyRequests, getOwnerRequests, updateRequestStatus } = require('../controllers/requestController');

router.post('/', isAuthenticated, createRequest);
router.get('/mine', isAuthenticated, getMyRequests);
router.get('/owner', isAuthenticated, getOwnerRequests);
router.put('/:id', isAuthenticated, updateRequestStatus);

module.exports = router;