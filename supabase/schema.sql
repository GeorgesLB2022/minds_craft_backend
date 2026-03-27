-- ============================================================
-- MINDS' CRAFT — SUPABASE DATABASE SCHEMA
-- ============================================================
-- Run this entire script in Supabase SQL Editor
-- Dashboard → SQL Editor → New Query → Paste → Run
-- ============================================================

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- USERS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  full_name     TEXT NOT NULL,
  email         TEXT,
  phone         TEXT,
  user_type     TEXT NOT NULL CHECK (user_type IN ('parent','student','staff','admin')),
  status        TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive','suspended')),
  subscription  TEXT DEFAULT 'basic' CHECK (subscription IN ('basic','premium','trial')),
  birthday      DATE,
  parent_id     UUID REFERENCES users(id) ON DELETE SET NULL,
  notes         TEXT,
  app_password  TEXT,
  avatar_color  TEXT DEFAULT '#22c55e',
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- COURSES TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS courses (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        TEXT NOT NULL,
  description TEXT,
  image_url   TEXT,
  min_age     INT DEFAULT 4,
  max_age     INT DEFAULT 18,
  status      TEXT DEFAULT 'active' CHECK (status IN ('active','inactive','draft')),
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- TRAINERS TABLE (must be created before levels)
-- ============================================================
CREATE TABLE IF NOT EXISTS trainers (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  full_name    TEXT NOT NULL,
  email        TEXT,
  phone        TEXT,
  fee_session  NUMERIC(10,2) DEFAULT 0,
  status       TEXT DEFAULT 'active' CHECK (status IN ('active','inactive')),
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- LEVELS TABLE (Course Curriculum)
-- ============================================================
CREATE TABLE IF NOT EXISTS levels (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  course_id      UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  name           TEXT NOT NULL,
  description    TEXT,
  order_num      INT DEFAULT 1,
  min_age        INT DEFAULT 4,
  max_age        INT DEFAULT 18,
  day_of_week    TEXT,
  start_time     TIME,
  end_time       TIME,
  duration_mins  INT DEFAULT 60,
  acquisitions   TEXT[],
  prerequisites  TEXT[],
  trainer_id     UUID REFERENCES trainers(id) ON DELETE SET NULL,
  capacity       INT DEFAULT 15,
  status         TEXT DEFAULT 'active' CHECK (status IN ('active','inactive')),
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- TRAINER ASSIGNMENTS
-- ============================================================
CREATE TABLE IF NOT EXISTS trainer_assignments (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  trainer_id  UUID NOT NULL REFERENCES trainers(id) ON DELETE CASCADE,
  level_id    UUID NOT NULL REFERENCES levels(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (trainer_id, level_id)
);

-- ============================================================
-- ENROLLMENTS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS enrollments (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  level_id     UUID NOT NULL REFERENCES levels(id) ON DELETE CASCADE,
  enrolled_at  DATE DEFAULT CURRENT_DATE,
  status       TEXT DEFAULT 'active' CHECK (status IN ('active','inactive','completed','dropped')),
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (student_id, level_id)
);

-- ============================================================
-- ATTENDANCE TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS attendance (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  level_id      UUID NOT NULL REFERENCES levels(id) ON DELETE CASCADE,
  date          DATE NOT NULL DEFAULT CURRENT_DATE,
  status        TEXT NOT NULL CHECK (status IN ('present','late','absent')),
  checkin_time  TIME,
  notes         TEXT,
  recorded_by   UUID REFERENCES users(id),
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (student_id, level_id, date)
);

-- ============================================================
-- EVENTS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS events (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title        TEXT NOT NULL,
  description  TEXT,
  start_date   DATE,
  end_date     DATE,
  start_time   TIME,
  end_time     TIME,
  location     TEXT,
  capacity     INT DEFAULT 50,
  status       TEXT DEFAULT 'upcoming' CHECK (status IN ('upcoming','active','completed','cancelled')),
  theme_color  TEXT DEFAULT '#22c55e',
  image_key    TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- EVENT REGISTRATIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS event_registrations (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id    UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  registered_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (event_id, user_id)
);

-- ============================================================
-- PACKAGES TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS packages (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name             TEXT NOT NULL,
  duration_months  INT DEFAULT 1,
  base_price       NUMERIC(10,2) NOT NULL DEFAULT 0,
  default_discount NUMERIC(5,2) DEFAULT 0,
  description      TEXT,
  status           TEXT DEFAULT 'active' CHECK (status IN ('active','inactive')),
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- STUDENT ALLOCATIONS (Package assignments)
-- ============================================================
CREATE TABLE IF NOT EXISTS student_allocations (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  package_id    UUID NOT NULL REFERENCES packages(id) ON DELETE RESTRICT,
  start_date    DATE NOT NULL,
  end_date      DATE NOT NULL,
  price_paid    NUMERIC(10,2),
  discount_pct  NUMERIC(5,2) DEFAULT 0,
  status        TEXT DEFAULT 'active' CHECK (status IN ('active','expired','cancelled')),
  notes         TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- TRANSACTIONS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS transactions (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  type        TEXT NOT NULL CHECK (type IN ('income','expense')),
  amount      NUMERIC(10,2) NOT NULL,
  category    TEXT,
  description TEXT,
  user_entity TEXT,
  user_id     UUID REFERENCES users(id) ON DELETE SET NULL,
  date        DATE DEFAULT CURRENT_DATE,
  method      TEXT DEFAULT 'cash' CHECK (method IN ('cash','card','transfer','other')),
  status      TEXT DEFAULT 'completed' CHECK (status IN ('completed','pending','cancelled')),
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- NOTIFICATION RULES
-- ============================================================
CREATE TABLE IF NOT EXISTS notification_rules (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title             TEXT NOT NULL,
  trigger_event     TEXT NOT NULL,
  channels          TEXT[] DEFAULT '{"email"}',
  email_template    TEXT,
  sms_template      TEXT,
  push_template     TEXT,
  is_active         BOOLEAN DEFAULT true,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- NOTIFICATION LOGS
-- ============================================================
CREATE TABLE IF NOT EXISTS notification_logs (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  rule_id           UUID REFERENCES notification_rules(id) ON DELETE SET NULL,
  recipient_id      UUID REFERENCES users(id) ON DELETE SET NULL,
  recipient_name    TEXT,          -- display name (filled even if no DB user)
  recipient_contact TEXT,          -- email or phone used for delivery
  channel           TEXT,
  subject           TEXT,
  body              TEXT,
  status            TEXT DEFAULT 'sent' CHECK (status IN ('sent','failed','pending')),
  sent_at           TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- ASSESSMENTS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS assessments (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  skill_key    TEXT NOT NULL,
  skill_label  TEXT,
  category     TEXT,
  score        INT DEFAULT 0 CHECK (score BETWEEN 0 AND 5),
  assessed_at  TIMESTAMPTZ DEFAULT NOW(),
  assessed_by  UUID REFERENCES users(id),
  notes        TEXT,
  UNIQUE (student_id, skill_key)
);

-- ============================================================
-- ROLES TABLE (Admin permissions)
-- ============================================================
CREATE TABLE IF NOT EXISTS roles (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        TEXT NOT NULL UNIQUE,
  permissions JSONB DEFAULT '{}',
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- SETTINGS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS settings (
  id               INT PRIMARY KEY DEFAULT 1,
  center_name      TEXT DEFAULT 'Minds'' Craft',
  language         TEXT DEFAULT 'en',
  currency         TEXT DEFAULT 'USD',
  timezone         TEXT DEFAULT 'Asia/Beirut',
  date_format      TEXT DEFAULT 'DD/MM/YYYY',
  brand_color      TEXT DEFAULT '#22c55e',
  logo_url         TEXT,
  two_fa_enabled   BOOLEAN DEFAULT false,
  session_timeout  INT DEFAULT 60,
  pw_min_chars     INT DEFAULT 8,
  pw_special       BOOLEAN DEFAULT true,
  ip_whitelist     TEXT,
  login_notif      BOOLEAN DEFAULT true,
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default settings row
INSERT INTO settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- ADMIN USERS TABLE (for app authentication)
-- ============================================================
CREATE TABLE IF NOT EXISTS admin_users (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  auth_id      UUID UNIQUE,  -- links to Supabase auth.users
  full_name    TEXT NOT NULL,
  email        TEXT NOT NULL UNIQUE,
  role         TEXT DEFAULT 'manager' CHECK (role IN ('super_admin','manager','instructor','accountant')),
  is_active    BOOLEAN DEFAULT true,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- INDEXES for performance
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_users_type ON users(user_type);
CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);
CREATE INDEX IF NOT EXISTS idx_users_parent ON users(parent_id);
CREATE INDEX IF NOT EXISTS idx_enrollments_student ON enrollments(student_id);
CREATE INDEX IF NOT EXISTS idx_enrollments_level ON enrollments(level_id);
CREATE INDEX IF NOT EXISTS idx_attendance_date ON attendance(date);
CREATE INDEX IF NOT EXISTS idx_attendance_student ON attendance(student_id);
CREATE INDEX IF NOT EXISTS idx_attendance_level ON attendance(level_id);
CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date);
CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions(type);
CREATE INDEX IF NOT EXISTS idx_levels_course ON levels(course_id);
CREATE INDEX IF NOT EXISTS idx_assessments_student ON assessments(student_id);
CREATE INDEX IF NOT EXISTS idx_allocations_student ON student_allocations(student_id);
CREATE INDEX IF NOT EXISTS idx_allocations_end ON student_allocations(end_date);

-- ============================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================
-- Enable RLS on all tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE levels ENABLE ROW LEVEL SECURITY;
ALTER TABLE trainers ENABLE ROW LEVEL SECURITY;
ALTER TABLE trainer_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_registrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE assessments ENABLE ROW LEVEL SECURITY;
ALTER TABLE roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_users ENABLE ROW LEVEL SECURITY;

-- Policy: Only authenticated users can access all tables
CREATE POLICY "Authenticated users can do everything" ON users
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can do everything" ON courses
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can do everything" ON levels
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can do everything" ON trainers
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can do everything" ON trainer_assignments
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can do everything" ON enrollments
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can do everything" ON attendance
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can do everything" ON events
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can do everything" ON event_registrations
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can do everything" ON packages
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can do everything" ON student_allocations
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can do everything" ON transactions
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can do everything" ON notification_rules
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can do everything" ON notification_logs
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can do everything" ON assessments
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can do everything" ON roles
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can do everything" ON settings
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can do everything" ON admin_users
  FOR ALL USING (auth.role() = 'authenticated');

-- ============================================================
-- AUTO-UPDATE updated_at TRIGGER
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['users','courses','levels','trainers','events','packages','notification_rules','settings']
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_updated_%I ON %I', t, t);
    EXECUTE format('CREATE TRIGGER trg_updated_%I BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION update_updated_at()', t, t);
  END LOOP;
END; $$;

-- ============================================================
-- DEFAULT ROLES
-- ============================================================
INSERT INTO roles (name, permissions) VALUES
  ('Super Admin', '{"all": true}'),
  ('Manager', '{"users": true, "courses": true, "attendance": true, "trainers": true, "events": true, "financials": true, "notifications": true, "progress": true}'),
  ('Instructor', '{"attendance": true, "progress": true, "courses": {"read": true}}'),
  ('Accountant', '{"financials": true, "users": {"read": true}}')
ON CONFLICT (name) DO NOTHING;

-- ============================================================
-- SAMPLE DATA (optional — comment out for production)
-- ============================================================

-- Sample courses
INSERT INTO courses (name, description, min_age, max_age, status, image_url) VALUES
  ('Robotics', 'Build and program robots from scratch. Students learn mechanical design, electronics, and coding through hands-on projects.', 7, 18, 'active', null),
  ('Speed Math', 'Mental arithmetic techniques using abacus and vedic math for lightning-fast calculations.', 5, 16, 'active', null)
ON CONFLICT DO NOTHING;

-- Sample packages
INSERT INTO packages (name, duration_months, base_price, default_discount, description) VALUES
  ('Monthly Basic', 1, 150.00, 0, 'Single month subscription for any course'),
  ('Quarterly', 3, 400.00, 11, '3-month subscription with 11% discount'),
  ('Annual Premium', 12, 1400.00, 22, 'Full-year subscription with best value discount')
ON CONFLICT DO NOTHING;

-- Sample events
INSERT INTO events (title, description, start_date, end_date, start_time, end_time, location, capacity, status, theme_color) VALUES
  ('Science Fair 2025', 'Annual science exhibition showcasing student projects.', '2025-06-10', '2025-06-12', '09:00', '17:00', 'Minds'' Craft Main Hall', 100, 'upcoming', '#22c55e'),
  ('Math Competition', 'Inter-school mental arithmetic competition.', '2025-07-05', '2025-07-05', '10:00', '14:00', 'Auditorium A', 60, 'upcoming', '#6366f1'),
  ('Robotics Workshop', 'Open day hands-on robotics session for all ages.', '2025-05-20', '2025-05-20', '14:00', '18:00', 'Lab 1 & 2', 40, 'upcoming', '#f59e0b')
ON CONFLICT DO NOTHING;

-- Sample notification rules
INSERT INTO notification_rules (title, trigger_event, channels, email_template, is_active) VALUES
  ('Welcome New Student', 'on_student_created', '{"email"}', 'Welcome to Minds'' Craft, {fname}! We are excited to have you join us. Your learning journey starts now.', true),
  ('Payment Received', 'on_payment', '{"email","sms"}', 'Hi {fname}, your payment of {amount} has been received. Package: {package}. Valid until {expiry_date}.', true),
  ('Subscription Expiring Soon', 'on_expiry_reminder', '{"email","sms"}', 'Hi {fname}, your {package} subscription expires on {expiry_date} ({days_left} days left). Renew to continue your learning journey.', true),
  ('Attendance Marked Absent', 'on_absent', '{"email"}', 'Hi {fname}, your child was marked absent today ({date}). Please contact us if you need assistance.', true)
ON CONFLICT DO NOTHING;

COMMENT ON TABLE users IS 'All users: parents, students, staff, admins';
COMMENT ON TABLE courses IS 'Course definitions';
COMMENT ON TABLE levels IS 'Course curriculum levels with schedule info';
COMMENT ON TABLE trainers IS 'Trainer/instructor profiles';
COMMENT ON TABLE enrollments IS 'Student-to-level enrollment records';
COMMENT ON TABLE attendance IS 'Daily attendance per student per level';
COMMENT ON TABLE events IS 'Center events and competitions';
COMMENT ON TABLE packages IS 'Subscription package definitions';
COMMENT ON TABLE student_allocations IS 'Package assigned to a student';
COMMENT ON TABLE transactions IS 'Financial transactions (income + expenses)';
COMMENT ON TABLE notification_rules IS 'Automated notification templates';
COMMENT ON TABLE assessments IS 'Student skill assessments';

-- ============================================================
-- MIGRATION: Run this section if you already have the schema
--            and only need the incremental additions.
-- ============================================================

-- M1: Ensure enrollments table exists (idempotent)
CREATE TABLE IF NOT EXISTS enrollments (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  level_id     UUID NOT NULL REFERENCES levels(id) ON DELETE CASCADE,
  enrolled_at  DATE DEFAULT CURRENT_DATE,
  status       TEXT DEFAULT 'active' CHECK (status IN ('active','inactive','completed','dropped')),
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (student_id, level_id)
);

ALTER TABLE enrollments ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename='enrollments' AND policyname='Authenticated users can do everything'
  ) THEN
    CREATE POLICY "Authenticated users can do everything" ON enrollments
      FOR ALL USING (auth.role() = 'authenticated');
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_enrollments_student ON enrollments(student_id);
CREATE INDEX IF NOT EXISTS idx_enrollments_level   ON enrollments(level_id);
CREATE INDEX IF NOT EXISTS idx_enrollments_status  ON enrollments(status);

-- M2: Add avatar_color to users if missing
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_color TEXT DEFAULT '#22c55e';

-- M3: Add day_of_week + time fields to levels if missing (for older installs)
ALTER TABLE levels ADD COLUMN IF NOT EXISTS day_of_week   TEXT;
ALTER TABLE levels ADD COLUMN IF NOT EXISTS start_time    TIME;
ALTER TABLE levels ADD COLUMN IF NOT EXISTS end_time      TIME;
ALTER TABLE levels ADD COLUMN IF NOT EXISTS duration_mins INT DEFAULT 60;
ALTER TABLE levels ADD COLUMN IF NOT EXISTS capacity      INT DEFAULT 15;
ALTER TABLE levels ADD COLUMN IF NOT EXISTS trainer_id    UUID REFERENCES trainers(id) ON DELETE SET NULL;
ALTER TABLE levels ADD COLUMN IF NOT EXISTS acquisitions  TEXT[];
ALTER TABLE levels ADD COLUMN IF NOT EXISTS prerequisites TEXT[];

-- M4: Add theme_color to events if missing
ALTER TABLE events ADD COLUMN IF NOT EXISTS theme_color TEXT DEFAULT '#22c55e';

-- M4b: Add image_url to events for banner/cover images
ALTER TABLE events ADD COLUMN IF NOT EXISTS image_url TEXT;

-- M6: Add recipient detail columns to notification_logs
ALTER TABLE notification_logs ADD COLUMN IF NOT EXISTS recipient_name    TEXT;
ALTER TABLE notification_logs ADD COLUMN IF NOT EXISTS recipient_contact TEXT;

-- M5: Assessment sessions support
-- Allow multiple independent assessment sessions per student per skill.
-- Sessions are grouped client-side by the assessed_at timestamp (to the minute).
-- The session_id column is NOT required — it may be added later for explicit session tracking.

-- Drop old unique constraint that only allowed one row per student+skill
ALTER TABLE assessments DROP CONSTRAINT IF EXISTS assessments_student_id_skill_key_key;

-- Also drop session-based index if it was created in a prior migration attempt
DROP INDEX IF EXISTS idx_assessments_session_skill;

-- New unique constraint: one row per student + skill + timestamp
-- This allows saving the same skill multiple times across different sessions
CREATE UNIQUE INDEX IF NOT EXISTS idx_assessments_student_skill_time
  ON assessments (student_id, skill_key, assessed_at);

-- Index for fast student lookup
CREATE INDEX IF NOT EXISTS idx_assessments_student_time
  ON assessments (student_id, assessed_at DESC);

-- M5b: session_id column (optional — kept for forward compatibility, not required by the app)
ALTER TABLE assessments ADD COLUMN IF NOT EXISTS session_id UUID;

-- End of migration script
-- ============================================================
