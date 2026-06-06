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

        if (type !== 'direct' && !name) {
            return res.status(400).json({
                message: 'Room name is required for group and public rooms'
            });
        }

        // ── STEP 4 — validate room_type value ──
        // only allow the 3 values we defined in our ENUM
        const allowedTypes = ['direct', 'group', 'public'];
        if (!allowedTypes.includes(type)) {
            return res.status(400).json({
                message: `room_type must be one of: ${allowedTypes.join(', ')}`
            });
        }
        // .includes() checks if a value exists in an array
        // ['a','b','c'].includes('b') → true
        // ['a','b','c'].includes('z') → false

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
module.exports = { createRoom , getRooms, joinRoom};