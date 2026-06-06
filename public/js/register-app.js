'use strict';

// Redirect guests before the page becomes interactive
fetch('/me').then(res => {
  if (!res.ok) window.location.replace('/authenticate.html');
}).catch(() => {});

const form      = document.getElementById('registerForm');
const submitBtn = document.getElementById('submitBtn');
const spinner   = document.getElementById('spinner');
const btnText   = document.getElementById('btnText');
const errorMsg  = document.getElementById('errorMsg');

function showError(msg) {
  errorMsg.textContent = msg;
  errorMsg.style.display = 'flex';
}

function hideError() {
  errorMsg.style.display = 'none';
}

function setLoading(loading) {
  submitBtn.disabled = loading;
  spinner.classList.toggle('active', loading);
  btnText.textContent = loading ? 'Creating…' : 'Create Application';
}

function showSuccess(clientId, clientSecret, displayName) {
  document.getElementById('formView').style.display = 'none';
  const view = document.getElementById('successView');
  view.style.display = 'block';
  document.getElementById('createdAppName').textContent = displayName;
  document.getElementById('clientIdValue').textContent = clientId;
  document.getElementById('clientSecretValue').textContent = clientSecret;
}

async function copyToClipboard(text, btn) {
  try {
    await navigator.clipboard.writeText(text);
    const span = btn.querySelector('span');
    const original = span.textContent;
    span.textContent = 'Copied!';
    btn.classList.add('copied');
    setTimeout(() => {
      span.textContent = original;
      btn.classList.remove('copied');
    }, 2000);
  } catch {
    // fallback
  }
}

document.getElementById('copyClientId').addEventListener('click', function () {
  copyToClipboard(document.getElementById('clientIdValue').textContent, this);
});

document.getElementById('copyClientSecret').addEventListener('click', function () {
  copyToClipboard(document.getElementById('clientSecretValue').textContent, this);
});

document.getElementById('registerAnotherBtn').addEventListener('click', () => {
  document.getElementById('successView').style.display = 'none';
  document.getElementById('formView').style.display = 'block';
  form.reset();
  hideError();
});

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  hideError();

  const displayName    = document.getElementById('displayName').value.trim();
  const applicationUrl = document.getElementById('applicationUrl').value.trim();
  const redirectUri    = document.getElementById('redirectUri').value.trim();

  if (!displayName || !applicationUrl || !redirectUri) {
    showError('All fields are required.');
    return;
  }

  if (!isValidUrl(applicationUrl)) {
    showError('Application URL must be a valid URL (e.g. https://myapp.example.com).');
    return;
  }

  if (!isValidUrl(redirectUri)) {
    showError('Redirect URI must be a valid URL.');
    return;
  }

  setLoading(true);

  try {
    const res = await fetch('/admin/application', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ displayName, applicationUrl, redirectUri }),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      showError(data.message || 'Something went wrong. Please try again.');
    } else {
      showSuccess(data.client_id, data.client_secret, displayName);
    }
  } catch {
    showError('Something went wrong. Please try again.');
  } finally {
    setLoading(false);
  }
});

function isValidUrl(str) {
  try {
    const u = new URL(str);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}
