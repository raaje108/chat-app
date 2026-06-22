const rateLimit = require('express-rate-limit');

// ── LOGIN RATE LIMITER ──
// Most strict — protects against brute force
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    // windowMs = the time window in milliseconds
    // 15 * 60 * 1000 = 15 minutes
    // Each IP gets a fresh counter every 15 minutes

    max: 5,
    // max = maximum requests per IP per windowMs
    // After 5 attempts in 15 minutes → blocked

    message: {
        status:  'fail',
        message: 'Too many login attempts. Please try again after 15 minutes.'
    },
    // message = what to send when limit is exceeded
    // status 429 is sent automatically by express-rate-limit

    standardHeaders: true,
    // standardHeaders = include rate limit info in response headers
    // RateLimit-Limit: 5
    // RateLimit-Remaining: 3
    // RateLimit-Reset: 1234567890
    // Frontend can read these to show "3 attempts remaining"

    legacyHeaders: false,
    // legacyHeaders = don't include old X-RateLimit-* headers
    // standardHeaders is the modern approach

    skipSuccessfulRequests: true,
    // skipSuccessfulRequests = don't count successful logins
    // Only failed attempts (non-2xx responses) count toward the limit
    // A real user who logs in successfully doesn't get penalized
});

// ── GENERAL API RATE LIMITER ──
// More relaxed — prevents API abuse in general
// Applied to all routes
const apiLimiter = rateLimit({
    windowMs: 60 * 1000,
    // 1 minute window

    max: 100,
    // 100 requests per minute per IP
    // Plenty for a real user
    // But stops scripts hammering your API

    message: {
        status:  'fail',
        message: 'Too many requests. Please slow down.'
    },

    standardHeaders: true,
    legacyHeaders:   false,
});

// ── REGISTER RATE LIMITER ──
// Prevent spam account creation
const registerLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    // 1 hour window

    max: 5,
    // Only 5 accounts can be created per IP per hour
    // Stops bots creating thousands of fake accounts

    message: {
        status:  'fail',
        message: 'Too many accounts created. Please try again after an hour.'
    },

    standardHeaders: true,
    legacyHeaders:   false,
});

module.exports = { loginLimiter, apiLimiter, registerLimiter };