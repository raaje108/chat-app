const db     = require('../db/index');
const bcrypt = require('bcrypt');

const registerUser = async (req, res) => {
    try {
        // STEP 1 — pull data from request body
        const { full_name, username, email, password } = req.body;

        // STEP 2 — validate required fields
        if (!full_name || !email || !password) {
            return res.status(400).json({
                message: 'full_name, email and password are required'
            });
        }

        // STEP 3 — password strength check
        // At least 6 chars — we'll add proper validation in Phase 5
        if (password.length < 6) {
            return res.status(400).json({
                message: 'Password must be at least 6 characters'
            });
        }

        // STEP 4 — check email is not already taken
        const [existingEmail] = await db.query(
            'SELECT id FROM users WHERE email = ?',
            [email]
        );
        if (existingEmail.length > 0) {
            return res.status(409).json({
                message: 'An account with this email already exists'
            });
        }

        // STEP 5 — check username is not already taken (only if provided)
        if (username) {
            const [existingUsername] = await db.query(
                'SELECT id FROM users WHERE username = ?',
                [username]
            );
            if (existingUsername.length > 0) {
                return res.status(409).json({
                    message: 'This username is already taken'
                });
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
        console.error('Register error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

module.exports = { registerUser };