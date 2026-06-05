/* ============================================================
   MINDS' CRAFT — COMPLETED STUDENTS REGISTRY
   Reads from the permanent `level_completions` table (M17).
   This table is an immutable archive: one row per completion
   event. History is preserved even if a student is later
   removed from a level and re-enrolled.

   Columns: Student · Course · Level · Schedule Slot ·
            Start Date · Completed On · Attendance · Notes
   Actions: Revert to Active (delete completion + re-enroll) ·
            Delete record permanently
   ============================================================ */

const CompletedStudentsPage = {

  _rows:         [],   // raw level_completions rows
  _filterSearch: '',
  _filterCourse: '',

  // ── Entry point ───────────────────────────────────────────
  async render() {
    const container = document.getElementById('page-container');
    container.innerHTML = `
      <div class="page-header">
        <div class="page-header-left">
          <h2>
            <i class="fas fa-flag-checkered" style="margin-right:8px;color:var(--brand-primary)"></i>
            Completed Students
          </h2>
          <p>Permanent archive of all level completions — history is preserved regardless of re-enrollment.</p>
        </div>
        <div class="page-header-actions">
          <button class="btn btn-secondary" onclick="CompletedStudentsPage.refresh()">
            <i class="fas fa-sync-alt"></i> Refresh
          </button>
          <button class="btn btn-primary" onclick="CompletedStudentsPage.printReport()">
            <i class="fas fa-print"></i> Print / PDF
          </button>
        </div>
      </div>

      <!-- Filters -->
      <div class="card" style="padding:.8rem 1.2rem;margin-bottom:1rem">
        <div style="display:flex;flex-wrap:wrap;gap:10px;align-items:center">
          <div style="flex:2;min-width:200px">
            <input type="text" id="cs-search" class="form-input"
              placeholder="🔍  Search by student, level or course…"
              oninput="CompletedStudentsPage._onSearch(this.value)"
              style="height:36px" />
          </div>
          <div style="flex:1;min-width:160px">
            <select id="cs-course-filter" class="form-select" style="height:36px"
              onchange="CompletedStudentsPage._onCourseFilter(this.value)">
              <option value="">— All Courses —</option>
            </select>
          </div>
          <button class="btn btn-ghost btn-sm" onclick="CompletedStudentsPage._clearFilters()">
            <i class="fas fa-times"></i> Clear
          </button>
        </div>
      </div>

      <!-- Table area -->
      <div id="cs-table-area">
        <div class="page-loading"><i class="fas fa-spinner fa-spin"></i><p>Loading…</p></div>
      </div>
    `;

    await this._loadAndRender();
  },

  // ── Load all rows from level_completions ──────────────────
  async _loadAndRender() {
    const area = document.getElementById('cs-table-area');

    const { data, error } = await DB.getLevelCompletions();

    if (error) {
      if (area) area.innerHTML = `<div class="alert alert-error">Failed to load data: ${Utils.esc(error.message)}</div>`;
      return;
    }

    this._rows = data || [];

    // Populate course filter dropdown
    const courses = {};
    this._rows.forEach(r => {
      if (r.course?.id) courses[r.course.id] = r.course.name;
    });
    const cSel = document.getElementById('cs-course-filter');
    if (cSel) {
      cSel.innerHTML = '<option value="">— All Courses —</option>';
      Object.entries(courses).sort((a, b) => a[1].localeCompare(b[1])).forEach(([id, name]) => {
        const opt = document.createElement('option');
        opt.value = id;
        opt.textContent = name;
        if (id === this._filterCourse) opt.selected = true;
        cSel.appendChild(opt);
      });
    }

    // Restore search input
    const searchEl = document.getElementById('cs-search');
    if (searchEl && this._filterSearch) searchEl.value = this._filterSearch;

    this._renderTable(this._rows);
  },

  // ── Apply filters and render table ───────────────────────
  _renderTable(rows) {
    const area = document.getElementById('cs-table-area');
    if (!area) return;

    if (!rows.length) {
      area.innerHTML = `
        <div class="empty-state">
          <i class="fas fa-flag-checkered" style="font-size:2.5rem;color:var(--text-muted)"></i>
          <h3>No completed students yet</h3>
          <p>When you click <strong>Done</strong> on a student in a course level, their record is archived here.</p>
        </div>`;
      return;
    }

    // Apply search + course filter
    const q   = this._filterSearch.toLowerCase().trim();
    const cid = this._filterCourse;
    const filtered = rows.filter(r => {
      if (cid && r.course?.id !== cid) return false;
      if (q) {
        const name   = (r.student?.full_name || '').toLowerCase();
        const level  = (r.level?.name       || '').toLowerCase();
        const course = (r.course?.name      || '').toLowerCase();
        if (!name.includes(q) && !level.includes(q) && !course.includes(q)) return false;
      }
      return true;
    });

    if (!filtered.length) {
      area.innerHTML = `<div class="empty-state"><i class="fas fa-search"></i><h3>No results</h3><p>Try adjusting your filters.</p></div>`;
      return;
    }

    // Sort: end_date desc, then student name
    filtered.sort((a, b) => {
      const ea = a.end_date || '';
      const eb = b.end_date || '';
      if (ea !== eb) return eb.localeCompare(ea);
      return (a.student?.full_name || '').localeCompare(b.student?.full_name || '');
    });

    let html = `
      <div style="margin-bottom:.6rem;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px">
        <span style="font-size:var(--font-size-xs);color:var(--text-muted)">
          <i class="fas fa-list" style="margin-right:4px"></i>
          ${filtered.length} completion${filtered.length !== 1 ? 's' : ''}
          ${filtered.length < this._rows.length ? ` <span style="color:var(--text-muted)">(${this._rows.length} total)</span>` : ''}
        </span>
      </div>
      <div class="card" style="padding:0;overflow:hidden">
        <div style="overflow-x:auto">
          <table class="data-table" style="min-width:920px">
            <thead>
              <tr>
                <th style="min-width:170px">Student</th>
                <th style="min-width:120px">Course</th>
                <th style="min-width:110px">Level</th>
                <th style="min-width:120px">Schedule Slot</th>
                <th style="min-width:100px">Start Date</th>
                <th style="min-width:110px">Completed On</th>
                <th style="min-width:65px;text-align:center">Att.</th>
                <th style="min-width:160px">Notes</th>
                <th style="min-width:140px;text-align:right">Actions</th>
              </tr>
            </thead>
            <tbody>
    `;

    filtered.forEach(r => {
      const student = r.student || {};
      const level   = r.level   || {};
      const course  = r.course  || {};
      const avatarColor = student.avatar_color || Utils.avatarColor(student.full_name);
      const initials    = Utils.initials(student.full_name || '?');
      const name        = Utils.esc(student.full_name || '—');
      const startDate   = r.start_date ? r.start_date.slice(0, 10) : '—';
      const endDate     = r.end_date   ? r.end_date.slice(0, 10)   : '—';
      const att         = r.attendance_count ?? 0;
      const safeId      = r.id;
      const enrId       = r.enrollment_id || '';

      // Slot badge
      const slotBadge = r.schedule_slot
        ? `<span style="display:inline-flex;align-items:center;gap:4px;
            background:rgba(99,102,241,.1);color:#818cf8;
            border:1px solid rgba(99,102,241,.25);
            border-radius:20px;padding:2px 8px;font-size:10px;font-weight:600">
            <i class="fas fa-clock" style="font-size:9px"></i>${Utils.esc(r.schedule_slot)}
          </span>`
        : `<span style="color:var(--text-muted);font-style:italic;font-size:10px">—</span>`;

      html += `
        <tr id="cs-row-${safeId}">
          <td>
            <div style="display:flex;align-items:center;gap:8px">
              <div style="width:30px;height:30px;border-radius:50%;
                background:${avatarColor};display:flex;align-items:center;
                justify-content:center;font-size:11px;font-weight:700;
                color:#fff;flex-shrink:0">${initials}</div>
              <div>
                <div style="font-weight:600;font-size:var(--font-size-sm)">${name}</div>
                ${student.phone ? `<div style="font-size:10px;color:var(--text-muted)">${Utils.esc(student.phone)}</div>` : ''}
              </div>
            </div>
          </td>
          <td style="font-size:var(--font-size-xs);color:var(--text-secondary)">${Utils.esc(course.name || '—')}</td>
          <td>
            <span style="font-size:var(--font-size-xs);font-weight:600;
              background:rgba(34,197,94,.1);color:#22c55e;
              padding:2px 8px;border-radius:20px;border:1px solid rgba(34,197,94,.25)">
              ${Utils.esc(level.name || '—')}
            </span>
          </td>
          <td>${slotBadge}</td>
          <td style="font-size:var(--font-size-xs);color:var(--text-secondary)">${startDate}</td>
          <td>
            <span style="font-size:var(--font-size-xs);font-weight:600;
              background:rgba(59,130,246,.1);color:#3b82f6;
              padding:2px 8px;border-radius:20px;border:1px solid rgba(59,130,246,.25)">
              <i class="fas fa-check-circle" style="font-size:9px;margin-right:3px"></i>${endDate}
            </span>
          </td>
          <td style="text-align:center">
            <span style="display:inline-flex;align-items:center;gap:3px;
              font-size:11px;font-weight:600;
              color:${att > 0 ? 'var(--text-primary)' : 'var(--text-muted)'}">
              <i class="fas fa-clipboard-check" style="font-size:9px;color:${att > 0 ? '#22c55e' : 'var(--text-muted)'}"></i>
              ${att}
            </span>
          </td>
          <td>
            <input type="text"
              value="${Utils.esc(r.notes || '')}"
              placeholder="Notes…"
              style="font-size:11px;padding:2px 5px;border:1px solid var(--border-color);
                border-radius:var(--radius-sm);background:var(--bg-card);
                color:var(--text-primary);width:100%;min-width:120px"
              onblur="CompletedStudentsPage.saveNotes('${safeId}', this.value)"
              onkeydown="if(event.key==='Enter'){this.blur()}" />
          </td>
          <td style="text-align:right;white-space:nowrap">
            <button class="btn btn-secondary btn-sm"
              title="Revert — remove completion and re-enroll as Active"
              style="font-size:11px"
              data-completion-id="${safeId}"
              data-student-id="${r.student_id}"
              data-level-id="${r.level_id}"
              data-slot="${Utils.esc(r.schedule_slot || '')}"
              data-notes="${Utils.esc(r.notes || '')}"
              data-name="${Utils.esc(student.full_name || '—')}"
              onclick="CompletedStudentsPage.revertToActive(this)">
              <i class="fas fa-undo"></i> Revert
            </button>
            <button class="btn btn-danger btn-icon btn-sm"
              title="Delete completion record permanently"
              data-completion-id="${safeId}"
              data-name="${Utils.esc(student.full_name || '—')}"
              onclick="CompletedStudentsPage.deleteRecord(this)">
              <i class="fas fa-trash"></i>
            </button>
          </td>
        </tr>
      `;
    });

    html += `
            </tbody>
          </table>
        </div>
      </div>
      <div style="margin-top:.6rem;font-size:var(--font-size-xs);color:var(--text-muted);text-align:right;font-style:italic">
        Archive — ${filtered.length} record${filtered.length !== 1 ? 's' : ''} — generated: ${new Date().toLocaleString()}
      </div>
    `;
    area.innerHTML = html;
  },

  // ── Filter handlers ───────────────────────────────────────
  _onSearch(val) {
    this._filterSearch = val;
    this._renderTable(this._rows);
  },
  _onCourseFilter(val) {
    this._filterCourse = val;
    this._renderTable(this._rows);
  },
  _clearFilters() {
    this._filterSearch = '';
    this._filterCourse = '';
    const s = document.getElementById('cs-search');
    const c = document.getElementById('cs-course-filter');
    if (s) s.value = '';
    if (c) c.value = '';
    this._renderTable(this._rows);
  },

  async refresh() {
    this._filterSearch = '';
    this._filterCourse = '';
    await this.render();
  },

  // ── Actions ───────────────────────────────────────────────

  async saveNotes(completionId, value) {
    const { error } = await DB.updateLevelCompletion(completionId, { notes: value || null });
    if (error) Toast.error('Failed to save notes');
    // silent — no toast on blur to avoid spam
  },

  /**
   * Revert a completion:
   *  1. Delete the level_completions row
   *  2. Re-enroll the student in the same level as "active"
   *  btn — the clicked <button> element (data-* attributes carry the payload)
   */
  async revertToActive(btn) {
    const completionId = btn.dataset.completionId;
    const studentId    = btn.dataset.studentId;
    const levelId      = btn.dataset.levelId;
    const slot         = btn.dataset.slot   || null;
    const notes        = btn.dataset.notes  || null;
    const studentName  = btn.dataset.name   || 'this student';

    if (!confirm(`Revert completion for ${studentName}?\nThis will delete the completion record and re-enroll them as Active.`)) return;

    // 1. Delete the completion record
    const { error: delErr } = await DB.deleteLevelCompletion(completionId);
    if (delErr) { Toast.error('Failed to delete completion: ' + delErr.message); return; }

    // 2. Re-enroll as active (new start date = today)
    const { error: enrErr } = await DB.enrollStudent(
      studentId, levelId, 'active',
      slot || null,
      Utils.localDateISO(),
      null,
      notes || null
    );
    if (enrErr) {
      Toast.warning('Completion removed but re-enrollment failed: ' + enrErr.message);
    } else {
      Toast.success(`${studentName} reverted to Active ↩`);
    }

    // Remove row from local cache and re-render without full reload
    this._rows = this._rows.filter(r => r.id !== completionId);
    this._renderTable(this._rows);
  },

  /** Permanently delete a completion record — no re-enrollment */
  async deleteRecord(btn) {
    const completionId = btn.dataset.completionId;
    const studentName  = btn.dataset.name || 'this student';

    if (!confirm(`Permanently delete the completion record for ${studentName}?\nThis cannot be undone.`)) return;
    const { error } = await DB.deleteLevelCompletion(completionId);
    if (error) { Toast.error(error.message || 'Failed to delete'); return; }
    Toast.success('Completion record deleted');
    this._rows = this._rows.filter(r => r.id !== completionId);
    this._renderTable(this._rows);
  },

  // ── Print ─────────────────────────────────────────────────
  printReport() { window.print(); },
};

/* ── Print styles ── */
(function _injectCSPrintStyles() {
  if (document.getElementById('cs-print-styles')) return;
  const s = document.createElement('style');
  s.id = 'cs-print-styles';
  s.textContent = `
    @media print {
      body > * { display: none !important; }
      #app { display: block !important; }
      .sidebar, .topbar, #sidebar-overlay, .page-header .page-header-actions,
      .btn, button, input[type="text"] { display: none !important; }
      .main-content { margin:0 !important; width:100% !important; }
      .page-container { padding:0 !important; }
      @page { margin:1.5cm; size:A4 landscape; }
      body { font-size:10px !important; color:#000 !important; background:#fff !important; }
      .data-table, .data-table th, .data-table td { border:1px solid #ccc !important; }
      * { box-shadow:none !important; }
    }
  `;
  document.head.appendChild(s);
})();
