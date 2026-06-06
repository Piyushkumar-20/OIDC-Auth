'use strict';

let allApps = [];
let pendingDeleteId = null;

const appsGrid    = document.getElementById('appsGrid');
const loadingState = document.getElementById('loadingState');
const emptyState  = document.getElementById('emptyState');
const appCount    = document.getElementById('appCount');
const alertBox    = document.getElementById('alertBox');
const searchInput = document.getElementById('searchInput');

function showAlert(msg, type = 'error') {
  alertBox.textContent = msg;
  alertBox.className = `alert alert-${type}`;
  alertBox.style.display = 'flex';
}

function hideAlert() { alertBox.style.display = 'none'; }

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function formatDate(iso) {
  try {
    return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(iso));
  } catch { return iso; }
}

function getInitials(name) {
  return (name || '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
}

function renderApps(apps) {
  appsGrid.innerHTML = '';

  if (apps.length === 0) {
    appsGrid.style.display = 'none';
    const isFiltered = searchInput.value.trim().length > 0;
    document.getElementById('emptyTitle').textContent = isFiltered ? 'No results found' : 'No applications yet';
    document.getElementById('emptyDesc').textContent = isFiltered
      ? 'Try a different search term.'
      : 'Register your first application to get started with OAuth 2.0.';
    document.getElementById('emptyAction').style.display = isFiltered ? 'none' : '';
    emptyState.style.display = 'block';
    appCount.textContent = '';
    return;
  }

  emptyState.style.display = 'none';
  appsGrid.style.display = 'grid';
  appCount.textContent = `${apps.length} application${apps.length !== 1 ? 's' : ''}`;

  apps.forEach(app => {
    const card = document.createElement('div');
    card.className = 'app-card';
    card.setAttribute('role', 'listitem');
    card.dataset.id = app.id;
    card.innerHTML = `
      <div class="app-card-header">
        <div class="app-card-icon" aria-hidden="true">${escapeHtml(getInitials(app.displayName))}</div>
        <div class="app-card-meta">
          <div class="app-card-name">${escapeHtml(app.displayName)}</div>
          <div class="app-card-date">Created ${escapeHtml(formatDate(app.createdAt))}</div>
        </div>
      </div>
      <div class="app-card-fields">
        <div class="app-field">
          <div class="app-field-label">Client ID</div>
          <div class="app-field-value">${escapeHtml(app.client_id)}</div>
        </div>
        <div class="app-field">
          <div class="app-field-label">Redirect URI</div>
          <div class="app-field-value">${escapeHtml(app.redirectUri)}</div>
        </div>
      </div>
      <div class="app-card-actions">
        <button type="button" class="btn btn-outline" data-action="view" data-id="${escapeHtml(app.id)}" aria-label="View details for ${escapeHtml(app.displayName)}">
          View Details
        </button>
        <button type="button" class="btn btn-outline" data-action="regen" data-id="${escapeHtml(app.id)}" aria-label="Regenerate secret for ${escapeHtml(app.displayName)}">
          Regen Secret
        </button>
        <button type="button" class="btn btn-danger" data-action="delete" data-id="${escapeHtml(app.id)}" aria-label="Delete ${escapeHtml(app.displayName)}">
          Delete
        </button>
      </div>
    `;
    appsGrid.appendChild(card);
  });
}

async function loadApps() {
  loadingState.style.display = 'block';
  emptyState.style.display = 'none';
  appsGrid.style.display = 'none';
  hideAlert();

  try {
    const res = await fetch('/admin/applications');
    if (!res.ok) throw new Error('Failed to load');
    const data = await res.json();
    allApps = Array.isArray(data) ? data : (data.applications || []);
    loadingState.style.display = 'none';
    renderApps(filterApps(searchInput.value));
  } catch {
    loadingState.style.display = 'none';
    showAlert('Could not load applications. Please refresh the page.');
    emptyState.style.display = 'block';
  }
}

function filterApps(query) {
  const q = query.trim().toLowerCase();
  if (!q) return allApps;
  return allApps.filter(a =>
    a.displayName.toLowerCase().includes(q) ||
    a.client_id.toLowerCase().includes(q) ||
    a.redirectUri.toLowerCase().includes(q)
  );
}

searchInput.addEventListener('input', () => {
  renderApps(filterApps(searchInput.value));
});

// Event delegation for card buttons
appsGrid.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  const id = btn.dataset.id;
  const app = allApps.find(a => a.id === id);
  if (!app) return;

  if (btn.dataset.action === 'delete') openDeleteModal(app);
  if (btn.dataset.action === 'view')   openDetailModal(app);
  if (btn.dataset.action === 'regen')  regenSecret(app, btn);
});

// Delete modal
function openDeleteModal(app) {
  pendingDeleteId = app.id;
  document.getElementById('deleteAppName').textContent = app.displayName;
  document.getElementById('deleteModal').style.display = 'flex';
}

function closeDeleteModal() {
  document.getElementById('deleteModal').style.display = 'none';
  pendingDeleteId = null;
  const btn = document.getElementById('deleteConfirmBtn');
  btn.disabled = false;
  document.getElementById('deleteSpinner').classList.remove('active');
  document.getElementById('deleteText').textContent = 'Delete';
}

document.getElementById('modalCloseBtn').addEventListener('click', closeDeleteModal);
document.getElementById('deleteCancelBtn').addEventListener('click', closeDeleteModal);
document.getElementById('deleteModal').addEventListener('click', (e) => {
  if (e.target === e.currentTarget) closeDeleteModal();
});

document.getElementById('deleteConfirmBtn').addEventListener('click', async () => {
  if (!pendingDeleteId) return;
  const btn = document.getElementById('deleteConfirmBtn');
  btn.disabled = true;
  document.getElementById('deleteSpinner').classList.add('active');
  document.getElementById('deleteText').textContent = 'Deleting…';

  try {
    const res = await fetch(`/admin/application/${pendingDeleteId}`, { method: 'DELETE' });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.message || 'Delete failed');
    }
    allApps = allApps.filter(a => a.id !== pendingDeleteId);
    closeDeleteModal();
    renderApps(filterApps(searchInput.value));
    showAlert('Application deleted successfully.', 'success');
    setTimeout(hideAlert, 3000);
  } catch (err) {
    closeDeleteModal();
    showAlert(err.message || 'Could not delete application. Please try again.');
  }
});

// Detail modal
function openDetailModal(app) {
  document.getElementById('detailModalTitle').textContent = app.displayName;
  const fields = [
    { label: 'Application Name', value: app.displayName },
    { label: 'Client ID',        value: app.client_id, mono: true, copyable: true },
    { label: 'Application URL',  value: app.applicationUrl },
    { label: 'Redirect URI',     value: app.redirectUri },
    { label: 'Created',          value: formatDate(app.createdAt) },
  ];

  document.getElementById('detailFields').innerHTML = fields.map(f => `
    <div class="detail-field">
      <div class="detail-field-label">${escapeHtml(f.label)}</div>
      <div class="detail-field-row">
        <span class="detail-field-value${f.mono ? ' code-block' : ''}" style="flex:1">${escapeHtml(f.value)}</span>
        ${f.copyable ? `<button type="button" class="btn btn-ghost copy-detail" data-value="${escapeHtml(f.value)}" aria-label="Copy ${escapeHtml(f.label)}" style="height:auto;padding:0.25rem 0.5rem">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
        </button>` : ''}
      </div>
    </div>
  `).join('');

  document.getElementById('detailModal').style.display = 'flex';
}

document.getElementById('detailCloseBtn').addEventListener('click', () => {
  document.getElementById('detailModal').style.display = 'none';
});
document.getElementById('detailDoneBtn').addEventListener('click', () => {
  document.getElementById('detailModal').style.display = 'none';
});
document.getElementById('detailModal').addEventListener('click', (e) => {
  if (e.target === e.currentTarget) document.getElementById('detailModal').style.display = 'none';
});
document.getElementById('detailFields').addEventListener('click', async (e) => {
  const btn = e.target.closest('.copy-detail');
  if (!btn) return;
  try {
    await navigator.clipboard.writeText(btn.dataset.value);
  } catch {}
});

// Regen secret
async function regenSecret(app, btn) {
  const original = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Regenerating…';
  try {
    const res = await fetch(`/admin/application/${app.id}/regenerate-secret`, { method: 'POST' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.message || 'Failed');
    showAlert(`New secret: ${data.client_secret}`, 'success');
  } catch (err) {
    showAlert(err.message || 'Could not regenerate secret.');
  } finally {
    btn.disabled = false;
    btn.textContent = original;
  }
}

// Trap focus in modals
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (document.getElementById('deleteModal').style.display !== 'none') closeDeleteModal();
    if (document.getElementById('detailModal').style.display !== 'none') {
      document.getElementById('detailModal').style.display = 'none';
    }
  }
});

(async function init() {
  try {
    const res = await fetch('/me');
    if (!res.ok) {
      window.location.replace('/authenticate.html');
      return;
    }
  } catch {
    // network error — let the page load; backend will return 401 if needed
  }
  loadApps();
})();
