// ============================================
// MESSAGES.JS — message history, rendering,
// sending, typing indicator, reactions, replies
// ============================================

const COMMON_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🙏', '🔥', '🎉'];

const Messages = {
  list:        [],   // messages currently loaded for the active room
  nextCursor:  null,
  hasMore:     false,
  typingUsers: {},   // { userId: username } for the active room
  typingTimer: null,
  isTyping:    false,

  // ── LOAD MESSAGE HISTORY ──
  async loadHistory(roomId) {
    const area = document.getElementById('messages-area');
    area.innerHTML = `<div class="skeleton" style="height:40px;border-radius:8px;margin-bottom:8px;"></div>
                       <div class="skeleton" style="height:40px;border-radius:8px;margin-bottom:8px;width:70%;"></div>`;

    this.list        = [];
    this.nextCursor   = null;
    this.typingUsers  = {};

    try {
      const data = await Api.messages.list(roomId);
      this.list       = data.messages;
      this.hasMore     = data.hasMore;
      this.nextCursor  = data.nextCursor;
      this.render();
    } catch (err) {
      area.innerHTML = `<div class="empty-state">
        <div class="empty-icon">⚠️</div>
        <div class="empty-title">Could not load messages</div>
      </div>`;
    }
  },

  // ── LOAD OLDER MESSAGES (scroll up / load more button) ──
  async loadMore() {
    if (!this.hasMore || !State.activeRoomId) return;

    try {
      const data = await Api.messages.list(State.activeRoomId, this.nextCursor);
      this.list      = [...data.messages, ...this.list];
      this.hasMore    = data.hasMore;
      this.nextCursor = data.nextCursor;
      this.render(true); // true = preserve scroll position
    } catch (err) {
      showToast('Could not load older messages', 'error');
    }
  },

  // ── RENDER ALL MESSAGES ──
  render(preserveScroll = false) {
    const area = document.getElementById('messages-area');
    const prevHeight = area.scrollHeight;

    if (this.list.length === 0) {
      area.innerHTML = `<div class="empty-state">
        <div class="empty-icon">👋</div>
        <div class="empty-title">No messages yet</div>
        <div class="empty-sub">Be the first to say something</div>
      </div>`;
      return;
    }

    let html = '';

    if (this.hasMore) {
      html += `<button class="load-more-btn" id="load-more-btn">Load earlier messages</button>`;
    }

    let lastDate = null;

    this.list.forEach(msg => {
      const msgDate = new Date(msg.created_at).toDateString();
      if (msgDate !== lastDate) {
        html += `<div class="date-sep">${formatDateSeparator(msg.created_at)}</div>`;
        lastDate = msgDate;
      }
      html += this.messageHtml(msg);
    });

    area.innerHTML = html;

    // re-attach load more handler
    const loadMoreBtn = document.getElementById('load-more-btn');
    if (loadMoreBtn) loadMoreBtn.addEventListener('click', () => this.loadMore());

    // attach reaction + reply handlers
    this.attachMessageHandlers();

    if (preserveScroll) {
      // keep the user's view stable when older messages are prepended
      area.scrollTop = area.scrollHeight - prevHeight;
    } else {
      area.scrollTop = area.scrollHeight;
    }
  },

  // ── SINGLE MESSAGE HTML ──
  messageHtml(msg) {
    if (msg.message_type === 'system') {
      return `<div class="msg-system">${escapeHtml(msg.content)}</div>`;
    }

    const isMine    = msg.sender_id === State.user.id;
    const initials  = getInitials(msg.sender_name);
    const reactions = msg.reactions || [];

    const replyHtml = msg.reply_to_id ? `
      <div class="msg-reply">
        <div>
          <div class="msg-reply-sender">${escapeHtml(msg.reply_sender_name || 'Unknown')}</div>
          <div class="msg-reply-content">${escapeHtml(msg.reply_content || 'Message unavailable')}</div>
        </div>
      </div>` : '';

    const contentHtml = msg.is_deleted
      ? `<div class="msg-content deleted">This message was deleted</div>`
      : `<div class="msg-content">${escapeHtml(msg.content)}</div>`;

    const reactionsHtml = reactions.length > 0 ? `
      <div class="msg-reactions">
        ${reactions.map(r => `
          <button class="reaction-pill ${r.reacted_by_me ? 'reacted' : ''}"
                  data-message-id="${msg.id}" data-emoji="${r.emoji}">
            ${r.emoji} <span class="reaction-count">${r.count}</span>
          </button>
        `).join('')}
      </div>` : '';

    return `
      <div class="msg-group" data-message-id="${msg.id}">
        <div class="msg-avatar">
          <div class="avatar">${initials}</div>
        </div>
        <div class="msg-body">
          <div class="msg-header">
            <span class="msg-sender">${escapeHtml(msg.sender_name)}</span>
            <span class="msg-time">${formatTime(msg.created_at)}</span>
          </div>
          ${replyHtml}
          ${contentHtml}
          ${reactionsHtml}
          <div class="msg-actions">
            <button class="msg-action-btn react-trigger" data-message-id="${msg.id}">React</button>
            <button class="msg-action-btn reply-trigger" data-message-id="${msg.id}">Reply</button>
          </div>
        </div>
      </div>`;
  },

  // ── ATTACH CLICK HANDLERS AFTER RENDER ──
  attachMessageHandlers() {
    // existing reaction pills — toggle reaction
    document.querySelectorAll('.reaction-pill').forEach(btn => {
      btn.addEventListener('click', () => {
        const messageId = Number(btn.dataset.messageId);
        const emoji      = btn.dataset.emoji;
        this.toggleReaction(messageId, emoji, btn.classList.contains('reacted'));
      });
    });

    // "React" button — open quick emoji picker
    document.querySelectorAll('.react-trigger').forEach(btn => {
      btn.addEventListener('click', (e) => this.openQuickReact(e, Number(btn.dataset.messageId)));
    });

    // "Reply" button
    document.querySelectorAll('.reply-trigger').forEach(btn => {
      btn.addEventListener('click', () => this.startReply(Number(btn.dataset.messageId)));
    });
  },

  // ── QUICK REACT POPUP ──
  openQuickReact(event, messageId) {
    // remove any existing popup
    document.querySelectorAll('.quick-react-popup').forEach(el => el.remove());

    const popup = document.createElement('div');
    popup.className = 'emoji-picker show quick-react-popup';
    popup.style.position = 'fixed';
    popup.style.bottom = 'auto';
    popup.style.left = `${event.clientX - 100}px`;
    popup.style.top = `${event.clientY + 10}px`;

    popup.innerHTML = COMMON_EMOJIS.map(emoji =>
      `<button class="emoji-btn" data-emoji="${emoji}">${emoji}</button>`
    ).join('');

    document.body.appendChild(popup);

    popup.querySelectorAll('.emoji-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this.toggleReaction(messageId, btn.dataset.emoji, false);
        popup.remove();
      });
    });

    // close when clicking elsewhere
    setTimeout(() => {
      document.addEventListener('click', function closePopup(e) {
        if (!popup.contains(e.target)) {
          popup.remove();
          document.removeEventListener('click', closePopup);
        }
      });
    }, 0);
  },

  // ── TOGGLE A REACTION ──
  async toggleReaction(messageId, emoji, alreadyReacted) {
    try {
      if (alreadyReacted) {
        await Api.reactions.remove(messageId, emoji);
      } else {
        await Api.reactions.add(messageId, emoji);
      }

      // refresh reactions for this message
      const data = await Api.reactions.list(messageId);
      const msg  = this.list.find(m => m.id === messageId);
      if (msg) {
        msg.reactions = data.reactions;
        this.render(true);
      }
    } catch (err) {
      if (err.status !== 409 && err.status !== 404) {
        showToast(err.message || 'Could not update reaction', 'error');
      }
    }
  },

  // ── REPLY FLOW ──
  startReply(messageId) {
    const msg = this.list.find(m => m.id === messageId);
    if (!msg) return;

    State.replyTo = msg;

    const banner = document.getElementById('reply-banner');
    document.getElementById('reply-banner-text').textContent =
      `Replying to ${msg.sender_name}: ${msg.content.slice(0, 60)}`;
    banner.classList.add('show');

    document.getElementById('msg-input').focus();
  },

  cancelReply() {
    State.replyTo = null;
    document.getElementById('reply-banner').classList.remove('show');
  },

  // ── SEND MESSAGE ──
  send() {
    const input   = document.getElementById('msg-input');
    const content = input.value.trim();
    if (!content || !State.activeRoomId) return;

    Socket.sendMessage({
      roomId:      State.activeRoomId,
      content,
      message_type: 'text',
      reply_to_id:  State.replyTo ? State.replyTo.id : null,
    });

    input.value = '';
    autoResizeInput(input);
    updateSendButton();

    this.cancelReply();
    this.stopTypingNow();
  },

  // ── RECEIVE A NEW MESSAGE (from socket) ──
  handleIncoming(message) {
    // only render if it belongs to the room currently open
    if (message.room_id !== State.activeRoomId) {
      // notify if it's a different room
      const room = State.rooms.find(r => r.id === message.room_id);
      if (room) showToast(`New message in ${room.name}`, 'success');
      return;
    }

    message.reactions = message.reactions || [];
    this.list.push(message);

    // clear typing indicator for the sender — they just sent a message
    delete this.typingUsers[message.sender_id];
    this.renderTyping();

    this.render();
  },

  // ── TYPING INDICATOR — OUTGOING ──
  notifyTyping() {
    if (!State.activeRoomId) return;

    if (!this.isTyping) {
      this.isTyping = true;
      Socket.typing(State.activeRoomId);
    }

    clearTimeout(this.typingTimer);
    this.typingTimer = setTimeout(() => this.stopTypingNow(), 2000);
  },

  stopTypingNow() {
    if (!State.activeRoomId) return;
    clearTimeout(this.typingTimer);
    this.isTyping = false;
    Socket.stopTyping(State.activeRoomId);
  },

  // ── TYPING INDICATOR — INCOMING ──
  showTyping(data) {
    if (data.roomId !== State.activeRoomId) return;
    this.typingUsers[data.userId] = data.username;
    this.renderTyping();
  },

  hideTyping(data) {
    if (data.roomId !== State.activeRoomId) return;
    delete this.typingUsers[data.userId];
    this.renderTyping();
  },

  renderTyping() {
    const bar   = document.getElementById('typing-bar');
    const names = Object.values(this.typingUsers);

    if (names.length === 0) {
      bar.textContent = '';
    } else if (names.length === 1) {
      bar.textContent = `${names[0]} is typing…`;
    } else {
      bar.textContent = `${names.length} people are typing…`;
    }
  },
};

// ── DATE / TIME FORMATTING ──
function formatTime(isoString) {
  const d = new Date(isoString);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatDateSeparator(isoString) {
  const d     = new Date(isoString);
  const today = new Date();
  const yest  = new Date();
  yest.setDate(today.getDate() - 1);

  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yest.toDateString())   return 'Yesterday';

  return d.toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' });
}

// ── INPUT HANDLING ──
const msgInput = document.getElementById('msg-input');
const sendBtn  = document.getElementById('send-btn');

msgInput.addEventListener('input', () => {
  autoResizeInput(msgInput);
  updateSendButton();
  Messages.notifyTyping();
});

msgInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    Messages.send();
  }
});

sendBtn.addEventListener('click', () => Messages.send());

document.getElementById('reply-cancel-btn').addEventListener('click', () => Messages.cancelReply());

function autoResizeInput(el) {
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 120) + 'px';
}

function updateSendButton() {
  sendBtn.disabled = msgInput.value.trim().length === 0;
}

// ── COMPOSE EMOJI PICKER (the 😊 button in input footer) ──
const composeEmojiPicker = document.getElementById('compose-emoji-picker');
composeEmojiPicker.innerHTML = COMMON_EMOJIS.map(emoji =>
  `<button class="emoji-btn" data-emoji="${emoji}">${emoji}</button>`
).join('');

document.getElementById('emoji-trigger-btn').addEventListener('click', (e) => {
  e.stopPropagation();
  composeEmojiPicker.classList.toggle('show');
});

composeEmojiPicker.querySelectorAll('.emoji-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    msgInput.value += btn.dataset.emoji;
    autoResizeInput(msgInput);
    updateSendButton();
    composeEmojiPicker.classList.remove('show');
    msgInput.focus();
  });
});

document.addEventListener('click', (e) => {
  if (!composeEmojiPicker.contains(e.target) && e.target.id !== 'emoji-trigger-btn') {
    composeEmojiPicker.classList.remove('show');
  }
});

// ── AUTO-LOAD MORE WHEN SCROLLED TO TOP ──
document.getElementById('messages-area').addEventListener('scroll', (e) => {
  if (e.target.scrollTop === 0 && Messages.hasMore) {
    Messages.loadMore();
  }
});