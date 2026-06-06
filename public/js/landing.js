'use strict';

function escapeHtml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Auth state — check session cookie via /me, swap nav if logged in
async function checkAuth() {
  try {
    const res = await fetch('/me');
    if (!res.ok) return;
    const user = await res.json();
    setLoggedInNav(user);
  } catch {
    // network error — leave nav as-is
  }
}

function setLoggedInNav(user) {
  const firstName = escapeHtml(user.given_name || user.name || 'User');

  // Reveal nav items that require authentication (e.g. Dashboard link)
  document.querySelectorAll('[data-auth-only]').forEach(el => el.removeAttribute('data-auth-only'));

  // Desktop nav — replace Sign In / Get Started with name + sign-out
  const navActions = document.getElementById('navActions');
  navActions.innerHTML = `
    <span class="nav-user-name">Hi, ${firstName}</span>
    <button class="btn btn-outline btn-sm" id="signOutBtn">Sign Out</button>
  `;
  document.getElementById('signOutBtn').addEventListener('click', signOut);

  // Mobile nav — replace Sign In / Get Started with name + sign-out
  const mobileAuth = document.getElementById('mobileAuthItems');
  mobileAuth.innerHTML = `
    <span class="mobile-user-name">Hi, ${firstName}</span>
    <button class="btn btn-outline btn-full" id="mobileSignOutBtn">Sign Out</button>
  `;
  document.getElementById('mobileSignOutBtn').addEventListener('click', signOut);
}

async function signOut() {
  await fetch('/sign-out', { method: 'POST' }).catch(() => {});
  window.location.reload();
}

// Mobile nav toggle
const toggle    = document.getElementById('navToggle');
const mobileMenu = document.getElementById('mobileMenu');

toggle.addEventListener('click', () => {
  const isOpen = !mobileMenu.hidden;
  mobileMenu.hidden = isOpen;
  toggle.setAttribute('aria-expanded', String(!isOpen));
});

// Close mobile menu on link click
mobileMenu.querySelectorAll('a').forEach(link => {
  link.addEventListener('click', () => {
    mobileMenu.hidden = true;
    toggle.setAttribute('aria-expanded', 'false');
  });
});

// Smooth scroll for anchor links
document.querySelectorAll('a[href^="#"]').forEach(link => {
  link.addEventListener('click', (e) => {
    const id = link.getAttribute('href').slice(1);
    const target = document.getElementById(id);
    if (!target) return;
    e.preventDefault();
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    target.setAttribute('tabindex', '-1');
    target.focus({ preventScroll: true });
  });
});

checkAuth();
