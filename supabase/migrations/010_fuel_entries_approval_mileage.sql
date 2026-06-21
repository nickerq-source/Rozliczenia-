-- Tankowania: status zatwierdzania, daty historyczne, przebieg/tacho i RLS dla kierowcy.

ALTER TABLE fuel_entries
  ADD COLUMN IF NOT EXISTS driver_id UUID REFERENCES drivers(id),
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES profiles(id),
  ADD COLUMN IF NOT EXISTS expense_date DATE,
  ADD COLUMN IF NOT EXISTS accounting_month INTEGER,
  ADD COLUMN IF NOT EXISTS accounting_year INTEGER DEFAULT 2026,
  ADD COLUMN IF NOT EXISTS is_historical BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS include_in_reports BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS liters DECIMAL(10,2),
  ADD COLUMN IF NOT EXISTS price_per_liter DECIMAL(10,2),
  ADD COLUMN IF NOT EXISTS station_name TEXT,
  ADD COLUMN IF NOT EXISTS mileage DECIMAL(12,1),
  ADD COLUMN IF NOT EXISTS mileage_source TEXT DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS mileage_confidence DECIMAL(4,2),
  ADD COLUMN IF NOT EXISTS tacho_status TEXT,
  ADD COLUMN IF NOT EXISTS receipt_attachment_id UUID,
  ADD COLUMN IF NOT EXISTS odometer_attachment_id UUID,
  ADD COLUMN IF NOT EXISTS tachograph_attachment_id UUID,
  ADD COLUMN IF NOT EXISTS note TEXT,
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE fuel_entries
  DROP CONSTRAINT IF EXISTS fuel_entries_status_check,
  ADD CONSTRAINT fuel_entries_status_check
    CHECK (status IN ('pending','approved','rejected'));

ALTER TABLE fuel_entries
  DROP CONSTRAINT IF EXISTS fuel_entries_mileage_source_check,
  ADD CONSTRAINT fuel_entries_mileage_source_check
    CHECK (mileage_source IN ('manual','ocr','ai','confirmed_ai','tachograph'));

CREATE INDEX IF NOT EXISTS idx_fuel_entries_workspace_status
  ON fuel_entries(workspace_id, status);

CREATE INDEX IF NOT EXISTS idx_fuel_entries_driver_created
  ON fuel_entries(driver_id, created_by, created_at DESC);

DROP POLICY IF EXISTS "fuel_admin_only" ON fuel_entries;
DROP POLICY IF EXISTS "fuel_entries_admin_all" ON fuel_entries;
DROP POLICY IF EXISTS "fuel_entries_driver_select" ON fuel_entries;
DROP POLICY IF EXISTS "fuel_entries_driver_insert" ON fuel_entries;
DROP POLICY IF EXISTS "fuel_entries_driver_update_pending" ON fuel_entries;

CREATE POLICY "fuel_entries_admin_all" ON fuel_entries FOR ALL
  USING (get_user_role() = 'admin' AND workspace_id = get_user_workspace())
  WITH CHECK (get_user_role() = 'admin' AND workspace_id = get_user_workspace());

CREATE POLICY "fuel_entries_driver_select" ON fuel_entries FOR SELECT
  USING (
    get_user_role() = 'driver'
    AND workspace_id = get_user_workspace()
    AND driver_id = get_driver_id()
    AND created_by = auth.uid()
  );

CREATE POLICY "fuel_entries_driver_insert" ON fuel_entries FOR INSERT
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

-- Jeżeli w projekcie istnieje osobna tabela attachmentów, dopnij typ zdjęcia.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'attachments'
  ) THEN
    ALTER TABLE attachments
      ADD COLUMN IF NOT EXISTS attachment_kind TEXT DEFAULT 'other';

    ALTER TABLE attachments
      DROP CONSTRAINT IF EXISTS attachments_attachment_kind_check,
      ADD CONSTRAINT attachments_attachment_kind_check
        CHECK (attachment_kind IN ('receipt','odometer','tachograph','other'));
  END IF;
END $$;
