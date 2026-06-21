-- Dodatkowa blokada dla przyszłej tabeli fuel_entries: driver może poprawiać
-- wyłącznie własny wpis pending i nie może przepchnąć pól adminowych.

CREATE OR REPLACE FUNCTION guard_driver_fuel_pending_update()
RETURNS TRIGGER AS $$
BEGIN
  IF get_user_role() <> 'driver' THEN
    RETURN NEW;
  END IF;

  IF OLD.status <> 'pending' OR NEW.status <> 'pending' THEN
    RAISE EXCEPTION 'Driver can update only pending fuel entries';
  END IF;

  IF NEW.workspace_id IS DISTINCT FROM OLD.workspace_id
    OR NEW.driver_id IS DISTINCT FROM OLD.driver_id
    OR NEW.created_by IS DISTINCT FROM OLD.created_by
    OR NEW.accounting_month IS DISTINCT FROM OLD.accounting_month
    OR NEW.accounting_year IS DISTINCT FROM OLD.accounting_year
  THEN
    RAISE EXCEPTION 'Driver cannot change accounting ownership fields';
  END IF;

  IF NEW.is_historical = TRUE AND NEW.include_in_reports = TRUE THEN
    RAISE EXCEPTION 'Driver cannot include historical fuel entry in reports';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_guard_driver_fuel_pending_update ON fuel_entries;
CREATE TRIGGER trg_guard_driver_fuel_pending_update
BEFORE UPDATE ON fuel_entries
FOR EACH ROW
EXECUTE FUNCTION guard_driver_fuel_pending_update();

DROP POLICY IF EXISTS "fuel_entries_driver_update_pending" ON fuel_entries;
CREATE POLICY "fuel_entries_driver_update_pending" ON fuel_entries FOR UPDATE
  USING (
    get_user_role() = 'driver'
    AND workspace_id = get_user_workspace()
    AND driver_id = get_driver_id()
    AND created_by = auth.uid()
    AND status = 'pending'
  )
  WITH CHECK (
    get_user_role() = 'driver'
    AND workspace_id = get_user_workspace()
    AND driver_id = get_driver_id()
    AND created_by = auth.uid()
    AND status = 'pending'
    AND (
      is_historical = FALSE
      OR include_in_reports = FALSE
    )
  );
