/* ============================================================
   MINDS' CRAFT — MAIN APP CONTROLLER
   ============================================================ */

const App = {
  currentPage: 'dashboard',
  currentUser: null,
  isSetup: false,

  pages: {
    dashboard: { title: 'Dashboard', render: () => DashboardPage.render() },
    users:     { title: 'Users', render: () => UsersPage.render() },
    courses:   { title: 'Courses', render: () => CoursesPage.render() },
    attendance:{ title: 'Attendance', render: () => AttendancePage.render() },
    trainers:  { title: 'Trainers', render: () => TrainersPage.render() },
    events:    { title: 'Events', render: () => EventsPage.render() },
    financials:{ title: 'Financials', render: () => FinancialsPage.render() },
    notifications: { title: 'Notifications', render: () => NotificationsPage.render() },
    progress:  { title: 'Student Progress', render: () => ProgressPage.render() },
    settings:  { title: 'Settings', render: () => SettingsPage.render() },
  },

  // ─────────────────────────────────────────────
  // BOOT
  // ─────────────────────────────────────────────
  // ── Save credentials to ALL storage layers at once ──
  _saveCredentials(url, key) {
    if (url)  { localStorage.setItem('mc_supabase_url', url);  sessionStorage.setItem('mc_supabase_url', url); }
    if (key)  { localStorage.setItem('mc_supabase_key', key);  sessionStorage.setItem('mc_supabase_key', key); }
  },

  // ── Read credentials from config (hardcoded > localStorage > sessionStorage) ──
  _loadCredentials() {
    return {
      url: SUPABASE_CONFIG.url,
      key: SUPABASE_CONFIG.anonKey,
    };
  },

  async boot() {
    initTheme();

    // ── Read hash FIRST before anything else ──
    const hash = window.location.hash;
    const hasToken = hash.includes('access_token');
    const hashParams = new URLSearchParams(hash.replace('#', ''));
    const linkType   = hashParams.get('type');           // 'magiclink' | 'recovery'
    const hashToken  = hashParams.get('access_token');   // raw token value

    // ── Load credentials from all possible sources ──
    let { url: supabaseUrl, key: supabaseKey } = this._loadCredentials();

    // ── If a magic/recovery link was clicked, extract the Supabase project URL
    //    from the token issuer so we can auto-configure if credentials are missing ──
    if (hasToken && hashToken && !supabaseUrl) {
      // Decode JWT payload (base64) to get issuer (iss) = Supabase project URL
      try {
        const payload = JSON.parse(atob(hashToken.split('.')[1]));
        // iss is like "https://xxxx.supabase.co/auth/v1"
        const iss = payload.iss || '';
        const projectUrl = iss.replace('/auth/v1', '');
        if (projectUrl.includes('supabase.co')) {
          supabaseUrl = projectUrl;
          this._saveCredentials(supabaseUrl, '');
        }
      } catch(e) { console.warn('Could not decode token:', e); }
    }

    // ── If we have a token but no anon key, show a special screen ──
    if (hasToken && supabaseUrl && !supabaseKey) {
      this._showTokenNeedsKey(supabaseUrl, hash);
      return;
    }

    // ── Normal boot: check credentials ──
    if (!supabaseUrl || !supabaseKey) {
      // If there's a token in URL, show a helpful message instead of blank setup
      if (hasToken) {
        this._showTokenNeedsKey(supabaseUrl, hash);
      } else {
        this.showSetup();
      }
      return;
    }

    // ── Ensure credentials are persisted in both stores ──
    this._saveCredentials(supabaseUrl, supabaseKey);

    if (!DB.init(supabaseUrl, supabaseKey)) {
      this.showSetup();
      return;
    }

    this.isSetup = true;

    // ── Show "Signing you in…" spinner if token is present ──
    if (hasToken) {
      this._showSigningIn();
    }

    // ── Listen for auth state changes (handles magic link exchange) ──
    DB.onAuthChange((event, session) => {
      if (event === 'SIGNED_IN' && session) {
        this.currentUser = session.user;
        try { history.replaceState(null, '', window.location.pathname); } catch(e) {}

        if (linkType === 'magiclink' || linkType === 'recovery') {
          this.showApp();
          setTimeout(() => this.promptSetPassword(), 800);
        } else {
          this.showApp();
        }
      } else if (event === 'PASSWORD_RECOVERY') {
        this.showPasswordReset();
      } else if (event === 'SIGNED_OUT') {
        this.currentUser = null;
        this.showLogin();
      }
    });

    // ── Check for an existing valid session ──
    const session = await DB.getSession();
    if (session) {
      this.currentUser = session.user;
      this.showApp();
    } else if (!hasToken) {
      this.showLogin();
    }
    // hasToken case: wait for onAuthChange to fire
  },

  // ── "Signing you in…" loading screen ──
  _showSigningIn() {
    document.getElementById('login-screen').classList.remove('hidden');
    document.getElementById('app').classList.add('hidden');
    document.getElementById('login-screen').innerHTML = `
      <div class="login-card" style="text-align:center;padding:3rem 2rem">
        <img src="assets/logo.svg" style="width:56px;height:56px;margin:0 auto 1rem" />
        <h2 style="margin-bottom:.5rem">Signing you in…</h2>
        <p style="color:var(--text-muted);font-size:var(--font-size-sm)">
          Processing your login link, please wait.
        </p>
        <div style="margin-top:1.5rem">
          <i class="fas fa-spinner fa-spin" style="font-size:2rem;color:var(--brand-primary)"></i>
        </div>
      </div>
    `;
  },

  // ── When token exists in URL but no anon key is stored ──
  _showTokenNeedsKey(projectUrl, originalHash) {
    // Store the hash safely so the button can access it
    this._pendingHash    = originalHash;
    this._pendingProject = projectUrl;

    document.getElementById('login-screen').classList.remove('hidden');
    document.getElementById('app').classList.add('hidden');
    document.getElementById('login-screen').innerHTML = `
      <div class="login-card">
        <div class="login-logo">
          <img src="assets/logo.svg" class="login-logo-img" />
          <span class="login-logo-text">Minds' Craft</span>
        </div>
        <h2 class="login-title">One-time Setup</h2>
        <p class="login-subtitle">
          Your magic link is valid! Enter your Supabase <strong>Anon Key</strong> once to complete setup — you'll never need to do this again.
        </p>
        ${projectUrl ? `
        <div class="alert alert-info" style="margin-bottom:1rem;font-size:var(--font-size-xs)">
          <i class="fas fa-check-circle"></i>
          Project auto-detected: <strong>${Utils.esc(projectUrl)}</strong>
        </div>` : `
        <div class="form-group">
          <label class="form-label">Supabase Project URL</label>
          <input type="url" id="one-time-url" class="form-input"
            placeholder="https://xxxx.supabase.co" value="${Utils.esc(projectUrl)}" />
        </div>`}
        <div id="key-error" class="alert alert-error hidden"></div>
        <div class="form-group">
          <label class="form-label">Supabase Anon Key</label>
          <input type="text" id="one-time-key" class="form-input"
            placeholder="eyJhbGciOiJIUzI1NiIs…"
            style="font-size:11px;font-family:monospace;word-break:break-all" />
          <p style="font-size:var(--font-size-xs);color:var(--text-muted);margin-top:4px">
            Supabase Dashboard → Settings → API → <strong>anon public</strong> key
          </p>
        </div>
        <button class="btn btn-primary btn-full" id="complete-login-btn" onclick="App._completeTokenLogin()">
          <i class="fas fa-sign-in-alt"></i> Complete Login
        </button>
        <div class="login-footer" style="margin-top:1rem">
          <button class="btn btn-ghost btn-sm" onclick="App.showSetup()" style="font-size:11px">
            <i class="fas fa-cog"></i> Manual Setup Instead
          </button>
        </div>
      </div>
    `;
  },

  async _completeTokenLogin() {
    const key        = document.getElementById('one-time-key')?.value?.trim();
    const urlInput   = document.getElementById('one-time-url');
    const projectUrl = urlInput ? urlInput.value.trim() : this._pendingProject;
    const errEl      = document.getElementById('key-error');
    const btn        = document.getElementById('complete-login-btn');

    if (errEl) errEl.classList.add('hidden');

    if (!key || !key.startsWith('eyJ')) {
      if (errEl) { errEl.textContent = 'Please paste your Supabase anon key (starts with eyJ…).'; errEl.classList.remove('hidden'); }
      return;
    }
    if (!projectUrl || !projectUrl.includes('supabase.co')) {
      if (errEl) { errEl.textContent = 'Please enter your Supabase Project URL.'; errEl.classList.remove('hidden'); }
      return;
    }

    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Connecting…'; }

    this._saveCredentials(projectUrl, key);

    if (!DB.init(projectUrl, key)) {
      if (errEl) { errEl.textContent = 'Could not connect to Supabase. Double-check your key.'; errEl.classList.remove('hidden'); }
      if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-sign-in-alt"></i> Complete Login'; }
      return;
    }

    this.isSetup = true;
    this._showSigningIn();

    // Set up listener for auth state
    DB.onAuthChange((event, session) => {
      if (event === 'SIGNED_IN' && session) {
        this.currentUser = session.user;
        try { history.replaceState(null, '', window.location.pathname); } catch(e) {}
        this.showApp();
        setTimeout(() => this.promptSetPassword(), 800);
      }
    });

    // Check if Supabase already parsed the session from hash
    const session = await DB.getSession();
    if (session) {
      this.currentUser = session.user;
      try { history.replaceState(null, '', window.location.pathname); } catch(e) {}
      this.showApp();
      setTimeout(() => this.promptSetPassword(), 800);
    } else if (this._pendingHash) {
      // Restore the hash so Supabase JS can parse the token
      window.location.hash = this._pendingHash.replace(/^#/, '');
    }
  },

  // ── Prompt user to set a permanent password after magic link login ──
  promptSetPassword() {
    Modal.open('Set Your Password', `
      <p style="color:var(--text-muted);font-size:var(--font-size-sm);margin-bottom:1.2rem">
        You logged in via a magic link. Set a permanent password so you can log in normally next time.
      </p>
      <div id="setpw-error" class="alert alert-error hidden"></div>
      <form onsubmit="App.setNewPassword(event)">
        <div class="form-group">
          <label class="form-label">New Password</label>
          <input type="password" id="new-pw" class="form-input" placeholder="Min 8 characters" required minlength="8" />
        </div>
        <div class="form-group">
          <label class="form-label">Confirm Password</label>
          <input type="password" id="confirm-pw" class="form-input" placeholder="Repeat password" required minlength="8" />
        </div>
        <div class="modal-footer" style="padding:0;border:none;margin-top:1rem">
          <button type="button" class="btn btn-ghost" onclick="Modal.close()">Skip for now</button>
          <button type="submit" class="btn btn-primary"><i class="fas fa-lock"></i> Set Password</button>
        </div>
      </form>
    `);
  },

  async setNewPassword(e) {
    e.preventDefault();
    const pw = document.getElementById('new-pw').value;
    const confirm = document.getElementById('confirm-pw').value;
    const errEl = document.getElementById('setpw-error');

    if (pw !== confirm) {
      errEl.textContent = 'Passwords do not match.';
      errEl.classList.remove('hidden');
      return;
    }

    const { error } = await DB.client.auth.updateUser({ password: pw });
    if (error) {
      errEl.textContent = error.message;
      errEl.classList.remove('hidden');
      return;
    }

    Modal.close();
    Toast.success('Password set successfully! You can now log in with your email and password.');
  },

  // ── Password reset flow ──
  showPasswordReset() {
    document.getElementById('login-screen').classList.remove('hidden');
    document.getElementById('app').classList.add('hidden');
    document.getElementById('login-screen').innerHTML = `
      <div class="login-card">
        <div class="login-logo">
          <img src="assets/logo.svg" alt="Minds' Craft" class="login-logo-img" />
          <span class="login-logo-text">Minds' Craft</span>
        </div>
        <h2 class="login-title">Set New Password</h2>
        <p class="login-subtitle">Choose a strong password for your admin account</p>
        <div id="reset-error" class="alert alert-error hidden"></div>
        <div id="reset-success" class="alert alert-success hidden"></div>
        <form onsubmit="App.submitPasswordReset(event)" class="login-form">
          <div class="form-group">
            <label class="form-label">New Password</label>
            <div class="input-icon-wrap">
              <i class="fas fa-lock input-icon"></i>
              <input type="password" id="reset-pw" class="form-input" placeholder="Min 8 characters" required minlength="8" />
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">Confirm Password</label>
            <div class="input-icon-wrap">
              <i class="fas fa-lock input-icon"></i>
              <input type="password" id="reset-pw-confirm" class="form-input" placeholder="Repeat password" required minlength="8" />
            </div>
          </div>
          <button type="submit" class="btn btn-primary btn-full" id="reset-btn">
            <i class="fas fa-key"></i> Update Password
          </button>
        </form>
      </div>
    `;
  },

  async submitPasswordReset(e) {
    e.preventDefault();
    const pw = document.getElementById('reset-pw').value;
    const confirm = document.getElementById('reset-pw-confirm').value;
    const errEl = document.getElementById('reset-error');
    const successEl = document.getElementById('reset-success');
    const btn = document.getElementById('reset-btn');

    errEl.classList.add('hidden');

    if (pw !== confirm) {
      errEl.textContent = 'Passwords do not match.';
      errEl.classList.remove('hidden');
      return;
    }

    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Updating…';

    const { error } = await DB.client.auth.updateUser({ password: pw });

    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-key"></i> Update Password';

    if (error) {
      errEl.textContent = error.message;
      errEl.classList.remove('hidden');
      return;
    }

    successEl.textContent = '✅ Password updated! Redirecting to your dashboard…';
    successEl.classList.remove('hidden');
    setTimeout(() => {
      DB.getSession().then(session => {
        if (session) { this.currentUser = session.user; this.showApp(); }
        else this.showLogin();
      });
    }, 1800);
  },

  // ─────────────────────────────────────────────
  // SHOW SETUP WIZARD
  // ─────────────────────────────────────────────
  showSetup() {
    document.getElementById('login-screen').classList.remove('hidden');
    document.getElementById('app').classList.add('hidden');

    // Pre-fill any existing values
    const existingUrl = localStorage.getItem('mc_supabase_url') || sessionStorage.getItem('mc_supabase_url') || '';
    const existingKey = localStorage.getItem('mc_supabase_key') || sessionStorage.getItem('mc_supabase_key') || '';

    document.getElementById('login-screen').innerHTML = `
      <div class="setup-card">
        <div class="setup-icon">⚙️</div>
        <h2>Connect to Supabase</h2>
        <p>Enter your Supabase project credentials to get started.<br>
        You can find these in your Supabase Dashboard → Settings → API.</p>
        <div id="setup-error" class="alert alert-error hidden"></div>
        ${existingUrl ? `<div class="alert alert-info" style="margin-bottom:1rem;font-size:var(--font-size-xs)"><i class="fas fa-info-circle"></i> Previously saved credentials found — you can update them below or click <strong>Connect Database</strong> to retry.</div>` : ''}
        <div class="setup-fields">
          <div class="form-group">
            <label class="form-label">Supabase Project URL</label>
            <input type="url" id="setup-url" class="form-input" placeholder="https://xxxx.supabase.co" value="${Utils.esc(existingUrl)}" />
          </div>
          <div class="form-group">
            <label class="form-label">Supabase Anon Key</label>
            <input type="text" id="setup-key" class="form-input"
              placeholder="eyJhbGciOiJIUzI1NiIs..."
              style="font-size:11px;font-family:monospace"
              value="${Utils.esc(existingKey)}" />
          </div>
          <button class="btn btn-primary btn-full" id="setup-btn" onclick="App.saveSetup()">
            <i class="fas fa-plug"></i> Connect Database
          </button>
          <p class="text-center mt-2 text-xs text-muted" style="margin-top:12px">
            Credentials are saved automatically — you'll never need to enter them again.
          </p>
        </div>
      </div>
    `;
  },

  async saveSetup() {
    const url = document.getElementById('setup-url').value.trim();
    const key = document.getElementById('setup-key').value.trim();
    const errEl = document.getElementById('setup-error');
    errEl.classList.add('hidden');

    if (!url || !key) {
      errEl.textContent = 'Both URL and Key are required.';
      errEl.classList.remove('hidden');
      return;
    }
    if (!url.startsWith('https://') || !url.includes('supabase.co')) {
      errEl.textContent = 'Please enter a valid Supabase URL (https://xxxx.supabase.co)';
      errEl.classList.remove('hidden');
      return;
    }

    this._saveCredentials(url, key);

    if (!DB.init(url, key)) {
      errEl.textContent = 'Failed to initialize Supabase. Check your credentials.';
      errEl.classList.remove('hidden');
      return;
    }

    this.isSetup = true;
    this.showLogin();
  },

  // ─────────────────────────────────────────────
  // SHOW LOGIN
  // ─────────────────────────────────────────────
  showLogin() {
    document.getElementById('login-screen').innerHTML = `
      <div class="login-card">
        <div class="login-logo">
          <img src="assets/logo.svg" alt="Minds' Craft" class="login-logo-img" />
          <span class="login-logo-text">Minds' Craft</span>
        </div>
        <h2 class="login-title">Admin Portal</h2>
        <p class="login-subtitle">Sign in to manage your robotics center</p>
        <div id="login-error" class="alert alert-error hidden"></div>
        <form id="login-form" class="login-form" onsubmit="App.login(event)">
          <div class="form-group">
            <label class="form-label">Email Address</label>
            <div class="input-icon-wrap">
              <i class="fas fa-envelope input-icon"></i>
              <input type="email" id="login-email" class="form-input" placeholder="admin@mindscraft.com" required />
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">Password</label>
            <div class="input-icon-wrap">
              <i class="fas fa-lock input-icon"></i>
              <input type="password" id="login-password" class="form-input" placeholder="••••••••" required />
            </div>
          </div>
          <button type="submit" class="btn btn-primary btn-full" id="login-btn">
            <i class="fas fa-sign-in-alt"></i> Sign In
          </button>
        </form>
        <div class="login-footer">
          <p>Secure Admin Access · Minds' Craft © 2025</p>
          <div style="display:flex;align-items:center;gap:6px;justify-content:center;margin-top:8px">
            <span style="display:inline-flex;align-items:center;gap:4px;font-size:10px;color:var(--brand-primary);background:rgba(34,197,94,0.08);padding:3px 10px;border-radius:20px;border:1px solid rgba(34,197,94,0.2)">
              <i class="fas fa-database" style="font-size:9px"></i>
              ${localStorage.getItem('mc_supabase_url') ? 'Database connected' : 'No database'}
            </span>
          </div>
          <button class="btn btn-ghost btn-sm mt-2" onclick="App.showSetup()" style="margin-top:6px;font-size:11px">
            <i class="fas fa-cog"></i> Change Supabase Config
          </button>
        </div>
      </div>
    `;
    document.getElementById('login-screen').classList.remove('hidden');
    document.getElementById('app').classList.add('hidden');
  },

  async login(e) {
    e.preventDefault();
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;
    const btn = document.getElementById('login-btn');
    const errEl = document.getElementById('login-error');

    errEl.classList.add('hidden');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Signing in…';

    const { data, error } = await DB.signIn(email, password);

    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-sign-in-alt"></i> Sign In';

    if (error) {
      errEl.textContent = error.message || 'Invalid email or password.';
      errEl.classList.remove('hidden');
      return;
    }

    this.currentUser = data.user;
    this.showApp();
  },

  async logout() {
    await DB.signOut();
    this.currentUser = null;
    this.showLogin();
  },

  // ─────────────────────────────────────────────
  // SHOW APP
  // ─────────────────────────────────────────────
  showApp() {
    document.getElementById('login-screen').classList.add('hidden');
    document.getElementById('app').classList.remove('hidden');

    // Set user info in sidebar
    const email = this.currentUser?.email || '';
    const name = email.split('@')[0].replace(/[._-]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    const initials = Utils.initials(name);

    const el = document.getElementById('sidebar-name');
    if (el) el.textContent = name;
    const av = document.getElementById('sidebar-avatar');
    if (av) av.textContent = initials;
    const tav = document.getElementById('topbar-avatar');
    if (tav) tav.textContent = initials;

    // Setup nav listeners
    document.querySelectorAll('.nav-item[data-page]').forEach(item => {
      item.addEventListener('click', (e) => {
        e.preventDefault();
        this.navigate(item.dataset.page);
        // Close sidebar on mobile
        if (window.innerWidth < 768) toggleSidebar();
      });
    });

    // Navigate to default page
    const hash = location.hash.replace('#', '') || 'dashboard';
    this.navigate(this.pages[hash] ? hash : 'dashboard');
  },

  // ─────────────────────────────────────────────
  // NAVIGATE
  // ─────────────────────────────────────────────
  navigate(page) {
    if (!this.pages[page]) return;
    this.currentPage = page;

    // Update nav active state
    document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
    const activeLink = document.querySelector(`.nav-item[data-page="${page}"]`);
    if (activeLink) activeLink.classList.add('active');

    // Update page title
    document.getElementById('page-title').textContent = this.pages[page].title;
    location.hash = page;

    // Render page
    const container = document.getElementById('page-container');
    container.innerHTML = `<div class="page-loading"><i class="fas fa-spinner fa-spin"></i><p>Loading…</p></div>`;
    this.pages[page].render();
  },
};

// ─────────────────────────────────────────────
// BOOT ON DOM READY
// ─────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => App.boot());
