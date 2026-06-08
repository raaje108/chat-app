const express          = require('express');
const router           = express.Router();
const { getMessages }  = require('../controllers/message.controller');
const { verifyJWT }    = require('../middlewares/auth.middleware');

// GET /api/rooms/:roomId/messages
router.get('/:roomId/messages', verifyJWT, getMessages);

module.exports = router;