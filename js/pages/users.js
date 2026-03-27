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
      const { data, error } = await DB.getAll('users', {
        select: '*, parent:parent_id(id, full_name)',
        order: 'created_at',
        asc: false,
      });
      if (error) throw error;
      this.allUsers = data || [];
      this.renderTable();
    } catch (err) {
      console.error(err);
      Toast.error('Failed to load users');
      document.getElementById('users-tbody').innerHTML = `<tr><td colspan="7" class="text-center text-muted">Failed to load users</td></tr>`;
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
    if (countEl) countEl.textContent = `${users.length} user${users.length !== 1 ? 's' : ''}`;

    if (!users.length) {
      tbody.innerHTML = `<tr><td colspan="7"><div class="empty-state"><i class="fas fa-users"></i><h3>No users found</h3><p>Try a different search or add a new user.</p></div></td></tr>`;
      return;
    }

    tbody.innerHTML = users.map(u => {
      const initials = Utils.initials(u.full_name);
      const color = u.avatar_color || Utils.avatarColor(u.full_name);
      const parentInfo = u.user_type === 'student' && u.parent ? `<span class="text-xs text-muted">Parent: ${Utils.esc(u.parent.full_name)}</span>` : '';
      return `
        <tr>
          <td>
            <div class="users-table-info">
              <div class="users-table-avatar" style="background:${Utils.esc(color)}">${Utils.esc(initials)}</div>
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
    return `
      <form onsubmit="UsersPage.saveUser(event, ${user ? `'${user.id}'` : 'null'})">
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
        <div class="form-group">
          <label class="form-label">Mobile App Password <span class="text-muted">(optional)</span></label>
          <input type="password" name="app_password" class="form-input" placeholder="Password for mobile app login" />
        </div>` : ''}
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

  onRoleChange(select) {
    const fields = document.getElementById('student-fields');
    if (fields) {
      fields.style.display = select.value === 'student' ? '' : 'none';
    }
  },

  async saveUser(e, id) {
    e.preventDefault();
    const form = e.target;
    const fd = new FormData(form);
    const data = Object.fromEntries(fd.entries());

    // Clean empty strings
    Object.keys(data).forEach(k => { if (data[k] === '') data[k] = null; });

    data.avatar_color = Utils.avatarColor(data.full_name);

    try {
      let result;
      if (id) {
        result = await DB.updateUser(id, data);
      } else {
        result = await DB.createUser(data);
      }
      if (result.error) throw result.error;
      Toast.success(id ? 'User updated!' : 'User created!');
      Modal.close();
      await this.loadUsers();
    } catch (err) {
      Toast.error(err.message || 'Failed to save user');
    }
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
