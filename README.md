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
- **Student Enrollment Panel** (updated):
  - Click **Manage Students** on any level to open/close the enrollment panel
  - See all enrolled students with their status and enrollment date
  - **Enroll new students** via a searchable modal — only shows active, not-yet-enrolled students
  - **Start Date** (mandatory, defaults to today) set on enrollment
  - **End Date** (optional) — marks when the student completed this level
  - **Notes** field — inline editable per enrollment
  - **Assessment button** — navigates directly to Student Progress for that student
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
- **5-domain assessment table**: Technical Skills / Logical & Computational Thinking / Creativity & Design / Understanding & Communication / Collaboration & Independence
- **4 proficiency levels** per domain: Emerging / Developing / Proficient / Advanced (radio buttons)
- **Per-domain Instructor Comment** text field
- **Class + Level required fields** on every save (auto-populated from student's active enrollment)
- Session-based history: each save creates a new snapshot — click any session to view it in read-only mode
- **Delete session** with inline confirm bar (trash button per session card)
- Level badges in session history cards (avg level across all domains)
- **New DB storage model** ✅: each save INSERTs one row per domain per session, using `(student_id, skill_key, assessed_at)` as the unique key. The `notes` column is a flat JSON object `{level, comment, course_id, course_name, level_id, level_name}`. This allows the third-party app to correctly group sessions by `assessed_at`.
- Backward-compatible with legacy data (old `notes` JSON-array format auto-detected and rendered correctly)

### Class Report ⭐ NEW
- Accessible via **Class Report** in the sidebar navigation
- **Student repartition per course → level** in a structured, printable table
- Columns per student: Name, Status, Start Date, End Date, Attendance Count, Assessment Link, Notes
- **Attendance count** is scoped to the enrollment period: `start_date` → `end_date` (or today if no end date) — counts `present` + `late` records only
- **Assessment link button** — click to navigate directly to Student Progress for that student
- Students sorted: active first, then alphabetically
- **Course-level grouping** with summary counts (active, completed, total enrolled)
- **Global summary footer** with totals across all courses/levels
- **Filter by course** and/or **filter by level** with instant re-render
- **Print / Save PDF** button — triggers `window.print()` with dedicated `@media print` CSS (A4 landscape, hides UI chrome, forces table borders)

### Settings
- Center branding (name, logo, color)
- Role management with permissions matrix
- Security settings (2FA toggle, session timeout, password policy)
- Supabase configuration change

---

## 🗃️ Required SQL Migrations — Run in Supabase

### M15 — `trainers.is_published` column ⚠️ RUN IN SUPABASE

```sql
ALTER TABLE trainers
  ADD COLUMN IF NOT EXISTS is_published BOOLEAN NOT NULL DEFAULT false;
```

### M16 — `enrollments` date & notes columns ⚠️ RUN IN SUPABASE

```sql
ALTER TABLE enrollments ADD COLUMN IF NOT EXISTS start_date DATE;
ALTER TABLE enrollments ADD COLUMN IF NOT EXISTS end_date   DATE;
ALTER TABLE enrollments ADD COLUMN IF NOT EXISTS notes      TEXT;
```

### M13 — `enrollments.level_progress` column ⚠️ PENDING (run once)

```sql
ALTER TABLE enrollments
  ADD COLUMN IF NOT EXISTS level_progress INT DEFAULT 0
  CHECK (level_progress BETWEEN 0 AND 100);
```

### Trainer sessions table (run once if not already done)

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
  class_report.js       Class Report module ⭐ NEW
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

## 🔔 Push Notifications — How it works end-to-end

Push notifications are delivered by writing rows to `parent_notifications` in Supabase.  
The parent's third-party app reads this table (filtered by `auth.uid()`).

### The critical invariant
```
parent_notifications.parent_user_id  =  auth.users.id  =  public.users.auth_id
```
If `public.users.auth_id` is NULL or wrong, the parent never sees the push — **silently**.

### How `auth_id` is set — automatically (no manual SQL needed)

| When | What happens |
|---|---|
| **New parent created** in admin portal (Users → Add) | `signUp()` called → `auth_id` returned → saved to `public.users.auth_id` immediately |
| **Parent already has Supabase Auth account** (email already registered) | Admin API `listUsers()` used to resolve the real UUID → saved to `public.users.auth_id` |
| **Parent email changed** | Old auth account deleted, new one created via Admin API, `auth_id` updated |

All 3 cases are handled automatically in `saveUser()` → `_createParentAuthAccount()`.

### What happens if `auth_id` is still NULL (legacy parents)

Fix options in order of preference:
1. **Admin portal → Users → edit the parent → Save** — triggers auto-resolution
2. **`fix_parent_auth.html`** — bulk diagnostic & repair tool
3. **SQL** (last resort):
```sql
UPDATE public.users
SET auth_id = (SELECT id FROM auth.users WHERE email = public.users.email LIMIT 1)
WHERE user_type = 'parent'
  AND auth_id IS NULL
  AND email IS NOT NULL;
```

### Push safety rules in the codebase

| Location | Rule |
|---|---|
| `notifications.js` — broadcast push | Uses **only** `users.auth_id`. Never falls back to `users.id` (different UUID, causes unreadable rows) |
| `notifications.js` — `triggerRule()` target=parent | Looks up `parent.auth_id` via `parent_id` FK. If parent not found → skips entirely (no wrong-recipient fallback) |
| `notifications.js` — `triggerRule()` target=parent | If `parentContact` is null → `contacts = []` → no channels fire (safe skip, logged) |
| `users.js` — `_createParentAuthAccount()` | On `alreadyExists` → resolves UUID via Admin API, saves to DB immediately |

### Diagnostic tool
**`test_notifications.html`** — 5-step push diagnostic:
1. Verify `auth_id` present in `public.users`
2. Inspect `parent_notifications` schema (all columns)
3. Test INSERT with full error surfacing
4. Read back to confirm the row was written
5. Compare with Supabase Auth Admin API (UUID match check)

### Files
```
test_notifications.html    Full notification diagnostic + send test tool (v5)
fix_parent_auth.html       Bulk auth_id repair tool for existing parents
```

---

## 👨‍👩‍👧 Parent Portal

The parent-facing app is a **third-party application** (not `parent_portal.html`).  
It reads `parent_notifications` filtered by `auth.uid()` to display push notifications.  
`parent_portal.html` in this repo is a legacy stub and is not in active use.

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

## 📦 M17 Migration — `level_completions` Table

**Must be run once in Supabase → SQL Editor before using the "Done" button:**

```sql
CREATE TABLE IF NOT EXISTS level_completions (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id      UUID NOT NULL REFERENCES users(id)   ON DELETE CASCADE,
  level_id        UUID NOT NULL REFERENCES levels(id)  ON DELETE CASCADE,
  course_id       UUID REFERENCES courses(id)          ON DELETE SET NULL,
  enrollment_id   UUID,  -- soft-link, no FK — survives enrollment deletion
  start_date      DATE,
  end_date        DATE,
  attendance_count INT DEFAULT 0,
  schedule_slot   TEXT,
  notes           TEXT,
  completed_at    TIMESTAMPTZ DEFAULT NOW(),
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE level_completions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can do everything" ON level_completions
  FOR ALL USING (auth.role() = 'authenticated');
CREATE INDEX IF NOT EXISTS idx_level_completions_student ON level_completions(student_id);
CREATE INDEX IF NOT EXISTS idx_level_completions_level   ON level_completions(level_id);
CREATE INDEX IF NOT EXISTS idx_level_completions_course  ON level_completions(course_id);
```

**Design rationale:**  
`UNIQUE(student_id, level_id)` on `enrollments` means only one row per student per level.
If a student is removed from a level and later re-enrolled, their previous history would be lost.  
`level_completions` solves this by being an **immutable archive** — no FK to `enrollments`,
so history always survives, even after multiple re-enrollment cycles.

### Completion Flow (v20260604c)

| Step | What happens |
|---|---|
| Admin clicks **Done** on a student row | `markCompleted()` modal opens with attendance count pre-filled |
| Admin confirms | `_confirmMarkCompleted()` writes a snapshot to `level_completions` |
| Enrollment row is deleted | Student can be freely re-enrolled in the same level |
| **Completed tab** (per level) | Reads from `level_completions` for that level |
| **Completed Students page** | Reads all `level_completions` across all levels/courses |
| **Revert to Active** | Deletes the `level_completions` row + re-enrolls as active |

---

## 🔜 Potential Next Steps

- [x] Parent-facing portal — ✅ Done (`parent_portal.html`)
- [x] Separate completion archive (`level_completions` M17) — ✅ Done
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
