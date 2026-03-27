/* ============================================================
   MINDS' CRAFT — EVENTS PAGE
   ============================================================ */

const EventsPage = {
  events: [],

  async render() {
    const container = document.getElementById('page-container');
    container.innerHTML = `
      <div class="page-header">
        <div class="page-header-left">
          <h2>Events Management</h2>
          <p>Manage events, competitions, and registrations.</p>
        </div>
        <div class="page-header-actions">
          <button class="btn btn-primary" onclick="EventsPage.openCreate()">
            <i class="fas fa-plus"></i> Create New Event
          </button>
        </div>
      </div>

      <div class="events-grid" id="events-grid">
        <div class="page-loading"><i class="fas fa-spinner fa-spin"></i></div>
      </div>
    `;

    await this.loadEvents();
  },

  async loadEvents() {
    const { data, error } = await DB.getEvents();
    if (error) return Toast.error('Failed to load events');
    this.events = data || [];
    this.renderGrid();
  },

  renderGrid() {
    const grid = document.getElementById('events-grid');
    if (!grid) return;
    if (!this.events.length) {
      grid.innerHTML = `<div class="empty-state"><i class="fas fa-calendar-alt"></i><h3>No events yet</h3><p>Create your first event.</p></div>`;
      return;
    }
    grid.innerHTML = this.events.map(e => this.eventCardHTML(e)).join('');
  },

  eventCardHTML(ev) {
    const color = ev.theme_color || '#22c55e';
    const startDate = Utils.formatDate(ev.start_date);
    const endDate = ev.end_date && ev.end_date !== ev.start_date ? ` → ${Utils.formatDate(ev.end_date)}` : '';
    const regCount = ev._reg_count || 0;
    const pct = ev.capacity ? Math.min(Math.round((regCount / ev.capacity) * 100), 100) : 0;

    return `
      <div class="event-card">
        <div class="event-card-banner" style="${ev.image_url
          ? `background:url('${Utils.esc(ev.image_url)}') center/cover no-repeat;`
          : `background:${Utils.esc(color)};`}"></div>
        <div class="event-card-body">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;margin-bottom:.8rem">
            <h3 style="font-size:var(--font-size-md);font-weight:700">${Utils.esc(ev.title)}</h3>
            <div style="display:flex;gap:6px;flex-shrink:0">
              ${Utils.statusBadge(ev.status)}
              <button class="btn btn-ghost btn-icon btn-sm" onclick="EventsPage.openEdit('${ev.id}')"><i class="fas fa-edit"></i></button>
              <button class="btn btn-danger btn-icon btn-sm" onclick="EventsPage.deleteEvent('${ev.id}', '${Utils.esc(ev.title)}')"><i class="fas fa-trash"></i></button>
            </div>
          </div>
          ${ev.description ? `<p style="font-size:var(--font-size-sm);color:var(--text-muted);margin-bottom:.8rem;line-height:1.5">${Utils.esc(ev.description).slice(0, 100)}${ev.description.length > 100 ? '…' : ''}</p>` : ''}
          <div class="event-meta-row"><i class="fas fa-calendar-day" style="color:${Utils.esc(color)}"></i> ${startDate}${endDate}</div>
          ${ev.start_time ? `<div class="event-meta-row"><i class="fas fa-clock" style="color:${Utils.esc(color)}"></i> ${Utils.esc(ev.start_time)} – ${Utils.esc(ev.end_time || '')}</div>` : ''}
          ${ev.location ? `<div class="event-meta-row"><i class="fas fa-map-marker-alt" style="color:${Utils.esc(color)}"></i> ${Utils.esc(ev.location)}</div>` : ''}
        </div>
        <div class="event-card-footer">
          <div style="flex:1">
            <div style="display:flex;justify-content:space-between;font-size:var(--font-size-xs);color:var(--text-muted);margin-bottom:4px">
              <span>${regCount} Registered</span>
              ${ev.capacity ? `<span>/ ${ev.capacity}</span>` : ''}
            </div>
            <div class="progress-bar-wrap">
              <div class="progress-bar-fill ${pct > 90 ? 'danger' : pct > 70 ? 'warning' : ''}" style="width:${pct}%;background:${Utils.esc(color)}"></div>
            </div>
          </div>
          <button class="btn btn-primary btn-sm" style="margin-left:12px" onclick="EventsPage.manageEvent('${ev.id}')">
            <i class="fas fa-cog"></i> Manage
          </button>
        </div>
      </div>
    `;
  },

  openCreate() {
    Modal.open('Create New Event', this.eventFormHTML(null), { size: 'lg' });
  },

  openEdit(id) {
    const ev = this.events.find(e => e.id === id);
    if (!ev) return;
    Modal.open('Edit Event', this.eventFormHTML(ev), { size: 'lg' });
  },

  eventFormHTML(ev) {
    const colorOptions = ['#22c55e', '#6366f1', '#f59e0b', '#ef4444', '#3b82f6', '#ec4899', '#14b8a6', '#8b5cf6'];
    const imgSrc = ev?.image_url || '';
    return `
      <form onsubmit="EventsPage.saveEvent(event, ${ev ? `'${ev.id}'` : 'null'})">
        <div class="form-group">
          <label class="form-label">Event Title *</label>
          <input type="text" name="title" class="form-input" required value="${Utils.esc(ev?.title || '')}" placeholder="e.g. Science Fair 2025" />
        </div>
        <div class="form-group">
          <label class="form-label">Description</label>
          <textarea name="description" class="form-textarea" placeholder="Tell people what this event is about…">${Utils.esc(ev?.description || '')}</textarea>
        </div>

        <!-- Event image -->
        <div class="form-group">
          <label class="form-label">Event Image / Banner <span class="text-muted">(optional)</span></label>

          <!-- Preview -->
          <div id="event-img-preview-wrap" style="margin-bottom:.6rem;display:${imgSrc ? 'flex' : 'none'};align-items:center;gap:10px">
            <img id="event-img-preview" src="${Utils.esc(imgSrc)}" alt=""
              style="height:70px;max-width:200px;object-fit:cover;border-radius:var(--radius-md);
                     border:1px solid var(--border-color)" />
            <button type="button" class="btn btn-danger btn-sm" onclick="EventsPage.clearImage()">
              <i class="fas fa-times"></i> Remove
            </button>
          </div>

          <!-- Upload -->
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:.4rem">
            <label class="btn btn-secondary btn-sm" style="cursor:pointer;margin:0">
              <i class="fas fa-upload"></i> Upload from device
              <input type="file" id="event-img-file" accept="image/*" style="display:none"
                onchange="EventsPage.handleImageFile(this)" />
            </label>
            <span style="font-size:var(--font-size-xs);color:var(--text-muted)">PNG, JPG, WebP — max 2 MB</span>
          </div>

          <!-- URL -->
          <input type="url" name="image_url" id="event-img-url" class="form-input"
            value="${Utils.esc(imgSrc)}" placeholder="… or paste an image URL"
            oninput="EventsPage.onImageUrlInput(this.value)" />
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Start Date *</label>
            <input type="date" name="start_date" class="form-input" required value="${ev?.start_date || ''}" />
          </div>
          <div class="form-group">
            <label class="form-label">End Date</label>
            <input type="date" name="end_date" class="form-input" value="${ev?.end_date || ''}" />
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Start Time</label>
            <input type="time" name="start_time" class="form-input" value="${ev?.start_time || ''}" />
          </div>
          <div class="form-group">
            <label class="form-label">End Time</label>
            <input type="time" name="end_time" class="form-input" value="${ev?.end_time || ''}" />
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Location</label>
            <input type="text" name="location" class="form-input" value="${Utils.esc(ev?.location || '')}" placeholder="e.g. Main Hall" />
          </div>
          <div class="form-group">
            <label class="form-label">Capacity</label>
            <input type="number" name="capacity" class="form-input" value="${ev?.capacity || 50}" />
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Status</label>
            <select name="status" class="form-select">
              <option value="upcoming" ${ev?.status==='upcoming'?'selected':''}>Upcoming</option>
              <option value="active" ${ev?.status==='active'?'selected':''}>Active</option>
              <option value="completed" ${ev?.status==='completed'?'selected':''}>Completed</option>
              <option value="cancelled" ${ev?.status==='cancelled'?'selected':''}>Cancelled</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Theme Color</label>
            <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
              ${colorOptions.map(c => `
                <div class="brand-color-swatch" style="background:${c};${ev?.theme_color===c?'border-color:'+c+';box-shadow:0 0 0 3px '+c+'44':''}"
                  onclick="EventsPage.selectColor('${c}', this)" data-color="${c}"></div>
              `).join('')}
              <input type="hidden" name="theme_color" id="event-color" value="${ev?.theme_color || '#22c55e'}" />
            </div>
          </div>
        </div>
        <div class="modal-footer" style="padding:0;border:none;margin-top:1rem">
          <button type="button" class="btn btn-secondary" onclick="Modal.close()">Cancel</button>
          <button type="submit" class="btn btn-primary"><i class="fas fa-save"></i> ${ev ? 'Save Changes' : 'Create Event'}</button>
        </div>
      </form>
    `;
  },

  // Image helpers
  handleImageFile(input) {
    const file = input.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) return Toast.error('Image too large — max 2 MB');
    const reader = new FileReader();
    reader.onload = ev => {
      const src = ev.target.result;
      const urlInput = document.getElementById('event-img-url');
      if (urlInput) urlInput.value = src;
      this._showImgPreview(src);
    };
    reader.readAsDataURL(file);
  },

  onImageUrlInput(val) {
    if (!val?.trim()) { this.clearImage(); return; }
    this._showImgPreview(val.trim());
  },

  _showImgPreview(src) {
    const wrap = document.getElementById('event-img-preview-wrap');
    const img  = document.getElementById('event-img-preview');
    if (wrap) wrap.style.display = 'flex';
    if (img)  img.src = src;
  },

  clearImage() {
    const wrap = document.getElementById('event-img-preview-wrap');
    const img  = document.getElementById('event-img-preview');
    const url  = document.getElementById('event-img-url');
    if (wrap) wrap.style.display = 'none';
    if (img)  img.src = '';
    if (url)  url.value = '';
  },

  selectColor(color, el) {
    document.querySelectorAll('.brand-color-swatch').forEach(s => {
      s.style.borderColor = 'var(--border-color)';
      s.style.boxShadow = '';
    });
    el.style.borderColor = color;
    el.style.boxShadow = `0 0 0 3px ${color}44`;
    const input = document.getElementById('event-color');
    if (input) input.value = color;
  },

  async saveEvent(e, id) {
    e.preventDefault();
    const fd = new FormData(e.target);
    const data = Object.fromEntries(fd.entries());
    data.capacity = parseInt(data.capacity) || 50;
    ['description','end_date','start_time','end_time','location','image_url'].forEach(k => {
      if (!data[k]) data[k] = null;
    });
    try {
      const result = id ? await DB.updateEvent(id, data) : await DB.createEvent(data);
      if (result.error) throw result.error;
      Toast.success(id ? 'Event updated!' : 'Event created!');
      Modal.close();
      await this.loadEvents();
    } catch (err) { Toast.error(err.message || 'Failed to save event'); }
  },

  async deleteEvent(id, title) {
    if (!confirm(`Delete event "${title}"?`)) return;
    const { error } = await DB.deleteEvent(id);
    if (error) return Toast.error(error.message);
    Toast.success('Event deleted');
    await this.loadEvents();
  },

  async manageEvent(id) {
    const ev = this.events.find(e => e.id === id);
    if (!ev) return;
    const { data: regs } = await DB.getEventRegistrations(id);
    const regList = (regs || []).map(r => `
      <div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border-light)">
        <div class="users-table-avatar" style="background:${Utils.avatarColor(r.user?.full_name || '')};width:30px;height:30px;font-size:11px">${Utils.initials(r.user?.full_name || '')}</div>
        <div>
          <div style="font-size:var(--font-size-sm);font-weight:600">${Utils.esc(r.user?.full_name || 'Unknown')}</div>
          <div style="font-size:var(--font-size-xs);color:var(--text-muted)">${Utils.esc(r.user?.email || '')}</div>
        </div>
        <span style="margin-left:auto;font-size:var(--font-size-xs);color:var(--text-muted)">${Utils.formatDate(r.registered_at)}</span>
      </div>
    `).join('');

    Modal.open(`Registrations — ${ev.title}`, `
      <div>
        <div class="stat-row">
          <div class="stat-item">
            <div class="stat-val">${(regs || []).length}</div>
            <div class="stat-lbl">Registered</div>
          </div>
          <div class="stat-item">
            <div class="stat-val">${ev.capacity || '∞'}</div>
            <div class="stat-lbl">Capacity</div>
          </div>
          <div class="stat-item">
            <div class="stat-val">${Math.max(0, (ev.capacity || 0) - (regs || []).length)}</div>
            <div class="stat-lbl">Available</div>
          </div>
        </div>
        <div style="max-height:350px;overflow-y:auto">
          ${regList || '<div class="empty-state"><i class="fas fa-users"></i><p>No registrations yet</p></div>'}
        </div>
        <div style="margin-top:12px;text-align:right">
          <button class="btn btn-secondary btn-sm" onclick="EventsPage.exportRegs('${id}')">
            <i class="fas fa-file-csv"></i> Export
          </button>
        </div>
      </div>
    `);
  },

  exportRegs(id) {
    Toast.info('Export coming soon');
  },
};
