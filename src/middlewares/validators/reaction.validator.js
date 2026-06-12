const { body, param } = require('express-validator');

const reactionValidator = [
    param('messageId')
        .isInt({ min: 1 })
        .withMessage('Message ID must be a positive integer'),

    body('emoji')
        .notEmpty()
        .withMessage('Emoji is required')
        .isLength({ max: 10 })
        .withMessage('Invalid emoji')
        // max: 10 because some emojis are multi-byte characters
        // "👍" looks like 1 char but is actually several bytes
];

module.exports = { reactionValidator };