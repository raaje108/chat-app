// ============================================
// ROOMS.JS — sidebar room list, creating rooms,
// joining rooms, and the members modal
// ============================================

const Rooms = {

  // ── LOAD ALL ROOMS ──
  async loadAll(search = '') {
    try {
      const data   = await Api.rooms.list(search);
      State.rooms  = data.rooms;
      this.render();
    } catch (err) {
      showToast('Could not load rooms', 'error');
    }
  },

  // ── RENDER THE ROOM LIST IN SIDEBAR ──
  render() {
    const container = document.getElementById('rooms-list');

    if (State.rooms.length === 0) {
      container.innerHTML = `
        <div style="padding:24px 12px; text-align:center;">
          <div style="font-size:13px; color:var(--text-2); margin-bottom:4px;">No rooms yet</div>
          <div style="font-size:12px; color:var(--text-3);">Create one to get started</div>
        </div>`;
      return;
    }

    container.innerHTML = State.rooms.map(room => this.roomItemHtml(room)).join('');

    // attach click handlers after rendering
    container.querySelectorAll('.room-item').forEach(el => {
      el.addEventListener('click', () => this.openRoom(Number(el.dataset.roomId)));
    });
  },

  roomItemHtml(room) {
    const isActive = room.id === State.activeRoomId;
    return `
      <div class="room-item ${isActive ? 'active' : ''}" data-room-id="${room.id}">
        <span class="room-hash">#</span>
        <div class="room-info">
          <div class="room-name">${escapeHtml(room.name || 'Direct message')}</div>
          <div class="room-meta">${room.member_count} member${room.member_count === 1 ? '' : 's'}</div>
        </div>
      </div>`;
  },

  // ── OPEN A ROOM ──
  async openRoom(roomId) {
    const room = State.rooms.find(r => r.id === roomId);
    if (!room) return;

    // if the user hasn't joined yet — join first
    if (!room.is_joined) {
      try {
        await Api.rooms.join(roomId);
        room.is_joined = true;
        room.member_count += 1;
      } catch (err) {
        if (err.status !== 409) { // 409 = already a member, safe to ignore
          showToast(err.message || 'Could not join room', 'error');
          return;
        }
      }
    }

    // leave the socket channel of the previous room
    if (State.activeRoomId) {
      Socket.leaveRoom(State.activeRoomId);
    }

    State.activeRoomId = roomId;
    State.replyTo       = null;

    // join the new socket channel
    Socket.joinRoom(roomId);

    // update sidebar highlighting
    this.render();

    // show the chat area, hide empty state
    document.getElementById('no-room-state').classList.add('hidden');
    const activeRoom = document.getElementById('active-room');
    activeRoom.classList.remove('hidden');
    activeRoom.style.display = 'flex';

    // update header
    document.getElementById('active-room-name').textContent = room.name || 'Direct message';
    document.getElementById('active-room-meta').textContent =
      `${room.member_count} member${room.member_count === 1 ? '' : 's'}`;

    // load message history for this room
    Messages.loadHistory(roomId);
  },

  // ── CREATE A ROOM ──
  async create({ name, description, room_type }) {
    const data = await Api.rooms.create({ name, description, room_type });

    // add to local state immediately — optimistic update
    State.rooms.unshift({
      ...data.room,
      member_count: 1,
      is_joined:    1,
    });

    this.render();

    // open it right away
    this.openRoom(data.room.id);
  },

  // ── MEMBERS MODAL ──
  async openMembersModal(roomId) {
    if (!roomId) return;

    const modal = document.getElementById('members-modal');
    const list  = document.getElementById('members-list');
    const sub   = document.getElementById('members-modal-sub');

    list.innerHTML = `<div class="skeleton" style="height:40px;border-radius:8px;"></div>`;
    modal.classList.add('show');

    try {
      const data = await Api.rooms.members(roomId);
      sub.textContent = `${data.count} member${data.count === 1 ? '' : 's'} in ${data.room}`;

      list.innerHTML = data.members.map(m => `
        <div style="display:flex; align-items:center; gap:12px; padding:8px; border-radius:8px;">
          <div class="avatar" style="position:relative;">
            ${getInitials(m.full_name)}
            ${m.is_online ? '<span class="online-dot"></span>' : ''}
          </div>
          <div style="flex:1; min-width:0;">
            <div style="font-size:13px; font-weight:500;">${escapeHtml(m.full_name)}</div>
            <div style="font-size:11px; color:var(--text-3);">
              ${m.role === 'admin' ? '👑 Admin' : m.role === 'moderator' ? 'Moderator' : 'Member'}
            </div>
          </div>
        </div>
      `).join('');

    } catch (err) {
      list.innerHTML = `<div style="color:var(--text-2); font-size:13px; padding:12px;">Could not load members</div>`;
    }
  },

  // ── LEAVE / DELETE ACTIVE ROOM ──
  async leaveActiveRoom() {
    const roomId = State.activeRoomId;
    if (!roomId) return;

    const room = State.rooms.find(r => r.id === roomId);
    if (!room) return;

    const isOwner = room.created_by === State.user.id;

    if (isOwner) {
      if (!confirm(`Delete "${room.name}"? This cannot be undone.`)) return;
      try {
        await Api.rooms.remove(roomId);
        State.rooms = State.rooms.filter(r => r.id !== roomId);
        showToast('Room deleted', 'success');
      } catch (err) {
        showToast(err.message || 'Could not delete room', 'error');
        return;
      }
    } else {
      // non-owners just stop viewing it locally
      // (a real "leave" endpoint would go here if built)
      showToast('Left room', 'success');
    }

    Socket.leaveRoom(roomId);
    State.activeRoomId = null;

    document.getElementById('active-room').classList.add('hidden');
    document.getElementById('active-room').style.display = 'none';
    document.getElementById('no-room-state').classList.remove('hidden');

    this.render();
  },

  // ── UPDATE A ROOM'S MEMBER COUNT LOCALLY (used by socket events) ──
  bumpMemberCount(roomId, delta) {
    const room = State.rooms.find(r => r.id === roomId);
    if (room) {
      room.member_count += delta;
      this.render();
    }
  },
};

// ── SEARCH ──
let searchDebounce = null;
document.getElementById('room-search').addEventListener('input', (e) => {
  clearTimeout(searchDebounce);
  searchDebounce = setTimeout(() => {
    Rooms.loadAll(e.target.value.trim());
  }, 300);
});

// ── REFRESH BUTTON ──
document.getElementById('refresh-rooms-btn').addEventListener('click', () => {
  Rooms.loadAll();
});

// ── HTML ESCAPE HELPER ──
// prevents XSS — never trust room names / messages to be safe HTML
function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}