/* ============================================================
   MINDS' CRAFT — UTILITIES
   ============================================================ */

const Utils = {
  // ─── FORMAT ───
  formatDate(dateStr, format = 'DD/MM/YYYY') {
    if (!dateStr) return '—';
    const d = new Date(dateStr);
    if (isNaN(d)) return dateStr;
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    const hours = String(d.getHours()).padStart(2, '0');
    const mins = String(d.getMinutes()).padStart(2, '0');
    return format
      .replace('DD', day).replace('MM', month).replace('YYYY', year)
      .replace('HH', hours).replace('mm', mins);
  },

  formatCurrency(amount, currency = 'USD') {
    if (amount === null || amount === undefined) return '—';
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount);
  },

  formatNumber(n) {
    if (n === null || n === undefined) return '0';
    return new Intl.NumberFormat('en-US').format(n);
  },

  timeAgo(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    const secs = Math.floor((Date.now() - d) / 1000);
    if (secs < 60) return 'just now';
    if (secs < 3600) return `${Math.floor(secs/60)}m ago`;
    if (secs < 86400) return `${Math.floor(secs/3600)}h ago`;
    if (secs < 604800) return `${Math.floor(secs/86400)}d ago`;
    return this.formatDate(dateStr);
  },

  // Alias for formatDate (short form used across modules)
  fmtDate(dateStr, format) {
    return this.formatDate(dateStr, format);
  },

  todayISO() {
    return new Date().toISOString().slice(0, 10);
  },

  monthRange() {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);
    return { start, end };
  },

  // ─── INITIALS ───
  initials(name = '') {
    return name.split(' ').slice(0, 2).map(w => w[0] || '').join('').toUpperCase() || '?';
  },

  // ─── BADGE HELPERS ───
  statusBadge(status) {
    const map = {
      active: 'badge-green', inactive: 'badge-red', pending: 'badge-yellow',
      upcoming: 'badge-blue', completed: 'badge-gray', cancelled: 'badge-red',
      premium: 'badge-purple', basic: 'badge-blue', trial: 'badge-yellow',
    };
    return `<span class="badge ${map[status] || 'badge-gray'}">${status || 'N/A'}</span>`;
  },

  roleBadge(role) {
    const map = {
      parent: 'badge-blue', student: 'badge-green',
      staff: 'badge-yellow', admin: 'badge-purple', super_admin: 'badge-red',
    };
    return `<span class="badge ${map[role] || 'badge-gray'}">${role?.replace('_',' ') || 'N/A'}</span>`;
  },

  // ─── COLOR HELPERS ───
  avatarColor(name = '') {
    const colors = ['#22c55e','#6366f1','#f59e0b','#ef4444','#3b82f6','#ec4899','#14b8a6','#8b5cf6'];
    let h = 0;
    for (let c of name) h = (h * 31 + c.charCodeAt(0)) & 0xffffffff;
    return colors[Math.abs(h) % colors.length];
  },

  // ─── SANITIZE ───
  esc(str) {
    if (!str) return '';
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  },

  // ─── DEBOUNCE ───
  debounce(fn, delay = 300) {
    let t;
    return function(...args) {
      clearTimeout(t);
      t = setTimeout(() => fn.apply(this, args), delay);
    };
  },

  // ─── DOWNLOAD CSV ───
  downloadCSV(rows, filename = 'export.csv') {
    if (!rows || !rows.length) return;
    const keys = Object.keys(rows[0]);
    const csv = [
      keys.join(','),
      ...rows.map(r => keys.map(k => JSON.stringify(r[k] ?? '')).join(','))
    ].join('\n');
    const a = document.createElement('a');
    a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
    a.download = filename;
    a.click();
  },

  // ─── LOCAL STORAGE ───
  lsGet(key, def = null) {
    try { const v = localStorage.getItem(key); return v !== null ? JSON.parse(v) : def; } catch { return def; }
  },
  lsSet(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); } catch {} },
  lsRemove(key) { localStorage.removeItem(key); },
};

// ─────────────────────────────────────────────
// TOAST NOTIFICATIONS
// ─────────────────────────────────────────────
const Toast = {
  show(msg, type = 'info', duration = 3500) {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const icons = { success: 'fa-check-circle', error: 'fa-times-circle', info: 'fa-info-circle', warning: 'fa-exclamation-triangle' };
    const el = document.createElement('div');
    el.className = `toast toast-${type}`;
    el.innerHTML = `<i class="fas ${icons[type] || icons.info}"></i><span>${Utils.esc(msg)}</span>`;
    container.appendChild(el);
    setTimeout(() => {
      el.style.animation = 'slideOutRight .25s ease forwards';
      setTimeout(() => el.remove(), 300);
    }, duration);
  },
  success(msg) { this.show(msg, 'success'); },
  error(msg) { this.show(msg, 'error'); },
  info(msg) { this.show(msg, 'info'); },
  warning(msg) { this.show(msg, 'warning'); },
};

// ─────────────────────────────────────────────
// MODAL HELPERS
// ─────────────────────────────────────────────
const Modal = {
  open(title, bodyHTML, opts = {}) {
    document.getElementById('modal-title').textContent = title;
    document.getElementById('modal-body').innerHTML = bodyHTML;
    const box = document.getElementById('modal-box');
    box.className = 'modal' + (opts.size ? ` modal-${opts.size}` : '');
    document.getElementById('modal-overlay').classList.remove('hidden');
  },
  close() {
    document.getElementById('modal-overlay').classList.add('hidden');
  },
};

function closeModal(e) {
  if (e.target === document.getElementById('modal-overlay')) Modal.close();
}

// ─────────────────────────────────────────────
// THEME TOGGLE
// ─────────────────────────────────────────────
function toggleTheme() {
  const html = document.documentElement;
  const current = html.getAttribute('data-theme');
  const next = current === 'dark' ? 'light' : 'dark';
  html.setAttribute('data-theme', next);
  localStorage.setItem('mc_theme', next);
  document.getElementById('theme-icon').className = next === 'dark' ? 'fas fa-moon' : 'fas fa-sun';
}

function initTheme() {
  const saved = localStorage.getItem('mc_theme') || 'dark';
  document.documentElement.setAttribute('data-theme', saved);
  const icon = document.getElementById('theme-icon');
  if (icon) icon.className = saved === 'dark' ? 'fas fa-moon' : 'fas fa-sun';
}

// ─────────────────────────────────────────────
// SIDEBAR TOGGLE
// ─────────────────────────────────────────────
function toggleSidebar() {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebar-overlay');
  sidebar.classList.toggle('open');
  overlay.classList.toggle('open');
}

// ─────────────────────────────────────────────
// PASSWORD TOGGLE
// ─────────────────────────────────────────────
function togglePw() {
  const inp = document.getElementById('login-password');
  inp.type = inp.type === 'password' ? 'text' : 'password';
}
