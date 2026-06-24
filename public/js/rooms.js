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
  // Split into two sections:
  // "Your Rooms"  → rooms you've already joined
  // "Discover"    → rooms you haven't joined yet (public = instant join, group = request)
  render() {
    const container = document.getElementById('rooms-list');

    const joined    = State.rooms.filter(r => r.is_joined);
    const discoverable = State.rooms.filter(r => !r.is_joined);

    if (State.rooms.length === 0) {
      container.innerHTML = `
        <div style="padding:24px 12px; text-align:center;">
          <div style="font-size:13px; color:var(--text-2); margin-bottom:4px;">No rooms yet</div>
          <div style="font-size:12px; color:var(--text-3);">Create one to get started</div>
        </div>`;
      return;
    }

    let html = '';

    // ── YOUR ROOMS section ──
    html += `<div class="rooms-section-label">Your Rooms</div>`;
    if (joined.length === 0) {
      html += `<div class="rooms-empty-hint">You haven't joined any rooms yet</div>`;
    } else {
      html += joined.map(room => this.roomItemHtml(room)).join('');
    }

    // ── DISCOVER section ──
    html += `<div class="rooms-section-label">Discover</div>`;
    if (discoverable.length === 0) {
      html += `<div class="rooms-empty-hint">No new rooms to discover</div>`;
    } else {
      html += discoverable.map(room => this.roomItemHtml(room)).join('');
    }

    container.innerHTML = html;

    // attach click handlers after rendering
    // public/joined rooms → open directly
    // group rooms not yet joined → trigger join-request flow instead
    container.querySelectorAll('.room-item').forEach(el => {
      el.addEventListener('click', () => {
        const roomId = Number(el.dataset.roomId);
        const room   = State.rooms.find(r => r.id === roomId);
        if (!room) return;

        if (!room.is_joined && room.room_type === 'group') {
          this.handleGroupRoomClick(room);
        } else {
          this.openRoom(roomId);
        }
      });
    });
  },

  roomItemHtml(room) {
    const isActive   = room.id === State.activeRoomId;
    const isLocked   = !room.is_joined && room.room_type === 'group';
    const hasPending  = room.request_status === 'pending';

    // lock icon for group rooms you haven't joined
    // hourglass if you already have a pending request
    const icon = isLocked
      ? (hasPending ? '⏳' : '🔒')
      : '#';

    return `
      <div class="room-item ${isActive ? 'active' : ''} ${isLocked ? 'locked' : ''}" data-room-id="${room.id}">
        <span class="room-hash">${icon}</span>
        <div class="room-info">
          <div class="room-name">${escapeHtml(room.name || 'Direct message')}</div>
          <div class="room-meta">
            ${room.member_count} member${room.member_count === 1 ? '' : 's'}
            ${hasPending ? ' · Request pending' : ''}
          </div>
        </div>
      </div>`;
  },

  // ── HANDLE CLICKING A GROUP ROOM YOU HAVEN'T JOINED ──
  async handleGroupRoomClick(room) {
    if (room.request_status === 'pending') {
      showToast('Your request is still pending approval', 'success');
      return;
    }

    if (!confirm(`"${room.name}" requires admin approval to join. Send a join request?`)) {
      return;
    }

    try {
      await Api.rooms.requestToJoin(room.id);
      room.request_status = 'pending';
      this.render();
      showToast(`Join request sent for "${room.name}"`, 'success');
    } catch (err) {
      showToast(err.message || 'Could not send join request', 'error');
    }
  },

  // ── OPEN A ROOM ──
  async openRoom(roomId) {
    const room = State.rooms.find(r => r.id === roomId);
    if (!room) return;

    // if not joined yet — only public rooms can be auto-joined
    // group rooms must go through handleGroupRoomClick() instead
    if (!room.is_joined) {
      if (room.room_type === 'group') {
        // safety net — shouldn't normally reach here since the
        // click handler routes group rooms to handleGroupRoomClick()
        this.handleGroupRoomClick(room);
        return;
      }

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

    // Manage Join Requests button visibility for admins
    const requestsBtn = document.getElementById('join-requests-btn');
    if (requestsBtn) {
      const isOwner = room.created_by === State.user.id;
      if (isOwner && room.room_type === 'group') {
        requestsBtn.classList.remove('hidden');
        this.updateRequestsBadge(roomId);
      } else {
        requestsBtn.classList.add('hidden');
      }
    }

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

    const room = State.rooms.find(r => r.id === roomId);

    try {
      const data = await Api.rooms.members(roomId);
      sub.textContent = `${data.count} member${data.count === 1 ? '' : 's'} in ${data.room}`;

      // find the current user's role in this room
      const me     = data.members.find(m => m.user_id === State.user.id);
      const isAdmin = me && me.role === 'admin';

      let html = data.members.map(m => `
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

      list.innerHTML = html;

      // ── if admin of a group room — show pending join requests below ──
      if (isAdmin && room && room.room_type === 'group') {
        await this.renderJoinRequestsSection(roomId, list);
      }

    } catch (err) {
      list.innerHTML = `<div style="color:var(--text-2); font-size:13px; padding:12px;">Could not load members</div>`;
    }
  },

  // ── RENDER PENDING JOIN REQUESTS (appended inside members modal, admins only) ──
  async renderJoinRequestsSection(roomId, listContainer) {
    try {
      const data = await Api.rooms.getJoinRequests(roomId);

      const section = document.createElement('div');
      section.style.marginTop = '16px';
      section.style.paddingTop = '16px';
      section.style.borderTop = '1px solid var(--border)';

      if (data.count === 0) {
        section.innerHTML = `
          <div style="font-size:11px; text-transform:uppercase; letter-spacing:0.6px; color:var(--text-3); margin-bottom:8px;">
            Join Requests
          </div>
          <div style="font-size:12px; color:var(--text-3);">No pending requests</div>`;
        listContainer.appendChild(section);
        return;
      }

      section.innerHTML = `
        <div style="font-size:11px; text-transform:uppercase; letter-spacing:0.6px; color:var(--text-3); margin-bottom:8px;">
          Join Requests (${data.count})
        </div>
        <div id="join-requests-list" style="display:flex; flex-direction:column; gap:8px;"></div>`;

      listContainer.appendChild(section);

      const reqList = section.querySelector('#join-requests-list');

      reqList.innerHTML = data.requests.map(r => `
        <div style="display:flex; align-items:center; gap:10px; padding:8px; background:var(--bg-3); border-radius:8px;" data-request-id="${r.id}">
          <div class="avatar">${getInitials(r.full_name)}</div>
          <div style="flex:1; min-width:0;">
            <div style="font-size:13px; font-weight:500;">${escapeHtml(r.full_name)}</div>
            <div style="font-size:11px; color:var(--text-3);">wants to join</div>
          </div>
          <button class="icon-btn approve-req-btn" data-request-id="${r.id}" title="Approve"
                  style="color:var(--green);">✓</button>
          <button class="icon-btn reject-req-btn" data-request-id="${r.id}" title="Reject"
                  style="color:var(--red);">✕</button>
        </div>
      `).join('');

      // attach approve/reject handlers
      reqList.querySelectorAll('.approve-req-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
          const requestId = Number(btn.dataset.requestId);
          try {
            await Api.rooms.approveJoinRequest(roomId, requestId);
            showToast('Request approved', 'success');
            this.openMembersModal(roomId); // refresh modal
            this.loadAll(); // refresh sidebar (member count changed)
          } catch (err) {
            showToast(err.message || 'Could not approve request', 'error');
          }
        });
      });

      reqList.querySelectorAll('.reject-req-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
          const requestId = Number(btn.dataset.requestId);
          try {
            await Api.rooms.rejectJoinRequest(roomId, requestId);
            showToast('Request rejected', 'success');
            this.openMembersModal(roomId); // refresh modal
          } catch (err) {
            showToast(err.message || 'Could not reject request', 'error');
          }
        });
      });

    } catch (err) {
      // silently skip if requests can't load — members list still works
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

  async updateRequestsBadge(roomId) {
    const badge = document.getElementById('join-requests-badge');
    if (!badge) return;
    try {
      const data = await Api.rooms.getJoinRequests(roomId);
      if (data.count > 0) {
        badge.textContent = data.count;
        badge.classList.remove('hidden');
      } else {
        badge.classList.add('hidden');
      }
    } catch (err) {
      badge.classList.add('hidden');
    }
  },
//thanks
  async openJoinRequestsModal(roomId) {
    if (!roomId) return;
    const modal = document.getElementById('requests-modal');
    const list  = document.getElementById('requests-list');
    const sub   = document.getElementById('requests-modal-sub');

    list.innerHTML = `<div class="skeleton" style="height:40px;border-radius:8px;"></div>`;
    modal.classList.add('show');

    try {
      const data = await Api.rooms.getJoinRequests(roomId);
      sub.textContent = `${data.count} pending request${data.count === 1 ? '' : 's'}`;

      if (data.requests.length === 0) {
        list.innerHTML = `<div style="padding:16px; text-align:center; color:var(--text-3); font-size:13px;">No pending join requests</div>`;
        return;
      }

      list.innerHTML = data.requests.map(req => `
        <div style="display:flex; align-items:center; justify-content:space-between; gap:12px; padding:10px; border-radius:8px; background:var(--bg-2); border: 1px solid var(--border-2);">
          <div style="display:flex; align-items:center; gap:12px; min-width:0; flex:1;">
            <div class="avatar">
              ${getInitials(req.full_name)}
            </div>
            <div style="min-width:0; flex:1;">
              <div style="font-size:13px; font-weight:500; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(req.full_name)}</div>
              <div style="font-size:11px; color:var(--text-3); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">@${escapeHtml(req.username || '')}</div>
            </div>
          </div>
          <div style="display:flex; gap:6px; flex-shrink:0;">
            <button class="btn btn-sm btn-success approve-req-btn" data-request-id="${req.id}">Approve</button>
            <button class="btn btn-sm btn-danger reject-req-btn" data-request-id="${req.id}">Reject</button>
          </div>
        </div>
      `).join('');

      list.querySelectorAll('.approve-req-btn').forEach(btn => {
        btn.addEventListener('click', () => this.resolveRequest(roomId, Number(btn.dataset.requestId), 'approve'));
      });
      list.querySelectorAll('.reject-req-btn').forEach(btn => {
        btn.addEventListener('click', () => this.resolveRequest(roomId, Number(btn.dataset.requestId), 'reject'));
      });
    } catch (err) {
      list.innerHTML = `<div style="color:var(--text-2); font-size:13px; padding:12px;">Could not load requests</div>`;
    }
  },

  async resolveRequest(roomId, requestId, action) {
    try {
      if (action === 'approve') {
        await Api.rooms.approveJoinRequest(roomId, requestId);
        showToast('Request approved', 'success');
        
        // Update member count in local state
        const room = State.rooms.find(r => r.id === roomId);
        if (room) {
          room.member_count += 1;
        }
      } else {
        await Api.rooms.rejectJoinRequest(roomId, requestId);
        showToast('Request rejected', 'success');
      }

      this.updateRequestsBadge(roomId);
      this.openJoinRequestsModal(roomId);
      this.loadAll(); // Redraw sidebar
    } catch (err) {
      showToast(err.message || `Failed to ${action} request`, 'error');
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