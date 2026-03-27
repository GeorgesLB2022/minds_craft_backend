/* ============================================================
   MINDS' CRAFT — STUDENT PROGRESS / ASSESSMENT PAGE
   Session-based assessments: each Save creates a new snapshot.
   History shows all sessions; clicking one loads it for review.
   ============================================================ */

const ProgressPage = {

  // ── State ──────────────────────────────────────────────────
  _allCourses:   [],
  _allLevels:    [],
  _allStudents:  [],       // all active students (unfiltered)
  _listStudents: [],       // students visible in picker after filter

  selectedStudent:  null,
  currentSession:   {},    // skill_key → { score, skill_label, category }  (working area)
  _allSessions:     [],    // raw rows from DB, sorted newest-first
  _sessions:        [],    // grouped: [{ session_id, assessed_at, notes, skills:[] }]
  _viewingSession:  null,  // session_id being viewed in history (null = current draft)
  _pendingChanges:  false,

  // ── Skill taxonomy ─────────────────────────────────────────
  SKILL_CATEGORIES: [
    { key: 'cognitive', label: 'Cognitive Skills', skills: [
        { key: 'problem_solving',     label: 'Problem Solving'       },
        { key: 'logical_thinking',    label: 'Logical Thinking'      },
        { key: 'pattern_recognition', label: 'Pattern Recognition'   },
        { key: 'creativity',          label: 'Creativity & Innovation'},
    ]},
    { key: 'execution', label: 'Execution Speed', skills: [
        { key: 'build_speed',      label: 'Build Speed'         },
        { key: 'accuracy',         label: 'Accuracy'            },
        { key: 'attention_detail', label: 'Attention to Detail' },
        { key: 'time_management',  label: 'Time Management'     },
    ]},
    { key: 'technical', label: 'Technical Skills', skills: [
        { key: 'coding',      label: 'Coding / Programming' },
        { key: 'electronics', label: 'Electronics & Wiring' },
        { key: 'mechanical',  label: 'Mechanical Assembly'  },
        { key: 'debugging',   label: 'Debugging Skills'     },
    ]},
    { key: 'social', label: 'Social & Teamwork', skills: [
        { key: 'teamwork',      label: 'Teamwork'      },
        { key: 'communication', label: 'Communication' },
        { key: 'leadership',    label: 'Leadership'    },
        { key: 'perseverance',  label: 'Perseverance'  },
    ]},
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
          <p>Filter by course &amp; level, pick a student, rate skills and save sessions.</p>
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

    // Populate course dropdown — clear first to prevent duplicates on re-render
    const courseSelect = document.getElementById('prog-course');
    if (courseSelect) {
      courseSelect.innerHTML = '<option value="">— All Courses —</option>';
      // De-duplicate by id just in case
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
        const opt = document.createElement('option');
        opt.value = l.id;
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
  // SELECT STUDENT — loads all sessions, shows latest as current draft
  // ─────────────────────────────────────────────────────────────────────────
  async selectStudent(id) {
    this.selectedStudent = this._allStudents.find(s => s.id === id)
                        || this._listStudents.find(s => s.id === id);
    if (!this.selectedStudent) return;

    this._pendingChanges = false;
    this._viewingSession = null;
    this.currentSession  = {};

    this.renderStudentPicker(this._listStudents);

    const panel = document.getElementById('assessment-panel');
    if (panel) panel.innerHTML = `
      <div class="card"><div class="empty-state" style="padding:3rem">
        <i class="fas fa-spinner fa-spin"></i><p style="margin-top:.5rem">Loading…</p>
      </div></div>`;

    await this._loadSessions(id);
    this.renderAssessmentPanel();

    // Show header buttons
    const newBtn  = document.getElementById('new-session-btn');
    const saveBtn = document.getElementById('save-assessment-btn');
    if (newBtn)  newBtn.style.display  = '';
    if (saveBtn) { saveBtn.disabled = false; saveBtn.innerHTML = '<i class="fas fa-save"></i> Save Assessment'; }
  },

  // ─────────────────────────────────────────────────────────────────────────
  // LOAD ALL SESSIONS FOR STUDENT
  // ─────────────────────────────────────────────────────────────────────────
  async _loadSessions(studentId) {
    const { data: rows } = await DB.getAssessments(studentId);
    this._allSessions = rows || [];
    this._buildSessionGroups();
  },

  // ─────────────────────────────────────────────────────────────────────────
  // REBUILD SESSION LIST FROM DB ROWS
  //
  // Each DB row = one skill for one student.  The `notes` column holds a JSON
  // array of historical snapshots (newest-first):
  //   [ { score, assessed_at, session_notes }, ... ]
  //
  // We "pivot" those arrays so that every unique assessed_at timestamp becomes
  // a session object containing all skills rated at that time.
  // ─────────────────────────────────────────────────────────────────────────
  _buildSessionGroups() {
    // sessionMap: assessed_at → { session_id, assessed_at, session_notes, skills:[] }
    const sessionMap = {};

    this._allSessions.forEach(row => {
      // Parse history array stored in notes
      let history = [];
      if (row.notes) {
        try { history = JSON.parse(row.notes); } catch { history = []; }
        if (!Array.isArray(history)) history = [];
      }

      // If notes is empty / not JSON this is a legacy plain-text row:
      // treat the row itself as a single-entry session
      if (!history.length) {
        history = [{
          score:         row.score,
          assessed_at:   row.assessed_at,
          session_notes: null,
        }];
      }

      history.forEach(entry => {
        const sid = entry.assessed_at
          ? entry.assessed_at.slice(0, 16)   // group by minute
          : 'unknown';

        if (!sessionMap[sid]) {
          sessionMap[sid] = {
            session_id:    sid,
            assessed_at:   entry.assessed_at || row.assessed_at,
            session_notes: entry.session_notes || null,
            skills:        [],
          };
        }

        sessionMap[sid].skills.push({
          skill_key:   row.skill_key,
          skill_label: row.skill_label || row.skill_key,
          category:    row.category    || 'general',
          score:       entry.score,
          assessed_at: entry.assessed_at,
        });

        // Carry session notes from the first skill that has them
        if (!sessionMap[sid].session_notes && entry.session_notes)
          sessionMap[sid].session_notes = entry.session_notes;
      });
    });

    // Sort sessions newest-first
    this._sessions = Object.values(sessionMap).sort((a, b) =>
      (b.assessed_at || '').localeCompare(a.assessed_at || ''));

    // Expose session_notes as `notes` for template compatibility
    // Compute overall score per session
    this._sessions.forEach(sess => {
      sess.notes = sess.session_notes;
      const scores = sess.skills.filter(s => s.score > 0).map(s => s.score);
      sess.overall = scores.length
        ? scores.reduce((a, b) => a + b, 0) / scores.length
        : 0;
    });
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

      <!-- Assessment form -->
      <div class="card" style="margin-bottom:1rem">
        <div class="card-header">
          <div>
            <div class="card-title" id="prog-form-title">New Assessment</div>
            <div style="font-size:11px;color:var(--text-muted)" id="prog-form-sub">
              Click stars to rate · scores update live
            </div>
          </div>
          <div id="prog-session-mode-badge"></div>
        </div>

        <div id="skills-form">
          ${this.SKILL_CATEGORIES.map(cat => this._categoryHTML(cat)).join('')}
        </div>

        <div style="margin-top:1.2rem;border-top:1px solid var(--border-light);padding-top:1rem">
          <label class="form-label">
            Session Notes
            <span style="font-size:10px;color:var(--text-muted);font-weight:400;margin-left:4px">
              (saved with this assessment session)
            </span>
          </label>
          <textarea id="assessment-notes" class="form-textarea" rows="3"
            placeholder="Observations, improvements, next steps…"></textarea>
        </div>

        <div style="margin-top:1rem;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px">
          <div id="prog-save-hint" style="font-size:var(--font-size-xs);color:var(--text-muted)">
            Each save creates a new independent session snapshot.
          </div>
          <button class="btn btn-primary" onclick="ProgressPage.saveSession()">
            <i class="fas fa-save"></i> Save Assessment
          </button>
        </div>
      </div>

      <!-- Session History -->
      <div class="card" id="prog-history-card">
        <div class="card-header">
          <div class="card-title">Assessment History</div>
          <span id="prog-history-meta"
            style="font-size:var(--font-size-xs);color:var(--text-muted)">
            ${this._sessions.length} session${this._sessions.length !== 1 ? 's' : ''}
          </span>
        </div>
        <div id="prog-history-body">
          ${this._sessionsListHTML()}
        </div>
      </div>
    `;

    this._updateHeaderLive();
  },

  // ─────────────────────────────────────────────────────────────────────────
  // STUDENT HEADER CARD
  // ─────────────────────────────────────────────────────────────────────────
  _headerHTML(s) {
    const overall   = this._calcOverallFromCurrent();
    const pct       = (overall / 5) * 100;
    const catScores = this.SKILL_CATEGORIES.map(cat => {
      const scores = cat.skills
        .map(sk => this.currentSession[sk.key]?.score || 0)
        .filter(v => v > 0);
      const avg = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
      return { label: cat.label, key: cat.key, avg };
    });

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
        <div style="text-align:right;flex-shrink:0">
          <div id="prog-overall-val"
            style="font-size:2.4rem;font-weight:900;color:var(--brand-primary);line-height:1">
            ${overall > 0 ? overall.toFixed(1) : '—'}
          </div>
          <div style="font-size:var(--font-size-xs);color:var(--text-muted)">
            ${overall > 0 ? 'Current / 5.0' : 'No ratings yet'}
          </div>
        </div>
      </div>

      <div class="progress-bar-wrap" style="margin-top:12px;height:8px">
        <div class="progress-bar-fill" id="prog-overall-bar"
          style="width:${pct}%;transition:width .3s ease"></div>
      </div>

      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));
                  gap:8px;margin-top:14px" id="prog-cat-scores">
        ${catScores.map(c => `
          <div style="background:var(--bg-tertiary);border-radius:var(--radius-md);padding:8px 10px"
            data-cat-bar="${c.key}">
            <div style="font-size:10px;color:var(--text-muted);margin-bottom:4px">${Utils.esc(c.label)}</div>
            <div style="display:flex;align-items:center;gap:8px">
              <div class="progress-bar-wrap" style="flex:1;height:5px">
                <div class="progress-bar-fill ${c.avg < 2 ? 'danger' : c.avg < 3.5 ? 'warning' : ''}"
                  style="width:${(c.avg/5)*100}%;transition:width .3s ease"
                  data-cat-fill="${c.key}"></div>
              </div>
              <span style="font-size:11px;font-weight:700;width:28px;text-align:right"
                data-cat-val="${c.key}">
                ${c.avg > 0 ? c.avg.toFixed(1) : '—'}
              </span>
            </div>
          </div>`).join('')}
      </div>`;
  },

  // ─────────────────────────────────────────────────────────────────────────
  // SKILL CATEGORY FORM
  // ─────────────────────────────────────────────────────────────────────────
  _categoryHTML(cat) {
    return `
      <div class="assessment-category">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:.75rem">
          <div class="assessment-category-title">${Utils.esc(cat.label)}</div>
          <span id="cat-avg-${cat.key}"
            style="font-size:11px;font-weight:700;color:var(--brand-primary);
                   background:rgba(34,197,94,.08);padding:2px 8px;border-radius:20px">
            ${this._catAvg(cat)}
          </span>
        </div>
        ${cat.skills.map(skill => {
          const score = this.currentSession[skill.key]?.score || 0;
          return `
            <div class="skill-item">
              <span class="skill-label">${Utils.esc(skill.label)}</span>
              <div class="skill-stars"
                data-skill="${skill.key}"
                data-cat="${cat.key}"
                data-cat-label="${Utils.esc(cat.label)}"
                data-skill-label="${Utils.esc(skill.label)}">
                ${[1,2,3,4,5].map(n => `
                  <span class="star-btn ${score >= n ? 'filled' : ''}"
                    data-val="${n}"
                    onclick="ProgressPage.setScore('${skill.key}',${n},this.parentElement)">★</span>
                `).join('')}
              </div>
              <span id="score-lbl-${skill.key}"
                style="font-size:var(--font-size-xs);font-weight:600;width:32px;text-align:right;
                       color:${score > 0 ? 'var(--brand-primary)' : 'var(--text-muted)'}">
                ${score > 0 ? score + '/5' : '—'}
              </span>
            </div>`;
        }).join('')}
      </div>`;
  },

  _catAvg(cat) {
    const scores = cat.skills.map(sk => this.currentSession[sk.key]?.score || 0).filter(v => v > 0);
    if (!scores.length) return '—';
    return (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1) + ' / 5';
  },

  _calcOverallFromCurrent() {
    const scores = Object.values(this.currentSession).map(s => s.score).filter(v => v > 0);
    if (!scores.length) return 0;
    return scores.reduce((a, b) => a + b, 0) / scores.length;
  },

  // ─────────────────────────────────────────────────────────────────────────
  // SESSION HISTORY LIST
  // ─────────────────────────────────────────────────────────────────────────
  _sessionsListHTML() {
    if (!this._sessions.length) return `
      <div class="empty-state" style="padding:2rem 0">
        <i class="fas fa-history"></i>
        <p style="margin-top:.5rem">No assessment sessions yet. Rate skills and save.</p>
      </div>`;

    return this._sessions.map((sess, idx) => {
      const dateStr  = sess.assessed_at
        ? new Date(sess.assessed_at).toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' })
        : '—';
      const timeAgo  = sess.assessed_at ? Utils.timeAgo(sess.assessed_at) : '';
      const overall  = sess.overall;
      const pct      = (overall / 5) * 100;
      const cls      = overall >= 4 ? '' : overall >= 2.5 ? 'warning' : 'danger';
      const isLatest = idx === 0;

      const safeId = 'sess-' + idx;
      return `
        <div class="prog-session-card ${this._viewingSession === sess.session_id ? 'active' : ''}"
          id="${safeId}"
          data-session-idx="${idx}"
          onclick="ProgressPage.loadSessionByIdx(${idx})">

          <div style="display:flex;align-items:center;gap:12px">
            <!-- Session number badge -->
            <div style="flex-shrink:0;width:36px;height:36px;border-radius:50%;
                        background:${isLatest ? 'var(--brand-primary)' : 'var(--bg-tertiary)'};
                        display:flex;align-items:center;justify-content:center;
                        font-size:13px;font-weight:800;
                        color:${isLatest ? '#fff' : 'var(--text-secondary)'}">
              ${this._sessions.length - idx}
            </div>

            <div style="flex:1;min-width:0">
              <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
                <span style="font-weight:700;font-size:var(--font-size-sm)">
                  Session ${this._sessions.length - idx}
                </span>
                ${isLatest ? '<span class="badge badge-green" style="font-size:10px">Latest</span>' : ''}
                ${this._viewingSession === sess.session_id
                  ? '<span class="badge badge-blue" style="font-size:10px"><i class="fas fa-eye" style="margin-right:3px"></i>Viewing</span>' : ''}
              </div>
              <div style="font-size:var(--font-size-xs);color:var(--text-muted)">
                ${dateStr} · ${timeAgo}
              </div>
              ${sess.notes ? `
                <div style="font-size:var(--font-size-xs);color:var(--text-secondary);
                             margin-top:3px;font-style:italic;
                             overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:300px"
                  title="${Utils.esc(sess.notes)}">
                  "${Utils.esc(sess.notes)}"
                </div>` : ''}
            </div>

            <!-- Score pill -->
            <div style="text-align:right;flex-shrink:0">
              <div style="font-size:1.4rem;font-weight:900;
                          color:${overall >= 4 ? 'var(--brand-primary)' : overall >= 2.5 ? 'var(--brand-warning)' : 'var(--brand-danger)'}">
                ${overall > 0 ? overall.toFixed(1) : '—'}
              </div>
              <div style="font-size:10px;color:var(--text-muted)">/ 5.0</div>
            </div>
          </div>

          <!-- Mini progress bar -->
          <div class="progress-bar-wrap" style="margin-top:8px;height:4px">
            <div class="progress-bar-fill ${cls}" style="width:${pct}%"></div>
          </div>

          <!-- Skill chips (top scored skills) -->
          <div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:8px">
            ${sess.skills
              .filter(sk => sk.score >= 4)
              .slice(0, 5)
              .map(sk => `
                <span style="font-size:10px;background:rgba(34,197,94,.1);
                             color:var(--brand-primary);border-radius:10px;padding:1px 7px">
                  ★ ${Utils.esc(sk.skill_label || sk.skill_key)} ${sk.score}/5
                </span>`)
              .join('')}
          </div>
        </div>`;
    }).join('');
  },

  // ─────────────────────────────────────────────────────────────────────────
  // LOAD A SESSION INTO THE FORM (read-only view mode)
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

    // Populate currentSession from the historical session's skills
    this.currentSession = {};
    sess.skills.forEach(row => {
      this.currentSession[row.skill_key] = {
        score:       row.score,
        skill_key:   row.skill_key,
        skill_label: row.skill_label || row.skill_key,
        category:    row.category    || 'general',
      };
    });

    // Re-render stars
    this.SKILL_CATEGORIES.forEach(cat => {
      cat.skills.forEach(skill => {
        const score   = this.currentSession[skill.key]?.score || 0;
        const starsEl = document.querySelector(`.skill-stars[data-skill="${skill.key}"]`);
        if (starsEl) {
          starsEl.querySelectorAll('.star-btn').forEach(star => {
            star.classList.toggle('filled', parseInt(star.dataset.val) <= score);
          });
        }
        const lbl = document.getElementById(`score-lbl-${skill.key}`);
        if (lbl) {
          lbl.textContent = score > 0 ? score + '/5' : '—';
          lbl.style.color = score > 0 ? 'var(--brand-primary)' : 'var(--text-muted)';
        }
        const avgBadge = document.getElementById(`cat-avg-${cat.key}`);
        if (avgBadge) avgBadge.textContent = this._catAvg(cat);
      });
    });

    // Populate notes
    const notesEl = document.getElementById('assessment-notes');
    if (notesEl) notesEl.value = sess.notes || '';

    // Update form title
    const titleEl = document.getElementById('prog-form-title');
    const subEl   = document.getElementById('prog-form-sub');
    const dateStr = sess.assessed_at
      ? new Date(sess.assessed_at).toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' })
      : '';

    const sessNum = this._sessions.length - this._sessions.indexOf(sess);
    if (titleEl) titleEl.textContent = `Session ${sessNum} — ${dateStr}`;
    if (subEl)   subEl.textContent   = 'Viewing saved session. Start a new assessment to record a fresh session.';

    // Show viewing badge
    const badgeEl = document.getElementById('prog-session-mode-badge');
    if (badgeEl) badgeEl.innerHTML = `
      <span class="badge badge-blue"><i class="fas fa-eye" style="margin-right:4px"></i>Read-only</span>`;

    // Highlight session card
    document.querySelectorAll('.prog-session-card').forEach(el => el.classList.remove('active'));
    const sessIdx = this._sessions.findIndex(s => s.session_id === sessionId);
    const card = document.getElementById(`sess-${sessIdx}`);
    if (card) card.classList.add('active');

    // Update header live
    this._updateHeaderLive();
    this._pendingChanges = false;

    // Update the history list (to show "Viewing" badge)
    const histBody = document.getElementById('prog-history-body');
    if (histBody) histBody.innerHTML = this._sessionsListHTML();
  },

  // ─────────────────────────────────────────────────────────────────────────
  // START NEW ASSESSMENT (blank slate)
  // ─────────────────────────────────────────────────────────────────────────
  startNewSession() {
    this._viewingSession = null;
    this.currentSession  = {};
    this._pendingChanges = false;

    // Clear all stars
    document.querySelectorAll('.skill-stars').forEach(starsEl => {
      starsEl.querySelectorAll('.star-btn').forEach(s => s.classList.remove('filled'));
    });
    document.querySelectorAll('[id^="score-lbl-"]').forEach(el => {
      el.textContent = '—';
      el.style.color = 'var(--text-muted)';
    });
    document.querySelectorAll('[id^="cat-avg-"]').forEach(el => el.textContent = '—');

    const notesEl = document.getElementById('assessment-notes');
    if (notesEl) notesEl.value = '';

    const titleEl  = document.getElementById('prog-form-title');
    const subEl    = document.getElementById('prog-form-sub');
    const badgeEl  = document.getElementById('prog-session-mode-badge');
    const hintEl   = document.getElementById('prog-save-hint');
    if (titleEl) titleEl.textContent = 'New Assessment';
    if (subEl)   subEl.textContent   = 'Click stars to rate · scores update live';
    if (badgeEl) badgeEl.innerHTML   = '';
    if (hintEl)  hintEl.textContent  = 'Each save creates a new independent session snapshot.';

    // Deselect session cards
    document.querySelectorAll('.prog-session-card').forEach(el => el.classList.remove('active'));

    const saveBtn = document.getElementById('save-assessment-btn');
    if (saveBtn) {
      saveBtn.disabled  = false;
      saveBtn.innerHTML = '<i class="fas fa-save"></i> Save Assessment';
    }

    this._updateHeaderLive();
    Toast.info('New assessment session started — rate skills and save.');
  },

  // ─────────────────────────────────────────────────────────────────────────
  // LIVE SCORE UPDATES
  // ─────────────────────────────────────────────────────────────────────────
  setScore(skillKey, score, starsEl) {
    // If viewing a past session, prompt to start new
    if (this._viewingSession) {
      Toast.warning('You\'re viewing a past session. Click "New Assessment" to start a fresh one.');
      return;
    }

    // Fill stars
    starsEl.querySelectorAll('.star-btn').forEach(star => {
      star.classList.toggle('filled', parseInt(star.dataset.val) <= score);
    });

    // Update score label
    const lbl = document.getElementById(`score-lbl-${skillKey}`);
    if (lbl) { lbl.textContent = score + '/5'; lbl.style.color = 'var(--brand-primary)'; }

    // Store in working session
    const catKey   = starsEl.dataset.cat;
    const skillLbl = starsEl.dataset.skillLabel;
    this.currentSession[skillKey] = {
      score,
      skill_key:   skillKey,
      skill_label: skillLbl,
      category:    catKey,
    };

    // Live updates
    this._updateHeaderLive();
    this._updateCatAvg(catKey);

    // Mark unsaved
    this._pendingChanges = true;
    const saveBtn = document.getElementById('save-assessment-btn');
    if (saveBtn) {
      saveBtn.disabled  = false;
      saveBtn.innerHTML = '<i class="fas fa-save"></i> Save Assessment'
        + ' <span style="font-size:10px;background:var(--brand-warning);color:#000;'
        + 'border-radius:10px;padding:1px 6px;margin-left:4px">unsaved</span>';
    }
  },

  _updateHeaderLive() {
    const overall = this._calcOverallFromCurrent();
    const pct     = (overall / 5) * 100;
    const valEl   = document.getElementById('prog-overall-val');
    const barEl   = document.getElementById('prog-overall-bar');
    if (valEl) valEl.textContent = overall > 0 ? overall.toFixed(1) : '—';
    if (barEl) barEl.style.width = pct + '%';

    this.SKILL_CATEGORIES.forEach(cat => {
      const scores = cat.skills.map(sk => this.currentSession[sk.key]?.score || 0).filter(v => v > 0);
      const avg    = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
      const fillEl = document.querySelector(`[data-cat-fill="${cat.key}"]`);
      const valEl2 = document.querySelector(`[data-cat-val="${cat.key}"]`);
      if (fillEl) fillEl.style.width = (avg / 5) * 100 + '%';
      if (valEl2) valEl2.textContent  = avg > 0 ? avg.toFixed(1) : '—';
    });
  },

  _updateCatAvg(catKey) {
    const cat = this.SKILL_CATEGORIES.find(c => c.key === catKey);
    if (!cat) return;
    const el  = document.getElementById(`cat-avg-${catKey}`);
    if (el)   el.textContent = this._catAvg(cat);
  },

  // ─────────────────────────────────────────────────────────────────────────
  // SAVE SESSION
  // Uses upsert on (student_id, skill_key) — the existing DB unique constraint.
  // History is preserved by storing all past snapshots as a JSON array in `notes`.
  // ─────────────────────────────────────────────────────────────────────────
  async saveSession() {
    if (!this.selectedStudent) return Toast.warning('No student selected');
    if (this._viewingSession)  return Toast.warning('You\'re viewing a past session. Click "New Assessment" first.');

    const scored = Object.values(this.currentSession).filter(s => s.score > 0);
    if (!scored.length) return Toast.warning('Rate at least one skill before saving.');

    const sessionNotes = document.getElementById('assessment-notes')?.value?.trim() || null;
    const now          = new Date().toISOString();
    const saveBtn      = document.getElementById('save-assessment-btn');

    if (saveBtn) { saveBtn.disabled = true; saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving…'; }

    // Build skill rows for DB.saveAssessmentSession
    const skillRows = scored.map(s => ({
      student_id:    this.selectedStudent.id,
      skill_key:     s.skill_key,
      skill_label:   s.skill_label || s.skill_key,
      category:      s.category    || 'general',
      score:         s.score,
      assessed_at:   now,
      session_notes: sessionNotes,   // stored inside the JSON history entry
    }));

    // Pass the already-loaded DB rows so the DB layer can merge history without
    // an extra round-trip
    const { error } = await DB.saveAssessmentSession(skillRows, this._allSessions);

    if (error) {
      console.error('Save session error:', error);
      Toast.error('Failed to save: ' + (error.message || 'unknown error'));
      if (saveBtn) { saveBtn.disabled = false; saveBtn.innerHTML = '<i class="fas fa-save"></i> Save Assessment'; }
      return;
    }

    Toast.success(`Assessment saved! Session ${this._sessions.length + 1} recorded.`);

    // Reload sessions from DB
    await this._loadSessions(this.selectedStudent.id);

    // Refresh header + history without losing the form state
    const headerCard = document.getElementById('prog-header-card');
    if (headerCard) headerCard.innerHTML = this._headerHTML(this.selectedStudent);

    const histBody = document.getElementById('prog-history-body');
    if (histBody) histBody.innerHTML = this._sessionsListHTML();

    const metaEl = document.getElementById('prog-history-meta');
    if (metaEl) metaEl.textContent = `${this._sessions.length} session${this._sessions.length !== 1 ? 's' : ''}`;

    // Reset form to blank for next session
    this.startNewSession();

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
