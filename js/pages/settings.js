/* ============================================================
   MINDS' CRAFT — SETTINGS PAGE
   ============================================================ */

const SettingsPage = {
  currentSection: 'general',
  settings: null,
  roles: [],

  async render() {
    const container = document.getElementById('page-container');
    container.innerHTML = `
      <div class="page-header">
        <div class="page-header-left">
          <h2>System Settings</h2>
          <p>Configure your Minds' Craft center preferences.</p>
        </div>
        <div class="page-header-actions">
          <button class="btn btn-primary" onclick="SettingsPage.saveCurrentSection()">
            <i class="fas fa-save"></i> Save Changes
          </button>
        </div>
      </div>

      <div class="settings-layout">
        <div>
          <div class="card" style="padding:.5rem">
            <ul class="settings-nav">
              <li class="settings-nav-item active" onclick="SettingsPage.switchSection('general', this)">
                <i class="fas fa-sliders-h"></i> General
              </li>
              <li class="settings-nav-item" onclick="SettingsPage.switchSection('roles', this)">
                <i class="fas fa-user-shield"></i> Roles & Permissions
              </li>
              <li class="settings-nav-item" onclick="SettingsPage.switchSection('branding', this)">
                <i class="fas fa-palette"></i> Center Branding
              </li>
              <li class="settings-nav-item" onclick="SettingsPage.switchSection('security', this)">
                <i class="fas fa-lock"></i> Security & Auth
              </li>
              <li class="settings-nav-item" onclick="SettingsPage.switchSection('database', this)">
                <i class="fas fa-database"></i> Database Config
              </li>
              <li class="settings-nav-item" onclick="SettingsPage.switchSection('backup', this)">
                <i class="fas fa-cloud-download-alt"></i> Data & Backups
              </li>
            </ul>
          </div>
        </div>
        <div id="settings-panel">
          <div class="page-loading"><i class="fas fa-spinner fa-spin"></i></div>
        </div>
      </div>
    `;

    await this.loadSettings();
    this.renderSection('general');
  },

  async loadSettings() {
    this.settings = await DB.getSettings() || {};
    const { data: roles } = await DB.getRoles();
    this.roles = roles || [];
  },

  switchSection(section, el) {
    this.currentSection = section;
    document.querySelectorAll('.settings-nav-item').forEach(i => i.classList.remove('active'));
    el.classList.add('active');
    this.renderSection(section);
  },

  renderSection(section) {
    const panel = document.getElementById('settings-panel');
    if (!panel) return;
    switch (section) {
      case 'general': panel.innerHTML = this.generalHTML(); break;
      case 'roles': this.renderRoles(panel); break;
      case 'branding': panel.innerHTML = this.brandingHTML(); break;
      case 'security': panel.innerHTML = this.securityHTML(); break;
      case 'database': panel.innerHTML = this.databaseHTML(); break;
      case 'backup': panel.innerHTML = this.backupHTML(); break;
    }
  },

  generalHTML() {
    const s = this.settings;
    return `
      <div class="card">
        <div class="card-header"><div class="card-title">General Settings</div></div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Center Name</label>
            <input type="text" id="setting-center_name" class="form-input" value="${Utils.esc(s?.center_name || "Minds' Craft")}" />
          </div>
          <div class="form-group">
            <label class="form-label">Default Language</label>
            <select id="setting-language" class="form-select">
              <option value="en" ${s?.language==='en'?'selected':''}>English</option>
              <option value="ar" ${s?.language==='ar'?'selected':''}>Arabic</option>
              <option value="fr" ${s?.language==='fr'?'selected':''}>French</option>
            </select>
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Currency</label>
            <select id="setting-currency" class="form-select">
              <option value="USD" ${s?.currency==='USD'?'selected':''}>USD ($)</option>
              <option value="EUR" ${s?.currency==='EUR'?'selected':''}>EUR (€)</option>
              <option value="LBP" ${s?.currency==='LBP'?'selected':''}>LBP (ل.ل)</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Timezone</label>
            <select id="setting-timezone" class="form-select">
              <option value="Asia/Beirut" ${s?.timezone==='Asia/Beirut'?'selected':''}>Beirut (GMT+3)</option>
              <option value="UTC" ${s?.timezone==='UTC'?'selected':''}>UTC</option>
              <option value="Europe/London" ${s?.timezone==='Europe/London'?'selected':''}>London</option>
            </select>
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Date Format</label>
          <select id="setting-date_format" class="form-select">
            <option value="DD/MM/YYYY" ${s?.date_format==='DD/MM/YYYY'?'selected':''}>DD/MM/YYYY</option>
            <option value="MM/DD/YYYY" ${s?.date_format==='MM/DD/YYYY'?'selected':''}>MM/DD/YYYY</option>
            <option value="YYYY-MM-DD" ${s?.date_format==='YYYY-MM-DD'?'selected':''}>YYYY-MM-DD</option>
          </select>
        </div>
      </div>
    `;
  },

  async renderRoles(panel) {
    const modules = ['User Management','Course Content','Attendance','Trainers','Events','Financial Data','Notifications','Student Progress','Settings'];
    const rolesList = this.roles.length ? this.roles : [
      { id: '1', name: 'Super Admin' },
      { id: '2', name: 'Manager' },
      { id: '3', name: 'Instructor' },
      { id: '4', name: 'Accountant' },
    ];

    panel.innerHTML = `
      <div class="card" style="margin-bottom:1rem">
        <div class="card-header">
          <div class="card-title">Role Management</div>
          <button class="btn btn-primary btn-sm" onclick="SettingsPage.openCreateRole()"><i class="fas fa-plus"></i> Create Role</button>
        </div>
        <div class="table-wrap">
          <table class="table">
            <thead><tr><th>Role</th><th>Access Level</th><th>Actions</th></tr></thead>
            <tbody>
              ${rolesList.map(r => `
                <tr>
                  <td><strong>${Utils.esc(r.name)}</strong></td>
                  <td>${r.permissions?.all ? '<span class="badge badge-red">Full Access</span>' : '<span class="badge badge-blue">Limited</span>'}</td>
                  <td>
                    <button class="btn btn-danger btn-icon btn-sm" onclick="SettingsPage.deleteRole('${r.id}', '${Utils.esc(r.name)}')"><i class="fas fa-trash"></i></button>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
      <div class="card">
        <div class="card-header">
          <div class="card-title">Permissions Matrix</div>
          <button class="btn btn-primary btn-sm" onclick="SettingsPage.savePermissions()">
            <i class="fas fa-save"></i> Save Permissions
          </button>
        </div>
        <p style="font-size:var(--font-size-xs);color:var(--text-muted);margin-bottom:.75rem">
          <i class="fas fa-info-circle"></i> Click any cell to toggle access for that role &amp; module.
        </p>
        <div class="perm-matrix-wrap">
          <table class="perm-matrix" id="perm-matrix-table">
            <thead>
              <tr>
                <th>Module</th>
                ${rolesList.map(r => `<th>${Utils.esc(r.name)}</th>`).join('')}
              </tr>
            </thead>
            <tbody>
              ${modules.map(mod => {
                const modKey = mod.toLowerCase().replace(/ /g,'_');
                return `
                <tr>
                  <td style="font-weight:600">${Utils.esc(mod)}</td>
                  ${rolesList.map(r => {
                    const hasAccess = r.permissions?.all || r.permissions?.[modKey];
                    return `<td class="perm-cell ${hasAccess ? 'perm-on' : 'perm-off'}"
                      data-role="${Utils.esc(r.id)}"
                      data-mod="${Utils.esc(modKey)}"
                      data-state="${hasAccess ? '1' : '0'}"
                      onclick="SettingsPage.togglePerm(this)"
                      style="cursor:pointer;text-align:center;user-select:none">
                      <i class="fas ${hasAccess ? 'fa-check perm-check' : 'fa-times perm-cross'}"></i>
                    </td>`;
                  }).join('')}
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;

    // Store editable state for saves
    SettingsPage._permEdits = {}; // roleId -> { modKey: bool }
  },

  brandingHTML() {
    const s = this.settings;
    const colors = ['#22c55e','#6366f1','#f59e0b','#ef4444','#3b82f6'];
    return `
      <div class="card">
        <div class="card-header"><div class="card-title">Center Branding</div></div>

        <!-- Logo -->
        <div class="form-group">
          <label class="form-label">Center Logo</label>

          <!-- Live preview -->
          <div id="logo-preview-wrap" style="margin-bottom:.75rem;display:${s?.logo_url ? 'flex' : 'none'};align-items:center;gap:12px">
            <img id="logo-preview-img" src="${Utils.esc(s?.logo_url || '')}" alt="Logo"
              style="height:60px;max-width:180px;object-fit:contain;border-radius:var(--radius-md);
                     border:1px solid var(--border-color);padding:6px;background:var(--bg-secondary)" />
            <button type="button" class="btn btn-danger btn-sm" onclick="SettingsPage.clearLogo()">
              <i class="fas fa-times"></i> Remove
            </button>
          </div>

          <!-- Upload from device -->
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:.5rem">
            <label class="btn btn-secondary btn-sm" style="cursor:pointer;margin:0">
              <i class="fas fa-upload"></i> Upload from device
              <input type="file" id="logo-file-input" accept="image/*" style="display:none"
                onchange="SettingsPage.handleLogoFile(this)" />
            </label>
            <span style="font-size:var(--font-size-xs);color:var(--text-muted)">PNG, JPG, SVG, WebP</span>
          </div>

          <!-- Or enter URL -->
          <div style="display:flex;align-items:center;gap:8px">
            <input type="url" id="setting-logo_url" class="form-input" value="${Utils.esc(s?.logo_url || '')}"
              placeholder="https://example.com/logo.png"
              oninput="SettingsPage.onLogoUrlInput(this.value)" />
            <button type="button" class="btn btn-secondary btn-sm" onclick="SettingsPage.onLogoUrlInput(document.getElementById('setting-logo_url').value)">
              Preview
            </button>
          </div>
          <p style="font-size:var(--font-size-xs);color:var(--text-muted);margin-top:4px">
            Upload a file <strong>or</strong> enter a public URL. Uploaded images are stored as Base64 in settings.
          </p>
        </div>
        <div class="form-group">
          <label class="form-label">Center Name</label>
          <input type="text" id="setting-center_name_brand" class="form-input" value="${Utils.esc(s?.center_name || "Minds' Craft")}" />
        </div>
        <div class="form-group">
          <label class="form-label">Brand Primary Color</label>
          <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
            ${colors.map(c => `
              <div class="brand-color-swatch" style="background:${c};${(s?.brand_color||'#22c55e')===c?'border-color:'+c+';box-shadow:0 0 0 3px '+c+'44':''}"
                onclick="SettingsPage.selectBrandColor('${c}', this)" data-color="${c}"></div>
            `).join('')}
            <input type="color" id="setting-brand_color" value="${s?.brand_color || '#22c55e'}" style="width:40px;height:40px;border-radius:var(--radius-sm);cursor:pointer;border:2px solid var(--border-color);background:none" onchange="SettingsPage.applyBrandColor(this.value)" />
          </div>
        </div>
      </div>
    `;
  },

  // ── Logo helpers ────────────────────────────────────────────
  handleLogoFile(input) {
    const file = input.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) return Toast.error('Image too large — max 2 MB');
    const reader = new FileReader();
    reader.onload = e => {
      const dataUrl = e.target.result;
      // Update hidden URL field so it gets saved normally
      const urlInput = document.getElementById('setting-logo_url');
      if (urlInput) urlInput.value = dataUrl;
      this._showLogoPreview(dataUrl);
    };
    reader.readAsDataURL(file);
  },

  onLogoUrlInput(val) {
    if (!val?.trim()) { this.clearLogo(); return; }
    this._showLogoPreview(val.trim());
    const urlInput = document.getElementById('setting-logo_url');
    if (urlInput) urlInput.value = val.trim();
  },

  _showLogoPreview(src) {
    const wrap = document.getElementById('logo-preview-wrap');
    const img  = document.getElementById('logo-preview-img');
    if (wrap) wrap.style.display = 'flex';
    if (img)  img.src = src;
  },

  clearLogo() {
    const wrap    = document.getElementById('logo-preview-wrap');
    const img     = document.getElementById('logo-preview-img');
    const urlInput = document.getElementById('setting-logo_url');
    if (wrap)     wrap.style.display = 'none';
    if (img)      img.src = '';
    if (urlInput) urlInput.value = '';
  },

  // ── Permission matrix helpers ─────────────────────────────
  togglePerm(cell) {
    const roleId  = cell.dataset.role;
    const modKey  = cell.dataset.mod;
    const isOn    = cell.dataset.state === '1';
    const newState = !isOn;

    // Visual update
    cell.dataset.state = newState ? '1' : '0';
    cell.className = `perm-cell ${newState ? 'perm-on' : 'perm-off'}`;
    cell.style.cursor = 'pointer'; cell.style.textAlign = 'center'; cell.style.userSelect = 'none';
    cell.innerHTML = `<i class="fas ${newState ? 'fa-check perm-check' : 'fa-times perm-cross'}"></i>`;

    // Track in edit map
    if (!this._permEdits) this._permEdits = {};
    if (!this._permEdits[roleId]) this._permEdits[roleId] = {};
    this._permEdits[roleId][modKey] = newState;
  },

  async savePermissions() {
    if (!this._permEdits || !Object.keys(this._permEdits).length)
      return Toast.info('No changes to save.');

    const rolesList = this.roles.length ? this.roles : [];
    let saved = 0, errs = 0;

    for (const [roleId, mods] of Object.entries(this._permEdits)) {
      const role = rolesList.find(r => r.id === roleId);
      if (!role) continue;
      const perms = { ...(role.permissions || {}) };
      for (const [mod, val] of Object.entries(mods)) {
        if (val) perms[mod] = true;
        else delete perms[mod];
      }
      const { error } = await DB.updateRole(roleId, { permissions: perms });
      if (error) { errs++; console.error(error); }
      else { role.permissions = perms; saved++; }
    }

    this._permEdits = {};
    if (errs) Toast.error(`${errs} role(s) failed to save`);
    else Toast.success(`Permissions saved for ${saved} role(s)!`);
  },

  selectBrandColor(color, el) {
    document.querySelectorAll('.brand-color-swatch').forEach(s => { s.style.borderColor = 'var(--border-color)'; s.style.boxShadow = ''; });
    el.style.borderColor = color;
    el.style.boxShadow = `0 0 0 3px ${color}44`;
    this.applyBrandColor(color);
  },

  applyBrandColor(color) {
    const input = document.getElementById('setting-brand_color');
    if (input) input.value = color;
    document.documentElement.style.setProperty('--brand-primary', color);
  },

  securityHTML() {
    const s = this.settings;
    return `
      <div class="card">
        <div class="card-header"><div class="card-title">Security & Authentication</div></div>
        <div class="form-group">
          <label class="form-label">Two-Factor Authentication</label>
          <div class="toggle-wrap">
            <label class="toggle">
              <input type="checkbox" id="setting-two_fa_enabled" ${s?.two_fa_enabled ? 'checked' : ''} />
              <span class="toggle-slider"></span>
            </label>
            <span style="font-size:var(--font-size-sm)">Enable 2FA for admin accounts</span>
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Session Timeout (minutes)</label>
          <select id="setting-session_timeout" class="form-select">
            ${[15,30,60,120,240].map(m => `<option value="${m}" ${(s?.session_timeout||60)==m?'selected':''}>${m} minutes</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Minimum Password Length</label>
          <input type="number" id="setting-pw_min_chars" class="form-input" value="${s?.pw_min_chars || 8}" min="6" max="32" />
        </div>
        <div class="form-group">
          <label class="form-label">Require Special Characters</label>
          <div class="toggle-wrap">
            <label class="toggle">
              <input type="checkbox" id="setting-pw_special" ${s?.pw_special !== false ? 'checked' : ''} />
              <span class="toggle-slider"></span>
            </label>
            <span style="font-size:var(--font-size-sm)">Passwords must contain special characters</span>
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">IP Whitelist <span class="text-muted">(comma separated)</span></label>
          <input type="text" id="setting-ip_whitelist" class="form-input" value="${Utils.esc(s?.ip_whitelist || '')}" placeholder="192.168.1.1, 10.0.0.0/24" />
        </div>
        <div class="form-group">
          <label class="form-label">Login Notifications</label>
          <div class="toggle-wrap">
            <label class="toggle">
              <input type="checkbox" id="setting-login_notif" ${s?.login_notif !== false ? 'checked' : ''} />
              <span class="toggle-slider"></span>
            </label>
            <span style="font-size:var(--font-size-sm)">Send email on new admin login</span>
          </div>
        </div>
      </div>
    `;
  },

  databaseHTML() {
    const url = localStorage.getItem('mc_supabase_url') || '';
    const appUrl = window.location.origin + window.location.pathname.replace(/\/$/, '');
    return `
      <div class="card" style="margin-bottom:1rem">
        <div class="card-header"><div class="card-title">Supabase Database Configuration</div></div>
        <div id="db-status" class="alert ${url ? 'alert-success' : 'alert-warning'}" style="margin-bottom:1rem">
          ${url ? `<i class="fas fa-check-circle"></i> Connected to: ${Utils.esc(url)}` : '<i class="fas fa-exclamation-triangle"></i> Not configured'}
        </div>
        <div class="form-group">
          <label class="form-label">Supabase URL</label>
          <input type="url" id="new-supabase-url" class="form-input" value="${Utils.esc(url)}" placeholder="https://xxxx.supabase.co" />
        </div>
        <div class="form-group">
          <label class="form-label">Supabase Anon Key</label>
          <input type="password" id="new-supabase-key" class="form-input" placeholder="eyJhbGciOiJIUzI1NiIs…" />
          <p style="font-size:var(--font-size-xs);color:var(--text-muted);margin-top:4px">Leave blank to keep existing key.</p>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn btn-primary" onclick="SettingsPage.saveDBConfig()"><i class="fas fa-save"></i> Save & Reconnect</button>
          <button class="btn btn-secondary" onclick="SettingsPage.testConnection(event)"><i class="fas fa-stethoscope"></i> Run Diagnostics</button>
        </div>
        <div id="db-diag-results"></div>
      </div>

      <div class="card">
        <div class="card-header"><div class="card-title">⚠️ Supabase Auth URL Configuration</div></div>
        <p style="font-size:var(--font-size-sm);color:var(--text-muted);margin-bottom:1rem">
          Copy these values into your Supabase dashboard under<br>
          <strong>Authentication → URL Configuration</strong>
        </p>
        <div class="form-group">
          <label class="form-label">Site URL <span class="text-muted">(paste this into Supabase)</span></label>
          <div style="display:flex;gap:8px">
            <input type="text" class="form-input" value="${Utils.esc(appUrl)}" readonly id="site-url-val" style="font-size:12px;font-family:monospace" />
            <button class="btn btn-secondary btn-sm" onclick="navigator.clipboard.writeText(document.getElementById('site-url-val').value);Toast.success('Copied!')">
              <i class="fas fa-copy"></i>
            </button>
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Redirect URLs <span class="text-muted">(add this to the list in Supabase)</span></label>
          <div style="display:flex;gap:8px">
            <input type="text" class="form-input" value="${Utils.esc(appUrl + '/**')}" readonly id="redirect-url-val" style="font-size:12px;font-family:monospace" />
            <button class="btn btn-secondary btn-sm" onclick="navigator.clipboard.writeText(document.getElementById('redirect-url-val').value);Toast.success('Copied!')">
              <i class="fas fa-copy"></i>
            </button>
          </div>
        </div>
        <div class="alert alert-info" style="margin-top:.5rem;font-size:var(--font-size-xs)">
          <i class="fas fa-info-circle"></i>
          After updating these in Supabase, magic links and password reset emails will redirect correctly to this app.
        </div>
      </div>
    `;
  },

  async saveDBConfig() {
    const url = document.getElementById('new-supabase-url')?.value?.trim();
    const key = document.getElementById('new-supabase-key')?.value?.trim();
    if (!url) return Toast.error('Please enter a Supabase URL');
    if (key) localStorage.setItem('mc_supabase_key', key);
    localStorage.setItem('mc_supabase_url', url);
    Toast.success('Configuration saved. Reconnecting…');
    setTimeout(() => location.reload(), 1000);
  },

  async testConnection() {
    const btn = event?.target;
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Testing…'; }
    const resultsEl = document.getElementById('db-diag-results');
    if (resultsEl) resultsEl.innerHTML = '<div style="color:var(--text-muted);font-size:.8rem"><i class="fas fa-spinner fa-spin"></i> Running diagnostics…</div>';

    const tables = ['users','courses','levels','enrollments','attendance','transactions','student_allocations','packages','settings'];
    const rows = [];
    let allOk = true;

    for (const tbl of tables) {
      try {
        const { data, error, count } = await DB.getAll(tbl, { limit: 1 });
        if (error) {
          rows.push({ table: tbl, status: '❌', detail: `${error.code}: ${error.message}` });
          allOk = false;
          console.error(`[DB diag] ${tbl}:`, error);
        } else {
          rows.push({ table: tbl, status: '✅', detail: 'OK' });
        }
      } catch (e) {
        rows.push({ table: tbl, status: '⚠️', detail: e.message });
        allOk = false;
      }
    }

    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-stethoscope"></i> Run Diagnostics'; }

    const html = `
      <div style="margin-top:1rem">
        <div style="font-weight:600;margin-bottom:.5rem;font-size:.85rem">
          ${allOk
            ? '<span style="color:var(--brand-primary)"><i class="fas fa-check-circle"></i> All tables accessible</span>'
            : '<span style="color:var(--brand-danger)"><i class="fas fa-times-circle"></i> Some tables have errors — check details below</span>'}
        </div>
        <table style="width:100%;border-collapse:collapse;font-size:.8rem">
          <thead>
            <tr style="color:var(--text-muted);text-align:left">
              <th style="padding:.3rem .5rem;border-bottom:1px solid var(--border-color)">Table</th>
              <th style="padding:.3rem .5rem;border-bottom:1px solid var(--border-color)">Status</th>
              <th style="padding:.3rem .5rem;border-bottom:1px solid var(--border-color)">Detail</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map(r => `
              <tr>
                <td style="padding:.35rem .5rem;border-bottom:1px solid var(--border-color);font-family:monospace;font-size:.78rem">${r.table}</td>
                <td style="padding:.35rem .5rem;border-bottom:1px solid var(--border-color)">${r.status}</td>
                <td style="padding:.35rem .5rem;border-bottom:1px solid var(--border-color);color:${r.status==='✅'?'var(--brand-primary)':'var(--brand-danger)'};font-size:.75rem">${Utils.esc(r.detail)}</td>
              </tr>`).join('')}
          </tbody>
        </table>
        ${!allOk ? `
        <div style="margin-top:.75rem;padding:.65rem;background:rgba(239,68,68,.08);border:1px solid rgba(239,68,68,.25);border-radius:8px;font-size:.78rem">
          <strong style="color:var(--brand-danger)">⚠️ Fix required:</strong> Run the RLS repair SQL below in your Supabase SQL Editor.
        </div>
        <details style="margin-top:.5rem">
          <summary style="cursor:pointer;font-size:.8rem;font-weight:600;padding:.3rem 0">📋 Click to see RLS Repair SQL</summary>
          <pre id="rls-fix-sql" style="margin-top:.5rem;background:var(--bg-tertiary);padding:.75rem;border-radius:6px;font-size:.72rem;overflow-x:auto;white-space:pre-wrap;border:1px solid var(--border-color)">${Utils.esc(SettingsPage._rlsFixSQL())}</pre>
          <button class="btn btn-secondary btn-sm" style="margin-top:.4rem"
            onclick="navigator.clipboard.writeText(SettingsPage._rlsFixSQL());Toast.success('SQL copied!')">
            <i class="fas fa-copy"></i> Copy SQL
          </button>
        </details>` : ''}
      </div>`;

    if (resultsEl) {
      resultsEl.innerHTML = html;
    } else {
      // Fallback: show toast
      if (allOk) Toast.success('All tables accessible!');
      else Toast.error('Some tables have RLS/access errors — check Settings → Database');
    }
  },

  _rlsFixSQL() {
    const tables = [
      'users','courses','levels','trainers','trainer_assignments','trainer_sessions',
      'enrollments','attendance','events','event_registrations','packages',
      'student_allocations','transactions','notification_rules','notification_logs',
      'assessments','roles','settings','admin_users','level_schedules'
    ];
    return tables.map(t => `
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename='${t}' AND policyname='Authenticated full access ${t}'
  ) THEN
    ALTER TABLE IF EXISTS ${t} ENABLE ROW LEVEL SECURITY;
    CREATE POLICY "Authenticated full access ${t}" ON ${t}
      FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');
  END IF;
END $$;`).join('\n') + `

-- Also ensure enrollments has schedule_slot column
ALTER TABLE enrollments ADD COLUMN IF NOT EXISTS schedule_slot TEXT DEFAULT NULL;
ALTER TABLE student_allocations ADD COLUMN IF NOT EXISTS notes TEXT;
`;
  },

  backupHTML() {
    return `
      <div class="card" style="margin-bottom:1rem">
        <div class="card-header"><div class="card-title">Export Data</div></div>
        <p style="font-size:var(--font-size-sm);color:var(--text-muted);margin-bottom:1rem">Download your data as CSV files for backup or analysis.</p>
        <div style="display:flex;flex-wrap:wrap;gap:8px">
          ${['users','transactions','attendance','enrollments','events'].map(t => `
            <button class="btn btn-secondary btn-sm" onclick="SettingsPage.exportTable('${t}')">
              <i class="fas fa-download"></i> ${t.charAt(0).toUpperCase()+t.slice(1)}
            </button>
          `).join('')}
        </div>
      </div>
      <div class="card">
        <div class="card-header"><div class="card-title">System Information</div></div>
        <div style="font-size:var(--font-size-sm);color:var(--text-secondary)">
          <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border-light)">
            <span>App Version</span><strong>1.0.0</strong>
          </div>
          <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border-light)">
            <span>Database</span><strong>Supabase PostgreSQL</strong>
          </div>
          <div style="display:flex;justify-content:space-between;padding:8px 0">
            <span>Supabase URL</span><strong style="font-size:11px;word-break:break-all">${Utils.esc(localStorage.getItem('mc_supabase_url') || 'Not set')}</strong>
          </div>
        </div>
      </div>
    `;
  },

  async exportTable(table) {
    Toast.info(`Exporting ${table}…`);
    const { data, error } = await DB.getAll(table, { limit: 10000 });
    if (error) return Toast.error('Export failed: ' + error.message);
    if (!data?.length) return Toast.warning('No data to export');
    Utils.downloadCSV(data, `${table}-export-${Utils.todayISO()}.csv`);
    Toast.success(`Exported ${data.length} ${table} records`);
  },

  async saveCurrentSection() {
    const section = this.currentSection;
    const updates = {};
    const getVal = id => document.getElementById(id)?.value;
    const getCheck = id => document.getElementById(id)?.checked;

    if (section === 'general') {
      updates.center_name = getVal('setting-center_name');
      updates.language = getVal('setting-language');
      updates.currency = getVal('setting-currency');
      updates.timezone = getVal('setting-timezone');
      updates.date_format = getVal('setting-date_format');
    } else if (section === 'branding') {
      updates.logo_url    = getVal('setting-logo_url') || null;
      updates.center_name = getVal('setting-center_name_brand') || null;
      updates.brand_color = getVal('setting-brand_color');
    } else if (section === 'security') {
      updates.two_fa_enabled = getCheck('setting-two_fa_enabled');
      updates.session_timeout = parseInt(getVal('setting-session_timeout'));
      updates.pw_min_chars = parseInt(getVal('setting-pw_min_chars'));
      updates.pw_special = getCheck('setting-pw_special');
      updates.ip_whitelist = getVal('setting-ip_whitelist') || null;
      updates.login_notif = getCheck('setting-login_notif');
    } else if (section === 'database') {
      await this.saveDBConfig();
      return;
    } else {
      Toast.info('Use the specific buttons for this section.');
      return;
    }

    const { error } = await DB.saveSettings(updates);
    if (error) return Toast.error(error.message || 'Failed to save');
    Toast.success('Settings saved!');
    this.settings = { ...this.settings, ...updates };

    // Re-apply branding immediately (logo, name, color)
    if (section === 'branding') App.applyBranding();
  },

  openCreateRole() {
    Modal.open('Create New Role', `
      <form onsubmit="SettingsPage.saveRole(event)">
        <div class="form-group"><label class="form-label">Role Name *</label><input type="text" name="name" class="form-input" required /></div>
        <div class="form-group">
          <label class="form-label">Access Level</label>
          <select name="access_level" class="form-select">
            <option value="limited">Limited</option>
            <option value="full">Full Access</option>
          </select>
        </div>
        <div class="modal-footer" style="padding:0;border:none;margin-top:1rem">
          <button type="button" class="btn btn-secondary" onclick="Modal.close()">Cancel</button>
          <button type="submit" class="btn btn-primary"><i class="fas fa-save"></i> Create Role</button>
        </div>
      </form>
    `);
  },

  async saveRole(e) {
    e.preventDefault();
    const fd = new FormData(e.target);
    const name = fd.get('name');
    const full = fd.get('access_level') === 'full';
    const { error } = await DB.createRole({ name, permissions: full ? { all: true } : {} });
    if (error) return Toast.error(error.message);
    Toast.success('Role created!');
    Modal.close();
    const { data: roles } = await DB.getRoles();
    this.roles = roles || [];
    this.renderSection('roles');
  },

  async deleteRole(id, name) {
    if (!confirm(`Delete role "${name}"?`)) return;
    const { error } = await DB.deleteRole(id);
    if (error) return Toast.error(error.message);
    Toast.success('Role deleted');
    this.roles = this.roles.filter(r => r.id !== id);
    this.renderSection('roles');
  },

  // Reload roles then re-render (called after save)
  async _reloadRoles() {
    const { data: roles } = await DB.getRoles();
    this.roles = roles || [];
    const panel = document.getElementById('settings-panel');
    if (panel) await this.renderRoles(panel);
  },
};
