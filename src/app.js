const express          = require('express');
const cors             = require('cors');
const { errorHandler } = require('./middlewares/error.middleware');
const { apiLimiter }   = require('./middlewares/rateLimiter.middleware'); // ← ADD

const app = express();

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

// ── Apply general rate limit to ALL routes ──
// Must be before routes so it runs on every request
app.use('/api', apiLimiter); // ← ADD — only limits /api/* routes

// ── Routes ──────────────────────────────────
const authRouter    = require('./routes/auth.routes');
const roomRouter    = require('./routes/room.routes');
const messageRouter = require('./routes/message.routes');

app.use('/api/auth',  authRouter);
app.use('/api/rooms', roomRouter);
app.use('/api/rooms', messageRouter);

// ── Health Check ────────────────────────────
app.get('/health', (req, res) => {
    res.json({ status: 'OK', message: 'Chat API is running 🚀' });
});

// ── 404 Handler ─────────────────────────────
app.use('*', (req, res) => {
    res.status(404).json({
        status:  'fail',
        message: `Route ${req.method} ${req.originalUrl} not found`
    });
});

// ── Global Error Handler ─────────────────────
app.use(errorHandler);

module.exports = app;