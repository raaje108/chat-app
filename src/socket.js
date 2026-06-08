const jwt = require('jsonwebtoken');
const db  = require('./db/index');

const initSocket = (io) => {
    // ── MIDDLEWARE — authenticate every socket connection ──
    // This runs ONCE when a client first connects
    // Before any events are received
    // Same concept as verifyJWT middleware in Express
    // but for WebSocket connections instead of HTTP requests
    io.use(async (socket, next) => {
        try {
            // socket.handshake contains connection info
            // The client sends their JWT token here when connecting
            // We look for it in auth object or as a query param
            const token = socket.handshake.auth.token
                       || socket.handshake.query.token;

            // If no token provided — reject the connection
            if (!token) {
                return next(new Error('Authentication error. No token provided.'));
                // next(error) = reject this connection
                // next()      = allow this connection
            }

            // Verify the JWT token — same as your HTTP middleware
            const decoded = jwt.verify(token, process.env.JWT_SECRET);

            // Confirm user still exists in DB
            const [users] = await db.query(
                `SELECT id, full_name, username, email, avatar_url 
                 FROM users 
                 WHERE id = ?`,
                [decoded.id]
            );

            if (users.length === 0) {
                return next(new Error('User not found.'));
            }

            // Attach user to socket object
            // socket.user is now available in ALL event handlers
            // Same idea as req.user in Express
            socket.user = users[0];

            // Allow the connection
            next();

        } catch (error) {
            return next(new Error('Invalid or expired token.'));
        }
    });

    // ── CONNECTION EVENT ──
    // Runs every time a new client successfully connects
    // "socket" here represents ONE specific connected client
    io.on('connection', async (socket) => {
        console.log(`⚡ User connected: ${socket.user.full_name} (${socket.id})`);
        // socket.id is a unique random ID for this connection
        // Different every time — even same user reconnecting gets new id

        // ── Update user status to online ──
        await db.query(
            'UPDATE users SET is_online = TRUE WHERE id = ?',
            [socket.user.id]
        );

        // ── Broadcast to everyone that this user is online ──
        // socket.broadcast.emit = send to ALL connected clients EXCEPT this one
        socket.broadcast.emit('userOnline', {
            userId:    socket.user.id,
            full_name: socket.user.full_name
        });

        // ─────────────────────────────────────────────
        // JOIN ROOM EVENT
        // Client emits this when they open a chat room
        // ─────────────────────────────────────────────
        socket.on('joinRoom', async (roomId) => {
            try {
                // Verify the user is actually a member of this room
                // Don't trust the client — always verify in DB
                const [membership] = await db.query(
                    `SELECT id FROM room_members 
                     WHERE room_id = ? 
                       AND user_id = ? 
                       AND left_at IS NULL`,
                    [roomId, socket.user.id]
                );

                if (membership.length === 0) {
                    // Emit an error back to THIS specific client only
                    socket.emit('error', {
                        message: 'You are not a member of this room'
                    });
                    return; // stop here
                }

                // Join the Socket.io room channel
                // Every socket in the same room channel
                // receives events emitted to that room
                socket.join(`room_${roomId}`);
                // We prefix with "room_" to avoid conflicts
                // room_1, room_2, room_3...

                console.log(`${socket.user.full_name} joined room_${roomId}`);

                // Confirm to the client they joined successfully
                socket.emit('joinedRoom', {
                    message: `Joined room ${roomId}`,
                    roomId
                });

            } catch (error) {
                console.error('joinRoom error:', error);
                socket.emit('error', { message: 'Failed to join room' });
            }
        });

        // ─────────────────────────────────────────────
        // LEAVE ROOM EVENT
        // Client emits this when they close a chat room
        // ─────────────────────────────────────────────
        socket.on('leaveRoom', (roomId) => {
            socket.leave(`room_${roomId}`);
            console.log(`${socket.user.full_name} left room_${roomId}`);

            socket.emit('leftRoom', { roomId });
        });

        // ─────────────────────────────────────────────
        // DISCONNECT EVENT
        // Runs automatically when client closes the app
        // or loses internet connection
        // ─────────────────────────────────────────────
        socket.on('disconnect', async () => {
            console.log(`💤 User disconnected: ${socket.user.full_name}`);

            // Update user status to offline
            await db.query(
                'UPDATE users SET is_online = FALSE, last_seen = NOW() WHERE id = ?',
                [socket.user.id]
            );

            // Broadcast to everyone that this user went offline
            socket.broadcast.emit('userOffline', {
                userId:    socket.user.id,
                full_name: socket.user.full_name
            });
        });

        // ─────────────────────────────────────────────
// SEND MESSAGE EVENT
// Client emits: socket.emit('sendMessage', { roomId, content, message_type, reply_to_id })
// ─────────────────────────────────────────────
socket.on('sendMessage', async (data) => {
    try {

        // ── STEP 1 — extract data from the event payload ──
        // data is whatever the client sent with the event
        // like req.body but for socket events
        const { roomId, content, message_type, reply_to_id } = data;

        // ── STEP 2 — validate required fields ──
        if (!roomId || !content) {
            socket.emit('error', {
                message: 'roomId and content are required'
            });
            return;
        }

        // ── STEP 3 — validate message_type ──
        const type = message_type || 'text';
        const allowedTypes = ['text', 'image', 'file'];
        // Note: 'system' is excluded — users can't send system messages
        // those are created by the server automatically

        if (!allowedTypes.includes(type)) {
            socket.emit('error', {
                message: `message_type must be one of: ${allowedTypes.join(', ')}`
            });
            return;
        }

        // ── STEP 4 — verify user is a member of this room ──
        // Never trust the client — always verify in DB
        // A user could manually emit 'sendMessage' with any roomId
        // We must confirm they actually belong there
        const [membership] = await db.query(
            `SELECT id FROM room_members 
             WHERE room_id = ? 
               AND user_id = ? 
               AND left_at IS NULL`,
            [roomId, socket.user.id]
        );

        if (membership.length === 0) {
            socket.emit('error', {
                message: 'You are not a member of this room'
            });
            return;
        }

        // ── STEP 5 — if this is a reply, verify the original message exists ──
        // reply_to_id is optional — only present when replying to a message
        if (reply_to_id) {
            const [originalMessage] = await db.query(
                `SELECT id FROM messages 
                 WHERE id = ? 
                   AND room_id = ?
                   AND deleted_at IS NULL`,
                [reply_to_id, roomId]
            );

            if (originalMessage.length === 0) {
                socket.emit('error', {
                    message: 'Original message not found'
                });
                return;
            }
        }

        // ── STEP 6 — save message to DB ──
        const [result] = await db.query(
            `INSERT INTO messages 
                (room_id, sender_id, content, message_type, reply_to_id)
             VALUES (?, ?, ?, ?, ?)`,
            [
                roomId,
                socket.user.id,
                content,
                type,
                reply_to_id || null
            ]
        );

        const messageId = result.insertId;

        // ── STEP 7 — update last_read_at for the sender ──
        // The sender obviously read their own message
        // so we update their last_read_at immediately
        // This keeps unread counts accurate
        await db.query(
            `UPDATE room_members 
             SET last_read_at = NOW() 
             WHERE room_id = ? AND user_id = ?`,
            [roomId, socket.user.id]
        );

        // ── STEP 8 — fetch the complete message to broadcast ──
        // Just like creating a room — INSERT result doesn't have full data
        // We fetch the saved message with sender info using a JOIN
        const [messages] = await db.query(
            `SELECT
                m.id,
                m.room_id,
                m.content,
                m.message_type,
                m.reply_to_id,
                m.is_edited,
                m.created_at,

                -- sender info
                u.id         AS sender_id,
                u.full_name  AS sender_name,
                u.username   AS sender_username,
                u.avatar_url AS sender_avatar,

                -- if this is a reply, get the original message content
                -- another self-join on messages table
                reply.content    AS reply_content,
                reply.sender_id  AS reply_sender_id

             FROM messages m
             JOIN users u ON m.sender_id = u.id

             -- LEFT JOIN because reply_to_id is optional
             -- if no reply, these columns will just be NULL
             LEFT JOIN messages reply ON m.reply_to_id = reply.id

             WHERE m.id = ?`,
            [messageId]
        );

        const message = messages[0];

        // ── STEP 9 — broadcast to EVERYONE in the room ──
        // io.to('room_2').emit() sends to ALL sockets in room_2
        // including the sender
        // This way the sender also gets the "official" message back
        // with the DB id and timestamp — not just their local copy
        io.to(`room_${roomId}`).emit('newMessage', message);
        //  ↑ this is why we needed to pass io into initSocket()
        //    socket.emit() = only to sender
        //    io.to().emit() = to everyone in the room

    } catch (error) {
        console.error('sendMessage error:', error);
        socket.emit('error', {
            message: 'Failed to send message'
        });
    }
});
// ─────────────────────────────────────────────
// TYPING INDICATOR EVENTS
// These are ephemeral — never saved to DB
// ─────────────────────────────────────────────

socket.on('typing', (roomId) => {
    // socket.to() is different from io.to()
    // socket.to('room_2').emit() = everyone in room_2 EXCEPT the sender
    // We don't want to tell Priya that Priya is typing
    // Only the OTHER people in the room need to know
    socket.to(`room_${roomId}`).emit('userTyping', {
        userId:   socket.user.id,
        username: socket.user.username || socket.user.full_name,
        roomId
    });
});

socket.on('stopTyping', (roomId) => {
    // Same pattern — broadcast to everyone except sender
    socket.to(`room_${roomId}`).emit('userStopTyping', {
        userId: socket.user.id,
        roomId
    });
});    });
};

module.exports = initSocket;