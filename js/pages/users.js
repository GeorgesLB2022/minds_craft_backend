/* ============================================================
   MINDS' CRAFT — USERS PAGE
   ============================================================ */

const UsersPage = {
  currentTab: 'all',
  searchQuery: '',
  allUsers: [],

  async render() {
    const container = document.getElementById('page-container');
    container.innerHTML = `
      <div class="page-header">
        <div class="page-header-left">
          <h2>User Management</h2>
          <p>Manage all users, roles, and subscriptions in one place.</p>
        </div>
        <div class="page-header-actions">
          <button class="btn btn-secondary btn-sm" onclick="UsersPage.initBirthdays()">
            <i class="fas fa-birthday-cake"></i> Birthday Check
          </button>
          <button class="btn btn-primary" onclick="UsersPage.openAddModal()">
            <i class="fas fa-plus"></i> Add New User
          </button>
        </div>
      </div>

      <div class="tabs" id="users-tabs">
        <button class="tab-btn active" data-tab="all" onclick="UsersPage.switchTab('all', this)">All Users</button>
        <button class="tab-btn" data-tab="parent" onclick="UsersPage.switchTab('parent', this)">Parents</button>
        <button class="tab-btn" data-tab="student" onclick="UsersPage.switchTab('student', this)">Students</button>
        <button class="tab-btn" data-tab="staff" onclick="UsersPage.switchTab('staff', this)">Staff</button>
        <button class="tab-btn" data-tab="admin" onclick="UsersPage.switchTab('admin', this)">Admins</button>
      </div>

      <div class="action-row">
        <div class="action-row-left">
          <div class="search-input-wrap">
            <i class="fas fa-search"></i>
            <input type="text" placeholder="Search users…" id="users-search"
              oninput="UsersPage.search(this.value)" />
          </div>
        </div>
        <div class="action-row-right" id="users-count-wrap">
          <span class="text-muted text-sm" id="users-count"></span>
        </div>
      </div>

      <div class="card" style="padding:0;overflow:hidden">
        <div class="table-wrap">
          <table class="table" id="users-table">
            <thead>
              <tr>
                <th>User</th>
                <th>Role</th>
                <th>Contact</th>
                <th>Status</th>
                <th>Subscription</th>
                <th>Joined</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody id="users-tbody">
              <tr><td colspan="7" class="text-center"><i class="fas fa-spinner fa-spin"></i> Loading…</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    `;

    await this.loadUsers();
  },

  async loadUsers() {
    try {
      // ── Fetch ALL users with no FK join (avoids silent row-drops from broken parent_id refs) ──
      const { data, error } = await DB.getAll('users', {
        select: '*',
        order: 'created_at',
        asc: false,
        limit: 2000,          // explicit high limit — PostgREST default is 1000
      });

      if (error) {
        console.error('[Users] Supabase error:', error.code, error.message, error.details, error.hint);
        const msg = error.message || error.code || 'Unknown Supabase error';
        Toast.error('Failed to load users: ' + msg);
        document.getElementById('users-tbody').innerHTML =
          `<tr><td colspan="7" class="text-center text-muted">
             <i class="fas fa-exclamation-triangle" style="color:var(--brand-danger)"></i>
             Supabase error: ${Utils.esc(msg)}
             <br><small style="font-size:10px;opacity:.7">${Utils.esc(error.hint || error.details || '')}</small>
           </td></tr>`;
        return;
      }

      const allRows = data || [];

      // ── Build parent lookup map in-memory (no FK join needed) ──
      // Maps parent_id UUID → { id, full_name } using the same dataset
      const parentMap = {};
      allRows.forEach(u => { parentMap[u.id] = u; });

      // Attach parent info to each student row client-side
      this.allUsers = allRows.map(u => {
        if (u.user_type === 'student' && u.parent_id && parentMap[u.parent_id]) {
          return {
            ...u,
            parent: {
              id:        parentMap[u.parent_id].id,
              full_name: parentMap[u.parent_id].full_name,
            }
          };
        }
        return u;
      });

      this.renderTable();

    } catch (err) {
      console.error('[Users] JS exception:', err);
      Toast.error('Failed to load users: ' + (err.message || err));
      document.getElementById('users-tbody').innerHTML =
        `<tr><td colspan="7" class="text-center text-muted">Error: ${Utils.esc(err.message || String(err))}</td></tr>`;
    }
  },

  switchTab(tab, btn) {
    this.currentTab = tab;
    document.querySelectorAll('#users-tabs .tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    this.renderTable();
  },

  search(val) {
    this.searchQuery = val.toLowerCase();
    this.renderTable();
  },

  getFilteredUsers() {
    let users = this.allUsers;
    if (this.currentTab !== 'all') users = users.filter(u => u.user_type === this.currentTab);
    if (this.searchQuery) {
      users = users.filter(u =>
        (u.full_name || '').toLowerCase().includes(this.searchQuery) ||
        (u.email || '').toLowerCase().includes(this.searchQuery) ||
        (u.phone || '').toLowerCase().includes(this.searchQuery)
      );
    }
    return users;
  },

  renderTable() {
    const tbody = document.getElementById('users-tbody');
    const countEl = document.getElementById('users-count');
    if (!tbody) return;

    const users = this.getFilteredUsers();

    // Show count + per-type breakdown when on "All" tab
    if (countEl) {
      if (this.currentTab === 'all' && !this.searchQuery) {
        const counts = { parent: 0, student: 0, staff: 0, admin: 0 };
        this.allUsers.forEach(u => { if (counts[u.user_type] !== undefined) counts[u.user_type]++; });
        countEl.innerHTML =
          `<strong>${this.allUsers.length}</strong> total &nbsp;·&nbsp; ` +
          `${counts.parent} parent${counts.parent!==1?'s':''} &nbsp;·&nbsp; ` +
          `${counts.student} student${counts.student!==1?'s':''} &nbsp;·&nbsp; ` +
          `${counts.staff} staff &nbsp;·&nbsp; ` +
          `${counts.admin} admin${counts.admin!==1?'s':''}`;
      } else {
        countEl.textContent = `${users.length} user${users.length !== 1 ? 's' : ''}`;
      }
    }

    if (!users.length) {
      tbody.innerHTML = `<tr><td colspan="7"><div class="empty-state"><i class="fas fa-users"></i><h3>No users found</h3><p>Try a different search or add a new user.</p></div></td></tr>`;
      return;
    }

    tbody.innerHTML = users.map(u => {
      const initials = Utils.initials(u.full_name);
      const color    = u.avatar_color || Utils.avatarColor(u.full_name);
      const avatarHTML = u.avatar_url
        ? `<div class="users-table-avatar" style="background:transparent;padding:0;overflow:hidden">
             <img src="${Utils.esc(u.avatar_url)}" alt="${Utils.esc(initials)}"
               style="width:100%;height:100%;object-fit:cover;border-radius:50%" />
           </div>`
        : `<div class="users-table-avatar" style="background:${Utils.esc(color)}">${Utils.esc(initials)}</div>`;
      const parentInfo = u.user_type === 'student' && u.parent ? `<span class="text-xs text-muted">Parent: ${Utils.esc(u.parent.full_name)}</span>` : '';
      return `
        <tr>
          <td>
            <div class="users-table-info">
              ${avatarHTML}
              <div>
                <div class="users-table-name">${Utils.esc(u.full_name)}</div>
                ${parentInfo}
              </div>
            </div>
          </td>
          <td>${Utils.roleBadge(u.user_type)}</td>
          <td>
            <div style="font-size:var(--font-size-sm)">${Utils.esc(u.email || '—')}</div>
            <div style="font-size:var(--font-size-xs);color:var(--text-muted)">${Utils.esc(u.phone || '')}</div>
          </td>
          <td>${Utils.statusBadge(u.status)}</td>
          <td>${Utils.statusBadge(u.subscription || 'basic')}</td>
          <td><span style="font-size:var(--font-size-sm)">${Utils.formatDate(u.created_at)}</span></td>
          <td>
            <div style="display:flex;gap:6px">
              <button class="btn btn-ghost btn-icon btn-sm" title="Edit" onclick="UsersPage.openEditModal('${u.id}')">
                <i class="fas fa-edit"></i>
              </button>
              <button class="btn btn-danger btn-icon btn-sm" title="Delete" onclick="UsersPage.deleteUser('${u.id}', '${Utils.esc(u.full_name)}')">
                <i class="fas fa-trash"></i>
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
  },

  openAddModal() {
    const parents = this.allUsers.filter(u => u.user_type === 'parent');
    Modal.open('Add New User', this.userFormHTML(null, parents), { size: 'lg' });
  },

  openEditModal(id) {
    const user = this.allUsers.find(u => u.id === id);
    if (!user) return Toast.error('User not found');
    const parents = this.allUsers.filter(u => u.user_type === 'parent');
    Modal.open('Edit User', this.userFormHTML(user, parents), { size: 'lg' });
  },

  userFormHTML(user, parents) {
    const isStudent = user?.user_type === 'student';
    const avatarUrl = user?.avatar_url || '';
    const color     = user?.avatar_color || Utils.avatarColor(user?.full_name || '');
    const initials  = Utils.initials(user?.full_name || '');
    return `
      <form onsubmit="UsersPage.saveUser(event, ${user ? `'${user.id}'` : 'null'})">

        <!-- ── Photo upload ── -->
        <div class="form-group" style="margin-bottom:1.2rem">
          <label class="form-label">Profile Photo <span style="color:var(--text-muted);font-weight:400">(optional)</span></label>
          <div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap">

            <!-- Live avatar preview -->
            <div id="user-avatar-preview"
              style="width:72px;height:72px;border-radius:50%;overflow:hidden;flex-shrink:0;
                border:2px solid var(--border-color);display:flex;align-items:center;
                justify-content:center;font-size:22px;font-weight:700;color:#fff;
                background:${avatarUrl ? 'transparent' : color}">
              ${avatarUrl
                ? `<img src="${Utils.esc(avatarUrl)}" style="width:100%;height:100%;object-fit:cover" />`
                : initials || '<i class="fas fa-user"></i>'}
            </div>

            <div style="flex:1;min-width:180px">
              <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:6px">
                <label class="btn btn-secondary btn-sm" style="cursor:pointer;margin:0">
                  <i class="fas fa-upload"></i> Upload Photo
                  <input type="file" id="user-photo-file" accept="image/*" style="display:none"
                    onchange="UsersPage.handlePhotoFile(this)" />
                </label>
                <button type="button" class="btn btn-ghost btn-sm" onclick="UsersPage.clearPhoto()">
                  <i class="fas fa-times"></i> Clear
                </button>
              </div>
              <p style="font-size:var(--font-size-xs);color:var(--text-muted);margin:0">
                PNG, JPG, WebP · auto-compressed to 400×400px JPEG · max 10 MB input
              </p>
            </div>
          </div>
          <!-- Hidden field holding the photo data URL -->
          <input type="hidden" id="user-avatar-url" name="avatar_url" value="${Utils.esc(avatarUrl)}" />
        </div>

        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Full Name *</label>
            <input type="text" name="full_name" class="form-input" required value="${Utils.esc(user?.full_name || '')}" placeholder="e.g. Ahmad Karimi" />
          </div>
          <div class="form-group">
            <label class="form-label">Role *</label>
            <select name="user_type" class="form-select" onchange="UsersPage.onRoleChange(this)">
              <option value="parent" ${user?.user_type==='parent'?'selected':''}>Parent</option>
              <option value="student" ${user?.user_type==='student'?'selected':''}>Student</option>
              <option value="staff" ${user?.user_type==='staff'?'selected':''}>Staff</option>
              <option value="admin" ${user?.user_type==='admin'?'selected':''}>Admin</option>
            </select>
          </div>
        </div>
        <div class="form-row" id="student-fields" style="${!isStudent?'display:none':''}">
          <div class="form-group">
            <label class="form-label">Connect to Parent</label>
            <select name="parent_id" class="form-select">
              <option value="">— Select Parent —</option>
              ${parents.map(p => `<option value="${p.id}" ${user?.parent_id===p.id?'selected':''}>${Utils.esc(p.full_name)}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Birthday</label>
            <input type="date" name="birthday" class="form-input" value="${user?.birthday || ''}" />
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Email Address</label>
            <input type="email" name="email" class="form-input" value="${Utils.esc(user?.email || '')}" placeholder="user@example.com" />
          </div>
          <div class="form-group">
            <label class="form-label">Phone Number</label>
            <input type="tel" name="phone" class="form-input" value="${Utils.esc(user?.phone || '')}" placeholder="+961 XX XXX XXX" />
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Status</label>
            <select name="status" class="form-select">
              <option value="active" ${user?.status==='active'?'selected':''}>Active</option>
              <option value="inactive" ${user?.status==='inactive'?'selected':''}>Inactive</option>
              <option value="suspended" ${user?.status==='suspended'?'selected':''}>Suspended</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Subscription</label>
            <select name="subscription" class="form-select">
              <option value="basic" ${user?.subscription==='basic'?'selected':''}>Basic</option>
              <option value="premium" ${user?.subscription==='premium'?'selected':''}>Premium</option>
              <option value="trial" ${user?.subscription==='trial'?'selected':''}>Trial</option>
            </select>
          </div>
        </div>
        ${!user ? `
        <div class="form-group" id="app-password-group">
          <label class="form-label">
            Portal Password
            <span style="color:var(--text-muted);font-weight:400;font-size:.8rem">
              — used to log in to the parent / staff portal
            </span>
          </label>
          <div style="display:flex;gap:8px;align-items:center">
            <input type="text" name="app_password" id="app_password_input" class="form-input"
              placeholder="Leave blank to auto-generate from phone number"
              style="font-family:monospace;letter-spacing:.04em" />
            <button type="button" class="btn btn-secondary btn-sm" style="white-space:nowrap"
              onclick="UsersPage.autoFillPassword()">
              <i class="fas fa-magic"></i> Auto
            </button>
          </div>
          <p style="font-size:.75rem;color:var(--text-muted);margin-top:4px">
            💡 If left blank and a phone number is entered, the phone number will be used as password.
            For parents, a Supabase Auth account is also created automatically so they can log in to the parent portal.
          </p>
        </div>` : `
        <div class="form-group">
          <label class="form-label">Reset Portal Password <span style="color:var(--text-muted);font-weight:400">(optional)</span></label>
          <input type="text" name="app_password" id="app_password_input" class="form-input"
            placeholder="Leave blank to keep current password"
            style="font-family:monospace;letter-spacing:.04em" />
          <p style="font-size:.75rem;color:var(--text-muted);margin-top:4px">
            Only fill this to change the password. For parents this also updates their Supabase Auth account.
          </p>
        </div>`}
        <div class="form-group">
          <label class="form-label">Notes</label>
          <textarea name="notes" class="form-textarea" placeholder="Any additional notes…">${Utils.esc(user?.notes || '')}</textarea>
        </div>
        <div class="modal-footer" style="padding:0;border:none;margin-top:1rem">
          <button type="button" class="btn btn-secondary" onclick="Modal.close()">Cancel</button>
          <button type="submit" class="btn btn-primary">
            <i class="fas fa-save"></i> ${user ? 'Save Changes' : 'Create User'}
          </button>
        </div>
      </form>
    `;
  },

  // ── Photo upload helpers ──────────────────────────────────────
  handlePhotoFile(input) {
    const file = input.files?.[0];
    if (!file) return;

    // Accept any size — we compress down automatically.
    // Hard reject only absurdly large files (> 10 MB) to avoid browser freeze.
    if (file.size > 10 * 1024 * 1024) {
      return Toast.error('Photo too large — max 10 MB accepted for auto-compression');
    }

    const reader = new FileReader();
    reader.onload = e => {
      const img = new Image();
      img.onload = () => {
        // ── Compress via canvas ──────────────────────────────────
        // Target: max 400×400 px, JPEG quality 0.82
        // Result is always well under 200 KB — safe for DB storage.
        const MAX_PX  = 400;
        const QUALITY = 0.82;
        let { width, height } = img;

        if (width > MAX_PX || height > MAX_PX) {
          if (width > height) { height = Math.round(height * MAX_PX / width);  width = MAX_PX; }
          else                { width  = Math.round(width  * MAX_PX / height); height = MAX_PX; }
        }

        const canvas = document.createElement('canvas');
        canvas.width  = width;
        canvas.height = height;
        canvas.getContext('2d').drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL('image/jpeg', QUALITY);

        // Show compressed size hint
        const kb = Math.round(dataUrl.length * 0.75 / 1024);
        Toast.success(`Photo compressed to ~${kb} KB (${width}×${height}px)`);

        // Update hidden field + preview
        const hidden  = document.getElementById('user-avatar-url');
        const preview = document.getElementById('user-avatar-preview');
        if (hidden)  hidden.value = dataUrl;
        if (preview) {
          preview.style.background = 'transparent';
          preview.innerHTML = `<img src="${dataUrl}"
            style="width:100%;height:100%;object-fit:cover" />`;
        }
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  },

  clearPhoto() {
    const hidden  = document.getElementById('user-avatar-url');
    const preview = document.getElementById('user-avatar-preview');
    const fileInput = document.getElementById('user-photo-file');
    if (hidden)    hidden.value = '';
    if (fileInput) fileInput.value = '';
    if (preview) {
      preview.style.background = 'var(--bg-tertiary)';
      preview.innerHTML = '<i class="fas fa-user" style="color:var(--text-muted)"></i>';
    }
  },

  onRoleChange(select) {
    const fields = document.getElementById('student-fields');
    if (fields) {
      fields.style.display = select.value === 'student' ? '' : 'none';
    }
  },

  // ── Helper: auto-fill the password field from the phone number ──────────
  autoFillPassword() {
    const phoneInput = document.querySelector('[name="phone"]');
    const pwInput    = document.getElementById('app_password_input');
    if (!pwInput) return;
    const phone = phoneInput?.value?.trim() || '';
    if (phone) {
      pwInput.value = phone;
      pwInput.style.background = 'rgba(34,197,94,.07)';
      pwInput.style.borderColor = 'var(--brand-primary)';
    } else {
      Toast.warning('Enter a phone number first.');
    }
  },

  // ── Helper: normalize a phone number to +961XXXXXXXX format ───────────────
  // Ensures the password is always in the canonical international format
  // regardless of how the admin typed the number.
  _normalizePhone(raw) {
    if (!raw) return null;
    let digits = raw.replace(/[^\d]/g, ''); // strip everything except digits

    // Lebanese number heuristics:
    // 96170178043  → +96170178043
    // 70178043     → +96170178043   (8-digit local, prefix +961)
    // 070178043    → +96170178043   (leading 0, strip it then prefix +961)
    // 0096170178043 → +96170178043  (00 international prefix)
    if (digits.startsWith('00961')) digits = digits.slice(2);      // 00961… → 961…
    if (digits.startsWith('961'))   return '+' + digits;           // already has country code
    if (digits.startsWith('0'))     digits = digits.slice(1);      // strip leading 0
    if (digits.length >= 7)         return '+961' + digits;        // local → international
    return '+' + digits; // fallback — just add +
  },

  // ── Helper: generate a random 10-char alphanumeric password ──────────────
  _generateRandPassword() {
    const chars = 'abcdefghjkmnpqrstuvwxyz23456789';
    return Array.from({ length: 10 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  },

  // ── Helper: attempt Supabase Auth signUp for a parent ────────────────────
  // Password is always the normalized phone (+961XXXXXXXX).
  // Returns { authId, password, alreadyExists } or throws.
  //
  // KEY FIX: when alreadyExists=true we immediately look up the real auth_id
  // via the Admin API (listUsers) so it can be saved to public.users.auth_id.
  // Without this, alreadyExists parents would have auth_id=NULL forever and
  // never receive push notifications.
  async _createParentAuthAccount(email, password, fullName, publicUserId) {
    if (!email)    throw new Error('Email is required to create a parent portal login.');
    if (!password) throw new Error('Password (phone number) is required.');
    if (!DB.client) throw new Error('Supabase client not initialised.');

    // Supabase requires ≥ 6 characters
    if (password.length < 6) {
      throw new Error(`Password too short (${password.length} chars). Phone number must be at least 6 digits.`);
    }

    const { data, error } = await DB.client.auth.signUp({
      email,
      password,
      options: {
        data: {
          user_type:      'parent',
          full_name:      fullName,
          public_user_id: publicUserId,
        },
      },
    });

    if (error) {
      const msg = error.message.toLowerCase();
      if (msg.includes('already registered') || msg.includes('user already')) {
        // Account exists in Supabase Auth — look up its real UUID via Admin API
        // so we can write it into public.users.auth_id (critical for push to work).
        let existingAuthId = null;
        try {
          const { data: listData } = await DB.client.auth.admin.listUsers({ perPage: 1000 });
          const match = (listData?.users || []).find(
            u => (u.email || '').toLowerCase() === email.toLowerCase()
          );
          existingAuthId = match?.id || null;
          if (existingAuthId) {
            console.info('[createParent] alreadyExists — resolved auth_id via Admin API:', existingAuthId);
          } else {
            console.warn('[createParent] alreadyExists but Admin API found no match for:', email);
          }
        } catch (adminErr) {
          console.warn('[createParent] Admin API lookup failed (alreadyExists):', adminErr.message);
        }
        return { alreadyExists: true, authId: existingAuthId, password };
      }
      throw error;
    }

    // Supabase sometimes returns a user without id if email confirmation is
    // required and the account already exists under a different state.
    const authId = data?.user?.id || null;
    const needsConfirm = !data?.user?.email_confirmed_at;
    return { alreadyExists: false, authId, password, needsConfirm };
  },

  // ── Helper: resolve auth_id for any parent by email ──────────────────────
  // Used to retroactively link auth_id for parents whose account was created
  // before this fix, or whose alreadyExists case was previously unhandled.
  // Tries Admin API first (most reliable), then falls back to public.users row.
  async _resolveParentAuthId(email) {
    if (!email) return null;
    try {
      const { data: listData } = await DB.client.auth.admin.listUsers({ perPage: 1000 });
      const match = (listData?.users || []).find(
        u => (u.email || '').toLowerCase() === email.toLowerCase()
      );
      if (match?.id) return match.id;
    } catch(e) {
      console.warn('[resolveParentAuthId] Admin API failed:', e.message);
    }
    // Fallback: check what public.users already has
    try {
      const { data: rows } = await DB.getAll('users', { select: 'id,email,auth_id', limit: 2000 });
      const row = (rows || []).find(r => (r.email || '').toLowerCase() === email.toLowerCase());
      return row?.auth_id || null;
    } catch(e) { return null; }
  },

  async saveUser(e, id) {
    e.preventDefault();
    const form = e.target;
    const fd   = new FormData(form);
    const data = Object.fromEntries(fd.entries());

    // Clean empty strings
    Object.keys(data).forEach(k => { if (data[k] === '') data[k] = null; });

    // ── Normalize email to lowercase ─────────────────────────────────────
    // Supabase Auth always stores emails in lowercase. public.users must match
    // exactly, otherwise the third-party app fetch by email returns 0 rows.
    if (data.email) data.email = data.email.trim().toLowerCase();

    data.avatar_color = Utils.avatarColor(data.full_name);
    if (!data.avatar_url) data.avatar_url = null;

    // ── Resolve portal password ──────────────────────────────────────────
    // For parents: ALWAYS use normalized phone (+961XXXXXXXX) as password.
    // Priority for typed password field → normalized phone → random fallback.
    const isParent = data.user_type === 'parent';
    const normalizedPhone = this._normalizePhone(data.phone?.trim());

    let resolvedPassword = data.app_password?.trim() || null;

    if (!id) {
      // New user: prefer phone (normalized) over anything else for parents
      if (isParent) {
        resolvedPassword = normalizedPhone || resolvedPassword || this._generateRandPassword();
      } else {
        resolvedPassword = resolvedPassword || normalizedPhone || this._generateRandPassword();
      }
    }

    // Store normalized phone in the phone field if it changed
    if (normalizedPhone && normalizedPhone !== data.phone?.trim()) {
      data.phone = normalizedPhone;
    }

    // Always store resolved password in app_password so admin can see it
    if (resolvedPassword) data.app_password = resolvedPassword;

    try {
      let result;
      if (id) {
        // ── UPDATE existing user ─────────────────────────────────────────
        // Don't overwrite app_password if field was left blank on edit
        if (!resolvedPassword) delete data.app_password;
        result = await DB.updateUser(id, data);
        if (result.error) throw result.error;

        // ── Sync Supabase Auth account for parent edits ──────────────────
        // Cases handled:
        // 1. No auth_id yet (email just added) → create via Admin API
        // 2. auth_id exists but email changed   → delete old + create new via Admin API
        // 3. auth_id exists, email unchanged    → verify login works, recreate if broken
        if (isParent && data.email) {
          try {
            const { data: existingUser } = await DB.getOne('users', id);
            const hasAuthId    = !!existingUser?.auth_id;
            const emailChanged = hasAuthId && existingUser?.email !== data.email;
            const pw = resolvedPassword
                    || normalizedPhone
                    || existingUser?.app_password
                    || this._generateRandPassword();

            if (!hasAuthId || emailChanged) {
              // ── Case 1 & 2: no account yet, or email changed ────────────
              if (emailChanged) {
                // Delete old auth account before creating new one
                try {
                  await DB.client.auth.admin.deleteUser(existingUser.auth_id);
                  console.info('[editParent] Deleted old auth account:', existingUser.auth_id);
                } catch(delErr) {
                  console.warn('[editParent] Could not delete old auth account:', delErr.message);
                }
              }

              // Create fresh account via Admin API (no rate limit, auto-confirmed)
              let newAuthId = null;
              try {
                const { data: adminData, error: adminErr } =
                  await DB.client.auth.admin.createUser({
                    email:          data.email,
                    password:       pw,
                    email_confirm:  true,
                    user_metadata: {
                      full_name:      data.full_name,
                      user_type:      'parent',
                      email_verified: true,
                      phone_verified: false,
                      public_user_id: id,
                    },
                  });

                if (adminErr) throw adminErr;
                newAuthId = adminData?.user?.id || null;
              } catch (adminErr) {
                // Admin API not available (anon key) — fall back to signUp
                console.warn('[editParent] Admin API failed, falling back to signUp:', adminErr.message);
                const fallback = await this._createParentAuthAccount(
                  data.email, pw, data.full_name, id
                );
                newAuthId = fallback?.alreadyExists ? null : (fallback?.authId || null);
              }

              if (newAuthId) {
                await DB.updateUser(id, { auth_id: newAuthId, app_password: pw });
                this._showParentCredentials({
                  name:          data.full_name,
                  email:         data.email,
                  password:      pw,
                  alreadyExists: false,
                  authId:        newAuthId,
                  needsConfirm:  false, // Admin API auto-confirms
                });
              } else {
                this._showParentCredentials({
                  name:          data.full_name,
                  email:         data.email,
                  password:      pw,
                  alreadyExists: true,
                  authId:        null,
                  needsConfirm:  false,
                });
              }

            } else {
              // ── Case 3: auth_id exists + email unchanged ─────────────────
              // Quick login test to verify the account actually works
              const { error: loginErr } = await DB.client.auth.signInWithPassword({
                email:    data.email,
                password: pw,
              });
              await DB.client.auth.signOut(); // don't disturb admin session

              if (loginErr) {
                // Account is broken (e.g. HTTP 500) — recreate via Admin API
                console.warn('[editParent] Existing auth account broken:', loginErr.message, '— recreating…');
                try {
                  await DB.client.auth.admin.deleteUser(existingUser.auth_id);
                } catch(e) { /* ignore */ }

                let reAuthId = null;
                try {
                  const { data: reData, error: reErr } =
                    await DB.client.auth.admin.createUser({
                      email:         data.email,
                      password:      pw,
                      email_confirm: true,
                      user_metadata: {
                        full_name:      data.full_name,
                        user_type:      'parent',
                        email_verified: true,
                        phone_verified: false,
                        public_user_id: id,
                      },
                    });
                  if (reErr) throw reErr;
                  reAuthId = reData?.user?.id || null;
                } catch(e) {
                  console.warn('[editParent] Recreate failed:', e.message);
                }

                if (reAuthId) {
                  await DB.updateUser(id, { auth_id: reAuthId, app_password: pw });
                  Toast.success(`User updated! ✅ Broken auth account recreated automatically.`);
                } else {
                  Toast.warning(`User updated, but auth account could not be recreated. Use fix_parent_login.html.`);
                }
              } else {
                // Login works fine — nothing to do
                Toast.success('User updated! Portal account active & verified. ✅');
              }
            }
          } catch (fetchErr) {
            console.warn('[editParent] Auth sync error:', fetchErr.message);
            Toast.success('User updated! (auth sync skipped)');
          }
        } else {
          Toast.success('User updated!');
        }

      } else {
        // ── CREATE new user ──────────────────────────────────────────────
        result = await DB.createUser(data);
        if (result.error) throw result.error;

        const created = result.data?.[0] || result.data || {};
        const newId   = created.id || null;

        // ── Auto-create Supabase Auth account for parents ────────────────
        if (isParent && data.email) {
          let authResult = null;
          try {
            authResult = await this._createParentAuthAccount(
              data.email, resolvedPassword, data.full_name, newId
            );

            if (authResult.alreadyExists) {
              // Account existed — auth_id resolved via Admin API (see _createParentAuthAccount)
              if (authResult.authId) {
                await DB.updateUser(newId, { auth_id: authResult.authId });
                console.info('[createParent] alreadyExists — auth_id linked:', authResult.authId);
                Toast.warning(`⚠️ ${data.email} already has a portal account. auth_id linked ✅ — push notifications will work.`);
              } else {
                // Admin API also failed — show SQL fallback instructions
                Toast.warning(`⚠️ ${data.email} already has a portal account. Could not resolve auth_id — run fix_parent_auth.html to link it manually.`);
              }
            } else if (authResult.authId) {
              // Fresh account — save auth_id so push notifications work immediately
              await DB.updateUser(newId, { auth_id: authResult.authId });
              console.info('[createParent] new account — auth_id saved:', authResult.authId);
            }
          } catch (authErr) {
            // Don't block user creation — just warn
            console.warn('[createParent] Auth account creation failed:', authErr.message);
            Toast.warning(`Parent saved, but portal account creation failed: ${authErr.message}`);
          }

          // Show credentials to admin regardless
          this._showParentCredentials({
            name:          data.full_name,
            email:         data.email,
            password:      resolvedPassword,
            alreadyExists: authResult?.alreadyExists  || false,
            authId:        authResult?.authId         || null,
            needsConfirm:  authResult?.needsConfirm   ?? true,
          });

        } else {
          Toast.success('User created!');
        }

        // ── Fire on_student_created notification ─────────────────────────
        if (data.user_type === 'student') {
          NotificationsPage.triggerRule('on_student_created', {
            student_id: newId        || null,
            full_name:  data.full_name || '',
            email:      data.email     || '',
            phone:      data.phone     || '',
          }).catch(err => console.warn('on_student_created trigger failed:', err));
        }
      }

      Modal.close();
      await this.loadUsers();
    } catch (err) {
      Toast.error(err.message || 'Failed to save user');
    }
  },

  // ── Show a credentials summary modal after creating a parent ─────────────
  _showParentCredentials({ name, email, password, alreadyExists, authId, needsConfirm }) {
    const em = (email || '').replace(/'/g, "\\'");

    const statusHtml = alreadyExists
      ? authId
        // ── alreadyExists + auth_id resolved automatically ──
        ? `<div style="background:rgba(34,197,94,.1);border:1px solid rgba(34,197,94,.3);
             border-radius:8px;padding:12px;margin-bottom:12px;font-size:.83rem;color:#4ade80">
             ✅ Supabase Auth account already existed — <strong>auth_id linked automatically</strong>.<br>
             Push notifications are now active. Existing password (phone number) still applies.<br>
             <span style="font-size:.78rem;color:#86efac;">auth_id: <code style="background:rgba(0,0,0,.3);padding:1px 5px;border-radius:3px">${Utils.esc(authId)}</code></span>
           </div>`
        // ── alreadyExists + auth_id NOT resolved (Admin API unavailable) ──
        : `<div style="background:rgba(245,158,11,.1);border:1px solid rgba(245,158,11,.3);
             border-radius:8px;padding:12px;margin-bottom:12px;font-size:.83rem;color:#fbbf24">
             ⚠️ A Supabase Auth account already exists for this email — password was <strong>not</strong> changed.<br>
             The existing password (phone number) still applies.<br><br>
             <strong>auth_id could not be resolved automatically.</strong>
             Run the SQL below in Supabase to link it and enable push notifications.
           </div>`
      : authId
        ? `<div style="background:rgba(34,197,94,.1);border:1px solid rgba(34,197,94,.3);
             border-radius:8px;padding:12px;margin-bottom:12px;font-size:.83rem;color:#4ade80">
             ✅ Portal account created &amp; auth_id saved — push notifications ready.<br>
             ${needsConfirm
               ? `<span style="color:#fbbf24;font-size:.8rem;">
                    ⚠️ Email confirmation pending — run the SQL below or the parent may not be able to log in.
                  </span>`
               : `<span style="font-size:.8rem;color:#86efac;">Email auto-confirmed ✅</span>`}
           </div>`
        : `<div style="background:rgba(239,68,68,.1);border:1px solid rgba(239,68,68,.3);
             border-radius:8px;padding:12px;margin-bottom:12px;font-size:.83rem;color:#f87171">
             ⚠️ Parent record saved but Supabase Auth account could <strong>not</strong> be created automatically.<br>
             Open <strong>create_auth.html</strong> → Method B → enter the email below → copy SQL → run in Supabase.
           </div>`;

    // Show confirm SQL + auth_id link SQL
    const safeEmail = (email || '').replace(/'/g, "''");
    const confirmSql =
`-- ① Confirm email + link auth_id for ${name}
-- Run in: https://supabase.com/dashboard/project/xiatsareoruybucwkpkc/sql/new

-- Step 1: confirm email so parent can log in
UPDATE auth.users
SET email_confirmed_at = COALESCE(email_confirmed_at, NOW()),
    updated_at = NOW()
WHERE email = '${safeEmail}';

-- Step 2: link auth_id from auth.users → public.users (enables push notifications)
UPDATE public.users
SET auth_id = (SELECT id FROM auth.users WHERE email = '${safeEmail}' LIMIT 1)
WHERE email = '${safeEmail}'
  AND auth_id IS NULL;

-- ② Verify both steps
SELECT
  au.email,
  au.email_confirmed_at IS NOT NULL AS email_confirmed,
  pu.auth_id IS NOT NULL            AS auth_id_linked,
  pu.auth_id
FROM auth.users   au
JOIN public.users pu ON pu.email = au.email
WHERE au.email = '${safeEmail}';`;

    const html = `
      <div style="font-size:.88rem;line-height:1.7">
        ${statusHtml}

        <p style="color:var(--text-muted);margin-bottom:12px">
          Share these credentials with <strong>${Utils.esc(name)}</strong>
          to log in to the parent portal:
        </p>

        <!-- Credentials box -->
        <div style="background:var(--bg-card2);border:2px solid var(--brand-primary);
             border-radius:10px;padding:18px;margin-bottom:14px">
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
            <div>
              <div style="color:var(--text-muted);font-size:.72rem;text-transform:uppercase;
                letter-spacing:.05em;font-weight:700;margin-bottom:4px">📧 Email (login)</div>
              <div style="font-family:monospace;font-size:.95rem;font-weight:700;
                color:var(--brand-primary);word-break:break-all">${Utils.esc(email)}</div>
            </div>
            <div>
              <div style="color:var(--text-muted);font-size:.72rem;text-transform:uppercase;
                letter-spacing:.05em;font-weight:700;margin-bottom:4px">🔑 Password</div>
              <div style="font-family:monospace;font-size:.95rem;font-weight:700;
                color:var(--brand-primary)">${Utils.esc(password)}</div>
            </div>
          </div>
          <div style="margin-top:10px;font-size:.75rem;color:var(--text-muted)">
            💡 Password = phone number in international format (+961XXXXXXXX)
          </div>
        </div>

        <!-- Action buttons -->
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px">
          <button class="btn btn-primary btn-sm"
            onclick="navigator.clipboard.writeText('Email: ${em}\\nPassword: ${Utils.esc(password)}')
              .then(()=>Toast.success('✅ Credentials copied to clipboard!'))">
            <i class="fas fa-copy"></i> Copy credentials
          </button>
          <button class="btn btn-secondary btn-sm"
            onclick="UsersPage._copyConfirmSql('${em}')">
            <i class="fas fa-database"></i> Copy confirm-email SQL
          </button>
        </div>

        <!-- Confirm SQL — always visible, prominent -->
        <div style="background:rgba(251,191,36,.07);border:1px solid rgba(251,191,36,.3);
             border-radius:8px;padding:12px">
          <div style="font-size:.78rem;font-weight:700;color:#fbbf24;margin-bottom:6px">
            ⚡ Required: run this SQL in Supabase to confirm the email
          </div>
          <div style="font-size:.72rem;color:#94a3b8;margin-bottom:8px">
            Without this step, the parent may see "Email not confirmed" when trying to log in.
            <a href="https://supabase.com/dashboard/project/xiatsareoruybucwkpkc/sql/new"
               target="_blank" style="color:#38bdf8">Open Supabase SQL Editor ↗</a>
          </div>
          <pre style="background:#0f172a;border-radius:6px;padding:10px;font-size:.72rem;
            white-space:pre-wrap;border:1px solid #334155;color:#a5f3fc;margin:0">${confirmSql}</pre>
        </div>
      </div>
      <div class="modal-footer" style="padding:0;border:none;margin-top:1rem">
        <button class="btn btn-secondary" onclick="UsersPage._copyConfirmSql('${em}')">
          <i class="fas fa-database"></i> Copy SQL
        </button>
        <button class="btn btn-primary" onclick="Modal.close()">
          <i class="fas fa-check"></i> Done
        </button>
      </div>
    `;

    Modal.open(`🔑 Parent Portal Credentials — ${Utils.esc(name)}`, html, { size: 'md' });
  },

  _copyConfirmSql(email) {
    const safe = (email || '').replace(/'/g, "''");
    const sql =
`UPDATE auth.users
SET email_confirmed_at = COALESCE(email_confirmed_at, NOW()),
    updated_at = NOW()
WHERE email = '${safe}';

SELECT email, email_confirmed_at IS NOT NULL AS confirmed
FROM auth.users WHERE email = '${safe}';`;
    navigator.clipboard.writeText(sql)
      .then(() => Toast.success('✅ SQL copied! Paste in Supabase SQL Editor → Run.'));
  },

  async deleteUser(id, name) {
    if (!confirm(`Delete user "${name}"? This cannot be undone.`)) return;
    const { error } = await DB.deleteUser(id);
    if (error) return Toast.error(error.message || 'Failed to delete user');
    Toast.success('User deleted');
    await this.loadUsers();
  },

  initBirthdays() {
    const today = Utils.todayISO().slice(5); // MM-DD
    const birthdays = this.allUsers.filter(u => {
      if (!u.birthday) return false;
      const bd = u.birthday.slice(5); // MM-DD
      return bd === today;
    });
    if (!birthdays.length) {
      Toast.info('No birthdays today!');
      return;
    }
    Modal.open('🎂 Birthdays Today!', `
      <div style="display:flex;flex-direction:column;gap:10px">
        ${birthdays.map(u => `
          <div class="user-list-item">
            <div class="user-avatar" style="background:${Utils.avatarColor(u.full_name)}">${Utils.initials(u.full_name)}</div>
            <div class="user-details">
              <div class="uname">${Utils.esc(u.full_name)}</div>
              <div class="uinfo">${Utils.esc(u.email || u.phone || '')}</div>
            </div>
            <i class="fas fa-birthday-cake" style="color:#f59e0b"></i>
          </div>
        `).join('')}
      </div>
    `);
  },
};
