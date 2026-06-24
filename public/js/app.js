// ============================================
// APP.JS — main application entry point
// ============================================

// ── GLOBAL STATE ──
const State = {
  token: localStorage.getItem('token'),
  user: JSON.parse(localStorage.getItem('user') || 'null'),
  rooms: [],
  activeRoomId: null,
  replyTo: null
};

// ── REDIRECT TO LOGIN IF NOT AUTHENTICATED ──
if (!State.token || !State.user) {
  window.location.href = '/index.html';
}

// ── INITIALIZE APPLICATION ──
document.addEventListener('DOMContentLoaded', () => {
  // Connect socket and load rooms on start
  if (State.token && State.user) {
    Socket.connect(State.token);
    Rooms.loadAll();
    
    // Update user info in sidebar
    const myName = document.getElementById('my-name');
    if (myName) {
      myName.textContent = State.user.full_name;
    }
    
    const myAvatar = document.getElementById('my-avatar');
    if (myAvatar) {
      myAvatar.innerHTML = `${getInitials(State.user.full_name)}<span class="online-dot"></span>`;
    }
  }

  // ── EVENT LISTENERS ──

  // Logout buttons
  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    Socket.disconnect();
    window.location.href = '/index.html';
  };

  document.getElementById('logout-btn')?.addEventListener('click', handleLogout);
  document.getElementById('logout-icon-btn')?.addEventListener('click', handleLogout);

  // Create room modal triggers
  const createRoomModal = document.getElementById('create-room-modal');
  const newRoomBtn = document.getElementById('new-room-btn');
  const cancelCreateRoomBtn = document.getElementById('cancel-create-room');
  const confirmCreateRoomBtn = document.getElementById('confirm-create-room');

  newRoomBtn?.addEventListener('click', () => {
    createRoomModal?.classList.add('show');
    document.getElementById('new-room-name').value = '';
    document.getElementById('new-room-desc').value = '';
    document.getElementById('new-room-type').value = 'public';
    document.getElementById('create-room-banner').classList.remove('show');
  });

  const closeCreateRoomModal = () => {
    createRoomModal?.classList.remove('show');
  };

  cancelCreateRoomBtn?.addEventListener('click', closeCreateRoomModal);

  confirmCreateRoomBtn?.addEventListener('click', async () => {
    const name = document.getElementById('new-room-name').value.trim();
    const description = document.getElementById('new-room-desc').value.trim();
    const room_type = document.getElementById('new-room-type').value;

    if (!name) {
      const errorMsg = document.getElementById('new-room-name-msg');
      if (errorMsg) {
        errorMsg.textContent = 'Room name is required';
        errorMsg.classList.add('show');
      }
      return;
    }

    const spinner = confirmCreateRoomBtn.querySelector('.btn-spinner');
    const label = confirmCreateRoomBtn.querySelector('.btn-label');
    
    if (spinner) spinner.style.display = 'block';
    if (label) label.style.display = 'none';
    confirmCreateRoomBtn.disabled = true;

    try {
      await Rooms.create({ name, description, room_type });
      closeCreateRoomModal();
    } catch (err) {
      const banner = document.getElementById('create-room-banner');
      if (banner) {
        banner.textContent = err.message || 'Failed to create room';
        banner.classList.add('show');
      }
    } finally {
      if (spinner) spinner.style.display = 'none';
      if (label) label.style.display = 'inline';
      confirmCreateRoomBtn.disabled = false;
    }
  });

  // Members modal triggers
  document.getElementById('members-btn')?.addEventListener('click', () => {
    if (State.activeRoomId) {
      Rooms.openMembersModal(State.activeRoomId);
    }
  });

  document.getElementById('close-members-modal')?.addEventListener('click', () => {
    document.getElementById('members-modal')?.classList.remove('show');
  });

  // Join requests modal triggers
  document.getElementById('join-requests-btn')?.addEventListener('click', () => {
    if (State.activeRoomId) {
      Rooms.openJoinRequestsModal(State.activeRoomId);
    }
  });

  document.getElementById('close-requests-modal')?.addEventListener('click', () => {
    document.getElementById('requests-modal')?.classList.remove('show');
  });

  // Leave room trigger
  document.getElementById('leave-room-btn')?.addEventListener('click', () => {
    Rooms.leaveActiveRoom();
  });
  
  // Mobile responsive sidebar menu trigger
  const mobileMenuBtn = document.getElementById('mobile-menu-btn');
  const sidebar = document.getElementById('sidebar');
  if (mobileMenuBtn && sidebar) {
    mobileMenuBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      sidebar.classList.toggle('open');
    });
    
    document.addEventListener('click', (e) => {
      if (!sidebar.contains(e.target) && !mobileMenuBtn.contains(e.target)) {
        sidebar.classList.remove('open');
      }
    });
  }
});

// ── GLOBAL HELPER FUNCTIONS ──

// get user initials for avatar
function getInitials(name) {
  if (!name) return '--';
  return name
    .split(' ')
    .map(word => word.charAt(0))
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

// show toast notification
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;

  container.appendChild(toast);

  // Remove toast after 3 seconds
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 0.25s ease';
    setTimeout(() => {
      toast.remove();
    }, 250);
  }, 3000);
}