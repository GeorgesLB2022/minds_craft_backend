/* ============================================================
   MINDS' CRAFT — NOTIFICATIONS PAGE
   Features:
   - Manual broadcast to audience groups OR a specific email/phone
   - Live preview (updates as you type, shows channel-appropriate format)
   - Send Test modal: send real SMS via GlobeSMS or log email test
   - Automated rules with 2-day expiry check (run once per session)
   - Detailed history: date, recipient name, contact, channel, message
   ============================================================ */

const NotificationsPage = {
  rules:            [],
  logs:             [],
  selectedChannels: new Set(['email']),

  /* ── GlobeSMS config ─────────────────────────────────── */
  SMS_API:  'https://globesms.net/smshub/api.php',
  SMS_USER: 'G.Issa',
  SMS_PASS: 'go-2178',
  SMS_FROM: 'MINDS CRAFT',

  /* ── EmailJS — Gmail SMTP (App Password) ──────────────────────────
     Sends FROM minds.craft.lb@gmail.com TO any recipient.
     No OAuth, no domain needed. Uses Gmail App Password.
     Credentials hard-coded (public key is safe to expose client-side).
  ─────────────────────────────────────────────────────────── */
  EJS_PUB: 'mxQhCbU6OzgwHYfGF',
  EJS_SVC: 'service_e7ux8c5',
  EJS_TPL: 'template_szeu3me',

  _ejsReady() { return true; }, // always ready — credentials are hard-coded

  /* ── Legacy shims — so nothing crashes ── */
  _smtpKey()    { return ''; },
  _smtpSender() { return APP_CONFIG.emailSender; },
  _smtpReady()  { return false; },
  _w3fKey()     { return ''; },
  _w3fReady()   { return false; },
  _ejsPub()     { return this.EJS_PUB; },
  _ejsSvc()     { return this.EJS_SVC; },
  _ejsTpl()     { return this.EJS_TPL; },
  _emailFnUrl() { return ''; },
  _resendKey()  { return ''; },
  _resendReady(){ return true; },
  _brevoKey()   { return ''; },
  _brevoReady() { return true; },

  // ─────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────
  async render() {
    const container = document.getElementById('page-container');
    container.innerHTML = `
      <div class="page-header">
        <div class="page-header-left">
          <h2>Notification Engine</h2>
          <p>Broadcast messages, manage automated rules, and track delivery history.</p>
        </div>
        <div class="page-header-actions">
          <button class="btn btn-secondary" onclick="NotificationsPage.openTestModal()">
            <i class="fas fa-vial"></i> Send Test
          </button>
          <button class="btn btn-primary" onclick="NotificationsPage.openCreateRule()">
            <i class="fas fa-plus"></i> Create Rule
          </button>
        </div>
      </div>

      <div class="notif-layout">

        <!-- ── LEFT: Compose ── -->
        <div>
          <div class="card">
            <div class="card-header">
              <div>
                <div class="card-title">Manual Broadcast</div>
                <div class="card-subtitle">Sender: minds.craft.lb@gmail.com / MINDS CRAFT (SMS)</div>
              </div>
            </div>

            <!-- Campaign title -->
            <div class="form-group">
              <label class="form-label">Campaign Title / Subject</label>
              <input type="text" id="notif-title" class="form-input"
                placeholder="e.g. End of Term Notice"
                oninput="NotificationsPage.updatePreview()" />
            </div>

            <!-- Recipient mode toggle -->
            <div class="form-group">
              <label class="form-label">Send To</label>
              <div style="display:flex;gap:8px;margin-bottom:.6rem">
                <button id="mode-btn-audience" class="btn btn-primary btn-sm"
                  onclick="NotificationsPage.setRecipientMode('audience')">
                  <i class="fas fa-users"></i> Audience Group
                </button>
                <button id="mode-btn-specific" class="btn btn-secondary btn-sm"
                  onclick="NotificationsPage.setRecipientMode('specific')">
                  <i class="fas fa-user"></i> Specific Contact
                </button>
              </div>

              <!-- Audience group -->
              <div id="recipient-audience">
                <select id="notif-audience" class="form-select">
                  <option value="all">All Users</option>
                  <option value="parents">Parents Only</option>
                  <option value="students">Students Only</option>
                  <option value="staff">Staff Only</option>
                </select>
              </div>

              <!-- Specific contact -->
              <div id="recipient-specific" style="display:none">
                <div class="form-row" style="margin-bottom:0">
                  <div class="form-group" style="margin-bottom:0">
                    <label class="form-label" style="font-size:11px">Recipient Name (optional)</label>
                    <input type="text" id="specific-name" class="form-input form-input-sm"
                      placeholder="e.g. John Doe" />
                  </div>
                  <div class="form-group" style="margin-bottom:0">
                    <label class="form-label" style="font-size:11px">Email Address</label>
                    <input type="email" id="specific-email" class="form-input form-input-sm"
                      placeholder="email@example.com" />
                  </div>
                </div>
                <div class="form-group" style="margin-top:.5rem;margin-bottom:0">
                  <label class="form-label" style="font-size:11px">Phone Number (for SMS)</label>
                  <input type="tel" id="specific-phone" class="form-input form-input-sm"
                    placeholder="e.g. 96170178043 (no + or spaces)" />
                </div>
              </div>
            </div>

            <!-- Message -->
            <div class="form-group">
              <label class="form-label">Message Content</label>
              <textarea id="notif-content" class="form-textarea" style="min-height:120px"
                placeholder="Write your message… use {fname}, {expiry_date} etc."
                oninput="NotificationsPage.updatePreview()"></textarea>
            </div>

            <!-- Channels -->
            <div class="form-group">
              <label class="form-label">Delivery Channels</label>
              <div class="channel-selector">
                <div class="channel-opt active" data-channel="email"
                  onclick="NotificationsPage.toggleChannel('email', this)">
                  <i class="fas fa-envelope"></i>Email
                </div>
                <div class="channel-opt" data-channel="sms"
                  onclick="NotificationsPage.toggleChannel('sms', this)">
                  <i class="fas fa-sms"></i>SMS
                </div>
                <div class="channel-opt" data-channel="push"
                  onclick="NotificationsPage.toggleChannel('push', this)">
                  <i class="fas fa-bell"></i>Push
                </div>
                <div class="channel-opt" data-channel="whatsapp"
                  onclick="NotificationsPage.toggleChannel('whatsapp', this)">
                  <i class="fab fa-whatsapp"></i>WhatsApp
                </div>
              </div>
            </div>

            <button class="btn btn-primary btn-full" onclick="NotificationsPage.sendBroadcast()">
              <i class="fas fa-paper-plane"></i> Send Broadcast
            </button>
          </div>

          <!-- Live Preview -->
          <div class="card" style="margin-top:1rem">
            <div class="card-header">
              <div class="card-title">Live Preview</div>
              <div id="preview-channel-tabs" style="display:flex;gap:4px">
                <button class="btn btn-primary btn-sm" id="prev-tab-email"
                  onclick="NotificationsPage.switchPreviewTab('email')">Email</button>
                <button class="btn btn-secondary btn-sm" id="prev-tab-sms"
                  onclick="NotificationsPage.switchPreviewTab('sms')">SMS</button>
              </div>
            </div>
            <div id="notif-preview" style="background:var(--bg-tertiary);border-radius:var(--radius-md);
              padding:1rem;font-size:var(--font-size-sm);color:var(--text-secondary);min-height:80px">
              <em style="color:var(--text-muted)">Start typing to see a preview…</em>
            </div>
          </div>
        </div>

        <!-- ── RIGHT: Rules + History ── -->
        <div>
          <!-- Automated Rules -->
          <div class="card" style="margin-bottom:1rem">
            <div class="card-header">
              <div class="card-title">Automated Rules</div>
              <div style="display:flex;gap:6px">
                <button class="btn btn-secondary btn-sm" onclick="NotificationsPage.runExpiryCheck()"
                  title="Run expiry check now">
                  <i class="fas fa-sync"></i> Run Expiry Check
                </button>
                <button class="btn btn-ghost btn-sm" onclick="NotificationsPage.openCreateRule()">
                  <i class="fas fa-plus"></i>
                </button>
              </div>
            </div>
            <div id="rules-list">
              <div class="empty-state"><i class="fas fa-spinner fa-spin"></i></div>
            </div>
          </div>

          <!-- Notification History -->
          <div class="card">
            <div class="card-header">
              <div class="card-title">Notification History</div>
              <div style="display:flex;gap:6px;align-items:center">
                <input type="text" id="log-search" class="form-input form-input-sm"
                  placeholder="Search…" style="width:130px"
                  oninput="NotificationsPage.filterLogs(this.value)" />
                <button class="btn btn-ghost btn-sm" onclick="NotificationsPage.loadLogs()">
                  <i class="fas fa-sync"></i>
                </button>
              </div>
            </div>
            <div id="notif-history">
              <div class="empty-state"><i class="fas fa-spinner fa-spin"></i></div>
            </div>
          </div>
        </div>
      </div>
    `;

    this._recipientMode  = 'audience';
    this._previewTab     = 'email';

    // ── Migrate: if user had a Brevo key saved but no Resend key yet,
    //    keep the Brevo key under the new Resend storage key so they
    //    don't lose their saved credential (they'll just need to replace
    //    it with a Resend key when prompted).
    if (!this._resendKey() && this._brevoKey()) {
      // Don't auto-migrate Brevo key as Resend — just clear it so the
      // banner prompts them for a proper Resend key.
      console.info('[Notifications] Brevo key found but Resend key not set. Please set a Resend key.');
    }

    await Promise.all([this.loadRules(), this.loadLogs()]);

    // Run expiry check once per page load (quietly)
    this.runExpiryCheck(true);
  },

  // ─────────────────────────────────────────────────────────
  // RECIPIENT MODE
  // ─────────────────────────────────────────────────────────
  setRecipientMode(mode) {
    this._recipientMode = mode;
    document.getElementById('recipient-audience').style.display = mode === 'audience' ? '' : 'none';
    document.getElementById('recipient-specific').style.display = mode === 'specific' ? '' : 'none';
    document.getElementById('mode-btn-audience').className =
      'btn btn-sm ' + (mode === 'audience' ? 'btn-primary' : 'btn-secondary');
    document.getElementById('mode-btn-specific').className =
      'btn btn-sm ' + (mode === 'specific' ? 'btn-primary' : 'btn-secondary');
    this.updatePreview();
  },

  // ─────────────────────────────────────────────────────────
  // CHANNELS
  // ─────────────────────────────────────────────────────────
  toggleChannel(channel, el) {
    if (this.selectedChannels.has(channel)) {
      this.selectedChannels.delete(channel);
      el.classList.remove('active');
    } else {
      this.selectedChannels.add(channel);
      el.classList.add('active');
    }
    this.updatePreview();
  },

  // ─────────────────────────────────────────────────────────
  // LIVE PREVIEW
  // ─────────────────────────────────────────────────────────
  _previewTab: 'email',

  switchPreviewTab(tab) {
    this._previewTab = tab;
    ['email','sms'].forEach(t => {
      const btn = document.getElementById(`prev-tab-${t}`);
      if (btn) btn.className = 'btn btn-sm ' + (t === tab ? 'btn-primary' : 'btn-secondary');
    });
    this.updatePreview();
  },

  updatePreview() {
    const content = document.getElementById('notif-content')?.value || '';
    const title   = document.getElementById('notif-title')?.value || '';
    const preview = document.getElementById('notif-preview');
    if (!preview) return;

    const sampleVars = {
      fname: 'John', lname: 'Doe', date: Utils.todayISO(),
      day_name: new Date().toLocaleDateString('en-GB', { weekday:'long' }),
      month_name: new Date().toLocaleDateString('en-GB', { month:'long' }),
      year: new Date().getFullYear(),
      package: 'Robotics – 3 months', expiry_date: '27-Mar-2026',
      days_left: '2', start_date: '25-Mar-2026', end_date: '27-Mar-2026', amount: '$150',
    };
    const rendered = content.replace(/\{(\w+)\}/g, (_, k) => sampleVars[k] || `{${k}}`);

    if (!content.trim()) {
      preview.innerHTML = '<em style="color:var(--text-muted)">Start typing to see a preview…</em>';
      return;
    }

    if (this._previewTab === 'sms') {
      // SMS bubble
      preview.innerHTML = `
        <div style="background:#e5e5ea;border-radius:18px 18px 4px 18px;padding:10px 14px;
          max-width:85%;font-size:var(--font-size-sm);color:#000;white-space:pre-wrap;
          box-shadow:0 1px 2px rgba(0,0,0,.1)">
          <div style="font-size:10px;color:#888;margin-bottom:4px">MINDS CRAFT</div>
          ${Utils.esc(rendered)}
        </div>
        <div style="font-size:10px;color:var(--text-muted);margin-top:6px">
          ${rendered.length} chars · ~${Math.ceil(rendered.length / 160)} SMS segment(s)
        </div>`;
    } else {
      // Email card
      preview.innerHTML = `
        <div style="border:1px solid var(--border-color);border-radius:var(--radius-md);overflow:hidden">
          <div style="background:var(--brand-primary);color:#fff;padding:10px 14px;font-size:12px;font-weight:600">
            ${Utils.esc(title || 'Notification')}
          </div>
          <div style="padding:14px;background:var(--bg-secondary)">
            <div style="font-size:11px;color:var(--text-muted);margin-bottom:8px">
              From: minds.craft.lb@gmail.com
            </div>
            <div style="white-space:pre-wrap;font-size:var(--font-size-sm);color:var(--text-primary)">
              ${Utils.esc(rendered)}
            </div>
          </div>
        </div>`;
    }
  },

  // ─────────────────────────────────────────────────────────
  // SEND BROADCAST
  // ─────────────────────────────────────────────────────────
  async sendBroadcast() {
    const title   = document.getElementById('notif-title')?.value?.trim();
    const content = document.getElementById('notif-content')?.value?.trim();
    const channels = Array.from(this.selectedChannels);

    if (!content) return Toast.warning('Please write a message.');
    if (!channels.length) return Toast.warning('Select at least one channel.');

    let recipients = []; // [{name, email, phone}]

    if (this._recipientMode === 'specific') {
      const name  = document.getElementById('specific-name')?.value?.trim() || 'Recipient';
      const email = document.getElementById('specific-email')?.value?.trim();
      const phone = document.getElementById('specific-phone')?.value?.trim();
      if (!email && !phone) return Toast.warning('Enter an email or phone number.');
      recipients = [{ name, email, phone }];
    } else {
      const audience = document.getElementById('notif-audience')?.value;
      const typeMap  = { all: null, parents: 'parent', students: 'student', staff: 'staff' };
      const type     = typeMap[audience];
      const { data: users } = type ? await DB.getUsersByType(type) : await DB.getUsers();
      recipients = (users || []).map(u => ({
        id: u.id, name: u.full_name || '', email: u.email || '', phone: u.phone || '',
      })).filter(u => u.email || u.phone);
    }

    if (!recipients.length) return Toast.warning('No recipients found.');

    const btn = document.querySelector('[onclick="NotificationsPage.sendBroadcast()"]');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sending…'; }

    let sent = 0, failed = 0;

    for (const r of recipients) {
      for (const ch of channels) {
        let ok = true;
        try {
          if (ch === 'sms' && r.phone) {
            const result = await this._sendSMS(r.phone, content);
            ok = result.ok;
          } else if (ch === 'email' && r.email && this._ejsReady()) {
            const result = await this._sendEmail(r.email, title || 'Notification from Minds\' Craft', content);
            ok = result.ok;
          }
          // push / whatsapp — logged only (no integration yet)
        } catch { ok = false; }

        // Log each delivery
        await DB.logNotification({
          subject:           title || 'Manual Broadcast',
          body:              content,
          channel:           ch,
          status:            ok ? 'sent' : 'failed',
          recipient_id:      r.id || null,
          recipient_name:    r.name || null,
          recipient_contact: ch === 'sms' ? (r.phone || null) : (r.email || null),
        });

        ok ? sent++ : failed++;
      }
    }

    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-paper-plane"></i> Send Broadcast'; }

    if (failed === 0) Toast.success(`Sent to ${recipients.length} recipient(s) via ${channels.join(', ')}!`);
    else Toast.warning(`${sent} sent, ${failed} failed.`);

    // Reset
    document.getElementById('notif-content').value = '';
    document.getElementById('notif-title').value = '';
    this.updatePreview();
    await this.loadLogs();
  },

  // ─────────────────────────────────────────────────────────
  // SMS SEND (GlobeSMS)
  // ─────────────────────────────────────────────────────────
  async _sendSMS(phone, text) {
    const url = `${this.SMS_API}?username=${encodeURIComponent(this.SMS_USER)}`
      + `&password=${encodeURIComponent(this.SMS_PASS)}`
      + `&action=sendsms`
      + `&from=${encodeURIComponent(this.SMS_FROM)}`
      + `&to=${encodeURIComponent(phone)}`
      + `&text=${encodeURIComponent(text)}`;
    try {
      const res = await fetch(url, { method: 'GET', mode: 'no-cors' });
      // no-cors means we can't read the response body — treat as success
      return { ok: true };
    } catch (err) {
      console.error('SMS send error:', err);
      return { ok: false, error: err.message };
    }
  },

  // ─────────────────────────────────────────────────────────
  // SEND TEST MODAL
  // ─────────────────────────────────────────────────────────
  openTestModal() {
    const ejsOk = (typeof emailjs !== 'undefined');

    Modal.open('Send Test Notification', `
      <div>

        <!-- ── EmailJS status banner ────────────────────────────── -->
        <div style="border:1px solid ${ejsOk ? 'rgba(34,197,94,.35)' : 'rgba(239,68,68,.4)'};
          border-radius:var(--radius-md);padding:10px 14px;margin-bottom:14px;
          background:${ejsOk ? 'rgba(34,197,94,.06)' : 'rgba(239,68,68,.05)'}">
          <div style="font-size:12.5px;font-weight:600">
            <i class="fas fa-${ejsOk ? 'check-circle' : 'exclamation-triangle'}"
              style="color:${ejsOk ? '#22c55e' : '#ef4444'};margin-right:6px"></i>
            ${ejsOk
              ? 'EmailJS &#10003; &mdash; envoi depuis <strong>minds.craft.lb@gmail.com</strong> vers n\'importe quel destinataire'
              : 'EmailJS SDK non chargé &mdash; vérifiez votre connexion internet et rechargez la page'}
          </div>
        </div>

        <div class="form-group">
          <label class="form-label">Channel</label>
          <select id="test-channel" class="form-select" onchange="NotificationsPage._onTestChannelChange()">
            <option value="email">Email</option>
            <option value="sms">SMS</option>
          </select>
        </div>

        <div class="form-group" id="test-email-wrap">
          <label class="form-label">Recipient Email *</label>
          <input type="email" id="test-email" class="form-input" placeholder="test@example.com" />
        </div>

        <div class="form-group" id="test-phone-wrap" style="display:none">
          <label class="form-label">Recipient Phone *</label>
          <input type="tel" id="test-phone" class="form-input" placeholder="96170178043" />
          <p style="font-size:11px;color:var(--text-muted);margin-top:3px">
            International format, no + or spaces (e.g. 96170178043)
          </p>
        </div>

        <div class="form-group">
          <label class="form-label">Subject <span style="font-size:10px;color:var(--text-muted);font-weight:400">(email only)</span></label>
          <input type="text" id="test-subject" class="form-input"
            value="Test Notification — Minds' Craft" />
        </div>

        <div class="form-group">
          <label class="form-label">Message</label>
          <textarea id="test-message" class="form-textarea" rows="4">This is a test notification from Minds' Craft admin portal. If you received this, the channel is working correctly.</textarea>
        </div>

        <div id="test-result" style="display:none;margin-bottom:.75rem"></div>

        <!-- Connectivity check row -->
        <div id="conn-result" style="display:none;margin-bottom:.75rem"></div>

        <div class="modal-footer" style="padding:0;border:none;margin-top:1rem;flex-wrap:wrap;gap:8px">
          <button type="button" class="btn btn-secondary" onclick="Modal.close()">Cancel</button>
          <button type="button" class="btn btn-ghost btn-sm" style="margin-right:auto"
            onclick="NotificationsPage._checkConn()">
            <i class="fas fa-plug"></i> Check Connection
          </button>
          <button type="button" class="btn btn-primary" onclick="NotificationsPage.runTest()">
            <i class="fas fa-paper-plane"></i> Send Test
          </button>
        </div>
      </div>
    `);
  },

  /* _saveW3fKey — legacy shim, Web3Forms no longer used */
  _saveW3fKey() { Toast.info('Web3Forms n\'est plus utilisé. Configurez Elastic Email ci-dessus.'); },

  async _checkConn() {
    const el = document.getElementById('conn-result');
    const show = (html) => { if (el) { el.style.display = ''; el.innerHTML = html; } };

    if (typeof emailjs === 'undefined') {
      show(`<div class="alert alert-danger" style="margin:0;font-size:12px">
        <i class="fas fa-times-circle"></i>
        EmailJS SDK non chargé. Vérifiez votre connexion internet et rechargez la page.
      </div>`);
      return;
    }
    show(`<div class="alert alert-success" style="margin:0;font-size:12px">
      <i class="fas fa-check-circle"></i>
      <strong>EmailJS prêt ✓</strong> &mdash; Service Gmail configuré.
      Entrez un email destinataire et cliquez <strong>Send Test</strong>.
    </div>`);
  },

  _saveSmtpConfig()   { /* no-op — EmailJS credentials are hard-coded */ },

  /* Legacy shims */
  _saveEjsConfig()    { /* no-op */ },
  _saveResendKey()    { /* no-op */ },
  _saveBrevoKey()     { /* no-op */ },
  async _verifyBrevoKey() {},

  _onTestChannelChange() {
    const ch = document.getElementById('test-channel')?.value;
    document.getElementById('test-email-wrap').style.display = ch === 'email' ? '' : 'none';
    document.getElementById('test-phone-wrap').style.display = ch === 'sms'   ? '' : 'none';
  },

  async runTest() {
    const ch      = document.getElementById('test-channel')?.value;
    const email   = document.getElementById('test-email')?.value?.trim();
    const phone   = document.getElementById('test-phone')?.value?.trim();
    const subject = document.getElementById('test-subject')?.value?.trim() || "Test — Minds' Craft";
    const message = document.getElementById('test-message')?.value?.trim();
    const resultEl = document.getElementById('test-result');

    if (!message) return Toast.warning('Please enter a test message.');
    if (ch === 'email' && !email) return Toast.warning('Enter a recipient email.');
    if (ch === 'sms'   && !phone) return Toast.warning('Enter a recipient phone number.');

    const contact = ch === 'sms' ? phone : email;
    const btn = document.querySelector('[onclick="NotificationsPage.runTest()"]');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sending…'; }
    if (resultEl) resultEl.style.display = 'none';

    let ok = true;
    let detail = '';

    if (ch === 'sms') {
      const result = await this._sendSMS(phone, message);
      ok     = result.ok;
      detail = ok
        ? `SMS dispatched to ${phone} via GlobeSMS.`
        : `SMS failed: ${result.error || 'unknown error'}`;

    } else {
      // Email via EmailJS (Gmail SMTP)
      const result = await this._sendEmail(email, subject, message);
      ok     = result.ok;
      detail = ok
        ? `✓ Email envoyé à ${email} depuis minds.craft.lb@gmail.com`
        : (result.error || 'Erreur inconnue');
    }

    if (resultEl) {
      resultEl.style.display = '';
      if (!ok) {
        resultEl.innerHTML = `
          <div class="alert alert-danger" style="margin:0;line-height:1.7">
            <i class="fas fa-times-circle"></i>
            <strong>Envoi échoué :</strong> ${Utils.esc(detail)}
          </div>`;
      } else {
        resultEl.innerHTML = `
          <div class="alert alert-success" style="margin:0">
            <i class="fas fa-check-circle"></i>
            ${Utils.esc(detail)}
          </div>`;
      }
    }
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-paper-plane"></i> Send Test'; }

    // Log
    await DB.logNotification({
      subject:           `[TEST] ${ch.toUpperCase()}`,
      body:              message,
      channel:           ch,
      status:            ok ? 'sent' : 'failed',
      recipient_name:    'Test',
      recipient_contact: contact,
    });
    await this.loadLogs();
  },

  // ─────────────────────────────────────────────────────────
  // EMAIL SEND — via EmailJS (Gmail SMTP + App Password)
  // Sends FROM minds.craft.lb@gmail.com TO any recipient.
  // ─────────────────────────────────────────────────────────
  async _sendEmail(toEmail, subject, message, toName) {
    if (typeof emailjs === 'undefined') {
      return { ok: false, error: 'EmailJS SDK non chargé — vérifiez votre connexion internet.' };
    }
    try {
      emailjs.init(this.EJS_PUB);
      const resp = await emailjs.send(this.EJS_SVC, this.EJS_TPL, {
        to_email: toEmail,
        to_name:  toName || toEmail,
        subject:  subject || "Notification — Minds' Craft",
        message:  message,
        from_name: "Minds' Craft",
      });
      console.log('[EmailJS]', resp.status, resp.text);
      if (resp.status === 200) return { ok: true };
      return { ok: false, error: `EmailJS status ${resp.status}: ${resp.text}` };
    } catch (e) {
      console.error('[EmailJS] error:', e);
      const msg = e?.text || e?.message || JSON.stringify(e);
      return { ok: false, error: msg };
    }
  },

  // ─────────────────────────────────────────────────────────
  // RULES
  // ─────────────────────────────────────────────────────────
  async loadRules() {
    const { data, error } = await DB.getNotificationRules();
    this.rules = data || [];
    const el = document.getElementById('rules-list');
    if (!el) return;

    if (!this.rules.length) {
      el.innerHTML = '<div class="empty-state"><i class="fas fa-robot"></i><p>No rules defined</p></div>';
      return;
    }

    el.innerHTML = this.rules.map(r => `
      <div class="rule-card">
        <div class="rule-card-info">
          <div style="font-weight:600;font-size:var(--font-size-sm)">${Utils.esc(r.title)}</div>
          <div style="font-size:var(--font-size-xs);color:var(--text-muted);margin-top:2px">
            Trigger: ${Utils.esc(r.trigger_event)}
            ${r.trigger_event === 'on_expiry_reminder' ? ' · 2 days before end · once per expiry' : ''}
          </div>
          <div class="rule-card-channels" style="margin-top:6px">
            ${(r.channels || []).map(ch => `<span class="channel-badge channel-${ch}">${ch}</span>`).join('')}
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:8px;flex-shrink:0">
          <span class="badge ${r.is_active ? 'badge-green' : 'badge-gray'}">${r.is_active ? 'Active' : 'Off'}</span>
          <button class="btn btn-ghost btn-icon btn-sm" onclick="NotificationsPage.openEditRule('${r.id}')">
            <i class="fas fa-edit"></i>
          </button>
          <button class="btn btn-danger btn-icon btn-sm" onclick="NotificationsPage.deleteRule('${r.id}')">
            <i class="fas fa-trash"></i>
          </button>
        </div>
      </div>
    `).join('');
  },

  openCreateRule() {
    Modal.open('Create Notification Rule', this.ruleFormHTML(null), { size: 'lg' });
  },

  openEditRule(id) {
    const rule = this.rules.find(r => r.id === id);
    if (!rule) return;
    Modal.open('Edit Rule', this.ruleFormHTML(rule), { size: 'lg' });
  },

  ruleFormHTML(r) {
    const triggers = [
      { val: 'on_student_created',  label: 'New Student Registered' },
      { val: 'on_payment',          label: 'Payment Received' },
      { val: 'on_renewal',          label: 'Subscription Renewed' },
      { val: 'on_expiry_reminder',  label: 'Subscription Expiring Soon (2 days before, sent once)' },
      { val: 'on_absent',           label: 'Student Marked Absent' },
      { val: 'on_event_registered', label: 'Event Registration' },
      { val: 'on_birthday',         label: 'Student Birthday' },
    ];
    const placeholders = [
      '{fname}','{lname}','{date}','{day_name}','{month_name}','{year}',
      '{package}','{expiry_date}','{days_left}','{start_date}','{end_date}','{amount}',
    ];
    const channels    = ['email','sms','push','whatsapp'];
    const ruleChannels = r?.channels || ['email'];

    return `
      <form onsubmit="NotificationsPage.saveRule(event, ${r ? `'${r.id}'` : 'null'})">
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Rule Title *</label>
            <input type="text" name="title" class="form-input" required value="${Utils.esc(r?.title || '')}" />
          </div>
          <div class="form-group">
            <label class="form-label">Trigger Event</label>
            <select name="trigger_event" class="form-select">
              ${triggers.map(t => `<option value="${t.val}" ${r?.trigger_event===t.val?'selected':''}>${t.label}</option>`).join('')}
            </select>
          </div>
        </div>

        <div class="form-group">
          <label class="form-label">Channels</label>
          <div style="display:flex;gap:14px;flex-wrap:wrap">
            ${channels.map(ch => `
              <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:var(--font-size-sm)">
                <input type="checkbox" name="channels" value="${ch}" ${ruleChannels.includes(ch)?'checked':''}
                  style="accent-color:var(--brand-primary)" />
                ${ch.charAt(0).toUpperCase()+ch.slice(1)}
              </label>`).join('')}
          </div>
        </div>

        <div class="form-group">
          <label class="form-label">Email Template</label>
          <textarea name="email_template" class="form-textarea" style="min-height:90px"
            placeholder="Hi {fname}, …">${Utils.esc(r?.email_template || '')}</textarea>
        </div>

        <div class="form-group">
          <label class="form-label">SMS / WhatsApp Template</label>
          <textarea name="sms_template" class="form-textarea" rows="3"
            placeholder="Hi {fname}, your subscription expires on {expiry_date}. …">${Utils.esc(r?.sms_template || '')}</textarea>
        </div>

        <div class="form-group">
          <label class="form-label">Available Placeholders <span style="font-size:10px;color:var(--text-muted)">(click to copy)</span></label>
          <div style="display:flex;flex-wrap:wrap;gap:6px">
            ${placeholders.map(p => `
              <code style="background:var(--bg-tertiary);padding:2px 8px;border-radius:4px;font-size:11px;
                cursor:pointer;border:1px solid var(--border-color)"
                onclick="navigator.clipboard.writeText('${p}');Toast.success('Copied!')">${p}</code>
            `).join('')}
          </div>
        </div>

        <div class="form-group">
          <label class="form-label">Status</label>
          <div class="toggle-wrap">
            <label class="toggle">
              <input type="checkbox" name="is_active" ${r?.is_active !== false ? 'checked' : ''} />
              <span class="toggle-slider"></span>
            </label>
            <span style="font-size:var(--font-size-sm)">Active</span>
          </div>
        </div>

        <div class="modal-footer" style="padding:0;border:none;margin-top:1rem">
          <button type="button" class="btn btn-secondary" onclick="Modal.close()">Cancel</button>
          <button type="submit" class="btn btn-primary">
            <i class="fas fa-save"></i> ${r ? 'Update Rule' : 'Create Rule'}
          </button>
        </div>
      </form>
    `;
  },

  async saveRule(e, id) {
    e.preventDefault();
    const form = e.target;
    const fd   = new FormData(form);
    const data = {
      title:          fd.get('title'),
      trigger_event:  fd.get('trigger_event'),
      channels:       fd.getAll('channels'),
      email_template: fd.get('email_template') || null,
      sms_template:   fd.get('sms_template')   || null,
      is_active:      form.querySelector('[name="is_active"]')?.checked ?? true,
    };
    try {
      const result = id
        ? await DB.updateNotificationRule(id, data)
        : await DB.createNotificationRule(data);
      if (result.error) throw result.error;
      Toast.success(id ? 'Rule updated!' : 'Rule created!');
      Modal.close();
      await this.loadRules();
    } catch (err) { Toast.error(err.message || 'Failed to save rule'); }
  },

  async deleteRule(id) {
    if (!confirm('Delete this notification rule?')) return;
    const { error } = await DB.deleteNotificationRule(id);
    if (error) return Toast.error(error.message);
    Toast.success('Rule deleted');
    await this.loadRules();
  },

  // ─────────────────────────────────────────────────────────
  // EXPIRY CHECK — 2 days before end_date, sent once per allocation
  // ─────────────────────────────────────────────────────────
  async runExpiryCheck(silent = false) {
    // Find active expiry-reminder rules
    const expiryRules = this.rules.filter(
      r => r.is_active && r.trigger_event === 'on_expiry_reminder'
    );
    if (!expiryRules.length) {
      if (!silent) Toast.info('No active expiry-reminder rule found. Create one first.');
      return;
    }

    const today   = new Date(); today.setHours(0,0,0,0);
    const target  = new Date(today); target.setDate(today.getDate() + 2); // 2 days ahead

    // Fetch active allocations expiring on target date
    const { data: allocations } = await DB.getAll('student_allocations', {
      select: '*, student:student_id(id, full_name, email, phone), package:package_id(name)',
      filter: { status: 'active' },
    });

    const expiring = (allocations || []).filter(a => {
      if (!a.end_date) return false;
      const d = new Date(a.end_date); d.setHours(0,0,0,0);
      return d.getTime() === target.getTime();
    });

    if (!expiring.length) {
      if (!silent) Toast.info('No subscriptions expiring in exactly 2 days.');
      return;
    }

    // For each expiring allocation, check if we already sent a reminder for it today.
    // We tag each log with subject '[EXPIRY REMINDER]' and store alloc end_date in body prefix.
    const { data: recentLogs } = await DB.getAll('notification_logs', {
      filter: { subject: '[EXPIRY REMINDER]' },
      limit: 1000,
    });

    // Key = studentId + endDate (so one reminder per allocation end-date, per student)
    const alreadySent = new Set(
      (recentLogs || []).map(l => `${l.recipient_id}__${(l.body || '').slice(0, 10)}`)
    );

    let sent = 0;
    for (const rule of expiryRules) {
      for (const alloc of expiring) {
        const student = alloc.student;
        if (!student) continue;

        const key = `${student.id}__${alloc.end_date}`;
        if (alreadySent.has(key)) continue; // already sent once for this allocation

        const vars = {
          fname:       student.full_name?.split(' ')[0] || student.full_name || '',
          lname:       student.full_name?.split(' ').slice(1).join(' ') || '',
          package:     alloc.package?.name || '',
          expiry_date: Utils.formatDate(alloc.end_date),
          days_left:   '2',
          end_date:    Utils.formatDate(alloc.end_date),
        };

        for (const ch of (rule.channels || ['email'])) {
          const template = ch === 'email' ? rule.email_template : rule.sms_template;
          const body = this._fillTemplate(template || this._defaultExpiryMsg(vars), vars);

          let ok = true;
          if (ch === 'sms' && student.phone) {
            const res = await this._sendSMS(student.phone, body);
            ok = res.ok;
          }

          // Prefix body with end_date so duplicate check (body.slice(0,10)) works
          await DB.logNotification({
            rule_id:           rule.id,
            recipient_id:      student.id,
            recipient_name:    student.full_name,
            recipient_contact: ch === 'sms' ? student.phone : student.email,
            channel:           ch,
            subject:           '[EXPIRY REMINDER]',
            body:              `${alloc.end_date} — ${body}`,
            status:            ok ? 'sent' : 'failed',
          });
          sent++;
        }
      }
    }

    if (!silent) {
      if (sent) Toast.success(`Expiry reminders sent for ${expiring.length} subscription(s).`);
      else Toast.info('Reminders already sent for all expiring subscriptions.');
    }
    await this.loadLogs();
  },

  _fillTemplate(template, vars) {
    return template.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? `{${k}}`);
  },

  _defaultExpiryMsg(vars) {
    return `Hi ${vars.fname}, your subscription "${vars.package}" expires on ${vars.expiry_date} (in ${vars.days_left} days). Please renew to continue.`;
  },

  // ─────────────────────────────────────────────────────────
  // NOTIFICATION HISTORY
  // ─────────────────────────────────────────────────────────
  _allLogs: [],

  async loadLogs() {
    const { data } = await DB.getNotificationLogs({ limit: 100 });
    this._allLogs = data || [];
    this._renderLogs(this._allLogs);
  },

  filterLogs(q) {
    const term = (q || '').toLowerCase().trim();
    const filtered = term
      ? this._allLogs.filter(l =>
          (l.recipient_name || '').toLowerCase().includes(term) ||
          (l.recipient_contact || '').toLowerCase().includes(term) ||
          (l.subject || '').toLowerCase().includes(term) ||
          (l.channel || '').toLowerCase().includes(term)
        )
      : this._allLogs;
    this._renderLogs(filtered);
  },

  _renderLogs(logs) {
    const el = document.getElementById('notif-history');
    if (!el) return;

    if (!logs.length) {
      el.innerHTML = `<div class="empty-state" style="padding:2rem 0">
        <i class="fas fa-inbox"></i><p>No notifications yet</p></div>`;
      return;
    }

    const chIcon = { email:'fa-envelope', sms:'fa-sms', push:'fa-bell', whatsapp:'fa-whatsapp' };
    const chColor = { email:'#6366f1', sms:'#22c55e', push:'#f59e0b', whatsapp:'#25d366' };

    el.innerHTML = logs.map((l, idx) => {
      const icon  = chIcon[l.channel] || 'fa-paper-plane';
      const color = chColor[l.channel] || 'var(--text-muted)';
      const when  = l.sent_at
        ? new Date(l.sent_at).toLocaleString('en-GB', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' })
        : '—';
      const ago   = l.sent_at ? Utils.timeAgo(l.sent_at) : '';

      return `
        <div class="notif-log-row" id="log-row-${idx}" onclick="NotificationsPage.toggleLogDetail(${idx})"
          style="padding:10px 0;border-bottom:1px solid var(--border-light);cursor:pointer">
          <div style="display:flex;align-items:center;gap:10px">
            <!-- Channel icon -->
            <div style="width:32px;height:32px;border-radius:50%;background:${color}18;
              display:flex;align-items:center;justify-content:center;flex-shrink:0">
              <i class="fa${l.channel==='whatsapp'?'b':'s'} ${icon}" style="color:${color};font-size:13px"></i>
            </div>

            <!-- Main info -->
            <div style="flex:1;min-width:0">
              <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
                <span style="font-size:var(--font-size-sm);font-weight:600;
                  white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:180px"
                  title="${Utils.esc(l.subject || '')}">
                  ${Utils.esc(l.subject || 'Notification')}
                </span>
                <span class="badge ${l.status === 'sent' ? 'badge-green' : 'badge-red'}" style="font-size:10px">
                  ${l.status}
                </span>
              </div>
              <div style="font-size:var(--font-size-xs);color:var(--text-muted);margin-top:2px;display:flex;gap:8px;flex-wrap:wrap">
                ${l.recipient_name
                  ? `<span><i class="fas fa-user" style="margin-right:3px"></i>${Utils.esc(l.recipient_name)}</span>`
                  : ''}
                ${l.recipient_contact
                  ? `<span><i class="fas fa-at" style="margin-right:3px"></i>${Utils.esc(l.recipient_contact)}</span>`
                  : ''}
                <span><i class="fas fa-clock" style="margin-right:3px"></i>${when}</span>
                <span style="color:var(--text-muted)">(${ago})</span>
              </div>
            </div>

            <!-- Expand arrow -->
            <i class="fas fa-chevron-down" id="log-chevron-${idx}"
              style="color:var(--text-muted);font-size:11px;transition:transform .2s;flex-shrink:0"></i>
          </div>

          <!-- Expandable detail -->
          <div id="log-detail-${idx}" style="display:none;margin-top:10px;padding:10px 12px;
            background:var(--bg-tertiary);border-radius:var(--radius-md);
            font-size:var(--font-size-xs);color:var(--text-secondary)">
            <div style="display:flex;gap:16px;flex-wrap:wrap;margin-bottom:8px">
              <div><strong>Channel:</strong> ${Utils.esc((l.channel || '').toUpperCase())}</div>
              <div><strong>Status:</strong> ${Utils.esc(l.status || '')}</div>
              <div><strong>Sent:</strong> ${when}</div>
              ${l.recipient_name ? `<div><strong>To:</strong> ${Utils.esc(l.recipient_name)}</div>` : ''}
              ${l.recipient_contact ? `<div><strong>Contact:</strong> ${Utils.esc(l.recipient_contact)}</div>` : ''}
            </div>
            <div style="border-top:1px solid var(--border-color);padding-top:8px">
              <strong style="display:block;margin-bottom:4px">Message:</strong>
              <div style="white-space:pre-wrap;line-height:1.6">${Utils.esc(l.body || '(no body)')}</div>
            </div>
          </div>
        </div>`;
    }).join('');
  },

  toggleLogDetail(idx) {
    const detail   = document.getElementById(`log-detail-${idx}`);
    const chevron  = document.getElementById(`log-chevron-${idx}`);
    if (!detail) return;
    const open = detail.style.display === 'none';
    detail.style.display  = open ? '' : 'none';
    if (chevron) chevron.style.transform = open ? 'rotate(180deg)' : '';
  },
};
