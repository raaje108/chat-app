require('dotenv').config();

const app          = require('./app');
const http         = require('http');         // built into Node.js — no install needed
const { Server }   = require('socket.io');
const initSocket   = require('./socket');     // we'll create this file next

// ── STEP 1 — create an HTTP server from the Express app ──
// Previously app.listen() created this server internally
// Now we create it explicitly so Socket.io can share it
const httpServer = http.createServer(app);
// app is your Express app
// http.createServer wraps it in a raw Node.js HTTP server
// Both handle the same requests — Express just adds routing on top

// ── STEP 2 — attach Socket.io to the HTTP server ──
const io = new Server(httpServer, {
    cors: {
        origin: true,       // allow all origins (same as your Express CORS)
        credentials: true
    }
});
// io is your Socket.io server instance
// It listens on the same port as Express
// HTTP requests → handled by Express
// WebSocket connections → handled by Socket.io

// ── STEP 3 — initialize socket logic ──
// We keep all socket code in a separate file to stay organized
// We pass io into it so the socket file can use it
initSocket(io);

// ── STEP 4 — start the server ──
const PORT = process.env.PORT || 8000;
httpServer.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
});