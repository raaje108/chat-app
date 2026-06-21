// ============================================
// AUTH.JS — logic for index.html (login/register page)
// ============================================

// ── redirect if already logged in ──
if (localStorage.getItem('token')) {
  window.location.href = '/chat.html';
}

// ── TAB SWITCHING ──
function switchTab(tab) {
  const isLogin = tab === 'login';

  document.getElementById('tab-login').classList.toggle('active', isLogin);
  document.getElementById('tab-register').classList.toggle('active', !isLogin);
  document.getElementById('panel-login').classList.toggle('active', isLogin);
  document.getElementById('panel-register').classList.toggle('active', !isLogin);

  clearAllErrors();
}

// ── PASSWORD VISIBILITY TOGGLE ──
function togglePw(inputId, btn) {
  const input = document.getElementById(inputId);
  const show  = input.type === 'password';
  input.type  = show ? 'text' : 'password';

  btn.innerHTML = show
    ? `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
         <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94"/>
         <path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19"/>
         <line x1="1" y1="1" x2="23" y2="23"/>
       </svg>`
    : `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
         <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
       </svg>`;
}

// ── PASSWORD STRENGTH METER ──
function checkStrength(value) {
  const bars = ['bar-1', 'bar-2', 'bar-3'].map(id => document.getElementById(id));
  bars.forEach(b => b.className = 'strength-bar');

  if (!value) return;

  const hasUpperLower = /[a-z]/.test(value) && /[A-Z]/.test(value);
  const hasNumber     = /\d/.test(value);
  const longEnough    = value.length >= 6;

  const score = [longEnough, hasUpperLower, hasNumber].filter(Boolean).length;
  const level = score === 1 ? 'weak' : score === 2 ? 'medium' : 'strong';

  for (let i = 0; i < score; i++) bars[i].classList.add(level);
}

// ── ERROR HELPERS ──
function clearAllErrors() {
  document.querySelectorAll('.field-msg').forEach(el => el.classList.remove('show'));
  document.querySelectorAll('.error-banner').forEach(el => el.classList.remove('show'));
  document.querySelectorAll('.input').forEach(el => el.classList.remove('is-error'));
}

function setFieldError(inputId, msgId, message) {
  document.getElementById(inputId).classList.add('is-error');
  const msg = document.getElementById(msgId);
  msg.textContent = message;
  msg.classList.add('show');
}

function setBanner(bannerId, message) {
  const el = document.getElementById(bannerId);
  el.textContent = message;
  el.classList.add('show');
}

function setLoading(btnId, loading) {
  const btn = document.getElementById(btnId);
  btn.classList.toggle('loading', loading);
  btn.disabled = loading;
}

function isValidEmail(email) {
  return /\S+@\S+\.\S+/.test(email);
}

// ── LOGIN ──
async function handleLogin() {
  clearAllErrors();

  const email    = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;

  let valid = true;
  if (!email) {
    setFieldError('login-email', 'login-email-msg', 'Email is required');
    valid = false;
  } else if (!isValidEmail(email)) {
    setFieldError('login-email', 'login-email-msg', 'Enter a valid email');
    valid = false;
  }
  if (!password) {
    setFieldError('login-password', 'login-pw-msg', 'Password is required');
    valid = false;
  }
  if (!valid) return;

  setLoading('login-btn', true);

  try {
    const data = await Api.auth.login({ email, password });

    localStorage.setItem('token', data.token);
    localStorage.setItem('user', JSON.stringify(data.user));

    showSuccess('panel-login');

  } catch (err) {
    setLoading('login-btn', false);

    if (err.networkError) {
      setBanner('login-banner', 'Cannot reach server. Is it running?');
    } else if (err.status === 429) {
      setBanner('login-banner', 'Too many attempts. Try again in 15 minutes.');
    } else {
      setBanner('login-banner', err.message || 'Sign in failed');
    }
  }
}

// ── REGISTER ──
async function handleRegister() {
  clearAllErrors();

  const full_name = document.getElementById('reg-name').value.trim();
  const username  = document.getElementById('reg-username').value.trim();
  const email     = document.getElementById('reg-email').value.trim();
  const password  = document.getElementById('reg-password').value;

  let valid = true;
  if (!full_name || full_name.length < 2) {
    setFieldError('reg-name', 'reg-name-msg', 'Name must be at least 2 characters');
    valid = false;
  }
  if (!email || !isValidEmail(email)) {
    setFieldError('reg-email', 'reg-email-msg', 'Enter a valid email');
    valid = false;
  }
  if (!password || password.length < 6) {
    setFieldError('reg-password', 'reg-pw-msg', 'Password must be at least 6 characters');
    valid = false;
  }
  if (!valid) return;

  setLoading('register-btn', true);

  try {
    const body = { full_name, email, password };
    if (username) body.username = username;

    await Api.auth.register(body);

    // auto-login right after registering
    const loginData = await Api.auth.login({ email, password });
    localStorage.setItem('token', loginData.token);
    localStorage.setItem('user', JSON.stringify(loginData.user));

    showSuccess('panel-register');

  } catch (err) {
    setLoading('register-btn', false);

    if (err.networkError) {
      setBanner('register-banner', 'Cannot reach server. Is it running?');
      return;
    }

    // map server validation errors back to specific fields
    if (err.errors && err.errors.length > 0) {
      err.errors.forEach(fieldErr => {
        if (fieldErr.field === 'full_name') setFieldError('reg-name', 'reg-name-msg', fieldErr.message);
        if (fieldErr.field === 'email')     setFieldError('reg-email', 'reg-email-msg', fieldErr.message);
        if (fieldErr.field === 'password')  setFieldError('reg-password', 'reg-pw-msg', fieldErr.message);
      });
    } else {
      setBanner('register-banner', err.message || 'Registration failed');
    }
  }
}

// ── SUCCESS + REDIRECT ──
function showSuccess(panelId) {
  document.getElementById(panelId).classList.remove('active');
  document.getElementById('success-screen').classList.add('show');

  setTimeout(() => {
    window.location.href = '/chat.html';
  }, 900);
}

// ── ENTER KEY SUBMITS ACTIVE FORM ──
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter') return;
  const loginActive = document.getElementById('panel-login').classList.contains('active');
  if (loginActive) handleLogin();
  else handleRegister();
});