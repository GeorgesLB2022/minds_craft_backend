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
    const { data, error } = await DB.getTrainers();
    if (error) return Toast.error('Failed to load trainers');
    this.trainers = data || [];
    this.renderGrid(this.trainers);
  },

  filter(q) {
    const filtered = this.trainers.filter(t =>
      (t.full_name || '').toLowerCase().includes(q.toLowerCase()) ||
      (t.email || '').toLowerCase().includes(q.toLowerCase())
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
    return `
      <div class="trainer-card">
        <div class="trainer-card-header">
          <div style="display:flex;align-items:center;gap:12px">
            <div class="trainer-avatar" style="background:${color}">${Utils.initials(t.full_name)}</div>
            <div>
              <div style="font-weight:700;font-size:var(--font-size-md)">${Utils.esc(t.full_name)}</div>
              <div style="font-size:var(--font-size-xs);color:var(--text-muted)">Staff / Trainer</div>
            </div>
          </div>
          <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px">
            ${Utils.statusBadge(t.status)}
          </div>
        </div>
        <div style="display:flex;flex-direction:column;gap:6px;margin-bottom:12px">
          ${t.email ? `<div style="font-size:var(--font-size-sm);color:var(--text-secondary)"><i class="fas fa-envelope" style="width:16px;color:var(--text-muted)"></i> ${Utils.esc(t.email)}</div>` : ''}
          ${t.phone ? `<div style="font-size:var(--font-size-sm);color:var(--text-secondary)"><i class="fas fa-phone" style="width:16px;color:var(--text-muted)"></i> ${Utils.esc(t.phone)}</div>` : ''}
          ${t.fee_session ? `<div style="font-size:var(--font-size-sm);color:var(--brand-primary);font-weight:600"><i class="fas fa-dollar-sign" style="width:16px"></i> ${Utils.formatCurrency(t.fee_session)} / session</div>` : ''}
        </div>
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
      DB.getAllLevels(),
      DB.getTrainerAssignments(trainerId),
    ]);

    const assignedIds = (existing || []).map(a => a.level_id);

    const courseGroups = (courses || []).map(c => {
      const levels = (allLevels || []).filter(lv => lv.course_id === c.id);
      return `
        <div style="margin-bottom:1rem">
          <div style="font-size:var(--font-size-sm);font-weight:700;color:var(--text-secondary);margin-bottom:6px;text-transform:uppercase;letter-spacing:.5px">${Utils.esc(c.name)}</div>
          ${levels.length ? levels.map(lv => `
            <label style="display:flex;align-items:center;gap:8px;padding:6px 0;cursor:pointer">
              <input type="checkbox" name="level_ids" value="${lv.id}" ${assignedIds.includes(lv.id)?'checked':''}
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
      const { error } = await DB.setTrainerAssignments(trainerId, levelIds);
      if (error) throw error;
      Toast.success('Assignments saved!');
      Modal.close();
    } catch (err) { Toast.error(err.message || 'Failed to save assignments'); }
  },
};
