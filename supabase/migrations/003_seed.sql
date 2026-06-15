-- ════════════════════════════════════════════════════════════════════════
-- PapiTrans — krok 3: profile + kierowca + ustawienia (seed)
-- Uruchom PO 001_initial.sql i 002_rls.sql oraz utworzeniu kont w Auth.
-- ════════════════════════════════════════════════════════════════════════

-- Profile (powiązane 1:1 z auth.users po UUID)
INSERT INTO profiles (id, email, name, role, workspace_id, preferred_language) VALUES
  ('8c4b86dc-0351-40d8-9277-df4092c00b42', 'papaking@papitrans.local',   'PapiKing',   'admin',  '1948ebd1-548a-429c-998e-84e24cb4269f', 'pl'),
  ('47b51c85-2caa-488c-adc2-c74ae673e974', 'papiminion@papitrans.local', 'PapiMinion', 'admin',  '1948ebd1-548a-429c-998e-84e24cb4269f', 'pl'),
  ('034be26d-69fd-4921-a9a9-a07067801e24', 'kier01@papitrans.local',     'Yevhenii',   'driver', '1948ebd1-548a-429c-998e-84e24cb4269f', 'pl');

-- Rekord kierowcy (powiązanie profilu z danymi dni pracy / wypłatami)
INSERT INTO drivers (workspace_id, profile_id, name) VALUES
  ('1948ebd1-548a-429c-998e-84e24cb4269f', '034be26d-69fd-4921-a9a9-a07067801e24', 'Yevhenii');

-- Ustawienia workspace (domyślne stawki PapiTrans)
INSERT INTO settings (workspace_id) VALUES
  ('1948ebd1-548a-429c-998e-84e24cb4269f');
