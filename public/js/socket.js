// ============================================
// SOCKET.JS — every Socket.io event lives here
// rooms.js and messages.js never touch socket directly,
// they call Socket.xxx() methods
// ============================================

const Socket = {
  io: null,

  // ── CONNECT ──
  connect(token) {
    this.io = io(CONFIG.SOCKET_URL, {
      auth: { token },
    });

    this.io.on('connect', () => {
      console.log('Socket connected:', this.io.id);
    });

    this.io.on('connect_error', (err) => {
      console.error('Socket connection error:', err.message);
      showToast('Real-time connection failed', 'error');
    });

    // ── incoming messages ──
    this.io.on('newMessage', (message) => {
      Messages.handleIncoming(message);
    });

    // ── typing indicators ──
    this.io.on('userTyping', (data) => {
      Messages.showTyping(data);
    });

    this.io.on('userStopTyping', (data) => {
      Messages.hideTyping(data);
    });

    // ── presence ──
    this.io.on('userOnline', (data) => {
      showToast(`${data.full_name} is online`, 'success');
    });

    this.io.on('userOffline', (data) => {
      // quiet — no toast spam for offline events
    });

    // ── server-side errors ──
    this.io.on('error', (data) => {
      showToast(data.message, 'error');
    });
  },

  disconnect() {
    if (this.io) this.io.disconnect();
  },

  // ── ROOM CHANNELS ──
  joinRoom(roomId) {
    if (!this.io) return;
    this.io.emit('joinRoom', roomId);
  },

  leaveRoom(roomId) {
    if (!this.io) return;
    this.io.emit('leaveRoom', roomId);
  },

  // ── SEND MESSAGE ──
  sendMessage({ roomId, content, message_type = 'text', reply_to_id = null }) {
    if (!this.io) return;
    this.io.emit('sendMessage', { roomId, content, message_type, reply_to_id });
  },

  // ── TYPING ──
  typing(roomId) {
    if (!this.io) return;
    this.io.emit('typing', roomId);
  },

  stopTyping(roomId) {
    if (!this.io) return;
    this.io.emit('stopTyping', roomId);
  },
};