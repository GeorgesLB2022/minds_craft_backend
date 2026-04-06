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
    return this.getAll('users', { order: 'created_at', asc: false, ...opts });
  },

  async getUsersByType(type) {
    return this.getAll('users', { filter: { user_type: type }, order: 'full_name' });
  },

  async getParents() {
    return this.getUsersByType('parent');
  },

  async getStudents(opts = {}) {
    return this.getAll('users', { 
      select: '*, parent:parent_id(id, full_name, email, phone)',
      filter: { user_type: 'student' }, 
      order: 'full_name',
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

  /** Get all active enrollments for a specific level */
  async getLevelEnrollments(levelId) {
    return this.getAll('enrollments', {
      select: '*, student:student_id(id, full_name, birthday, avatar_color, phone, status)',
      filter: { level_id: levelId },
      order: 'enrolled_at',
    });
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
  async enrollStudent(studentId, levelId, status = 'active') {
    if (!_supabase) return { data: null, error: new Error('Not initialized') };
    const { data, error } = await _supabase
      .from('enrollments')
      .upsert({ student_id: studentId, level_id: levelId, status, enrolled_at: Utils.localDateISO() }, { onConflict: 'student_id,level_id' })
      .select()
      .single();
    return { data, error };
  },

  /** Remove a student from a level */
  async unenrollStudent(enrollmentId) {
    return this.remove('enrollments', enrollmentId);
  },

  /** Update enrollment status (active / inactive / completed / dropped) */
  async setEnrollmentStatus(enrollmentId, status) {
    return this.update('enrollments', enrollmentId, { status });
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
  // ASSESSMENTS
  // ─────────────────────────────────────────────
  // DESIGN NOTE — no schema migration required:
  //   The DB keeps exactly ONE row per (student_id, skill_key).
  //   The `notes` column stores a JSON array of historical snapshots:
  //     [ { score, assessed_at, session_notes }, ... ]   (newest first)
  //   The top-level `score` and `assessed_at` always reflect the latest entry.
  //   The client reconstructs full session history from these arrays.

  // Fetch all skill rows for a student (each contains full notes-history)
  async getAssessments(studentId) {
    return this.getAll('assessments', {
      filter: { student_id: studentId },
      order:  'assessed_at',
      asc:    false,
    });
  },

  // Save a complete assessment session.
  // `skillRows`  – array of { student_id, skill_key, skill_label, category, score, assessed_at, session_notes }
  // `existingRows` – current DB rows for this student (already fetched by caller)
  // Strategy: for each skill, append a new history entry to the notes JSON array, then upsert.
  async saveAssessmentSession(skillRows, existingRows = []) {
    if (!_supabase) return { data: null, error: new Error('Not initialized') };

    const existingMap = {};
    (existingRows || []).forEach(r => { existingMap[r.skill_key] = r; });

    const upsertPayload = skillRows.map(row => {
      const existing   = existingMap[row.skill_key];
      // Parse existing history or start fresh
      let history = [];
      if (existing?.notes) {
        try { history = JSON.parse(existing.notes); } catch { history = []; }
        if (!Array.isArray(history)) history = [];
      }
      // Prepend new snapshot (newest first)
      history.unshift({
        score:         row.score,
        assessed_at:   row.assessed_at,
        session_notes: row.session_notes || null,
      });

      return {
        student_id:  row.student_id,
        skill_key:   row.skill_key,
        skill_label: row.skill_label || row.skill_key,
        category:    row.category    || 'general',
        score:       row.score,          // latest score
        assessed_at: row.assessed_at,    // latest timestamp
        notes:       JSON.stringify(history),
      };
    });

    const { data, error } = await _supabase
      .from('assessments')
      .upsert(upsertPayload, { onConflict: 'student_id,skill_key' })
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
