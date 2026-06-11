-- ════════════════════════════════════════════════════════════════════════
-- PapiTrans — migracja 002: Row Level Security
-- admin = pełny dostęp w swoim workspace; driver = tylko swoje dane
-- ════════════════════════════════════════════════════════════════════════

ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE drivers ENABLE ROW LEVEL SECURITY;
ALTER TABLE driver_days ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE fuel_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE other_costs ENABLE ROW LEVEL SECURITY;
ALTER TABLE payrolls ENABLE ROW LEVEL SECURITY;
ALTER TABLE notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE month_locks ENABLE ROW LEVEL SECURITY;

-- ── Helper functions ────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_user_role()
RETURNS TEXT AS $$
  SELECT role FROM profiles WHERE id = auth.uid();
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION get_user_workspace()
RETURNS UUID AS $$
  SELECT workspace_id FROM profiles WHERE id = auth.uid();
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION get_driver_id()
RETURNS UUID AS $$
  SELECT id FROM drivers WHERE profile_id = auth.uid();
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

-- ── workspaces: dane miesięcy (JSONB) — tylko admin ────────────────────────
CREATE POLICY "workspaces_admin" ON workspaces FOR ALL
  USING (get_user_role() = 'admin' AND id = get_user_workspace());

-- ── profiles: swój profil; admin widzi wszystkie w workspace ───────────────
CREATE POLICY "profiles_select" ON profiles FOR SELECT
  USING (id = auth.uid() OR (get_user_role() = 'admin' AND workspace_id = get_user_workspace()));

-- ── drivers: admin pełny dostęp; driver widzi swój rekord ──────────────────
CREATE POLICY "drivers_admin" ON drivers FOR ALL
  USING (get_user_role() = 'admin' AND workspace_id = get_user_workspace());
CREATE POLICY "drivers_self_select" ON drivers FOR SELECT
  USING (profile_id = auth.uid());

-- ── driver_days: admin wszystkie; driver tylko swoje ───────────────────────
CREATE POLICY "driver_days_admin" ON driver_days FOR ALL
  USING (get_user_role() = 'admin' AND workspace_id = get_user_workspace());
CREATE POLICY "driver_days_driver_select" ON driver_days FOR SELECT
  USING (get_user_role() = 'driver' AND driver_id = get_driver_id());

-- ── invoices / fuel / costs: tylko admin ───────────────────────────────────
CREATE POLICY "invoices_admin_only" ON invoices FOR ALL
  USING (get_user_role() = 'admin' AND workspace_id = get_user_workspace());
CREATE POLICY "fuel_admin_only" ON fuel_entries FOR ALL
  USING (get_user_role() = 'admin' AND workspace_id = get_user_workspace());
CREATE POLICY "costs_admin_only" ON other_costs FOR ALL
  USING (get_user_role() = 'admin' AND workspace_id = get_user_workspace());

-- ── payrolls: admin pełny dostęp; driver tylko swoje (SELECT) ──────────────
CREATE POLICY "payrolls_admin" ON payrolls FOR ALL
  USING (get_user_role() = 'admin' AND workspace_id = get_user_workspace());
CREATE POLICY "payrolls_driver_select" ON payrolls FOR SELECT
  USING (get_user_role() = 'driver' AND driver_id = get_driver_id());

-- ── notes: tylko admin ──────────────────────────────────────────────────────
CREATE POLICY "notes_admin_only" ON notes FOR ALL
  USING (get_user_role() = 'admin' AND workspace_id = get_user_workspace());

-- ── audit_log: admin czyta; INSERT przez service role (API) ────────────────
CREATE POLICY "audit_admin_only" ON audit_log FOR SELECT
  USING (get_user_role() = 'admin' AND workspace_id = get_user_workspace());

-- ── notifications_log: admin pełny dostęp ──────────────────────────────────
CREATE POLICY "notifications_admin" ON notifications_log FOR ALL
  USING (get_user_role() = 'admin' AND workspace_id = get_user_workspace());

-- ── push_subscriptions: każdy zalogowany zarządza swoimi subskrypcjami ─────
CREATE POLICY "push_own" ON push_subscriptions FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid() AND workspace_id = get_user_workspace());

-- ── settings / month_locks: tylko admin ────────────────────────────────────
CREATE POLICY "settings_admin_only" ON settings FOR ALL
  USING (get_user_role() = 'admin' AND workspace_id = get_user_workspace());
CREATE POLICY "locks_admin_only" ON month_locks FOR ALL
  USING (get_user_role() = 'admin' AND workspace_id = get_user_workspace());

-- ── Realtime dla powiadomień ────────────────────────────────────────────────
ALTER PUBLICATION supabase_realtime ADD TABLE notifications_log;
