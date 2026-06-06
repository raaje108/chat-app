const express        = require('express');
const router         = express.Router();
const { createRoom , getRooms, joinRoom } = require('../controllers/room.controller');
const { verifyJWT }  = require('../middlewares/auth.middleware');

// Every room route requires login
// verifyJWT runs before every controller in this file

// POST /api/rooms → create a room
router.post('/', verifyJWT, createRoom);
router.get('/', verifyJWT, getRooms); // ← ADD THIS
router.post('/:roomId/join',    verifyJWT, joinRoom);

// These come in Day 5, 6, 7, 8 — adding now as placeholders
// router.get('/',                verifyJWT, getRooms);
// router.post('/:roomId/join',   verifyJWT, joinRoom);
// router.get('/:roomId/members', verifyJWT, getRoomMembers);
// router.delete('/:roomId',      verifyJWT, deleteRoom);

module.exports = router;