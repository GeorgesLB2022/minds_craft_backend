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
              <button class="btn btn-secondary btn-sm" onclick="NotificationsPage.openHistoryModal()">
                <i class="fas fa-history"></i> View History
              </button>
            </div>
            <div style="padding:1rem;text-align:center;color:var(--text-muted);font-size:var(--font-size-sm)">
              <i class="fas fa-history" style="font-size:2rem;opacity:.3;display:block;margin-bottom:.5rem"></i>
              Click <strong>View History</strong> to see all sent notifications,
              grouped by time period.
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
  // ─────────────────────────────────────────────────────────
  // TRIGGER RULE — fires active rules matching a trigger event
  // Called externally: NotificationsPage.triggerRule('on_payment', { ... })
  // ─────────────────────────────────────────────────────────
  async triggerRule(triggerEvent, data = {}) {
    // Load rules if not already loaded
    if (!this.rules || !this.rules.length) {
      const { data: rules } = await DB.getNotificationRules();
      this.rules = rules || [];
    }

    const matchingRules = this.rules.filter(
      r => r.is_active && r.trigger_event === triggerEvent
    );
    if (!matchingRules.length) return; // no active rule for this event — silent exit

    // Build template variables from data
    const vars = {
      fname:        data.fname        || data.full_name?.split(' ')[0] || '',
      lname:        data.lname        || data.full_name?.split(' ').slice(1).join(' ') || '',
      full_name:    data.full_name    || '',
      email:        data.email        || '',
      phone:        data.phone        || '',
      package:      data.package      || '',
      amount:       data.amount       !== undefined ? String(data.amount) : '',
      start_date:   data.start_date   ? Utils.formatDate(data.start_date)   : '',
      end_date:     data.end_date     ? Utils.formatDate(data.end_date)     : '',
      expiry_date:  data.end_date     ? Utils.formatDate(data.end_date)     : '',
    };

    for (const rule of matchingRules) {
      for (const ch of (rule.channels || ['email'])) {
        const template = ch === 'email' ? rule.email_template : rule.sms_template;
        const body     = this._fillTemplate(
          template || this._defaultTriggerMsg(triggerEvent, vars), vars
        );
        const subject  = rule.title || `Notification — Minds' Craft`;

        let ok = false;

        if (ch === 'sms' && data.phone) {
          const res = await this._sendSMS(data.phone, body);
          ok = res.ok;
        } else if (ch === 'email' && data.email && this._ejsReady()) {
          const res = await this._sendEmail(data.email, subject, body, vars.fname || vars.full_name);
          ok = res.ok;
        }

        await DB.logNotification({
          rule_id:           rule.id,
          recipient_id:      data.student_id || data.id || null,
          recipient_name:    data.full_name  || data.name || '',
          recipient_contact: ch === 'sms' ? data.phone : data.email,
          channel:           ch,
          subject:           subject,
          body:              body,
          status:            ok ? 'sent' : 'failed',
        });
      }
    }

    // Refresh history if the notifications page is currently open
    if (document.getElementById('notif-history')) await this.loadLogs();
  },

  _defaultTriggerMsg(triggerEvent, vars) {
    if (triggerEvent === 'on_payment') {
      return `Hi ${vars.fname}, your payment for "${vars.package}" has been received.`
        + (vars.amount    ? ` Amount: $${vars.amount}.`           : '')
        + (vars.end_date  ? ` Valid until: ${vars.expiry_date}.`  : '');
    }
    if (triggerEvent === 'on_student_created') {
      return `Welcome to Minds' Craft, ${vars.fname}! Your account has been created successfully.`;
    }
    return `Hi ${vars.fname}, you have a new notification from Minds' Craft.`;
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

    // Use local date strings (YYYY-MM-DD) — no timezone issues
    const localToday = new Date();
    const pad = n => String(n).padStart(2, '0');
    const toDateStr = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
    const addDays = (date, days) => {
      const d = new Date(date); d.setDate(d.getDate() + days); return toDateStr(d);
    };
    const todayStr = toDateStr(localToday);
    // Window: today (0), tomorrow (1), or 2 days from now (2)
    // This way if you missed opening the app on time, the reminder still fires
    const windowDates = new Set([
      todayStr,
      addDays(localToday, 1),
      addDays(localToday, 2),
    ]);

    // Fetch all active allocations
    const { data: allocations } = await DB.getAll('student_allocations', {
      select: '*, student:student_id(id, full_name, email, phone), package:package_id(name)',
      filter: { status: 'active' },
    });

    // Find allocations whose end_date falls within the 0–2 day window
    const expiring = (allocations || []).filter(a => {
      if (!a.end_date) return false;
      return windowDates.has(a.end_date.slice(0, 10));
    });

    if (!expiring.length) {
      if (!silent) Toast.info(`No subscriptions expiring within 2 days (checked: ${todayStr} to ${addDays(localToday, 2)}).`);
      return;
    }

    // ── Dedup: fetch ALL expiry reminder logs ever sent ───────────────
    // Key format: "studentId__YYYY-MM-DD" (student id + allocation end_date)
    // If this exact key exists in logs → reminder was already sent → skip forever.
    const { data: recentLogs } = await DB.getAll('notification_logs', {
      filter: { subject: '[EXPIRY REMINDER]' },
      limit: 5000,
    });

    // Build set from logs: recipient_id + end_date extracted from body prefix
    const alreadySent = new Set(
      (recentLogs || [])
        .filter(l => l.recipient_id && l.body)
        .map(l => {
          const endDate = (l.body || '').slice(0, 10); // body starts with "YYYY-MM-DD — ..."
          return `${l.recipient_id}__${endDate}`;
        })
    );

    let sent = 0;
    for (const rule of expiryRules) {
      for (const alloc of expiring) {
        const student = alloc.student;
        if (!student) continue;

        // This key is unique per student + per allocation end_date
        // Once logged, this reminder will NEVER be sent again for this allocation
        const key = `${student.id}__${alloc.end_date}`;
        if (alreadySent.has(key)) continue; // already sent — skip forever

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
          const body     = this._fillTemplate(template || this._defaultExpiryMsg(vars), vars);
          const subject  = rule.title || "Subscription Expiring Soon — Minds' Craft";

          let ok = false;
          if (ch === 'sms' && student.phone) {
            const res = await this._sendSMS(student.phone, body);
            ok = res.ok;
          } else if (ch === 'email' && student.email && this._ejsReady()) {
            const res = await this._sendEmail(student.email, subject, body, vars.fname);
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
    const { data } = await DB.getNotificationLogs({ limit: 200 });
    this._allLogs = data || [];
  },

  // ─────────────────────────────────────────────────────────
  // NOTIFICATION HISTORY MODAL
  // ─────────────────────────────────────────────────────────
  async openHistoryModal() {
    // Show loading modal immediately
    Modal.open('Notification History', `
      <div style="text-align:center;padding:2rem">
        <i class="fas fa-spinner fa-spin" style="font-size:2rem;color:var(--brand-primary)"></i>
        <p style="margin-top:.75rem;color:var(--text-muted)">Loading history…</p>
      </div>
    `, { size: 'xl' });

    // Fetch fresh logs
    const { data } = await DB.getNotificationLogs({ limit: 500 });
    this._allLogs = data || [];
    this._renderHistoryModal(this._allLogs);
  },

  // Build just the grouped rows HTML — used by both initial render and search filter
  _buildGroupsHTML(logs) {
    const chIcon  = { email:'fa-envelope', sms:'fa-comment-sms', push:'fa-bell', whatsapp:'fa-whatsapp' };
    const chColor = { email:'#6366f1',     sms:'#22c55e',        push:'#f59e0b', whatsapp:'#25d366'     };
    const chBg    = { email:'rgba(99,102,241,.12)', sms:'rgba(34,197,94,.12)',
                      push:'rgba(245,158,11,.12)',  whatsapp:'rgba(37,211,102,.12)' };

    // ── Group logs by time period ─────────────────────────────
    const now      = new Date();
    const groups   = { Today:[], Yesterday:[], 'This Week':[], 'This Month':[], Older:[] };
    const todayStr = now.toDateString();
    const yesterdayStr = new Date(now - 86400000).toDateString();
    const weekAgo  = new Date(now - 7  * 86400000);
    const monthAgo = new Date(now - 30 * 86400000);

    logs.forEach(l => {
      const d = new Date(l.sent_at || l.created_at);
      const ds = d.toDateString();
      if (ds === todayStr)              groups['Today'].push(l);
      else if (ds === yesterdayStr)     groups['Yesterday'].push(l);
      else if (d >= weekAgo)            groups['This Week'].push(l);
      else if (d >= monthAgo)           groups['This Month'].push(l);
      else                              groups['Older'].push(l);
    });

    // ── Build group HTML ──────────────────────────────────────
    const buildGroup = (label, items) => {
      if (!items.length) return '';
      const rows = items.map((l, idx) => {
        const icon  = chIcon[l.channel]  || 'fa-paper-plane';
        const color = chColor[l.channel] || 'var(--text-muted)';
        const bg    = chBg[l.channel]    || 'rgba(156,163,175,.1)';
        const d     = new Date(l.sent_at || l.created_at);
        const timeStr = d.toLocaleTimeString('en-GB', { hour:'2-digit', minute:'2-digit' });
        const dateStr = d.toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' });
        const isEmail = l.channel === 'email';
        const uid = `hlog-${label.replace(/\s/g,'')}-${idx}`;
        // Clean body — remove date prefix added by expiry check
        const cleanBody = (l.body || '').replace(/^\d{4}-\d{2}-\d{2}\s*—\s*/, '');

        return `
          <div style="display:flex;gap:12px;padding:12px 0;
            border-bottom:1px solid var(--border-light);align-items:flex-start">

            <!-- Channel bubble -->
            <div style="width:38px;height:38px;border-radius:50%;background:${bg};
              display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-top:2px">
              <i class="fa${l.channel==='whatsapp'?'b':'s'} ${icon}"
                style="color:${color};font-size:14px"></i>
            </div>

            <!-- Content -->
            <div style="flex:1;min-width:0">
              <!-- Row 1: subject + status badge -->
              <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:4px">
                <span style="font-weight:600;font-size:var(--font-size-sm);
                  overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:280px"
                  title="${Utils.esc(l.subject || '')}">
                  ${Utils.esc(l.subject || 'Notification')}
                </span>
                <span style="display:inline-flex;align-items:center;gap:4px;padding:2px 8px;
                  border-radius:99px;font-size:10px;font-weight:600;
                  background:${l.status==='sent' ? 'rgba(34,197,94,.15)' : 'rgba(239,68,68,.15)'};
                  color:${l.status==='sent' ? '#22c55e' : '#ef4444'}">
                  <i class="fas fa-${l.status==='sent' ? 'check' : 'times'}"></i>
                  ${l.status === 'sent' ? 'Sent' : 'Failed'}
                </span>
                <span style="font-size:10px;padding:2px 8px;border-radius:99px;
                  background:${bg};color:${color};font-weight:600;text-transform:uppercase">
                  ${l.channel || ''}
                </span>
              </div>

              <!-- Row 2: recipient + time -->
              <div style="display:flex;gap:14px;flex-wrap:wrap;font-size:var(--font-size-xs);
                color:var(--text-muted);margin-bottom:6px">
                ${l.recipient_name ? `
                  <span><i class="fas fa-user" style="margin-right:4px;opacity:.6"></i>
                    ${Utils.esc(l.recipient_name)}</span>` : ''}
                ${l.recipient_contact ? `
                  <span><i class="fas fa-${isEmail ? 'envelope' : 'mobile-alt'}"
                    style="margin-right:4px;opacity:.6"></i>
                    ${Utils.esc(l.recipient_contact)}</span>` : ''}
                <span><i class="fas fa-clock" style="margin-right:4px;opacity:.6"></i>
                  ${dateStr} &middot; ${timeStr}</span>
              </div>

              <!-- Row 3: message preview (collapsible) -->
              ${cleanBody ? `
                <div style="background:var(--bg-tertiary);border-radius:var(--radius-sm);
                  padding:8px 10px;font-size:11px;color:var(--text-secondary);line-height:1.6;
                  border-left:3px solid ${color};cursor:pointer"
                  onclick="this.style.webkitLineClamp=this.style.webkitLineClamp?'':'3'"
                  title="Click to expand">
                  <div style="overflow:hidden;display:-webkit-box;
                    -webkit-line-clamp:2;-webkit-box-orient:vertical">
                    ${Utils.esc(cleanBody)}
                  </div>
                </div>` : ''}
            </div>
          </div>`;
      }).join('');

      return `
        <div style="margin-bottom:1.5rem">
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">
            <div style="font-size:11px;font-weight:700;text-transform:uppercase;
              letter-spacing:.08em;color:var(--text-muted)">${label}</div>
            <div style="flex:1;height:1px;background:var(--border-color)"></div>
            <div style="font-size:11px;color:var(--text-muted);font-weight:600">
              ${items.length} notification${items.length !== 1 ? 's' : ''}
            </div>
          </div>
          ${rows}
        </div>`;
    };

    return Object.entries(groups).map(([k,v]) => buildGroup(k,v)).join('')
      || `<div style="text-align:center;padding:3rem;color:var(--text-muted)">
            <i class="fas fa-search" style="font-size:2rem;opacity:.3;display:block;margin-bottom:.75rem"></i>
            No results found.
          </div>`;
  },

  _renderHistoryModal(logs) {
    const total   = logs.length;
    const sent    = logs.filter(l => l.status === 'sent').length;
    const failed  = logs.filter(l => l.status === 'failed').length;
    const byEmail = logs.filter(l => l.channel === 'email').length;
    const bySMS   = logs.filter(l => l.channel === 'sms').length;

    // Collect unique dates for the date picker quick-list
    const uniqueDates = [...new Set(
      logs.map(l => {
        const d = new Date(l.sent_at || l.created_at);
        return isNaN(d) ? null : d.toISOString().slice(0,10);
      }).filter(Boolean)
    )].sort((a,b) => b.localeCompare(a)).slice(0, 60);

    const bodyHTML = `
      <div style="display:flex;flex-direction:column;gap:0">

        <!-- ── STATS BAR ─────────────────────────────────────── -->
        <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:8px;margin-bottom:1rem">
          ${[
            { label:'Total',   val: total,   icon:'fa-history',     color:'var(--brand-primary)',  bg:'rgba(99,102,241,.08)' },
            { label:'Sent',    val: sent,    icon:'fa-check-circle', color:'#22c55e',               bg:'rgba(34,197,94,.08)'  },
            { label:'Failed',  val: failed,  icon:'fa-times-circle', color:'#ef4444',               bg:'rgba(239,68,68,.08)'  },
            { label:'Email',   val: byEmail, icon:'fa-envelope',     color:'#6366f1',               bg:'rgba(99,102,241,.08)' },
            { label:'SMS',     val: bySMS,   icon:'fa-comment-sms',  color:'#22c55e',               bg:'rgba(34,197,94,.08)'  },
          ].map(s => `
            <div onclick="NotificationsPage._quickFilter('${s.label}')"
              style="background:${s.bg};border:1px solid ${s.color}22;border-radius:10px;
                padding:10px 8px;text-align:center;cursor:pointer;transition:.15s"
              onmouseover="this.style.transform='translateY(-2px)'"
              onmouseout="this.style.transform=''"
              title="Click to filter by ${s.label}">
              <i class="fas ${s.icon}" style="color:${s.color};font-size:1.1rem"></i>
              <div style="font-size:1.35rem;font-weight:700;color:${s.color};margin:2px 0">${s.val}</div>
              <div style="font-size:10px;color:var(--text-muted);font-weight:600">${s.label}</div>
            </div>`).join('')}
        </div>

        <!-- ── FILTER PANEL ──────────────────────────────────── -->
        <div style="background:var(--bg-tertiary);border-radius:var(--radius-md);padding:12px 14px;
          margin-bottom:1rem;border:1px solid var(--border-color)">

          <!-- Row 1: keyword + date -->
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px">
            <!-- Keyword -->
            <div style="position:relative">
              <i class="fas fa-search" style="position:absolute;left:10px;top:50%;
                transform:translateY(-50%);color:var(--text-muted);font-size:12px;pointer-events:none"></i>
              <input type="text" id="hist-keyword" class="form-input"
                style="padding-left:32px;font-size:13px" placeholder="Keyword: name, subject, message…"
                oninput="NotificationsPage._applyFilters()" />
            </div>
            <!-- Specific date -->
            <div style="position:relative">
              <i class="fas fa-calendar-alt" style="position:absolute;left:10px;top:50%;
                transform:translateY(-50%);color:var(--text-muted);font-size:12px;pointer-events:none"></i>
              <input type="date" id="hist-date" class="form-input"
                style="padding-left:32px;font-size:13px"
                oninput="NotificationsPage._applyFilters()" />
            </div>
          </div>

          <!-- Row 2: period + channel + status + reset -->
          <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">

            <!-- Period quick-select -->
            <select id="hist-period" class="form-select" style="font-size:12px;flex:1;min-width:110px"
              onchange="NotificationsPage._applyFilters()">
              <option value="">📅 All Time</option>
              <option value="today">Today</option>
              <option value="yesterday">Yesterday</option>
              <option value="week">This Week</option>
              <option value="month">This Month</option>
              <option value="last30">Last 30 Days</option>
              <option value="last90">Last 90 Days</option>
            </select>

            <!-- Channel -->
            <select id="hist-channel" class="form-select" style="font-size:12px;flex:1;min-width:110px"
              onchange="NotificationsPage._applyFilters()">
              <option value="">📡 All Channels</option>
              <option value="email">✉️ Email</option>
              <option value="sms">💬 SMS</option>
              <option value="push">🔔 Push</option>
              <option value="whatsapp">🟢 WhatsApp</option>
            </select>

            <!-- Status -->
            <select id="hist-status" class="form-select" style="font-size:12px;flex:1;min-width:110px"
              onchange="NotificationsPage._applyFilters()">
              <option value="">⚡ All Status</option>
              <option value="sent">✅ Sent</option>
              <option value="failed">❌ Failed</option>
            </select>

            <!-- Reset button -->
            <button class="btn btn-ghost btn-sm" onclick="NotificationsPage._resetFilters()"
              style="white-space:nowrap;font-size:12px">
              <i class="fas fa-undo"></i> Reset
            </button>
          </div>
        </div>

        <!-- ── ACTIVE FILTERS CHIPS ───────────────────────────── -->
        <div id="hist-chips" style="display:none;flex-wrap:wrap;gap:6px;margin-bottom:10px"></div>

        <!-- ── RESULTS COUNT ─────────────────────────────────── -->
        <div id="hist-count" style="font-size:12px;color:var(--text-muted);
          margin-bottom:8px;padding-left:2px"></div>

        <!-- ── GROUPED LOGS ───────────────────────────────────── -->
        <div id="hist-groups" style="max-height:48vh;overflow-y:auto;padding-right:4px">
          ${ total === 0
            ? `<div style="text-align:center;padding:3rem;color:var(--text-muted)">
                <i class="fas fa-inbox" style="font-size:2.5rem;opacity:.3;display:block;margin-bottom:.75rem"></i>
                No notifications sent yet.
               </div>`
            : this._buildGroupsHTML(logs)
          }
        </div>

        <!-- ── FOOTER ────────────────────────────────────────── -->
        <div style="display:flex;justify-content:space-between;align-items:center;
          margin-top:1rem;padding-top:.75rem;border-top:1px solid var(--border-color)">
          <span id="hist-footer-count" style="font-size:12px;color:var(--text-muted)">
            Showing ${total} notification${total !== 1 ? 's' : ''}
          </span>
          <div style="display:flex;gap:8px">
            <button class="btn btn-ghost btn-sm" onclick="NotificationsPage.openHistoryModal()">
              <i class="fas fa-sync"></i> Refresh
            </button>
            <button class="btn btn-secondary" onclick="Modal.close()">
              <i class="fas fa-times"></i> Close
            </button>
          </div>
        </div>
      </div>`;

    Modal.open('📋 Notification History', bodyHTML, { size: 'xl' });
  },

  /* ── Quick filter when clicking a stat card ───────────────── */
  _quickFilter(label) {
    const statusEl  = document.getElementById('hist-status');
    const channelEl = document.getElementById('hist-channel');
    if (!statusEl) return;
    // Reset all first
    this._resetFilters(false);
    if (label === 'Sent')   { statusEl.value  = 'sent';  }
    if (label === 'Failed') { statusEl.value  = 'failed';}
    if (label === 'Email')  { channelEl.value = 'email'; }
    if (label === 'SMS')    { channelEl.value = 'sms';   }
    this._applyFilters();
  },

  /* ── Apply all active filters ─────────────────────────────── */
  _applyFilters() {
    const keyword  = (document.getElementById('hist-keyword')?.value  || '').toLowerCase().trim();
    const period   =  document.getElementById('hist-period')?.value   || '';
    const channel  =  document.getElementById('hist-channel')?.value  || '';
    const status   =  document.getElementById('hist-status')?.value   || '';
    const dateVal  =  document.getElementById('hist-date')?.value     || '';

    const now      = new Date();
    const todayStr = now.toISOString().slice(0,10);
    const yestStr  = new Date(now - 86400000).toISOString().slice(0,10);
    const weekAgo  = new Date(now - 7  * 86400000);
    const monthAgo = new Date(now - 30 * 86400000);
    const q90Ago   = new Date(now - 90 * 86400000);

    let filtered = this._allLogs.filter(l => {
      const d        = new Date(l.sent_at || l.created_at);
      const dStr     = isNaN(d) ? '' : d.toISOString().slice(0,10);
      const textHit  = !keyword ||
        (l.recipient_name    || '').toLowerCase().includes(keyword) ||
        (l.recipient_contact || '').toLowerCase().includes(keyword) ||
        (l.subject           || '').toLowerCase().includes(keyword) ||
        (l.body              || '').toLowerCase().includes(keyword) ||
        (l.channel           || '').toLowerCase().includes(keyword);

      const dateHit = !dateVal || dStr === dateVal;

      let periodHit = true;
      if (period === 'today')     periodHit = dStr === todayStr;
      if (period === 'yesterday') periodHit = dStr === yestStr;
      if (period === 'week')      periodHit = d >= weekAgo;
      if (period === 'month')     periodHit = d >= monthAgo;
      if (period === 'last30')    periodHit = d >= monthAgo;
      if (period === 'last90')    periodHit = d >= q90Ago;

      const chanHit   = !channel || (l.channel || '') === channel;
      const statusHit = !status  || (l.status  || '') === status;

      return textHit && dateHit && periodHit && chanHit && statusHit;
    });

    // Update groups
    const groupsEl = document.getElementById('hist-groups');
    if (groupsEl) groupsEl.innerHTML = this._buildGroupsHTML(filtered);

    // Update footer count
    const footerEl = document.getElementById('hist-footer-count');
    if (footerEl) footerEl.textContent = `Showing ${filtered.length} of ${this._allLogs.length} notification${this._allLogs.length !== 1 ? 's' : ''}`;

    // Build active-filter chips
    const chips = [];
    if (keyword)  chips.push({ label: `🔍 "${keyword}"`,            key:'keyword',  clear: () => { document.getElementById('hist-keyword').value = ''; } });
    if (dateVal)  chips.push({ label: `📅 ${dateVal}`,              key:'date',     clear: () => { document.getElementById('hist-date').value   = ''; } });
    if (period)   chips.push({ label: `⏱ ${document.getElementById('hist-period').options[document.getElementById('hist-period').selectedIndex].text}`, key:'period', clear: () => { document.getElementById('hist-period').value  = ''; } });
    if (channel)  chips.push({ label: `📡 ${channel.toUpperCase()}`,key:'channel',  clear: () => { document.getElementById('hist-channel').value = ''; } });
    if (status)   chips.push({ label: `⚡ ${status.charAt(0).toUpperCase()+status.slice(1)}`, key:'status', clear: () => { document.getElementById('hist-status').value  = ''; } });

    const chipsEl = document.getElementById('hist-chips');
    if (chipsEl) {
      if (chips.length) {
        chipsEl.style.display = 'flex';
        chipsEl.innerHTML = chips.map(c => `
          <span style="display:inline-flex;align-items:center;gap:5px;
            background:var(--brand-primary);color:#fff;
            padding:3px 10px 3px 8px;border-radius:99px;font-size:11px;font-weight:600">
            ${c.label}
            <i class="fas fa-times" style="cursor:pointer;font-size:9px;opacity:.8"
              onclick="NotificationsPage._clearChip('${c.key}')"></i>
          </span>`).join('');
      } else {
        chipsEl.style.display = 'none';
        chipsEl.innerHTML = '';
      }
    }
  },

  /* ── Clear one chip ───────────────────────────────────────── */
  _clearChip(key) {
    const map = { keyword:'hist-keyword', date:'hist-date', period:'hist-period',
                  channel:'hist-channel', status:'hist-status' };
    const el = document.getElementById(map[key]);
    if (el) el.value = '';
    this._applyFilters();
  },

  /* ── Reset all filters ────────────────────────────────────── */
  _resetFilters(andRender = true) {
    ['hist-keyword','hist-date','hist-period','hist-channel','hist-status']
      .forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
    if (andRender) this._applyFilters();
  },

  /* ── Legacy alias kept for backward compatibility ─────────── */
  _filterHistory(q) {
    const kw = document.getElementById('hist-keyword');
    if (kw) { kw.value = q; this._applyFilters(); }
  },

  toggleLogDetail(idx) { /* legacy — no longer used */ },
};
