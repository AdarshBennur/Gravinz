-- ═══════════════════════════════════════════════════════════════════
-- Supabase Row-Level Security (RLS) Policies
-- Apply this AFTER the Drizzle schema has been pushed (drizzle-kit push)
-- ═══════════════════════════════════════════════════════════════════

-- Enable RLS on all user-scoped tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE experiences ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_sends ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_log ENABLE ROW LEVEL SECURITY;

-- ─── Users table (id = auth.uid()) ──────────────────────────────

CREATE POLICY "Users can view own record"
  ON users FOR SELECT
  USING (id = auth.uid()::text);

CREATE POLICY "Users can update own record"
  ON users FOR UPDATE
  USING (id = auth.uid()::text);

-- ─── User Profiles ──────────────────────────────────────────────

CREATE POLICY "Users can view own profile"
  ON user_profiles FOR SELECT
  USING (user_id = auth.uid()::text);

CREATE POLICY "Users can insert own profile"
  ON user_profiles FOR INSERT
  WITH CHECK (user_id = auth.uid()::text);

CREATE POLICY "Users can update own profile"
  ON user_profiles FOR UPDATE
  USING (user_id = auth.uid()::text);

-- ─── Contacts ───────────────────────────────────────────────────

CREATE POLICY "Users can view own contacts"
  ON contacts FOR SELECT
  USING (user_id = auth.uid()::text);

CREATE POLICY "Users can insert own contacts"
  ON contacts FOR INSERT
  WITH CHECK (user_id = auth.uid()::text);

CREATE POLICY "Users can update own contacts"
  ON contacts FOR UPDATE
  USING (user_id = auth.uid()::text);

CREATE POLICY "Users can delete own contacts"
  ON contacts FOR DELETE
  USING (user_id = auth.uid()::text);

-- ─── Campaign Settings ─────────────────────────────────────────

CREATE POLICY "Users can view own settings"
  ON campaign_settings FOR SELECT
  USING (user_id = auth.uid()::text);

CREATE POLICY "Users can insert own settings"
  ON campaign_settings FOR INSERT
  WITH CHECK (user_id = auth.uid()::text);

CREATE POLICY "Users can update own settings"
  ON campaign_settings FOR UPDATE
  USING (user_id = auth.uid()::text);

-- ─── Experiences ────────────────────────────────────────────────

CREATE POLICY "Users can view own experiences"
  ON experiences FOR SELECT
  USING (user_id = auth.uid()::text);

CREATE POLICY "Users can insert own experiences"
  ON experiences FOR INSERT
  WITH CHECK (user_id = auth.uid()::text);

CREATE POLICY "Users can update own experiences"
  ON experiences FOR UPDATE
  USING (user_id = auth.uid()::text);

CREATE POLICY "Users can delete own experiences"
  ON experiences FOR DELETE
  USING (user_id = auth.uid()::text);

-- ─── Projects ───────────────────────────────────────────────────

CREATE POLICY "Users can view own projects"
  ON projects FOR SELECT
  USING (user_id = auth.uid()::text);

CREATE POLICY "Users can insert own projects"
  ON projects FOR INSERT
  WITH CHECK (user_id = auth.uid()::text);

CREATE POLICY "Users can update own projects"
  ON projects FOR UPDATE
  USING (user_id = auth.uid()::text);

CREATE POLICY "Users can delete own projects"
  ON projects FOR DELETE
  USING (user_id = auth.uid()::text);

-- ─── Email Sends ────────────────────────────────────────────────

CREATE POLICY "Users can view own email sends"
  ON email_sends FOR SELECT
  USING (user_id = auth.uid()::text);

CREATE POLICY "Users can insert own email sends"
  ON email_sends FOR INSERT
  WITH CHECK (user_id = auth.uid()::text);

CREATE POLICY "Users can update own email sends"
  ON email_sends FOR UPDATE
  USING (user_id = auth.uid()::text);

-- ─── Daily Usage ────────────────────────────────────────────────

CREATE POLICY "Users can view own daily usage"
  ON daily_usage FOR SELECT
  USING (user_id = auth.uid()::text);

CREATE POLICY "Users can insert own daily usage"
  ON daily_usage FOR INSERT
  WITH CHECK (user_id = auth.uid()::text);

CREATE POLICY "Users can update own daily usage"
  ON daily_usage FOR UPDATE
  USING (user_id = auth.uid()::text);

-- ─── Integrations ───────────────────────────────────────────────

CREATE POLICY "Users can view own integrations"
  ON integrations FOR SELECT
  USING (user_id = auth.uid()::text);

CREATE POLICY "Users can insert own integrations"
  ON integrations FOR INSERT
  WITH CHECK (user_id = auth.uid()::text);

CREATE POLICY "Users can update own integrations"
  ON integrations FOR UPDATE
  USING (user_id = auth.uid()::text);

-- ─── Activity Log ───────────────────────────────────────────────

CREATE POLICY "Users can view own activity log"
  ON activity_log FOR SELECT
  USING (user_id = auth.uid()::text);

CREATE POLICY "Users can insert own activity log"
  ON activity_log FOR INSERT
  WITH CHECK (user_id = auth.uid()::text);

-- ═══════════════════════════════════════════════════════════════════
-- NOTE: The backend uses SUPABASE_SERVICE_ROLE_KEY which bypasses RLS.
-- These policies protect against direct client (anon key) access.
-- ═══════════════════════════════════════════════════════════════════
