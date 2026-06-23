const { body, param } = require('express-validator');
// body  = validates req.body fields
// param = validates req.params fields (like :roomId)

// ── CREATE ROOM VALIDATOR ──
const createRoomValidator = [
    body('name')
        .optional()
        .trim()
        .isLength({ min: 1, max: 100 })
        .withMessage('Room name must be between 1 and 100 characters'),

    body('description')
        .optional()
        .trim()
        .isLength({ max: 255 })
        .withMessage('Description cannot exceed 255 characters'),

    body('room_type')
        .optional()
        .isIn(['direct', 'group', 'public'])
        .withMessage('room_type must be direct, group or public'),
        // .isIn() is cleaner than .includes()
        // same idea — only allow values from this list
];

// ── ROOM ID PARAM VALIDATOR ──
// Reusable — used by join, members, delete
const roomIdValidator = [
    param('roomId')
        .isInt({ min: 1 })
        .withMessage('Room ID must be a positive integer')
        // .isInt() checks it's a valid integer
        // { min: 1 } means no zero or negative numbers
];
const requestIdValidator = [
    param('roomId').isInt({ min: 1 }).withMessage('Room ID must be a positive integer'),
];

const joinRequestActionValidator = [
    param('roomId').isInt({ min: 1 }).withMessage('Room ID must be a positive integer'),
    param('requestId').isInt({ min: 1 }).withMessage('Request ID must be a positive integer'),
];

module.exports = { createRoomValidator, roomIdValidator, requestIdValidator, joinRequestActionValidator };