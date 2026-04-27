/* ============================================================
   MINDS' CRAFT — FINANCIALS PAGE
   ============================================================ */

const FinancialsPage = {
  currentTab: 'overview',
  chart: null,
  transactions: [],
  packages: [],
  allocations: [],
  courses: [],          // all courses (for package linking)
  packageCourses: {},   // map: package_id → [course_id, …]
  _allocStudents: [],   // cached for the allocation modal

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────
  async render() {
    const container = document.getElementById('page-container');
    container.innerHTML = `
      <div class="page-header">
        <div class="page-header-left">
          <h2>Financial Control</h2>
          <p>Manage packages, allocations, and transactions.</p>
        </div>
        <div class="page-header-actions">
          <button class="btn btn-secondary" onclick="FinancialsPage.openCreatePackage()">
            <i class="fas fa-box"></i> Create Package
          </button>
          <button class="btn btn-primary" onclick="FinancialsPage.openAddTransaction()">
            <i class="fas fa-plus"></i> Add Transaction
          </button>
        </div>
      </div>

      <div class="tabs">
        <button class="tab-btn active"  onclick="FinancialsPage.switchTab('overview',     this)">Overview</button>
        <button class="tab-btn"         onclick="FinancialsPage.switchTab('analytics',    this)"><i class="fas fa-chart-line" style="margin-right:5px"></i>Analytics</button>
        <button class="tab-btn"         onclick="FinancialsPage.switchTab('packages',     this)">Packages</button>
        <button class="tab-btn"         onclick="FinancialsPage.switchTab('allocations',  this)">Student Allocations</button>
        <button class="tab-btn"         onclick="FinancialsPage.switchTab('transactions', this)">Transactions</button>
      </div>

      <div id="fin-content">
        <div class="page-loading"><i class="fas fa-spinner fa-spin"></i></div>
      </div>
    `;

    await this.loadAll();
    this.currentTab = 'overview';
    this.renderTab();
  },

  async switchTab(tab, btn) {
    this.currentTab = tab;
    document.querySelectorAll('.tabs .tab-btn').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
    // Always reload live data when switching tabs so KPIs/overview stay current
    await this.loadAll();
    this.renderTab();
  },

  // ─────────────────────────────────────────────────────────────────────────
  // DATA LOAD  (always refreshes in-memory arrays)
  // ─────────────────────────────────────────────────────────────────────────
  async loadAll() {
    const [
      { data: tx },
      { data: pkgs },
      { data: alloc },
      { data: courses },
      { data: pkgCourses },
    ] = await Promise.all([
      DB.getTransactions({ limit: 500 }),
      DB.getPackages(),
      DB.getStudentAllocations(),
      DB.getCourses(),
      DB.getAllPackageCourses(),
    ]);
    this.transactions = tx      || [];
    this.packages     = pkgs    || [];
    this.allocations  = alloc   || [];
    this.courses      = courses || [];

    // Build packageCourses map: { [package_id]: [course_id, …] }
    this.packageCourses = {};
    (pkgCourses || []).forEach(r => {
      if (!this.packageCourses[r.package_id]) this.packageCourses[r.package_id] = [];
      this.packageCourses[r.package_id].push(r.course_id);
    });
  },

  // Reload data AND re-render the current tab (used after every mutation)
  async _refresh() {
    await this.loadAll();
    this.renderTab();
  },

  // ─────────────────────────────────────────────────────────────────────────
  // STATS — combines transactions + allocations into unified figures
  // ─────────────────────────────────────────────────────────────────────────
  getMonthStats() {
    const now    = new Date();
    const mStart    = new Date(now.getFullYear(), now.getMonth(), 1);
    const mStartStr = Utils.localDateISO(mStart);

    // ── Build set of allocation IDs already covered by a linked auto-transaction
    //    (tagged [alloc:UUID] in description) — to avoid double-counting ────────
    const allocsWithTx = new Set(
      this.transactions
        .map(t => { const m = (t.description || '').match(/\[alloc:([^\]]+)\]/); return m ? m[1] : null; })
        .filter(Boolean)
    );

    // ── Transactions (manual income + expenses) ──────────────────────────
    const monthTx      = this.transactions.filter(t => t.date >= mStartStr);
    const txIncome     = monthTx.filter(t => t.type === 'income' ).reduce((s, t) => s + Number(t.amount), 0);
    const txExpense    = monthTx.filter(t => t.type === 'expense').reduce((s, t) => s + Number(t.amount), 0);
    const allTxIncome  = this.transactions.filter(t => t.type === 'income' ).reduce((s, t) => s + Number(t.amount), 0);
    const allTxExpense = this.transactions.filter(t => t.type === 'expense').reduce((s, t) => s + Number(t.amount), 0);

    // ── Allocations WITHOUT a linked transaction (legacy / pre-auto-tx) ──
    //    Only these need to be added separately; newer ones are already in txIncome
    const orphanAllocs    = this.allocations.filter(a => a.price_paid > 0 && !allocsWithTx.has(a.id));
    const monthOrphan     = orphanAllocs.filter(a => a.start_date && a.start_date >= mStartStr);
    const allocIncome     = monthOrphan.reduce((s, a) => s + Number(a.price_paid || 0), 0);
    const allAllocIncome  = orphanAllocs.reduce((s, a) => s + Number(a.price_paid || 0), 0);

    return {
      income:  txIncome  + allocIncome,
      expense: txExpense,
      net:    (txIncome + allocIncome) - txExpense,
      balance: (allTxIncome + allAllocIncome) - allTxExpense,
      txIncome, txExpense, allocIncome, allTxIncome, allTxExpense, allAllocIncome,
    };
  },

  // ─────────────────────────────────────────────────────────────────────────
  // TAB ROUTER
  // ─────────────────────────────────────────────────────────────────────────
  renderTab() {
    const el = document.getElementById('fin-content');
    if (!el) return;
    switch (this.currentTab) {
      case 'overview':     this.renderOverview(el);     break;
      case 'analytics':    this.renderAnalytics(el);    break;
      case 'packages':     this.renderPackages(el);     break;
      case 'allocations':  this.renderAllocations(el);  break;
      case 'transactions': this.renderTransactions(el); break;
    }
  },

  // ─────────────────────────────────────────────────────────────────────────
  // OVERVIEW TAB
  // ─────────────────────────────────────────────────────────────────────────
  renderOverview(el) {
    const stats       = this.getMonthStats();   // always recalculated from live data
    const activeSubs  = this.allocations.filter(a => a.status === 'active').length;
    // Total subscription revenue (for display label only):
    //   = auto-linked tx income (tagged [alloc:]) + orphan allocation prices (no linked tx)
    const _subTxIncome = this.transactions
      .filter(t => t.type === 'income' && (t.description || '').match(/\[alloc:[^\]]+\]/))
      .reduce((s, t) => s + Number(t.amount || 0), 0);
    const allAllocPaid = _subTxIncome + stats.allAllocIncome;

    // Build informative sub-labels showing the breakdown
    const incomeSub = stats.allocIncome > 0
      ? `${Utils.formatCurrency(stats.txIncome)} tx + ${Utils.formatCurrency(stats.allocIncome)} subs`
      : 'This month';
    const balanceSub = `${Utils.formatCurrency(stats.allTxIncome + stats.allAllocIncome)} in · ${Utils.formatCurrency(stats.allTxExpense)} out`;

    el.innerHTML = `
      <div class="financials-kpi-grid">
        ${[
          { icon: 'fa-wallet',     color: '#6366f1', bg: 'rgba(99,102,241,.1)',  val: Utils.formatCurrency(stats.balance), lbl: 'Total Balance',        sub: balanceSub                                },
          { icon: 'fa-arrow-up',   color: '#22c55e', bg: 'rgba(34,197,94,.1)',   val: Utils.formatCurrency(stats.income),  lbl: 'Monthly Income',       sub: incomeSub                                 },
          { icon: 'fa-arrow-down', color: '#ef4444', bg: 'rgba(239,68,68,.1)',   val: Utils.formatCurrency(stats.expense), lbl: 'Monthly Expenses',     sub: 'This month'                              },
          { icon: 'fa-id-card',    color: '#8b5cf6', bg: 'rgba(139,92,246,.1)',  val: activeSubs,                          lbl: 'Active Subscriptions', sub: `${Utils.formatCurrency(allAllocPaid)} total collected` },
          { icon: 'fa-chart-line', color: '#f59e0b', bg: 'rgba(245,158,11,.1)',  val: Utils.formatCurrency(stats.net),     lbl: 'Monthly Net Profit',   sub: stats.net >= 0 ? '▲ Positive' : '▼ Negative' },
        ].map(k => `
          <div class="card kpi-card">
            <div class="kpi-icon-wrap" style="background:${k.bg};color:${k.color}">
              <i class="fas ${k.icon}"></i>
            </div>
            <div class="kpi-value">${k.val}</div>
            <div class="kpi-label">${k.lbl}</div>
            <div class="kpi-change" style="color:${k.color};font-size:10px;margin-top:3px">${k.sub}</div>
          </div>
        `).join('')}
      </div>
      <div class="grid-2">
        <div class="card">
          <div class="card-header">
            <div class="card-title">Income vs Expenses</div>
            <span style="font-size:var(--font-size-xs);color:var(--text-muted)">Last 6 months</span>
          </div>
          <div class="chart-container" style="height:260px"><canvas id="fin-chart"></canvas></div>
        </div>
        <div class="card" style="display:flex;flex-direction:column">
          <div class="card-header" style="flex-wrap:wrap;gap:8px">
            <div class="card-title">
              Due Packages
              <span class="badge badge-red" style="margin-left:6px">Action Required</span>
            </div>
            <div class="search-input-wrap" style="flex:1;min-width:130px;max-width:200px">
              <i class="fas fa-search"></i>
              <input type="text" id="due-pkg-search" placeholder="Search student…"
                oninput="FinancialsPage.filterDuePackages(this.value)" />
            </div>
          </div>
          <div id="due-packages-list" style="overflow-y:auto;max-height:320px;padding-right:4px">${this.renderDuePackages()}</div>
        </div>
      </div>
      <div class="card" style="margin-top:1rem">
        <div class="card-header">
          <div class="card-title">Recent Transactions</div>
          <button class="btn btn-ghost btn-sm"
            onclick="FinancialsPage.switchTab('transactions', document.querySelectorAll('.tabs .tab-btn')[3])">
            View All
          </button>
        </div>
        ${this.transactionTableHTML(this._mergedLedger().slice(0, 8))}
      </div>
    `;
    setTimeout(() => this.renderFinChart(), 50);
  },

  // ─────────────────────────────────────────────────────────────────────────
  // ANALYTICS TAB — Income Forecast + Expenses chart
  // ─────────────────────────────────────────────────────────────────────────
  _forecastThreshold: 900,   // default $900/month threshold (editable)
  _forecastChart: null,
  _expenseChart: null,

  renderAnalytics(el) {
    el.innerHTML = `
      <!-- ── Income Forecast ── -->
      <div class="card" style="margin-bottom:1.25rem">
        <div class="card-header" style="flex-wrap:wrap;gap:10px">
          <div>
            <div class="card-title">📈 Monthly Income Forecast</div>
            <div style="font-size:var(--font-size-xs);color:var(--text-muted);margin-top:2px">
              Projected renewals from active packages over the next 12 months
            </div>
          </div>
          <div style="display:flex;align-items:center;gap:8px;margin-left:auto">
            <label style="font-size:var(--font-size-xs);color:var(--text-muted);white-space:nowrap">
              <i class="fas fa-bullseye" style="color:#ef4444;margin-right:4px"></i>Target ($)
            </label>
            <input type="number" id="forecast-threshold" value="${this._forecastThreshold}"
              min="0" step="50"
              style="width:90px;padding:4px 8px;border-radius:var(--radius-sm);
                border:1px solid var(--border-color);background:var(--bg-secondary);
                color:var(--text-primary);font-size:var(--font-size-sm)"
              oninput="FinancialsPage._forecastThreshold=Number(this.value)||0; FinancialsPage._buildForecastChart()" />
          </div>
        </div>
        <div style="height:300px"><canvas id="forecast-chart"></canvas></div>
        <div id="forecast-summary" style="margin-top:10px;display:flex;flex-wrap:wrap;gap:8px;padding:0 4px"></div>
      </div>

      <!-- ── Monthly Expenses ── -->
      <div class="card">
        <div class="card-header">
          <div>
            <div class="card-title">💸 Monthly Expenses</div>
            <div style="font-size:var(--font-size-xs);color:var(--text-muted);margin-top:2px">
              Recorded expense transactions — last 12 months
            </div>
          </div>
        </div>
        <div style="height:280px"><canvas id="expense-chart"></canvas></div>
        <div id="expense-summary" style="margin-top:10px;display:flex;flex-wrap:wrap;gap:8px;padding:0 4px"></div>
      </div>
    `;
    setTimeout(() => {
      this._buildForecastChart();
      this._buildExpenseChart();
    }, 50);
  },

  // ── Income Forecast logic ─────────────────────────────────────────────────
  _buildForecastChart() {
    const ctx = document.getElementById('forecast-chart');
    if (!ctx) return;
    if (this._forecastChart) { this._forecastChart.destroy(); this._forecastChart = null; }

    const now    = new Date();
    const months = 12;
    const labels = [], forecastData = [], actualData = [];

    // Dedup: allocations already linked to an auto-transaction
    const allocsWithTx = new Set(
      this.transactions
        .map(t => { const m = (t.description || '').match(/\[alloc:([^\]]+)\]/); return m ? m[1] : null; })
        .filter(Boolean)
    );

    // ── Active allocations (price > 0) ────────────────────────────────────────
    const activeAllocs = this.allocations.filter(
      a => a.status === 'active' && Number(a.price_paid) > 0 && a.start_date && a.end_date
    );

    // ── Build per-student renewal schedule ───────────────────────────────────
    // For each allocation compute:
    //   • durMonths = number of calendar months from start_date to end_date
    //   • renewalMonths = the future months (within our 12-month window)
    //     where a renewal payment is expected, i.e. the months that are
    //     multiples of durMonths from start_date onward.
    //
    // Example – 3-month package starting 2026-02-01 ending 2026-04-30 ($300):
    //   renewal occurs on Feb, May, Aug, Nov → full $300 shown in each of those months.
    //
    // Example – 1-month package starting 2026-03-01 ($80):
    //   renewal every month → $80 shown in every month.

    const allStudentContribs = []; // { studentName, packageName, price, durMonths, renewalMonths[] }

    activeAllocs.forEach(a => {
      const price = Number(a.price_paid);

      // Parse start / end as local dates (avoid UTC midnight shift)
      const [sy, sm, sd] = a.start_date.split('-').map(Number);
      const [ey, em]     = a.end_date.split('-').map(Number);

      // Duration in whole calendar months (minimum 1)
      const durMonths = Math.max(1, (ey - sy) * 12 + (em - sm));

      // Find first renewal month (= month after end_date month, i.e. start + durMonths)
      // Then keep stepping +durMonths until we exceed the 12-month window.
      const windowEnd = new Date(now.getFullYear(), now.getMonth() + months, 1);

      // First renewal: same calendar day as start_date, durMonths later
      let renewYear  = sy + Math.floor((sm - 1 + durMonths) / 12);
      let renewMonth = ((sm - 1 + durMonths) % 12); // 0-based month

      const renewalMonths = []; // indices into our 0..11 forecast window

      // Also count the CURRENT active period: if start_date falls inside the window,
      // it represents the payment already collected / due for the current cycle.
      // We include the start month itself as the first "collection" point.
      const startForecastIdx = (sy - now.getFullYear()) * 12 + (sm - 1 - now.getMonth());
      if (startForecastIdx >= 0 && startForecastIdx < months) {
        renewalMonths.push(startForecastIdx);
      }

      // Future renewals
      while (true) {
        const rDate = new Date(renewYear, renewMonth, 1);
        if (rDate >= windowEnd) break;
        const idx = (renewYear - now.getFullYear()) * 12 + (renewMonth - now.getMonth());
        if (idx >= 0 && idx < months) {
          renewalMonths.push(idx);
        }
        // Advance by durMonths
        const nextTotal = renewMonth + durMonths;
        renewYear  = renewYear + Math.floor(nextTotal / 12);
        renewMonth = nextTotal % 12;
      }

      allStudentContribs.push({
        studentName  : a.student?.full_name || 'Unknown',
        packageName  : a.package?.name || '',
        price,
        durMonths,
        renewalMonths,
      });
    });

    // ── Build forecastData array ──────────────────────────────────────────────
    for (let i = 0; i < months; i++) forecastData.push(0);

    allStudentContribs.forEach(c => {
      c.renewalMonths.forEach(idx => {
        forecastData[idx] = Math.round((forecastData[idx] + c.price) * 100) / 100;
      });
    });

    // ── Build actualData (recorded income, past + current month) ─────────────
    for (let i = 0; i < months; i++) {
      const d    = new Date(now.getFullYear(), now.getMonth() + i, 1);
      const mEnd = new Date(d.getFullYear(), d.getMonth() + 1, 0);
      const s    = Utils.localDateISO(d);
      const e    = Utils.localDateISO(mEnd);
      labels.push(d.toLocaleString('default', { month: 'short', year: '2-digit' }));

      const txInc = this.transactions
        .filter(t => t.type === 'income' && (t.date || '') >= s && (t.date || '') <= e)
        .reduce((sum, t) => sum + Number(t.amount), 0);
      const orphInc = this.allocations
        .filter(a => Number(a.price_paid) > 0 && !allocsWithTx.has(a.id)
          && (a.start_date || '') >= s && (a.start_date || '') <= e)
        .reduce((sum, a) => sum + Number(a.price_paid), 0);
      actualData.push(Math.round((txInc + orphInc) * 100) / 100);
    }

    // ── Chart ─────────────────────────────────────────────────────────────────
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const gc     = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';
    const tc     = isDark ? '#9ba8c4' : '#6b7280';
    const thresh = this._forecastThreshold || 0;

    this._forecastChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: 'Projected Collections ($)',
            data: forecastData,
            backgroundColor: forecastData.map(v => v >= thresh
              ? 'rgba(34,197,94,0.75)' : 'rgba(239,68,68,0.65)'),
            borderRadius: 6,
            order: 2,
          },
          {
            label: 'Actual Recorded ($)',
            data: actualData,
            type: 'line',
            borderColor: '#6366f1',
            backgroundColor: 'rgba(99,102,241,0.10)',
            borderWidth: 2,
            pointRadius: 4,
            fill: false,
            tension: 0.3,
            order: 1,
          },
          {
            label: `Target: $${thresh}`,
            data: Array(months).fill(thresh),
            type: 'line',
            borderColor: '#ef4444',
            borderWidth: 2,
            borderDash: [6, 4],
            pointRadius: 0,
            fill: false,
            order: 0,
          },
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { labels: { color: tc, font: { size: 11 } } },
          tooltip: {
            callbacks: {
              label: ctx2 => {
                const v = ctx2.parsed.y;
                return ` ${ctx2.dataset.label.split('(')[0].trim()}: $${v.toFixed(2)}`;
              },
              afterBody: (items) => {
                if (items[0]?.datasetIndex === 0) {
                  const v    = items[0].parsed.y;
                  const diff = v - thresh;
                  // List which students pay this month
                  const monthIdx = items[0].dataIndex;
                  const payers   = allStudentContribs
                    .filter(c => c.renewalMonths.includes(monthIdx))
                    .map(c => `  • ${c.studentName} (${c.packageName}): $${c.price.toFixed(0)}`);
                  const targetLine = diff >= 0
                    ? [`✅ $${diff.toFixed(0)} above target`]
                    : [`⚠️ $${Math.abs(diff).toFixed(0)} below target`];
                  return [...targetLine, ...payers];
                }
              },
            },
          },
        },
        scales: {
          x: { grid: { color: gc }, ticks: { color: tc } },
          y: { grid: { color: gc }, ticks: { color: tc, callback: v => '$' + v } },
        },
      },
    });

    // ── Summary ───────────────────────────────────────────────────────────────
    const summaryEl = document.getElementById('forecast-summary');
    if (summaryEl) {
      const aboveTarget  = forecastData.filter(v => v >= thresh).length;
      const avgMonthly   = forecastData.reduce((a, b) => a + b, 0) / months;
      const peakVal      = Math.max(...forecastData);
      const peakIdx      = forecastData.indexOf(peakVal);
      const gap          = avgMonthly - thresh;

      const chips = [
        { label: 'Avg projected / month', val: Utils.formatCurrency(avgMonthly), color: '#22c55e' },
        { label: 'vs target (avg)', val: (gap >= 0 ? '+' : '') + Utils.formatCurrency(gap),
          color: gap >= 0 ? '#22c55e' : '#ef4444' },
        { label: 'Months above target', val: `${aboveTarget} / ${months}`,
          color: aboveTarget === months ? '#22c55e' : aboveTarget >= months / 2 ? '#f59e0b' : '#ef4444' },
        { label: 'Peak month', val: `${labels[peakIdx] || '—'} (${Utils.formatCurrency(peakVal)})`, color: '#6366f1' },
        { label: 'Active students', val: allStudentContribs.length, color: '#0ea5e9' },
      ].map(c => `
        <div style="display:inline-flex;align-items:center;gap:8px;padding:6px 14px;
          border-radius:99px;border:1px solid ${c.color}33;background:${c.color}11">
          <span style="font-weight:700;color:${c.color}">${c.val}</span>
          <span style="font-size:var(--font-size-xs);color:var(--text-muted)">${c.label}</span>
        </div>
      `).join('');

      // Per-student renewal schedule
      const rows = allStudentContribs
        .sort((a, b) => b.price - a.price)
        .map(r => {
          const renewLabels = r.renewalMonths.map(idx => labels[idx] || '').filter(Boolean).join(', ');
          return `
            <div style="display:flex;align-items:center;justify-content:space-between;
              padding:6px 10px;border-radius:var(--radius-sm);margin-bottom:3px;
              background:var(--bg-tertiary);font-size:var(--font-size-xs)">
              <div style="display:flex;align-items:center;gap:8px;min-width:0;flex:1">
                <div style="width:6px;height:6px;border-radius:50%;background:#22c55e;flex-shrink:0"></div>
                <span style="font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${Utils.esc(r.studentName)}</span>
                <span style="color:var(--text-muted);flex-shrink:0">${Utils.esc(r.packageName)}</span>
                <span style="color:var(--text-muted);flex-shrink:0">${r.durMonths}mo pkg</span>
              </div>
              <div style="text-align:right;flex-shrink:0;margin-left:12px">
                <div style="font-weight:700;color:var(--brand-primary)">${Utils.formatCurrency(r.price)} / ${r.durMonths}mo</div>
                <div style="color:var(--text-muted);font-size:10px">Collects: ${renewLabels || '—'}</div>
              </div>
            </div>
          `;
        }).join('');

      summaryEl.innerHTML = `
        <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:10px">${chips}</div>
        ${allStudentContribs.length ? `
          <button onclick="
            const p=document.getElementById('forecast-schedule-panel');
            const ic=document.getElementById('forecast-schedule-icon');
            const open=p.style.display==='none';
            p.style.display=open?'block':'none';
            ic.className=open?'fas fa-chevron-up':'fas fa-chevron-down';
            this.style.borderBottomLeftRadius=open?'0':'var(--radius-sm)';
            this.style.borderBottomRightRadius=open?'0':'var(--radius-sm)';"
            style="display:flex;align-items:center;gap:8px;padding:7px 14px;
              border-radius:var(--radius-sm);border:1px solid var(--border-color);
              background:var(--bg-secondary);cursor:pointer;font-size:var(--font-size-xs);
              font-weight:600;color:var(--text-primary);width:100%;text-align:left;
              transition:.15s" type="button">
            <i class="fas fa-users" style="color:var(--brand-primary)"></i>
            Per-student collection schedule
            <span style="color:var(--text-muted);font-weight:400;margin-left:2px">(${allStudentContribs.length} student${allStudentContribs.length > 1 ? 's' : ''})</span>
            <i id="forecast-schedule-icon" class="fas fa-chevron-down" style="margin-left:auto;color:var(--text-muted)"></i>
          </button>
          <div id="forecast-schedule-panel" style="display:none;border:1px solid var(--border-color);
            border-top:none;border-radius:0 0 var(--radius-sm) var(--radius-sm);
            background:var(--bg-secondary);padding:8px;max-height:320px;overflow-y:auto">
            ${rows}
          </div>
        ` : '<p style="font-size:var(--font-size-sm);color:var(--text-muted)">No active allocations found.</p>'}
      `;
    }
  },

  // ── Monthly Expenses chart ────────────────────────────────────────────────
  _buildExpenseChart() {
    const ctx = document.getElementById('expense-chart');
    if (!ctx) return;
    if (this._expenseChart) { this._expenseChart.destroy(); this._expenseChart = null; }

    const now = new Date();
    const labels = [], expData = [], categories = {};

    for (let i = 11; i >= 0; i--) {
      const d    = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const mEnd = new Date(d.getFullYear(), d.getMonth() + 1, 0);
      const s    = Utils.localDateISO(d);
      const e    = Utils.localDateISO(mEnd);
      labels.push(d.toLocaleString('default', { month: 'short', year: '2-digit' }));

      const monthExp = this.transactions
        .filter(t => t.type === 'expense' && (t.date || '') >= s && (t.date || '') <= e);
      expData.push(monthExp.reduce((sum, t) => sum + Number(t.amount), 0));

      // Aggregate categories
      monthExp.forEach(t => {
        const cat = t.category || 'General';
        categories[cat] = (categories[cat] || 0) + Number(t.amount);
      });
    }

    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const gc = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';
    const tc = isDark ? '#9ba8c4' : '#6b7280';
    const avg = expData.reduce((a, b) => a + b, 0) / expData.filter(v => v > 0).length || 0;

    this._expenseChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: 'Expenses ($)',
          data: expData,
          backgroundColor: expData.map(v => v > avg * 1.3
            ? 'rgba(239,68,68,0.80)'
            : v > 0 ? 'rgba(245,158,11,0.75)' : 'rgba(156,163,175,0.35)'),
          borderRadius: 6,
        }],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: c => ` $${c.parsed.y.toFixed(2)}` } },
        },
        scales: {
          x: { grid: { color: gc }, ticks: { color: tc } },
          y: { grid: { color: gc }, ticks: { color: tc, callback: v => '$' + v } },
        },
      },
    });

    // Top-category summary
    const summaryEl = document.getElementById('expense-summary');
    if (summaryEl) {
      const total = expData.reduce((a, b) => a + b, 0);
      const sorted = Object.entries(categories).sort((a, b) => b[1] - a[1]).slice(0, 5);
      const colors = ['#ef4444','#f59e0b','#6366f1','#8b5cf6','#22c55e'];
      summaryEl.innerHTML = sorted.map(([cat, amt], i) => `
        <div style="display:inline-flex;align-items:center;gap:8px;padding:6px 14px;
          border-radius:99px;border:1px solid ${colors[i]}33;background:${colors[i]}11">
          <span style="font-weight:700;color:${colors[i]}">${Utils.formatCurrency(amt)}</span>
          <span style="font-size:var(--font-size-xs);color:var(--text-muted)">${Utils.esc(cat)}</span>
          <span style="font-size:10px;color:${colors[i]};opacity:.7">${total > 0 ? Math.round(amt/total*100) : 0}%</span>
        </div>
      `).join('');
    }
  },

  renderDuePackages(filter) {
    const soon = new Date();
    soon.setDate(soon.getDate() + 14);
    const soonStr = Utils.localDateISO(soon);
    let due = this.allocations.filter(a => a.status === 'active' && a.end_date <= soonStr);

    // Apply optional name filter
    const q = (filter !== undefined ? filter : document.getElementById('due-pkg-search')?.value || '').toLowerCase().trim();
    if (q) due = due.filter(a => (a.student?.full_name || '').toLowerCase().includes(q));

    if (!due.length) {
      return q
        ? `<div class="empty-state"><i class="fas fa-search"></i><p>No results for "<strong>${Utils.esc(q)}</strong>"</p></div>`
        : '<div class="empty-state"><i class="fas fa-check-circle"></i><p>No packages due soon</p></div>';
    }

    return due.map(a => {
      const daysLeft = Math.ceil((new Date(a.end_date) - new Date()) / 86400000);
      const urgency  = daysLeft <= 0 ? 'badge-red' : daysLeft <= 3 ? 'badge-red' : daysLeft <= 7 ? 'badge-yellow' : 'badge-blue';
      const label    = daysLeft <= 0 ? 'Expired' : `${daysLeft}d left`;
      return `
        <div class="due-item due-pkg-row"
          data-student="${(a.student?.full_name || '').toLowerCase()}"
          onclick="FinancialsPage.openEditAllocation('${a.id}')"
          style="cursor:pointer;transition:.15s;border-radius:var(--radius-md);padding:10px 12px;
            margin-bottom:4px;border:1px solid transparent;display:flex;align-items:center;justify-content:space-between"
          onmouseover="this.style.background='var(--bg-tertiary)';this.style.borderColor='var(--brand-primary)44'"
          onmouseout="this.style.background='';this.style.borderColor='transparent'">
          <div style="display:flex;align-items:center;gap:8px;min-width:0">
            <div style="width:34px;height:34px;border-radius:50%;background:rgba(99,102,241,.12);
              display:flex;align-items:center;justify-content:center;flex-shrink:0">
              <i class="fas fa-box" style="color:var(--brand-primary);font-size:13px"></i>
            </div>
            <div style="min-width:0">
              <div style="font-weight:600;font-size:var(--font-size-sm);white-space:nowrap;
                overflow:hidden;text-overflow:ellipsis">${Utils.esc(a.student?.full_name || 'Unknown')}</div>
              <div style="font-size:var(--font-size-xs);color:var(--text-muted)">${Utils.esc(a.package?.name || 'Package')}</div>
            </div>
          </div>
          <div style="text-align:right;flex-shrink:0">
            <div class="badge ${urgency}">${label}</div>
            <div style="font-size:var(--font-size-xs);color:var(--text-muted);margin-top:2px">${Utils.formatDate(a.end_date)}</div>
            <div style="font-size:10px;color:var(--brand-primary);margin-top:2px;font-weight:500">
              <i class="fas fa-redo" style="font-size:9px"></i> Click to renew
            </div>
          </div>
        </div>
      `;
    }).join('');
  },

  filterDuePackages(q) {
    const list = document.getElementById('due-packages-list');
    if (!list) return;
    list.innerHTML = this.renderDuePackages(q);
  },

  renderFinChart() {
    const ctx = document.getElementById('fin-chart');
    if (!ctx) return;
    if (this.chart) { this.chart.destroy(); this.chart = null; }

    // ── Dedup: allocations already covered by a linked auto-transaction ──
    const allocsWithTx = new Set(
      this.transactions
        .map(t => { const m = (t.description || '').match(/\[alloc:([^\]]+)\]/); return m ? m[1] : null; })
        .filter(Boolean)
    );
    const orphanAllocs = this.allocations.filter(a => a.price_paid > 0 && !allocsWithTx.has(a.id));

    const months = [], txIncomeData = [], orphanAllocData = [], expenseData = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d    = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const mEnd = new Date(d.getFullYear(), d.getMonth() + 1, 0);
      const s    = Utils.localDateISO(d);
      const e    = Utils.localDateISO(mEnd);
      months.push(d.toLocaleString('default', { month: 'short', year: '2-digit' }));
      // Transaction income (already includes auto-generated subscription transactions)
      txIncomeData.push(this.transactions.filter(t => t.type==='income' && t.date >= s && t.date <= e).reduce((a, t) => a + Number(t.amount), 0));
      // Only add orphan allocations (no linked transaction) to avoid double-counting
      orphanAllocData.push(orphanAllocs.filter(a => a.start_date >= s && a.start_date <= e).reduce((a, al) => a + Number(al.price_paid || 0), 0));
      expenseData.push(this.transactions.filter(t => t.type==='expense' && t.date >= s && t.date <= e).reduce((a, t) => a + Number(t.amount), 0));
    }

    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const gc = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';
    const tc = isDark ? '#9ba8c4' : '#6b7280';

    this.chart = new Chart(ctx, {
      type: 'bar',
      data: { labels: months, datasets: [
        { label: 'Income',        data: txIncomeData,     backgroundColor: 'rgba(34,197,94,0.75)',  borderRadius: 5, stack: 'income' },
        { label: 'Legacy Subs',   data: orphanAllocData,  backgroundColor: 'rgba(99,102,241,0.70)', borderRadius: 5, stack: 'income' },
        { label: 'Expenses',      data: expenseData,      backgroundColor: 'rgba(239,68,68,0.65)',  borderRadius: 5, stack: 'expense' },
      ]},
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { labels: { color: tc, font: { size: 11 } } } },
        scales: {
          x: { stacked: true, grid: { color: gc }, ticks: { color: tc } },
          y: { stacked: false, grid: { color: gc }, ticks: { color: tc, callback: v => '$' + v } },
        },
      },
    });
  },

  // ─────────────────────────────────────────────────────────────────────────
  // PACKAGES TAB
  // ─────────────────────────────────────────────────────────────────────────
  renderPackages(el) {
    el.innerHTML = `
      <div class="grid-3" id="pkg-grid">
        ${this.packages.length
          ? this.packages.map(p => this.packageCardHTML(p)).join('')
          : '<div class="empty-state"><i class="fas fa-box"></i><h3>No packages</h3><p>Create subscription packages.</p></div>'}
      </div>
    `;
  },

  packageCardHTML(p) {
    // Linked courses for this package
    const linkedIds   = this.packageCourses[p.id] || [];
    const linkedNames = linkedIds
      .map(cid => this.courses.find(c => c.id === cid))
      .filter(Boolean)
      .map(c => c.name);

    const coursePills = linkedNames.length
      ? linkedNames.map(n =>
          `<span style="display:inline-flex;align-items:center;gap:4px;background:rgba(34,197,94,.12);
            color:var(--brand-primary);border:1px solid rgba(34,197,94,.25);
            border-radius:20px;padding:2px 9px;font-size:.72rem;font-weight:600;white-space:nowrap">
            <i class="fas fa-graduation-cap" style="font-size:.62rem"></i>${Utils.esc(n)}
          </span>`).join('')
      : `<span style="font-size:.75rem;color:var(--text-muted);font-style:italic">No courses linked</span>`;

    return `
      <div class="package-card">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;margin-bottom:.8rem">
          <h3 style="font-size:var(--font-size-md);font-weight:700">${Utils.esc(p.name)}</h3>
          ${Utils.statusBadge(p.status)}
        </div>
        <div style="font-size:var(--font-size-3xl);font-weight:800;color:var(--brand-primary);margin-bottom:.5rem">
          ${Utils.formatCurrency(p.base_price)}
        </div>
        <div style="font-size:var(--font-size-sm);color:var(--text-muted);margin-bottom:.8rem">
          ${p.duration_months} month${p.duration_months > 1 ? 's' : ''}
          ${p.default_discount > 0 ? ` · ${p.default_discount}% default discount` : ''}
        </div>
        ${p.description ? `<p style="font-size:var(--font-size-sm);color:var(--text-muted);margin-bottom:.6rem">${Utils.esc(p.description)}</p>` : ''}

        <div style="margin-bottom:.9rem">
          <div style="font-size:.72rem;color:var(--text-muted);font-weight:600;text-transform:uppercase;
            letter-spacing:.04em;margin-bottom:.35rem">Linked Courses</div>
          <div style="display:flex;flex-wrap:wrap;gap:4px">${coursePills}</div>
        </div>

        <div style="display:flex;gap:6px;margin-top:auto">
          <button class="btn btn-ghost btn-sm" onclick="FinancialsPage.openEditPackage('${p.id}')">
            <i class="fas fa-edit"></i> Edit
          </button>
          <button class="btn btn-danger btn-sm" onclick="FinancialsPage.deletePackage('${p.id}','${Utils.esc(p.name)}')">
            <i class="fas fa-trash"></i>
          </button>
        </div>
      </div>
    `;
  },

  openCreatePackage() { Modal.open('Create New Package', this.packageFormHTML(null)); },
  openEditPackage(id) {
    const p = this.packages.find(p => p.id === id);
    if (p) Modal.open('Edit Package', this.packageFormHTML(p));
  },

  packageFormHTML(p) {
    const linkedIds = p ? (this.packageCourses[p.id] || []) : [];

    // Course checkboxes — one per course in the system
    const courseCheckboxes = this.courses.length
      ? this.courses.map(c => {
          const checked = linkedIds.includes(c.id) ? 'checked' : '';
          return `
            <label style="display:flex;align-items:center;gap:8px;padding:7px 10px;
              background:var(--bg-card2);border-radius:6px;cursor:pointer;
              border:1px solid var(--border);transition:border-color .15s"
              onmouseover="this.style.borderColor='var(--brand-primary)'"
              onmouseout="this.style.borderColor='var(--border)'">
              <input type="checkbox" name="course_ids" value="${c.id}" ${checked}
                style="width:15px;height:15px;accent-color:var(--brand-primary);cursor:pointer" />
              <span style="font-size:.83rem;font-weight:500">${Utils.esc(c.name)}</span>
              <span style="margin-left:auto;font-size:.72rem;color:var(--text-muted)">
                ${c.status === 'active' ? '' : '<em>inactive</em>'}
              </span>
            </label>`;
        }).join('')
      : '<p style="font-size:.8rem;color:var(--text-muted)">No courses found. Create courses first.</p>';

    return `
      <form onsubmit="FinancialsPage.savePackage(event, ${p ? `'${p.id}'` : 'null'})">
        <div class="form-group">
          <label class="form-label">Package Name *</label>
          <input type="text" name="name" class="form-input" required value="${Utils.esc(p?.name || '')}" />
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Duration (months)</label>
            <input type="number" name="duration_months" class="form-input" value="${p?.duration_months || 1}" min="1" />
          </div>
          <div class="form-group">
            <label class="form-label">Base Price ($)</label>
            <input type="number" name="base_price" class="form-input" step="0.01" value="${p?.base_price || '0'}" />
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Default Discount (%)</label>
            <input type="number" name="default_discount" class="form-input" step="0.1" value="${p?.default_discount || '0'}" max="100" />
          </div>
          <div class="form-group">
            <label class="form-label">Status</label>
            <select name="status" class="form-select">
              <option value="active"   ${p?.status==='active'  ?'selected':''}>Active</option>
              <option value="inactive" ${p?.status==='inactive'?'selected':''}>Inactive</option>
            </select>
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Description</label>
          <textarea name="description" class="form-textarea">${Utils.esc(p?.description || '')}</textarea>
        </div>

        <!-- ── Course Links ── -->
        <div class="form-group">
          <label class="form-label" style="display:flex;align-items:center;gap:6px">
            <i class="fas fa-graduation-cap" style="color:var(--brand-primary)"></i>
            Linked Courses
            <span style="font-size:.72rem;color:var(--text-muted);font-weight:400">(tick all courses this package applies to)</span>
          </label>
          <div style="display:flex;flex-direction:column;gap:5px;max-height:180px;
            overflow-y:auto;padding:2px 0">
            ${courseCheckboxes}
          </div>
        </div>

        <div class="modal-footer" style="padding:0;border:none;margin-top:1rem">
          <button type="button" class="btn btn-secondary" onclick="Modal.close()">Cancel</button>
          <button type="submit" class="btn btn-primary">
            <i class="fas fa-save"></i> ${p ? 'Save Changes' : 'Create Package'}
          </button>
        </div>
      </form>
    `;
  },

  async savePackage(e, id) {
    e.preventDefault();
    const fd = new FormData(e.target);

    // Collect checked course IDs (getAll returns array for multiple checkboxes)
    const courseIds = fd.getAll('course_ids');  // [] or ['uuid1', 'uuid2', …]

    // Build package data (exclude course_ids — stored in junction table)
    const data = {
      name:             fd.get('name'),
      duration_months:  parseInt(fd.get('duration_months'))    || 1,
      base_price:       parseFloat(fd.get('base_price'))       || 0,
      default_discount: parseFloat(fd.get('default_discount')) || 0,
      status:           fd.get('status') || 'active',
      description:      fd.get('description') || null,
    };
    if (!data.description) data.description = null;

    try {
      // 1. Save the package itself
      const result = id ? await DB.updatePackage(id, data) : await DB.createPackage(data);
      if (result.error) throw result.error;

      // 2. Save course links
      const packageId = id || result.data?.id;
      if (packageId) {
        const { error: linkErr } = await DB.setPackageCourses(packageId, courseIds);
        if (linkErr) {
          // Non-fatal: package saved but links may have failed (table may not exist yet)
          console.warn('setPackageCourses error:', linkErr.message);
          Toast.warning?.('Package saved, but course links failed: ' + linkErr.message +
            ' — run the migration SQL first.');
        }
      }

      Toast.success(id ? 'Package updated!' : 'Package created!');
      Modal.close();
      await this._refresh();
    } catch (err) { Toast.error(err.message || 'Failed to save package'); }
  },

  async deletePackage(id, name) {
    if (!confirm(`Delete package "${name}"?`)) return;
    const { error } = await DB.deletePackage(id);
    if (error) return Toast.error(error.message);
    Toast.success('Package deleted');
    await this._refresh();
  },

  // ─────────────────────────────────────────────────────────────────────────
  // ALLOCATIONS TAB
  // ─────────────────────────────────────────────────────────────────────────
  renderAllocations(el) {
    el.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:1rem;flex-wrap:wrap;gap:8px">
        <div class="search-input-wrap">
          <i class="fas fa-search"></i>
          <input type="text" id="alloc-search" placeholder="Search student or package…"
            oninput="FinancialsPage.filterAllocations(this.value)" />
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <select class="filter-select" id="alloc-status-filter"
            onchange="FinancialsPage.filterAllocations()">
            <option value="">All Statuses</option>
            <option value="active">Active</option>
            <option value="expired">Expired</option>
            <option value="cancelled">Cancelled</option>
          </select>
          <button class="btn btn-secondary" onclick="FinancialsPage.openStudentHistoryPicker()"
            title="View full transaction & allocation history for a student">
            <i class="fas fa-history"></i> Student History
          </button>
          <button class="btn btn-primary" onclick="FinancialsPage.openAllocate()">
            <i class="fas fa-plus"></i> Allocate Package
          </button>
        </div>
      </div>
      <div class="card" style="padding:0;overflow:hidden">
        <div class="table-wrap">
          <table class="table" id="alloc-table">
            <thead>
              <tr>
                <th>Student</th>
                <th>Package</th>
                <th>Start</th>
                <th>End</th>
                <th>Discount</th>
                <th>Price Paid</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody id="alloc-tbody">
              ${this._allocTableRows(this.allocations)}
            </tbody>
          </table>
        </div>
      </div>
    `;
  },

  _allocTableRows(allocs) {
    if (!allocs.length) return `<tr><td colspan="8"><div class="empty-state"><i class="fas fa-users"></i><p>No allocations yet</p></div></td></tr>`;
    return allocs.map(a => `
      <tr data-alloc-student="${(a.student?.full_name || '').toLowerCase()}"
          data-alloc-package="${(a.package?.name     || '').toLowerCase()}"
          data-alloc-status="${a.status || ''}">
        <td>
          <div style="display:flex;align-items:center;gap:8px">
            <div class="users-table-avatar"
              style="background:${a.student?.avatar_color || Utils.avatarColor(a.student?.full_name || '')};width:28px;height:28px;font-size:11px">
              ${Utils.initials(a.student?.full_name || '?')}
            </div>
            <span style="font-weight:600;cursor:pointer;color:var(--brand-primary)"
              onclick="FinancialsPage.openStudentHistory('${a.student_id || ''}','${Utils.esc(a.student?.full_name || 'Unknown')}')"
              title="View history">${Utils.esc(a.student?.full_name || '—')}</span>
          </div>
        </td>
        <td>${Utils.esc(a.package?.name || '—')}</td>
        <td style="white-space:nowrap">${Utils.formatDate(a.start_date)}</td>
        <td style="white-space:nowrap">${Utils.formatDate(a.end_date)}</td>
        <td>${a.discount_pct > 0 ? `<span class="badge badge-yellow">${a.discount_pct}%</span>` : '—'}</td>
        <td style="font-weight:600">${a.price_paid != null ? Utils.formatCurrency(a.price_paid) : '—'}</td>
        <td>${Utils.statusBadge(a.status)}</td>
        <td>
          <div style="display:flex;gap:4px">
            <button class="btn btn-ghost btn-icon btn-sm" title="View history"
              onclick="FinancialsPage.openStudentHistory('${a.student_id || ''}','${Utils.esc(a.student?.full_name || 'Unknown')}')">
              <i class="fas fa-history"></i>
            </button>
            <button class="btn btn-ghost btn-icon btn-sm" title="Renew / Edit"
              onclick="FinancialsPage.openEditAllocation('${a.id}')">
              <i class="fas fa-redo"></i>
            </button>
            <button class="btn btn-danger btn-icon btn-sm" title="Delete"
              onclick="FinancialsPage.deleteAllocation('${a.id}')">
              <i class="fas fa-trash"></i>
            </button>
          </div>
        </td>
      </tr>
    `).join('');
  },

  filterAllocations(q) {
    const search = (q || document.getElementById('alloc-search')?.value || '').toLowerCase().trim();
    const status = document.getElementById('alloc-status-filter')?.value || '';
    const tbody  = document.getElementById('alloc-tbody');
    if (!tbody) return;
    tbody.querySelectorAll('tr[data-alloc-student]').forEach(tr => {
      const matchSearch = !search ||
        tr.dataset.allocStudent.includes(search) ||
        tr.dataset.allocPackage.includes(search);
      const matchStatus = !status || tr.dataset.allocStatus === status;
      tr.style.display = (matchSearch && matchStatus) ? '' : 'none';
    });
  },

  // ── Student History picker (no student pre-selected) ─────────────────────
  async openStudentHistoryPicker() {
    const { data: students } = await DB.getStudents();
    const list = (students || []).filter(s => s.user_type === 'student');
    const opts = list.map(s =>
      `<option value="${s.id}" data-name="${Utils.esc(s.full_name)}">${Utils.esc(s.full_name)}</option>`
    ).join('');
    Modal.open('Student History', `
      <div class="form-group">
        <label class="form-label">Select Student</label>
        <select id="hist-picker-sel" class="form-select">
          <option value="">— Select Student —</option>
          ${opts}
        </select>
      </div>
      <div class="modal-footer" style="padding:0;border:none;margin-top:1rem">
        <button class="btn btn-secondary" onclick="Modal.close()">Cancel</button>
        <button class="btn btn-primary" onclick="
          const sel=document.getElementById('hist-picker-sel');
          if(!sel.value){return;}
          const name=sel.options[sel.selectedIndex].dataset.name;
          Modal.close();
          FinancialsPage.openStudentHistory(sel.value,name);">
          <i class='fas fa-history'></i> View History
        </button>
      </div>
    `, { size: 'sm' });
  },

  // ── Full history modal for one student ───────────────────────────────────
  async openStudentHistory(studentId, studentName) {
    if (!studentId) return Toast.error('Student not found');
    Modal.open(
      `<i class="fas fa-history" style="margin-right:6px;color:var(--brand-primary)"></i>History — ${Utils.esc(studentName)}`,
      `<div style="padding:12px 0">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:14px;flex-wrap:wrap">
          <div class="search-input-wrap" style="flex:1;min-width:160px">
            <i class="fas fa-calendar"></i>
            <input type="date" id="hist-from" value="${Utils.monthRange().start}"
              oninput="FinancialsPage._renderHistoryContent('${studentId}')"
              style="padding-left:32px" />
          </div>
          <span style="color:var(--text-muted);font-size:var(--font-size-sm)">to</span>
          <div class="search-input-wrap" style="flex:1;min-width:160px">
            <i class="fas fa-calendar"></i>
            <input type="date" id="hist-to" value="${Utils.todayISO()}"
              oninput="FinancialsPage._renderHistoryContent('${studentId}')"
              style="padding-left:32px" />
          </div>
          <button class="btn btn-ghost btn-sm" onclick="
            document.getElementById('hist-from').value='';
            document.getElementById('hist-to').value='';
            FinancialsPage._renderHistoryContent('${studentId}')">
            <i class='fas fa-times'></i> Clear
          </button>
        </div>
        <div id="hist-content"><div class="page-loading"><i class="fas fa-spinner fa-spin"></i></div></div>
      </div>`,
      { size: 'xl' }
    );
    // Give the modal time to render
    await new Promise(r => setTimeout(r, 80));
    this._renderHistoryContent(studentId);
  },

  async _renderHistoryContent(studentId) {
    const el   = document.getElementById('hist-content');
    if (!el) return;
    const from = document.getElementById('hist-from')?.value || '';
    const to   = document.getElementById('hist-to')?.value   || '';

    // ── Filter allocations for this student ──────────────────────────────
    const allocs = this.allocations.filter(a => {
      if (a.student_id !== studentId) return false;
      if (from && (a.start_date || '') < from) return false;
      if (to   && (a.start_date || '') > to)   return false;
      return true;
    }).sort((a, b) => (b.start_date || '').localeCompare(a.start_date || ''));

    // ── Filter transactions for this student ─────────────────────────────
    // Transactions can reference the student by user_entity (name) or by [alloc:id] tag
    const studentAllocIds = this.allocations
      .filter(a => a.student_id === studentId)
      .map(a => a.id);

    const studentName = (this.allocations.find(a => a.student_id === studentId)?.student?.full_name || '').toLowerCase();

    const txs = this.transactions.filter(t => {
      const desc = (t.description || '').toLowerCase();
      const entity = (t.user_entity || '').toLowerCase();
      // Match by name OR by any alloc tag belonging to this student
      const matchName  = studentName && entity.includes(studentName);
      const matchAlloc = studentAllocIds.some(aid => desc.includes(`[alloc:${aid}]`));
      if (!matchName && !matchAlloc) return false;
      if (from && (t.date || '') < from) return false;
      if (to   && (t.date || '') > to)   return false;
      return true;
    }).sort((a, b) => (b.date || '').localeCompare(a.date || ''));

    // ── Summary ──────────────────────────────────────────────────────────
    const totalPaid     = allocs.reduce((s, a) => s + Number(a.price_paid || 0), 0);
    const totalTxIncome = txs.filter(t => t.type === 'income').reduce((s, t) => s + Number(t.amount || 0), 0);
    const totalTxExp    = txs.filter(t => t.type === 'expense').reduce((s, t) => s + Number(t.amount || 0), 0);

    const rangeLabel = from || to
      ? `${from ? Utils.formatDate(from) : '…'} → ${to ? Utils.formatDate(to) : '…'}`
      : 'All time';

    // ── Allocations table ────────────────────────────────────────────────
    const allocRows = allocs.length ? allocs.map(a => `
      <tr>
        <td style="white-space:nowrap">${Utils.formatDate(a.start_date)}</td>
        <td style="white-space:nowrap">${Utils.formatDate(a.end_date)}</td>
        <td>${Utils.esc(a.package?.name || '—')}</td>
        <td>${a.discount_pct > 0 ? `<span class="badge badge-yellow">${a.discount_pct}%</span>` : '—'}</td>
        <td style="font-weight:600;color:var(--brand-primary)">${a.price_paid != null ? Utils.formatCurrency(a.price_paid) : '—'}</td>
        <td>${Utils.statusBadge(a.status)}</td>
        <td style="font-size:11px;color:var(--text-muted);max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${Utils.esc(a.notes || '—')}</td>
      </tr>
    `).join('') : `<tr><td colspan="7" style="text-align:center;color:var(--text-muted);padding:18px">No allocations found for this period.</td></tr>`;

    // ── Transactions table ───────────────────────────────────────────────
    const txRows = txs.length ? txs.map(t => {
      const isIncome = t.type === 'income';
      return `
        <tr>
          <td style="white-space:nowrap">${Utils.formatDate(t.date)}</td>
          <td>
            <span class="badge ${isIncome ? 'badge-green' : 'badge-red'}" style="text-transform:capitalize">
              ${isIncome ? '▲' : '▼'} ${t.type}
            </span>
          </td>
          <td style="font-weight:600;color:${isIncome ? 'var(--brand-success)' : 'var(--brand-danger)'}">
            ${isIncome ? '+' : '-'}${Utils.formatCurrency(t.amount)}
          </td>
          <td>${Utils.esc(t.category || '—')}</td>
          <td>${Utils.esc(t.method || '—')}</td>
          <td>${Utils.statusBadge(t.status)}</td>
          <td style="font-size:11px;color:var(--text-muted);max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap"
            title="${Utils.esc(t.description || '')}">${Utils.esc(t.description || '—')}</td>
        </tr>
      `;
    }).join('') : `<tr><td colspan="7" style="text-align:center;color:var(--text-muted);padding:18px">No transactions found for this period.</td></tr>`;

    el.innerHTML = `
      <!-- Summary chips -->
      <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:14px">
        ${[
          { label: 'Period', val: rangeLabel,                    color: '#6366f1' },
          { label: 'Packages paid', val: Utils.formatCurrency(totalPaid), color: '#22c55e' },
          { label: 'Tx income',     val: Utils.formatCurrency(totalTxIncome), color: '#0ea5e9' },
          { label: 'Tx expense',    val: Utils.formatCurrency(totalTxExp),    color: '#ef4444' },
          { label: 'Allocation cycles', val: allocs.length,      color: '#8b5cf6' },
        ].map(c => `
          <div style="display:inline-flex;align-items:center;gap:6px;padding:5px 12px;
            border-radius:99px;border:1px solid ${c.color}33;background:${c.color}11">
            <span style="font-weight:700;color:${c.color}">${c.val}</span>
            <span style="font-size:11px;color:var(--text-muted)">${c.label}</span>
          </div>
        `).join('')}
      </div>

      <!-- Allocations / Package History -->
      <div style="font-size:var(--font-size-xs);font-weight:700;text-transform:uppercase;
        letter-spacing:.05em;color:var(--text-muted);margin-bottom:6px">
        <i class="fas fa-box" style="margin-right:4px"></i> Package Allocations (${allocs.length})
      </div>
      <div class="card" style="padding:0;overflow:hidden;margin-bottom:1rem">
        <div class="table-wrap">
          <table class="table" style="font-size:var(--font-size-xs)">
            <thead><tr>
              <th>Start</th><th>End</th><th>Package</th>
              <th>Discount</th><th>Paid</th><th>Status</th><th>Notes</th>
            </tr></thead>
            <tbody>${allocRows}</tbody>
          </table>
        </div>
      </div>

      <!-- Transactions -->
      <div style="font-size:var(--font-size-xs);font-weight:700;text-transform:uppercase;
        letter-spacing:.05em;color:var(--text-muted);margin-bottom:6px">
        <i class="fas fa-exchange-alt" style="margin-right:4px"></i> Transactions (${txs.length})
      </div>
      <div class="card" style="padding:0;overflow:hidden">
        <div class="table-wrap">
          <table class="table" style="font-size:var(--font-size-xs)">
            <thead><tr>
              <th>Date</th><th>Type</th><th>Amount</th>
              <th>Category</th><th>Method</th><th>Status</th><th>Description</th>
            </tr></thead>
            <tbody>${txRows}</tbody>
          </table>
        </div>
      </div>
    `;
  },

  // ─── Allocation form (shared create + edit) ──────────────────────────────
  async openAllocate() {
    const { data: students } = await DB.getStudents();
    this._allocStudents = students || [];
    // Reset cached package values so stale data from a previous edit doesn't bleed in
    this._allocBasePrice = 0;
    this._allocMonths    = 0;
    Modal.open('Allocate Package to Student', this._allocFormHTML(null), { size: 'lg' });
  },

  async openEditAllocation(id) {
    const alloc = this.allocations.find(a => a.id === id);
    if (!alloc) return Toast.error('Allocation not found');
    const { data: students } = await DB.getStudents();
    this._allocStudents = students || [];

    // Pre-populate base price & months from the linked package so calcFinalPrice works immediately
    const pkg = this.packages.find(p => p.id === alloc.package_id);
    this._allocBasePrice = pkg ? parseFloat(pkg.base_price)    || 0 : 0;
    this._allocMonths    = pkg ? parseInt(pkg.duration_months) || 1 : 1;

    Modal.open('Edit Allocation', this._allocFormHTML(alloc), { size: 'lg' });

    // Show discount preview immediately if a discount is already set
    setTimeout(() => this.calcFinalPrice(), 30);
  },

  _allocFormHTML(alloc) {
    const students = this._allocStudents;
    const packages = this.packages.filter(p => p.status === 'active');
    const isEdit   = !!alloc;

    // Pre-selected package info for edit mode
    const selPkg   = alloc ? this.packages.find(p => p.id === alloc.package_id) : null;

    return `
      <form onsubmit="FinancialsPage.saveAllocation(event, ${isEdit ? `'${alloc.id}'` : 'null'})">

        <!-- Student -->
        <div class="form-group">
          <label class="form-label">Student *</label>
          <select name="student_id" class="form-select" required ${isEdit ? 'disabled' : ''}>
            <option value="">— Select Student —</option>
            ${students.map(s => `
              <option value="${s.id}" ${alloc?.student_id === s.id ? 'selected' : ''}>
                ${Utils.esc(s.full_name)}
              </option>`).join('')}
          </select>
          ${isEdit ? `<input type="hidden" name="student_id" value="${alloc.student_id}" />` : ''}
        </div>

        <!-- Package -->
        <div class="form-group">
          <label class="form-label">Package *</label>
          <select name="package_id" id="alloc-pkg" class="form-select" required
            onchange="FinancialsPage.onPackageSelect(this)">
            <option value="">— Select Package —</option>
            ${packages.map(p => `
              <option value="${p.id}"
                data-price="${p.base_price}"
                data-months="${p.duration_months}"
                data-discount="${p.default_discount}"
                ${alloc?.package_id === p.id ? 'selected' : ''}>
                ${Utils.esc(p.name)} — ${Utils.formatCurrency(p.base_price)} / ${p.duration_months}mo
              </option>`).join('')}
          </select>
        </div>

        <!-- Dates -->
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Start Date *</label>
            <input type="date" name="start_date" id="alloc-start" class="form-input" required
              value="${alloc?.start_date || Utils.todayISO()}"
              onchange="FinancialsPage.calcEndDate()" />
          </div>
          <div class="form-group">
            <label class="form-label">End Date</label>
            <input type="date" name="end_date" id="alloc-end" class="form-input"
              value="${alloc?.end_date || ''}" />
            <p style="font-size:10px;color:var(--text-muted);margin-top:3px">
              Auto-calculated from package duration
            </p>
          </div>
        </div>

        <!-- Discount FIRST, then price preview -->
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">
              Discount (%)
              <span style="font-size:10px;color:var(--text-muted);margin-left:4px">applied to base price</span>
            </label>
            <input type="number" name="discount_pct" id="alloc-discount" class="form-input"
              step="0.1" min="0" max="100"
              value="${alloc?.discount_pct ?? 0}"
              oninput="FinancialsPage.calcFinalPrice()" />
          </div>
          <div class="form-group">
            <label class="form-label">
              Price Paid ($)
              <span id="alloc-price-hint" style="font-size:10px;color:var(--brand-primary);margin-left:4px"></span>
            </label>
            <input type="number" name="price_paid" id="alloc-price" class="form-input"
              step="0.01"
              value="${alloc?.price_paid ?? ''}"
              placeholder="Auto-filled from package" />
          </div>
        </div>

        <!-- Live price preview box -->
        <div id="alloc-price-preview" style="display:none;margin-bottom:1rem;padding:10px 14px;
          border-radius:var(--radius-md);background:rgba(34,197,94,0.06);
          border:1px solid rgba(34,197,94,0.2);font-size:var(--font-size-sm)">
        </div>

        <!-- Status (edit only) -->
        ${isEdit ? `
        <div class="form-group">
          <label class="form-label">Status</label>
          <select name="status" class="form-select">
            <option value="active"    ${alloc.status==='active'   ?'selected':''}>Active</option>
            <option value="expired"   ${alloc.status==='expired'  ?'selected':''}>Expired</option>
            <option value="cancelled" ${alloc.status==='cancelled'?'selected':''}>Cancelled</option>
          </select>
        </div>` : ''}

        <!-- Notes -->
        <div class="form-group">
          <label class="form-label">Notes <span style="font-size:10px;color:var(--text-muted)">(optional)</span></label>
          <textarea name="notes" class="form-textarea" style="min-height:60px"
            placeholder="e.g. sibling discount applied…">${Utils.esc(alloc?.notes || '')}</textarea>
        </div>

        <div class="modal-footer" style="padding:0;border:none;margin-top:1rem">
          <button type="button" class="btn btn-secondary" onclick="Modal.close()">Cancel</button>
          <button type="submit" class="btn btn-primary">
            <i class="fas fa-save"></i> ${isEdit ? 'Save Changes' : 'Allocate'}
          </button>
        </div>
      </form>
    `;
  },

  // Called when package dropdown changes
  onPackageSelect(sel) {
    const opt     = sel.options[sel.selectedIndex];
    const price   = parseFloat(opt.dataset.price)    || 0;
    const months  = parseInt(opt.dataset.months)     || 1;
    const defDisc = parseFloat(opt.dataset.discount) || 0;

    // Store for end-date calc
    this._allocMonths    = months;
    this._allocBasePrice = price;

    // Set the default discount from the package
    const discEl = document.getElementById('alloc-discount');
    if (discEl && (!discEl.value || parseFloat(discEl.value) === 0)) {
      discEl.value = defDisc;
    }

    // Calculate end date
    this.calcEndDate();

    // Calculate price after discount
    this.calcFinalPrice();
  },

  calcEndDate() {
    const start = document.getElementById('alloc-start')?.value;
    if (!start || !this._allocMonths) return;
    const d = new Date(start + 'T00:00:00');
    d.setMonth(d.getMonth() + this._allocMonths);
    // End date = same day next period (e.g. 25-Mar → 25-Apr)
    const endEl = document.getElementById('alloc-end');
    if (endEl) endEl.value = Utils.localDateISO(d);
  },

  calcFinalPrice() {
    const base     = this._allocBasePrice || 0;
    const discEl   = document.getElementById('alloc-discount');
    const priceEl  = document.getElementById('alloc-price');
    const hintEl   = document.getElementById('alloc-price-hint');
    const preview  = document.getElementById('alloc-price-preview');
    if (!discEl || !priceEl) return;

    const disc    = parseFloat(discEl.value) || 0;
    const final   = base > 0 ? Math.round(base * (1 - disc / 100) * 100) / 100 : 0;

    if (base > 0) {
      priceEl.value = final.toFixed(2);

      if (disc > 0) {
        if (hintEl) hintEl.textContent = `(${disc}% off)`;
        if (preview) {
          preview.style.display = 'block';
          preview.innerHTML = `
            <div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap">
              <span>Base price: <strong>${Utils.formatCurrency(base)}</strong></span>
              <span style="color:var(--brand-warning)">− ${disc}% discount = <strong style="color:var(--brand-danger)">− ${Utils.formatCurrency(base * disc / 100)}</strong></span>
              <span style="color:var(--brand-primary);font-size:var(--font-size-md);font-weight:700">
                ✓ Final: ${Utils.formatCurrency(final)}
              </span>
            </div>`;
        }
      } else {
        if (hintEl)  hintEl.textContent = '';
        if (preview) preview.style.display = 'none';
      }
    }
  },

  async saveAllocation(e, id) {
    e.preventDefault();
    const fd   = new FormData(e.target);
    const data = Object.fromEntries(fd.entries());
    data.price_paid    = data.price_paid    ? parseFloat(data.price_paid)    : null;
    data.discount_pct  = parseFloat(data.discount_pct) || 0;
    if (!data.end_date)  delete data.end_date;
    if (!data.notes)     data.notes = null;

    const isNew = !id;
    data.status = 'active';   // always active for a new/renewed allocation

    try {
      // ── RENEWAL (edit) → expire the old allocation, insert a fresh one ────
      // We NEVER update an existing allocation row; each payment cycle is its
      // own immutable record so the full history is preserved.
      let allocId = null;

      if (!isNew) {
        // 1) Mark the old allocation as expired
        const prevAlloc = this.allocations.find(a => a.id === id);
        await DB.updateAllocation(id, { status: 'expired' })
          .catch(err => console.warn('Could not expire old allocation:', err));

        // Carry forward student_id from previous record if the form didn't send it
        if (!data.student_id && prevAlloc?.student_id) {
          data.student_id = prevAlloc.student_id;
        }
        if (!data.package_id && prevAlloc?.package_id) {
          data.package_id = prevAlloc.package_id;
        }
      }

      // 2) Create a new allocation row (both for new and renewal)
      const result = await DB.createAllocation(data);
      if (result.error) throw result.error;
      allocId = result.data?.id || result.data?.[0]?.id || null;

      // ── Resolve student + package ────────────────────────────────────────
      const studentId = data.student_id
        || (!isNew ? this.allocations.find(a => a.id === id)?.student_id : null);
      const student = this._allocStudents.find(s => s.id === studentId)
                   || this.allocations.find(a => a.id === id)?.student;
      const pkg     = this.packages.find(p => p.id === data.package_id)
                   || this.allocations.find(a => a.id === id)?.package;

      // ── Auto-create income transaction ───────────────────────────────────
      // Always create a NEW transaction for the new allocation row
      if (data.price_paid > 0) {
        const txData = {
          type:        'income',
          amount:      data.price_paid,
          date:        data.start_date || Utils.todayISO(),
          category:    'Subscription',
          user_entity: student?.full_name || null,
          description: (pkg
            ? `Package: ${pkg.name}${data.discount_pct > 0 ? ` (${data.discount_pct}% off)` : ''}`
            : (isNew ? 'Package subscription' : 'Package renewal'))
            + (allocId ? ` [alloc:${allocId}]` : ''),
          method:      'cash',
          status:      'completed',
        };
        const txResult = await DB.createTransaction(txData);
        if (txResult.error) {
          console.warn('Auto-transaction failed:', txResult.error);
          Toast.warning('Allocation saved but auto-transaction could not be recorded.');
        } else {
          Toast.success(isNew ? 'Package allocated & income recorded!' : 'Renewal saved — new allocation & transaction created!');
        }

        // ── Fire on_payment / on_renewal notification rules ─────────────────
        if (student && typeof NotificationsPage !== 'undefined') {
          const triggerData = {
            student_id: student.id        || studentId,
            full_name:  student.full_name || '',
            email:      student.email     || '',
            phone:      student.phone     || '',
            package:    pkg?.name         || '',
            amount:     data.price_paid,
            start_date: data.start_date   || Utils.todayISO(),
            end_date:   data.end_date     || '',
          };
          // Always fire on_payment (covers both new and renewal)
          NotificationsPage.triggerRule('on_payment', triggerData)
            .catch(err => console.warn('on_payment trigger failed:', err));
          // Also fire on_renewal for existing allocations being renewed
          if (!isNew) {
            NotificationsPage.triggerRule('on_renewal', triggerData)
              .catch(err => console.warn('on_renewal trigger failed:', err));
          }
        }
      } else {
        Toast.success(isNew ? 'Package allocated!' : 'Renewal saved!');
      }

      Modal.close();
      await this._refresh();
    } catch (err) { Toast.error(err.message || 'Failed to save allocation'); }
  },

  async deleteAllocation(id) {
    if (!confirm('Remove this allocation and its linked transaction?')) return;

    // Find and delete the linked auto-transaction (tagged with [alloc:ID])
    try {
      const { data: txList } = await DB.getTransactions();
      const linked = (txList || []).find(t =>
        t.description && t.description.includes(`[alloc:${id}]`)
      );
      if (linked) {
        await DB.deleteTransaction(linked.id);
      }
    } catch (e) {
      console.warn('Could not delete linked transaction:', e);
    }

    const { error } = await DB.deleteAllocation(id);
    if (error) return Toast.error(error.message);
    Toast.success('Allocation and linked transaction removed.');
    await this._refresh();
  },

  // ─────────────────────────────────────────────────────────────────────────
  // UNIFIED LEDGER — merges manual transactions + allocation subscriptions
  // Every entry has: { _id, _source ('tx'|'alloc'), date, type, amount,
  //                    user_entity, category, description, method, status }
  // ─────────────────────────────────────────────────────────────────────────
  _mergedLedger() {
    // Manual transactions
    const txRows = this.transactions.map(t => ({
      _id:         t.id,
      _source:     'tx',
      date:        t.date        || '',
      type:        t.type        || 'income',
      amount:      Number(t.amount) || 0,
      user_entity: t.user_entity || '',
      category:    t.category    || 'General',
      description: (t.description || '').replace(/\s*\[alloc:[^\]]+\]/g, '').trim(),
      method:      t.method      || 'cash',
      status:      t.status      || 'completed',
    }));

    // Build a set of allocation IDs that already have a linked auto-transaction
    // (tagged with [alloc:UUID] in the description)
    const allocsWithTx = new Set(
      this.transactions
        .map(t => { const m = (t.description || '').match(/\[alloc:([^\]]+)\]/); return m ? m[1] : null; })
        .filter(Boolean)
    );

    // Only show allocations that do NOT have a linked transaction
    // (i.e. older allocations created before the auto-transaction feature)
    const allocRows = this.allocations
      .filter(a => a.price_paid > 0 && !allocsWithTx.has(a.id))
      .map(a => ({
        _id:         a.id,
        _source:     'alloc',
        date:        a.start_date || '',
        type:        'income',
        amount:      Number(a.price_paid) || 0,
        user_entity: a.student?.full_name || '',
        category:    'Subscription',
        description: a.package?.name
          ? `Package: ${a.package.name}${a.discount_pct > 0 ? ` (${a.discount_pct}% off)` : ''}`
          : 'Package subscription',
        method:      'subscription',
        status:      a.status || 'active',
        _allocStatus: a.status,
      }));

    // Merge and sort newest-first
    return [...txRows, ...allocRows].sort((a, b) => b.date.localeCompare(a.date));
  },

  // ─────────────────────────────────────────────────────────────────────────
  // TRANSACTIONS TAB
  // ─────────────────────────────────────────────────────────────────────────
  renderTransactions(el) {
    // Default date range = first day of current month → today
    const firstOfMonth = Utils.localDateISO(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
    const today = Utils.todayISO();

    el.innerHTML = `
      <!-- ── Filter bar ── -->
      <div class="card" style="margin-bottom:1rem;padding:14px 16px">
        <div style="display:flex;align-items:flex-end;gap:12px;flex-wrap:wrap">

          <!-- Search -->
          <div class="form-group" style="margin:0;flex:2;min-width:180px">
            <label class="form-label">Search</label>
            <div class="search-input-wrap">
              <i class="fas fa-search"></i>
              <input type="text" id="tx-search" placeholder="Name, category, description…"
                oninput="FinancialsPage.filterTx()" />
            </div>
          </div>

          <!-- Type filter -->
          <div class="form-group" style="margin:0;min-width:140px">
            <label class="form-label">Type</label>
            <select class="form-select" id="tx-type-filter" onchange="FinancialsPage.filterTx()">
              <option value="">All Types</option>
              <option value="income">Income</option>
              <option value="expense">Expense</option>
            </select>
          </div>

          <!-- Source filter -->
          <div class="form-group" style="margin:0;min-width:160px">
            <label class="form-label">Source</label>
            <select class="form-select" id="tx-source-filter" onchange="FinancialsPage.filterTx()">
              <option value="">All Sources</option>
              <option value="tx">Manual Transactions</option>
              <option value="alloc">Subscriptions / Packages</option>
            </select>
          </div>

          <!-- Date range -->
          <div class="form-group" style="margin:0;min-width:130px">
            <label class="form-label">From</label>
            <input type="date" id="tx-date-from" class="form-input"
              value="${firstOfMonth}" onchange="FinancialsPage.filterTx()" />
          </div>
          <div class="form-group" style="margin:0;min-width:130px">
            <label class="form-label">To</label>
            <input type="date" id="tx-date-to" class="form-input"
              value="${today}" onchange="FinancialsPage.filterTx()" />
          </div>

          <!-- Clear + Export -->
          <div style="display:flex;gap:8px;align-items:flex-end;padding-bottom:2px">
            <button class="btn btn-ghost btn-sm" onclick="FinancialsPage.clearTxFilters()">
              <i class="fas fa-times"></i> Clear
            </button>
            <button class="btn btn-secondary btn-sm" onclick="FinancialsPage.exportTx()">
              <i class="fas fa-file-csv"></i> Export
            </button>
          </div>
        </div>

        <!-- Live summary strip -->
        <div id="tx-summary" style="margin-top:10px;display:flex;gap:20px;flex-wrap:wrap;font-size:var(--font-size-sm)"></div>
      </div>

      <!-- ── Table ── -->
      <div class="card" style="padding:0;overflow:hidden" id="tx-card">
        <div class="page-loading"><i class="fas fa-spinner fa-spin"></i></div>
      </div>
    `;

    // Initial render with default filters
    this.filterTx();
  },

  // Build summary strip HTML for a set of ledger rows
  _txSummaryHTML(rows) {
    const income  = rows.filter(r => r.type === 'income' ).reduce((s, r) => s + r.amount, 0);
    const expense = rows.filter(r => r.type === 'expense').reduce((s, r) => s + r.amount, 0);
    const net     = income - expense;
    const count   = rows.length;
    return `
      <span style="color:var(--text-muted)">${count} record${count!==1?'s':''}</span>
      <span style="color:var(--brand-primary);font-weight:600">
        <i class="fas fa-arrow-up" style="font-size:10px"></i> ${Utils.formatCurrency(income)} income
      </span>
      <span style="color:var(--brand-danger);font-weight:600">
        <i class="fas fa-arrow-down" style="font-size:10px"></i> ${Utils.formatCurrency(expense)} expenses
      </span>
      <span style="font-weight:700;color:${net>=0?'var(--brand-primary)':'var(--brand-danger)'}">
        Net: ${net >= 0 ? '+' : ''}${Utils.formatCurrency(net)}
      </span>`;
  },

  transactionTableHTML(rows) {
    if (!rows.length) return `
      <div class="empty-state">
        <i class="fas fa-receipt"></i>
        <h3>No records found</h3>
        <p>Try adjusting your filters or date range.</p>
      </div>`;

    return `
      <div class="table-wrap">
        <table class="table">
          <thead>
            <tr>
              <th>Source</th>
              <th>User / Entity</th>
              <th>Category</th>
              <th>Description</th>
              <th>Date</th>
              <th>Amount</th>
              <th>Method</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map(r => {
              const isAlloc  = r._source === 'alloc';
              const amtClass = r.type === 'income' ? 'transaction-type-income' : 'transaction-type-expense';
              const srcBadge = isAlloc
                ? `<span class="badge badge-blue" style="font-size:10px"><i class="fas fa-id-card" style="margin-right:3px"></i>Subscription</span>`
                : `<span class="badge badge-gray" style="font-size:10px"><i class="fas fa-receipt"  style="margin-right:3px"></i>Transaction</span>`;
              const actions  = isAlloc
                ? `<button class="btn btn-ghost btn-icon btn-sm" title="Go to Allocations"
                      onclick="FinancialsPage.switchTab('allocations', document.querySelectorAll('.tabs .tab-btn')[2])">
                      <i class="fas fa-external-link-alt"></i>
                   </button>`
                : `<button class="btn btn-danger btn-icon btn-sm" title="Delete"
                      onclick="FinancialsPage.deleteTransaction('${r._id}')">
                      <i class="fas fa-trash"></i>
                   </button>`;
              return `
                <tr>
                  <td>${srcBadge}</td>
                  <td><strong>${Utils.esc(r.user_entity || '—')}</strong></td>
                  <td><span class="badge badge-gray">${Utils.esc(r.category)}</span></td>
                  <td style="font-size:var(--font-size-xs);color:var(--text-muted);
                             max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap"
                    title="${Utils.esc(r.description)}">
                    ${r.description ? Utils.esc(r.description) : '—'}
                  </td>
                  <td style="white-space:nowrap">${Utils.formatDate(r.date)}</td>
                  <td class="${amtClass}">
                    ${r.type === 'income' ? '+' : '−'}${Utils.formatCurrency(r.amount)}
                  </td>
                  <td><span style="font-size:var(--font-size-xs);text-transform:capitalize">
                    ${Utils.esc(r.method)}
                  </span></td>
                  <td>${Utils.statusBadge(r.status)}</td>
                  <td>${actions}</td>
                </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>`;
  },

  filterTx() {
    const search    = (document.getElementById('tx-search')?.value     || '').toLowerCase().trim();
    const type      = document.getElementById('tx-type-filter')?.value  || '';
    const source    = document.getElementById('tx-source-filter')?.value || '';
    const dateFrom  = document.getElementById('tx-date-from')?.value    || '';
    const dateTo    = document.getElementById('tx-date-to')?.value      || '';

    let rows = this._mergedLedger();

    if (search)   rows = rows.filter(r =>
      r.user_entity.toLowerCase().includes(search) ||
      r.category.toLowerCase().includes(search)    ||
      r.description.toLowerCase().includes(search));

    if (type)     rows = rows.filter(r => r.type    === type);
    if (source)   rows = rows.filter(r => r._source === source);
    if (dateFrom) rows = rows.filter(r => r.date >= dateFrom);
    if (dateTo)   rows = rows.filter(r => r.date <= dateTo);

    const card    = document.getElementById('tx-card');
    const summary = document.getElementById('tx-summary');
    if (card)    card.innerHTML    = this.transactionTableHTML(rows);
    if (summary) summary.innerHTML = this._txSummaryHTML(rows);
  },

  clearTxFilters() {
    const firstOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1)
      .toISOString().slice(0, 10);
    const s = document.getElementById('tx-search');    if (s) s.value = '';
    const t = document.getElementById('tx-type-filter'); if (t) t.value = '';
    const sr = document.getElementById('tx-source-filter'); if (sr) sr.value = '';
    const f  = document.getElementById('tx-date-from'); if (f) f.value = firstOfMonth;
    const to = document.getElementById('tx-date-to');   if (to) to.value = Utils.todayISO();
    this.filterTx();
  },

  exportTx() {
    // Export whatever is currently filtered (same logic as filterTx)
    const search   = (document.getElementById('tx-search')?.value      || '').toLowerCase().trim();
    const type     = document.getElementById('tx-type-filter')?.value   || '';
    const source   = document.getElementById('tx-source-filter')?.value || '';
    const dateFrom = document.getElementById('tx-date-from')?.value     || '';
    const dateTo   = document.getElementById('tx-date-to')?.value       || '';

    let rows = this._mergedLedger();
    if (search)   rows = rows.filter(r =>
      r.user_entity.toLowerCase().includes(search) ||
      r.category.toLowerCase().includes(search)    ||
      r.description.toLowerCase().includes(search));
    if (type)     rows = rows.filter(r => r.type    === type);
    if (source)   rows = rows.filter(r => r._source === source);
    if (dateFrom) rows = rows.filter(r => r.date >= dateFrom);
    if (dateTo)   rows = rows.filter(r => r.date <= dateTo);

    if (!rows.length) return Toast.warning('No records to export');

    Utils.downloadCSV(
      rows.map(r => ({
        source:      r._source === 'alloc' ? 'Subscription' : 'Transaction',
        date:        r.date,
        type:        r.type,
        amount:      r.amount,
        category:    r.category,
        entity:      r.user_entity,
        description: r.description,
        method:      r.method,
        status:      r.status,
      })),
      `transactions-${dateFrom || 'all'}-to-${dateTo || 'all'}.csv`
    );
  },

  // ─────────────────────────────────────────────────────────────────────────
  // ADD TRANSACTION MODAL
  // ─────────────────────────────────────────────────────────────────────────
  openAddTransaction() {
    Modal.open('Add Transaction', this.txFormHTML());
  },

  txFormHTML() {
    const cats = {
      income:  ['Subscription','Event Fee','Workshop','Other Income'],
      expense: ['Salary','Supplies','Rent','Utilities','Marketing','Other Expense'],
    };
    return `
      <form onsubmit="FinancialsPage.saveTx(event)">
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Type</label>
            <select name="type" id="tx-type-sel" class="form-select"
              onchange="FinancialsPage.updateTxCategories(this.value)">
              <option value="income">Income</option>
              <option value="expense">Expense</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Amount ($) *</label>
            <input type="number" name="amount" class="form-input" required step="0.01" placeholder="0.00" />
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">User / Entity</label>
            <input type="text" name="user_entity" class="form-input" placeholder="e.g. Ahmad Karimi" />
          </div>
          <div class="form-group">
            <label class="form-label">Category</label>
            <select name="category" class="form-select" id="tx-cat-sel">
              ${cats.income.map(c => `<option value="${c}">${c}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Date *</label>
            <input type="date" name="date" class="form-input" required value="${Utils.todayISO()}" />
          </div>
          <div class="form-group">
            <label class="form-label">Payment Method</label>
            <select name="method" class="form-select">
              <option value="cash">Cash</option>
              <option value="card">Card</option>
              <option value="transfer">Bank Transfer</option>
              <option value="other">Other</option>
            </select>
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Description</label>
          <textarea name="description" class="form-textarea" style="min-height:70px"
            placeholder="Optional notes…"></textarea>
        </div>
        <div class="modal-footer" style="padding:0;border:none;margin-top:1rem">
          <button type="button" class="btn btn-secondary" onclick="Modal.close()">Cancel</button>
          <button type="submit" class="btn btn-primary">
            <i class="fas fa-plus"></i> Add Transaction
          </button>
        </div>
      </form>
    `;
  },

  updateTxCategories(type) {
    const cats = {
      income:  ['Subscription','Event Fee','Workshop','Other Income'],
      expense: ['Salary','Supplies','Rent','Utilities','Marketing','Other Expense'],
    };
    const sel = document.getElementById('tx-cat-sel');
    if (sel) sel.innerHTML = (cats[type] || cats.income).map(c => `<option value="${c}">${c}</option>`).join('');
  },

  async saveTx(e) {
    e.preventDefault();
    const fd   = new FormData(e.target);
    const data = Object.fromEntries(fd.entries());
    data.amount = parseFloat(data.amount);
    if (!data.description) data.description = null;
    if (!data.user_entity) data.user_entity = null;
    try {
      const { error } = await DB.createTransaction(data);
      if (error) throw error;
      Toast.success('Transaction recorded!');
      Modal.close();
      await this._refresh();
    } catch (err) { Toast.error(err.message || 'Failed to record transaction'); }
  },

  async deleteTransaction(id) {
    if (!confirm('Delete this transaction?')) return;
    const { error } = await DB.deleteTransaction(id);
    if (error) return Toast.error(error.message);
    Toast.success('Transaction deleted');
    // Remove from local array for instant feedback, then re-filter
    this.transactions = this.transactions.filter(t => t.id !== id);
    this.filterTx();   // re-applies current filters on updated merged ledger
  },
};
