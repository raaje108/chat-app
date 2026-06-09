const { validationResult } = require('express-validator');

// This middleware runs AFTER the validation chains
// and BEFORE the controller
// It checks if any validation failed
// If yes — sends 400 with all errors
// If no  — calls next() and controller runs

const validateRequest = (req, res, next) => {
    // validationResult() collects all validation errors
    // from the validation chains that ran before this middleware
    const errors = validationResult(req);

    // .isEmpty() returns true if no errors
    if (!errors.isEmpty()) {
        // .array() converts errors to a clean array
        // Each error has: field, message, value
        return res.status(400).json({
            message: 'Validation failed',
            errors:  errors.array().map(err => ({
                field:   err.path,    // which field failed
                message: err.msg,     // what the rule says
                value:   err.value    // what the user sent
            }))
        });
    }

    // All validations passed — proceed to controller
    next();
};

module.exports = { validateRequest };