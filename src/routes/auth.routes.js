const express                             = require('express');
const router                              = express.Router();
const { registerUser, loginUser, getMe }  = require('../controllers/auth.controller');
const { verifyJWT }                       = require('../middlewares/auth.middleware');
const { validateRequest }                 = require('../middlewares/validate.middleware');
const { registerValidator,
        loginValidator }                  = require('../middlewares/validators/auth.validator');

// POST /api/auth/register
// Flow: registerValidator runs → validateRequest checks results → registerUser runs
router.post('/register',
    registerValidator,   // array of validation rules
    validateRequest,     // checks if any rule failed
    registerUser         // only runs if everything passed
);

// POST /api/auth/login
router.post('/login',
    loginValidator,
    validateRequest,
    loginUser
);

// GET /api/auth/me
router.get('/me', verifyJWT, getMe);

module.exports = router;