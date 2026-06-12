const express                                    = require('express');
const router                                     = express.Router();
const { getMessages }                            = require('../controllers/message.controller');
const { addReaction,
        removeReaction,
        getReactions }                           = require('../controllers/reaction.controller');
const { verifyJWT }                              = require('../middlewares/auth.middleware');
const { validateRequest }                        = require('../middlewares/validate.middleware');
const { reactionValidator }                      = require('../middlewares/validators/reaction.validator');

// GET /api/rooms/:roomId/messages
router.get('/:roomId/messages', verifyJWT, getMessages);

// POST   /api/messages/:messageId/react
// DELETE /api/messages/:messageId/react
// GET    /api/messages/:messageId/reactions
router.post(  '/messages/:messageId/react',
    verifyJWT,
    reactionValidator,
    validateRequest,
    addReaction
);

router.delete('/messages/:messageId/react',
    verifyJWT,
    reactionValidator,
    validateRequest,
    removeReaction
);

router.get('/messages/:messageId/reactions',
    verifyJWT,
    validateRequest,
    getReactions
);

module.exports = router;