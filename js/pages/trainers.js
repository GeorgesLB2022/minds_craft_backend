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
        <div style="display:flex;gap:8px">
          <button class="btn btn-primary btn-sm" style="flex:1" onclick="TrainersPage.manageAssignments('${t.id}')">
            <i class="fas fa-layer-group"></i> Manage Assignments
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
};
