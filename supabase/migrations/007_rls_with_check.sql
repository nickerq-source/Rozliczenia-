-- ════════════════════════════════════════════════════════════════════════
-- PapiTrans — migracja 007: jawne WITH CHECK na politykach FOR ALL (hardening)
-- Postgres domyślnie kopiuje USING→WITH CHECK, więc INSERT/UPDATE i tak były
-- chronione; ta migracja czyni to jawnym (audyt bezpieczeństwa, część A.2).
-- Idempotentna: DROP IF EXISTS + CREATE.
-- ════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "workspaces_admin" ON workspaces;
CREATE POLICY "workspaces_admin" ON workspaces FOR ALL
  USING (get_user_role() = 'admin' AND id = get_user_workspace())
  WITH CHECK (get_user_role() = 'admin' AND id = get_user_workspace());

DROP POLICY IF EXISTS "drivers_admin" ON drivers;
CREATE POLICY "drivers_admin" ON drivers FOR ALL
  USING (get_user_role() = 'admin' AND workspace_id = get_user_workspace())
  WITH CHECK (get_user_role() = 'admin' AND workspace_id = get_user_workspace());

DROP POLICY IF EXISTS "driver_days_admin" ON driver_days;
CREATE POLICY "driver_days_admin" ON driver_days FOR ALL
  USING (get_user_role() = 'admin' AND workspace_id = get_user_workspace())
  WITH CHECK (get_user_role() = 'admin' AND workspace_id = get_user_workspace());

DROP POLICY IF EXISTS "invoices_admin_only" ON invoices;
CREATE POLICY "invoices_admin_only" ON invoices FOR ALL
  USING (get_user_role() = 'admin' AND workspace_id = get_user_workspace())
  WITH CHECK (get_user_role() = 'admin' AND workspace_id = get_user_workspace());

DROP POLICY IF EXISTS "fuel_admin_only" ON fuel_entries;
CREATE POLICY "fuel_admin_only" ON fuel_entries FOR ALL
  USING (get_user_role() = 'admin' AND workspace_id = get_user_workspace())
  WITH CHECK (get_user_role() = 'admin' AND workspace_id = get_user_workspace());

DROP POLICY IF EXISTS "costs_admin_only" ON other_costs;
CREATE POLICY "costs_admin_only" ON other_costs FOR ALL
  USING (get_user_role() = 'admin' AND workspace_id = get_user_workspace())
  WITH CHECK (get_user_role() = 'admin' AND workspace_id = get_user_workspace());

DROP POLICY IF EXISTS "payrolls_admin" ON payrolls;
CREATE POLICY "payrolls_admin" ON payrolls FOR ALL
  USING (get_user_role() = 'admin' AND workspace_id = get_user_workspace())
  WITH CHECK (get_user_role() = 'admin' AND workspace_id = get_user_workspace());

DROP POLICY IF EXISTS "notes_admin_only" ON notes;
CREATE POLICY "notes_admin_only" ON notes FOR ALL
  USING (get_user_role() = 'admin' AND workspace_id = get_user_workspace())
  WITH CHECK (get_user_role() = 'admin' AND workspace_id = get_user_workspace());

DROP POLICY IF EXISTS "notifications_admin" ON notifications_log;
CREATE POLICY "notifications_admin" ON notifications_log FOR ALL
  USING (get_user_role() = 'admin' AND workspace_id = get_user_workspace())
  WITH CHECK (get_user_role() = 'admin' AND workspace_id = get_user_workspace());

DROP POLICY IF EXISTS "settings_admin_only" ON settings;
CREATE POLICY "settings_admin_only" ON settings FOR ALL
  USING (get_user_role() = 'admin' AND workspace_id = get_user_workspace())
  WITH CHECK (get_user_role() = 'admin' AND workspace_id = get_user_workspace());

DROP POLICY IF EXISTS "locks_admin_only" ON month_locks;
CREATE POLICY "locks_admin_only" ON month_locks FOR ALL
  USING (get_user_role() = 'admin' AND workspace_id = get_user_workspace())
  WITH CHECK (get_user_role() = 'admin' AND workspace_id = get_user_workspace());
