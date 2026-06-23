const express                                         = require('express');
const router                                          = express.Router();
const { verifyJWT }                                   = require('../middlewares/auth.middleware');
const { validateRequest }                             = require('../middlewares/validate.middleware');
const { createRoomValidator,
        roomIdValidator,
        joinRequestActionValidator }                  = require('../middlewares/validators/room.validator');
const {
    createRoom, getRooms, joinRoom, getRoomMembers, deleteRoom,
    requestToJoin, getJoinRequests, approveJoinRequest, rejectJoinRequest
} = require('../controllers/room.controller');

// ... existing routes ...

router.post('/:roomId/join-request',
    verifyJWT, roomIdValidator, validateRequest, requestToJoin
);

router.get('/:roomId/join-requests',
    verifyJWT, roomIdValidator, validateRequest, getJoinRequests
);

router.post('/:roomId/join-requests/:requestId/approve',
    verifyJWT, joinRequestActionValidator, validateRequest, approveJoinRequest
);

router.post('/:roomId/join-requests/:requestId/reject',
    verifyJWT, joinRequestActionValidator, validateRequest, rejectJoinRequest
);

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