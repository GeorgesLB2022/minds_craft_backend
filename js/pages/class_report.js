/* ============================================================
   MINDS' CRAFT — CLASS REPORT PAGE
   Shows student repartition per course / level with:
     • Schedule Slot (session the student is enrolled in)
     • Start Date & End Date per enrollment
     • Attendance count scoped to [start_date … end_date|today]
     • Assessment link (→ ProgressPage for that student)
     • Notes
   + PDF / Print export
   ============================================================ */

const ClassReportPage = {

  // ── State ─────────────────────────────────────────────────
  _courses:    [],
  _levels:     [],       // all levels across all courses
  _reportData: [],       // built report rows
  _filterCourseId: '',
  _filterLevelId:  '',

  // ── Entry point ───────────────────────────────────────────
  async render() {
    const container = document.getElementById('page-container');
    container.innerHTML = `
      <div class="page-header" id="cr-page-header">
        <div class="page-header-left">
          <h2><i class="fas fa-file-alt" style="margin-right:8px;color:var(--brand-primary)"></i>Class Report</h2>
          <p>Student repartition per course &amp; level — attendance, assessments, notes.</p>
        </div>
        <div class="page-header-actions" id="cr-header-actions">
          <button class="btn btn-secondary" onclick="ClassReportPage.refreshReport()">
            <i class="fas fa-sync-alt"></i> Refresh
          </button>
          <button class="btn btn-primary" onclick="ClassReportPage.printReport()">
            <i class="fas fa-print"></i> Print / Save PDF
          </button>
        </div>
      </div>

      <!-- Filters -->
      <div class="card" id="cr-filters" style="margin-bottom:1.2rem;padding:1rem 1.2rem">
        <div style="display:flex;flex-wrap:wrap;gap:12px;align-items:flex-end">
          <div style="flex:1;min-width:180px">
            <label class="form-label" style="font-size:var(--font-size-xs);margin-bottom:4px">Course</label>
            <select id="cr-course-select" class="form-select"
              onchange="ClassReportPage._onCourseChange(this.value)">
              <option value="">— All Courses —</option>
            </select>
          </div>
          <div style="flex:1;min-width:180px">
            <label class="form-label" style="font-size:var(--font-size-xs);margin-bottom:4px">Level</label>
            <select id="cr-level-select" class="form-select"
              onchange="ClassReportPage._onLevelChange(this.value)">
              <option value="">— All Levels —</option>
            </select>
          </div>
          <div>
            <button class="btn btn-ghost btn-sm" onclick="ClassReportPage._clearFilters()">
              <i class="fas fa-times"></i> Clear
            </button>
          </div>
        </div>
      </div>

      <!-- Report area -->
      <div id="cr-report-area">
        <div class="page-loading"><i class="fas fa-spinner fa-spin"></i><p>Loading report…</p></div>
      </div>
    `;

    await this._loadBaseData();
    await this._buildAndRender();
  },

  // ── Load courses + all levels ─────────────────────────────
  async _loadBaseData() {
    const [{ data: courses }, { data: allEnrollments }] = await Promise.all([
      DB.getCourses(),
      // Get all levels with their course info via enrollments is complex —
      // we'll get levels per course lazily. For now just load courses.
      Promise.resolve({ data: [] }),
    ]);

    this._courses = (courses || []).filter(c => c.status !== 'archived');

    // Populate course selector
    const cSel = document.getElementById('cr-course-select');
    if (cSel) {
      this._courses.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c.id;
        opt.textContent = c.name;
        cSel.appendChild(opt);
      });
      if (this._filterCourseId) cSel.value = this._filterCourseId;
    }

    // Load all levels for all courses at once
    const levelResults = await Promise.all(
      this._courses.map(c => DB.getLevels(c.id))
    );
    this._levels = [];
    levelResults.forEach((res, i) => {
      (res.data || []).forEach(lv => {
        this._levels.push({ ...lv, _courseName: this._courses[i].name, _courseId: this._courses[i].id });
      });
    });

    this._populateLevelSelector(this._filterCourseId);
  },

  // ── Populate the level dropdown filtered by course ────────
  _populateLevelSelector(courseId) {
    const lSel = document.getElementById('cr-level-select');
    if (!lSel) return;
    lSel.innerHTML = '<option value="">— All Levels —</option>';
    const levels = courseId
      ? this._levels.filter(l => l._courseId === courseId)
      : this._levels;
    levels.forEach(l => {
      const opt = document.createElement('option');
      opt.value = l.id;
      opt.textContent = courseId ? l.name : `${l._courseName} › ${l.name}`;
      lSel.appendChild(opt);
    });
    if (this._filterLevelId) lSel.value = this._filterLevelId;
  },

  // ── Filter change handlers ────────────────────────────────
  _onCourseChange(val) {
    this._filterCourseId = val;
    this._filterLevelId  = '';
    this._populateLevelSelector(val);
    this._buildAndRender();
  },

  _onLevelChange(val) {
    this._filterLevelId = val;
    this._buildAndRender();
  },

  _clearFilters() {
    this._filterCourseId = '';
    this._filterLevelId  = '';
    const cSel = document.getElementById('cr-course-select');
    const lSel = document.getElementById('cr-level-select');
    if (cSel) cSel.value = '';
    this._populateLevelSelector('');
    if (lSel) lSel.value = '';
    this._buildAndRender();
  },

  async refreshReport() {
    const area = document.getElementById('cr-report-area');
    if (area) area.innerHTML = '<div class="page-loading"><i class="fas fa-spinner fa-spin"></i><p>Refreshing…</p></div>';
    await this._loadBaseData();
    await this._buildAndRender();
  },

  // ── Build data + render ───────────────────────────────────
  async _buildAndRender() {
    const area = document.getElementById('cr-report-area');
    if (area) area.innerHTML = '<div class="page-loading"><i class="fas fa-spinner fa-spin"></i><p>Loading enrollments…</p></div>';

    // Determine which levels to show
    let levelsToShow = this._levels;
    if (this._filterLevelId) {
      levelsToShow = levelsToShow.filter(l => l.id === this._filterLevelId);
    } else if (this._filterCourseId) {
      levelsToShow = levelsToShow.filter(l => l._courseId === this._filterCourseId);
    }

    if (!levelsToShow.length) {
      if (area) area.innerHTML = `
        <div class="empty-state">
          <i class="fas fa-folder-open"></i>
          <h3>No levels found</h3>
          <p>There are no levels matching the selected filters, or no courses have been set up yet.</p>
        </div>`;
      return;
    }

    // Load enrollments + attendance for each level in parallel
    const enrollmentResults = await Promise.all(
      levelsToShow.map(l => DB.getLevelEnrollments(l.id))
    );

    // Collect all student IDs to batch-load attendance
    const allEnrollments = [];
    levelsToShow.forEach((lv, idx) => {
      (enrollmentResults[idx].data || []).forEach(e => {
        allEnrollments.push({ ...e, _level: lv });
      });
    });

    // Load attendance for all enrollments (batch by level)
    // We use a per-level query scoped to start_date…end_date|today
    const today = Utils.localDateISO();
    const attendanceByLevel = {};

    await Promise.all(
      levelsToShow.map(async lv => {
        const { data: attRows } = await DB.getAll('attendance', {
          filter: { level_id: lv.id },
          select: 'student_id, date, status',
        });
        attendanceByLevel[lv.id] = attRows || [];
      })
    );

    // Build per-enrollment attendance counts (scoped to start→end|today, status present/late)
    const getAttCount = (enrollment, levelId) => {
      const rows = attendanceByLevel[levelId] || [];
      const start = enrollment.start_date ? enrollment.start_date.slice(0, 10) : null;
      const end   = enrollment.end_date   ? enrollment.end_date.slice(0, 10)   : today;
      return rows.filter(r => {
        if (r.student_id !== enrollment.student_id) return false;
        if (r.status !== 'present' && r.status !== 'late') return false;
        if (start && r.date < start) return false;
        if (r.date > end) return false;
        return true;
      }).length;
    };

    // Load assessments summary — we need to know which students HAVE an assessment per level
    // We'll store assessment existence as a simple flag: check if assessments table has
    // any row for (student_id) — we load all assessments grouped by student
    // For performance, we do one query per level with the enrolled student IDs
    const assessedStudentsByLevel = {};
    await Promise.all(
      levelsToShow.map(async lv => {
        const enrolledIds = (enrollmentResults[levelsToShow.indexOf(lv)].data || [])
          .map(e => e.student_id)
          .filter(Boolean);
        if (!enrolledIds.length) { assessedStudentsByLevel[lv.id] = new Set(); return; }

        const { data: assessRows } = await DB.getAll('assessments', {
          select: 'student_id, notes',
          in: { student_id: enrolledIds },
        });

        // A student "has an assessment for this level" if any assessment row
        // has notes.level_id === lv.id  OR  notes.level === lv.name (legacy)
        const assessed = new Set();
        (assessRows || []).forEach(row => {
          let n = row.notes;
          if (typeof n === 'string') { try { n = JSON.parse(n); } catch(e) { n = {}; } }
          const nObj = n || {};
          if (nObj.level_id === lv.id || nObj.level_name === lv.name) {
            assessed.add(row.student_id);
          }
        });
        assessedStudentsByLevel[lv.id] = assessed;
      })
    );

    // ── Group data by course → level ──────────────────────────
    // courseId → { courseName, levels: [ { level, enrollments: [...] } ] }
    const grouped = {};
    levelsToShow.forEach((lv, idx) => {
      const cid = lv._courseId;
      if (!grouped[cid]) grouped[cid] = { courseName: lv._courseName, levels: [] };
      const enrolls = (enrollmentResults[idx].data || []).map(e => ({
        ...e,
        _attCount:   getAttCount(e, lv.id),
        _hasAssessment: (assessedStudentsByLevel[lv.id] || new Set()).has(e.student_id),
      }));
      grouped[cid].levels.push({ level: lv, enrollments: enrolls });
    });

    this._renderReport(grouped, today);
  },

  // ── Render the full report HTML ───────────────────────────
  _renderReport(grouped, today) {
    const area = document.getElementById('cr-report-area');
    if (!area) return;

    const courseIds = Object.keys(grouped);
    if (!courseIds.length) {
      area.innerHTML = `<div class="empty-state"><i class="fas fa-folder-open"></i><h3>No data</h3><p>No enrollments found for the selected filters.</p></div>`;
      return;
    }

    let html = '';

    courseIds.forEach(cid => {
      const { courseName, levels } = grouped[cid];
      const totalStudents = levels.reduce((s, l) => s + l.enrollments.length, 0);

      html += `
        <div class="cr-course-block" style="margin-bottom:2rem">
          <!-- Course Header -->
          <div class="cr-course-header" style="
            display:flex;align-items:center;justify-content:space-between;
            padding:.7rem 1rem;
            background:var(--brand-primary);
            color:#fff;
            border-radius:var(--radius-md) var(--radius-md) 0 0;
            margin-bottom:0">
            <div style="display:flex;align-items:center;gap:10px">
              <i class="fas fa-graduation-cap"></i>
              <strong style="font-size:var(--font-size-lg)">${Utils.esc(courseName)}</strong>
            </div>
            <span style="font-size:var(--font-size-sm);opacity:.85">
              ${levels.length} level${levels.length !== 1 ? 's' : ''} &nbsp;·&nbsp; ${totalStudents} student${totalStudents !== 1 ? 's' : ''} total
            </span>
          </div>

          <div style="border:1px solid var(--border-color);border-top:none;border-radius:0 0 var(--radius-md) var(--radius-md);overflow:hidden">
      `;

      levels.forEach(({ level, enrollments }, li) => {
        const isLast = li === levels.length - 1;
        const activeCount    = enrollments.filter(e => e.status === 'active').length;
        const completedCount = enrollments.filter(e => e.status === 'completed').length;

        html += `
          <div class="cr-level-block" style="${li > 0 ? 'border-top:1px solid var(--border-color)' : ''}">
            <!-- Level sub-header -->
            <div style="
              display:flex;align-items:center;justify-content:space-between;
              padding:.5rem 1rem;
              background:var(--bg-tertiary);
              border-bottom:1px solid var(--border-color)">
              <div style="display:flex;align-items:center;gap:8px">
                <i class="fas fa-layer-group" style="color:var(--brand-primary);font-size:.75rem"></i>
                <span style="font-weight:600;font-size:var(--font-size-sm)">${Utils.esc(level.name)}</span>
              </div>
              <div style="display:flex;gap:8px;align-items:center;font-size:var(--font-size-xs);color:var(--text-muted)">
                <span><i class="fas fa-user-check" style="color:#22c55e"></i> ${activeCount} active</span>
                ${completedCount ? `<span><i class="fas fa-flag-checkered" style="color:#3b82f6"></i> ${completedCount} completed</span>` : ''}
                <span><i class="fas fa-users"></i> ${enrollments.length} enrolled</span>
              </div>
            </div>
        `;

        if (!enrollments.length) {
          html += `
            <div style="padding:1rem 1.2rem;font-size:var(--font-size-sm);color:var(--text-muted);font-style:italic">
              No students enrolled in this level.
            </div>
          `;
        } else {
          html += `
            <div style="overflow-x:auto">
              <table class="data-table" style="min-width:900px;font-size:var(--font-size-xs)">
                <thead>
                  <tr>
                    <th style="min-width:160px">Student</th>
                    <th style="min-width:100px">Status</th>
                    <th style="min-width:130px">Schedule Slot</th>
                    <th style="min-width:105px">Start Date</th>
                    <th style="min-width:105px">End Date</th>
                    <th style="min-width:90px;text-align:center">Attendance</th>
                    <th style="min-width:80px;text-align:center">Assessment</th>
                    <th style="min-width:160px">Notes</th>
                  </tr>
                </thead>
                <tbody>
          `;

          // Sort: active first, then by name
          const sorted = [...enrollments].sort((a, b) => {
            if (a.status === 'active' && b.status !== 'active') return -1;
            if (b.status === 'active' && a.status !== 'active') return 1;
            const na = (a.student?.full_name || '').toLowerCase();
            const nb = (b.student?.full_name || '').toLowerCase();
            return na.localeCompare(nb);
          });

          sorted.forEach(e => {
            const student   = e.student || {};
            const name      = Utils.esc(student.full_name || '—');
            const startDate = e.start_date ? e.start_date.slice(0, 10) : (e.enrolled_at ? e.enrolled_at.slice(0, 10) : '—');
            const endDate   = e.end_date   ? e.end_date.slice(0, 10)   : '—';
            const attCount    = e._attCount;
            const hasAssmt    = e._hasAssessment;
            const notes       = Utils.esc(e.notes || '');
            const isCompleted = e.status === 'completed';

            // Schedule slot — format nicely if present
            const rawSlot = e.schedule_slot || '';
            const slotDisplay = rawSlot
              ? Utils.esc(rawSlot)
              : '—';
            const slotCell = rawSlot
              ? `<span style="
                  display:inline-flex;align-items:center;gap:5px;
                  background:rgba(99,102,241,.1);color:#818cf8;
                  border:1px solid rgba(99,102,241,.25);
                  border-radius:20px;padding:2px 8px;
                  font-size:10px;font-weight:600;white-space:nowrap">
                  <i class="fas fa-clock" style="font-size:9px"></i>${slotDisplay}
                </span>`
              : `<span style="color:var(--text-muted);font-style:italic;font-size:10px">—</span>`;

            // Status badge
            const statusColors = {
              active:    { bg: 'rgba(34,197,94,.12)',    color: '#22c55e' },
              completed: { bg: 'rgba(59,130,246,.12)',   color: '#3b82f6' },
              inactive:  { bg: 'rgba(148,163,184,.12)',  color: '#94a3b8' },
              dropped:   { bg: 'rgba(239,68,68,.12)',    color: '#ef4444' },
            };
            const sc = statusColors[e.status] || statusColors.inactive;
            const statusBadge = `<span style="display:inline-block;padding:2px 8px;border-radius:20px;font-size:10px;font-weight:600;background:${sc.bg};color:${sc.color}">${e.status}</span>`;

            // Avatar
            const initials = (student.full_name || '?').split(' ').map(w => w[0]).join('').slice(0,2).toUpperCase();
            const avatarColor = student.avatar_color || 'var(--brand-primary)';

            // Attendance indicator
            const attBadge = attCount > 0
              ? `<span style="display:inline-flex;align-items:center;gap:4px;font-weight:600;color:var(--text-primary)">
                   <i class="fas fa-clipboard-check" style="color:#22c55e;font-size:10px"></i>${attCount}
                 </span>`
              : `<span style="color:var(--text-muted);font-style:italic">0</span>`;

            // Assessment link — green if done, grey if not yet
            const assmtCell = `
              <button class="btn btn-icon btn-sm"
                title="${hasAssmt ? '✅ Assessment done for this level — click to view/add' : 'No assessment yet — click to assess'}"
                style="${hasAssmt
                  ? 'background:rgba(34,197,94,.15);color:#22c55e;border:1px solid rgba(34,197,94,.35)'
                  : 'background:var(--bg-tertiary);color:var(--text-muted);border:1px solid var(--border-color);opacity:.6'}"
                onclick="ClassReportPage.goToAssessment('${e.student_id}')">
                <i class="fas fa-chart-bar"></i>
                ${hasAssmt ? '<i class="fas fa-check" style="font-size:8px;margin-left:2px;color:#22c55e"></i>' : ''}
              </button>`;

            // Row highlight for completed students
            const rowStyle = isCompleted
              ? 'background:rgba(59,130,246,.04)'
              : '';

            html += `
              <tr style="${rowStyle}">
                <td>
                  <div style="display:flex;align-items:center;gap:8px">
                    <div style="
                      width:28px;height:28px;border-radius:50%;
                      background:${avatarColor};
                      display:flex;align-items:center;justify-content:center;
                      font-size:10px;font-weight:700;color:#fff;flex-shrink:0">
                      ${initials}
                    </div>
                    <span style="font-weight:500">${name}</span>
                  </div>
                </td>
                <td>${statusBadge}</td>
                <td>${slotCell}</td>
                <td style="color:var(--text-secondary)">${startDate}</td>
                <td style="color:${endDate !== '—' ? 'var(--text-secondary)' : 'var(--text-muted)'};font-style:${endDate === '—' ? 'italic' : 'normal'}">${endDate}</td>
                <td style="text-align:center">${attBadge}</td>
                <td style="text-align:center">${assmtCell}</td>
                <td style="color:var(--text-secondary);font-style:${notes ? 'normal' : 'italic'};color:${notes ? 'var(--text-primary)' : 'var(--text-muted)'}">${notes || '—'}</td>
              </tr>
            `;
          });

          html += `
                </tbody>
              </table>
            </div>
          `;
        }

        html += `</div>`; // .cr-level-block
      });

      html += `</div></div>`; // inner border + .cr-course-block
    });

    // Summary footer
    const totalCourses = courseIds.length;
    const totalLevels  = courseIds.reduce((s, cid) => s + grouped[cid].levels.length, 0);
    const totalEnrolls = courseIds.reduce((s, cid) =>
      s + grouped[cid].levels.reduce((ss, l) => ss + l.enrollments.length, 0), 0);
    const totalActive  = courseIds.reduce((s, cid) =>
      s + grouped[cid].levels.reduce((ss, l) => ss + l.enrollments.filter(e => e.status === 'active').length, 0), 0);

    html += `
      <div class="cr-summary-footer" style="
        margin-top:1rem;padding:.8rem 1.2rem;
        background:var(--bg-tertiary);border:1px solid var(--border-color);
        border-radius:var(--radius-md);
        display:flex;flex-wrap:wrap;gap:16px;align-items:center;
        font-size:var(--font-size-xs);color:var(--text-muted)">
        <span><i class="fas fa-graduation-cap" style="margin-right:4px;color:var(--brand-primary)"></i><strong>${totalCourses}</strong> course${totalCourses !== 1 ? 's' : ''}</span>
        <span><i class="fas fa-layer-group" style="margin-right:4px;color:var(--brand-primary)"></i><strong>${totalLevels}</strong> level${totalLevels !== 1 ? 's' : ''}</span>
        <span><i class="fas fa-users" style="margin-right:4px;color:var(--brand-primary)"></i><strong>${totalEnrolls}</strong> enrollment${totalEnrolls !== 1 ? 's' : ''}</span>
        <span><i class="fas fa-user-check" style="margin-right:4px;color:#22c55e"></i><strong>${totalActive}</strong> active</span>
        <span style="margin-left:auto;font-style:italic">Report generated: ${new Date().toLocaleString()}</span>
      </div>
    `;

    area.innerHTML = html;
  },

  // ── Navigate to assessment page for a student ─────────────
  goToAssessment(studentId) {
    if (typeof App !== 'undefined') {
      App.navigate('progress');
      setTimeout(() => {
        if (typeof ProgressPage !== 'undefined') {
          ProgressPage.selectStudent(studentId);
        }
      }, 450);
    }
  },

  // ── Print / PDF export ────────────────────────────────────
  printReport() {
    // Add print-specific styles temporarily and trigger the print dialog.
    // The CSS already handles print styles via @media print in the main stylesheet.
    // We just call window.print().
    window.print();
  },
};

/* ─────────────────────────────────────────────────────────────
   PRINT STYLES  (injected once at script load)
───────────────────────────────────────────────────────────── */
(function _injectPrintStyles() {
  if (document.getElementById('cr-print-styles')) return;
  const style = document.createElement('style');
  style.id = 'cr-print-styles';
  style.textContent = `
    @media print {
      /* Hide everything except the report */
      body > * { display: none !important; }
      #app { display: block !important; }
      .sidebar, .topbar, #sidebar-overlay,
      #cr-filters, #cr-page-header,
      #cr-header-actions,
      .btn, button { display: none !important; }

      /* Show main content */
      .main-content { margin: 0 !important; padding: 0 !important; width: 100% !important; }
      .page-container { padding: 0 !important; }
      #cr-report-area { display: block !important; }

      /* Page setup */
      @page { margin: 1.5cm; size: A4 landscape; }

      /* Typography adjustments */
      body { font-size: 10px !important; color: #000 !important; background: #fff !important; }
      .cr-course-header { background: #1e3a5f !important; color: #fff !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .data-table th { background: #f1f5f9 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .data-table tr:nth-child(even) { background: #fafafa !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }

      /* Force table borders in print */
      .data-table, .data-table th, .data-table td { border: 1px solid #ccc !important; }

      /* Avoid page breaks inside a level block */
      .cr-level-block { page-break-inside: avoid; }
      .cr-course-block { page-break-inside: avoid; margin-bottom: 1cm !important; }

      /* Summary footer */
      .cr-summary-footer { border: 1px solid #ccc !important; background: #f8fafc !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }

      /* Remove box-shadows */
      * { box-shadow: none !important; }

      /* Print title */
      #app::before {
        content: "Class Report — Minds\\' Craft";
        display: block;
        font-size: 16px;
        font-weight: 700;
        margin-bottom: 12px;
        color: #1e3a5f;
      }
    }
  `;
  document.head.appendChild(style);
})();
