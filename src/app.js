// const express = require('express');
// const cors    = require('cors');

// const app = express();

// // Middlewares
// app.use(cors({ origin: true, credentials: true }));
// app.use(express.json()); // parse incoming JSON bodies

// // Routes (we'll add these as we build each feature)
// // app.use('/api/auth',  authRouter);
// // app.use('/api/rooms', roomRouter);

// // Health check — visit localhost:8000/health to confirm server is running
// app.get('/health', (req, res) => {
//     res.json({ status: 'OK', message: 'Chat API is running 🚀' });
// });

// module.exports = app;



const express    = require('express');
const cors       = require('cors');

const app = express();

// ── Middlewares ────────────────────────────────────────
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

// ── Routes ─────────────────────────────────────────────
const authRouter = require('./routes/auth.routes');

app.use('/api/auth', authRouter);

// More routers come here as we build each phase:
// app.use('/api/rooms',    roomRouter);
// app.use('/api/messages', messageRouter);

// ── Health Check ───────────────────────────────────────
app.get('/health', (req, res) => {
    res.json({
        status:  'OK',
        message: 'Chat API is running 🚀'
    });
});

module.exports = app;