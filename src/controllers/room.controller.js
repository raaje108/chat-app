const db       = require('../db/index');
const AppError = require('../utils/AppError');

// ─────────────────────────────────────────────
// CREATE A ROOM
// POST /api/rooms
// ─────────────────────────────────────────────
const createRoom = async (req, res, next) => {
    try {

        // ── STEP 1 — get data from request body ──
        // name is optional for DMs but required for group/public rooms
        // we'll handle that logic below
        const { name, description, room_type, icon_url } = req.body;

        // ── STEP 2 — get the logged in user's id ──
        // remember verifyJWT already ran before this function
        // it attached the user to req.user
        // so we don't need to query the DB again
        const userId = req.user.id;

        // ── STEP 3 — validate based on room_type ──
        // public and group rooms MUST have a name
        // direct (DM) rooms don't need one
        const type = room_type || 'public'; // default to public if not provided

        if ((type === 'public' || type === 'group') && (!name || !name.trim())) {
            return next(new AppError('Room name is required for public and group rooms', 400));
        }

        // ── STEP 4 — validate room_type value ──
        // only allow the 3 values we defined in our ENUM
        const allowedTypes = ['direct', 'group', 'public'];
        
        // .includes() checks if a value exists in an array
        // ['a','b','c'].includes('b') → true
        // ['a','b','c'].includes('z') → false
        if (!allowedTypes.includes(type)) {
            return next(new AppError('room_type must be direct, group or public', 400));
        }

        // ── STEP 5 — insert the room into the database ──
        const [result] = await db.query(
            `INSERT INTO rooms 
                (name, description, room_type, icon_url, created_by)
             VALUES (?, ?, ?, ?, ?)`,
            [
                name        || null,  // null for DMs
                description || null,  // optional
                type,
                icon_url    || null,  // optional
                userId                // the logged in user becomes the creator
            ]
        );

        // result.insertId is the auto-generated id of the new room
        const roomId = result.insertId;

        // ── STEP 6 — add creator as first member with 'admin' role ──
        // This is a second query — we need to insert into room_members too
        // Two tables updated in one request — this is very common in backend
        await db.query(
            `INSERT INTO room_members 
                (room_id, user_id, role)
             VALUES (?, ?, 'admin')`,
            [roomId, userId]
        );
        // Notice 'admin' is hardcoded as a string — not a variable
        // The creator always gets admin. No exceptions.

        // ── STEP 7 — fetch the newly created room to send back ──
        // Why not just send result back directly?
        // Because result only contains insertId and affectedRows
        // We want to send the full room object with all its fields
        const [rooms] = await db.query(
            `SELECT * FROM rooms WHERE id = ?`,
            [roomId]
        );

        // ── STEP 8 — send response ──
        res.status(201).json({
            message: 'Room created successfully',
            room: rooms[0]
        });

    } catch (error) {
        next(error);
    }
};



// ─────────────────────────────────────────────
// GET ALL PUBLIC ROOMS
// GET /api/rooms
// ─────────────────────────────────────────────
const query = `
    SELECT 
        r.id, r.name, r.description, r.room_type, r.icon_url,
        r.created_by, r.created_at,
        COUNT(rm.id) AS member_count,
        MAX(CASE WHEN rm.user_id = ? THEN 1 ELSE 0 END) AS is_joined,

        -- NEW: check if current user has a pending request
        (SELECT status FROM room_join_requests 
         WHERE room_id = r.id AND user_id = ? AND status = 'pending') AS request_status

    FROM rooms r
    LEFT JOIN room_members rm ON r.id = rm.room_id
    WHERE r.deleted_at IS NULL
    ${search ? 'AND r.name LIKE ?' : ''}
    GROUP BY r.id
    ORDER BY r.created_at DESC
`;

// update values — req.user.id now appears twice
const values = search
    ? [req.user.id, req.user.id, `%${search}%`]
    : [req.user.id, req.user.id];
// ─────────────────────────────────────────────
// JOIN A ROOM
// POST /api/rooms/:roomId/join
// ─────────────────────────────────────────────
const joinRoom = async (req, res, next) => {
    try {

        // ── STEP 1 — get roomId from URL params ──
        // URL is /api/rooms/1/join
        // req.params.roomId = "1"  ← comes as a STRING from the URL
        // Number() converts it to an integer
        const roomId = Number(req.params.roomId);
        const userId = req.user.id;

        // ── STEP 2 — validate roomId ──
        // Number("abc") = NaN (Not a Number)
        // isNaN() checks for that
        if (!roomId || isNaN(roomId)) {
            return next(new AppError('Invalid room ID', 400));
        }

        // ── STEP 3 — check room exists and is not deleted ──
        // We also check room_type — users can't join a 'direct' DM room manually
        // DM rooms are created differently (both users added programmatically)
        const [rooms] = await db.query(
            `SELECT id, name, room_type 
             FROM rooms 
             WHERE id = ? 
               AND deleted_at IS NULL`,
            [roomId]
        );

        // If no room found — either doesn't exist or was soft deleted
        if (rooms.length === 0) {
            return next(new AppError('Room not found', 404));
        }
        // 404 = Not Found — the correct status when a resource doesn't exist

        const room = rooms[0];

        // ── STEP 4 — prevent joining a DM room manually ──
        // DM rooms are private between two specific users
        // No one should be able to manually join one
        if (room.room_type === 'direct') {
            return next(new AppError('You cannot manually join a direct message room', 403));
        }
        // 403 = Forbidden — the resource exists but you're not allowed to do this
        // Different from 401 (Unauthorized = not logged in)
        // 401 = "who are you?"
        // 403 = "I know who you are, but you can't do this"

        // ── STEP 5 — insert into room_members ──
        // We don't check for duplicates manually here
        // Our UNIQUE KEY constraint handles it at the database level
        // If duplicate → MySQL throws ER_DUP_ENTRY error → we catch it below
        await db.query(
            `INSERT INTO room_members (room_id, user_id, role)
             VALUES (?, ?, 'member')`,
            [roomId, userId]
            // 'member' is the default role for joining users
            // only 'admin' is for room creators
        );

        // ── STEP 6 — send success response ──
        res.status(201).json({
            message: `Successfully joined "${room.name}"`,
            roomId,
            userId
        });

    } catch (error) {

        // ── STEP 7 — handle duplicate join gracefully ──
        // When the UNIQUE KEY is violated MySQL throws a specific error
        // error.code === 'ER_DUP_ENTRY' tells us exactly what happened
        // Instead of crashing with 500, we send a meaningful 409 response
        if (error.code === 'ER_DUP_ENTRY') {
            return next(new AppError('You are already a member of this room', 409));
        }

        next(error);
    }
};



// ─────────────────────────────────────────────
// GET ROOM MEMBERS
// GET /api/rooms/:roomId/members
// ─────────────────────────────────────────────
const getRoomMembers = async (req, res, next) => {
    try {

        // ── STEP 1 — get and validate roomId ──
        const roomId = Number(req.params.roomId);

        if (!roomId || isNaN(roomId)) {
            return next(new AppError('Invalid room ID', 400));
        }

        // ── STEP 2 — check the room exists ──
        // Before listing members we confirm the room is real
        // and not soft deleted
        const [rooms] = await db.query(
            `SELECT id, name FROM rooms 
             WHERE id = ? AND deleted_at IS NULL`,
            [roomId]
        );

        if (rooms.length === 0) {
            return next(new AppError('Room not found', 404));
        }

        // ── STEP 3 — check the requesting user is a member ──
        // You shouldn't be able to see members of a room
        // you haven't joined — especially for private rooms
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

        // ── STEP 4 — fetch all members with their user info ──
        // This is the 3-table JOIN
        // rm = room_members (alias to keep query readable)
        // u  = users        (alias)
        const [members] = await db.query(
            `SELECT
                -- from room_members table
                rm.id          AS membership_id,
                rm.role,
                rm.joined_at,
                rm.is_muted,
                rm.last_read_at,

                -- from users table
                -- we rename with AS to make the response clean
                u.id           AS user_id,
                u.full_name,
                u.username,
                u.avatar_url,
                u.is_online,
                u.last_seen

             FROM room_members rm

             -- JOIN users by matching user_id
             -- INNER JOIN here — we only want members who still exist
             -- (unlike LEFT JOIN which would include NULLs)
             JOIN users u ON rm.user_id = u.id

             WHERE rm.room_id = ?
               AND rm.left_at IS NULL

             -- admins first, then moderators, then members
             -- FIELD() lets you define a custom sort order
             ORDER BY FIELD(rm.role, 'admin', 'moderator', 'member'),
                      rm.joined_at ASC`,
            [roomId]
        );

        // ── STEP 5 — send response ──
        res.status(200).json({
            message:  'Members fetched successfully',
            room:     rooms[0].name,
            count:    members.length,
            members
        });

    } catch (error) {
        next(error);
    }
};

// ─────────────────────────────────────────────
// DELETE A ROOM (soft delete)
// DELETE /api/rooms/:roomId
// ─────────────────────────────────────────────
const deleteRoom = async (req, res, next) => {
    try {

        // ── STEP 1 — get and validate roomId ──
        const roomId = Number(req.params.roomId);

        if (!roomId || isNaN(roomId)) {
            return next(new AppError('Invalid room ID', 400));
        }

        // ── STEP 2 — check room exists and is not already deleted ──
        const [rooms] = await db.query(
            `SELECT id, name, created_by 
             FROM rooms 
             WHERE id = ? 
               AND deleted_at IS NULL`,
            [roomId]
        );

        if (rooms.length === 0) {
            return next(new AppError('Room not found', 404));
        }

        const room = rooms[0];

        // ── STEP 3 — ownership check ──
        // This is authorization — not just "are you logged in"
        // but "are you specifically the person who owns this"
        // req.user.id comes from the JWT token (verified by middleware)
        // room.created_by comes from the database
        // If they don't match — this user doesn't own this room
        if (room.created_by !== req.user.id) {
            return next(new AppError('Only the room creator can delete this room', 403));
        }
        // Why !== and not != ?
        // !== checks value AND type (strict equality)
        // room.created_by is a number from DB
        // req.user.id is a number from JWT payload
        // Both are numbers so !== works perfectly
        // Always use === and !== in JavaScript — never == or !=

        // ── STEP 4 — soft delete the room ──
        // We set deleted_at to the current timestamp
        // The row stays in the database — nothing is destroyed
        await db.query(
            `UPDATE rooms 
             SET deleted_at = NOW() 
             WHERE id = ?`,
            [roomId]
        );
        // NOW() is a MySQL function that returns the current timestamp
        // This is why deleted_at is TIMESTAMP — it stores exactly when deletion happened

        // ── STEP 5 — send success response ──
        // 200 is fine here — some APIs use 204 (No Content) for deletes
        // 204 means success but sends no response body
        // We use 200 so we can send a helpful message
        res.status(200).json({
            message: `Room "${room.name}" has been deleted successfully`,
            roomId
        });

    } catch (error) {
        next(error);
    }
};
// ─────────────────────────────────────────────
// REQUEST TO JOIN A GROUP ROOM
// POST /api/rooms/:roomId/join-request
// ─────────────────────────────────────────────
const requestToJoin = async (req, res, next) => {
    try {
        const roomId = Number(req.params.roomId);
        const userId = req.user.id;

        // ── verify room exists ──
        const [rooms] = await db.query(
            `SELECT id, name, room_type FROM rooms 
             WHERE id = ? AND deleted_at IS NULL`,
            [roomId]
        );

        if (rooms.length === 0) {
            return next(new AppError('Room not found', 404));
        }

        const room = rooms[0];

        // ── only 'group' rooms need requests ──
        // public rooms should use the regular joinRoom endpoint
        if (room.room_type !== 'group') {
            return next(new AppError('This room does not require a join request', 400));
        }

        // ── check not already a member ──
        const [existing] = await db.query(
            `SELECT id FROM room_members 
             WHERE room_id = ? AND user_id = ? AND left_at IS NULL`,
            [roomId, userId]
        );

        if (existing.length > 0) {
            return next(new AppError('You are already a member of this room', 409));
        }

        // ── insert the request ──
        // UNIQUE KEY (room_id, user_id) blocks duplicate pending requests
        await db.query(
            `INSERT INTO room_join_requests (room_id, user_id)
             VALUES (?, ?)`,
            [roomId, userId]
        );

        res.status(201).json({
            message: `Join request sent for "${room.name}"`,
            roomId
        });

    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') {
            return next(new AppError('You already have a pending request for this room', 409));
        }
        next(error);
    }
};

// ─────────────────────────────────────────────
// GET PENDING JOIN REQUESTS (admin only)
// GET /api/rooms/:roomId/join-requests
// ─────────────────────────────────────────────
const getJoinRequests = async (req, res, next) => {
    try {
        const roomId = Number(req.params.roomId);

        // ── verify requester is an admin of this room ──
        const [membership] = await db.query(
            `SELECT role FROM room_members 
             WHERE room_id = ? AND user_id = ? AND left_at IS NULL`,
            [roomId, req.user.id]
        );

        if (membership.length === 0 || membership[0].role !== 'admin') {
            return next(new AppError('Only room admins can view join requests', 403));
        }

        // ── fetch pending requests with requester info ──
        const [requests] = await db.query(
            `SELECT 
                jr.id,
                jr.requested_at,
                u.id         AS user_id,
                u.full_name,
                u.username,
                u.avatar_url
             FROM room_join_requests jr
             JOIN users u ON jr.user_id = u.id
             WHERE jr.room_id = ? AND jr.status = 'pending'
             ORDER BY jr.requested_at ASC`,
            [roomId]
        );

        res.status(200).json({
            message: 'Join requests fetched',
            count:   requests.length,
            requests
        });

    } catch (error) {
        next(error);
    }
};

// ─────────────────────────────────────────────
// APPROVE A JOIN REQUEST (admin only)
// POST /api/rooms/:roomId/join-requests/:requestId/approve
// ─────────────────────────────────────────────
const approveJoinRequest = async (req, res, next) => {
    try {
        const roomId    = Number(req.params.roomId);
        const requestId = Number(req.params.requestId);

        // ── verify admin ──
        const [membership] = await db.query(
            `SELECT role FROM room_members 
             WHERE room_id = ? AND user_id = ? AND left_at IS NULL`,
            [roomId, req.user.id]
        );

        if (membership.length === 0 || membership[0].role !== 'admin') {
            return next(new AppError('Only room admins can approve requests', 403));
        }

        // ── fetch the request ──
        const [requests] = await db.query(
            `SELECT id, user_id, status FROM room_join_requests 
             WHERE id = ? AND room_id = ?`,
            [requestId, roomId]
        );

        if (requests.length === 0) {
            return next(new AppError('Join request not found', 404));
        }

        if (requests[0].status !== 'pending') {
            return next(new AppError('This request has already been resolved', 409));
        }

        const requesterId = requests[0].user_id;

        // ── two things happen together: ──
        // 1. mark request as approved
        // 2. actually add them to room_members
        // both must succeed or neither should — but we'll keep it simple for now
        await db.query(
            `UPDATE room_join_requests 
             SET status = 'approved', resolved_at = NOW(), resolved_by = ?
             WHERE id = ?`,
            [req.user.id, requestId]
        );

        await db.query(
            `INSERT INTO room_members (room_id, user_id, role)
             VALUES (?, ?, 'member')`,
            [roomId, requesterId]
        );

        res.status(200).json({
            message: 'Join request approved',
            requestId,
            userId: requesterId
        });

    } catch (error) {
        next(error);
    }
};

// ─────────────────────────────────────────────
// REJECT A JOIN REQUEST (admin only)
// POST /api/rooms/:roomId/join-requests/:requestId/reject
// ─────────────────────────────────────────────
const rejectJoinRequest = async (req, res, next) => {
    try {
        const roomId    = Number(req.params.roomId);
        const requestId = Number(req.params.requestId);

        const [membership] = await db.query(
            `SELECT role FROM room_members 
             WHERE room_id = ? AND user_id = ? AND left_at IS NULL`,
            [roomId, req.user.id]
        );

        if (membership.length === 0 || membership[0].role !== 'admin') {
            return next(new AppError('Only room admins can reject requests', 403));
        }

        const [requests] = await db.query(
            `SELECT id, status FROM room_join_requests 
             WHERE id = ? AND room_id = ?`,
            [requestId, roomId]
        );

        if (requests.length === 0) {
            return next(new AppError('Join request not found', 404));
        }

        if (requests[0].status !== 'pending') {
            return next(new AppError('This request has already been resolved', 409));
        }

        await db.query(
            `UPDATE room_join_requests 
             SET status = 'rejected', resolved_at = NOW(), resolved_by = ?
             WHERE id = ?`,
            [req.user.id, requestId]
        );

        res.status(200).json({
            message: 'Join request rejected',
            requestId
        });

    } catch (error) {
        next(error);
    }
};

module.exports = {
    createRoom, getRooms, joinRoom, getRoomMembers, deleteRoom,
    requestToJoin, getJoinRequests, approveJoinRequest, rejectJoinRequest  // ← ADD
};