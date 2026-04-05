/* ============================================================
   MINDS' CRAFT — SUPABASE CONFIGURATION
   ============================================================
   
   CREDENTIALS STORAGE PRIORITY (checked in order):
   1. HARDCODED values below (fastest — set once, never ask again)
   2. localStorage  (mc_supabase_url / mc_supabase_key)
   3. sessionStorage (mc_supabase_url / mc_supabase_key)
   4. Setup screen prompts the admin once, then saves to all stores

   HOW TO MAKE CREDENTIALS PERMANENT (recommended):
   After your first successful login, copy the values you entered
   and paste them into the SUPABASE_URL and SUPABASE_ANON_KEY
   constants below — that way the app never asks again even if
   localStorage is cleared.

   ============================================================ */

// ── OPTION A: Hardcode credentials here (most reliable) ──────
//   Replace the empty strings with your real values.
//   Leave empty to use the setup screen / localStorage instead.
const SUPABASE_URL      = 'https://xiatsareoruybucwkpkc.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhpYXRzYXJlb3J1eWJ1Y3drcGtjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQzNjgzOTcsImV4cCI6MjA4OTk0NDM5N30.l14cNOUt1PKqL0hl5VL5wpt2JRB9rG_gQlJeYeJNIqU';

// ── OPTION B: Dynamic lookup from storage (default) ──────────
const SUPABASE_CONFIG = {
  get url() {
    return SUPABASE_URL
      || localStorage.getItem('mc_supabase_url')
      || sessionStorage.getItem('mc_supabase_url')
      || '';
  },
  get anonKey() {
    return SUPABASE_ANON_KEY
      || localStorage.getItem('mc_supabase_key')
      || sessionStorage.getItem('mc_supabase_key')
      || '';
  },
};

// App configuration
const APP_CONFIG = {
  name: "Minds' Craft",
  version: "1.0.0",
  emailSender: "minds.craft.lb@gmail.com",
  timezone: "Asia/Beirut",
  currency: "USD",
  dateFormat: "DD/MM/YYYY",
  defaultLanguage: "en",
};

// Roles configuration
const ROLES = {
  SUPER_ADMIN: 'super_admin',
  MANAGER: 'manager',
  INSTRUCTOR: 'instructor',
  ACCOUNTANT: 'accountant',
};

// User types
const USER_TYPES = {
  PARENT: 'parent',
  STUDENT: 'student',
  STAFF: 'staff',
  ADMIN: 'admin',
};

// Subscription types
const SUBSCRIPTIONS = {
  BASIC: 'basic',
  PREMIUM: 'premium',
  TRIAL: 'trial',
};

// Attendance statuses
const ATTENDANCE_STATUS = {
  PRESENT: 'present',
  LATE: 'late',
  ABSENT: 'absent',
};

// Transaction types
const TRANSACTION_TYPES = {
  INCOME: 'income',
  EXPENSE: 'expense',
};
