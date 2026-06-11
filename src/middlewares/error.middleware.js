const AppError = require('../utils/AppError');

const errorHandler = (err, req, res, next) => {

    // ── set defaults ──
    // If someone threw a plain Error (not AppError)
    // default to 500 Internal Server Error
    err.statusCode = err.statusCode || 500;
    err.message    = err.message    || 'Internal server error';

    // ── log the error in terminal ──
    // Always log — even if we send a clean response to user
    console.error(`❌ [${err.statusCode}] ${err.message}`);
    if (process.env.NODE_ENV === 'development') {
        // In development — log the full stack trace
        // Helps you debug quickly
        console.error(err.stack);
    }

    // ── handle specific error types ──

    // MySQL duplicate entry (ER_DUP_ENTRY)
    // Happens when UNIQUE constraint is violated
    if (err.code === 'ER_DUP_ENTRY') {
        return res.status(409).json({
            status:  'fail',
            message: 'A record with this value already exists'
        });
    }

    // MySQL foreign key constraint failure
    // Happens when you try to insert a row referencing a non-existent id
    if (err.code === 'ER_NO_REFERENCED_ROW_2') {
        return res.status(400).json({
            status:  'fail',
            message: 'Referenced resource does not exist'
        });
    }

    // JWT expired
    if (err.name === 'TokenExpiredError') {
        return res.status(401).json({
            status:  'fail',
            message: 'Your session has expired. Please login again.'
        });
    }

    // JWT invalid
    if (err.name === 'JsonWebTokenError') {
        return res.status(401).json({
            status:  'fail',
            message: 'Invalid token. Please login again.'
        });
    }

    // ── handle our custom AppError ──
    if (err.isOperational) {
        return res.status(err.statusCode).json({
            status:  err.status,
            message: err.message
        });
    }

    // ── handle unexpected errors ──
    // These are bugs — null references, DB connection lost, etc.
    // Don't reveal internal details to the user
    // but log everything for debugging
    console.error('UNEXPECTED ERROR:', err);
    return res.status(500).json({
        status:  'error',
        message: 'Something went wrong. Please try again later.'
    });
};

module.exports = { errorHandler };