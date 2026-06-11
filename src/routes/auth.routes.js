const express                            = require('express');
const router                             = express.Router();
const { registerUser, loginUser, getMe } = require('../controllers/auth.controller');
const { verifyJWT }                      = require('../middlewares/auth.middleware');
const { validateRequest }                = require('../middlewares/validate.middleware');
const { registerValidator,
        loginValidator }                 = require('../middlewares/validators/auth.validator');
const { loginLimiter,
        registerLimiter }               = require('../middlewares/rateLimiter.middleware');

// POST /api/auth/register
// registerLimiter runs first — if IP has registered 5 times in 1 hour → 429
// then validation → then controller
router.post('/register',
    registerLimiter,     // ← ADD
    registerValidator,
    validateRequest,
    registerUser
);

// POST /api/auth/login
// loginLimiter runs first — 5 attempts per 15 minutes per IP
router.post('/login',
    loginLimiter,        // ← ADD
    loginValidator,
    validateRequest,
    loginUser
);

router.get('/me', verifyJWT, getMe);

module.exports = router;