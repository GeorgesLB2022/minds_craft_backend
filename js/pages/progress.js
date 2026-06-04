/* ============================================================
   MINDS' CRAFT — STUDENT PROGRESS / ASSESSMENT PAGE
   Session-based assessments: each Save creates a new snapshot.

   TWO ASSESSMENT TEMPLATES depending on the selected course:

   1) ROBOTICS & STEM (default)
      5 domains x 4 levels (Emerging / Developing / Proficient / Advanced)
      + per-domain Instructor Comment
      skill_key = domain key  |  score = level order (1-4)
      notes = { level, comment, course_id, course_name, level_id, level_name }

   2) SPEEDMATH
      Single numeric score 0-120 per class level + global Instructor Comment
      skill_key = 'speedmath_score'  |  score = raw numeric (0-120)
      notes = { speedmath_score, comment, course_id, course_name, level_id, level_name }
   ============================================================ */

const ProgressPage = {

  // ── State ──────────────────────────────────────────────────
  _allCourses:   [],
  _allLevels:    [],
  _allStudents:  [],
  _listStudents: [],

  selectedStudent:  null,
  currentSession:   {},   // domain_key → { level, comment, domain_label }
  _allSessions:     [],   // raw rows from DB
  _sessions:        [],   // grouped sessions newest-first
  _viewingSession:  null,
  _pendingChanges:  false,

  // Session context (Class + Level attached to each assessment save)
  _sessionCourseId:   null,
  _sessionCourseName: null,
  _sessionLevelId:    null,
  _sessionLevelName:  null,

  // Active enrollments for the currently selected student
  // [ { level_id, level_name, course_id, course_name } ]
  _studentEnrollments: [],

  // ── Course type detection ─────────────────────────────────
  // Returns 'speedmath' for any course whose name contains "speed" AND "math"
  // (handles "SpeedMath", "Speed Math", "speedmath", etc., case-insensitive).
  // Returns 'robotics' for everything else (default).
  _isSpeedMathName(name) {
    if (!name) return false;
    const n = name.toLowerCase().replace(/\s+/g, '');
    return n.includes('speedmath');
  },

  _courseType() {
    return this._isSpeedMathName(this._sessionCourseName) ? 'speedmath' : 'robotics';
  },

  // Detect the type of the session currently being viewed (uses its saved course_name)
  _sessionTypeForViewing() {
    const sess = this._sessions.find(s => s.session_id === this._viewingSession);
    if (!sess) return this._courseType();
    return this._isSpeedMathName(sess.course_name) ? 'speedmath' : 'robotics';
  },

  // ── Assessment Domains (Robotics & STEM only) ─────────────
  DOMAINS: [
    { key: 'technical',      label: 'Technical Skills',                    icon: 'fa-microchip'    },
    { key: 'logical',        label: 'Logical & Computational Thinking',    icon: 'fa-brain'        },
    { key: 'creativity',     label: 'Creativity & Design',                 icon: 'fa-paint-brush'  },
    { key: 'communication',  label: 'Understanding & Communication',       icon: 'fa-comments'     },
    { key: 'collaboration',  label: 'Collaboration & Independence',        icon: 'fa-users'        },
  ],

  LEVELS: [
    { key: 'emerging',    label: 'Emerging',    color: '#ef4444', bg: 'rgba(239,68,68,.12)',   order: 1 },
    { key: 'developing',  label: 'Developing',  color: '#f97316', bg: 'rgba(249,115,22,.12)',  order: 2 },
    { key: 'proficient',  label: 'Proficient',  color: '#3b82f6', bg: 'rgba(59,130,246,.12)',  order: 3 },
    { key: 'advanced',    label: 'Advanced',    color: '#22c55e', bg: 'rgba(34,197,94,.12)',   order: 4 },
  ],

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────
  async render() {
    const container = document.getElementById('page-container');
    container.innerHTML = `
      <div class="page-header">
        <div class="page-header-left">
          <h2>Student Progress</h2>
          <p>Filter by course &amp; level, pick a student, assess skills and save sessions.</p>
        </div>
        <div class="page-header-actions">
          <button class="btn btn-secondary" id="new-session-btn"
            onclick="ProgressPage.startNewSession()" style="display:none">
            <i class="fas fa-plus"></i> New Assessment
          </button>
          <button class="btn btn-primary" id="save-assessment-btn"
            onclick="ProgressPage.saveSession()" disabled>
            <i class="fas fa-save"></i> Save Assessment
          </button>
        </div>
      </div>

      <div class="progress-layout">

        <!-- ── LEFT PANEL ── -->
        <div>
          <div class="card" style="margin-bottom:.75rem;padding:14px">

            <div class="form-group" style="margin-bottom:.6rem">
              <label class="form-label" style="font-size:11px">Course</label>
              <select id="prog-course" class="form-select form-select-sm"
                onchange="ProgressPage.onCourseChange()">
                <option value="">— All Courses —</option>
              </select>
            </div>

            <div class="form-group" style="margin-bottom:.6rem">
              <label class="form-label" style="font-size:11px">Level</label>
              <select id="prog-level" class="form-select form-select-sm"
                onchange="ProgressPage.onLevelChange()">
                <option value="">— All Levels —</option>
              </select>
            </div>

            <div class="search-input-wrap">
              <i class="fas fa-search"></i>
              <input type="text" id="progress-search" placeholder="Search student…"
                oninput="ProgressPage.filterStudentList(this.value)" />
            </div>
          </div>

          <div class="card" style="padding:8px">
            <div class="student-picker" id="student-picker">
              <div class="empty-state" style="padding:2rem 0">
                <i class="fas fa-spinner fa-spin"></i>
              </div>
            </div>
          </div>
        </div>

        <!-- ── RIGHT PANEL ── -->
        <div id="assessment-panel">
          <div class="card">
            <div class="empty-state" style="padding:4rem 1rem">
              <i class="fas fa-user-graduate" style="font-size:3rem;color:var(--text-muted)"></i>
              <h3>No Student Selected</h3>
              <p>Use the filters on the left and pick a student to begin.</p>
            </div>
          </div>
        </div>
      </div>
    `;

    await this._loadAll();
  },

  // ─────────────────────────────────────────────────────────────────────────
  // INITIAL DATA LOAD
  // ─────────────────────────────────────────────────────────────────────────
  async _loadAll() {
    const [{ data: courses }, { data: levels }, { data: students }] = await Promise.all([
      DB.getCourses(),
      DB.getAll('levels', { select: 'id,name,course_id,day_of_week,start_time,status', order: 'order_num' }),
      DB.getStudents(),
    ]);

    this._allCourses  = courses  || [];
    this._allLevels   = levels   || [];
    this._allStudents = (students || []).filter(s => s.status !== 'inactive');

    const courseSelect = document.getElementById('prog-course');
    if (courseSelect) {
      courseSelect.innerHTML = '<option value="">— All Courses —</option>';
      const seen = new Set();
      this._allCourses.forEach(c => {
        if (seen.has(c.id)) return;
        seen.add(c.id);
        const opt = document.createElement('option');
        opt.value       = c.id;
        opt.textContent = c.name;
        courseSelect.appendChild(opt);
      });
    }

    this._listStudents = [...this._allStudents];
    this.renderStudentPicker(this._listStudents);
  },

  // ─────────────────────────────────────────────────────────────────────────
  // FILTERS
  // ─────────────────────────────────────────────────────────────────────────
  onCourseChange() {
    const courseId    = document.getElementById('prog-course')?.value;
    const levelSelect = document.getElementById('prog-level');
    if (!levelSelect) return;

    levelSelect.innerHTML = '<option value="">— All Levels —</option>';
    if (courseId) {
      this._allLevels.filter(l => l.course_id === courseId).forEach(l => {
        const opt  = document.createElement('option');
        opt.value  = l.id;
        const sched = [l.day_of_week, l.start_time].filter(Boolean).join(' ');
        opt.textContent = sched ? `${l.name} (${sched})` : l.name;
        levelSelect.appendChild(opt);
      });
    }
    this.onLevelChange();
  },

  async onLevelChange() {
    const levelId  = document.getElementById('prog-level')?.value;
    const courseId = document.getElementById('prog-course')?.value;

    const picker = document.getElementById('student-picker');
    if (picker) picker.innerHTML = '<div class="empty-state" style="padding:1.5rem 0"><i class="fas fa-spinner fa-spin"></i></div>';

    if (levelId) {
      const { data: enrollments } = await DB.getAll('enrollments', {
        select: '*, student:student_id(id,full_name,birthday,avatar_color,parent:parent_id(full_name))',
        filter: { level_id: levelId, status: 'active' },
      });
      this._listStudents = (enrollments || []).map(e => e.student).filter(Boolean);

    } else if (courseId) {
      const levelIds = this._allLevels.filter(l => l.course_id === courseId).map(l => l.id);
      if (levelIds.length) {
        const { data: enrollments } = await DB.getAll('enrollments', {
          select: '*, student:student_id(id,full_name,birthday,avatar_color,parent:parent_id(full_name))',
          filter: { status: 'active' },
          in:     { level_id: levelIds },
        });
        const seen = new Set();
        this._listStudents = (enrollments || [])
          .map(e => e.student)
          .filter(s => s && !seen.has(s.id) && seen.add(s.id));
      } else {
        this._listStudents = [];
      }
    } else {
      this._listStudents = [...this._allStudents];
    }

    const q = document.getElementById('progress-search')?.value || '';
    this.filterStudentList(q);
  },

  filterStudentList(q) {
    const term     = (q || '').toLowerCase().trim();
    const filtered = term
      ? this._listStudents.filter(s => (s.full_name || '').toLowerCase().includes(term))
      : this._listStudents;
    this.renderStudentPicker(filtered);
  },

  // ─────────────────────────────────────────────────────────────────────────
  // STUDENT PICKER
  // ─────────────────────────────────────────────────────────────────────────
  renderStudentPicker(students) {
    const el = document.getElementById('student-picker');
    if (!el) return;
    if (!students.length) {
      el.innerHTML = `<div class="empty-state" style="padding:1.5rem 0">
        <i class="fas fa-users"></i><p style="margin-top:.5rem">No students found</p></div>`;
      return;
    }
    el.innerHTML = students.map(s => `
      <div class="student-pick-item ${this.selectedStudent?.id === s.id ? 'active' : ''}"
        onclick="ProgressPage.selectStudent('${s.id}')">
        <div class="users-table-avatar"
          style="background:${Utils.avatarColor(s.full_name)};width:34px;height:34px;flex-shrink:0">
          ${Utils.initials(s.full_name)}
        </div>
        <div style="flex:1;min-width:0">
          <div style="font-size:var(--font-size-sm);font-weight:600;
                      white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
            ${Utils.esc(s.full_name)}
          </div>
          ${s.parent?.full_name
            ? `<div style="font-size:10px;color:var(--text-muted)">👤 ${Utils.esc(s.parent.full_name)}</div>`
            : ''}
        </div>
        ${this.selectedStudent?.id === s.id
          ? '<i class="fas fa-chevron-right" style="color:var(--brand-primary);font-size:10px"></i>'
          : ''}
      </div>`).join('');
  },

  // ─────────────────────────────────────────────────────────────────────────
  // SELECT STUDENT
  // ─────────────────────────────────────────────────────────────────────────
  async selectStudent(id) {
    this.selectedStudent = this._allStudents.find(s => s.id === id)
                        || this._listStudents.find(s => s.id === id);
    if (!this.selectedStudent) return;

    this._pendingChanges       = false;
    this._viewingSession       = null;
    this.currentSession        = {};
    this._sessionCourseId      = null;
    this._sessionCourseName    = null;
    this._sessionLevelId       = null;
    this._sessionLevelName     = null;
    this._studentEnrollments   = [];

    this.renderStudentPicker(this._listStudents);

    const panel = document.getElementById('assessment-panel');
    if (panel) panel.innerHTML = `
      <div class="card"><div class="empty-state" style="padding:3rem">
        <i class="fas fa-spinner fa-spin"></i><p style="margin-top:.5rem">Loading…</p>
      </div></div>`;

    // Load sessions + active enrollments in parallel
    const [,{ data: enrollments }] = await Promise.all([
      this._loadSessions(id),
      DB.getStudentEnrollments(id),
    ]);

    // Keep only active enrollments with full level+course info
    this._studentEnrollments = (enrollments || [])
      .filter(e => e.status === 'active' && e.level?.id)
      .map(e => ({
        level_id:    e.level.id,
        level_name:  e.level.name,
        course_id:   e.level.course?.id   || null,
        course_name: e.level.course?.name || null,
      }));

    this.renderAssessmentPanel();

    const newBtn  = document.getElementById('new-session-btn');
    const saveBtn = document.getElementById('save-assessment-btn');
    if (newBtn)  newBtn.style.display  = '';
    if (saveBtn) { saveBtn.disabled = false; saveBtn.innerHTML = '<i class="fas fa-save"></i> Save Assessment'; }
  },

  // ─────────────────────────────────────────────────────────────────────────
  // LOAD SESSIONS
  // ─────────────────────────────────────────────────────────────────────────
  async _loadSessions(studentId) {
    const { data: rows } = await DB.getAssessments(studentId);
    this._allSessions = rows || [];
    this._buildSessionGroups();
  },

  // ─────────────────────────────────────────────────────────────────────────
  // BUILD SESSION GROUPS FROM DB ROWS  (NEW FLAT-ROW MODEL)
  //
  // Each DB row IS one domain entry for one session:
  //   student_id, skill_key, skill_label, category, score,
  //   assessed_at  ← groups rows into sessions (minute-precision)
  //   notes        ← flat JSON object { level, comment, course_id, course_name,
  //                                     level_id, level_name }
  //
  // Legacy rows (old model with JSON-array notes) are detected by checking
  // whether notes parses as an Array — if so, each array entry is expanded.
  // ─────────────────────────────────────────────────────────────────────────
  _buildSessionGroups() {
    const sessionMap = {};

    this._allSessions.forEach(row => {
      // ── Parse notes field ──────────────────────────────────────────────
      let notesObj = null;   // flat object  (new model)
      let legacy   = false;  // true when notes is an old JSON array

      if (row.notes) {
        try {
          const parsed = JSON.parse(row.notes);
          if (Array.isArray(parsed)) {
            // ── LEGACY MODEL: notes is an array of history entries ──────
            legacy = true;
            parsed.forEach(entry => {
              const sid = entry.assessed_at
                ? entry.assessed_at.slice(0, 19)
                : (row.assessed_at ? row.assessed_at.slice(0, 19) : 'unknown');

              if (!sessionMap[sid]) {
                sessionMap[sid] = {
                  session_id:  sid,
                  assessed_at: entry.assessed_at || row.assessed_at,
                  course_id:   entry.course_id   || null,
                  course_name: entry.course_name || null,
                  level_id:    entry.level_id    || null,
                  level_name:  entry.level_name  || null,
                  domains:     [],
                };
              }
              // carry meta from first domain that has it
              ['course_id','course_name','level_id','level_name'].forEach(k => {
                if (!sessionMap[sid][k] && entry[k]) sessionMap[sid][k] = entry[k];
              });
              sessionMap[sid].domains.push({
                domain_key:   row.skill_key,
                domain_label: row.skill_label || row.skill_key,
                level:        entry.level || (row.score ? this._scoreToLevel(row.score) : null),
                comment:      entry.comment || null,
                assessed_at:  entry.assessed_at || row.assessed_at,
              });
            });
          } else if (parsed && typeof parsed === 'object') {
            // ── NEW MODEL: notes is a flat object ───────────────────────
            notesObj = parsed;
          }
        } catch { /* ignore parse errors */ }
      }

      if (legacy) return; // already handled above

      // ── NEW MODEL path: each row is one domain entry ────────────────────
      // Use second-precision (19 chars) so two sessions saved in the same
      // minute are not accidentally merged into one group.
      const sid = row.assessed_at ? row.assessed_at.slice(0, 19) : 'unknown';

      if (!sessionMap[sid]) {
        sessionMap[sid] = {
          session_id:  sid,
          assessed_at: row.assessed_at,
          course_id:   notesObj?.course_id   || null,
          course_name: notesObj?.course_name || null,
          level_id:    notesObj?.level_id    || null,
          level_name:  notesObj?.level_name  || null,
          domains:     [],
        };
      }

      // Carry meta from first domain that has it
      ['course_id','course_name','level_id','level_name'].forEach(k => {
        if (!sessionMap[sid][k] && notesObj?.[k]) sessionMap[sid][k] = notesObj[k];
      });

      // SpeedMath rows: store numeric score; Robotics rows: store level key
      sessionMap[sid].domains.push({
        domain_key:      row.skill_key,
        domain_label:    row.skill_label || row.skill_key,
        level:           (row.category === 'speedmath')
                           ? null
                           : (notesObj?.level || (row.score ? this._scoreToLevel(row.score) : null)),
        comment:         notesObj?.comment || null,
        assessed_at:     row.assessed_at,
        speedmath_score: (row.category === 'speedmath')
                           ? (notesObj?.speedmath_score ?? row.score)
                           : undefined,
      });
    });

    this._sessions = Object.values(sessionMap).sort((a, b) =>
      (b.assessed_at || '').localeCompare(a.assessed_at || ''));

    // Compute average level order for each session (used for the badge colour)
    this._sessions.forEach(sess => {
      const levelOrders = sess.domains
        .map(d => this.LEVELS.find(l => l.key === d.level)?.order || 0)
        .filter(o => o > 0);
      sess.topLevelOrder = levelOrders.length
        ? Math.round(levelOrders.reduce((a, b) => a + b, 0) / levelOrders.length)
        : 0;
    });
  },

  // Convert legacy 1-5 star score to level key
  _scoreToLevel(score) {
    if (score >= 4.5) return 'advanced';
    if (score >= 3)   return 'proficient';
    if (score >= 2)   return 'developing';
    return 'emerging';
  },

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER ASSESSMENT PANEL
  // ─────────────────────────────────────────────────────────────────────────
  renderAssessmentPanel() {
    const panel = document.getElementById('assessment-panel');
    if (!panel || !this.selectedStudent) return;
    const s = this.selectedStudent;

    panel.innerHTML = `
      <!-- Student header -->
      <div class="card" style="margin-bottom:1rem" id="prog-header-card">
        ${this._headerHTML(s)}
      </div>

      <!-- Tab bar -->
      <div style="display:flex;gap:0;margin-bottom:1rem;
                  border-bottom:2px solid var(--border-light)">
        <button id="tab-btn-assess"
          onclick="ProgressPage.switchTab('assess')"
          style="padding:9px 20px;font-size:13px;font-weight:700;border:none;
                 background:none;cursor:pointer;border-bottom:3px solid var(--brand-primary);
                 color:var(--brand-primary);margin-bottom:-2px;transition:all .15s">
          <i class="fas fa-edit" style="margin-right:6px"></i>New Assessment
        </button>
        <button id="tab-btn-history"
          onclick="ProgressPage.switchTab('history')"
          style="padding:9px 20px;font-size:13px;font-weight:600;border:none;
                 background:none;cursor:pointer;border-bottom:3px solid transparent;
                 color:var(--text-muted);margin-bottom:-2px;transition:all .15s">
          <i class="fas fa-history" style="margin-right:6px"></i>
          History
          <span style="background:var(--bg-tertiary);color:var(--text-secondary);
                       font-size:10px;font-weight:700;border-radius:10px;
                       padding:1px 7px;margin-left:4px">
            ${this._sessions.length}
          </span>
        </button>
      </div>

      <!-- ── TAB: New Assessment ── -->
      <div id="tab-panel-assess">
        <div class="card" style="margin-bottom:1rem">
          <div class="card-header">
            <div>
              <div class="card-title" id="prog-form-title">New Assessment</div>
              <div style="font-size:11px;color:var(--text-muted)" id="prog-form-sub">
                Select a proficiency level for each domain and add an instructor comment
              </div>
            </div>
            <div id="prog-session-mode-badge"></div>
          </div>

          <!-- Session context: Class + Level selectors -->
          <div id="session-context-fields"
            style="display:grid;grid-template-columns:1fr 1fr;gap:10px;
                   padding:12px 0 4px;border-bottom:1px solid var(--border-light);
                   margin-bottom:8px">
            <div class="form-group" style="margin:0">
              <label class="form-label" style="font-size:11px">
                <i class="fas fa-book" style="margin-right:4px;color:var(--brand-primary)"></i>
                Class <span style="color:var(--brand-danger)">*</span>
              </label>
              <select id="session-course-select" class="form-select form-select-sm"
                onchange="ProgressPage.onSessionCourseChange()">
                <option value="">— Select Class —</option>
                ${this._allCourses.map(c =>
                  `<option value="${c.id}" ${this._sessionCourseId === c.id ? 'selected' : ''}>${Utils.esc(c.name)}</option>`
                ).join('')}
              </select>
            </div>
            <div class="form-group" style="margin:0">
              <label class="form-label" style="font-size:11px">
                <i class="fas fa-layer-group" style="margin-right:4px;color:var(--brand-primary)"></i>
                Level <span style="color:var(--brand-danger)">*</span>
              </label>
              <select id="session-level-select" class="form-select form-select-sm"
                onchange="ProgressPage.onSessionLevelChange()">
                <option value="">— Select Level —</option>
                ${this._sessionCourseId
                  ? this._allLevels.filter(l => l.course_id === this._sessionCourseId).map(l =>
                      `<option value="${l.id}" ${this._sessionLevelId === l.id ? 'selected' : ''}>${Utils.esc(l.name)}</option>`
                    ).join('')
                  : ''}
              </select>
            </div>
          </div>

          <!-- Domain assessment table -->
          <div id="skills-form" style="margin-top:.5rem">
            ${this._assessmentTableHTML()}
          </div>

          <div style="margin-top:1rem;display:flex;align-items:center;
                      justify-content:space-between;flex-wrap:wrap;gap:8px;
                      border-top:1px solid var(--border-light);padding-top:1rem">
            <div id="prog-save-hint" style="font-size:var(--font-size-xs);color:var(--text-muted)">
              Each save creates a new independent session snapshot.
            </div>
            <button class="btn btn-primary" onclick="ProgressPage.saveSession()">
              <i class="fas fa-save"></i> Save Assessment
            </button>
          </div>
        </div>
      </div>

      <!-- ── TAB: History (all courses) ── -->
      <div id="tab-panel-history" style="display:none">
        <div class="card" id="prog-history-card">
          <div class="card-header" style="padding-bottom:10px">
            <div>
              <div class="card-title">Assessment History</div>
              <div style="font-size:11px;color:var(--text-muted)">
                All sessions across all courses — newest first
              </div>
            </div>
            <span id="prog-history-meta"
              style="font-size:var(--font-size-xs);color:var(--text-muted)">
              ${this._sessions.length} session${this._sessions.length !== 1 ? 's' : ''}
            </span>
          </div>
          <div id="prog-history-body">
            ${this._sessionsListHTML()}
          </div>
        </div>
      </div>
    `;
  },

  // ─────────────────────────────────────────────────────────────────────────
  // TAB SWITCH
  // ─────────────────────────────────────────────────────────────────────────
  switchTab(tab) {
    const assessPanel  = document.getElementById('tab-panel-assess');
    const histPanel    = document.getElementById('tab-panel-history');
    const assessBtn    = document.getElementById('tab-btn-assess');
    const histBtn      = document.getElementById('tab-btn-history');
    if (!assessPanel || !histPanel) return;

    if (tab === 'history') {
      assessPanel.style.display = 'none';
      histPanel.style.display   = '';
      assessBtn.style.borderBottom = '3px solid transparent';
      assessBtn.style.color        = 'var(--text-muted)';
      assessBtn.style.fontWeight   = '600';
      histBtn.style.borderBottom   = '3px solid var(--brand-primary)';
      histBtn.style.color          = 'var(--brand-primary)';
      histBtn.style.fontWeight     = '700';
    } else {
      histPanel.style.display   = 'none';
      assessPanel.style.display = '';
      histBtn.style.borderBottom   = '3px solid transparent';
      histBtn.style.color          = 'var(--text-muted)';
      histBtn.style.fontWeight     = '600';
      assessBtn.style.borderBottom = '3px solid var(--brand-primary)';
      assessBtn.style.color        = 'var(--brand-primary)';
      assessBtn.style.fontWeight   = '700';
    }
  },

  // ─────────────────────────────────────────────────────────────────────────
  // ASSESSMENT TABLE HTML — routes to the correct template
  // ─────────────────────────────────────────────────────────────────────────
  _assessmentTableHTML() {
    const type = this._viewingSession
      ? this._sessionTypeForViewing()
      : this._courseType();
    return type === 'speedmath'
      ? this._speedmathFormHTML()
      : this._roboticsTableHTML();
  },

  // ── ROBOTICS & STEM template (5 domains x 4 levels radio table) ──────────
  _roboticsTableHTML() {
    const isReadOnly = !!this._viewingSession;
    return `
      <div style="overflow-x:auto;-webkit-overflow-scrolling:touch">
        <table style="width:100%;border-collapse:collapse;min-width:640px">
          <thead>
            <tr style="background:var(--bg-tertiary)">
              <th style="text-align:left;padding:10px 14px;font-size:11px;font-weight:700;
                         color:var(--text-muted);text-transform:uppercase;letter-spacing:.05em;
                         border-bottom:2px solid var(--border-light);width:200px">
                Assessment Domain
              </th>
              ${this.LEVELS.map(lv => `
                <th style="text-align:center;padding:10px 8px;font-size:11px;font-weight:700;
                           text-transform:uppercase;letter-spacing:.04em;
                           color:${lv.color};border-bottom:2px solid ${lv.color}30;
                           width:90px">
                  ${lv.label}
                </th>`).join('')}
              <th style="text-align:left;padding:10px 14px;font-size:11px;font-weight:700;
                         color:var(--text-muted);text-transform:uppercase;letter-spacing:.05em;
                         border-bottom:2px solid var(--border-light)">
                Instructor Comment
              </th>
            </tr>
          </thead>
          <tbody>
            ${this.DOMAINS.map((domain, idx) => this._domainRowHTML(domain, idx, isReadOnly)).join('')}
          </tbody>
        </table>
      </div>`;
  },

  // ── SPEEDMATH template — numeric score /120 + global comment ─────────────
  _speedmathFormHTML() {
    const isReadOnly = !!this._viewingSession;
    const state      = this.currentSession['speedmath_score'] || {};
    const score      = (state.score !== undefined && state.score !== '') ? state.score : '';
    const comment    = state.comment || '';
    const scoreNum   = parseInt(score);

    let scoreColor = 'var(--text-muted)';
    let gradeBand  = '';
    if (!isNaN(scoreNum)) {
      if      (scoreNum >= 100) { scoreColor = '#22c55e'; gradeBand = 'Excellent'; }
      else if (scoreNum >= 80)  { scoreColor = '#3b82f6'; gradeBand = 'Good'; }
      else if (scoreNum >= 60)  { scoreColor = '#f59e0b'; gradeBand = 'Average'; }
      else if (scoreNum >= 40)  { scoreColor = '#f97316'; gradeBand = 'Needs Practice'; }
      else                      { scoreColor = '#ef4444'; gradeBand = 'Beginner'; }
    }

    const pct    = !isNaN(scoreNum) ? Math.min(scoreNum, 120) / 120 : 0;
    const offset = Math.round(188.5 * (1 - pct));

    const BANDS = [
      { label: 'Beginner',       range: '0-39',    color: '#ef4444' },
      { label: 'Needs Practice', range: '40-59',   color: '#f97316' },
      { label: 'Average',        range: '60-79',   color: '#f59e0b' },
      { label: 'Good',           range: '80-99',   color: '#3b82f6' },
      { label: 'Excellent',      range: '100-120', color: '#22c55e' },
    ];

    return `
      <div style="max-width:520px;margin:0 auto;padding:8px 0">

        <!-- Header row -->
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:20px">
          <div style="width:44px;height:44px;border-radius:50%;
                      background:rgba(245,158,11,.15);flex-shrink:0;
                      display:flex;align-items:center;justify-content:center">
            <i class="fas fa-stopwatch" style="font-size:20px;color:#f59e0b"></i>
          </div>
          <div>
            <div style="font-size:14px;font-weight:700;color:var(--text-primary)">SpeedMath Score</div>
            <div style="font-size:11px;color:var(--text-muted)">
              Enter the final score for this class level (0 to 120)
            </div>
          </div>
        </div>

        <!-- Score input + arc -->
        <div id="speedmath-score-box"
          style="display:flex;align-items:center;gap:16px;margin-bottom:20px;
                 background:var(--bg-secondary);border-radius:var(--radius-lg);
                 padding:18px 20px;border:2px solid ${!isNaN(scoreNum) ? scoreColor : 'var(--border-light)'}">

          <div style="flex:1">
            <label style="font-size:11px;font-weight:700;color:var(--text-muted);
                          text-transform:uppercase;letter-spacing:.05em;
                          display:block;margin-bottom:6px">Final Score</label>
            <div style="display:flex;align-items:baseline;gap:6px">
              <input
                type="number" id="speedmath-score-input"
                min="0" max="120"
                value="${Utils.esc(String(score))}"
                placeholder="0"
                ${isReadOnly ? 'readonly' : ''}
                style="width:90px;font-size:2rem;font-weight:900;
                       color:${scoreColor};background:transparent;border:none;
                       border-bottom:2px solid ${scoreColor};outline:none;padding:0 4px;
                       ${isReadOnly ? 'pointer-events:none' : ''}"
                oninput="ProgressPage.setSpeedmathScore(this.value)"
              />
              <span style="font-size:1.1rem;font-weight:700;color:var(--text-muted)">/120</span>
            </div>
          </div>

          <!-- Circular progress arc -->
          <div style="flex-shrink:0;text-align:center">
            <div style="position:relative;width:72px;height:72px">
              <svg viewBox="0 0 72 72" style="width:72px;height:72px;transform:rotate(-90deg)">
                <circle cx="36" cy="36" r="30" fill="none"
                  stroke="var(--bg-tertiary)" stroke-width="7"/>
                <circle id="speedmath-arc" cx="36" cy="36" r="30" fill="none"
                  stroke="${scoreColor}" stroke-width="7"
                  stroke-linecap="round"
                  stroke-dasharray="188.5"
                  stroke-dashoffset="${offset}"
                  style="transition:stroke-dashoffset .3s ease,stroke .3s"/>
              </svg>
              <div style="position:absolute;inset:0;display:flex;flex-direction:column;
                          align-items:center;justify-content:center">
                <span id="speedmath-pct"
                  style="font-size:13px;font-weight:900;color:${scoreColor}">
                  ${!isNaN(scoreNum) ? Math.round(pct * 100) + '%' : '---'}
                </span>
              </div>
            </div>
            ${gradeBand ? `
              <div style="font-size:10px;font-weight:700;color:${scoreColor};
                           text-transform:uppercase;letter-spacing:.04em;margin-top:4px">
                ${gradeBand}
              </div>` : ''}
          </div>
        </div>

        <!-- Grade band reference -->
        <div style="display:flex;gap:4px;margin-bottom:18px;flex-wrap:wrap">
          ${BANDS.map(b => `
            <div style="flex:1;min-width:80px;background:${b.color}18;
                        border:1px solid ${b.color}40;border-radius:var(--radius-sm);
                        padding:4px 6px;text-align:center">
              <div style="font-size:9px;font-weight:700;color:${b.color};
                           text-transform:uppercase">${b.label}</div>
              <div style="font-size:10px;color:var(--text-muted)">${b.range}</div>
            </div>`).join('')}
        </div>

        <!-- Global comment -->
        <div>
          <label style="font-size:11px;font-weight:700;color:var(--text-muted);
                        text-transform:uppercase;letter-spacing:.05em;
                        display:block;margin-bottom:6px">
            <i class="fas fa-comment-alt" style="margin-right:4px"></i>
            Instructor Comment
          </label>
          <textarea
            id="speedmath-comment-input"
            class="form-textarea"
            rows="3"
            placeholder="Add a comment for this SpeedMath session..."
            style="font-size:13px;resize:vertical;min-height:72px;width:100%;
                   ${isReadOnly ? 'background:var(--bg-tertiary);color:var(--text-secondary)' : ''}"
            ${isReadOnly ? 'readonly' : ''}
            oninput="ProgressPage.setSpeedmathComment(this.value)"
          >${Utils.esc(comment)}</textarea>
        </div>
      </div>`;
  },

  _domainRowHTML(domain, idx, isReadOnly) {
    const current = this.currentSession[domain.key] || {};
    const selectedLevel = current.level || null;
    const comment       = current.comment || '';
    const rowBg = idx % 2 === 0 ? 'transparent' : 'var(--bg-secondary)';

    return `
      <tr style="background:${rowBg};border-bottom:1px solid var(--border-light)"
          id="domain-row-${domain.key}">

        <!-- Domain name -->
        <td style="padding:12px 14px;vertical-align:top">
          <div style="display:flex;align-items:center;gap:8px">
            <i class="fas ${domain.icon}"
               style="color:var(--text-muted);font-size:13px;flex-shrink:0"></i>
            <span style="font-size:13px;font-weight:600;color:var(--text-primary)">
              ${Utils.esc(domain.label)}
            </span>
          </div>
        </td>

        <!-- Level radio buttons -->
        ${this.LEVELS.map(lv => {
          const isSelected = selectedLevel === lv.key;
          return `
            <td style="padding:12px 4px;text-align:center;vertical-align:top">
              <label style="display:flex;flex-direction:column;align-items:center;
                            gap:6px;cursor:${isReadOnly ? 'default' : 'pointer'};
                            padding:6px 4px;border-radius:var(--radius-md);
                            transition:background .15s;
                            background:${isSelected ? lv.bg : 'transparent'}"
                     id="lv-label-${domain.key}-${lv.key}"
                     ${!isReadOnly ? `onmouseover="this.style.background='${lv.bg}'" onmouseout="this.style.background='${isSelected ? lv.bg : 'transparent'}'"` : ''}>
                <input type="radio"
                  name="level_${domain.key}"
                  value="${lv.key}"
                  ${isSelected ? 'checked' : ''}
                  ${isReadOnly ? 'disabled' : ''}
                  style="width:18px;height:18px;accent-color:${lv.color};cursor:${isReadOnly ? 'default' : 'pointer'}"
                  onchange="ProgressPage.setLevel('${domain.key}', '${lv.key}', '${Utils.esc(domain.label)}')" />
                ${isSelected ? `<span style="font-size:9px;font-weight:700;color:${lv.color};
                                             text-transform:uppercase;letter-spacing:.04em">✓</span>` : '<span style="font-size:9px">&nbsp;</span>'}
              </label>
            </td>`;
        }).join('')}

        <!-- Instructor comment -->
        <td style="padding:10px 14px;vertical-align:top">
          <textarea
            id="comment-${domain.key}"
            class="form-textarea"
            rows="2"
            placeholder="Add comment for this domain…"
            style="font-size:12px;resize:${isReadOnly ? 'none' : 'vertical'};min-height:48px;width:100%;${isReadOnly ? 'background:var(--bg-tertiary);color:var(--text-secondary)' : ''}"
            ${isReadOnly ? 'readonly' : ''}
            oninput="ProgressPage.setComment('${domain.key}', this.value)"
          >${Utils.esc(comment)}</textarea>
        </td>
      </tr>`;
  },

  // ─────────────────────────────────────────────────────────────────────────
  // STUDENT HEADER CARD
  // ─────────────────────────────────────────────────────────────────────────
  _headerHTML(s) {
    const type = this._viewingSession
      ? this._sessionTypeForViewing()
      : this._courseType();

    // ── SpeedMath header ───────────────────────────────────────────────────
    if (type === 'speedmath') {
      const state    = this.currentSession['speedmath_score'] || {};
      const scoreNum = parseInt(state.score);
      let scoreColor = 'var(--text-muted)';
      if (!isNaN(scoreNum)) {
        if      (scoreNum >= 100) scoreColor = '#22c55e';
        else if (scoreNum >= 80)  scoreColor = '#3b82f6';
        else if (scoreNum >= 40)  scoreColor = '#f97316';
        else                      scoreColor = '#ef4444';
      }
      return `
        <div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap">
          <div class="users-table-avatar"
            style="background:${Utils.avatarColor(s.full_name)};width:54px;height:54px;
                   font-size:20px;border-radius:50%;flex-shrink:0">
            ${Utils.initials(s.full_name)}
          </div>
          <div style="flex:1;min-width:0">
            <div style="font-size:var(--font-size-xl);font-weight:800">${Utils.esc(s.full_name)}</div>
            ${s.birthday ? `<div style="font-size:var(--font-size-xs);color:var(--text-muted)">DOB: ${Utils.formatDate(s.birthday)}</div>` : ''}
            ${this._sessions.length
              ? `<div style="font-size:11px;color:var(--text-muted);margin-top:2px">
                   ${this._sessions.length} session${this._sessions.length !== 1 ? 's' : ''} recorded
                 </div>`
              : ''}
          </div>
          <div style="text-align:right;flex-shrink:0" id="prog-overall-val">
            ${!isNaN(scoreNum)
              ? `<div style="font-size:2.2rem;font-weight:900;color:${scoreColor};line-height:1">${scoreNum}</div>
                 <div style="font-size:var(--font-size-xs);color:var(--text-muted)">/120 SpeedMath</div>`
              : `<div style="font-size:var(--font-size-xs);color:var(--text-muted);font-style:italic">
                   <i class="fas fa-stopwatch" style="margin-right:4px;color:#f59e0b"></i>SpeedMath
                 </div>`}
          </div>
        </div>
        <div id="prog-domain-pills" style="margin-top:8px"></div>`;
    }

    // ── Robotics & STEM header (default) ──────────────────────────────────
    // Build per-domain level pills from currentSession
    const domainPills = this.DOMAINS.map(d => {
      const lvKey = this.currentSession[d.key]?.level || null;
      const lv    = this.LEVELS.find(l => l.key === lvKey);
      return `
        <div style="display:flex;align-items:center;justify-content:space-between;
                    background:var(--bg-tertiary);border-radius:var(--radius-md);
                    padding:7px 12px;gap:8px">
          <div style="display:flex;align-items:center;gap:6px;min-width:0">
            <i class="fas ${d.icon}" style="font-size:11px;color:var(--text-muted);flex-shrink:0"></i>
            <span style="font-size:11px;color:var(--text-secondary);
                         overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
              ${Utils.esc(d.label)}
            </span>
          </div>
          ${lv
            ? `<span style="font-size:10px;font-weight:700;color:${lv.color};
                            background:${lv.bg};border-radius:10px;padding:2px 8px;
                            flex-shrink:0;text-transform:uppercase;letter-spacing:.04em">
                 ${lv.label}
               </span>`
            : `<span style="font-size:10px;color:var(--text-muted);font-style:italic">—</span>`}
        </div>`;
    }).join('');

    const assessedCount = Object.values(this.currentSession).filter(v => v.level).length;

    return `
      <div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap">
        <div class="users-table-avatar"
          style="background:${Utils.avatarColor(s.full_name)};width:54px;height:54px;
                 font-size:20px;border-radius:50%;flex-shrink:0">
          ${Utils.initials(s.full_name)}
        </div>
        <div style="flex:1;min-width:0">
          <div style="font-size:var(--font-size-xl);font-weight:800">${Utils.esc(s.full_name)}</div>
          ${s.birthday ? `<div style="font-size:var(--font-size-xs);color:var(--text-muted)">DOB: ${Utils.formatDate(s.birthday)}</div>` : ''}
          ${this._sessions.length
            ? `<div style="font-size:11px;color:var(--text-muted);margin-top:2px">
                 ${this._sessions.length} session${this._sessions.length !== 1 ? 's' : ''} recorded
               </div>`
            : ''}
        </div>
        <div style="text-align:right;flex-shrink:0" id="prog-overall-val">
          ${assessedCount > 0
            ? `<div style="font-size:2rem;font-weight:900;color:var(--brand-primary);line-height:1">
                 ${assessedCount}/${this.DOMAINS.length}
               </div>
               <div style="font-size:var(--font-size-xs);color:var(--text-muted)">domains rated</div>`
            : `<div style="font-size:var(--font-size-xs);color:var(--text-muted);font-style:italic">No ratings yet</div>`}
        </div>
      </div>

      <div id="prog-domain-pills"
        style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));
               gap:6px;margin-top:14px">
        ${domainPills}
      </div>`;
  },

  // ─────────────────────────────────────────────────────────────────────────
  // SESSION HISTORY LIST
  // ─────────────────────────────────────────────────────────────────────────
  _sessionsListHTML() {
    if (!this._sessions.length) return `
      <div class="empty-state" style="padding:2rem 0">
        <i class="fas fa-history"></i>
        <p style="margin-top:.5rem">No assessment sessions yet. Assess domains and save.</p>
      </div>`;

    // ── Group sessions by course (key = course_id or '__none__') ───────────
    // Order of groups = first appearance in the sessions array (newest first).
    const groupOrder  = [];
    const groupMap    = {};  // courseKey → { course_name, course_id, type, sessions: [] }

    this._sessions.forEach((sess, idx) => {
      const cKey  = sess.course_id || '__none__';
      const cName = sess.course_name || 'Unknown Course';
      const cType = this._isSpeedMathName(sess.course_name) ? 'speedmath' : 'robotics';
      if (!groupMap[cKey]) {
        groupMap[cKey] = { course_name: cName, course_id: sess.course_id, type: cType, sessions: [] };
        groupOrder.push(cKey);
      }
      groupMap[cKey].sessions.push({ sess, idx });
    });

    // ── Render each course group ───────────────────────────────────────────
    return groupOrder.map(cKey => {
      const group = groupMap[cKey];
      const isSpeedMath = group.type === 'speedmath';

      // Course header bar
      const headerColor  = isSpeedMath ? '#f59e0b' : 'var(--brand-primary)';
      const headerBg     = isSpeedMath ? 'rgba(245,158,11,.08)' : 'rgba(99,102,241,.07)';
      const headerIcon   = isSpeedMath ? 'fa-stopwatch' : 'fa-robot';
      const sessionCount = group.sessions.length;

      const groupHeader = `
        <div style="display:flex;align-items:center;gap:8px;
                    padding:8px 12px;margin:0 0 4px;
                    background:${headerBg};border-radius:var(--radius-md);
                    border-left:3px solid ${headerColor}">
          <i class="fas ${headerIcon}" style="color:${headerColor};font-size:13px;flex-shrink:0"></i>
          <span style="font-size:12px;font-weight:800;color:${headerColor}">
            ${Utils.esc(group.course_name)}
          </span>
          <span style="font-size:10px;color:var(--text-muted);margin-left:2px">
            ${sessionCount} session${sessionCount !== 1 ? 's' : ''}
          </span>
        </div>`;

      // ── Render each session card in this group ──────────────────────────
      const cards = group.sessions.map(({ sess, idx }) => {
        const dateStr   = sess.assessed_at
          ? new Date(sess.assessed_at).toLocaleDateString('en-GB', {
              day:'2-digit', month:'short', year:'numeric',
              hour:'2-digit', minute:'2-digit'
            })
          : '--';
        const timeAgo   = sess.assessed_at ? Utils.timeAgo(sess.assessed_at) : '';
        const sessNum   = this._sessions.length - idx;   // global session number
        const isViewing = this._viewingSession === sess.session_id;
        const isLatestInGroup = idx === group.sessions[0].idx;

        // ── Summary badge + chips ─────────────────────────────────────────
        let rightBadge = '';
        let chips      = '';

        if (isSpeedMath) {
          const smDom    = sess.domains.find(d => d.domain_key === 'speedmath_score');
          const smScore  = smDom !== undefined ? parseInt(smDom.speedmath_score) : NaN;
          let scoreColor = '#6b7280';
          let gradeBand  = '';
          if (!isNaN(smScore)) {
            if      (smScore >= 100) { scoreColor = '#22c55e'; gradeBand = 'Excellent'; }
            else if (smScore >= 80)  { scoreColor = '#3b82f6'; gradeBand = 'Good'; }
            else if (smScore >= 60)  { scoreColor = '#f59e0b'; gradeBand = 'Average'; }
            else if (smScore >= 40)  { scoreColor = '#f97316'; gradeBand = 'Needs Practice'; }
            else                     { scoreColor = '#ef4444'; gradeBand = 'Beginner'; }
          }
          rightBadge = !isNaN(smScore) ? `
            <div style="text-align:center">
              <div style="font-size:18px;font-weight:900;color:${scoreColor};line-height:1">${smScore}</div>
              <div style="font-size:9px;color:var(--text-muted)">/120</div>
              <div style="font-size:9px;font-weight:700;color:${scoreColor};
                          text-transform:uppercase;letter-spacing:.04em;margin-top:2px">
                ${gradeBand}
              </div>
            </div>` : '';
          chips = `<span style="font-size:10px;font-weight:600;border-radius:10px;
                                 padding:2px 8px;color:#f59e0b;background:rgba(245,158,11,.12)">
                     <i class="fas fa-stopwatch" style="margin-right:3px;font-size:9px"></i>SpeedMath
                   </span>`;

        } else {
          const avgLv = this.LEVELS[Math.max(0, (sess.topLevelOrder || 1) - 1)];
          rightBadge  = sess.topLevelOrder > 0 ? `
            <div style="text-align:center">
              <div style="font-size:12px;font-weight:800;color:${avgLv.color};
                          background:${avgLv.bg};border-radius:var(--radius-md);
                          padding:4px 10px;text-transform:uppercase;letter-spacing:.04em">
                ${avgLv.label}
              </div>
              <div style="font-size:10px;color:var(--text-muted);margin-top:2px">avg level</div>
            </div>` : '';
          chips = sess.domains.filter(d => d.level).map(d => {
            const lv     = this.LEVELS.find(l => l.key === d.level);
            if (!lv) return '';
            const domDef = this.DOMAINS.find(x => x.key === d.domain_key);
            return `<span style="font-size:10px;font-weight:600;border-radius:10px;
                                 padding:2px 8px;color:${lv.color};background:${lv.bg}">
                      ${domDef ? `<i class="fas ${domDef.icon}" style="margin-right:3px;font-size:9px"></i>` : ''}
                      ${Utils.esc(d.domain_label || d.domain_key)}
                    </span>`;
          }).join('');
        }

        const badgeBg    = isLatestInGroup
          ? (isSpeedMath ? '#f59e0b' : 'var(--brand-primary)')
          : 'var(--bg-tertiary)';
        const badgeColor = isLatestInGroup ? '#fff' : 'var(--text-secondary)';
        const badgeInner = isSpeedMath
          ? `<i class="fas fa-stopwatch" style="font-size:11px"></i>`
          : String(sessNum);

        return `
          <div class="prog-session-card ${isViewing ? 'active' : ''}"
            id="sess-${idx}"
            data-session-idx="${idx}"
            onclick="ProgressPage.loadSessionByIdx(${idx})">

            <div style="display:flex;align-items:center;gap:12px">
              <div style="flex-shrink:0;width:34px;height:34px;border-radius:50%;
                          background:${badgeBg};display:flex;align-items:center;
                          justify-content:center;font-size:12px;font-weight:800;color:${badgeColor}">
                ${badgeInner}
              </div>

              <div style="flex:1;min-width:0">
                <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
                  <span style="font-weight:700;font-size:var(--font-size-sm)">Session ${sessNum}</span>
                  ${isLatestInGroup ? '<span class="badge badge-green" style="font-size:10px">Latest</span>' : ''}
                  ${isViewing       ? '<span class="badge badge-blue"  style="font-size:10px"><i class="fas fa-eye" style="margin-right:3px"></i>Viewing</span>' : ''}
                </div>
                <div style="font-size:var(--font-size-xs);color:var(--text-muted)">
                  ${dateStr} &middot; ${timeAgo}
                </div>
                ${sess.level_name ? `
                  <div style="margin-top:3px">
                    <span style="font-size:10px;font-weight:600;background:rgba(14,165,233,.1);
                                 color:#0ea5e9;border-radius:8px;padding:1px 7px">
                      <i class="fas fa-layer-group" style="margin-right:3px;font-size:9px"></i>${Utils.esc(sess.level_name)}
                    </span>
                  </div>` : ''}
              </div>

              <div style="flex-shrink:0;display:flex;flex-direction:column;align-items:flex-end;gap:6px">
                ${rightBadge}
                <button class="btn-delete-session"
                  title="Delete this session"
                  onclick="event.stopPropagation();ProgressPage.confirmDeleteSession('${sess.session_id}', ${sessNum})">
                  <i class="fas fa-trash-alt"></i>
                </button>
              </div>
            </div>

            ${chips ? `<div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:8px">${chips}</div>` : ''}
          </div>`;
      }).join('');

      return `<div style="margin-bottom:16px">${groupHeader}${cards}</div>`;
    }).join('');
  },

  // ─────────────────────────────────────────────────────────────────────────
  // DELETE SESSION
  // Removes all history entries matching session_id (minute-precision key)
  // from every domain's notes JSON array, then upserts cleaned rows to DB.
  // ─────────────────────────────────────────────────────────────────────────
  confirmDeleteSession(sessionId, sessNum) {
    const idx  = this._sessions.findIndex(s => s.session_id === sessionId);
    const card = document.getElementById(`sess-${idx}`);
    if (!card) return;

    // Prevent double confirm bar
    if (card.querySelector('.delete-confirm-bar')) return;

    const bar = document.createElement('div');
    bar.className = 'delete-confirm-bar';
    bar.innerHTML = `
      <span style="font-size:12px;font-weight:600;color:var(--brand-danger)">
        <i class="fas fa-exclamation-triangle" style="margin-right:5px"></i>
        Delete Session ${sessNum}?
      </span>
      <div style="display:flex;gap:6px;margin-left:auto">
        <button class="btn btn-sm" style="padding:3px 10px;font-size:11px"
          onclick="event.stopPropagation();this.closest('.delete-confirm-bar').remove()">
          Cancel
        </button>
        <button class="btn btn-sm" style="padding:3px 10px;font-size:11px;
          background:var(--brand-danger);color:#fff;border-color:var(--brand-danger)"
          onclick="event.stopPropagation();ProgressPage.deleteSession('${sessionId}')">
          <i class="fas fa-trash-alt" style="margin-right:3px"></i>Yes, delete
        </button>
      </div>`;
    card.appendChild(bar);
    bar.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  },

  async deleteSession(sessionId) {
    if (!this.selectedStudent) return;

    document.querySelectorAll('.btn-delete-session').forEach(b => b.disabled = true);

    // NEW MODEL: DELETE all rows matching (student_id, assessed_at ≈ sessionId minute)
    const { error } = await DB.deleteAssessmentSession(
      this.selectedStudent.id,
      sessionId,
    );

    if (error) {
      console.error('Delete session error:', error);
      Toast.error('Failed to delete session: ' + (error.message || 'unknown error'));
      document.querySelectorAll('.btn-delete-session').forEach(b => b.disabled = false);
      return;
    }

    Toast.success('Session deleted successfully.');

    // If we were viewing the deleted session → reset to blank new
    if (this._viewingSession === sessionId) {
      this._viewingSession = null;
      this.currentSession  = {};
    }

    // Reload data + refresh UI
    await this._loadSessions(this.selectedStudent.id);

    const headerCard = document.getElementById('prog-header-card');
    if (headerCard) headerCard.innerHTML = this._headerHTML(this.selectedStudent);

    const histBody = document.getElementById('prog-history-body');
    if (histBody) histBody.innerHTML = this._sessionsListHTML();

    const metaEl = document.getElementById('prog-history-meta');
    if (metaEl) metaEl.textContent = `${this._sessions.length} session${this._sessions.length !== 1 ? 's' : ''}`;

    // Update History tab counter badge
    const histBtn = document.getElementById('tab-btn-history');
    if (histBtn) {
      const span = histBtn.querySelector('span');
      if (span) span.textContent = this._sessions.length;
    }

    // Re-render form as blank if needed
    if (!this._viewingSession) {
      const skillsForm = document.getElementById('skills-form');
      if (skillsForm) skillsForm.innerHTML = this._assessmentTableHTML();
      const titleEl = document.getElementById('prog-form-title');
      const subEl   = document.getElementById('prog-form-sub');
      const badgeEl = document.getElementById('prog-session-mode-badge');
      if (titleEl) titleEl.textContent = 'New Assessment';
      if (subEl)   subEl.textContent   = 'Select a proficiency level for each domain and add an instructor comment';
      if (badgeEl) badgeEl.innerHTML   = '';
    }

    this._updateHeaderLive();
  },

  // ─────────────────────────────────────────────────────────────────────────
  // SESSION CONTEXT SELECTS (Class + Level inside the form)
  // ─────────────────────────────────────────────────────────────────────────
  onSessionCourseChange() {
    const sel = document.getElementById('session-course-select');
    if (!sel) return;
    this._sessionCourseId   = sel.value || null;
    this._sessionCourseName = sel.value ? sel.options[sel.selectedIndex].text : null;
    this._sessionLevelId    = null;
    this._sessionLevelName  = null;

    // Auto-detect this student's enrolled level for the selected course
    const autoEnroll = this._sessionCourseId
      ? this._studentEnrollments.find(e => e.course_id === this._sessionCourseId)
      : null;

    // Repopulate level select, pre-selecting the auto-detected level
    const lvSel = document.getElementById('session-level-select');
    if (lvSel) {
      lvSel.innerHTML = '<option value="">— Select Level —</option>';
      if (this._sessionCourseId) {
        this._allLevels
          .filter(l => l.course_id === this._sessionCourseId)
          .forEach(l => {
            const opt      = document.createElement('option');
            opt.value      = l.id;
            opt.textContent = l.name;
            if (autoEnroll && autoEnroll.level_id === l.id) opt.selected = true;
            lvSel.appendChild(opt);
          });
      }
    }

    // Apply auto-detected level to state
    if (autoEnroll) {
      this._sessionLevelId   = autoEnroll.level_id;
      this._sessionLevelName = autoEnroll.level_name;
      this._showAutoLevelHint(autoEnroll.level_name);
    } else {
      this._clearAutoLevelHint();
    }

    // Switch assessment form template when course type changes (SpeedMath <-> Robotics)
    this.currentSession = {};
    const skillsForm = document.getElementById('skills-form');
    if (skillsForm) skillsForm.innerHTML = this._assessmentTableHTML();
    const subEl = document.getElementById('prog-form-sub');
    if (subEl) {
      subEl.textContent = this._courseType() === 'speedmath'
        ? 'Enter the final SpeedMath score (0-120) and save'
        : 'Select a proficiency level for each domain and add an instructor comment';
    }
    this._updateHeaderLive();
    this._markUnsaved();
  },

  onSessionLevelChange() {
    const sel = document.getElementById('session-level-select');
    if (!sel) return;
    this._sessionLevelId   = sel.value || null;
    this._sessionLevelName = sel.value ? sel.options[sel.selectedIndex].text : null;

    // Check if the newly selected value matches the auto-detected enrollment
    const autoEnroll = this._sessionCourseId
      ? this._studentEnrollments.find(e => e.course_id === this._sessionCourseId)
      : null;
    if (autoEnroll && autoEnroll.level_id === this._sessionLevelId) {
      this._showAutoLevelHint(autoEnroll.level_name);
    } else {
      this._clearAutoLevelHint();
      // Show a "manually overridden" note if student has an enrollment but picked different
      if (autoEnroll && this._sessionLevelId) {
        this._showAutoLevelHint(autoEnroll.level_name, true);
      }
    }

    this._markUnsaved();
  },

  // Show a small badge below the Level select indicating the auto-detected enrolled level
  _showAutoLevelHint(levelName, overridden = false) {
    let hint = document.getElementById('auto-level-hint');
    if (!hint) {
      // Insert after the level select's parent form-group
      const lvSel = document.getElementById('session-level-select');
      if (!lvSel) return;
      hint = document.createElement('div');
      hint.id = 'auto-level-hint';
      hint.style.cssText = 'margin-top:4px;font-size:11px;display:flex;align-items:center;gap:4px';
      lvSel.parentElement.appendChild(hint);
    }
    if (overridden) {
      hint.innerHTML = `
        <i class="fas fa-pencil-alt" style="color:var(--brand-warning);font-size:10px"></i>
        <span style="color:var(--brand-warning)">
          Manually changed — enrolled level is
          <strong>${Utils.esc(levelName)}</strong>
        </span>`;
    } else {
      hint.innerHTML = `
        <i class="fas fa-magic" style="color:var(--brand-primary);font-size:10px"></i>
        <span style="color:var(--brand-primary)">
          Auto-set from enrollment: <strong>${Utils.esc(levelName)}</strong>
        </span>`;
    }
  },

  _clearAutoLevelHint() {
    const hint = document.getElementById('auto-level-hint');
    if (hint) hint.remove();
  },

  _markUnsaved() {
    this._pendingChanges = true;
    const saveBtn = document.getElementById('save-assessment-btn');
    if (saveBtn && !saveBtn.disabled) {
      saveBtn.disabled  = false;
      saveBtn.innerHTML = '<i class="fas fa-save"></i> Save Assessment'
        + ' <span style="font-size:10px;background:var(--brand-warning);color:#000;'
        + 'border-radius:10px;padding:1px 6px;margin-left:4px">unsaved</span>';
    }
  },

  // ─────────────────────────────────────────────────────────────────────────
  // SPEEDMATH SETTERS + LIVE DOM UPDATE
  // ─────────────────────────────────────────────────────────────────────────
  setSpeedmathScore(rawValue) {
    if (this._viewingSession) return;
    const num     = parseInt(rawValue);
    const clamped = isNaN(num) ? '' : Math.min(120, Math.max(0, num));
    if (!this.currentSession['speedmath_score']) this.currentSession['speedmath_score'] = {};
    this.currentSession['speedmath_score'].score      = clamped;
    this.currentSession['speedmath_score'].domain_key = 'speedmath_score';
    this._liveUpdateSpeedmathArc(clamped);
    this._updateHeaderLive();
    this._markUnsaved();
  },

  setSpeedmathComment(value) {
    if (this._viewingSession) return;
    if (!this.currentSession['speedmath_score']) this.currentSession['speedmath_score'] = {};
    this.currentSession['speedmath_score'].comment = value;
    this._markUnsaved();
  },

  // Update the SVG arc, colours and grade band label live without re-rendering
  _liveUpdateSpeedmathArc(scoreNum) {
    let scoreColor = 'var(--text-muted)';
    let gradeBand  = '';
    if (!isNaN(scoreNum) && scoreNum !== '') {
      if      (scoreNum >= 100) { scoreColor = '#22c55e'; gradeBand = 'Excellent'; }
      else if (scoreNum >= 80)  { scoreColor = '#3b82f6'; gradeBand = 'Good'; }
      else if (scoreNum >= 60)  { scoreColor = '#f59e0b'; gradeBand = 'Average'; }
      else if (scoreNum >= 40)  { scoreColor = '#f97316'; gradeBand = 'Needs Practice'; }
      else                      { scoreColor = '#ef4444'; gradeBand = 'Beginner'; }
    }
    const inp = document.getElementById('speedmath-score-input');
    if (inp) {
      inp.style.color        = scoreColor;
      inp.style.borderBottom = '2px solid ' + scoreColor;
    }
    const box = document.getElementById('speedmath-score-box');
    if (box) box.style.borderColor = scoreColor;

    const arc = document.getElementById('speedmath-arc');
    if (arc) {
      const pct    = (!isNaN(scoreNum) && scoreNum !== '') ? Math.min(scoreNum, 120) / 120 : 0;
      const offset = Math.round(188.5 * (1 - pct));
      arc.setAttribute('stroke-dashoffset', offset);
      arc.setAttribute('stroke', scoreColor);
    }
    const pctEl = document.getElementById('speedmath-pct');
    if (pctEl) {
      const pct     = (!isNaN(scoreNum) && scoreNum !== '') ? Math.min(scoreNum, 120) / 120 : 0;
      pctEl.textContent = (!isNaN(scoreNum) && scoreNum !== '') ? Math.round(pct * 100) + '%' : '---';
      pctEl.style.color = scoreColor;
    }
  },

  // ─────────────────────────────────────────────────────────────────────────
  // SET LEVEL (radio button click) — Robotics & STEM only
  // ─────────────────────────────────────────────────────────────────────────
  setLevel(domainKey, levelKey, domainLabel) {
    if (this._viewingSession) {
      Toast.warning('You\'re viewing a past session. Click "New Assessment" to start a fresh one.');
      return;
    }

    // Update stored state
    if (!this.currentSession[domainKey]) this.currentSession[domainKey] = {};
    this.currentSession[domainKey].level        = levelKey;
    this.currentSession[domainKey].domain_key   = domainKey;
    this.currentSession[domainKey].domain_label = domainLabel;

    // Update label highlight state for all level labels in this row
    this.LEVELS.forEach(lv => {
      const lbl = document.getElementById(`lv-label-${domainKey}-${lv.key}`);
      if (!lbl) return;
      const isSelected = lv.key === levelKey;
      lbl.style.background = isSelected ? lv.bg : 'transparent';
      // Update checkmark span
      const spans = lbl.querySelectorAll('span');
      if (spans[0]) {
        if (isSelected) {
          spans[0].style.color  = lv.color;
          spans[0].textContent  = '✓';
        } else {
          spans[0].textContent  = '\u00A0';
        }
      }
      // Re-attach hover handlers
      if (!isSelected) {
        lbl.onmouseover = () => { lbl.style.background = lv.bg; };
        lbl.onmouseout  = () => { lbl.style.background = 'transparent'; };
      } else {
        lbl.onmouseover = null;
        lbl.onmouseout  = null;
      }
    });

    this._updateHeaderLive();
    this._markUnsaved();
  },

  // ─────────────────────────────────────────────────────────────────────────
  // SET COMMENT (textarea input)
  // ─────────────────────────────────────────────────────────────────────────
  setComment(domainKey, value) {
    if (this._viewingSession) return;
    if (!this.currentSession[domainKey]) this.currentSession[domainKey] = {};
    this.currentSession[domainKey].comment = value;
    this._markUnsaved();
  },

  // ─────────────────────────────────────────────────────────────────────────
  // LIVE HEADER UPDATE
  // ─────────────────────────────────────────────────────────────────────────
  _updateHeaderLive() {
    const type      = this._viewingSession ? this._sessionTypeForViewing() : this._courseType();
    const overallEl = document.getElementById('prog-overall-val');
    const pillsEl   = document.getElementById('prog-domain-pills');

    // ── SpeedMath ──
    if (type === 'speedmath') {
      const state    = this.currentSession['speedmath_score'] || {};
      const scoreNum = parseInt(state.score);
      let scoreColor = 'var(--text-muted)';
      if (!isNaN(scoreNum)) {
        if      (scoreNum >= 100) scoreColor = '#22c55e';
        else if (scoreNum >= 80)  scoreColor = '#3b82f6';
        else if (scoreNum >= 40)  scoreColor = '#f97316';
        else                      scoreColor = '#ef4444';
      }
      if (overallEl) {
        overallEl.innerHTML = !isNaN(scoreNum)
          ? `<div style="font-size:2.2rem;font-weight:900;color:${scoreColor};line-height:1">${scoreNum}</div>
             <div style="font-size:var(--font-size-xs);color:var(--text-muted)">/120 SpeedMath</div>`
          : `<div style="font-size:var(--font-size-xs);color:var(--text-muted);font-style:italic">
               <i class="fas fa-stopwatch" style="margin-right:4px;color:#f59e0b"></i>SpeedMath
             </div>`;
      }
      if (pillsEl) pillsEl.innerHTML = '';
      return;
    }

    // ── Robotics & STEM ──
    const assessedCount = Object.values(this.currentSession).filter(v => v.level).length;
    if (overallEl) {
      overallEl.innerHTML = assessedCount > 0
        ? `<div style="font-size:2rem;font-weight:900;color:var(--brand-primary);line-height:1">
             ${assessedCount}/${this.DOMAINS.length}
           </div>
           <div style="font-size:var(--font-size-xs);color:var(--text-muted)">domains rated</div>`
        : `<div style="font-size:var(--font-size-xs);color:var(--text-muted);font-style:italic">No ratings yet</div>`;
    }
    if (pillsEl) {
      pillsEl.innerHTML = this.DOMAINS.map(d => {
        const lvKey = this.currentSession[d.key]?.level || null;
        const lv    = this.LEVELS.find(l => l.key === lvKey);
        return `
          <div style="display:flex;align-items:center;justify-content:space-between;
                      background:var(--bg-tertiary);border-radius:var(--radius-md);
                      padding:7px 12px;gap:8px">
            <div style="display:flex;align-items:center;gap:6px;min-width:0">
              <i class="fas ${d.icon}" style="font-size:11px;color:var(--text-muted);flex-shrink:0"></i>
              <span style="font-size:11px;color:var(--text-secondary);
                           overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
                ${Utils.esc(d.label)}
              </span>
            </div>
            ${lv
              ? `<span style="font-size:10px;font-weight:700;color:${lv.color};
                              background:${lv.bg};border-radius:10px;padding:2px 8px;
                              flex-shrink:0;text-transform:uppercase;letter-spacing:.04em">
                   ${lv.label}
                 </span>`
              : `<span style="font-size:10px;color:var(--text-muted);font-style:italic">--</span>`}
          </div>`;
      }).join('');
    }
  },

  // ─────────────────────────────────────────────────────────────────────────
  // LOAD A SESSION INTO FORM (read-only view mode)
  // ─────────────────────────────────────────────────────────────────────────
  loadSessionByIdx(idx) {
    const sess = this._sessions[idx];
    if (!sess) return;
    this.loadSession(sess.session_id);
  },

  loadSession(sessionId) {
    const sess = this._sessions.find(s => s.session_id === sessionId);
    if (!sess) return;

    this._viewingSession = sessionId;
    this.currentSession  = {};

    const sessType = this._isSpeedMathName(sess.course_name) ? 'speedmath' : 'robotics';

    if (sessType === 'speedmath') {
      // Restore SpeedMath state from the saved domain row
      const smRow = sess.domains.find(d => d.domain_key === 'speedmath_score');
      this.currentSession['speedmath_score'] = {
        domain_key: 'speedmath_score',
        score:      smRow?.speedmath_score ?? smRow?.score ?? '',
        comment:    smRow?.comment || '',
      };
    } else {
      // Restore Robotics state
      sess.domains.forEach(row => {
        this.currentSession[row.domain_key] = {
          level:        row.level,
          comment:      row.comment || '',
          domain_key:   row.domain_key,
          domain_label: row.domain_label || row.domain_key,
        };
      });
    }

    // Re-render the assessment table in read-only mode (correct template)
    const skillsForm = document.getElementById('skills-form');
    if (skillsForm) skillsForm.innerHTML = this._assessmentTableHTML();

    // Show session context (Course + Level) in the selector area — read-only display
    const ctxFields = document.getElementById('session-context-fields');
    if (ctxFields) {
      if (sess.course_name || sess.level_name) {
        ctxFields.innerHTML = `
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:4px 0">
            <span style="font-size:11px;color:var(--text-muted);font-weight:600;text-transform:uppercase;letter-spacing:.05em">
              Session context:
            </span>
            ${sess.course_name ? `
              <span style="font-size:12px;font-weight:700;background:rgba(99,102,241,.1);
                           color:#6366f1;border-radius:8px;padding:3px 10px">
                <i class="fas fa-book" style="margin-right:4px"></i>${Utils.esc(sess.course_name)}
              </span>` : ''}
            ${sess.level_name ? `
              <span style="font-size:12px;font-weight:700;background:rgba(14,165,233,.1);
                           color:#0ea5e9;border-radius:8px;padding:3px 10px">
                <i class="fas fa-layer-group" style="margin-right:4px"></i>${Utils.esc(sess.level_name)}
              </span>` : ''}
          </div>`;
      } else {
        ctxFields.innerHTML = `
          <div style="font-size:11px;color:var(--text-muted);font-style:italic;padding:4px 0">
            No class/level recorded for this session.
          </div>`;
      }
    }

    // Update form title
    const titleEl   = document.getElementById('prog-form-title');
    const subEl     = document.getElementById('prog-form-sub');
    const dateStr   = sess.assessed_at
      ? new Date(sess.assessed_at).toLocaleDateString('en-GB', {
          day:'2-digit', month:'short', year:'numeric',
          hour:'2-digit', minute:'2-digit'
        })
      : '';
    const sessNum   = this._sessions.length - this._sessions.indexOf(sess);
    const typeLabel = sessType === 'speedmath' ? 'SpeedMath' : 'Robotics & STEM';
    if (titleEl) titleEl.textContent = `Session ${sessNum} (${typeLabel}) -- ${dateStr}`;
    if (subEl)   subEl.textContent   = 'Viewing saved session. Click "New Assessment" to record a fresh session.';

    // Show viewing badge
    const badgeEl = document.getElementById('prog-session-mode-badge');
    if (badgeEl) badgeEl.innerHTML = `
      <span class="badge badge-blue"><i class="fas fa-eye" style="margin-right:4px"></i>Read-only</span>`;

    // Highlight session card
    document.querySelectorAll('.prog-session-card').forEach(el => el.classList.remove('active'));
    const sessIdx = this._sessions.findIndex(s => s.session_id === sessionId);
    const card = document.getElementById(`sess-${sessIdx}`);
    if (card) card.classList.add('active');

    this._updateHeaderLive();
    this._pendingChanges = false;

    // Refresh history list (Viewing badge) and switch to Assess tab to show read-only form
    const histBody = document.getElementById('prog-history-body');
    if (histBody) histBody.innerHTML = this._sessionsListHTML();
    this.switchTab('assess');
  },

  // ─────────────────────────────────────────────────────────────────────────
  // START NEW ASSESSMENT
  // ─────────────────────────────────────────────────────────────────────────
  startNewSession() {
    this._viewingSession = null;
    this.currentSession  = {};
    this._pendingChanges = false;

    // Re-render fresh table
    const skillsForm = document.getElementById('skills-form');
    if (skillsForm) skillsForm.innerHTML = this._assessmentTableHTML();

    // Restore the class + level selector fields (keeping last selection for convenience)
    const ctxFields = document.getElementById('session-context-fields');
    if (ctxFields) {
      ctxFields.innerHTML = `
        <div class="form-group" style="margin:0">
          <label class="form-label" style="font-size:11px">
            <i class="fas fa-book" style="margin-right:4px;color:var(--brand-primary)"></i>
            Class <span style="color:var(--brand-danger)">*</span>
          </label>
          <select id="session-course-select" class="form-select form-select-sm"
            onchange="ProgressPage.onSessionCourseChange()">
            <option value="">— Select Class —</option>
            ${this._allCourses.map(c =>
              `<option value="${c.id}" ${this._sessionCourseId === c.id ? 'selected' : ''}>${Utils.esc(c.name)}</option>`
            ).join('')}
          </select>
        </div>
        <div class="form-group" style="margin:0">
          <label class="form-label" style="font-size:11px">
            <i class="fas fa-layer-group" style="margin-right:4px;color:var(--brand-primary)"></i>
            Level <span style="color:var(--brand-danger)">*</span>
          </label>
          <select id="session-level-select" class="form-select form-select-sm"
            onchange="ProgressPage.onSessionLevelChange()">
            <option value="">— Select Level —</option>
            ${this._sessionCourseId
              ? this._allLevels.filter(l => l.course_id === this._sessionCourseId).map(l =>
                  `<option value="${l.id}" ${this._sessionLevelId === l.id ? 'selected' : ''}>${Utils.esc(l.name)}</option>`
                ).join('')
              : ''}
          </select>
        </div>`;
    }

    const titleEl  = document.getElementById('prog-form-title');
    const subEl    = document.getElementById('prog-form-sub');
    const badgeEl  = document.getElementById('prog-session-mode-badge');
    const hintEl   = document.getElementById('prog-save-hint');
    if (titleEl) titleEl.textContent = 'New Assessment';
    const type = this._courseType();
    if (subEl)   subEl.textContent   = type === 'speedmath'
      ? 'Enter the final SpeedMath score (0-120) and save'
      : 'Select a proficiency level for each domain and add an instructor comment';
    if (badgeEl) badgeEl.innerHTML   = '';
    if (hintEl)  hintEl.textContent  = 'Each save creates a new independent session snapshot.';

    document.querySelectorAll('.prog-session-card').forEach(el => el.classList.remove('active'));

    const saveBtn = document.getElementById('save-assessment-btn');
    if (saveBtn) {
      saveBtn.disabled  = false;
      saveBtn.innerHTML = '<i class="fas fa-save"></i> Save Assessment';
    }

    this._updateHeaderLive();
    Toast.info(type === 'speedmath'
      ? 'New SpeedMath session started -- enter the score and save.'
      : 'New assessment session started -- select levels and save.');
  },

  // ─────────────────────────────────────────────────────────────────────────
  // SAVE SESSION
  // ─────────────────────────────────────────────────────────────────────────
  async saveSession() {
    if (!this.selectedStudent) return Toast.warning('No student selected');
    if (this._viewingSession)  return Toast.warning('You\'re viewing a past session. Click "New Assessment" first.');

    // Validate class + level required
    if (!this._sessionCourseId)
      return Toast.warning('Please select a Class before saving.');
    if (!this._sessionLevelId)
      return Toast.warning('Please select a Level before saving.');

    const courseType = this._courseType();
    const now        = new Date().toISOString();
    const saveBtn    = document.getElementById('save-assessment-btn');
    if (saveBtn) { saveBtn.disabled = true; saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...'; }

    const baseMeta = {
      course_id:   this._sessionCourseId,
      course_name: this._sessionCourseName,
      level_id:    this._sessionLevelId,
      level_name:  this._sessionLevelName,
    };

    let skillRowsFinal = [];

    if (courseType === 'speedmath') {
      // ── SpeedMath: one row per session ───────────────────────────────
      const state    = this.currentSession['speedmath_score'] || {};
      const scoreNum = parseInt(state.score);
      if (isNaN(scoreNum) || state.score === '' || state.score === undefined) {
        saveBtn.disabled  = false;
        saveBtn.innerHTML = '<i class="fas fa-save"></i> Save Assessment';
        return Toast.warning('Enter a score (0 to 120) before saving.');
      }
      skillRowsFinal = [{
        student_id:    this.selectedStudent.id,
        skill_key:     'speedmath_score',
        skill_label:   'SpeedMath Score',
        category:      'speedmath',
        score:         0,          // column kept at 0 — real value lives in notes.speedmath_score
        assessed_at:   now,
        session_notes: JSON.stringify({
          ...baseMeta,
          speedmath_score: scoreNum,
          comment:         state.comment || null,
        }),
      }];

    } else {
      // ── Robotics & STEM: one row per rated domain ─────────────────────
      const rated = Object.values(this.currentSession).filter(d => d.level);
      if (!rated.length) {
        saveBtn.disabled  = false;
        saveBtn.innerHTML = '<i class="fas fa-save"></i> Save Assessment';
        return Toast.warning('Select a proficiency level for at least one domain before saving.');
      }
      skillRowsFinal = rated.map(d => ({
        student_id:    this.selectedStudent.id,
        skill_key:     d.domain_key,
        skill_label:   d.domain_label || d.domain_key,
        category:      'domain',
        score:         this.LEVELS.find(l => l.key === d.level)?.order || 0,
        assessed_at:   now,
        session_notes: JSON.stringify({ ...baseMeta, level: d.level, comment: d.comment || null }),
      }));
    }

    const { error } = await DB.saveAssessmentSession(skillRowsFinal);

    if (error) {
      console.error('Save session error:', error);
      Toast.error('Failed to save: ' + (error.message || 'unknown error'));
      if (saveBtn) { saveBtn.disabled = false; saveBtn.innerHTML = '<i class="fas fa-save"></i> Save Assessment'; }
      return;
    }

    const typeLabel = courseType === 'speedmath' ? 'SpeedMath' : 'Robotics & STEM';

    // Reload sessions first so counts are correct
    await this._loadSessions(this.selectedStudent.id);

    Toast.success(`${typeLabel} session saved! ${this._sessions.length} total.`);

    const headerCard = document.getElementById('prog-header-card');
    if (headerCard) headerCard.innerHTML = this._headerHTML(this.selectedStudent);

    const histBody = document.getElementById('prog-history-body');
    if (histBody) histBody.innerHTML = this._sessionsListHTML();

    // Update History tab counter badge
    const metaEl  = document.getElementById('prog-history-meta');
    if (metaEl) metaEl.textContent = `${this._sessions.length} session${this._sessions.length !== 1 ? 's' : ''}`;
    const histBtn = document.getElementById('tab-btn-history');
    if (histBtn) {
      const span = histBtn.querySelector('span');
      if (span) span.textContent = this._sessions.length;
    }

    this.startNewSession();

    // Switch to History tab so the newly saved session is immediately visible
    this.switchTab('history');

    if (saveBtn) { saveBtn.disabled = false; saveBtn.innerHTML = '<i class="fas fa-save"></i> Save Assessment'; }
  },

  // ─────────────────────────────────────────────────────────────────────────
  // HELPERS
  // ─────────────────────────────────────────────────────────────────────────
  _generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = Math.random() * 16 | 0;
      return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
  },
};
