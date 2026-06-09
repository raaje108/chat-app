const db = require('../db/index');

// ─────────────────────────────────────────────
// CREATE A ROOM
// POST /api/rooms
// ─────────────────────────────────────────────
const createRoom = async (req, res) => {
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
            return res.status(400).json({
                message: 'Room name is required for public and group rooms'
            });
        }

        // ── STEP 4 — validate room_type value ──
        // only allow the 3 values we defined in our ENUM
        const allowedTypes = ['direct', 'group', 'public'];
        
        // .includes() checks if a value exists in an array
        // ['a','b','c'].includes('b') → true
        // ['a','b','c'].includes('z') → false
        if (!allowedTypes.includes(type)) {
            return res.status(400).json({
                message: 'room_type must be direct, group or public'
            });
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
        console.error('Create room error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};



// ─────────────────────────────────────────────
// GET ALL PUBLIC ROOMS
// GET /api/rooms
// ─────────────────────────────────────────────
const getRooms = async (req, res) => {
    try {

        // ── STEP 1 — handle optional search query ──
        // The frontend can send ?search=general to filter rooms
        // req.query contains everything after the ? in the URL
        // Example: GET /api/rooms?search=general
        //          req.query = { search: 'general' }
        const { search } = req.query;

        // ── STEP 2 — build the query ──
        // We use a JOIN to get member counts alongside room data
        // We also check if the current user has already joined each room
        const query = `
            SELECT 
                r.id,
                r.name,
                r.description,
                r.room_type,
                r.icon_url,
                r.created_by,
                r.created_at,

                -- COUNT how many members are in each room
                -- COUNT(*) would include NULL rows from LEFT JOIN
                -- COUNT(rm.id) only counts actual matches
                COUNT(rm.id) AS member_count,

                -- Check if the logged in user already joined this room
                -- MAX() is a trick here — it returns 1 if any row matches, NULL if none
                -- We then convert to a boolean with a CASE statement
                MAX(CASE WHEN rm.user_id = ? THEN 1 ELSE 0 END) AS is_joined

            FROM rooms r

            -- LEFT JOIN means: include rooms even if they have 0 members
            LEFT JOIN room_members rm ON r.id = rm.room_id

            -- Only show public rooms
            -- AND only rooms not soft-deleted
            WHERE r.room_type = 'public'
              AND r.deleted_at IS NULL

            -- If search param was sent, filter by name
            -- LIKE '%general%' matches any name containing "general"
            -- The ? will be replaced with the search value
            ${search ? 'AND r.name LIKE ?' : ''}

            -- Group by room so COUNT works correctly
            -- Without GROUP BY, COUNT would count ALL rows as one
            GROUP BY r.id

            -- Newest rooms first
            ORDER BY r.created_at DESC
        `;

        // ── STEP 3 — build the values array ──
        // First ? is for the is_joined check (req.user.id)
        // Second ? is for the search filter (only if search exists)
        const values = search
            ? [req.user.id, `%${search}%`]
            : [req.user.id];
        // The % signs are SQL wildcards — like * in regular search
        // '%general%' → matches "General Chat", "general talk", "mygeneral"
        // 'general%'  → only matches things STARTING with "general"
        // '%general'  → only matches things ENDING with "general"

        // ── STEP 4 — run the query ──
        const [rooms] = await db.query(query, values);

        // ── STEP 5 — send response ──
        res.status(200).json({
            message: 'Rooms fetched successfully',
            count: rooms.length,  // how many rooms total
            rooms
        });

    } catch (error) {
        console.error('Get rooms error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// ─────────────────────────────────────────────
// JOIN A ROOM
// POST /api/rooms/:roomId/join
// ─────────────────────────────────────────────
const joinRoom = async (req, res) => {
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
            return res.status(400).json({
                message: 'Invalid room ID'
            });
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
            return res.status(404).json({
                message: 'Room not found'
            });
        }
        // 404 = Not Found — the correct status when a resource doesn't exist

        const room = rooms[0];

        // ── STEP 4 — prevent joining a DM room manually ──
        // DM rooms are private between two specific users
        // No one should be able to manually join one
        if (room.room_type === 'direct') {
            return res.status(403).json({
                message: 'You cannot manually join a direct message room'
            });
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
            return res.status(409).json({
                message: 'You are already a member of this room'
            });
        }

        console.error('Join room error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};



// ─────────────────────────────────────────────
// GET ROOM MEMBERS
// GET /api/rooms/:roomId/members
// ─────────────────────────────────────────────
const getRoomMembers = async (req, res) => {
    try {

        // ── STEP 1 — get and validate roomId ──
        const roomId = Number(req.params.roomId);

        if (!roomId || isNaN(roomId)) {
            return res.status(400).json({
                message: 'Invalid room ID'
            });
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
            return res.status(404).json({
                message: 'Room not found'
            });
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
            return res.status(403).json({
                message: 'You are not a member of this room'
            });
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
        console.error('Get members error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// ─────────────────────────────────────────────
// DELETE A ROOM (soft delete)
// DELETE /api/rooms/:roomId
// ─────────────────────────────────────────────
const deleteRoom = async (req, res) => {
    try {

        // ── STEP 1 — get and validate roomId ──
        const roomId = Number(req.params.roomId);

        if (!roomId || isNaN(roomId)) {
            return res.status(400).json({
                message: 'Invalid room ID'
            });
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
            return res.status(404).json({
                message: 'Room not found'
            });
        }

        const room = rooms[0];

        // ── STEP 3 — ownership check ──
        // This is authorization — not just "are you logged in"
        // but "are you specifically the person who owns this"
        // req.user.id comes from the JWT token (verified by middleware)
        // room.created_by comes from the database
        // If they don't match — this user doesn't own this room
        if (room.created_by !== req.user.id) {
            return res.status(403).json({
                message: 'Only the room creator can delete this room'
            });
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
        console.error('Delete room error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

module.exports = { createRoom , getRooms, joinRoom, getRoomMembers, deleteRoom};