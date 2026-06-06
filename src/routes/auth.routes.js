const express                             = require('express');
const router                              = express.Router();
const { registerUser, loginUser, getMe }  = require('../controllers/auth.controller');
const { verifyJWT }                       = require('../middlewares/auth.middleware');

// POST /api/auth/register → create a new account
router.post('/register', registerUser);

// POST /api/auth/login → login and get token
router.post('/login', loginUser);

// GET /api/auth/me → get my profile (protected)
// verifyJWT runs first → if token valid → getMe runs
router.get('/me', verifyJWT, getMe);

module.exports = router;