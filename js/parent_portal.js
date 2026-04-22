/* ============================================================
   MINDS' CRAFT — PARENT PORTAL LOGIC
   ============================================================ */

const ParentPortal = {

  // ── state ──
  _sb:        null,   // supabase client
  _user:      null,   // auth user
  _profile:   null,   // public.users row
  _children:  [],     // student rows linked to this parent
  _enrollments: [],   // enrollments for all children
  _allocations: [],   // student_allocations for all children
  _attendance:  [],   // attendance records (filtered by period)
  _currentTab: 'children',
  _theme: 'dark',

  // period filter (attendance & packages tabs)
  _periodFrom: null,
  _periodTo:   null,

  // ── BOOT ──
  async boot() {
    // Init Supabase
    const url = SUPABASE_CONFIG.url;
    const key = SUPABASE_CONFIG.anonKey;
    if (!url || !key) {
      this._showError('Configuration error — contact admin.');
      return;
    }
    this._sb = supabase.createClient(url, key);

    // Theme from localStorage
    this._theme = localStorage.getItem('mc_theme') || 'dark';
    document.documentElement.setAttribute('data-theme', this._theme);
    this._syncThemeIcon();

    // Default period: current month
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    this._periodFrom = `${y}-${m}-01`;
    const lastDay = new Date(y, now.getMonth() + 1, 0).getDate();
    this._periodTo = `${y}-${m}-${String(lastDay).padStart(2, '0')}`;

    // Check existing session
    const { data: { session } } = await this._sb.auth.getSession();
    if (session?.user) {
      this._user = session.user;
      await this._loadProfile();
      if (this._profile?.user_type === 'parent') {
        try { await this._loadAllData(); } catch(e) { console.warn('Data load error:', e); }
        this._showApp();
      } else if (this._profile) {
        await this._sb.auth.signOut();
        this._showLogin();
        this._showError('This portal is for parents only. Please use the admin portal.');
      } else {
        this._showLogin();
      }
    } else {
      this._showLogin();
    }

    // Login form handler
    document.getElementById('login-form').addEventListener('submit', e => {
      e.preventDefault();
      this._handleLogin();
    });
  },

  async _handleLogin() {
    const email    = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value.trim();

    this._setLoginLoading(true);
    this._clearLoginError();

    try {
      // ── Step 1: Supabase Auth sign-in ──
      let { data, error } = await this._sb.auth.signInWithPassword({ email, password });

      if (error) {
        const msg = error.message.toLowerCase();

        // ── Auto-register: if account doesn't exist yet, try signUp ──
        if (msg.includes('invalid') || msg.includes('credentials') || msg.includes('not found')) {
          // Check if this email exists in public.users as a parent first
          const { data: publicRows } = await this._sb.from('users')
            .select('id, full_name, user_type, phone')
            .eq('email', email)
            .order('created_at', { ascending: false });

          const parentRow = publicRows?.find(r => r.user_type === 'parent');

          if (parentRow) {
            // Parent exists in DB — try auto-creating Supabase Auth account
            this._updateLoginStatus('Account not found in auth — creating it now…');
            const { data: signUpData, error: signUpErr } = await this._sb.auth.signUp({
              email,
              password,
              options: {
                data: {
                  user_type: 'parent',
                  full_name: parentRow.full_name,
                  public_user_id: parentRow.id
                }
              }
            });

            if (signUpErr) {
              // signUp also failed — show helpful message
              if (signUpErr.message.toLowerCase().includes('already registered') ||
                  signUpErr.message.toLowerCase().includes('user already')) {
                // Account exists but password is wrong
                this._showLoginError('Incorrect password. Your password is your mobile number (e.g. +96103455983 or 03455983). Contact admin if the issue persists.');
              } else {
                this._showLoginError('Could not create account: ' + signUpErr.message + '. Please contact admin.');
              }
              this._setLoginLoading(false);
              return;
            }

            if (signUpData?.user) {
              // signUp succeeded — now try signIn again
              this._updateLoginStatus('Account created — signing in…');
              const retry = await this._sb.auth.signInWithPassword({ email, password });
              if (retry.error) {
                // Signed up but can't sign in — likely email not confirmed
                this._showLoginError('Account created but email confirmation may be required. Please contact admin to activate your account.');
                this._setLoginLoading(false);
                return;
              }
              data  = retry.data;
              error = null;
            } else {
              this._showLoginError('Account setup incomplete. Please contact admin.');
              this._setLoginLoading(false);
              return;
            }
          } else {
            // Not in public.users as parent at all
            this._showLoginError('No parent account found for this email. Please contact admin.');
            this._setLoginLoading(false);
            return;
          }
        } else if (msg.includes('confirm') || msg.includes('verify')) {
          this._showLoginError('Your account needs email confirmation. Please contact admin to activate it.');
          this._setLoginLoading(false);
          return;
        } else {
          this._showLoginError('Login error: ' + error.message);
          this._setLoginLoading(false);
          return;
        }
      }

      this._user = data.user;

      // ── Step 2: Load profile (robust — handles UID mismatch & duplicates) ──
      await this._loadProfile();

      if (!this._profile) {
        this._showLoginError('Profile not found in database. Contact the admin.');
        await this._sb.auth.signOut();
        this._setLoginLoading(false);
        return;
      }
      if (this._profile.user_type !== 'parent') {
        this._showLoginError(`This portal is for parents only. Your account type is "${this._profile.user_type}".`);
        await this._sb.auth.signOut();
        this._setLoginLoading(false);
        return;
      }

      // ── Step 3: Load data (non-fatal — show app even if data partially fails) ──
      try {
        await this._loadAllData();
      } catch (dataErr) {
        console.warn('Data load partial error (continuing):', dataErr);
      }

      this._setLoginLoading(false);
      this._showApp();

    } catch (e) {
      console.error('Login exception:', e);
      this._showLoginError('Unexpected error: ' + (e.message || String(e)));
      this._setLoginLoading(false);
    }
  },

  async _loadProfile() {
    if (!this._user) return;
    this._profile = null;

    // Strategy 1: match by auth UID (works when migration synced the IDs)
    try {
      const { data, error } = await this._sb.from('users')
        .select('*').eq('id', this._user.id).maybeSingle();
      if (!error && data) { this._profile = data; return; }
    } catch(e) { /* try next */ }

    // Strategy 2: match by email — take the first 'parent' row, else any row
    try {
      const { data: rows } = await this._sb.from('users')
        .select('*').eq('email', this._user.email)
        .order('created_at', { ascending: false });
      if (rows && rows.length > 0) {
        // Prefer row with user_type='parent'
        this._profile = rows.find(r => r.user_type === 'parent') || rows[0];
      }
    } catch(e) { /* profile stays null */ }
  },

  async _loadAllData() {
    if (!this._profile) return;

    // 1. Load children (students linked to this parent)
    const { data: children } = await this._sb.from('users')
      .select('*')
      .eq('parent_id', this._profile.id)
      .eq('user_type', 'student')
      .order('full_name');
    this._children = children || [];

    if (this._children.length === 0) return;

    const childIds = this._children.map(c => c.id);

    // 2. Load enrollments (with level + course info)
    const { data: enrollments } = await this._sb.from('enrollments')
      .select('*, level:level_id(id, name, day_of_week, start_time, end_time, course:course_id(id, name))')
      .in('student_id', childIds)
      .eq('status', 'active')
      .order('enrolled_at', { ascending: false });
    this._enrollments = enrollments || [];

    // 3. Load allocations (packages)
    const { data: allocs } = await this._sb.from('student_allocations')
      .select('*, package:package_id(id, name, base_price, duration_months)')
      .in('student_id', childIds)
      .order('end_date', { ascending: false });
    this._allocations = allocs || [];

    // 4. Load attendance for period
    await this._loadAttendance();
  },

  async _loadAttendance() {
    if (!this._children.length) return;
    const childIds = this._children.map(c => c.id);

    let q = this._sb.from('attendance')
      .select('*, level:level_id(id, name, course:course_id(id, name))')
      .in('student_id', childIds)
      .order('date', { ascending: false });

    if (this._periodFrom) q = q.gte('date', this._periodFrom);
    if (this._periodTo)   q = q.lte('date', this._periodTo);

    const { data } = await q;
    this._attendance = data || [];
  },

  // ── APP DISPLAY ──
  _showLogin() {
    document.getElementById('login-screen').classList.add('active');
    document.getElementById('app-screen').classList.remove('active');
  },

  _showApp() {
    document.getElementById('login-screen').classList.remove('active');
    document.getElementById('app-screen').classList.add('active');

    // Topbar
    const name = this._profile?.full_name || 'Parent';
    document.getElementById('topbar-name').textContent = name.split(' ')[0];
    document.getElementById('topbar-avatar').textContent = name.charAt(0).toUpperCase();
    document.getElementById('topbar-avatar').style.background =
      this._profile?.avatar_color || '#22c55e';

    this.showTab('children');
  },

  showTab(tab) {
    this._currentTab = tab;

    // Update tab buttons
    document.querySelectorAll('.nav-tab').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === tab);
    });

    // Show/hide panels
    ['children', 'attendance', 'packages'].forEach(t => {
      const el = document.getElementById(`tab-${t}`);
      if (t === tab) {
        el.classList.remove('hidden');
        this._renderTab(t);
      } else {
        el.classList.add('hidden');
      }
    });
  },

  _renderTab(tab) {
    if (tab === 'children')   this._renderChildren();
    if (tab === 'attendance') this._renderAttendance();
    if (tab === 'packages')   this._renderPackages();
  },

  // ── TAB: MY CHILDREN ──
  _renderChildren() {
    const el = document.getElementById('tab-children');

    if (!this._children.length) {
      el.innerHTML = `
        <div class="empty-state">
          <i class="fas fa-child"></i>
          <p>No students linked to your account yet.<br>Contact the admin to link your children.</p>
        </div>`;
      return;
    }

    let html = `<h2 class="section-title"><i class="fas fa-child"></i> My Children (${this._children.length})</h2>`;

    for (const child of this._children) {
      const enrolls = this._enrollments.filter(e => e.student_id === child.id);
      const activeAlloc = this._allocations.find(a =>
        a.student_id === child.id && a.status === 'active'
      );
      const pkgStatus = this._packageStatusBadge(activeAlloc);
      const initials = (child.full_name || '?').split(' ').map(w => w[0]).join('').slice(0,2).toUpperCase();
      const color = child.avatar_color || '#22c55e';

      html += `
        <div class="student-card">
          <div class="student-header">
            <div class="avatar-md" style="background:${color}">${initials}</div>
            <div>
              <div class="student-name">${this._esc(child.full_name)}</div>
              <div class="student-meta">
                ${child.birthday ? 'Born: ' + this._fmtDate(child.birthday) + ' &nbsp;·&nbsp;' : ''}
                ${enrolls.length} course${enrolls.length !== 1 ? 's' : ''} enrolled
              </div>
            </div>
            <div style="margin-left:auto">${pkgStatus}</div>
          </div>

          ${enrolls.length ? `
          <div style="margin-bottom:.5rem;font-size:.78rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:.04em;font-weight:500;">Enrolled Courses</div>
          <div class="enrollment-list">
            ${enrolls.map(e => {
              const level = e.level;
              const course = level?.course;
              const timeStr = level?.start_time
                ? ` · ${level.start_time.slice(0,5)}${level.end_time ? '–'+level.end_time.slice(0,5) : ''}`
                : '';
              const dayStr = level?.day_of_week ? level.day_of_week + timeStr : '';
              return `<span class="enroll-chip">
                <i class="fas fa-book-open"></i>
                ${this._esc(course?.name || 'Course')} — ${this._esc(level?.name || 'Level')}
                ${dayStr ? `<span style="color:var(--text-muted)">(${dayStr})</span>` : ''}
              </span>`;
            }).join('')}
          </div>` : `<p style="font-size:.82rem;color:var(--text-muted)">No active enrollments.</p>`}
        </div>`;
    }

    el.innerHTML = html;
  },

  // ── TAB: ATTENDANCE ──
  _renderAttendance() {
    const el = document.getElementById('tab-attendance');

    // Period filter UI
    let html = `
      <h2 class="section-title"><i class="fas fa-calendar-check"></i> Attendance</h2>
      <div class="filter-row">
        <span class="filter-label">From</span>
        <input type="date" class="filter-input" id="att-from" value="${this._periodFrom || ''}" onchange="ParentPortal._onPeriodChange()" />
        <span class="filter-label">To</span>
        <input type="date" class="filter-input" id="att-to" value="${this._periodTo || ''}" onchange="ParentPortal._onPeriodChange()" />
        <button class="btn-sm" onclick="ParentPortal._resetPeriod()">This Month</button>
      </div>`;

    if (!this._children.length) {
      el.innerHTML = html + `<div class="empty-state"><i class="fas fa-user-slash"></i><p>No children linked.</p></div>`;
      return;
    }

    // Student selector (if multiple children)
    if (this._children.length > 1) {
      html += `<div class="student-selector" id="att-student-selector">
        <button class="student-btn active" data-sid="all" onclick="ParentPortal._filterAttStudent('all', this)">All</button>
        ${this._children.map(c => `
          <button class="student-btn" data-sid="${c.id}" onclick="ParentPortal._filterAttStudent('${c.id}', this)">
            ${this._esc(c.full_name.split(' ')[0])}
          </button>`).join('')}
      </div>`;
    }

    html += `<div id="att-table-container"></div>`;
    el.innerHTML = html;
    this._renderAttTable('all');
  },

  _filterAttStudent(sid, btn) {
    document.querySelectorAll('#att-student-selector .student-btn').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
    this._renderAttTable(sid);
  },

  _renderAttTable(sid) {
    const container = document.getElementById('att-table-container');
    if (!container) return;

    const records = sid === 'all'
      ? this._attendance
      : this._attendance.filter(a => a.student_id === sid);

    if (!records.length) {
      container.innerHTML = `<div class="empty-state"><i class="fas fa-calendar-times"></i><p>No attendance records for this period.</p></div>`;
      return;
    }

    // Summary
    const present = records.filter(r => r.status === 'present').length;
    const late    = records.filter(r => r.status === 'late').length;
    const absent  = records.filter(r => r.status === 'absent').length;
    const total   = records.length;
    const rate    = total ? Math.round((present + late) / total * 100) : 0;

    container.innerHTML = `
      <div class="summary-chips">
        <div class="chip">Total <strong>${total}</strong></div>
        <div class="chip">Present <strong style="color:var(--brand-primary)">${present}</strong></div>
        <div class="chip">Late <strong style="color:#f59e0b">${late}</strong></div>
        <div class="chip">Absent <strong style="color:#ef4444">${absent}</strong></div>
        <div class="chip">Rate <strong style="color:${rate>=80?'var(--brand-primary)':rate>=60?'#f59e0b':'#ef4444'}">${rate}%</strong></div>
      </div>
      <div class="card" style="padding:0;overflow:hidden">
        <table class="att-table">
          <thead>
            <tr>
              <th>Date</th>
              ${this._children.length > 1 ? '<th>Student</th>' : ''}
              <th>Course / Level</th>
              <th>Status</th>
              <th>Check-in</th>
            </tr>
          </thead>
          <tbody>
            ${records.map(r => {
              const child = this._children.find(c => c.id === r.student_id);
              const level = r.level;
              const course = level?.course;
              const statusBadge = this._attStatusBadge(r.status);
              return `<tr>
                <td>${this._fmtDate(r.date)}</td>
                ${this._children.length > 1 ? `<td>${this._esc(child?.full_name || '—')}</td>` : ''}
                <td>
                  <div style="font-weight:500">${this._esc(level?.name || '—')}</div>
                  <div style="font-size:.74rem;color:var(--text-muted)">${this._esc(course?.name || '')}</div>
                </td>
                <td>${statusBadge}</td>
                <td style="color:var(--text-muted)">${r.checkin_time ? r.checkin_time.slice(0,5) : '—'}</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>`;
  },

  async _onPeriodChange() {
    this._periodFrom = document.getElementById('att-from')?.value || null;
    this._periodTo   = document.getElementById('att-to')?.value   || null;
    await this._loadAttendance();
    if (this._currentTab === 'attendance') this._renderAttendance();
  },

  _resetPeriod() {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    this._periodFrom = `${y}-${m}-01`;
    const lastDay = new Date(y, now.getMonth() + 1, 0).getDate();
    this._periodTo = `${y}-${m}-${String(lastDay).padStart(2, '0')}`;
    this._onPeriodChange();
  },

  // ── TAB: PACKAGES ──
  _renderPackages() {
    const el = document.getElementById('tab-packages');

    if (!this._children.length) {
      el.innerHTML = `<div class="empty-state"><i class="fas fa-box-open"></i><p>No children linked.</p></div>`;
      return;
    }

    let html = `<h2 class="section-title"><i class="fas fa-box"></i> Packages & Subscriptions</h2>`;

    for (const child of this._children) {
      const allocs = this._allocations.filter(a => a.student_id === child.id);
      const initials = (child.full_name || '?').split(' ').map(w => w[0]).join('').slice(0,2).toUpperCase();
      const color = child.avatar_color || '#22c55e';

      html += `
        <div class="student-card">
          <div class="student-header">
            <div class="avatar-md" style="background:${color}">${initials}</div>
            <div>
              <div class="student-name">${this._esc(child.full_name)}</div>
              <div class="student-meta">${allocs.length} package record${allocs.length !== 1 ? 's' : ''}</div>
            </div>
          </div>`;

      if (!allocs.length) {
        html += `<p style="font-size:.82rem;color:var(--text-muted)">No package records found.</p>`;
      } else {
        for (const a of allocs) {
          const pkg = a.package;
          const statusBadge = this._allocStatusBadge(a);
          const daysLeft = this._daysLeft(a.end_date);
          const dur = pkg?.duration_months
            ? `${pkg.duration_months} month${pkg.duration_months > 1 ? 's' : ''}`
            : '—';

          html += `
            <div class="pkg-card">
              <div class="pkg-row">
                <div>
                  <div class="pkg-name">${this._esc(pkg?.name || 'Package')}</div>
                  <div class="pkg-meta">Duration: ${dur} &nbsp;·&nbsp; ${this._fmtDate(a.start_date)} → ${this._fmtDate(a.end_date)}</div>
                </div>
                <div style="text-align:right">
                  ${statusBadge}
                  <div style="font-size:.78rem;color:var(--text-muted);margin-top:.25rem">
                    ${a.status === 'active' && daysLeft >= 0 ? `${daysLeft}d remaining` : ''}
                  </div>
                </div>
              </div>
              <div style="margin-top:.65rem;display:flex;flex-wrap:wrap;gap:.5rem">
                <span class="chip">Paid: <strong>$${Number(a.price_paid || 0).toFixed(2)}</strong></span>
                ${a.discount_pct > 0 ? `<span class="chip">Discount: <strong>${a.discount_pct}%</strong></span>` : ''}
                ${pkg?.base_price ? `<span class="chip">Base price: <strong>$${Number(pkg.base_price).toFixed(2)}</strong></span>` : ''}
              </div>
              ${a.notes ? `<div style="margin-top:.5rem;font-size:.78rem;color:var(--text-muted)">${this._esc(a.notes)}</div>` : ''}
            </div>`;
        }
      }

      html += `</div>`;
    }

    el.innerHTML = html;
  },

  // ── HELPERS ──
  _packageStatusBadge(alloc) {
    if (!alloc) return `<span class="badge badge-gray">No package</span>`;
    if (alloc.status === 'cancelled') return `<span class="badge badge-gray">Cancelled</span>`;
    if (alloc.status === 'expired')   return `<span class="badge badge-red">Expired</span>`;
    const days = this._daysLeft(alloc.end_date);
    if (days < 0) return `<span class="badge badge-red">Expired</span>`;
    if (days <= 7) return `<span class="badge badge-orange"><i class="fas fa-clock"></i> ${days}d left</span>`;
    return `<span class="badge badge-green"><i class="fas fa-check-circle"></i> Active</span>`;
  },

  _allocStatusBadge(alloc) {
    if (alloc.status === 'cancelled') return `<span class="badge badge-gray">Cancelled</span>`;
    if (alloc.status === 'expired')   return `<span class="badge badge-red">Expired</span>`;
    const days = this._daysLeft(alloc.end_date);
    if (days < 0) return `<span class="badge badge-red">Expired</span>`;
    if (days <= 7) return `<span class="badge badge-orange">${days}d left</span>`;
    return `<span class="badge badge-green">Active</span>`;
  },

  _attStatusBadge(status) {
    if (status === 'present') return `<span class="badge badge-green"><i class="fas fa-check"></i> Present</span>`;
    if (status === 'late')    return `<span class="badge badge-orange"><i class="fas fa-clock"></i> Late</span>`;
    if (status === 'absent')  return `<span class="badge badge-red"><i class="fas fa-times"></i> Absent</span>`;
    return `<span class="badge badge-gray">${status || '—'}</span>`;
  },

  _daysLeft(dateStr) {
    if (!dateStr) return -999;
    const end = new Date(dateStr);
    end.setHours(23, 59, 59, 999);
    return Math.ceil((end - Date.now()) / 86400000);
  },

  _fmtDate(str) {
    if (!str) return '—';
    try {
      const d = new Date(str);
      return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    } catch { return str; }
  },

  _esc(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  },

  // ── THEME ──
  toggleTheme() {
    this._theme = this._theme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', this._theme);
    localStorage.setItem('mc_theme', this._theme);
    this._syncThemeIcon();
  },

  _syncThemeIcon() {
    const icon = document.getElementById('theme-icon');
    if (!icon) return;
    icon.className = this._theme === 'dark' ? 'fas fa-sun' : 'fas fa-moon';
  },

  // ── AUTH ──
  async logout() {
    await this._sb.auth.signOut();
    this._user = null;
    this._profile = null;
    this._children = [];
    this._enrollments = [];
    this._allocations = [];
    this._attendance = [];
    this._showLogin();
    this._toast('Signed out successfully.', 'success');
  },

  // ── LOGIN UI HELPERS ──
  _setLoginLoading(loading) {
    const btn = document.getElementById('login-btn');
    const txt = document.getElementById('login-btn-text');
    if (!btn) return;
    btn.disabled = loading;
    if (!loading) txt.textContent = 'Sign In';
    else if (txt.textContent === 'Sign In') txt.textContent = 'Signing in…';
    // else: keep whatever status message was set by _updateLoginStatus
  },

  _updateLoginStatus(msg) {
    const txt = document.getElementById('login-btn-text');
    if (txt) txt.textContent = msg;
  },

  _showLoginError(msg) {
    const el = document.getElementById('login-error');
    if (!el) return;
    el.textContent = msg;
    el.classList.remove('hidden');
  },

  _clearLoginError() {
    const el = document.getElementById('login-error');
    if (el) el.classList.add('hidden');
  },

  _showError(msg) {
    const el = document.getElementById('login-error');
    if (el) { el.textContent = msg; el.classList.remove('hidden'); }
  },

  // ── TOAST ──
  _toast(msg, type = 'success') {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const div = document.createElement('div');
    div.className = `toast ${type}`;
    div.innerHTML = `<i class="fas fa-${type === 'success' ? 'check-circle' : 'exclamation-circle'}" style="color:${type === 'success' ? 'var(--brand-primary)' : 'var(--brand-danger)'}"></i> ${msg}`;
    container.appendChild(div);
    setTimeout(() => div.remove(), 4000);
  },
};
