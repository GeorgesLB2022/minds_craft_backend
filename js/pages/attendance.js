/* ============================================================
   MINDS' CRAFT — ATTENDANCE PAGE
   Auto-save: every status click, time change, and note change
   is persisted immediately via upsert.
   ============================================================ */

const AttendancePage = {
  currentTab: 'daily',
  records:    {},   // studentId → { id, status, checkin_time, notes, _saving, _saved, _error }
  levelId:    null,
  date:       null,
  students:   [],

  // Cached data loaded once on render
  _allCourses: [],
  _allLevels:  [],

  // Debounce timers for text fields  (studentId → timer)
  _saveTimers: {},

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────
  async render() {
    const container = document.getElementById('page-container');
    container.innerHTML = `
      <div class="page-header">
        <div class="page-header-left">
          <h2>Attendance Tracker</h2>
          <p>Click a status to save instantly. Changes are auto-saved per student.</p>
        </div>
        <div class="page-header-actions">
          <button class="btn btn-secondary" onclick="AttendancePage.exportCSV()">
            <i class="fas fa-file-csv"></i> Export CSV
          </button>
        </div>
      </div>

      <div class="tabs">
        <button class="tab-btn ${this.currentTab==='daily'?'active':''}"
          onclick="AttendancePage.switchTab('daily',this)">Daily View</button>
        <button class="tab-btn ${this.currentTab==='period'?'active':''}"
          onclick="AttendancePage.switchTab('period',this)">Period Summary</button>
      </div>

      <div id="att-filters" class="card" style="margin-bottom:1rem">
        ${this.filtersHTML()}
      </div>

      <div class="attendance-header-grid" id="att-stats">
        <div class="att-stat-card total">  <div class="val" id="att-total">0</div>  <div class="lbl">Total</div></div>
        <div class="att-stat-card present"><div class="val" id="att-present">0</div><div class="lbl">Present</div></div>
        <div class="att-stat-card late">   <div class="val" id="att-late">0</div>   <div class="lbl">Late</div></div>
        <div class="att-stat-card absent"> <div class="val" id="att-absent">0</div> <div class="lbl">Absent</div></div>
      </div>

      <div class="card" style="padding:0;overflow:hidden">
        <div class="table-wrap">
          <table class="table">
            <thead id="att-thead">
              <tr>
                <th>Student</th>
                <th>Status</th>
                <th>Check-in Time</th>
                <th>Notes</th>
                <th style="width:80px;text-align:center">Saved</th>
              </tr>
            </thead>
            <tbody id="att-tbody">
              <tr><td colspan="5" class="text-center text-muted">
                Select a date, course and level to load attendance.
              </td></tr>
            </tbody>
          </table>
        </div>
      </div>
    `;

    await this.loadAllData();
  },

  // ─────────────────────────────────────────────────────────────────────────
  // TABS
  // ─────────────────────────────────────────────────────────────────────────
  switchTab(tab, btn) {
    this.currentTab = tab;
    document.querySelectorAll('.tabs .tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const filtersEl = document.getElementById('att-filters');
    if (filtersEl) filtersEl.innerHTML = this.filtersHTML();
    if (this.currentTab === 'daily') {
      this._populateCoursesByDate();
    } else {
      this._populateAllCourses();
      // Auto-load period data with default date range
      setTimeout(() => this.loadPeriod(), 50);
    }
  },

  // ─────────────────────────────────────────────────────────────────────────
  // FILTERS HTML
  // ─────────────────────────────────────────────────────────────────────────
  filtersHTML() {
    if (this.currentTab === 'daily') {
      return `
        <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
          <div class="form-group" style="margin:0;flex:1;min-width:140px">
            <label class="form-label">Date</label>
            <input type="date" id="att-date" class="form-input" value="${Utils.todayISO()}"
              onchange="AttendancePage.onDateChange()" />
          </div>
          <div class="form-group" style="margin:0;flex:1;min-width:160px">
            <label class="form-label">
              Course
              <span id="att-weekday-hint" style="font-size:10px;color:var(--brand-primary);margin-left:4px"></span>
            </label>
            <select id="att-course" class="form-select" onchange="AttendancePage.onCourseChange()">
              <option value="">— Select Course —</option>
            </select>
          </div>
          <div class="form-group" style="margin:0;flex:1;min-width:140px">
            <label class="form-label">Level</label>
            <select id="att-level" class="form-select" onchange="AttendancePage.onFilterChange()">
              <option value="">— Select Level —</option>
            </select>
          </div>
          <div class="form-group" style="margin:0;flex:1;min-width:160px">
            <label class="form-label">Search Student</label>
            <div class="search-input-wrap">
              <i class="fas fa-search"></i>
              <input type="text" id="att-search" placeholder="Search…"
                oninput="AttendancePage.filterStudents(this.value)" />
            </div>
          </div>
        </div>
      `;
    } else {
      return `
        <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
          <div class="form-group" style="margin:0;flex:1;min-width:130px">
            <label class="form-label">Start Date</label>
            <input type="date" id="att-start" class="form-input"
              value="${new Date(new Date().setDate(1)).toISOString().slice(0,10)}"
              onchange="AttendancePage.loadPeriod()" />
          </div>
          <div class="form-group" style="margin:0;flex:1;min-width:130px">
            <label class="form-label">End Date</label>
            <input type="date" id="att-end" class="form-input"
              value="${Utils.todayISO()}" onchange="AttendancePage.loadPeriod()" />
          </div>
          <div class="form-group" style="margin:0;flex:1;min-width:140px">
            <label class="form-label">Course</label>
            <select id="att-course" class="form-select" onchange="AttendancePage.loadLevelsPeriod()">
              <option value="">— All Courses —</option>
            </select>
          </div>
          <div class="form-group" style="margin:0;flex:1;min-width:140px">
            <label class="form-label">Level</label>
            <select id="att-level" class="form-select" onchange="AttendancePage.loadPeriod()">
              <option value="">— All Levels —</option>
            </select>
          </div>
          <div class="form-group" style="margin:0;flex:1;min-width:160px">
            <label class="form-label">Search Student</label>
            <div class="search-input-wrap">
              <i class="fas fa-search"></i>
              <input type="text" id="period-search" placeholder="Name…"
                oninput="AttendancePage.filterPeriodRows(this.value)" />
            </div>
          </div>
        </div>
      `;
    }
  },

  // ─────────────────────────────────────────────────────────────────────────
  // LOAD ALL COURSES + LEVELS ONCE
  // ─────────────────────────────────────────────────────────────────────────
  async loadAllData() {
    const [{ data: courses }, { data: levels }] = await Promise.all([
      DB.getCourses(),
      DB.getAll('levels', {
        select: 'id, name, course_id, day_of_week, start_time, end_time, status',
        order:  'order_num',
      }),
    ]);
    this._allCourses = courses || [];
    this._allLevels  = levels  || [];

    if (this.currentTab === 'daily') {
      this._populateCoursesByDate();
    } else {
      this._populateAllCourses();
    }
  },

  // ─────────────────────────────────────────────────────────────────────────
  // HELPERS
  // ─────────────────────────────────────────────────────────────────────────
  _weekdayName(dateStr) {
    if (!dateStr) return null;
    const days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
    // Use UTC to avoid timezone day-shift
    const d = new Date(dateStr + 'T00:00:00');
    return days[d.getDay()];
  },

  _populateCoursesByDate() {
    const dateVal = document.getElementById('att-date')?.value || Utils.todayISO();
    const weekday = this._weekdayName(dateVal);
    const hintEl  = document.getElementById('att-weekday-hint');
    if (hintEl) hintEl.textContent = weekday ? `(${weekday})` : '';

    const courseIdsForDay = new Set(
      this._allLevels
        .filter(l => l.day_of_week === weekday && l.status !== 'inactive')
        .map(l => l.course_id)
    );

    const courseSelect = document.getElementById('att-course');
    if (!courseSelect) return;
    const previousVal = courseSelect.value;

    courseSelect.innerHTML = '';
    const placeholder = document.createElement('option');
    placeholder.value = '';
    const matchCount = this._allCourses.filter(c => courseIdsForDay.has(c.id)).length;
    placeholder.textContent = matchCount
      ? `— Select Course (${matchCount} on ${weekday}) —`
      : `— No courses scheduled on ${weekday} —`;
    courseSelect.appendChild(placeholder);

    this._allCourses.forEach(c => {
      if (!courseIdsForDay.has(c.id)) return;
      const opt = document.createElement('option');
      opt.value       = c.id;
      opt.textContent = c.name;
      if (c.id === previousVal) opt.selected = true;
      courseSelect.appendChild(opt);
    });

    if (previousVal && courseIdsForDay.has(previousVal)) {
      this._populateLevelsForDay(previousVal, weekday);
    } else {
      this._clearLevelSelect();
      this._clearTable();
    }
  },

  _populateAllCourses() {
    const courseSelect = document.getElementById('att-course');
    if (!courseSelect) return;
    courseSelect.innerHTML = '<option value="">— All Courses —</option>';
    this._allCourses.forEach(c => {
      const opt = document.createElement('option');
      opt.value       = c.id;
      opt.textContent = c.name;
      courseSelect.appendChild(opt);
    });
  },

  _populateLevelsForDay(courseId, weekday) {
    const levelSelect = document.getElementById('att-level');
    if (!levelSelect) return;
    const previousVal = levelSelect.value;
    levelSelect.innerHTML = '<option value="">— Select Level —</option>';

    const levels = this._allLevels.filter(l =>
      l.course_id   === courseId &&
      l.day_of_week === weekday
    );

    levels.forEach(lv => {
      const opt   = document.createElement('option');
      opt.value   = lv.id;
      const time  = lv.start_time
        ? ` (${lv.start_time}${lv.end_time ? '–' + lv.end_time : ''})`
        : '';
      opt.textContent = lv.name + time;
      if (lv.id === previousVal) opt.selected = true;
      levelSelect.appendChild(opt);
    });

    if (levels.length === 1) {
      levelSelect.value = levels[0].id;
      this.onFilterChange();
    } else if (previousVal && levels.find(l => l.id === previousVal)) {
      this.onFilterChange();
    } else {
      this._clearTable();
    }
  },

  _clearLevelSelect(placeholder = '— Select Level —') {
    const el = document.getElementById('att-level');
    if (el) el.innerHTML = `<option value="">${placeholder}</option>`;
  },

  _clearTable() {
    const tbody = document.getElementById('att-tbody');
    if (tbody) tbody.innerHTML = `<tr><td colspan="5" class="text-center text-muted">
      Select a date, course and level to load attendance.</td></tr>`;
    this.students = [];
    this.records  = {};
    this.levelId  = null;
    this.updateStats();
  },

  // ─────────────────────────────────────────────────────────────────────────
  // FILTER EVENTS
  // ─────────────────────────────────────────────────────────────────────────
  onDateChange() {
    this._populateCoursesByDate();
  },

  onCourseChange() {
    const courseId = document.getElementById('att-course')?.value;
    const dateVal  = document.getElementById('att-date')?.value || Utils.todayISO();
    const weekday  = this._weekdayName(dateVal);
    if (!courseId) { this._clearLevelSelect(); this._clearTable(); return; }
    this._populateLevelsForDay(courseId, weekday);
  },

  loadLevelsPeriod() {
    const courseId    = document.getElementById('att-course')?.value;
    const levelSelect = document.getElementById('att-level');
    if (!levelSelect) return;
    levelSelect.innerHTML = '<option value="">— All Levels —</option>';
    if (!courseId) return;
    this._allLevels
      .filter(l => l.course_id === courseId)
      .forEach(lv => {
        const opt      = document.createElement('option');
        opt.value      = lv.id;
        const schedule = [lv.day_of_week, lv.start_time].filter(Boolean).join(' ');
        opt.textContent = schedule ? `${lv.name} (${schedule})` : lv.name;
        levelSelect.appendChild(opt);
      });
    this.loadPeriod();
  },

  async onFilterChange() {
    const levelId = document.getElementById('att-level')?.value;
    const date    = document.getElementById('att-date')?.value;
    if (!levelId || !date) { this._clearTable(); return; }
    this.levelId = levelId;
    this.date    = date;
    await this.loadDailyAttendance();
  },

  // ─────────────────────────────────────────────────────────────────────────
  // LOAD DAILY ATTENDANCE
  // ─────────────────────────────────────────────────────────────────────────
  async loadDailyAttendance() {
    const tbody = document.getElementById('att-tbody');
    tbody.innerHTML = `<tr><td colspan="5" class="text-center">
      <i class="fas fa-spinner fa-spin"></i></td></tr>`;
    try {
      const [{ data: enrollments }, { data: attRecords }] = await Promise.all([
        DB.getAll('enrollments', {
          select: '*, student:student_id(id, full_name)',
          filter: { level_id: this.levelId, status: 'active' },
        }),
        DB.getAll('attendance', {
          filter: { level_id: this.levelId, date: this.date },
        }),
      ]);

      this.students = (enrollments || []).map(e => e.student).filter(Boolean);
      this.records  = {};
      (attRecords || []).forEach(a => {
        this.records[a.student_id] = {
          id:           a.id,
          status:       a.status,
          checkin_time: a.checkin_time,
          notes:        a.notes,
          _saving:      false,
          _saved:       !!a.status,   // already saved if a record exists
          _error:       false,
        };
      });

      this.updateStats();
      this.renderDailyTable();
    } catch (err) {
      console.error(err);
      Toast.error('Failed to load attendance');
    }
  },

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER TABLE ROWS
  // ─────────────────────────────────────────────────────────────────────────
  renderDailyTable() {
    const tbody  = document.getElementById('att-tbody');
    const search = document.getElementById('att-search')?.value?.toLowerCase() || '';
    let students = this.students;
    if (search) students = students.filter(s => s.full_name?.toLowerCase().includes(search));

    if (!students.length) {
      tbody.innerHTML = `
        <tr><td colspan="5">
          <div class="empty-state">
            <i class="fas fa-user-slash"></i>
            <h3>No students enrolled in this level</h3>
            <p>Go to <strong>Courses → Manage Curriculum → Manage Students</strong> to enroll students first.</p>
            <button class="btn btn-primary btn-sm" style="margin-top:10px"
              onclick="App.navigate('courses')">
              <i class="fas fa-layer-group"></i> Go to Courses
            </button>
          </div>
        </td></tr>`;
      return;
    }

    tbody.innerHTML = students.map(s => this._rowHTML(s)).join('');
  },

  _rowHTML(s) {
    const rec    = this.records[s.id] || { status: null, checkin_time: '', notes: '', _saving: false, _saved: false, _error: false };
    const saveEl = this._saveIndicatorHTML(s.id, rec);
    return `
      <tr id="att-row-${s.id}">
        <td>
          <div style="display:flex;align-items:center;gap:10px">
            <div class="users-table-avatar"
              style="background:${Utils.avatarColor(s.full_name)};width:32px;height:32px;font-size:12px">
              ${Utils.initials(s.full_name)}
            </div>
            <span style="font-weight:600">${Utils.esc(s.full_name)}</span>
          </div>
        </td>
        <td>
          <div class="att-table-actions">
            ${['present','late','absent'].map(st => `
              <button class="att-status-btn ${st} ${rec.status===st?'active':''}"
                onclick="AttendancePage.setStatus('${s.id}','${st}',this)">
                ${st.charAt(0).toUpperCase()+st.slice(1)}
              </button>`).join('')}
          </div>
        </td>
        <td>
          <input type="time" class="form-input att-time-input" style="width:120px;padding:5px 8px"
            value="${rec.checkin_time || ''}"
            data-sid="${s.id}"
            onchange="AttendancePage.setCheckin('${s.id}',this.value)" />
        </td>
        <td>
          <input type="text" class="form-input" style="width:200px;padding:5px 8px"
            placeholder="Notes…" value="${Utils.esc(rec.notes || '')}"
            data-sid="${s.id}"
            oninput="AttendancePage.setNotes('${s.id}',this.value)" />
        </td>
        <td style="text-align:center" id="att-save-${s.id}">
          ${saveEl}
        </td>
      </tr>`;
  },

  _saveIndicatorHTML(studentId, rec) {
    if (!rec || (!rec.status && !rec._saving && !rec._saved && !rec._error)) {
      // No record at all yet
      return `<span style="color:var(--text-muted);font-size:11px">—</span>`;
    }
    if (rec._saving) {
      return `<i class="fas fa-spinner fa-spin" style="color:var(--brand-primary);font-size:14px" title="Saving…"></i>`;
    }
    if (rec._error) {
      return `<i class="fas fa-exclamation-circle" style="color:var(--brand-danger);font-size:14px;cursor:pointer"
        title="Save failed — click to retry"
        onclick="AttendancePage._retrySave('${studentId}')"></i>`;
    }
    if (rec._saved) {
      // Show status badge + saved tick
      const cls  = rec.status==='present' ? 'badge-green' : rec.status==='late' ? 'badge-yellow' : 'badge-red';
      const label= rec.status ? rec.status.charAt(0).toUpperCase()+rec.status.slice(1) : '';
      return `
        <div style="display:flex;flex-direction:column;align-items:center;gap:3px">
          <span class="badge ${cls}" style="font-size:10px">${label}</span>
          <span style="font-size:10px;color:var(--brand-primary)">
            <i class="fas fa-check"></i> saved
          </span>
        </div>`;
    }
    return `<span style="color:var(--text-muted);font-size:11px">—</span>`;
  },

  _updateSaveCell(studentId) {
    const cell = document.getElementById(`att-save-${studentId}`);
    if (!cell) return;
    const rec = this.records[studentId];
    cell.innerHTML = this._saveIndicatorHTML(studentId, rec);
  },

  // ─────────────────────────────────────────────────────────────────────────
  // AUTO-SAVE CORE  — upserts a single student's record immediately
  // ─────────────────────────────────────────────────────────────────────────
  async _saveRecord(studentId) {
    const rec = this.records[studentId];
    if (!rec || !rec.status) return;   // nothing to save without a status

    // Mark saving
    rec._saving = true;
    rec._error  = false;
    this._updateSaveCell(studentId);

    const payload = {
      student_id:   studentId,
      level_id:     this.levelId,
      date:         this.date,
      status:       rec.status,
      checkin_time: rec.checkin_time || null,
      notes:        rec.notes        || null,
    };

    try {
      const { data, error } = await DB.upsertAttendance([payload]);
      if (error) throw error;

      // Store the returned id so future upserts update the same row
      if (data && data[0]) rec.id = data[0].id;

      rec._saving = false;
      rec._saved  = true;
      rec._error  = false;
    } catch (err) {
      console.error('Auto-save failed for', studentId, err);
      rec._saving = false;
      rec._saved  = false;
      rec._error  = true;
    }

    this._updateSaveCell(studentId);
  },

  async _retrySave(studentId) {
    await this._saveRecord(studentId);
  },

  // ─────────────────────────────────────────────────────────────────────────
  // STATUS CLICK  — updates UI then auto-saves
  // ─────────────────────────────────────────────────────────────────────────
  setStatus(studentId, status, btn) {
    if (!this.records[studentId]) {
      this.records[studentId] = { status: null, checkin_time: null, notes: null, _saving: false, _saved: false, _error: false };
    }

    const rec        = this.records[studentId];
    const prevStatus = rec.status;
    rec.status       = status;

    // Toggle: clicking the active button again clears the status
    if (prevStatus === status) {
      rec.status = null;
      btn.classList.remove('active');
      this._updateSaveCell(studentId);
      this.updateStats();
      // If there was a saved record we need to remove it — for now just clear locally
      // (a full delete would need another DB call; keep it simple: re-mark will upsert)
      return;
    }

    // Update button active states in the row
    const row = btn.closest('tr');
    if (row) {
      row.querySelectorAll('.att-status-btn').forEach(b => b.classList.remove('active'));
    }
    btn.classList.add('active');

    // Auto-set check-in time to now if not already set and status is present/late
    if ((status === 'present' || status === 'late') && !rec.checkin_time) {
      const now    = new Date();
      const hh     = String(now.getHours()).padStart(2,'0');
      const mm     = String(now.getMinutes()).padStart(2,'0');
      const timeNow = `${hh}:${mm}`;
      rec.checkin_time = timeNow;
      // Update the time input in the row
      if (row) {
        const timeInput = row.querySelector('.att-time-input');
        if (timeInput) timeInput.value = timeNow;
      }
    }

    this.updateStats();

    // Show saving spinner immediately
    rec._saving = true;
    rec._saved  = false;
    rec._error  = false;
    this._updateSaveCell(studentId);

    // Fire the save
    this._saveRecord(studentId);
  },

  // ─────────────────────────────────────────────────────────────────────────
  // CHECK-IN TIME CHANGE  — debounced auto-save
  // ─────────────────────────────────────────────────────────────────────────
  setCheckin(studentId, time) {
    if (!this.records[studentId]) {
      this.records[studentId] = { status: null, checkin_time: null, notes: null, _saving: false, _saved: false, _error: false };
    }
    this.records[studentId].checkin_time = time || null;
    this._debounceSave(studentId);
  },

  // ─────────────────────────────────────────────────────────────────────────
  // NOTES CHANGE  — debounced auto-save
  // ─────────────────────────────────────────────────────────────────────────
  setNotes(studentId, notes) {
    if (!this.records[studentId]) {
      this.records[studentId] = { status: null, checkin_time: null, notes: null, _saving: false, _saved: false, _error: false };
    }
    this.records[studentId].notes = notes || null;
    this._debounceSave(studentId);
  },

  _debounceSave(studentId) {
    // Only save if there's already a status (can't save without one)
    if (!this.records[studentId]?.status) return;

    clearTimeout(this._saveTimers[studentId]);
    // Show a subtle "pending" state
    const rec = this.records[studentId];
    rec._saving = false;
    rec._saved  = false;
    this._updateSaveCell(studentId);

    this._saveTimers[studentId] = setTimeout(() => {
      this._saveRecord(studentId);
    }, 800);  // 800 ms quiet period
  },

  // ─────────────────────────────────────────────────────────────────────────
  // STATS
  // ─────────────────────────────────────────────────────────────────────────
  updateStats() {
    const statuses = Object.values(this.records);
    const total    = this.students.length;
    const present  = statuses.filter(r => r.status === 'present').length;
    const late     = statuses.filter(r => r.status === 'late').length;
    const absent   = statuses.filter(r => r.status === 'absent').length;
    const ids      = ['att-total','att-present','att-late','att-absent'];
    const vals     = [total, present, late, absent];
    ids.forEach((id, i) => {
      const el = document.getElementById(id);
      if (el) el.textContent = vals[i];
    });
  },

  filterStudents(q) {
    this.renderDailyTable();
  },

  // ─── Period search: show/hide rows by student name ─────────────────────
  filterPeriodRows(q) {
    const term = (q || '').toLowerCase().trim();
    const tbody = document.getElementById('att-tbody');
    if (!tbody) return;
    tbody.querySelectorAll('tr[data-student-name]').forEach(tr => {
      const name = tr.dataset.studentName || '';
      tr.style.display = (!term || name.includes(term)) ? '' : 'none';
    });
  },

  // ─────────────────────────────────────────────────────────────────────────
  // PERIOD VIEW
  // ─────────────────────────────────────────────────────────────────────────
  async loadPeriod() {
    const start   = document.getElementById('att-start')?.value;
    const end     = document.getElementById('att-end')?.value;
    const levelId = document.getElementById('att-level')?.value;
    if (!start || !end) return;

    const tbody = document.getElementById('att-tbody');
    const thead = document.getElementById('att-thead');
    if (thead) thead.innerHTML = `
      <tr>
        <th>Student</th>
        <th>Present</th>
        <th>Late</th>
        <th>Absent</th>
        <th>Attendance %</th>
      </tr>`;

    tbody.innerHTML = `<tr><td colspan="5" class="text-center">
      <i class="fas fa-spinner fa-spin"></i></td></tr>`;

    try {
      let attQuery = { select: '*, student:student_id(id, full_name)' };
      if (levelId) attQuery.filter = { level_id: levelId };

      const { data: allAtt } = await DB.getAll('attendance', attQuery);
      const filtered = (allAtt || []).filter(a => a.date >= start && a.date <= end);

      const byStudent = {};
      filtered.forEach(a => {
        if (!byStudent[a.student_id]) {
          byStudent[a.student_id] = { name: a.student?.full_name, present: 0, late: 0, absent: 0 };
        }
        byStudent[a.student_id][a.status]++;
      });

      const rows = Object.entries(byStudent);
      if (!rows.length) {
        tbody.innerHTML = `<tr><td colspan="5"><div class="empty-state">
          <i class="fas fa-clipboard"></i>
          <h3>No records found</h3>
          <p>No attendance data for this period.</p>
        </div></td></tr>`;
        ['att-total','att-present','att-late','att-absent'].forEach(id => {
          const el = document.getElementById(id); if (el) el.textContent = 0;
        });
        return;
      }

      const totalPresent = rows.reduce((s, [,v]) => s + v.present, 0);
      const totalLate    = rows.reduce((s, [,v]) => s + v.late,    0);
      const totalAbsent  = rows.reduce((s, [,v]) => s + v.absent,  0);
      document.getElementById('att-total').textContent   = rows.length;
      document.getElementById('att-present').textContent = totalPresent;
      document.getElementById('att-late').textContent    = totalLate;
      document.getElementById('att-absent').textContent  = totalAbsent;

      const _periodTerm = (document.getElementById('period-search')?.value || '').toLowerCase().trim();
      tbody.innerHTML = rows.map(([, v]) => {
        const total = v.present + v.late + v.absent;
        const pct   = total > 0 ? Math.round(((v.present + v.late) / total) * 100) : 0;
        const name  = v.name || 'Unknown';
        return `
          <tr data-student-name="${name.toLowerCase()}" style="${_periodTerm && !name.toLowerCase().includes(_periodTerm) ? 'display:none' : ''}">
            <td><strong>${Utils.esc(name)}</strong></td>
            <td><span style="color:var(--brand-primary);font-weight:600">${v.present}</span></td>
            <td><span style="color:var(--brand-warning);font-weight:600">${v.late}</span></td>
            <td><span style="color:var(--brand-danger);font-weight:600">${v.absent}</span></td>
            <td>
              <div style="display:flex;align-items:center;gap:8px">
                <div class="progress-bar-wrap" style="width:80px">
                  <div class="progress-bar-fill ${pct<60?'danger':pct<80?'warning':''}"
                    style="width:${pct}%"></div>
                </div>
                <span style="font-size:var(--font-size-xs);font-weight:600">${pct}%</span>
              </div>
            </td>
          </tr>`;
      }).join('');
    } catch (err) {
      console.error(err);
      Toast.error('Failed to load period attendance');
    }
  },

  // ─────────────────────────────────────────────────────────────────────────
  // EXPORT CSV
  // ─────────────────────────────────────────────────────────────────────────
  exportCSV() {
    const rows = Object.entries(this.records)
      .filter(([, rec]) => rec.status)
      .map(([id, rec]) => {
        const student = this.students.find(s => s.id === id);
        return {
          student:  student?.full_name || id,
          date:     this.date,
          status:   rec.status,
          checkin:  rec.checkin_time || '',
          notes:    rec.notes || '',
          saved:    rec._saved ? 'yes' : 'pending',
        };
      });
    if (!rows.length) return Toast.warning('No attendance to export');
    Utils.downloadCSV(rows, `attendance-${this.date}.csv`);
  },
};
