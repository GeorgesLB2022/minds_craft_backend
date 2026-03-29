/* ============================================================
   MINDS' CRAFT — FINANCIALS PAGE
   ============================================================ */

const FinancialsPage = {
  currentTab: 'overview',
  chart: null,
  transactions: [],
  packages: [],
  allocations: [],
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
    const [{ data: tx }, { data: pkgs }, { data: alloc }] = await Promise.all([
      DB.getTransactions({ limit: 500 }),
      DB.getPackages(),
      DB.getStudentAllocations(),
    ]);
    this.transactions = tx    || [];
    this.packages     = pkgs  || [];
    this.allocations  = alloc || [];
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
    const mStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const mStartStr = mStart.toISOString().slice(0, 10);

    // ── Transactions (manual income + expenses) ──────────────────────────
    const monthTx      = this.transactions.filter(t => t.date >= mStartStr);
    const txIncome     = monthTx.filter(t => t.type === 'income' ).reduce((s, t) => s + Number(t.amount), 0);
    const txExpense    = monthTx.filter(t => t.type === 'expense').reduce((s, t) => s + Number(t.amount), 0);
    const allTxIncome  = this.transactions.filter(t => t.type === 'income' ).reduce((s, t) => s + Number(t.amount), 0);
    const allTxExpense = this.transactions.filter(t => t.type === 'expense').reduce((s, t) => s + Number(t.amount), 0);

    // ── Allocations (package subscription income) ────────────────────────
    // Use start_date as the "payment date" for an allocation
    const monthAlloc = this.allocations.filter(a =>
      a.price_paid > 0 && a.start_date && a.start_date >= mStartStr
    );
    const allocIncome    = monthAlloc.reduce((s, a) => s + Number(a.price_paid || 0), 0);
    const allAllocIncome = this.allocations
      .filter(a => a.price_paid > 0)
      .reduce((s, a) => s + Number(a.price_paid || 0), 0);

    return {
      income:  txIncome  + allocIncome,      // this month: tx income + new subscriptions
      expense: txExpense,                     // expenses from transactions only
      net:    (txIncome + allocIncome) - txExpense,
      balance: (allTxIncome + allAllocIncome) - allTxExpense,
      // expose breakdowns for the chart
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
    const allAllocPaid = this.allocations.filter(a => a.price_paid > 0).reduce((s, a) => s + Number(a.price_paid || 0), 0);

    // Build informative sub-labels showing the breakdown
    const incomeSub = stats.allocIncome > 0
      ? `${Utils.formatCurrency(stats.txIncome)} tx + ${Utils.formatCurrency(stats.allocIncome)} subs`
      : 'This month';
    const balanceSub = `tx: ${Utils.formatCurrency(stats.allTxIncome + stats.allAllocIncome)} in · ${Utils.formatCurrency(stats.allTxExpense)} out`;

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
        <div class="card">
          <div class="card-header">
            <div class="card-title">
              Due Packages
              <span class="badge badge-red" style="margin-left:6px">Action Required</span>
            </div>
          </div>
          <div id="due-packages-list">${this.renderDuePackages()}</div>
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

  renderDuePackages() {
    const soon = new Date();
    soon.setDate(soon.getDate() + 14);
    const soonStr = soon.toISOString().slice(0, 10);
    const due = this.allocations.filter(a => a.status === 'active' && a.end_date <= soonStr);
    if (!due.length) return '<div class="empty-state"><i class="fas fa-check-circle"></i><p>No packages due soon</p></div>';
    return due.slice(0, 5).map(a => {
      const daysLeft = Math.ceil((new Date(a.end_date) - new Date()) / 86400000);
      return `
        <div class="due-item">
          <div>
            <div style="font-weight:600;font-size:var(--font-size-sm)">${Utils.esc(a.student?.full_name || 'Unknown')}</div>
            <div style="font-size:var(--font-size-xs);color:var(--text-muted)">${Utils.esc(a.package?.name || 'Package')}</div>
          </div>
          <div style="text-align:right">
            <div class="badge ${daysLeft <= 3 ? 'badge-red' : daysLeft <= 7 ? 'badge-yellow' : 'badge-blue'}">${daysLeft}d left</div>
            <div style="font-size:var(--font-size-xs);color:var(--text-muted);margin-top:2px">${Utils.formatDate(a.end_date)}</div>
          </div>
        </div>
      `;
    }).join('');
  },

  renderFinChart() {
    const ctx = document.getElementById('fin-chart');
    if (!ctx) return;
    if (this.chart) { this.chart.destroy(); this.chart = null; }

    const months = [], incomeData = [], allocData = [], expenseData = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d    = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const mEnd = new Date(d.getFullYear(), d.getMonth() + 1, 0);
      const s    = d.toISOString().slice(0, 10);
      const e    = mEnd.toISOString().slice(0, 10);
      months.push(d.toLocaleString('default', { month: 'short', year: '2-digit' }));
      // Transactions income
      incomeData.push(this.transactions.filter(t => t.type==='income'  && t.date >= s && t.date <= e).reduce((a, t) => a + Number(t.amount), 0));
      // Allocation (subscription) income — use start_date as payment date
      allocData.push(this.allocations.filter(a => a.price_paid > 0 && a.start_date >= s && a.start_date <= e).reduce((a, al) => a + Number(al.price_paid || 0), 0));
      expenseData.push(this.transactions.filter(t => t.type==='expense' && t.date >= s && t.date <= e).reduce((a, t) => a + Number(t.amount), 0));
    }

    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const gc = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';
    const tc = isDark ? '#9ba8c4' : '#6b7280';

    // Combine tx income + allocation income into a single "Total Income" series
    const totalIncomeData = incomeData.map((v, i) => v + allocData[i]);

    this.chart = new Chart(ctx, {
      type: 'bar',
      data: { labels: months, datasets: [
        { label: 'Subscriptions', data: allocData,       backgroundColor: 'rgba(99,102,241,0.70)', borderRadius: 5, stack: 'income' },
        { label: 'Other Income',  data: incomeData,      backgroundColor: 'rgba(34,197,94,0.75)',  borderRadius: 5, stack: 'income' },
        { label: 'Expenses',      data: expenseData,     backgroundColor: 'rgba(239,68,68,0.65)',  borderRadius: 5, stack: 'expense' },
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
        ${p.description ? `<p style="font-size:var(--font-size-sm);color:var(--text-muted);margin-bottom:.8rem">${Utils.esc(p.description)}</p>` : ''}
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
        <div class="form-group">
          <label class="form-label">Default Discount (%)</label>
          <input type="number" name="default_discount" class="form-input" step="0.1" value="${p?.default_discount || '0'}" max="100" />
        </div>
        <div class="form-group">
          <label class="form-label">Description</label>
          <textarea name="description" class="form-textarea">${Utils.esc(p?.description || '')}</textarea>
        </div>
        <div class="form-group">
          <label class="form-label">Status</label>
          <select name="status" class="form-select">
            <option value="active"   ${p?.status==='active'  ?'selected':''}>Active</option>
            <option value="inactive" ${p?.status==='inactive'?'selected':''}>Inactive</option>
          </select>
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
    const fd   = new FormData(e.target);
    const data = Object.fromEntries(fd.entries());
    data.base_price        = parseFloat(data.base_price)        || 0;
    data.default_discount  = parseFloat(data.default_discount)  || 0;
    data.duration_months   = parseInt(data.duration_months)     || 1;
    if (!data.description) data.description = null;
    try {
      const result = id ? await DB.updatePackage(id, data) : await DB.createPackage(data);
      if (result.error) throw result.error;
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
        <div style="display:flex;gap:8px">
          <select class="filter-select" id="alloc-status-filter"
            onchange="FinancialsPage.filterAllocations()">
            <option value="">All Statuses</option>
            <option value="active">Active</option>
            <option value="expired">Expired</option>
            <option value="cancelled">Cancelled</option>
          </select>
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
            <strong>${Utils.esc(a.student?.full_name || '—')}</strong>
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
            <button class="btn btn-ghost btn-icon btn-sm" title="Edit"
              onclick="FinancialsPage.openEditAllocation('${a.id}')">
              <i class="fas fa-edit"></i>
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
    if (endEl) endEl.value = d.toISOString().slice(0, 10);
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
    if (isNew) data.status = 'active';

    try {
      const result = id ? await DB.updateAllocation(id, data) : await DB.createAllocation(data);
      if (result.error) throw result.error;

      // ── Auto-create an income transaction for new allocations with a price ──
      if (isNew && data.price_paid > 0) {
        // Look up student name and package name for the transaction description
        const student = this._allocStudents.find(s => s.id === data.student_id);
        const pkg     = this.packages.find(p => p.id === data.package_id);
        // Get the new allocation's ID from the result
        const newAllocId = result.data?.[0]?.id || result.data?.id || null;
        const txData  = {
          type:        'income',
          amount:      data.price_paid,
          date:        data.start_date || Utils.todayISO(),
          category:    'Subscription',
          user_entity: student?.full_name || null,
          // Embed allocation ID as hidden tag so we can delete it later
          description: (pkg
            ? `Package: ${pkg.name}${data.discount_pct > 0 ? ` (${data.discount_pct}% discount applied)` : ''}`
            : 'Package subscription')
            + (newAllocId ? ` [alloc:${newAllocId}]` : ''),
          method:      'cash',
          status:      'completed',
        };
        const txResult = await DB.createTransaction(txData);
        if (txResult.error) {
          // Non-fatal: allocation was saved, just warn about the transaction
          console.warn('Auto-transaction failed:', txResult.error);
          Toast.warning('Allocation saved but auto-transaction could not be recorded.');
        } else {
          Toast.success('Package allocated & income recorded!');
        }

        // ── Fire on_payment notification rule ──────────────────────────────
        if (student) {
          NotificationsPage.triggerRule('on_payment', {
            student_id: student.id,
            full_name:  student.full_name  || '',
            email:      student.email      || '',
            phone:      student.phone      || '',
            package:    pkg?.name          || '',
            amount:     data.price_paid,
            start_date: data.start_date    || Utils.todayISO(),
            end_date:   data.end_date      || '',
          }).catch(err => console.warn('on_payment trigger failed:', err));
        }

      } else {
        Toast.success(id ? 'Allocation updated!' : 'Package allocated!');
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
    const firstOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1)
      .toISOString().slice(0, 10);
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
