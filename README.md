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

### Trainers
- Trainer CRUD (name, email, phone, session fee)
- Level assignment: multi-select which levels a trainer teaches
- Performance overview

### Events
- Event CRUD (title, dates, times, location, capacity, theme color)
- Registration management
- Status workflow: upcoming → active → completed / cancelled

### Financials ⭐ Updated
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

## 🔜 Potential Next Steps

- [ ] Parent-facing portal (separate login, read-only view of their child's attendance & progress)
- [ ] Automated email triggers (absence alerts, expiry reminders via Supabase Edge Functions)
- [ ] Bulk student import from CSV
- [ ] Stripe payment integration for online package purchases
- [ ] WhatsApp Business API integration for notifications
- [ ] Mobile app (React Native / Flutter) using the same Supabase backend
- [ ] Multi-branch support (branch_id on all tables)
