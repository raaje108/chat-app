const express                                         = require('express');
const router                                          = express.Router();
const { createRoom, getRooms,
        joinRoom, getRoomMembers, deleteRoom }         = require('../controllers/room.controller');
const { verifyJWT }                                   = require('../middlewares/auth.middleware');
const { validateRequest }                             = require('../middlewares/validate.middleware');
const { createRoomValidator,
        roomIdValidator }                             = require('../middlewares/validators/room.validator');

router.post('/',
    verifyJWT,
    createRoomValidator,
    validateRequest,
    createRoom
);

router.get('/', verifyJWT, getRooms);

router.post('/:roomId/join',
    verifyJWT,
    roomIdValidator,
    validateRequest,
    joinRoom
);

router.get('/:roomId/members',
    verifyJWT,
    roomIdValidator,
    validateRequest,
    getRoomMembers
);

router.delete('/:roomId',
    verifyJWT,
    roomIdValidator,
    validateRequest,
    deleteRoom
);

module.exports = router;