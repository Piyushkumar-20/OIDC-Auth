'use strict';

const params = new URLSearchParams(window.location.search);
const clientId   = params.get('client_id')   || '';
const redirectUri = params.get('redirect_uri') || '';
const state       = params.get('state')        || '';
const scope       = params.get('scope')        || 'openid';
const userEmail   = params.get('user_email')   || 'user@example.com';
const appName     = params.get('app_name')     || 'Unknown Application';
const appUrl      = params.get('app_url')      || '';

const SCOPE_DESCRIPTIONS = {
  openid:         'Verify your identity',
  profile:        'View your name and profile details',
  email:          'View your email address',
  offline_access: 'Stay signed in when you\'re not actively using the app',
};

function init() {
  // App icon / initials
  const initials = appName.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  document.getElementById('appInitials').textContent = initials;
  document.getElementById('appName').textContent = appName;

  const urlEl = document.getElementById('appUrl');
  if (appUrl) {
    urlEl.textContent = appUrl.replace(/^https?:\/\//, '');
    urlEl.href = appUrl;
  } else {
    urlEl.style.display = 'none';
  }

  // User info
  const emailEl = document.getElementById('userEmail');
  emailEl.textContent = userEmail;

  const avatarEl = document.getElementById('userAvatar');
  avatarEl.textContent = userEmail[0].toUpperCase();

  // Permissions
  const scopes = scope.split(/[\s,+]+/).filter(Boolean);
  const list = document.getElementById('permissionsList');
  list.innerHTML = '';
  scopes.forEach(s => {
    const desc = SCOPE_DESCRIPTIONS[s];
    if (!desc) return;
    const li = document.createElement('li');
    li.className = 'permission-item';
    li.innerHTML = `
      <span class="permission-check" aria-hidden="true">
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
          <path d="M20 6 9 17l-5-5"/>
        </svg>
      </span>
      <span>${escapeHtml(desc)}</span>
    `;
    list.appendChild(li);
  });

  if (list.children.length === 0) {
    const li = document.createElement('li');
    li.className = 'permission-item';
    li.innerHTML = `
      <span class="permission-check" aria-hidden="true">
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
          <path d="M20 6 9 17l-5-5"/>
        </svg>
      </span>
      <span>Access your basic account information</span>
    `;
    list.appendChild(li);
  }
}

function showAlert(msg) {
  const el = document.getElementById('alertBox');
  el.textContent = msg;
  el.style.display = 'flex';
}

function setLoading(loading) {
  const btn = document.getElementById('allowBtn');
  const spinner = document.getElementById('spinner');
  const text = document.getElementById('btnText');
  btn.disabled = loading;
  spinner.classList.toggle('active', loading);
  text.textContent = loading ? 'Allowing…' : 'Allow Access';
}

document.getElementById('cancelBtn').addEventListener('click', () => {
  if (redirectUri) {
    window.location.href = redirectUri + '?error=access_denied&error_description=User+denied+access' +
      (state ? '&state=' + encodeURIComponent(state) : '');
  } else {
    history.back();
  }
});

document.getElementById('allowBtn').addEventListener('click', async () => {
  document.getElementById('alertBox').style.display = 'none';
  setLoading(true);
  try {
    const res = await fetch('/o/consent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: clientId, redirect_uri: redirectUri, state, scope }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      showAlert(data.message || 'Something went wrong. Please try again.');
    } else if (data.redirect) {
      window.location.href = data.redirect;
    }
  } catch {
    showAlert('Something went wrong. Please try again.');
  } finally {
    setLoading(false);
  }
});

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

init();
