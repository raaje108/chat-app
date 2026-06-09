const express          = require('express');
const router           = express.Router();
const { getMessages }  = require('../controllers/message.controller');
const { verifyJWT }    = require('../middlewares/auth.middleware');
const { validateRequest } = require('../middlewares/validate.middleware');
const { roomIdValidator } = require('../middlewares/validators/room.validator');

// GET /api/rooms/:roomId/messages
router.get('/:roomId/messages',
    verifyJWT,
    roomIdValidator,
    validateRequest,
    getMessages
);

module.exports = router;