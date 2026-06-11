-- ════════════════════════════════════════════════════════════════════════
-- PapiTrans — migracja 004: GRANT-y dla ról PostgREST (anon / authenticated / service_role)
-- Tabele tworzone ręcznie w SQL Editor nie dostają domyślnych przywilejów,
-- przez co PostgREST zwraca "permission denied for table ...".
-- RLS (migracja 002) nadal decyduje, KTÓRE wiersze widać — to są tylko
-- uprawnienia na poziomie tabeli, wymagane zanim RLS w ogóle zadziała.
-- ════════════════════════════════════════════════════════════════════════

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public
  TO anon, authenticated, service_role;

GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public
  TO anon, authenticated, service_role;

GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public
  TO anon, authenticated, service_role;

-- Aby przyszłe tabele/sekwencje też miały uprawnienia automatycznie
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO anon, authenticated, service_role;
