/* ============================================================
   MINDS' CRAFT — DASHBOARD PAGE
   ============================================================ */

const DashboardPage = {
  charts: {},

  async render() {
    const container = document.getElementById('page-container');
    container.innerHTML = `
      <div class="dashboard-kpi-grid" id="kpi-grid">
        ${[1,2,3,4].map(() => `<div class="card kpi-card"><div class="kpi-icon-wrap" style="background:var(--bg-tertiary)"></div><div class="kpi-value" style="background:var(--border-color);height:28px;border-radius:6px;width:80px"></div><div class="kpi-label" style="background:var(--border-color);height:14px;border-radius:4px;width:120px;margin-top:6px"></div></div>`).join('')}
      </div>
      <div class="dashboard-charts-row">
        <div class="card">
          <div class="card-header">
            <div>
              <div class="card-title">Revenue vs Enrollment</div>
              <div class="card-subtitle">Last 6 months</div>
            </div>
          </div>
          <div class="chart-container" style="height:260px">
            <canvas id="chart-revenue"></canvas>
          </div>
        </div>
        <div class="card">
          <div class="card-header">
            <div class="card-title">Attendance Overview</div>
          </div>
          <div class="chart-container" style="height:260px;display:flex;align-items:center;justify-content:center">
            <canvas id="chart-attendance" style="max-width:220px;max-height:220px"></canvas>
          </div>
        </div>
      </div>
      <div class="dashboard-bottom-row">
        <div class="card">
          <div class="card-header">
            <div class="card-title">Course Popularity</div>
          </div>
          <div id="course-popularity-list"><div class="empty-state"><i class="fas fa-spinner fa-spin"></i></div></div>
        </div>
        <div class="card">
          <div class="card-header">
            <div class="card-title">Upcoming Events</div>
          </div>
          <div id="upcoming-events-list"><div class="empty-state"><i class="fas fa-spinner fa-spin"></i></div></div>
        </div>
        <div class="card">
          <div class="card-header">
            <div class="card-title">Recent Activity</div>
          </div>
          <ul class="activity-list" id="activity-list"><li class="empty-state"><i class="fas fa-spinner fa-spin"></i></li></ul>
        </div>
      </div>
    `;

    await this.loadData();
  },

  async loadData() {
    try {
      const [
        { data: users },
        { data: courses },
        { data: events },
        { data: transactions },
        { data: enrollments },
        { data: attendance },
        { data: allocations },
      ] = await Promise.all([
        DB.getAll('users'),
        DB.getAll('courses'),
        DB.getAll('events', { filter: { status: 'upcoming' }, limit: 5, order: 'start_date' }),
        DB.getAll('transactions', { limit: 500, order: 'date', asc: false }),
        DB.getAll('enrollments', { select: 'id, status, enrolled_at, level:level_id(course_id)' }),
        DB.getAll('attendance', { limit: 200, order: 'date', asc: false }),
        DB.getAll('student_allocations', { select: 'id, price_paid, start_date', limit: 500 }),
      ]);

      // ─── KPI Cards ───
      const students = (users || []).filter(u => u.user_type === 'student');
      const activeStudents = students.filter(u => u.status === 'active');
      const parents = (users || []).filter(u => u.user_type === 'parent');

      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

      // Monthly income = manual transactions + package allocations in this month
      const monthTxIncome = (transactions || [])
        .filter(t => t.type === 'income' && new Date(t.date) >= monthStart)
        .reduce((s, t) => s + Number(t.amount), 0);
      const monthAllocIncome = (allocations || [])
        .filter(a => a.start_date && new Date(a.start_date) >= monthStart && Number(a.price_paid) > 0)
        .reduce((s, a) => s + Number(a.price_paid), 0);
      const monthIncome = monthTxIncome + monthAllocIncome;

      const totalEnrollments  = (enrollments || []).length;
      const activeEnrollments = (enrollments || []).filter(e => e.status === 'active').length;
      const retentionRate = totalEnrollments > 0 ? Math.round((activeEnrollments / totalEnrollments) * 100) : 0;

      this.renderKPIs([
        { icon: 'fa-users',       color: '#6366f1', bg: 'rgba(99,102,241,.1)',  value: activeStudents.length, label: 'Active Students', change: `${students.length} total`, up: true },
        { icon: 'fa-book-open',   color: '#22c55e', bg: 'rgba(34,197,94,.1)',   value: (courses || []).filter(c => c.status === 'active').length, label: 'Active Courses', change: `${totalEnrollments} enrollments`, up: true },
        { icon: 'fa-percent',     color: '#f59e0b', bg: 'rgba(245,158,11,.1)',  value: retentionRate + '%', label: 'Retention Rate', change: `${activeEnrollments} active`, up: retentionRate > 70 },
        { icon: 'fa-dollar-sign', color: '#22c55e', bg: 'rgba(34,197,94,.1)',   value: Utils.formatCurrency(monthIncome), label: 'Monthly Revenue', change: 'Transactions + Packages', up: true },
      ]);

      // ─── Revenue Chart (transactions + allocation income) ───
      this.renderRevenueChart(transactions || [], enrollments || [], allocations || []);

      // ─── Attendance Chart ───
      this.renderAttendanceChart(attendance || []);

      // ─── Course Popularity ───
      this.renderCoursePopularity(courses || [], enrollments || []);

      // ─── Upcoming Events ───
      this.renderUpcomingEvents(events || []);

      // ─── Recent Activity ───
      this.renderActivity(users || [], transactions || [], attendance || []);

    } catch (err) {
      console.error('Dashboard load error:', err);
      Toast.error('Failed to load dashboard data');
    }
  },

  renderKPIs(kpis) {
    const grid = document.getElementById('kpi-grid');
    if (!grid) return;
    grid.innerHTML = kpis.map(k => `
      <div class="card kpi-card">
        <div class="kpi-icon-wrap" style="background:${k.bg}; color:${k.color}">
          <i class="fas ${k.icon}"></i>
        </div>
        <div class="kpi-value">${Utils.esc(String(k.value))}</div>
        <div class="kpi-label">${Utils.esc(k.label)}</div>
        <div class="kpi-change ${k.up ? 'up' : 'down'}">
          <i class="fas fa-arrow-${k.up ? 'up' : 'down'}"></i>
          ${Utils.esc(k.change)}
        </div>
      </div>
    `).join('');
  },

  renderRevenueChart(transactions, enrollments, allocations) {
    const ctx = document.getElementById('chart-revenue');
    if (!ctx) return;
    if (this.charts.revenue) { this.charts.revenue.destroy(); }

    // Build last 6 months
    const months = [];
    const incomeData = [];
    const enrollData = [];
    const now = new Date();

    for (let i = 5; i >= 0; i--) {
      const d      = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const label  = d.toLocaleString('default', { month: 'short', year: '2-digit' });
      const mStart = new Date(d.getFullYear(), d.getMonth(), 1);
      const mEnd   = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59);
      months.push(label);

      // Revenue: manual transactions income + package allocation income
      const txIncome = (transactions || [])
        .filter(t => t.type === 'income' && new Date(t.date) >= mStart && new Date(t.date) <= mEnd)
        .reduce((s, t) => s + Number(t.amount), 0);
      const allocIncome = (allocations || [])
        .filter(a => a.start_date && Number(a.price_paid) > 0 && new Date(a.start_date) >= mStart && new Date(a.start_date) <= mEnd)
        .reduce((s, a) => s + Number(a.price_paid), 0);
      incomeData.push(txIncome + allocIncome);

      // Real enrollment count by enrolled_at date
      const count = (enrollments || [])
        .filter(e => {
          if (!e.enrolled_at) return false;
          const d2 = new Date(e.enrolled_at);
          return d2 >= mStart && d2 <= mEnd;
        }).length;
      enrollData.push(count);
    }

    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const gridColor = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';
    const textColor = isDark ? '#9ba8c4' : '#6b7280';

    this.charts.revenue = new Chart(ctx, {
      type: 'line',
      data: {
        labels: months,
        datasets: [
          {
            label: 'Revenue ($)',
            data: incomeData,
            borderColor: '#22c55e',
            backgroundColor: 'rgba(34,197,94,0.1)',
            fill: true,
            tension: 0.4,
            pointRadius: 4,
            pointHoverRadius: 6,
          },
          {
            label: 'Enrollments',
            data: enrollData,
            borderColor: '#6366f1',
            backgroundColor: 'rgba(99,102,241,0.08)',
            fill: true,
            tension: 0.4,
            pointRadius: 4,
            pointHoverRadius: 6,
            yAxisID: 'y1',
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { labels: { color: textColor, font: { size: 11 } } } },
        scales: {
          x: { grid: { color: gridColor }, ticks: { color: textColor } },
          y: { grid: { color: gridColor }, ticks: { color: textColor, callback: v => '$' + v } },
          y1: { position: 'right', grid: { display: false }, ticks: { color: textColor } },
        },
      },
    });
  },

  renderAttendanceChart(attendance) {
    const ctx = document.getElementById('chart-attendance');
    if (!ctx) return;
    if (this.charts.att) this.charts.att.destroy();

    const present = attendance.filter(a => a.status === 'present').length;
    const late = attendance.filter(a => a.status === 'late').length;
    const absent = attendance.filter(a => a.status === 'absent').length;
    const total = present + late + absent;

    this.charts.att = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: ['Present', 'Late', 'Absent'],
        datasets: [{
          data: total > 0 ? [present, late, absent] : [1, 0, 0],
          backgroundColor: ['#22c55e', '#f59e0b', '#ef4444'],
          borderWidth: 0,
          hoverOffset: 6,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '72%',
        plugins: {
          legend: {
            position: 'bottom',
            labels: { color: document.documentElement.getAttribute('data-theme') === 'dark' ? '#9ba8c4' : '#6b7280', font: { size: 11 }, padding: 10 },
          },
          tooltip: {
            callbacks: {
              label: (ctx) => {
                const val = ctx.raw;
                const pct = total > 0 ? Math.round((val / total) * 100) : 0;
                return ` ${ctx.label}: ${val} (${pct}%)`;
              }
            }
          }
        },
      },
    });
  },

  renderCoursePopularity(courses, enrollments) {
    const el = document.getElementById('course-popularity-list');
    if (!el) return;
    if (!courses.length) {
      el.innerHTML = '<div class="empty-state"><i class="fas fa-graduation-cap"></i><p>No courses yet</p></div>';
      return;
    }

    // Count ACTIVE enrollments per course using the level join
    const countMap = {};
    (enrollments || []).forEach(e => {
      if (e.status !== 'active') return;
      const courseId = e.level?.course_id;
      if (!courseId) return;
      countMap[courseId] = (countMap[courseId] || 0) + 1;
    });

    // Sort courses by enrollment count descending
    const sorted = [...courses].sort((a, b) => (countMap[b.id] || 0) - (countMap[a.id] || 0));
    const maxCount = Math.max(...sorted.map(c => countMap[c.id] || 0), 1);

    el.innerHTML = sorted.slice(0, 6).map(c => {
      const count = countMap[c.id] || 0;
      const pct = Math.max(Math.round((count / maxCount) * 100), 3);
      return `
        <div style="margin-bottom:14px">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:5px">
            <span style="font-size:var(--font-size-sm);color:var(--text-secondary);font-weight:500">${Utils.esc(c.name)}</span>
            <span style="font-size:var(--font-size-xs);color:var(--text-muted);white-space:nowrap;margin-left:8px">${count} student${count !== 1 ? 's' : ''}</span>
          </div>
          <div class="progress-bar-wrap">
            <div class="progress-bar-fill" style="width:${pct}%"></div>
          </div>
        </div>
      `;
    }).join('');
  },

  renderUpcomingEvents(events) {
    const el = document.getElementById('upcoming-events-list');
    if (!el) return;
    if (!events.length) {
      el.innerHTML = '<div class="empty-state"><i class="fas fa-calendar"></i><p>No upcoming events</p></div>';
      return;
    }
    el.innerHTML = events.slice(0, 4).map(ev => `
      <div style="display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid var(--border-light)">
        <div style="width:10px;height:10px;border-radius:50%;background:${Utils.esc(ev.theme_color || '#22c55e')};flex-shrink:0"></div>
        <div style="flex:1;min-width:0">
          <div style="font-size:var(--font-size-sm);font-weight:600;color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${Utils.esc(ev.title)}</div>
          <div style="font-size:var(--font-size-xs);color:var(--text-muted)">${Utils.formatDate(ev.start_date)}</div>
        </div>
        <span class="badge badge-blue">${Utils.esc(ev.status)}</span>
      </div>
    `).join('');
  },

  renderActivity(users, transactions, attendance) {
    const el = document.getElementById('activity-list');
    if (!el) return;

    const items = [];
    (transactions || []).slice(0, 3).forEach(t => {
      items.push({ icon: 'fa-dollar-sign', bg: '#22c55e', text: `${t.type === 'income' ? 'Income' : 'Expense'}: ${Utils.formatCurrency(t.amount)}`, time: t.created_at || t.date });
    });
    (users || []).slice(0, 3).forEach(u => {
      items.push({ icon: 'fa-user-plus', bg: '#6366f1', text: `New ${u.user_type}: ${u.full_name}`, time: u.created_at });
    });

    items.sort((a, b) => new Date(b.time) - new Date(a.time));

    if (!items.length) {
      el.innerHTML = '<li class="empty-state"><i class="fas fa-clock"></i><p>No recent activity</p></li>';
      return;
    }

    el.innerHTML = items.slice(0, 8).map(item => `
      <li class="activity-item">
        <div class="activity-icon" style="background:${Utils.esc(item.bg)}22; color:${Utils.esc(item.bg)}">
          <i class="fas ${Utils.esc(item.icon)}"></i>
        </div>
        <div>
          <div class="activity-text">${Utils.esc(item.text)}</div>
          <div class="activity-time">${Utils.timeAgo(item.time)}</div>
        </div>
      </li>
    `).join('');
  },
};
