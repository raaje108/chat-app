const jwt = require('jsonwebtoken');
const db  = require('../db/index');
const AppError = require('../utils/AppError');

const verifyJWT = async (req, res, next) => {
    // ── WHAT IS next? ──────────────────────────────────────────
    // next is a function Express gives us automatically
    // Calling next() means "I'm done, pass the request to whatever comes after me"
    // If we DON'T call next(), the request stops here forever
    // If we call res.json() instead, we're ending the request ourselves (rejecting it)
    // ───────────────────────────────────────────────────────────

    try {

        // ── STEP 1 — read the Authorization header ──
        // The frontend sends: Authorization: Bearer eyJhbGci...
        // req.headers is an object of all headers the client sent
        const authHeader = req.headers['authorization'];
        //                              ↑ lowercase — headers are case-insensitive
        //                                but req.headers normalizes them to lowercase

        // If no Authorization header was sent at all
        if (!authHeader) {
            return next(new AppError('Access denied. No token provided.', 401));
        }

        // ── STEP 2 — extract just the token from "Bearer <token>" ──
        // authHeader looks like: "Bearer eyJhbGciOiJIUzI1NiJ9.eyJpZ..."
        // We need only the part after "Bearer "
        // .startsWith() checks if a string begins with something
        if (!authHeader.startsWith('Bearer ')) {
            return next(new AppError('Invalid token format. Use: Bearer <token>', 401));
        }

        // .split(' ') splits "Bearer eyJhbG..." into ["Bearer", "eyJhbG..."]
        // [1] gives us the second element — the actual token
        const token = authHeader.split(' ')[1];

        // ── STEP 3 — verify the token ──
        // jwt.verify() does two things at once:
        // 1. Checks the signature — was this token made with our secret?
        // 2. Checks expiry — has it expired?
        // If either fails, it THROWS an error (jumps to catch block)
        // If both pass, it returns the decoded payload
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        // decoded is now: { id: 5, email: "rahul@...", username: "rahul", iat: ..., exp: ... }
        // iat = "issued at" timestamp
        // exp = "expires at" timestamp
        // Both are added automatically by jwt.sign()

        // ── STEP 4 — confirm user still exists in DB ──
        // Why? The token could be valid but the user might have deleted their account
        // since the token was issued. Always double-check.
        const [users] = await db.query(
            `SELECT id, full_name, username, email, avatar_url, is_online 
             FROM users 
             WHERE id = ?`,
            [decoded.id]
        );

        // If no user found with that id
        if (users.length === 0) {
            return next(new AppError('User no longer exists.', 401));
        }

        // ── STEP 5 — attach user to the request object ──
        // This is the KEY step — we're adding a new property to req
        // req.user didn't exist before — we're creating it right now
        // Every controller that runs AFTER this middleware can access req.user
        // without querying the DB again
        req.user = users[0];
        // req.user is now: { id: 5, full_name: "Rahul", email: "...", ... }

        // ── STEP 6 — pass control to the next function ──
        // This could be another middleware or the actual controller
        // Without this line, the request hangs forever
        next();

    } catch (error) {
        next(error);
    }
};

module.exports = { verifyJWT };