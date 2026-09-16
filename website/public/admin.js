(function () {
  'use strict';

  const els = {
    loginSection: document.getElementById('loginSection'),
    loginForm: document.getElementById('loginForm'),
    usernameInput: document.getElementById('usernameInput'),
    passwordInput: document.getElementById('passwordInput'),
    authStatus: document.getElementById('authStatus'),
    auditSection: document.getElementById('auditSection'),
    auditList: document.getElementById('auditList'),
    emptyState: document.getElementById('emptyState'),
    searchInput: document.getElementById('searchInput'),
    refreshBtn: document.getElementById('refreshBtn'),
    logoutBtn: document.getElementById('logoutBtn'),
  };

  const STORAGE_KEY = 'customPrefixAdminSession'; // { token, expiresAt }
  let allEntries = [];

  function getStoredSession() {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const session = JSON.parse(raw);
      if (!session.token || Date.now() > session.expiresAt) return null;
      return session;
    } catch (err) {
      return null;
    }
  }

  function storeSession(session) {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  }

  function clearSession() {
    sessionStorage.removeItem(STORAGE_KEY);
  }

  function formatTime(ms) {
    return new Date(ms).toLocaleString();
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  }

  /** Renders the actual in-game colors/formatting instead of raw &#RRGGBB / <tags>. */
  function renderColoredPreview(container, prefixString, format) {
    container.innerHTML = '';
    container.title = prefixString; // raw string still available on hover, for debugging
    if (!prefixString) {
      const span = document.createElement('span');
      span.className = 'muted';
      span.textContent = '(cleared prefix)';
      container.appendChild(span);
      return;
    }
    let segments;
    try {
      segments = window.PrefixDeserialize.parseToSegments(prefixString, format);
    } catch (err) {
      container.textContent = prefixString; // fall back to raw text if parsing ever fails
      return;
    }
    for (const segment of segments) {
      const count = segment.text.length || 1;
      const colors = window.PrefixColor.gradientColors(segment.colors, count);
      [...segment.text].forEach((ch, i) => {
        const span = document.createElement('span');
        span.textContent = ch;
        span.style.color = colors[i];
        if (segment.bold) span.style.fontWeight = '700';
        if (segment.italic) span.style.fontStyle = 'italic';
        const decorations = [];
        if (segment.underline) decorations.push('underline');
        if (segment.strikethrough) decorations.push('line-through');
        if (decorations.length) span.style.textDecoration = decorations.join(' ');
        container.appendChild(span);
      });
    }
  }

  /** Plain visible text (no color codes/tags) — what "Load example" would show as text, used for search. */
  function visibleTextOf(entry) {
    try {
      return window.PrefixDeserialize.parseToSegments(entry.prefixString, entry.format)
        .map((s) => s.text)
        .join('');
    } catch (err) {
      return entry.prefixString || '';
    }
  }

  function renderEntries(entries) {
    els.auditList.innerHTML = '';
    els.emptyState.hidden = entries.length !== 0;
    for (const e of entries) {
      const row = document.createElement('div');
      row.className = 'audit-row' + (e.outcome === 'blocked' ? ' audit-row-blocked' : '');

      const time = document.createElement('span');
      time.className = 'audit-time muted';
      time.textContent = formatTime(e.at);

      const player = document.createElement('span');
      player.className = 'audit-player';
      player.textContent = e.playerName;

      const outcome = document.createElement('span');
      outcome.className = 'audit-outcome';
      outcome.textContent = e.outcome === 'blocked' ? '🚫 blocked' : e.outcome === 'admin_access' ? '🔑 admin access' : '✔ saved';

      row.append(time, player, outcome);

      if (e.outcome === 'admin_access') {
        const note = document.createElement('span');
        note.className = 'muted';
        note.textContent = 'used /prefix admin to view this page';
        row.appendChild(note);
      } else {
        const format = document.createElement('span');
        format.className = 'audit-format';
        format.textContent = e.format;

        const preview = document.createElement('span');
        preview.className = 'audit-prefix';
        renderColoredPreview(preview, e.prefixString, e.format);

        row.append(format, preview);
      }

      if (e.term) {
        const term = document.createElement('span');
        term.className = 'audit-term';
        term.textContent = `matched: ${e.term}`;
        row.appendChild(term);
      }
      if (e.filterBypassed) {
        const bypass = document.createElement('span');
        bypass.className = 'audit-bypass';
        bypass.textContent = 'filter bypassed';
        row.appendChild(bypass);
      }

      els.auditList.appendChild(row);
    }
  }

  function applySearch() {
    const query = els.searchInput.value.trim().toLowerCase();
    if (!query) {
      renderEntries(allEntries);
      return;
    }
    const filtered = allEntries.filter((e) => {
      const name = (e.playerName || '').toLowerCase();
      const text = visibleTextOf(e).toLowerCase();
      return name.includes(query) || text.includes(query);
    });
    renderEntries(filtered);
  }

  async function loadAudit() {
    const session = getStoredSession();
    if (!session) {
      showLoggedOut();
      return;
    }
    els.authStatus.textContent = '';
    try {
      const res = await fetch('/api/admin/audit?limit=200', {
        headers: { 'X-Admin-Token': session.token },
      });
      if (res.status === 401) {
        clearSession();
        showLoggedOut('Session expired — log in again.');
        return;
      }
      if (!res.ok) {
        els.authStatus.textContent = 'Something went wrong loading the log.';
        return;
      }
      const data = await res.json();
      allEntries = data.entries || [];
      showLoggedIn();
      applySearch();
    } catch (err) {
      els.authStatus.textContent = 'Network error.';
    }
  }

  function showLoggedIn() {
    els.loginSection.hidden = true;
    els.auditSection.hidden = false;
  }

  function showLoggedOut(message) {
    els.loginSection.hidden = false;
    els.auditSection.hidden = true;
    els.authStatus.textContent = message || '';
  }

  els.loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = els.usernameInput.value;
    const password = els.passwordInput.value;
    if (!username || !password) {
      els.authStatus.textContent = 'Enter both username and password.';
      return;
    }
    els.authStatus.textContent = 'Logging in…';
    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        els.authStatus.textContent = body.error || 'Login failed.';
        return;
      }
      storeSession(body);
      els.passwordInput.value = '';
      await loadAudit();
    } catch (err) {
      els.authStatus.textContent = 'Network error.';
    }
  });

  els.logoutBtn.addEventListener('click', async () => {
    const session = getStoredSession();
    clearSession();
    showLoggedOut();
    if (session) {
      fetch('/api/admin/logout', { method: 'POST', headers: { 'X-Admin-Token': session.token } }).catch(() => {});
    }
  });

  els.refreshBtn.addEventListener('click', loadAudit);
  els.searchInput.addEventListener('input', applySearch);

  /**
   * Handles a '/prefix admin' link (?token=<magic link>): exchanges it for
   * a real admin session in one call, then removes the token from the
   * visible URL/browser history immediately regardless of outcome — it's
   * single-use either way, no reason to leave it sitting in the address
   * bar. Falls back to showing the normal username/password form (still
   * fully available) if the link is missing, expired, or already used.
   */
  async function init() {
    const params = new URLSearchParams(location.search);
    const magicToken = params.get('token');
    if (!magicToken) {
      loadAudit();
      return;
    }

    history.replaceState({}, '', location.pathname); // strip ?token= right away
    els.authStatus.textContent = 'Logging in…';
    try {
      const res = await fetch('/api/admin/redeem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: magicToken }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        showLoggedOut(body.error || 'This admin link has expired or was already used.');
        return;
      }
      storeSession(body);
      await loadAudit();
    } catch (err) {
      showLoggedOut('Network error redeeming the admin link.');
    }
  }

  init();
})();
