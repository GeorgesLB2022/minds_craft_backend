# Minds' Craft — Admin Portal

> Production-ready admin web application for Minds' Craft robotics & STEM center.  
> Built with vanilla HTML/CSS/JS + Supabase as the backend.

---

## 🚀 Live App

| Environment | URL |
|---|---|
| Preview | `https://www.genspark.ai/api/code_sandbox_light/preview/b20c97e3-8264-4412-9450-b15a7c9aa54d/` |
| Supabase Project | `https://xiatsareoruybucwkpkc.supabase.co` |
| Supabase Dashboard | `https://supabase.com/dashboard/project/xiatsareoruybucwkpkc` |

---

## ✅ First-Time Setup (4 steps)

### 1. Create your Supabase project (already done)
Your project is at `https://xiatsareoruybucwkpkc.supabase.co`.

### 2. Run the database schema
Open [SQL Editor](https://supabase.com/dashboard/project/xiatsareoruybucwkpkc/sql/new),
paste the contents of **`supabase/schema.sql`** and click **Run**.

> If you already ran the schema before, run only the **MIGRATION** section at the bottom of `schema.sql` — it is safe to run multiple times (idempotent).

### 3. Create your admin user
In Supabase → Authentication → Users:
- Click **Invite user** → enter `minds.craft.lb@gmail.com`  
- **Or** use the SQL Editor to set a password directly:
```sql
UPDATE auth.users 
SET encrypted_password = crypt('YourPassword123!', gen_salt('bf'))
WHERE email = 'minds.craft.lb@gmail.com';
```

### 4. Connect and log in
Open the app URL. On first visit you will see the **Connect to Supabase** screen:
- **Supabase Project URL:** `https://xiatsareoruybucwkpkc.supabase.co`
- **Anon Key:** (from Supabase → Settings → API → `anon public`)

Click **Connect Database** — credentials are saved permanently; you will **never be asked again**.

---

## 🔐 Credentials Persistence

Credentials are stored in **3 layers** and checked in this priority order:

| Priority | Location | Notes |
|---|---|---|
| 1 | `js/config.js` — `SUPABASE_URL` / `SUPABASE_ANON_KEY` constants | Hardcode here to make fully permanent |
| 2 | `localStorage` (keys: `mc_supabase_url`, `mc_supabase_key`) | Persists across browser restarts |
| 3 | `sessionStorage` (same keys) | Fallback for private/incognito tabs |

**To make credentials 100% permanent** (never ask anyone ever):
Open `js/config.js` and fill in:
```js
const SUPABASE_URL      = 'https://xiatsareoruybucwkpkc.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIs...';  // your anon key
```

---

## 🗄️ Database Schema (18 tables)

| Table | Purpose |
|---|---|
| `users` | Parents, students, staff, admins |
| `courses` | Course definitions |
| `levels` | Curriculum levels per course (schedule, trainer, capacity) |
| `enrollments` | **Student ↔ Level linking** — drives attendance lists |
| `attendance` | Daily attendance per student per level |
| `trainers` | Trainer profiles |
| `trainer_assignments` | Trainer ↔ Level mapping |
| `trainer_sessions` | Trainer attendance log per session (date, level, attended, cost) |
| `events` | Center events & competitions |
| `event_registrations` | User registrations for events |
| `packages` | Subscription packages |
| `student_allocations` | Package assigned to a student |
| `transactions` | Income and expense records |
| `notification_rules` | Automated notification templates |
| `notification_logs` | Sent notification history |
| `assessments` | Student skill assessments |
| `roles` | Admin role definitions with permissions |
| `settings` | Center-wide settings (branding, security) |
| `admin_users` | Admin account profiles (linked to Supabase Auth) |

All tables have **Row Level Security (RLS)** — only authenticated users can read/write.

---

## 📋 Modules & Features

### Dashboard
- KPI cards: total students, active students, active courses, upcoming events
- Revenue chart (monthly income/expense)
- Enrollment donut chart
- Recent activity feed
- Upcoming events list

### Users (Parents & Students)
- Separate tabs: Parents / Students / Staff
- Full CRUD with form validation
- Parent–Student relationship linking
- Subscription tier tracking (Basic / Premium / Trial)
- Bulk status management

### Courses & Curriculum ⭐ Updated
- Course CRUD with image, age range, status
- **Level management inside each course:**
  - Schedule (day, start/end time, duration)
  - Trainer assignment
  - Age range, capacity, acquisitions, prerequisites
- **Student Enrollment Panel** (new):
  - Click **Manage Students** on any level to open/close the enrollment panel
  - See all enrolled students with their status and enrollment date
  - **Enroll new students** via a searchable modal — only shows active, not-yet-enrolled students
  - **Change enrollment status** (active / inactive / completed / dropped) inline
  - **Remove students** from a level (attendance history is preserved)

### Attendance ⭐ Updated
- **Daily view:** Select course → level (shows day + time) → date → mark present/late/absent
  - Course dropdown filters to only courses that have a level scheduled on the selected weekday
  - Student list is pulled from `enrollments` table — only enrolled students appear
  - Clicking Present/Late/Absent **auto-saves instantly** (no Submit button needed)
  - Check-in time auto-fills on mark; notes debounce-save after 0.8 s
  - Per-row save indicator: 🔄 saving → ✅ saved → ⚠️ retry
  - Student name search filter
  - Empty state links directly to Courses → Manage Students if no one is enrolled
- **Period view:** Aggregate attendance stats per student across a date range
  - **Student name search filter** to narrow the result table
  - Auto-loads the current month's data when switching to Period tab
  - Summary stats (present/late/absent) and attendance % bar per student
- CSV export

### Trainers ⭐ Updated
- Trainer CRUD (name, email, phone, session fee)
- Level assignment: multi-select which levels a trainer teaches
- **Attendance logging** (new): click **Attendance** on any trainer card to open the session log modal:
  - Log sessions with date, level, attendance status, session count, optional fee override and notes
  - Running totals: sessions attended, total cost, default fee
  - Delete individual session entries
- **Cost Forecast chart** (new): click **Cost Forecast** button in page header to open an XL modal with:
  - Stacked bar chart: 6 past months (actual logged cost) + 6 future months (projected from avg sessions/month)
  - Per-trainer color coding with legend
  - Summary cards showing total paid per trainer

### Events
- Event CRUD (title, dates, times, location, capacity, theme color)
- Registration management
- Status workflow: upcoming → active → completed / cancelled

### Financials ⭐ Updated
- **Analytics tab** (new): two intelligent analysis charts:
  - **Income Forecast** (12-month projection): projects expected monthly income from active package renewals + ongoing subscriptions; bar colored green (above target) / red (below target); purple line = actual recorded income; red dashed line = configurable threshold (default $900, editable inline)
  - **Monthly Expenses** (last 12 months): bar chart with red highlighting for spike months; top-5 expense categories shown as chips below the chart
- Transaction log (income & expense) with category, payment method, description, status
- Package management (duration, base price, discount)
- **Student package allocations:**
  - Create and **edit** allocations (edit button on each row)
  - End date auto-calculated from enrollment date + package duration (e.g., 25-Mar + 1 month = 25-Apr)
  - **Discount-first flow:** enter discount → price updates automatically before confirming
  - Live price preview box showing base price, discount amount, and final price
  - **Auto-transaction:** allocating a package with a price automatically creates a `Subscription` income transaction — so the Overview KPIs update immediately
- **Overview KPI cards (5 cards):**
  - Total Balance (all-time net from transactions)
  - Monthly Income (transactions this month)
  - Monthly Expenses (transactions this month)
  - **Active Subscriptions** (count of active allocations + total paid)
  - Monthly Net Profit
- KPIs auto-update on every tab switch and after every mutation
- Revenue chart (last 6 months), due packages alert, recent transactions with description column

### Notifications ⭐ Updated
- Rule-based notification templates (trigger event → channels → template)
- Channels: Email, SMS, WhatsApp, Push
- Template variables: `{fname}`, `{amount}`, `{package}`, `{expiry_date}`, etc.
- **Send Broadcast:** to audience groups (All / Parents / Students / Staff) OR a specific email+phone
- **Send Test:** real SMS via GlobeSMS API; real email via **EmailJS** (Gmail SMTP + App Password, no OAuth)
- **Email:** sends FROM `minds.craft.lb@gmail.com` TO any recipient — no setup needed, credentials are hard-coded
- Subscription expiry reminder: fires 2 days before `end_date`, sent once per allocation
- **Notification History:** channel icon, recipient name/contact, date, status badge, expandable message body; searchable; loads last 200 entries

### Email Setup — Already Configured ✅
Email uses **EmailJS** with Gmail SMTP via an App Password (no OAuth, no domain required).

- Service ID: `service_e7ux8c5`
- Template ID: `template_szeu3me`
- Public Key: hard-coded in `js/pages/notifications.js`
- Sends **from** `minds.craft.lb@gmail.com` **to** any recipient
- No configuration needed — works out of the box

### Student Progress
- Per-student skill assessment grid (5-point scale)
- Skill categories: Core Robotics, Programming, Creativity, Soft Skills
- Progress radar chart
- Level progression tracking

### Settings
- Center branding (name, logo, color)
- Role management with permissions matrix
- Security settings (2FA toggle, session timeout, password policy)
- Supabase configuration change

---

## 🗃️ Required SQL Migration — Run in Supabase

Run this once in **Supabase → SQL Editor** to create the `trainer_sessions` table:

```sql
-- Trainer Sessions table (attendance log per trainer per level)
CREATE TABLE IF NOT EXISTS trainer_sessions (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  trainer_id    UUID NOT NULL REFERENCES trainers(id) ON DELETE CASCADE,
  level_id      UUID NOT NULL REFERENCES levels(id) ON DELETE CASCADE,
  session_date  DATE NOT NULL DEFAULT CURRENT_DATE,
  attended      BOOLEAN NOT NULL DEFAULT true,
  sessions_count INT NOT NULL DEFAULT 1,
  fee_override  NUMERIC(10,2) DEFAULT NULL,
  notes         TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE trainer_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can do everything" ON trainer_sessions
  FOR ALL USING (auth.role() = 'authenticated');
```

---

## 🔧 Supabase Auth — URL Configuration

Set these in **Supabase → Authentication → URL Configuration**:

| Setting | Value |
|---|---|
| Site URL | `https://www.genspark.ai/api/code_sandbox_light/preview/b20c97e3-8264-4412-9450-b15a7c9aa54d/` |
| Redirect URLs | `https://www.genspark.ai/**` |

This is required for magic-link and password-reset emails to redirect correctly.

---

## 📁 File Structure

```
index.html              Main app shell
README.md               This file

assets/
  logo.svg              Minds' Craft logo
  favicon.svg           Browser tab icon

css/
  variables.css         Design tokens (colors, spacing, radius)
  base.css              Reset & base typography
  layout.css            Sidebar, topbar, main layout
  components.css        Cards, tables, buttons, badges, modals
  modules.css           Page-specific module styles

js/
  config.js             Supabase credentials config (hardcode here!)
  db.js                 Database layer — all Supabase queries
  utils.js              Utilities, Toast, Modal helpers
  modal.js              Modal component
  app.js                Main app controller, auth, routing

js/pages/
  dashboard.js          Dashboard module
  users.js              Parents & Students module
  courses.js            Courses, Levels & Student Enrollment module ⭐
  attendance.js         Attendance tracker module
  trainers.js           Trainers module
  events.js             Events module
  financials.js         Financials module
  notifications.js      Notifications module
  progress.js           Student Progress module
  settings.js           Settings module

supabase/
  schema.sql            Full DB schema + RLS + sample data + migration
```

---

## 🗺️ How Enrollment Drives Attendance

```
Users (students) 
       │
       ▼  enrolled via Courses → Manage Curriculum → Manage Students
Enrollments table  ──► level_id + student_id + status
       │
       ▼  queried by Attendance module on level select
Attendance sheet   ──► only enrolled students appear
       │
       ▼  saved per date
Attendance table   ──► student_id + level_id + date + status
```

**Workflow:**
1. Create a course → add levels (with schedule)
2. In each level, click **Manage Students** → enroll students
3. Go to **Attendance** → select course → level → date → mark attendance
4. Only students enrolled in that level appear on the sheet

---

## 👨‍👩‍👧 Parent Portal

A separate read-only web app for parents: `parent_portal.html`

### How authentication works
Parents log in with:
- **Email** = their email address in `public.users`
- **Password** = their phone number (e.g. `+96170178043`)

The portal needs a **Supabase Auth account** (in `auth.users`) for each parent — separate from the `public.users` row.

### Auto-registration on first login
`parent_portal.html` now auto-creates the Supabase Auth account on first login:
1. Parent enters email + phone number
2. If Supabase Auth account doesn't exist → `signUp()` is called automatically
3. On next visit (or after admin confirms the email) → normal `signIn()` succeeds

### Admin tool: create_auth.html
Open `create_auth.html` to manage parent Auth accounts:

| Method | How | When to use |
|---|---|---|
| **A — Auto** (recommended) | `signUp()` via anon key, then confirm SQL | Quickest, no service key needed |
| **B — SQL** | Direct `INSERT` into `auth.users` | When email confirmation is disabled in Supabase |

After running Method A, run the **Confirm SQL** in Supabase SQL Editor:
```sql
UPDATE auth.users
SET email_confirmed_at = COALESCE(email_confirmed_at, NOW()),
    updated_at = NOW()
WHERE email IN ('isystemslb@gmail.com', 'ritanesbay@gmail.com' /*, ... */);
```

### Files
```
parent_portal.html       Parent-facing portal (login + children/attendance/packages)
js/parent_portal.js      Portal logic
create_auth.html         Admin tool to create/confirm parent Auth accounts
```

---

## 🔧 RLS Fix — If Queries Return 0 Rows

If users, students, or other data doesn't load, run in Supabase SQL Editor:

```sql
-- Drop all policies on users and recreate cleanly (fixes infinite-recursion bug)
DROP POLICY IF EXISTS "Authenticated users can do everything" ON public.users;
DROP POLICY IF EXISTS "authenticated_full_access" ON public.users;

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated_full_access" ON public.users
  FOR ALL USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);
```

---

## 🔜 Potential Next Steps

- [x] Parent-facing portal — ✅ Done (`parent_portal.html`)
- [ ] Fix financial-package logic: multi-month packages recorded as lump-sum at renewal dates
- [ ] Allocation edits create new DB rows to preserve full history
- [ ] Student-level transaction/allocation log visible in Student Allocations Tab for a specific period
- [ ] Student name search filter in the Due Packages view
- [ ] Automated email triggers (absence alerts, expiry reminders via Supabase Edge Functions)
- [ ] Bulk student import from CSV
- [ ] Stripe payment integration for online package purchases
- [ ] WhatsApp Business API integration for notifications
- [ ] Mobile app (React Native / Flutter) using the same Supabase backend
- [ ] Multi-branch support (branch_id on all tables)
