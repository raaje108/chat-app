const db = require('../db/index');
const AppError = require('../utils/AppError');

// ─────────────────────────────────────────────
// GET MESSAGE HISTORY
// GET /api/rooms/:roomId/messages
// ─────────────────────────────────────────────
const getMessages = async (req, res, next) => {
    try {

        // ── STEP 1 — get roomId from URL params ──
        const roomId = Number(req.params.roomId);

        if (!roomId || isNaN(roomId)) {
            return next(new AppError('Invalid room ID', 400));
        }

        // ── STEP 2 — get pagination params from query string ──
        // GET /api/rooms/2/messages?limit=50&before=100
        //                                    ↑          ↑
        //                              how many    cursor (message id)

        const limit  = Number(req.query.limit)  || 50;  // default 50
        const before = Number(req.query.before) || null; // cursor — null means latest

        // cap the limit at 100 — prevent clients requesting 10000 messages
        const safeLimit = Math.min(limit, 100);
        // Math.min() returns the smaller of two numbers
        // Math.min(50, 100)  → 50  (user asked for 50, fine)
        // Math.min(500, 100) → 100 (user asked for 500, capped at 100)

        // ── STEP 3 — check room exists ──
        const [rooms] = await db.query(
            `SELECT id, name FROM rooms 
             WHERE id = ? AND deleted_at IS NULL`,
            [roomId]
        );

        if (rooms.length === 0) {
            return next(new AppError('Room not found', 404));
        }

        // ── STEP 4 — check user is a member ──
        const [membership] = await db.query(
            `SELECT id FROM room_members 
             WHERE room_id = ? 
               AND user_id = ? 
               AND left_at IS NULL`,
            [roomId, req.user.id]
        );

        if (membership.length === 0) {
            return next(new AppError('You are not a member of this room', 403));
        }

        // ── STEP 5 — build the query ──
        // This is your most complex query yet — 3 joins + conditional cursor
        const query = `
            SELECT
                -- message fields
                m.id,
                m.room_id,
                m.content,
                m.message_type,
                m.is_edited,
                m.is_pinned,
                m.reply_to_id,
                m.created_at,
                m.updated_at,

                -- soft deleted messages show placeholder
                -- CASE is like an if/else inside SQL
                CASE
                    WHEN m.deleted_at IS NOT NULL THEN TRUE
                    ELSE FALSE
                END AS is_deleted,

                -- sender info
                u.id          AS sender_id,
                u.full_name   AS sender_name,
                u.username    AS sender_username,
                u.avatar_url  AS sender_avatar,
                u.is_online   AS sender_is_online,

                -- original message if this is a reply
                reply.id          AS reply_id,
                reply.content     AS reply_content,
                reply.sender_id   AS reply_sender_id,
                reply_user.full_name AS reply_sender_name

            FROM messages m

            -- get sender info
            JOIN users u ON m.sender_id = u.id

            -- get original message for replies (optional)
            LEFT JOIN messages   reply      ON m.reply_to_id  = reply.id
            LEFT JOIN users      reply_user ON reply.sender_id = reply_user.id

            WHERE m.room_id = ?

            -- cursor pagination
            -- if 'before' was provided, only get messages older than that id
            -- if not provided, get the latest messages
            ${before ? 'AND m.id < ?' : ''}

            -- newest first so we get the most recent 50
            -- the frontend will reverse them to show oldest at top
            ORDER BY m.id DESC

            LIMIT ?
        `;

        // ── STEP 6 — build values array ──
        // Order must match the ? placeholders in the query
        const values = before
            ? [roomId, before, safeLimit]
            : [roomId, safeLimit];

        // ── STEP 7 — run the query ──
        const [messages] = await db.query(query, values);

        // ── STEP 8 — update last_read_at ──
        // User opened the room and loaded messages
        // Mark everything as read up to now
        await db.query(
            `UPDATE room_members 
             SET last_read_at = NOW() 
             WHERE room_id = ? AND user_id = ?`,
            [roomId, req.user.id]
        );

        // ── STEP 9 — reverse messages ──
        // We fetched newest first (for the LIMIT to work correctly)
        // But the frontend wants oldest first (to display top to bottom)
        // .reverse() flips the array in place
        messages.reverse();

        // ── STEP 10 — tell client if there are more messages to load ──
        // If we got exactly safeLimit messages back
        // there are probably more — client can scroll up for more
        // If we got fewer than safeLimit — we've reached the beginning
        const hasMore = messages.length === safeLimit;

        // the cursor for the next request
        // is the id of the oldest message in this batch
        // client sends this as ?before=X on next scroll
        const nextCursor = messages.length > 0
            ? messages[0].id
            : null;

        // ── STEP 11 — send response ──
        res.status(200).json({
            message:    'Messages fetched successfully',
            count:      messages.length,
            hasMore,
            nextCursor, // client uses this for next scroll-up request
            messages
        });

    } catch (error) {
        next(error);
    }
};

module.exports = { getMessages };