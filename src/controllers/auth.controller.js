const db       = require('../db/index');
const bcrypt   = require('bcrypt');
const jwt      = require('jsonwebtoken');
const AppError = require('../utils/AppError');

const registerUser = async (req, res, next) => {
    try {
        // STEP 1 — pull data from request body
        const { full_name, username, email, password } = req.body;

        // STEP 2 — validate required fields
        if (!full_name || !email || !password) {
            return next(new AppError('full_name, email and password are required', 400));
        }

        // STEP 3 — password strength check
        // At least 6 chars — we'll add proper validation in Phase 5
        if (password.length < 6) {
            return next(new AppError('Password must be at least 6 characters', 400));
        }

        // STEP 4 — check email is not already taken
        const [existingEmail] = await db.query(
            'SELECT id FROM users WHERE email = ?',
            [email]
        );
        if (existingEmail.length > 0) {
            return next(new AppError('An account with this email already exists', 409));
        }

        // STEP 5 — check username is not already taken (only if provided)
        if (username) {
            const [existingUsername] = await db.query(
                'SELECT id FROM users WHERE username = ?',
                [username]
            );
            if (existingUsername.length > 0) {
                return next(new AppError('This username is already taken', 409));
            }
        }

        // STEP 6 — hash the password
        const hashedPassword = await bcrypt.hash(password, 10);

        // STEP 7 — insert into database
        // username and avatar_url are optional — default to NULL if not provided
        const [result] = await db.query(
            `INSERT INTO users 
                (full_name, username, email, password_hash) 
             VALUES (?, ?, ?, ?)`,
            [
                full_name,
                username || null,
                email,
                hashedPassword
            ]
        );

        // STEP 8 — return success (never send password_hash back)
        res.status(201).json({
            message: 'Account created successfully',
            userId:  result.insertId
        });

    } catch (error) {
        next(error);
    }
};

const loginUser = async (req, res, next) => {
    try {
        // ── STEP 1 — get email and password from request body ──
        const { email, password } = req.body;

        // ── STEP 2 — check both fields exist ──
        // If someone sends an empty request, stop here immediately
        if (!email || !password) {
            return next(new AppError('Email and password are required', 400));
        }

        // ── STEP 3 — find the user by email ──
        // We need the full user row because we need password_hash to compare
        const [rows] = await db.query(
            `SELECT 
                id, 
                full_name, 
                username, 
                email, 
                password_hash,
                avatar_url,
                is_online
             FROM users 
             WHERE email = ?`,
            [email]
        );

        // rows is an array — if empty, no user found with that email
        if (rows.length === 0) {
            return next(new AppError('Invalid email or password', 401));
        }

        // rows[0] is the first (and only) matching user
        const user = rows[0];

        // ── STEP 4 — compare the password ──
        // bcrypt.compare() hashes the incoming password the same way
        // and checks if it matches the stored hash
        // It returns true or false — never the original password
        const isPasswordCorrect = await bcrypt.compare(password, user.password_hash);

        if (!isPasswordCorrect) {
            return next(new AppError('Invalid email or password', 401));
        }

        // ── STEP 5 — create the JWT token ──
        const token = jwt.sign(
            // PAYLOAD — data to encode inside the token
            // Keep it small — just enough to identify the user
            // Never put password_hash here
            {
                id:       user.id,
                email:    user.email,
                username: user.username
            },
            // SECRET — from your .env file
            // This is what makes the token trustworthy
            process.env.JWT_SECRET,
            // OPTIONS
            {
                expiresIn: process.env.ACCESS_TOKEN_EXPIRY || '7d'
                // Token expires in 7 days — after that it's invalid
                // User has to login again
            }
        );

        // ── STEP 6 — update is_online to true ──
        await db.query(
            'UPDATE users SET is_online = TRUE, last_seen = NOW() WHERE id = ?',
            [user.id]
        );

        // ── STEP 7 — send back the token and user info ──
        // Notice we never send password_hash back — ever
        res.status(200).json({
            message: 'Login successful',
            token,   // the frontend stores this and sends it with every request
            user: {
                id:         user.id,
                full_name:  user.full_name,
                username:   user.username,
                email:      user.email,
                avatar_url: user.avatar_url
            }
        });

    } catch (error) {
        next(error);
    }
};

const getMe = async (req, res, next) => {
    try {
        // No DB query needed — req.user was attached by verifyJWT middleware
        // This is why middleware is powerful — work done once, available everywhere
        res.status(200).json({
            message: 'Here is your profile',
            user: req.user
        });
    } catch (error) {
        next(error);
    }
};

// Update exports
module.exports = { registerUser, loginUser, getMe };