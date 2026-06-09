const { body } = require('express-validator');

// ── REGISTER VALIDATOR ──
// These run in order — first rule that fails stops the chain
const registerValidator = [
    body('full_name')
        .trim()
        // .trim() removes whitespace from both ends
        // "  Rahul  " becomes "Rahul"
        .notEmpty()
        .withMessage('Full name is required')
        .isLength({ min: 2, max: 100 })
        .withMessage('Full name must be between 2 and 100 characters'),

    body('username')
        .optional()
        // .optional() means skip this rule if field is not present
        // only validate if the user actually sent a username
        .trim()
        .isLength({ min: 3, max: 50 })
        .withMessage('Username must be between 3 and 50 characters')
        .matches(/^[a-zA-Z0-9_]+$/)
        .withMessage('Username can only contain letters, numbers and underscores'),
        // .matches() tests against a regex pattern
        // ^ = start, $ = end
        // [a-zA-Z0-9_] = letters, numbers, underscore only
        // No spaces, no special characters

    body('email')
        .trim()
        .notEmpty()
        .withMessage('Email is required')
        .isEmail()
        .withMessage('Must be a valid email address')
        .normalizeEmail(),
        // .normalizeEmail() lowercases and cleans the email
        // "Rahul@Example.COM" becomes "rahul@example.com"

    body('password')
        .notEmpty()
        .withMessage('Password is required')
        .isLength({ min: 6 })
        .withMessage('Password must be at least 6 characters')
        .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
        .withMessage('Password must contain at least one uppercase letter, one lowercase letter, and one number'),
        // This regex enforces password strength:
        // (?=.*[a-z]) = must have at least one lowercase letter
        // (?=.*[A-Z]) = must have at least one uppercase letter
        // (?=.*\d)    = must have at least one number
];

// ── LOGIN VALIDATOR ──
const loginValidator = [
    body('email')
        .trim()
        .notEmpty()
        .withMessage('Email is required')
        .isEmail()
        .withMessage('Must be a valid email address'),

    body('password')
        .notEmpty()
        .withMessage('Password is required')
];

module.exports = { registerValidator, loginValidator };