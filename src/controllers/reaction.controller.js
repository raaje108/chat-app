const db       = require('../db/index');
const AppError = require('../utils/AppError');

// ─────────────────────────────────────────────
// ADD A REACTION
// POST /api/messages/:messageId/react
// ─────────────────────────────────────────────
const addReaction = async (req, res, next) => {
    try {

        // ── STEP 1 — get messageId and emoji ──
        const messageId = Number(req.params.messageId);
        const { emoji } = req.body;

        // ── STEP 2 — verify the message exists and isn't deleted ──
        // Also get room_id so we can verify membership below
        const [messages] = await db.query(
            `SELECT id, room_id, sender_id 
             FROM messages 
             WHERE id = ? 
               AND deleted_at IS NULL`,
            [messageId]
        );

        if (messages.length === 0) {
            return next(new AppError('Message not found', 404));
        }

        const message = messages[0];

        // ── STEP 3 — verify user is a member of the room ──
        // You shouldn't be able to react to messages in rooms you're not in
        const [membership] = await db.query(
            `SELECT id FROM room_members 
             WHERE room_id = ? 
               AND user_id = ? 
               AND left_at IS NULL`,
            [message.room_id, req.user.id]
        );

        if (membership.length === 0) {
            return next(new AppError('You are not a member of this room', 403));
        }

        // ── STEP 4 — insert the reaction ──
        // No duplicate check here — we let the UNIQUE KEY handle it
        // If duplicate → ER_DUP_ENTRY → caught below
        await db.query(
            `INSERT INTO message_reactions (message_id, user_id, emoji)
             VALUES (?, ?, ?)`,
            [messageId, req.user.id, emoji]
        );

        // ── STEP 5 — fetch updated reaction counts for this message ──
        // Return the full reaction summary so frontend can update UI
        const [reactions] = await db.query(
            `SELECT 
                emoji,
                COUNT(*) AS count,
                -- check if the current user reacted with this emoji
                MAX(CASE WHEN user_id = ? THEN 1 ELSE 0 END) AS reacted_by_me
             FROM message_reactions
             WHERE message_id = ?
             GROUP BY emoji
             ORDER BY count DESC`,
            [req.user.id, messageId]
        );

        res.status(201).json({
            message:   'Reaction added',
            messageId,
            reactions
        });

    } catch (error) {
        // ── handle duplicate reaction ──
        // UNIQUE KEY (message_id, user_id, emoji) was violated
        // User already reacted with this emoji
        if (error.code === 'ER_DUP_ENTRY') {
            return next(new AppError('You already reacted with this emoji', 409));
        }
        next(error);
    }
};

// ─────────────────────────────────────────────
// REMOVE A REACTION
// DELETE /api/messages/:messageId/react
// ─────────────────────────────────────────────
const removeReaction = async (req, res, next) => {
    try {

        const messageId = Number(req.params.messageId);
        const { emoji } = req.body;

        // ── STEP 1 — verify message exists ──
        const [messages] = await db.query(
            `SELECT id, room_id FROM messages 
             WHERE id = ? AND deleted_at IS NULL`,
            [messageId]
        );

        if (messages.length === 0) {
            return next(new AppError('Message not found', 404));
        }

        // ── STEP 2 — verify membership ──
        const [membership] = await db.query(
            `SELECT id FROM room_members 
             WHERE room_id = ? 
               AND user_id = ? 
               AND left_at IS NULL`,
            [messages[0].room_id, req.user.id]
        );

        if (membership.length === 0) {
            return next(new AppError('You are not a member of this room', 403));
        }

        // ── STEP 3 — delete the reaction ──
        const [result] = await db.query(
            `DELETE FROM message_reactions 
             WHERE message_id = ? 
               AND user_id    = ? 
               AND emoji      = ?`,
            [messageId, req.user.id, emoji]
        );

        // result.affectedRows tells us how many rows were deleted
        // If 0 — the reaction didn't exist in the first place
        if (result.affectedRows === 0) {
            return next(new AppError('Reaction not found', 404));
        }

        // ── STEP 4 — fetch updated reactions ──
        const [reactions] = await db.query(
            `SELECT 
                emoji,
                COUNT(*) AS count,
                MAX(CASE WHEN user_id = ? THEN 1 ELSE 0 END) AS reacted_by_me
             FROM message_reactions
             WHERE message_id = ?
             GROUP BY emoji
             ORDER BY count DESC`,
            [req.user.id, messageId]
        );

        res.status(200).json({
            message:   'Reaction removed',
            messageId,
            reactions  // empty array if no reactions left
        });

    } catch (error) {
        next(error);
    }
};

// ─────────────────────────────────────────────
// GET REACTIONS FOR A MESSAGE
// GET /api/messages/:messageId/reactions
// ─────────────────────────────────────────────
const getReactions = async (req, res, next) => {
    try {

        const messageId = Number(req.params.messageId);

        // ── STEP 1 — verify message exists ──
        const [messages] = await db.query(
            `SELECT id, room_id FROM messages 
             WHERE id = ? AND deleted_at IS NULL`,
            [messageId]
        );

        if (messages.length === 0) {
            return next(new AppError('Message not found', 404));
        }

        // ── STEP 2 — verify membership ──
        const [membership] = await db.query(
            `SELECT id FROM room_members 
             WHERE room_id = ? 
               AND user_id = ? 
               AND left_at IS NULL`,
            [messages[0].room_id, req.user.id]
        );

        if (membership.length === 0) {
            return next(new AppError('You are not a member of this room', 403));
        }

        // ── STEP 3 — fetch reactions grouped by emoji ──
        const [reactions] = await db.query(
            `SELECT
                emoji,
                COUNT(*)  AS count,

                -- did the current user react with this emoji?
                MAX(CASE WHEN mr.user_id = ? THEN 1 ELSE 0 END) AS reacted_by_me,

                -- list of users who reacted with this emoji
                -- GROUP_CONCAT joins multiple values into one string
                -- "Rahul Sharma, Priya Singh, Amit Kumar"
                GROUP_CONCAT(u.full_name ORDER BY mr.created_at ASC) AS reacted_by

             FROM message_reactions mr
             JOIN users u ON mr.user_id = u.id
             WHERE mr.message_id = ?
             GROUP BY emoji
             ORDER BY count DESC`,
            [req.user.id, messageId]
        );

        res.status(200).json({
            message:    'Reactions fetched',
            messageId,
            count:      reactions.length,
            reactions
        });

    } catch (error) {
        next(error);
    }
};

module.exports = { addReaction, removeReaction, getReactions };