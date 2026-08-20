-- Rola „logistyk": własny panel z rozliczeniem (12% zleceń + 5% na-czysto + 600
-- za auta). Logistyk NIE ma RLS do workspaces — dane czyta service-role API
-- (/api/logistyk/rozliczenie). Rozszerzamy tylko CHECK na profiles.role.

ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE profiles
  ADD CONSTRAINT profiles_role_check CHECK (role IN ('admin', 'driver', 'logistyk'));
