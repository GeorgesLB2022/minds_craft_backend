/* ============================================================
   MINDS' CRAFT — COURSES PAGE
   ============================================================ */

const CoursesPage = {
  courses: [],
  currentCourse: null,
  _trainers: [],
  _levels: [],           // cached levels for the current curriculum view
  _expandedLevel: null,  // which level's student panel is open

  async render() {
    const container = document.getElementById('page-container');
    container.innerHTML = `
      <div class="page-header">
        <div class="page-header-left">
          <h2>Course Management</h2>
          <p>Manage courses, curriculum levels, and student enrollments.</p>
        </div>
        <div class="page-header-actions">
          <button class="btn btn-secondary" onclick="CoursesPage.renderList()">
            <i class="fas fa-list"></i> All Courses
          </button>
          <button class="btn btn-primary" onclick="CoursesPage.openCreateCourse()">
            <i class="fas fa-plus"></i> Create New Course
          </button>
        </div>
      </div>
      <div id="courses-content">
        <div class="page-loading"><i class="fas fa-spinner fa-spin"></i></div>
      </div>
    `;
    await this.loadCourses();
  },

  async loadCourses() {
    const { data, error } = await DB.getCourses();
    if (error) { Toast.error('Failed to load courses'); return; }
    this.courses = data || [];
    this.renderList();
  },

  renderList() {
    const el = document.getElementById('courses-content');
    if (!el) return;
    if (!this.courses.length) {
      el.innerHTML = `<div class="empty-state"><i class="fas fa-graduation-cap"></i><h3>No courses yet</h3><p>Create your first course to get started.</p><button class="btn btn-primary mt-3" onclick="CoursesPage.openCreateCourse()"><i class="fas fa-plus"></i> Create Course</button></div>`;
      return;
    }
    el.innerHTML = `<div class="courses-grid">${this.courses.map(c => this.courseCardHTML(c)).join('')}</div>`;
  },

  courseCardHTML(course) {
    return `
      <div class="course-card">
        <div class="course-card-img" style="${course.image_url ? `background:url('${Utils.esc(course.image_url)}') center/cover` : ''}">
          ${!course.image_url ? '<i class="fas fa-robot"></i>' : ''}
        </div>
        <div class="course-card-body">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px">
            <h3 style="font-size:var(--font-size-lg);font-weight:700">${Utils.esc(course.name)}</h3>
            ${Utils.statusBadge(course.status)}
          </div>
          <p style="font-size:var(--font-size-sm);color:var(--text-muted);margin-top:6px;line-height:1.5">${Utils.esc(course.description || 'No description')}</p>
          <div class="course-card-meta">
            <span class="course-meta-item"><i class="fas fa-user-graduate"></i> Ages ${course.min_age}–${course.max_age}</span>
          </div>
        </div>
        <div class="course-card-footer">
          <button class="btn btn-primary btn-sm" onclick="CoursesPage.manageCurriculum('${course.id}')">
            <i class="fas fa-layer-group"></i> Manage Curriculum
          </button>
          <button class="btn btn-ghost btn-icon btn-sm" onclick="CoursesPage.openEditCourse('${course.id}')">
            <i class="fas fa-edit"></i>
          </button>
          <button class="btn btn-danger btn-icon btn-sm" onclick="CoursesPage.deleteCourse('${course.id}', '${Utils.esc(course.name)}')">
            <i class="fas fa-trash"></i>
          </button>
        </div>
      </div>
    `;
  },

  openCreateCourse() {
    Modal.open('Create New Course', this.courseFormHTML(null));
  },

  openEditCourse(id) {
    const course = this.courses.find(c => c.id === id);
    if (!course) return;
    Modal.open('Edit Course', this.courseFormHTML(course));
  },

  courseFormHTML(course) {
    const imgSrc = course?.image_url || '';
    return `
      <form onsubmit="CoursesPage.saveCourse(event, ${course ? `'${course.id}'` : 'null'})">
        <div class="form-group">
          <label class="form-label">Course Name *</label>
          <input type="text" name="name" class="form-input" required value="${Utils.esc(course?.name || '')}" placeholder="e.g. Robotics" />
        </div>
        <div class="form-group">
          <label class="form-label">Description</label>
          <textarea name="description" class="form-textarea" placeholder="Describe the course…">${Utils.esc(course?.description || '')}</textarea>
        </div>

        <!-- Image picker -->
        <div class="form-group">
          <label class="form-label">Course Image <span class="text-muted">(optional)</span></label>

          <!-- Preview -->
          <div id="course-img-preview-wrap" style="margin-bottom:.6rem;display:${imgSrc ? 'flex' : 'none'};align-items:center;gap:10px">
            <img id="course-img-preview" src="${Utils.esc(imgSrc)}" alt=""
              style="height:70px;max-width:160px;object-fit:cover;border-radius:var(--radius-md);
                     border:1px solid var(--border-color)" />
            <button type="button" class="btn btn-danger btn-sm" onclick="CoursesPage.clearImage()">
              <i class="fas fa-times"></i> Remove
            </button>
          </div>

          <!-- Upload button -->
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:.4rem">
            <label class="btn btn-secondary btn-sm" style="cursor:pointer;margin:0">
              <i class="fas fa-upload"></i> Upload from device
              <input type="file" id="course-img-file" accept="image/*" style="display:none"
                onchange="CoursesPage.handleImageFile(this)" />
            </label>
            <span style="font-size:var(--font-size-xs);color:var(--text-muted)">PNG, JPG, WebP — max 2 MB</span>
          </div>

          <!-- URL fallback -->
          <div style="display:flex;gap:8px">
            <input type="url" name="image_url" id="course-img-url" class="form-input"
              value="${Utils.esc(imgSrc)}" placeholder="… or paste an image URL"
              oninput="CoursesPage.onImageUrlInput(this.value)" />
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Min Age</label>
            <input type="number" name="min_age" class="form-input" value="${course?.min_age ?? 5}" min="1" max="18" />
          </div>
          <div class="form-group">
            <label class="form-label">Max Age</label>
            <input type="number" name="max_age" class="form-input" value="${course?.max_age ?? 18}" min="1" max="25" />
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Status</label>
          <select name="status" class="form-select">
            <option value="active" ${course?.status==='active'?'selected':''}>Active</option>
            <option value="inactive" ${course?.status==='inactive'?'selected':''}>Inactive</option>
            <option value="draft" ${course?.status==='draft'?'selected':''}>Draft</option>
          </select>
        </div>
        <div class="modal-footer" style="padding:0;border:none;margin-top:1rem">
          <button type="button" class="btn btn-secondary" onclick="Modal.close()">Cancel</button>
          <button type="submit" class="btn btn-primary"><i class="fas fa-save"></i> ${course ? 'Save Changes' : 'Create Course'}</button>
        </div>
      </form>
    `;
  },

  // Image helpers for course modal
  handleImageFile(input) {
    const file = input.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) return Toast.error('Image too large — max 2 MB');
    const reader = new FileReader();
    reader.onload = ev => {
      const src = ev.target.result;
      const urlInput = document.getElementById('course-img-url');
      if (urlInput) urlInput.value = src;
      this._showCourseImgPreview(src);
    };
    reader.readAsDataURL(file);
  },

  onImageUrlInput(val) {
    if (!val?.trim()) { this.clearImage(); return; }
    this._showCourseImgPreview(val.trim());
  },

  _showCourseImgPreview(src) {
    const wrap = document.getElementById('course-img-preview-wrap');
    const img  = document.getElementById('course-img-preview');
    if (wrap) wrap.style.display = 'flex';
    if (img)  img.src = src;
  },

  clearImage() {
    const wrap = document.getElementById('course-img-preview-wrap');
    const img  = document.getElementById('course-img-preview');
    const url  = document.getElementById('course-img-url');
    if (wrap) wrap.style.display = 'none';
    if (img)  img.src = '';
    if (url)  url.value = '';
  },

  async saveCourse(e, id) {
    e.preventDefault();
    const fd = new FormData(e.target);
    const data = Object.fromEntries(fd.entries());
    data.min_age = parseInt(data.min_age);
    data.max_age = parseInt(data.max_age);
    if (!data.image_url) data.image_url = null;
    if (!data.description) data.description = null;
    try {
      const result = id ? await DB.updateCourse(id, data) : await DB.createCourse(data);
      if (result.error) throw result.error;
      Toast.success(id ? 'Course updated!' : 'Course created!');
      Modal.close();
      await this.loadCourses();
    } catch (err) { Toast.error(err.message || 'Failed to save course'); }
  },

  async deleteCourse(id, name) {
    if (!confirm(`Delete course "${name}"? All levels and enrollments will also be deleted.`)) return;
    const { error } = await DB.deleteCourse(id);
    if (error) return Toast.error(error.message || 'Failed to delete course');
    Toast.success('Course deleted');
    await this.loadCourses();
  },

  // ─────────────────────────────────────────────
  // CURRICULUM VIEW
  // ─────────────────────────────────────────────
  async manageCurriculum(courseId) {
    this.currentCourse = this.courses.find(c => c.id === courseId);
    this._expandedLevel = null;
    if (!this.currentCourse) return;
    await this.renderCurriculum();
  },

  async renderCurriculum() {
    const course = this.currentCourse;
    const el = document.getElementById('courses-content');
    if (!el) return;

    const [{ data: levels }, { data: trainers }, { data: allEnrollments }, { data: allAssignments }] = await Promise.all([
      DB.getLevels(course.id),
      DB.getTrainers(),
      // fetch all enrollments for ALL levels of this course in one shot
      DB.getAll('enrollments', {
        select: 'level_id, status',
        // We can't filter by course_id directly on enrollments, so fetch all
        // levels ids client-side after we have them
      }),
      // fetch all trainer_assignments (to show multi-trainers per level)
      DB.getAll('trainer_assignments', {
        select: '*, trainer:trainer_id(id, full_name)',
      }),
    ]);
    this._trainers = trainers || [];
    this._levels   = levels   || [];

    // Attach _trainerNames array to each level from trainer_assignments
    const assignMap = {};
    (allAssignments || []).forEach(a => {
      if (!assignMap[a.level_id]) assignMap[a.level_id] = [];
      if (a.trainer?.full_name) assignMap[a.level_id].push(a.trainer.full_name);
    });
    this._levels.forEach(lv => { lv._trainerNames = assignMap[lv.id] || []; });

    // Build enrollment count map: levelId → { total, active }
    const levelIds = new Set((this._levels).map(l => l.id));
    this._enrollCountMap = {};
    (allEnrollments || []).forEach(e => {
      if (!levelIds.has(e.level_id)) return;
      if (!this._enrollCountMap[e.level_id]) this._enrollCountMap[e.level_id] = { total: 0, active: 0 };
      this._enrollCountMap[e.level_id].total++;
      if (e.status === 'active') this._enrollCountMap[e.level_id].active++;
    });

    el.innerHTML = `
      <div class="curriculum-header">
        ${course.image_url
          ? `<img src="${Utils.esc(course.image_url)}" style="width:72px;height:72px;object-fit:cover;border-radius:var(--radius-md)" />`
          : `<div style="width:72px;height:72px;background:var(--bg-tertiary);border-radius:var(--radius-md);display:flex;align-items:center;justify-content:center;font-size:2rem;color:var(--text-muted)"><i class="fas fa-robot"></i></div>`}
        <div class="curriculum-info">
          <div style="display:flex;align-items:center;gap:10px">
            <h2 style="font-size:var(--font-size-xl);font-weight:700">${Utils.esc(course.name)}</h2>
            ${Utils.statusBadge(course.status)}
          </div>
          <p style="color:var(--text-muted);font-size:var(--font-size-sm);margin-top:4px">${Utils.esc(course.description || '')}</p>
          <div style="margin-top:6px;font-size:var(--font-size-xs);color:var(--text-muted)">
            <i class="fas fa-users"></i> Ages ${course.min_age}–${course.max_age}
          </div>
        </div>
        <button class="btn btn-ghost btn-sm" onclick="CoursesPage.openEditCourse('${course.id}')">
          <i class="fas fa-edit"></i> Edit
        </button>
      </div>

      <div class="card">
        <div class="card-header">
          <div>
            <div class="card-title">
              Course Levels
              <span class="badge badge-blue" style="margin-left:6px">${this._levels.length}</span>
            </div>
            <div class="card-subtitle">Curriculum levels — click <strong>Manage Students</strong> on any level to enroll or remove students.</div>
          </div>
          <button class="btn btn-primary btn-sm" onclick="CoursesPage.openAddLevel()">
            <i class="fas fa-plus"></i> Add Level
          </button>
        </div>
        <div id="levels-list">
          ${!this._levels.length
            ? `<div class="empty-state"><i class="fas fa-layer-group"></i><h3>No levels yet</h3><p>Add the first curriculum level.</p></div>`
            : this._levels.map((lv, i) => this.levelCardHTML(lv, i)).join('')
          }
        </div>
      </div>
    `;
  },

  levelCardHTML(lv, idx) {
    const isExpanded = this._expandedLevel === lv.id;
    const counts = this._enrollCountMap?.[lv.id] || { total: 0, active: 0 };
    const enrollBadge = counts.total > 0
      ? `<span class="badge badge-blue" title="${counts.active} active / ${counts.total} total enrolled" style="cursor:default">
           <i class="fas fa-user-graduate" style="font-size:9px;margin-right:3px"></i>${counts.active}<span style="opacity:.6;font-weight:400">/${counts.total}</span>
         </span>`
      : `<span class="badge badge-gray" title="No students enrolled" style="cursor:default">
           <i class="fas fa-user-slash" style="font-size:9px;margin-right:3px"></i>0 students
         </span>`;
    return `
      <div class="level-card" id="level-card-${lv.id}">
        <div class="level-card-header">
          <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
            <div style="width:28px;height:28px;border-radius:50%;background:var(--brand-primary);color:#fff;font-size:12px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0">${lv.order_num || idx + 1}</div>
            <strong>${Utils.esc(lv.name)}</strong>
            ${Utils.statusBadge(lv.status)}
            ${enrollBadge}
          </div>
          <div style="display:flex;gap:6px;align-items:center">
            <button class="btn btn-secondary btn-sm" onclick="CoursesPage.toggleStudents('${lv.id}')" id="enroll-btn-${lv.id}">
              <i class="fas fa-user-plus"></i>
              <span id="enroll-btn-label-${lv.id}">${isExpanded ? 'Hide Students' : 'Manage Students'}</span>
            </button>
            <button class="btn btn-ghost btn-icon btn-sm" onclick="CoursesPage.openEditLevel('${lv.id}')"><i class="fas fa-edit"></i></button>
            <button class="btn btn-danger btn-icon btn-sm" onclick="CoursesPage.deleteLevel('${lv.id}')"><i class="fas fa-trash"></i></button>
          </div>
        </div>
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;font-size:var(--font-size-xs);color:var(--text-muted);margin-top:8px">
          ${lv.day_of_week ? `<span><i class="fas fa-calendar-day"></i> ${Utils.esc(lv.day_of_week)}</span>` : ''}
          ${lv.start_time  ? `<span><i class="fas fa-clock"></i> ${Utils.esc(lv.start_time)} – ${Utils.esc(lv.end_time || '')}</span>` : ''}
          ${lv.duration_mins ? `<span><i class="fas fa-hourglass-half"></i> ${lv.duration_mins} min</span>` : ''}
          <span><i class="fas fa-users"></i> Ages ${lv.min_age}–${lv.max_age}</span>
          <span><i class="fas fa-user-tie"></i> ${
            lv._trainerNames?.length
              ? lv._trainerNames.join(', ')
              : (lv.trainer?.full_name || 'No trainer')
          }</span>
          ${lv.capacity ? `<span><i class="fas fa-chair"></i> Capacity: ${lv.capacity}</span>` : ''}
        </div>
        ${lv.description ? `<p style="font-size:var(--font-size-sm);color:var(--text-muted);margin-top:8px">${Utils.esc(lv.description)}</p>` : ''}
        ${(lv.acquisitions || []).length ? `<div style="margin-top:8px;font-size:var(--font-size-xs);color:var(--text-muted)"><strong>Acquisitions:</strong> ${lv.acquisitions.join(', ')}</div>` : ''}
        ${(lv.prerequisites || []).length ? `<div style="margin-top:4px;font-size:var(--font-size-xs);color:var(--text-muted)"><strong>Prerequisites:</strong> ${lv.prerequisites.join(', ')}</div>` : ''}

        <!-- Student enrollment panel (toggled) -->
        <div id="enrollment-panel-${lv.id}" style="display:${isExpanded ? 'block' : 'none'};margin-top:12px;border-top:1px solid var(--border-color);padding-top:12px">
          <div style="text-align:center;padding:1rem;color:var(--text-muted)"><i class="fas fa-spinner fa-spin"></i> Loading students…</div>
        </div>
      </div>
    `;
  },

  // ─────────────────────────────────────────────
  // STUDENT ENROLLMENT PANEL (per level)
  // ─────────────────────────────────────────────
  async toggleStudents(levelId) {
    const panel = document.getElementById(`enrollment-panel-${levelId}`);
    const label = document.getElementById(`enroll-btn-label-${levelId}`);
    if (!panel) return;

    if (this._expandedLevel === levelId) {
      // collapse
      panel.style.display = 'none';
      if (label) label.textContent = 'Manage Students';
      this._expandedLevel = null;
      return;
    }

    // expand
    this._expandedLevel = levelId;
    if (label) label.textContent = 'Hide Students';
    panel.style.display = 'block';

    await this.loadEnrollmentPanel(levelId);
  },

  async loadEnrollmentPanel(levelId) {
    const panel = document.getElementById(`enrollment-panel-${levelId}`);
    if (!panel) return;
    panel.innerHTML = `<div style="text-align:center;padding:1rem;color:var(--text-muted)"><i class="fas fa-spinner fa-spin"></i> Loading students…</div>`;

    // Fetch enrolled students + all available students (for the add dropdown)
    const [{ data: enrollments, error: enrErr }, { data: allStudents, error: stuErr }] = await Promise.all([
      DB.getLevelEnrollments(levelId),
      DB.getStudents(),
    ]);

    if (enrErr || stuErr) {
      panel.innerHTML = `<div class="alert alert-error">Failed to load student data.</div>`;
      return;
    }

    const enrolledIds = new Set((enrollments || []).map(e => e.student_id));
    const availableStudents = (allStudents || []).filter(s => !enrolledIds.has(s.id) && s.status === 'active');

    panel.innerHTML = this.enrollmentPanelHTML(levelId, enrollments || [], availableStudents);

    // Update the count badge on the level card header without re-rendering everything
    this._refreshLevelBadge(levelId, enrollments || []);
  },

  _refreshLevelBadge(levelId, enrollments) {
    // Update the in-memory count map
    if (!this._enrollCountMap) this._enrollCountMap = {};
    const active = enrollments.filter(e => e.status === 'active').length;
    this._enrollCountMap[levelId] = { total: enrollments.length, active };

    // Find the badge span inside the level card header and update it
    const card = document.getElementById(`level-card-${levelId}`);
    if (!card) return;
    // The badge is the last <span class="badge ..."> inside the header's first div
    const headerFirstDiv = card.querySelector('.level-card-header > div:first-child');
    if (!headerFirstDiv) return;
    const oldBadge = headerFirstDiv.querySelector('.badge:last-child');
    if (!oldBadge) return;

    const counts = this._enrollCountMap[levelId];
    const newBadge = document.createElement('span');
    if (counts.total > 0) {
      newBadge.className = 'badge badge-blue';
      newBadge.title = `${counts.active} active / ${counts.total} total enrolled`;
      newBadge.style.cursor = 'default';
      newBadge.innerHTML = `<i class="fas fa-user-graduate" style="font-size:9px;margin-right:3px"></i>${counts.active}<span style="opacity:.6;font-weight:400">/${counts.total}</span>`;
    } else {
      newBadge.className = 'badge badge-gray';
      newBadge.title = 'No students enrolled';
      newBadge.style.cursor = 'default';
      newBadge.innerHTML = `<i class="fas fa-user-slash" style="font-size:9px;margin-right:3px"></i>0 students`;
    }
    oldBadge.replaceWith(newBadge);
  },

  enrollmentPanelHTML(levelId, enrollments, availableStudents) {
    const statusColors = { active: 'badge-green', inactive: 'badge-gray', completed: 'badge-blue', dropped: 'badge-red' };
    return `
      <div>
        <!-- Header row -->
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
          <div style="font-weight:600;font-size:var(--font-size-sm)">
            <i class="fas fa-users" style="color:var(--brand-primary)"></i>
            Enrolled Students
            <span class="badge badge-blue" style="margin-left:6px">${enrollments.length}</span>
          </div>
          <button class="btn btn-primary btn-sm" onclick="CoursesPage.openEnrollModal('${levelId}')">
            <i class="fas fa-user-plus"></i> Enroll Student
          </button>
        </div>

        <!-- Enrolled students table -->
        ${enrollments.length === 0
          ? `<div style="text-align:center;padding:1.5rem;color:var(--text-muted);background:var(--bg-secondary);border-radius:var(--radius-md)">
               <i class="fas fa-user-slash" style="font-size:1.5rem;margin-bottom:8px;display:block"></i>
               <p style="font-size:var(--font-size-sm);margin:0">No students enrolled in this level yet.</p>
               <button class="btn btn-primary btn-sm" style="margin-top:10px" onclick="CoursesPage.openEnrollModal('${levelId}')">
                 <i class="fas fa-plus"></i> Add First Student
               </button>
             </div>`
          : `<div style="border-radius:var(--radius-md);overflow:hidden;border:1px solid var(--border-color)">
               <table class="table" style="margin:0">
                 <thead>
                   <tr>
                     <th>Student</th>
                     <th>Enrolled</th>
                     <th>Status</th>
                     <th style="text-align:right">Actions</th>
                   </tr>
                 </thead>
                 <tbody>
                   ${enrollments.map(e => {
                     const s = e.student || {};
                     const color = s.avatar_color || Utils.avatarColor(s.full_name);
                     return `
                       <tr>
                         <td>
                           <div style="display:flex;align-items:center;gap:8px">
                             <div class="users-table-avatar" style="background:${color};width:30px;height:30px;font-size:11px;flex-shrink:0">${Utils.initials(s.full_name || '?')}</div>
                             <div>
                               <div style="font-weight:600;font-size:var(--font-size-sm)">${Utils.esc(s.full_name || 'Unknown')}</div>
                               ${s.phone ? `<div style="font-size:var(--font-size-xs);color:var(--text-muted)">${Utils.esc(s.phone)}</div>` : ''}
                             </div>
                           </div>
                         </td>
                         <td style="font-size:var(--font-size-xs);color:var(--text-muted)">${e.enrolled_at ? Utils.fmtDate(e.enrolled_at) : '—'}</td>
                         <td>
                           <select class="form-select" style="padding:3px 8px;font-size:var(--font-size-xs);width:110px"
                             onchange="CoursesPage.changeEnrollStatus('${e.id}', this.value, '${levelId}')">
                             ${['active','inactive','completed','dropped'].map(st =>
                               `<option value="${st}" ${e.status===st?'selected':''}>${st.charAt(0).toUpperCase()+st.slice(1)}</option>`
                             ).join('')}
                           </select>
                         </td>
                         <td style="text-align:right">
                           <button class="btn btn-danger btn-icon btn-sm" title="Remove from level"
                             onclick="CoursesPage.removeEnrollment('${e.id}', '${Utils.esc(s.full_name || 'this student')}', '${levelId}')">
                             <i class="fas fa-user-minus"></i>
                           </button>
                         </td>
                       </tr>
                     `;
                   }).join('')}
                 </tbody>
               </table>
             </div>`
        }
      </div>
    `;
  },

  openEnrollModal(levelId) {
    const level = this._levels.find(l => l.id === levelId);
    Modal.open(`Enroll Student in ${Utils.esc(level?.name || 'Level')}`, `
      <div id="enroll-modal-body">
        <div style="text-align:center;padding:2rem;color:var(--text-muted)"><i class="fas fa-spinner fa-spin fa-2x"></i></div>
      </div>
    `);
    this._loadEnrollModalBody(levelId);
  },

  async _loadEnrollModalBody(levelId) {
    const el = document.getElementById('enroll-modal-body');
    if (!el) return;

    const [{ data: enrollments }, { data: allStudents }] = await Promise.all([
      DB.getLevelEnrollments(levelId),
      DB.getStudents(),
    ]);

    const enrolledIds = new Set((enrollments || []).map(e => e.student_id));
    const available = (allStudents || []).filter(s => !enrolledIds.has(s.id) && s.status === 'active');

    if (!available.length) {
      el.innerHTML = `
        <div class="empty-state" style="padding:2rem">
          <i class="fas fa-check-circle" style="color:var(--brand-primary)"></i>
          <h3>All active students enrolled</h3>
          <p>Every active student is already enrolled in this level.<br>
          Add new students from the <strong>Users</strong> module first.</p>
        </div>
        <div class="modal-footer" style="padding:0;border:none;margin-top:1rem">
          <button class="btn btn-ghost" onclick="Modal.close()">Close</button>
        </div>
      `;
      return;
    }

    el.innerHTML = `
      <p style="color:var(--text-muted);font-size:var(--font-size-sm);margin-bottom:1rem">
        Select a student to enroll. Only active, not-yet-enrolled students are shown.
      </p>
      <div class="form-group">
        <label class="form-label">Search</label>
        <input type="text" id="enroll-search" class="form-input" placeholder="Type a name…"
          oninput="CoursesPage._filterEnrollList(this.value)" />
      </div>
      <div id="enroll-student-list" style="max-height:320px;overflow-y:auto;border:1px solid var(--border-color);border-radius:var(--radius-md)">
        ${available.map(s => `
          <div class="enroll-student-row" data-name="${Utils.esc(s.full_name?.toLowerCase() || '')}"
            style="display:flex;align-items:center;gap:10px;padding:10px 14px;border-bottom:1px solid var(--border-color);cursor:pointer;transition:background .15s"
            onmouseenter="this.style.background='var(--bg-secondary)'"
            onmouseleave="this.style.background=''"
            onclick="CoursesPage.confirmEnroll('${s.id}', '${Utils.esc(s.full_name || '')}', '${levelId}')">
            <div class="users-table-avatar" style="background:${s.avatar_color || Utils.avatarColor(s.full_name)};width:36px;height:36px;font-size:13px;flex-shrink:0">${Utils.initials(s.full_name || '?')}</div>
            <div style="flex:1">
              <div style="font-weight:600;font-size:var(--font-size-sm)">${Utils.esc(s.full_name || 'Unknown')}</div>
              ${s.parent ? `<div style="font-size:var(--font-size-xs);color:var(--text-muted)">Parent: ${Utils.esc(s.parent.full_name)}</div>` : ''}
            </div>
            <i class="fas fa-plus-circle" style="color:var(--brand-primary);font-size:1.1rem"></i>
          </div>
        `).join('')}
      </div>
      <div class="modal-footer" style="padding:0;border:none;margin-top:1rem">
        <button class="btn btn-ghost" onclick="Modal.close()">Cancel</button>
      </div>
    `;
  },

  _filterEnrollList(q) {
    const term = q.toLowerCase();
    document.querySelectorAll('.enroll-student-row').forEach(row => {
      const name = row.dataset.name || '';
      row.style.display = name.includes(term) ? '' : 'none';
    });
  },

  async confirmEnroll(studentId, studentName, levelId) {
    const { error } = await DB.enrollStudent(studentId, levelId, 'active');
    if (error) {
      Toast.error(error.message || 'Failed to enroll student');
      return;
    }
    Toast.success(`${studentName} enrolled successfully!`);
    Modal.close();
    await this.loadEnrollmentPanel(levelId);
  },

  async changeEnrollStatus(enrollmentId, newStatus, levelId) {
    const { error } = await DB.setEnrollmentStatus(enrollmentId, newStatus);
    if (error) {
      Toast.error('Failed to update enrollment status');
      return;
    }
    Toast.success(`Status updated to "${newStatus}"`);
    // Refresh the panel silently
    await this.loadEnrollmentPanel(levelId);
  },

  async removeEnrollment(enrollmentId, studentName, levelId) {
    if (!confirm(`Remove ${studentName} from this level? Their attendance history will remain.`)) return;
    const { error } = await DB.unenrollStudent(enrollmentId);
    if (error) {
      Toast.error(error.message || 'Failed to remove enrollment');
      return;
    }
    Toast.success(`${studentName} removed from level`);
    await this.loadEnrollmentPanel(levelId);
  },

  // ─────────────────────────────────────────────
  // LEVEL FORM
  // ─────────────────────────────────────────────
  openAddLevel() {
    Modal.open('Add New Level', this.levelFormHTML(null, []), { size: 'lg' });
  },

  openEditLevel(id) {
    this._openLevelModal(id);
  },

  async _openLevelModal(id) {
    const [{ data: lv }, { data: assignments }] = await Promise.all([
      DB.getOne('levels', id),
      DB.getLevelTrainerAssignments(id),
    ]);
    if (!lv) return Toast.error('Level not found');

    // Merge: trainer_assignments rows + legacy levels.trainer_id (single FK)
    // This ensures trainers assigned via the old single-select are shown as checked
    const fromAssignments = (assignments || []).map(a => a.trainer_id);
    const assignedTrainerIds = [...new Set([
      ...fromAssignments,
      ...(lv.trainer_id ? [lv.trainer_id] : []),  // include legacy single FK
    ])];

    // Auto-migrate: if legacy trainer_id exists but no row in trainer_assignments,
    // write it now so the trainer card reflects it immediately
    if (lv.trainer_id && !fromAssignments.includes(lv.trainer_id)) {
      await DB.setLevelTrainerAssignments(id, assignedTrainerIds).catch(() => {});
    }

    Modal.open('Edit Level', this.levelFormHTML(lv, assignedTrainerIds), { size: 'lg' });
  },

  levelFormHTML(lv, assignedTrainerIds = []) {
    const days = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
    const trainers = this._trainers || [];
    return `
      <form onsubmit="CoursesPage.saveLevel(event, ${lv ? `'${lv.id}'` : 'null'})">
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Level Name *</label>
            <input type="text" name="name" class="form-input" required value="${Utils.esc(lv?.name || '')}" placeholder="e.g. Beginner 1" />
          </div>
          <div class="form-group">
            <label class="form-label">Order</label>
            <input type="number" name="order_num" class="form-input" value="${lv?.order_num ?? 1}" min="1" />
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Description</label>
          <textarea name="description" class="form-textarea">${Utils.esc(lv?.description || '')}</textarea>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Min Age</label>
            <input type="number" name="min_age" class="form-input" value="${lv?.min_age ?? 5}" />
          </div>
          <div class="form-group">
            <label class="form-label">Max Age</label>
            <input type="number" name="max_age" class="form-input" value="${lv?.max_age ?? 18}" />
          </div>
        </div>
        <div class="form-row-3">
          <div class="form-group">
            <label class="form-label">Day of Week</label>
            <select name="day_of_week" class="form-select">
              <option value="">— Select —</option>
              ${days.map(d => `<option value="${d}" ${lv?.day_of_week===d?'selected':''}>${d}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Start Time</label>
            <input type="time" name="start_time" class="form-input" value="${lv?.start_time || ''}" />
          </div>
          <div class="form-group">
            <label class="form-label">End Time</label>
            <input type="time" name="end_time" class="form-input" value="${lv?.end_time || ''}" />
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Duration (minutes)</label>
            <input type="number" name="duration_mins" class="form-input" value="${lv?.duration_mins ?? 60}" />
          </div>
          <div class="form-group">
            <label class="form-label">Capacity</label>
            <input type="number" name="capacity" class="form-input" value="${lv?.capacity ?? 15}" />
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Trainers <span style="font-size:11px;font-weight:400;color:var(--text-muted)">(select one or more)</span></label>
          ${trainers.length === 0
            ? `<p style="font-size:var(--font-size-sm);color:var(--text-muted)">No trainers available. Add trainers first.</p>`
            : `<div style="display:flex;flex-direction:column;gap:6px;max-height:160px;overflow-y:auto;
                  background:var(--bg-tertiary);border:1px solid var(--border-color);
                  border-radius:var(--radius-md);padding:10px 12px">
                ${trainers.map(t => `
                  <label style="display:flex;align-items:center;gap:8px;cursor:pointer;padding:2px 0">
                    <input type="checkbox" name="trainer_ids" value="${t.id}"
                      ${assignedTrainerIds.includes(t.id) ? 'checked' : ''}
                      style="width:15px;height:15px;accent-color:var(--brand-primary);flex-shrink:0" />
                    <span style="font-size:var(--font-size-sm);font-weight:500">${Utils.esc(t.full_name)}</span>
                  </label>`).join('')}
              </div>`
          }
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Acquisitions <span class="text-muted">(comma separated)</span></label>
            <input type="text" name="acquisitions_str" class="form-input" value="${(lv?.acquisitions || []).join(', ')}" placeholder="e.g. Circuit design, Soldering" />
          </div>
          <div class="form-group">
            <label class="form-label">Prerequisites <span class="text-muted">(comma separated)</span></label>
            <input type="text" name="prerequisites_str" class="form-input" value="${(lv?.prerequisites || []).join(', ')}" placeholder="e.g. Basic math" />
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Status</label>
          <select name="status" class="form-select">
            <option value="active" ${lv?.status==='active'?'selected':''}>Active</option>
            <option value="inactive" ${lv?.status==='inactive'?'selected':''}>Inactive</option>
          </select>
        </div>
        <div class="modal-footer" style="padding:0;border:none;margin-top:1rem">
          <button type="button" class="btn btn-secondary" onclick="Modal.close()">Cancel</button>
          <button type="submit" class="btn btn-primary"><i class="fas fa-save"></i> Save Level</button>
        </div>
      </form>
    `;
  },

  async saveLevel(e, id) {
    e.preventDefault();
    const fd = new FormData(e.target);
    // Collect multi-select trainer checkboxes
    const trainerIds = Array.from(e.target.querySelectorAll('input[name="trainer_ids"]:checked'))
      .map(cb => cb.value);
    const raw = Object.fromEntries(fd.entries());
    const data = {
      name: raw.name,
      description: raw.description || null,
      order_num: parseInt(raw.order_num) || 1,
      min_age: parseInt(raw.min_age) || 5,
      max_age: parseInt(raw.max_age) || 18,
      day_of_week: raw.day_of_week || null,
      start_time: raw.start_time || null,
      end_time: raw.end_time || null,
      duration_mins: parseInt(raw.duration_mins) || 60,
      capacity: parseInt(raw.capacity) || 15,
      // Keep trainer_id as first selected trainer for legacy compatibility
      trainer_id: trainerIds[0] || null,
      acquisitions: raw.acquisitions_str ? raw.acquisitions_str.split(',').map(s => s.trim()).filter(Boolean) : [],
      prerequisites: raw.prerequisites_str ? raw.prerequisites_str.split(',').map(s => s.trim()).filter(Boolean) : [],
      status: raw.status,
    };
    if (!id) data.course_id = this.currentCourse.id;
    try {
      const result = id ? await DB.updateLevel(id, data) : await DB.createLevel(data);
      if (result.error) throw result.error;
      const levelId = id || result.data?.id;
      // Sync trainer_assignments for this level
      if (levelId) await DB.setLevelTrainerAssignments(levelId, trainerIds);
      Toast.success(id ? 'Level updated!' : 'Level added!');
      Modal.close();
      // Preserve expanded state after refresh
      const wasExpanded = this._expandedLevel;
      await this.renderCurriculum();
      if (wasExpanded) {
        this._expandedLevel = wasExpanded;
        const panel = document.getElementById(`enrollment-panel-${wasExpanded}`);
        const label = document.getElementById(`enroll-btn-label-${wasExpanded}`);
        if (panel) {
          panel.style.display = 'block';
          if (label) label.textContent = 'Hide Students';
          await this.loadEnrollmentPanel(wasExpanded);
        }
      }
    } catch (err) { Toast.error(err.message || 'Failed to save level'); }
  },

  async deleteLevel(id) {
    if (!confirm('Delete this level? All enrollment records for this level will also be removed.')) return;
    const { error } = await DB.deleteLevel(id);
    if (error) return Toast.error(error.message);
    Toast.success('Level deleted');
    if (this._expandedLevel === id) this._expandedLevel = null;
    await this.renderCurriculum();
  },
};
