/* ============================================================
   MINDS' CRAFT — TRAINERS PAGE
   ============================================================ */

const TrainersPage = {
  trainers: [],

  async render() {
    const container = document.getElementById('page-container');
    container.innerHTML = `
      <div class="page-header">
        <div class="page-header-left">
          <h2>Trainer Directory</h2>
          <p>Manage trainers and their course level assignments.</p>
        </div>
        <div class="page-header-actions">
          <button class="btn btn-secondary" onclick="TrainersPage.openCostForecast()">
            <i class="fas fa-chart-bar"></i> Cost Forecast
          </button>
          <button class="btn btn-primary" onclick="TrainersPage.openOnboard()">
            <i class="fas fa-plus"></i> Onboard New Trainer
          </button>
        </div>
      </div>

      <div class="action-row">
        <div class="search-input-wrap">
          <i class="fas fa-search"></i>
          <input type="text" id="trainers-search" placeholder="Search trainers by name or email…"
            oninput="TrainersPage.filter(this.value)" />
        </div>
      </div>

      <div class="trainers-grid" id="trainers-grid">
        <div class="page-loading"><i class="fas fa-spinner fa-spin"></i></div>
      </div>
    `;

    await this.loadTrainers();
  },

  async loadTrainers() {
    const [{ data, error }, { data: assignments }, { data: legacyLevels }] = await Promise.all([
      DB.getTrainers(),
      // New: trainer_assignments table (multi-trainer)
      DB.getAll('trainer_assignments', {
        select: '*, level:level_id(id, name, day_of_week, course:course_id(id, name))'
      }),
      // Legacy: levels with a trainer_id FK set directly
      DB.getAll('levels', {
        select: 'id, name, day_of_week, trainer_id, course:course_id(id, name)'
      }),
    ]);
    if (error) return Toast.error('Failed to load trainers');
    this.trainers = data || [];

    // Build map from new trainer_assignments table
    const map = {};
    const assignedKeys = new Set(); // track level_id+trainer_id combos to avoid duplicates
    (assignments || []).forEach(a => {
      const key = `${a.trainer_id}__${a.level_id}`;
      assignedKeys.add(key);
      if (!map[a.trainer_id]) map[a.trainer_id] = [];
      if (a.level) map[a.trainer_id].push(a.level);
    });

    // Also include levels assigned via the legacy trainer_id FK
    // (for backward compatibility — avoids showing nothing on cards until re-saved)
    (legacyLevels || []).forEach(lv => {
      if (!lv.trainer_id) return;
      const key = `${lv.trainer_id}__${lv.id}`;
      if (assignedKeys.has(key)) return; // already covered by trainer_assignments
      if (!map[lv.trainer_id]) map[lv.trainer_id] = [];
      map[lv.trainer_id].push({ id: lv.id, name: lv.name, day_of_week: lv.day_of_week, course: lv.course });
    });

    this.trainers.forEach(t => { t._levels = map[t.id] || []; });
    this.renderGrid(this.trainers);
  },

  filter(q) {
    const term = q.toLowerCase();
    const filtered = this.trainers.filter(t =>
      (t.full_name || '').toLowerCase().includes(term) ||
      (t.email    || '').toLowerCase().includes(term) ||
      (t._levels  || []).some(lv =>
        (lv.name || '').toLowerCase().includes(term) ||
        (lv.course?.name || '').toLowerCase().includes(term)
      )
    );
    this.renderGrid(filtered);
  },

  renderGrid(trainers) {
    const grid = document.getElementById('trainers-grid');
    if (!grid) return;
    if (!trainers.length) {
      grid.innerHTML = `<div class="empty-state"><i class="fas fa-chalkboard-teacher"></i><h3>No trainers found</h3><p>Onboard your first trainer.</p></div>`;
      return;
    }
    grid.innerHTML = trainers.map(t => this.trainerCardHTML(t)).join('');
  },

  trainerCardHTML(t) {
    const color = Utils.avatarColor(t.full_name);
    const levels = t._levels || [];
    // Group levels by course name
    const courseMap = {};
    levels.forEach(lv => {
      const cname = lv.course?.name || 'General';
      if (!courseMap[cname]) courseMap[cname] = [];
      courseMap[cname].push(lv);
    });
    const levelsBadges = levels.length
      ? Object.entries(courseMap).map(([cname, lvs]) =>
          `<div style="margin-bottom:6px">
            <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;
              color:var(--text-muted);margin-bottom:4px">${Utils.esc(cname)}</div>
            <div style="display:flex;flex-wrap:wrap;gap:4px">
              ${lvs.map(lv => `
                <span style="display:inline-flex;align-items:center;gap:4px;
                  background:rgba(99,102,241,.12);color:var(--brand-primary);
                  border:1px solid rgba(99,102,241,.25);border-radius:6px;
                  padding:2px 8px;font-size:11px;font-weight:500">
                  <i class="fas fa-layer-group" style="font-size:9px"></i>
                  ${Utils.esc(lv.name)}
                  ${lv.day_of_week ? `<span style="opacity:.65;font-size:10px">${lv.day_of_week.slice(0,3)}</span>` : ''}
                </span>`).join('')}
            </div>
          </div>`
        ).join('')
      : `<div style="font-size:var(--font-size-xs);color:var(--text-muted);font-style:italic">No levels assigned yet.</div>`;

    return `
      <div class="trainer-card">
        <div class="trainer-card-header">
          <div style="display:flex;align-items:center;gap:12px">
            <div class="trainer-avatar" style="background:${color}">${Utils.initials(t.full_name)}</div>
            <div>
              <div style="font-weight:700;font-size:var(--font-size-md)">${Utils.esc(t.full_name)}</div>
              <div style="font-size:var(--font-size-xs);color:var(--text-muted)">
                Staff / Trainer
                <span style="margin-left:6px;background:var(--bg-tertiary);border-radius:99px;
                  padding:1px 7px;font-size:10px;font-weight:600;color:var(--text-secondary)">
                  ${levels.length} level${levels.length !== 1 ? 's' : ''}
                </span>
              </div>
            </div>
          </div>
          <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px">
            ${Utils.statusBadge(t.status)}
          </div>
        </div>

        <!-- Contact info -->
        <div style="display:flex;flex-direction:column;gap:5px;margin-bottom:10px">
          ${t.email ? `<div style="font-size:var(--font-size-sm);color:var(--text-secondary)"><i class="fas fa-envelope" style="width:16px;color:var(--text-muted)"></i> ${Utils.esc(t.email)}</div>` : ''}
          ${t.phone ? `<div style="font-size:var(--font-size-sm);color:var(--text-secondary)"><i class="fas fa-phone" style="width:16px;color:var(--text-muted)"></i> ${Utils.esc(t.phone)}</div>` : ''}
          ${t.fee_session ? `<div style="font-size:var(--font-size-sm);color:var(--brand-primary);font-weight:600"><i class="fas fa-dollar-sign" style="width:16px"></i> ${Utils.formatCurrency(t.fee_session)} / session</div>` : ''}
        </div>

        <!-- Assigned levels -->
        <div style="background:var(--bg-tertiary);border-radius:var(--radius-md);
          padding:10px 12px;margin-bottom:10px;border:1px solid var(--border-color)">
          <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;
            color:var(--text-muted);margin-bottom:8px">
            <i class="fas fa-chalkboard" style="margin-right:5px"></i>Assigned Levels
          </div>
          ${levelsBadges}
        </div>

        <!-- Actions -->
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn btn-ghost btn-sm" style="flex:1;min-width:110px" onclick="TrainersPage.manageAssignments('${t.id}')">
            <i class="fas fa-layer-group"></i> Assignments
          </button>
          <button class="btn btn-primary btn-sm" style="flex:1;min-width:110px" onclick="TrainersPage.openAttendance('${t.id}')">
            <i class="fas fa-calendar-check"></i> Attendance
          </button>
          <button class="btn btn-ghost btn-icon btn-sm" onclick="TrainersPage.openEdit('${t.id}')"><i class="fas fa-edit"></i></button>
          <button class="btn btn-danger btn-icon btn-sm" onclick="TrainersPage.deleteTrainer('${t.id}', '${Utils.esc(t.full_name)}')"><i class="fas fa-trash"></i></button>
        </div>
      </div>
    `;
  },

  openOnboard() {
    Modal.open('Onboard New Trainer', this.trainerFormHTML(null));
  },

  openEdit(id) {
    const t = this.trainers.find(t => t.id === id);
    if (!t) return;
    Modal.open('Edit Trainer', this.trainerFormHTML(t));
  },

  trainerFormHTML(t) {
    return `
      <form onsubmit="TrainersPage.saveTrainer(event, ${t ? `'${t.id}'` : 'null'})">
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Full Name *</label>
            <input type="text" name="full_name" class="form-input" required value="${Utils.esc(t?.full_name || '')}" />
          </div>
          <div class="form-group">
            <label class="form-label">Email</label>
            <input type="email" name="email" class="form-input" value="${Utils.esc(t?.email || '')}" />
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Phone</label>
            <input type="tel" name="phone" class="form-input" value="${Utils.esc(t?.phone || '')}" />
          </div>
          <div class="form-group">
            <label class="form-label">Fee per Session ($)</label>
            <input type="number" name="fee_session" class="form-input" step="0.01" value="${t?.fee_session || '0'}" />
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Status</label>
          <select name="status" class="form-select">
            <option value="active" ${t?.status==='active'?'selected':''}>Active</option>
            <option value="inactive" ${t?.status==='inactive'?'selected':''}>Inactive</option>
          </select>
        </div>
        <div class="modal-footer" style="padding:0;border:none;margin-top:1rem">
          <button type="button" class="btn btn-secondary" onclick="Modal.close()">Cancel</button>
          <button type="submit" class="btn btn-primary"><i class="fas fa-save"></i> ${t ? 'Save Changes' : 'Onboard Trainer'}</button>
        </div>
      </form>
    `;
  },

  async saveTrainer(e, id) {
    e.preventDefault();
    const fd = new FormData(e.target);
    const data = Object.fromEntries(fd.entries());
    data.fee_session = parseFloat(data.fee_session) || 0;
    if (!data.email) data.email = null;
    if (!data.phone) data.phone = null;
    try {
      const result = id ? await DB.updateTrainer(id, data) : await DB.createTrainer(data);
      if (result.error) throw result.error;
      Toast.success(id ? 'Trainer updated!' : 'Trainer onboarded!');
      Modal.close();
      await this.loadTrainers();
    } catch (err) { Toast.error(err.message || 'Failed to save trainer'); }
  },

  async deleteTrainer(id, name) {
    if (!confirm(`Remove trainer "${name}"?`)) return;
    const { error } = await DB.deleteTrainer(id);
    if (error) return Toast.error(error.message);
    Toast.success('Trainer removed');
    await this.loadTrainers();
  },

  async manageAssignments(trainerId) {
    const trainer = this.trainers.find(t => t.id === trainerId);
    if (!trainer) return;

    const [{ data: courses }, { data: allLevels }, { data: existing }] = await Promise.all([
      DB.getCourses(),
      // Include trainer_id (legacy) so we can merge both sources
      DB.getAll('levels', { select: 'id, name, day_of_week, trainer_id, course_id, course:course_id(id, name)' }),
      DB.getTrainerAssignments(trainerId),
    ]);

    // Merge: new trainer_assignments rows + legacy levels.trainer_id
    const fromAssignments = new Set((existing || []).map(a => a.level_id));
    const fromLegacy = new Set(
      (allLevels || []).filter(lv => lv.trainer_id === trainerId).map(lv => lv.id)
    );
    const assignedIds = new Set([...fromAssignments, ...fromLegacy]);

    const courseGroups = (courses || []).map(c => {
      const levels = (allLevels || []).filter(lv => lv.course_id === c.id);
      return `
        <div style="margin-bottom:1rem">
          <div style="font-size:var(--font-size-sm);font-weight:700;color:var(--text-secondary);margin-bottom:6px;text-transform:uppercase;letter-spacing:.5px">${Utils.esc(c.name)}</div>
          ${levels.length ? levels.map(lv => `
            <label style="display:flex;align-items:center;gap:8px;padding:6px 0;cursor:pointer">
              <input type="checkbox" name="level_ids" value="${lv.id}" ${assignedIds.has(lv.id)?'checked':''}
                style="width:16px;height:16px;accent-color:var(--brand-primary)" />
              <span style="font-size:var(--font-size-sm)">${Utils.esc(lv.name)}</span>
              ${lv.day_of_week ? `<span style="font-size:var(--font-size-xs);color:var(--text-muted)">(${lv.day_of_week})</span>` : ''}
            </label>
          `).join('') : `<p style="font-size:var(--font-size-xs);color:var(--text-muted);padding:4px 0">No levels defined.</p>`}
        </div>
      `;
    }).join('');

    Modal.open(`Assign Levels — ${trainer.full_name}`, `
      <form onsubmit="TrainersPage.saveAssignments(event, '${trainerId}')">
        <p style="font-size:var(--font-size-sm);color:var(--text-muted);margin-bottom:1rem">Select the course levels this trainer is responsible for.</p>
        ${courseGroups || '<p class="text-muted text-sm">No courses or levels defined yet.</p>'}
        <div class="modal-footer" style="padding:0;border:none;margin-top:1rem">
          <button type="button" class="btn btn-secondary" onclick="Modal.close()">Cancel</button>
          <button type="submit" class="btn btn-primary"><i class="fas fa-save"></i> Save Assignments</button>
        </div>
      </form>
    `);
  },

  async saveAssignments(e, trainerId) {
    e.preventDefault();
    const form = e.target;
    const checkboxes = form.querySelectorAll('input[name="level_ids"]:checked');
    const levelIds = Array.from(checkboxes).map(c => c.value);
    try {
      // 1. Update trainer_assignments table (new multi-trainer source)
      const { error } = await DB.setTrainerAssignments(trainerId, levelIds);
      if (error) throw error;

      // 2. Also sync levels.trainer_id (legacy single FK) for full bidirectional consistency:
      //    - For each newly assigned level → set trainer_id = trainerId (if not already set)
      //    - For all levels previously set to this trainer but now unchecked → clear trainer_id
      const { data: allLevels } = await DB.getAll('levels', {
        select: 'id, trainer_id'
      });
      const levelIdSet = new Set(levelIds);
      const updates = (allLevels || []).map(lv => {
        if (levelIdSet.has(lv.id) && lv.trainer_id !== trainerId) {
          // assign this trainer as the primary (legacy) trainer
          return DB.updateLevel(lv.id, { trainer_id: trainerId });
        }
        if (!levelIdSet.has(lv.id) && lv.trainer_id === trainerId) {
          // unassigned — clear the legacy FK
          return DB.updateLevel(lv.id, { trainer_id: null });
        }
        return null;
      }).filter(Boolean);
      await Promise.all(updates);

      Toast.success('Assignments saved!');
      Modal.close();
      await this.loadTrainers(); // refresh cards to show updated levels
    } catch (err) { Toast.error(err.message || 'Failed to save assignments'); }
  },

  // ─────────────────────────────────────────────────────────────────────────
  // TRAINER ATTENDANCE — log sessions attended per level
  // ─────────────────────────────────────────────────────────────────────────
  async openAttendance(trainerId) {
    const trainer = this.trainers.find(t => t.id === trainerId);
    if (!trainer) return;
    Modal.open(`📋 Attendance — ${trainer.full_name}`, `
      <div id="trainer-att-body"><div class="page-loading"><i class="fas fa-spinner fa-spin"></i></div></div>
    `);
    await this._renderAttendanceModal(trainerId, trainer);
  },

  async _renderAttendanceModal(trainerId, trainer) {
    const [{ data: sessions }, { data: allLevels }, { data: assignments }] = await Promise.all([
      DB.getTrainerSessionsByTrainer(trainerId),
      DB.getAll('levels', { select: 'id, name, day_of_week, course:course_id(id, name)', order: 'name' }),
      DB.getAll('trainer_assignments', { filter: { trainer_id: trainerId },
        select: 'level_id' }),
    ]);

    // Assigned level IDs (from trainer_assignments + legacy trainer_id)
    const assignedIds = new Set([
      ...(assignments || []).map(a => a.level_id),
      ...(trainer._levels || []).map(lv => lv.id),
    ]);
    const myLevels = (allLevels || []).filter(lv => assignedIds.has(lv.id));

    const el = document.getElementById('trainer-att-body');
    if (!el) return;

    const sessionRows = (sessions || []).map(s => {
      const fee = s.fee_override != null ? Number(s.fee_override) : Number(trainer.fee_session || 0);
      const cost = fee * (s.sessions_count || 1);
      return `
        <tr>
          <td style="padding:8px 6px;font-size:var(--font-size-sm)">${Utils.formatDate(s.session_date)}</td>
          <td style="padding:8px 6px;font-size:var(--font-size-sm)">${Utils.esc(s.level?.name || '—')}</td>
          <td style="padding:8px 6px;font-size:var(--font-size-sm)">${Utils.esc(s.level?.course?.name || '—')}</td>
          <td style="padding:8px 6px;text-align:center">
            <span class="badge ${s.attended ? 'badge-green' : 'badge-red'}">${s.attended ? 'Present' : 'Absent'}</span>
          </td>
          <td style="padding:8px 6px;text-align:center;font-size:var(--font-size-sm)">${s.sessions_count || 1}</td>
          <td style="padding:8px 6px;text-align:right;font-size:var(--font-size-sm);font-weight:600;color:var(--brand-primary)">${Utils.formatCurrency(cost)}</td>
          <td style="padding:8px 6px;text-align:center">
            <button class="btn btn-ghost btn-icon btn-sm" onclick="TrainersPage._deleteSession('${s.id}','${trainerId}')">
              <i class="fas fa-trash" style="color:var(--brand-danger)"></i>
            </button>
          </td>
        </tr>
      `;
    }).join('');

    const totalSessions = (sessions || []).filter(s => s.attended).reduce((a, s) => a + (s.sessions_count || 1), 0);
    const totalCost = (sessions || []).reduce((a, s) => {
      const fee = s.fee_override != null ? Number(s.fee_override) : Number(trainer.fee_session || 0);
      return a + fee * (s.sessions_count || 1);
    }, 0);

    const levelOptions = myLevels.length
      ? myLevels.map(lv => `<option value="${lv.id}">${Utils.esc(lv.course?.name || '')} › ${Utils.esc(lv.name)}</option>`).join('')
      : '<option value="">No levels assigned</option>';

    el.innerHTML = `
      <!-- Add session form -->
      <form onsubmit="TrainersPage._logSession(event,'${trainerId}')"
        style="background:var(--bg-tertiary);border-radius:var(--radius-md);padding:14px;margin-bottom:16px;
          border:1px solid var(--border-color)">
        <div style="font-weight:700;font-size:var(--font-size-sm);margin-bottom:10px">
          <i class="fas fa-plus-circle" style="color:var(--brand-primary);margin-right:6px"></i>Log New Session
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px">
          <div class="form-group" style="margin:0">
            <label class="form-label">Level</label>
            <select name="level_id" class="form-select" required ${!myLevels.length ? 'disabled' : ''}>
              ${levelOptions}
            </select>
          </div>
          <div class="form-group" style="margin:0">
            <label class="form-label">Date</label>
            <input type="date" name="session_date" class="form-input" value="${Utils.todayISO()}" required />
          </div>
          <div class="form-group" style="margin:0">
            <label class="form-label">Sessions Count</label>
            <input type="number" name="sessions_count" class="form-input" value="1" min="1" max="20" />
          </div>
          <div class="form-group" style="margin:0">
            <label class="form-label">Fee Override ($) <span style="font-size:10px;color:var(--text-muted)">(blank = default)</span></label>
            <input type="number" name="fee_override" class="form-input" step="0.01" placeholder="${trainer.fee_session || 0}" />
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
          <label style="display:flex;align-items:center;gap:6px;font-size:var(--font-size-sm);cursor:pointer">
            <input type="checkbox" name="attended" value="1" checked
              style="width:15px;height:15px;accent-color:var(--brand-primary)" />
            Attended
          </label>
          <div class="form-group" style="margin:0;flex:1;min-width:140px">
            <input type="text" name="notes" class="form-input" placeholder="Notes (optional)" />
          </div>
          <button type="submit" class="btn btn-primary btn-sm">
            <i class="fas fa-save"></i> Log Session
          </button>
        </div>
      </form>

      <!-- Summary bar -->
      <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:12px">
        ${[
          { label: 'Sessions attended', val: totalSessions, color: '#22c55e' },
          { label: 'Total cost', val: Utils.formatCurrency(totalCost), color: '#6366f1' },
          { label: 'Default fee', val: Utils.formatCurrency(trainer.fee_session || 0) + ' / session', color: '#f59e0b' },
        ].map(c => `
          <div style="flex:1;min-width:130px;padding:10px 14px;border-radius:var(--radius-md);
            border:1px solid ${c.color}33;background:${c.color}11;text-align:center">
            <div style="font-weight:800;font-size:var(--font-size-md);color:${c.color}">${c.val}</div>
            <div style="font-size:10px;color:var(--text-muted);margin-top:2px">${c.label}</div>
          </div>
        `).join('')}
      </div>

      <!-- Session log table -->
      ${sessions && sessions.length ? `
        <div style="overflow-x:auto">
          <table style="width:100%;border-collapse:collapse">
            <thead>
              <tr style="border-bottom:2px solid var(--border-color);font-size:var(--font-size-xs);
                color:var(--text-muted);text-transform:uppercase;letter-spacing:.5px">
                <th style="padding:6px;text-align:left">Date</th>
                <th style="padding:6px;text-align:left">Level</th>
                <th style="padding:6px;text-align:left">Course</th>
                <th style="padding:6px;text-align:center">Status</th>
                <th style="padding:6px;text-align:center">Sessions</th>
                <th style="padding:6px;text-align:right">Cost</th>
                <th style="padding:6px"></th>
              </tr>
            </thead>
            <tbody>${sessionRows}</tbody>
          </table>
        </div>
      ` : `<div class="empty-state"><i class="fas fa-calendar-times"></i><p>No sessions logged yet.</p></div>`}
    `;
  },

  async _logSession(e, trainerId) {
    e.preventDefault();
    const fd   = new FormData(e.target);
    const data = Object.fromEntries(fd.entries());
    data.trainer_id     = trainerId;
    data.attended       = fd.has('attended');
    data.sessions_count = parseInt(data.sessions_count) || 1;
    data.fee_override   = data.fee_override !== '' ? parseFloat(data.fee_override) : null;
    if (!data.notes) data.notes = null;

    try {
      const { error } = await DB.createTrainerSession(data);
      if (error) throw error;
      Toast.success('Session logged!');
      const trainer = this.trainers.find(t => t.id === trainerId);
      await this._renderAttendanceModal(trainerId, trainer);
    } catch (err) { Toast.error(err.message || 'Failed to log session'); }
  },

  async _deleteSession(sessionId, trainerId) {
    if (!confirm('Remove this session log?')) return;
    const { error } = await DB.deleteTrainerSession(sessionId);
    if (error) return Toast.error(error.message);
    Toast.success('Session removed');
    const trainer = this.trainers.find(t => t.id === trainerId);
    await this._renderAttendanceModal(trainerId, trainer);
  },

  // ─────────────────────────────────────────────────────────────────────────
  // TRAINER COST FORECAST — chart of projected monthly costs
  // ─────────────────────────────────────────────────────────────────────────
  _costChart: null,

  async openCostForecast() {
    Modal.open('📊 Trainer Cost Forecast', `
      <div style="font-size:var(--font-size-xs);color:var(--text-muted);margin-bottom:12px">
        Expected monthly cost per trainer based on logged sessions and default session fees.
        Solid bars = past actual cost · Faded bars = projected (based on average sessions/month).
      </div>
      <div style="height:340px"><canvas id="trainer-cost-chart"></canvas></div>
      <div id="trainer-cost-summary" style="margin-top:14px"></div>
    `, { size: 'xl' });
    setTimeout(() => this._buildCostChart(), 80);
  },

  async _buildCostChart() {
    const ctx = document.getElementById('trainer-cost-chart');
    if (!ctx) return;
    if (this._costChart) { this._costChart.destroy(); this._costChart = null; }

    // Load all sessions + trainer info
    const { data: sessions } = await DB.getTrainerSessions({ limit: 2000 });
    const allSessions = sessions || [];

    const now = new Date();
    const labels = [];
    // Show 6 past months + 6 future months
    for (let i = -5; i <= 6; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
      labels.push(d.toLocaleString('default', { month: 'short', year: '2-digit' }));
    }

    // Group sessions by trainer
    const trainerMap = {};
    allSessions.forEach(s => {
      const tid = s.trainer_id;
      if (!trainerMap[tid]) trainerMap[tid] = { name: s.trainer?.full_name || tid, feeDefault: Number(s.trainer?.fee_session || 0), sessions: [] };
      trainerMap[tid].sessions.push(s);
    });

    // Also include trainers with no sessions yet but with a fee_session set
    this.trainers.filter(t => t.fee_session > 0 && !trainerMap[t.id]).forEach(t => {
      trainerMap[t.id] = { name: t.full_name, feeDefault: Number(t.fee_session || 0), sessions: [] };
    });

    const palette = ['#6366f1','#22c55e','#f59e0b','#ef4444','#8b5cf6','#ec4899','#14b8a6','#f97316'];
    const datasets = [];
    const summaryRows = [];

    Object.values(trainerMap).forEach((tr, idx) => {
      const color = palette[idx % palette.length];
      const dataActual = [], dataForecast = [];

      for (let i = -5; i <= 6; i++) {
        const d    = new Date(now.getFullYear(), now.getMonth() + i, 1);
        const mEnd = new Date(d.getFullYear(), d.getMonth() + 1, 0);
        const s    = Utils.localDateISO(d);
        const e    = Utils.localDateISO(mEnd);
        const isPast = d <= now;

        const monthSessions = tr.sessions.filter(ss =>
          (ss.session_date || '') >= s && (ss.session_date || '') <= e && ss.attended
        );
        const actualCost = monthSessions.reduce((sum, ss) => {
          const fee = ss.fee_override != null ? Number(ss.fee_override) : tr.feeDefault;
          return sum + fee * (ss.sessions_count || 1);
        }, 0);

        if (isPast) {
          dataActual.push(Math.round(actualCost * 100) / 100);
          dataForecast.push(null);
        } else {
          dataActual.push(null);
          // Forecast: use average sessions/month from past 3 months as projection base
          const pastSessions = tr.sessions.filter(ss => ss.attended);
          const avgSessionsPerMonth = pastSessions.length > 0
            ? pastSessions.reduce((a, ss) => a + (ss.sessions_count || 1), 0) / Math.max(1,
                [...new Set(pastSessions.map(ss => (ss.session_date || '').slice(0, 7)))].length)
            : (tr._levels?.length || 4); // default: assume ~4 sessions/month if no history
          const projectedCost = tr.feeDefault * avgSessionsPerMonth;
          dataForecast.push(Math.round(projectedCost * 100) / 100);
        }
      }

      // Total actual cost (all time)
      const totalActual = tr.sessions.filter(s => s.attended).reduce((sum, s) => {
        const fee = s.fee_override != null ? Number(s.fee_override) : tr.feeDefault;
        return sum + fee * (s.sessions_count || 1);
      }, 0);

      summaryRows.push({ name: tr.name, totalActual, feeDefault: tr.feeDefault, color });

      datasets.push({
        label: tr.name + ' (actual)',
        data: dataActual,
        backgroundColor: color + 'CC',
        borderRadius: 4,
        stack: tr.name,
        order: 2,
      });
      datasets.push({
        label: tr.name + ' (forecast)',
        data: dataForecast,
        backgroundColor: color + '40',
        borderColor: color,
        borderWidth: 1.5,
        borderRadius: 4,
        stack: tr.name,
        order: 1,
      });
    });

    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const gc = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';
    const tc = isDark ? '#9ba8c4' : '#6b7280';

    this._costChart = new Chart(ctx, {
      type: 'bar',
      data: { labels, datasets },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { labels: { color: tc, font: { size: 10 }, filter: (item) => item.text.includes('actual') } },
          tooltip: {
            callbacks: { label: c => ` ${c.dataset.label}: $${(c.parsed.y || 0).toFixed(2)}` }
          },
        },
        scales: {
          x: { stacked: true, grid: { color: gc }, ticks: { color: tc } },
          y: { stacked: true, grid: { color: gc }, ticks: { color: tc, callback: v => '$' + v } },
        },
      },
    });

    // Summary table
    const summaryEl = document.getElementById('trainer-cost-summary');
    if (summaryEl && summaryRows.length) {
      summaryEl.innerHTML = `
        <div style="font-weight:700;font-size:var(--font-size-sm);margin-bottom:8px;color:var(--text-secondary)">
          Trainer Summary
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:8px">
          ${summaryRows.map(r => `
            <div style="flex:1;min-width:160px;padding:10px 14px;border-radius:var(--radius-md);
              border:1px solid ${r.color}33;background:${r.color}11">
              <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">
                <div style="width:8px;height:8px;border-radius:50%;background:${r.color}"></div>
                <span style="font-weight:700;font-size:var(--font-size-sm)">${Utils.esc(r.name)}</span>
              </div>
              <div style="font-size:var(--font-size-xs);color:var(--text-muted)">${Utils.formatCurrency(r.feeDefault)} / session</div>
              <div style="font-size:var(--font-size-sm);font-weight:600;color:${r.color};margin-top:4px">
                Total paid: ${Utils.formatCurrency(r.totalActual)}
              </div>
            </div>
          `).join('')}
        </div>
      `;
    }
  },
};
