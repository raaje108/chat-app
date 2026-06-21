// ============================================
// API.JS — every HTTP call to the backend lives here
// Nothing else in the app touches fetch() directly
// ============================================

// ── low level request helper ──
// every API call goes through this — one place to attach the token,
// one place to handle JSON parsing, one place to handle network errors
async function apiRequest(path, options = {}) {
  const token = localStorage.getItem('token');

  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  // attach JWT token automatically if it exists
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  let res;
  try {
    res = await fetch(`${CONFIG.API_URL}${path}`, {
      ...options,
      headers,
    });
  } catch (err) {
    // network error — server is down or unreachable
    throw { networkError: true, message: 'Cannot reach server' };
  }

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    // attach status code so callers can branch on 401, 403, 429 etc.
    throw { status: res.status, ...data };
  }

  return data;
}

// ── AUTH ──
const Api = {
  auth: {
    register: (body) => apiRequest('/auth/register', {
      method: 'POST',
      body:   JSON.stringify(body),
    }),

    login: (body) => apiRequest('/auth/login', {
      method: 'POST',
      body:   JSON.stringify(body),
    }),

    me: () => apiRequest('/auth/me'),
  },

  // ── ROOMS ──
  rooms: {
    list: (search = '') => {
      const query = search ? `?search=${encodeURIComponent(search)}` : '';
      return apiRequest(`/rooms${query}`);
    },

    create: (body) => apiRequest('/rooms', {
      method: 'POST',
      body:   JSON.stringify(body),
    }),

    join: (roomId) => apiRequest(`/rooms/${roomId}/join`, {
      method: 'POST',
    }),

    members: (roomId) => apiRequest(`/rooms/${roomId}/members`),

    remove: (roomId) => apiRequest(`/rooms/${roomId}`, {
      method: 'DELETE',
    }),
  },

  // ── MESSAGES ──
  messages: {
    list: (roomId, before = null, limit = CONFIG.MSG_LIMIT) => {
      const params = new URLSearchParams({ limit });
      if (before) params.append('before', before);
      return apiRequest(`/rooms/${roomId}/messages?${params}`);
    },
  },

  // ── REACTIONS ──
  reactions: {
    add: (messageId, emoji) => apiRequest(`/messages/${messageId}/react`, {
      method: 'POST',
      body:   JSON.stringify({ emoji }),
    }),

    remove: (messageId, emoji) => apiRequest(`/messages/${messageId}/react`, {
      method: 'DELETE',
      body:   JSON.stringify({ emoji }),
    }),

    list: (messageId) => apiRequest(`/messages/${messageId}/reactions`),
  },
};