/* ============================================================
   MINDS' CRAFT — DATABASE LAYER (Supabase)
   ============================================================ */

let _supabase = null;

const DB = {

  // ─────────────────────────────────────────────
  // INIT
  // ─────────────────────────────────────────────
  init(url, key) {
    if (!url || !key) return false;
    try {
      _supabase = supabase.createClient(url, key);
      return true;
    } catch (e) {
      console.error('Supabase init error:', e);
      return false;
    }
  },

  get client() { return _supabase; },
  get isReady() { return !!_supabase; },

  // ─────────────────────────────────────────────
  // AUTH
  // ─────────────────────────────────────────────
  async signIn(email, password) {
    const { data, error } = await _supabase.auth.signInWithPassword({ email, password });
    return { data, error };
  },

  async signOut() {
    return await _supabase.auth.signOut();
  },

  async getSession() {
    const { data } = await _supabase.auth.getSession();
    return data.session;
  },

  onAuthChange(cb) {
    return _supabase.auth.onAuthStateChange(cb);
  },

  // ─────────────────────────────────────────────
  // GENERIC CRUD
  // ─────────────────────────────────────────────
  async getAll(table, opts = {}) {
    if (!_supabase) return { data: [], error: new Error('Supabase not initialized') };
    let q = _supabase.from(table).select(opts.select || '*');
    if (opts.filter) {
      for (const [col, val] of Object.entries(opts.filter)) {
        q = q.eq(col, val);
      }
    }
    if (opts.ilike) {
      for (const [col, val] of Object.entries(opts.ilike)) {
        q = q.ilike(col, `%${val}%`);
      }
    }
    if (opts.in) {
      for (const [col, vals] of Object.entries(opts.in)) {
        q = q.in(col, vals);
      }
    }
    if (opts.order) q = q.order(opts.order, { ascending: opts.asc !== false });
    if (opts.limit) q = q.limit(opts.limit);
    if (opts.range) q = q.range(opts.range[0], opts.range[1]);
    const { data, error, count } = await q;
    return { data: data || [], error, count };
  },

  async getOne(table, id) {
    if (!_supabase) return { data: null, error: new Error('Not initialized') };
    const { data, error } = await _supabase.from(table).select('*').eq('id', id).single();
    return { data, error };
  },

  async insert(table, obj) {
    if (!_supabase) return { data: null, error: new Error('Not initialized') };
    const { data, error } = await _supabase.from(table).insert(obj).select().single();
    return { data, error };
  },

  async insertMany(table, rows) {
    if (!_supabase) return { data: [], error: new Error('Not initialized') };
    const { data, error } = await _supabase.from(table).insert(rows).select();
    return { data, error };
  },

  async update(table, id, obj) {
    if (!_supabase) return { data: null, error: new Error('Not initialized') };
    const { data, error } = await _supabase.from(table).update(obj).eq('id', id).select().single();
    return { data, error };
  },

  async remove(table, id) {
    if (!_supabase) return { error: new Error('Not initialized') };
    const { error } = await _supabase.from(table).delete().eq('id', id);
    return { error };
  },

  async count(table, filter = {}) {
    if (!_supabase) return { count: 0, error: null };
    let q = _supabase.from(table).select('*', { count: 'exact', head: true });
    for (const [k, v] of Object.entries(filter)) q = q.eq(k, v);
    const { count, error } = await q;
    return { count: count || 0, error };
  },

  // ─────────────────────────────────────────────
  // USERS
  // ─────────────────────────────────────────────
  async getUsers(opts = {}) {
    return this.getAll('users', { order: 'created_at', asc: false, limit: 2000, ...opts });
  },

  async getUsersByType(type) {
    return this.getAll('users', { filter: { user_type: type }, order: 'full_name', limit: 2000 });
  },

  /**
   * Look up a user's Supabase Auth UID (= users.auth_id).
   * This is the value that must be stored in parent_notifications.parent_user_id
   * so that the parent portal RLS policy (auth.uid() = parent_user_id) works.
   *
   * @param {string} identifier  — users.id (UUID) OR email address
   * @returns {Promise<string|null>}  auth_id or null if not linked yet
   */
  async getUserAuthId(identifier) {
    if (!identifier) return null;
    try {
      // Try by UUID first (users.id)
      const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(identifier);
      if (isUUID) {
        const { data } = await this.getOne('users', identifier);
        return data?.auth_id || null;
      }
      // Fall back to email lookup
      const { data: rows } = await this.getAll('users', {
        select: 'id,auth_id',
        limit:  1,
      });
      // getAll doesn't support ilike in all versions — filter in memory
      const match = (rows || []).find(
        u => (u.email || '').toLowerCase() === identifier.toLowerCase()
      );
      return match?.auth_id || null;
    } catch (e) {
      console.warn('[DB.getUserAuthId] failed:', e.message);
      return null;
    }
  },

  async getParents() {
    return this.getUsersByType('parent');
  },

  async getStudents(opts = {}) {
    // Use select:'*' only — no FK join on parent_id to avoid silent row-drops
    // when parent_id references are stale after UID migrations.
    // Parent info is resolved in-memory by callers if needed.
    return this.getAll('users', {
      select: '*',
      filter: { user_type: 'student' },
      order: 'full_name',
      limit: 2000,
      ...opts
    });
  },

  async createUser(userData) {
    return this.insert('users', userData);
  },

  async updateUser(id, data) {
    return this.update('users', id, data);
  },

  async deleteUser(id) {
    return this.remove('users', id);
  },

  // ─────────────────────────────────────────────
  // COURSES
  // ─────────────────────────────────────────────
  async getCourses() {
    return this.getAll('courses', { order: 'name' });
  },

  async getLevels(courseId) {
    return this.getAll('levels', { filter: { course_id: courseId }, order: 'order_num', select: '*, trainer:trainer_id(id, full_name)' });
  },

  async getAllLevels() {
    return this.getAll('levels', { select: '*, course:course_id(id, name)' });
  },

  async createCourse(data) { return this.insert('courses', data); },
  async updateCourse(id, data) { return this.update('courses', id, data); },
  async deleteCourse(id) { return this.remove('courses', id); },
  async createLevel(data) { return this.insert('levels', data); },
  async updateLevel(id, data) { return this.update('levels', id, data); },
  async deleteLevel(id) { return this.remove('levels', id); },

  // ─────────────────────────────────────────────
  // ENROLLMENTS
  // ─────────────────────────────────────────────
  async getEnrollments(opts = {}) {
    return this.getAll('enrollments', {
      select: '*, student:student_id(id, full_name, birthday, avatar_color), level:level_id(id, name, course:course_id(id, name))',
      order: 'enrolled_at',
      asc: false,
      ...opts
    });
  },

  /** Get all enrollments for a specific level (includes new date/notes fields) */
  async getLevelEnrollments(levelId) {
    return this.getAll('enrollments', {
      select: '*, student:student_id(id, full_name, birthday, avatar_color, phone, status)',
      filter: { level_id: levelId },
      order: 'enrolled_at',
    });
  },

  // ─────────────────────────────────────────────
  // LEVEL SCHEDULES (multiple day/time slots per level)
  // ─────────────────────────────────────────────

  /** Get all schedule slots for a level */
  async getLevelSchedules(levelId) {
    return this.getAll('level_schedules', {
      select: 'id, level_id, day_of_week, start_time, end_time, label',
      filter: { level_id: levelId },
      order: 'day_of_week',
    });
  },

  /** Replace all schedule slots for a level with a new array */
  async setLevelSchedules(levelId, slots) {
    if (!_supabase) return { error: new Error('Not initialized') };
    // Delete existing slots for this level
    await _supabase.from('level_schedules').delete().eq('level_id', levelId);
    if (!slots || !slots.length) return { data: [], error: null };
    // Insert new slots
    const rows = slots.map(s => ({
      level_id:    levelId,
      day_of_week: s.day_of_week,
      start_time:  s.start_time  || null,
      end_time:    s.end_time    || null,
      label:       s.label       || null,
    }));
    const { data, error } = await _supabase.from('level_schedules').insert(rows).select();
    return { data, error };
  },

  /** Update the schedule_slot field on a single enrollment */
  async setEnrollmentSlot(enrollmentId, slot) {
    return this.update('enrollments', enrollmentId, { schedule_slot: slot || null });
  },

  /** Get all enrollments for a specific student */
  async getStudentEnrollments(studentId) {
    return this.getAll('enrollments', {
      select: '*, level:level_id(id, name, day_of_week, start_time, end_time, course:course_id(id, name))',
      filter: { student_id: studentId },
      order: 'enrolled_at',
      asc: false,
    });
  },

  /** Enroll a student in a level (safe — ignores duplicate) */
  async enrollStudent(studentId, levelId, status = 'active', scheduleSlot = null, startDate = null, endDate = null, notes = null) {
    if (!_supabase) return { data: null, error: new Error('Not initialized') };
    const today = Utils.localDateISO();
    const row = {
      student_id:   studentId,
      level_id:     levelId,
      status,
      enrolled_at:  today,
      start_date:   startDate || today,   // always set — defaults to today
    };
    if (scheduleSlot) row.schedule_slot = scheduleSlot;
    if (endDate)      row.end_date      = endDate;
    if (notes)        row.notes         = notes;
    const { data, error } = await _supabase
      .from('enrollments')
      .upsert(row, { onConflict: 'student_id,level_id' })
      .select()
      .single();
    return { data, error };
  },

  /** Update enrollment dates and notes */
  async setEnrollmentDates(enrollmentId, startDate, endDate, notes) {
    const patch = {};
    if (startDate !== undefined) patch.start_date = startDate || null;
    if (endDate   !== undefined) patch.end_date   = endDate   || null;
    if (notes     !== undefined) patch.notes      = notes     || null;
    return this.update('enrollments', enrollmentId, patch);
  },

  /** Remove a student from a level */
  async unenrollStudent(enrollmentId) {
    return this.remove('enrollments', enrollmentId);
  },

  /** Update enrollment status (active / inactive / completed / dropped) */
  async setEnrollmentStatus(enrollmentId, status) {
    return this.update('enrollments', enrollmentId, { status });
  },

  /** Update level_progress (0–100) for an enrollment */
  async setEnrollmentProgress(enrollmentId, progress) {
    const val = Math.min(100, Math.max(0, parseInt(progress) || 0));
    return this.update('enrollments', enrollmentId, { level_progress: val });
  },

  async createEnrollment(data) { return this.insert('enrollments', data); },
  async updateEnrollment(id, data) { return this.update('enrollments', id, data); },
  async deleteEnrollment(id) { return this.remove('enrollments', id); },

  // ─────────────────────────────────────────────
  // ATTENDANCE
  // ─────────────────────────────────────────────
  async getAttendance(opts = {}) {
    return this.getAll('attendance', {
      select: '*, student:student_id(id, full_name)',
      ...opts
    });
  },

  async upsertAttendance(data) {
    if (!_supabase) return { data: null, error: new Error('Not initialized') };
    const { data: result, error } = await _supabase
      .from('attendance')
      .upsert(data, { onConflict: 'student_id,level_id,date' })
      .select();
    return { data: result, error };
  },

  // ─────────────────────────────────────────────
  // TRAINERS
  // ─────────────────────────────────────────────
  async getTrainers() {
    return this.getAll('trainers', { order: 'full_name' });
  },

  async createTrainer(data) { return this.insert('trainers', data); },
  async updateTrainer(id, data) { return this.update('trainers', id, data); },
  async deleteTrainer(id) { return this.remove('trainers', id); },

  async getTrainerAssignments(trainerId) {
    return this.getAll('trainer_assignments', {
      select: '*, level:level_id(id, name, course:course_id(id, name))',
      filter: { trainer_id: trainerId }
    });
  },

  async setTrainerAssignments(trainerId, levelIds) {
    if (!_supabase) return { error: new Error('Not initialized') };
    // delete existing
    await _supabase.from('trainer_assignments').delete().eq('trainer_id', trainerId);
    if (levelIds.length === 0) return { data: [], error: null };
    const rows = levelIds.map(lid => ({ trainer_id: trainerId, level_id: lid }));
    return this.insertMany('trainer_assignments', rows);
  },

  /** Get all trainer assignments for a specific level */
  async getLevelTrainerAssignments(levelId) {
    return this.getAll('trainer_assignments', {
      select: '*, trainer:trainer_id(id, full_name)',
      filter: { level_id: levelId }
    });
  },

  /** Set (replace) all trainer assignments for a specific level */
  async setLevelTrainerAssignments(levelId, trainerIds) {
    if (!_supabase) return { error: new Error('Not initialized') };
    await _supabase.from('trainer_assignments').delete().eq('level_id', levelId);
    if (trainerIds.length === 0) return { data: [], error: null };
    const rows = trainerIds.map(tid => ({ trainer_id: tid, level_id: levelId }));
    return this.insertMany('trainer_assignments', rows);
  },

  // ─────────────────────────────────────────────
  // TRAINER SESSIONS
  // ─────────────────────────────────────────────
  async getTrainerSessions(opts = {}) {
    return this.getAll('trainer_sessions', {
      select: '*, trainer:trainer_id(id, full_name, fee_session), level:level_id(id, name, day_of_week, course:course_id(id, name))',
      order: 'session_date',
      asc: false,
      ...opts,
    });
  },

  async getTrainerSessionsByTrainer(trainerId) {
    return this.getAll('trainer_sessions', {
      select: '*, level:level_id(id, name, day_of_week, course:course_id(id, name))',
      filter: { trainer_id: trainerId },
      order: 'session_date',
      asc: false,
    });
  },

  async createTrainerSession(data)      { return this.insert('trainer_sessions', data); },
  async updateTrainerSession(id, data)  { return this.update('trainer_sessions', id, data); },
  async deleteTrainerSession(id)        { return this.remove('trainer_sessions', id); },

  // ─────────────────────────────────────────────
  // EVENTS
  // ─────────────────────────────────────────────
  async getEvents() {
    return this.getAll('events', { order: 'start_date', asc: false });
  },

  async createEvent(data) { return this.insert('events', data); },
  async updateEvent(id, data) { return this.update('events', id, data); },
  async deleteEvent(id) { return this.remove('events', id); },

  async getEventRegistrations(eventId) {
    return this.getAll('event_registrations', {
      select: '*, user:user_id(id, full_name, email)',
      filter: { event_id: eventId }
    });
  },

  // ─────────────────────────────────────────────
  // FINANCIALS
  // ─────────────────────────────────────────────
  async getPackages() {
    return this.getAll('packages', { order: 'name' });
  },

  async createPackage(data) { return this.insert('packages', data); },
  async updatePackage(id, data) { return this.update('packages', id, data); },
  async deletePackage(id) { return this.remove('packages', id); },

  // ── Package ↔ Course links (package_courses junction table) ──────────────

  // Get all course IDs linked to a specific package
  async getPackageCourses(packageId) {
    if (!_supabase) return { data: [], error: null };
    const { data, error } = await _supabase
      .from('package_courses')
      .select('course_id')
      .eq('package_id', packageId);
    return { data: (data || []).map(r => r.course_id), error };
  },

  // Get all package_courses rows (for bulk loading in one query)
  async getAllPackageCourses() {
    if (!_supabase) return { data: [], error: null };
    const { data, error } = await _supabase
      .from('package_courses')
      .select('package_id, course_id');
    return { data: data || [], error };
  },

  // Replace all course links for a package (delete old, insert new)
  async setPackageCourses(packageId, courseIds = []) {
    if (!_supabase) return { error: new Error('Not initialized') };
    // 1. Delete existing links for this package
    const { error: delErr } = await _supabase
      .from('package_courses')
      .delete()
      .eq('package_id', packageId);
    if (delErr) return { error: delErr };
    // 2. Insert new links (skip if empty)
    if (!courseIds.length) return { error: null };
    const rows = courseIds.map(cid => ({ package_id: packageId, course_id: cid }));
    const { error: insErr } = await _supabase
      .from('package_courses')
      .insert(rows);
    return { error: insErr };
  },

  async getTransactions(opts = {}) {
    return this.getAll('transactions', { order: 'date', asc: false, ...opts });
  },

  async createTransaction(data) { return this.insert('transactions', data); },
  async updateTransaction(id, data) { return this.update('transactions', id, data); },
  async deleteTransaction(id) { return this.remove('transactions', id); },

  async getStudentAllocations(opts = {}) {
    return this.getAll('student_allocations', {
      select: '*, student:student_id(id, full_name), package:package_id(id, name, base_price)',
      order: 'end_date',
      ...opts
    });
  },

  async createAllocation(data) { return this.insert('student_allocations', data); },
  async updateAllocation(id, data) { return this.update('student_allocations', id, data); },
  async deleteAllocation(id) { return this.remove('student_allocations', id); },

  // ─────────────────────────────────────────────
  // NOTIFICATIONS
  // ─────────────────────────────────────────────
  async getNotificationRules() {
    return this.getAll('notification_rules', { order: 'created_at', asc: false });
  },

  async createNotificationRule(data) { return this.insert('notification_rules', data); },
  async updateNotificationRule(id, data) { return this.update('notification_rules', id, data); },
  async deleteNotificationRule(id) { return this.remove('notification_rules', id); },

  async getNotificationLogs(opts = {}) {
    return this.getAll('notification_logs', { order: 'sent_at', asc: false, limit: 200, ...opts });
  },

  // Log a notification delivery — accepts all notification_logs columns
  async logNotification(data) {
    // Ensure only known columns are passed (strip undefined)
    const clean = {};
    ['rule_id','recipient_id','recipient_name','recipient_contact',
     'channel','subject','body','status'].forEach(k => {
      if (data[k] !== undefined) clean[k] = data[k];
    });
    return this.insert('notification_logs', clean);
  },

  // ─────────────────────────────────────────────
  // PARENT NOTIFICATIONS (in-app inbox)
  // Written by admin app → read by parent portal app
  // ─────────────────────────────────────────────

  /**
   * Push one in-app notification into a parent's inbox.
   * parent_user_id  — the Supabase auth.uid() of the parent (= users.id after UID sync)
   * subject         — short title
   * body            — full message text
   * type            — 'info'|'payment'|'absence'|'expiry'|'event'|'welcome'|'other'
   * rule_id         — (optional) notification_rules.id that triggered this
   * trigger_event   — (optional) e.g. 'on_payment'
   * metadata        — (optional) JSONB object with extra context
   */
  async pushParentNotification({ parent_user_id, subject, body, type = 'info',
                                  rule_id = null, trigger_event = null, metadata = {} }) {
    if (!parent_user_id) return { error: new Error('parent_user_id is required') };
    return this.insert('parent_notifications', {
      parent_user_id,
      subject,
      body,
      type,
      rule_id:       rule_id       || null,
      trigger_event: trigger_event || null,
      metadata:      metadata      || {},
    });
  },

  /** Fetch all inbox rows for a specific parent (admin-side view) */
  async getParentNotifications(parentUserId, opts = {}) {
    return this.getAll('parent_notifications', {
      filter: { parent_user_id: parentUserId },
      order:  'created_at',
      asc:    false,
      limit:  200,
      ...opts,
    });
  },

  /** Mark a single notification as read */
  async markParentNotificationRead(id) {
    return this.update('parent_notifications', id, { is_read: true });
  },

  /** Delete a single parent notification row */
  async deleteParentNotification(id) {
    return this.remove('parent_notifications', id);
  },

  // ─────────────────────────────────────────────
  // ASSESSMENTS
  // ─────────────────────────────────────────────
  // DESIGN NOTE — one row per (student_id, skill_key, assessed_at).
  //   Each session = 5 rows sharing the exact same assessed_at timestamp.
  //   The `notes` column stores a JSON object with session metadata:
  //     { level, comment, course_id, course_name, level_id, level_name }
  //   This model is fully compatible with third-party apps that group
  //   rows by assessed_at to reconstruct sessions.

  // Fetch all domain rows for a student, newest first
  async getAssessments(studentId) {
    return this.getAll('assessments', {
      filter: { student_id: studentId },
      order:  'assessed_at',
      asc:    false,
    });
  },

  // Save a complete assessment session.
  // Each skill becomes ONE new INSERT row (student_id + skill_key + assessed_at).
  // The unique constraint is (student_id, skill_key, assessed_at) so re-saving
  // the exact same second is safe (upsert). In practice timestamps differ per session.
  async saveAssessmentSession(skillRows) {
    if (!_supabase) return { data: null, error: new Error('Not initialized') };

    const insertPayload = skillRows.map(row => {
      // Copy ALL fields from session_notes into the notes column.
      // No field-gating — SpeedMath rows have no 'level', Robotics rows have no 'speedmath_score',
      // both need course_id / course_name / level_id / level_name preserved.
      let notesObj = {};
      if (row.session_notes) {
        try {
          const parsed = JSON.parse(row.session_notes);
          if (parsed && typeof parsed === 'object') {
            notesObj = parsed;   // store everything as-is
          }
        } catch { /* ignore malformed JSON */ }
      }

      return {
        student_id:  row.student_id,
        skill_key:   row.skill_key,
        skill_label: row.skill_label || row.skill_key,
        category:    row.category    || 'domain',
        score:       row.score,
        assessed_at: row.assessed_at,
        notes:       JSON.stringify(notesObj),
      };
    });

    const { data, error } = await _supabase
      .from('assessments')
      .insert(insertPayload)
      .select();
    return { data, error };
  },

  // Delete all rows for a given student + session timestamp (second-precision)
  async deleteAssessmentSession(studentId, sessionId) {
    if (!_supabase) return { error: null };
    // sessionId = assessed_at.slice(0,19)  e.g. "2026-06-01T10:30:45"
    // We delete all rows where assessed_at starts with that second prefix.
    // Append 'Z' only if not already present (ISO strings from JS already end in Z).
    const prefix = sessionId.endsWith('Z') ? sessionId.slice(0, 19) : sessionId;
    const { error } = await _supabase
      .from('assessments')
      .delete()
      .eq('student_id', studentId)
      .gte('assessed_at', prefix + '.000Z')
      .lte('assessed_at', prefix + '.999Z');
    return { error };
  },

  // Bulk insert assessment rows (legacy — kept for compatibility)
  // Uses INSERT (not upsert) to avoid dependency on a specific unique constraint.
  async upsertAssessmentRows(rows) {
    if (!_supabase) return { data: null, error: new Error('Not initialized') };
    const { data, error } = await _supabase
      .from('assessments')
      .insert(rows)
      .select();
    return { data, error };
  },

  // Legacy single-skill upsert (kept for compatibility)
  async upsertAssessment(data) {
    if (!_supabase) return { data: null, error: new Error('Not initialized') };
    const { session_id, ...cleanData } = data;
    const { data: result, error } = await _supabase
      .from('assessments')
      .upsert(cleanData, { onConflict: 'student_id,skill_key' })
      .select().single();
    return { data: result, error };
  },

  // ─────────────────────────────────────────────
  // SETTINGS
  // ─────────────────────────────────────────────
  async getSettings() {
    if (!_supabase) return null;
    const { data } = await _supabase.from('settings').select('*').eq('id', 1).single();
    return data;
  },

  async saveSettings(settings) {
    if (!_supabase) return { error: new Error('Not initialized') };
    const { data, error } = await _supabase.from('settings').upsert({ id: 1, ...settings });
    return { data, error };
  },

  async getRoles() {
    return this.getAll('roles', { order: 'name' });
  },

  // ─────────────────────────────────────────────
  // ABOUT US
  // ─────────────────────────────────────────────
  async getAboutUs() {
    if (!_supabase) return { data: null, error: new Error('Not initialized') };
    const { data, error } = await _supabase
      .from('about_us')
      .select('*')
      .eq('id', 1)
      .single();
    return { data, error };
  },

  async saveAboutUs(payload) {
    if (!_supabase) return { error: new Error('Not initialized') };
    // branches is an array — store as JSONB
    const row = {
      id: 1,
      ...payload,
      branches: payload.branches ? JSON.stringify(payload.branches) : '[]',
    };
    const { data, error } = await _supabase
      .from('about_us')
      .upsert(row, { onConflict: 'id' });
    return { data, error };
  },

  async createRole(data) { return this.insert('roles', data); },
  async updateRole(id, data) { return this.update('roles', id, data); },
  async deleteRole(id) { return this.remove('roles', id); },

  // ─────────────────────────────────────────────
  // DASHBOARD STATS
  // ─────────────────────────────────────────────
  async getDashboardStats() {
    const [
      { count: totalStudents },
      { count: activeStudents },
      { count: totalCourses },
      { count: upcomingEvents },
    ] = await Promise.all([
      this.count('users', { user_type: 'student' }),
      this.count('users', { user_type: 'student', status: 'active' }),
      this.count('courses', { status: 'active' }),
      this.count('events', { status: 'upcoming' }),
    ]);
    return { totalStudents, activeStudents, totalCourses, upcomingEvents };
  },
};
