-- ════════════════════════════════════════════════════════════════════════
-- PapiTrans — migracja 001: schemat bazy
-- Uruchom w Supabase SQL Editor na ŚWIEŻYM projekcie.
-- (Jeśli masz starą tabelę workspaces z PK token — patrz README, sekcja migracji danych.)
-- ════════════════════════════════════════════════════════════════════════

-- Workspace (jedna firma). Kolumna data przechowuje dane miesięcy (JSONB) —
-- ten sam format co dotychczas, dzięki czemu logika obliczeń pozostaje bez zmian.
CREATE TABLE workspaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL DEFAULT 'PapiTrans',
  data JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Profile użytkowników (1:1 z auth.users)
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'driver')),
  preferred_language TEXT NOT NULL DEFAULT 'pl' CHECK (preferred_language IN ('pl', 'ru')),
  workspace_id UUID NOT NULL REFERENCES workspaces(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Kierowcy
CREATE TABLE drivers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES workspaces(id),
  profile_id UUID REFERENCES profiles(id),
  name TEXT NOT NULL,
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Dni pracy kierowcy (tabela docelowa; aplikacja v1 trzyma dni w workspaces.data)
CREATE TABLE driver_days (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES workspaces(id),
  driver_id UUID REFERENCES drivers(id),
  date DATE NOT NULL,
  loops INTEGER DEFAULT 0,
  training_amount DECIMAL(10,2) DEFAULT 0,
  sunday_bonus DECIMAL(10,2) DEFAULT 0,
  day_total DECIMAL(10,2) DEFAULT 0,
  UNIQUE(driver_id, date)
);

-- Faktury tygodniowe (tabela docelowa; aplikacja v1 trzyma faktury w workspaces.data)
CREATE TABLE invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES workspaces(id),
  month INTEGER NOT NULL,
  year INTEGER NOT NULL DEFAULT 2026,
  week_number INTEGER NOT NULL,
  date_from DATE NOT NULL,
  date_to DATE NOT NULL,
  amount DECIMAL(10,2) DEFAULT 0,
  amount_netto DECIMAL(10,2),
  amount_brutto DECIMAL(10,2),
  issue_date DATE,
  payment_date DATE GENERATED ALWAYS AS ((issue_date + INTERVAL '21 days')::date) STORED,
  status TEXT DEFAULT 'do_wystawienia'
    CHECK (status IN ('do_wystawienia','wystawiona','wyslana','oplacona','opozniona')),
  pdf_filename TEXT,
  pdf_data JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tankowania (tabela docelowa)
CREATE TABLE fuel_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES workspaces(id),
  month INTEGER NOT NULL,
  year INTEGER NOT NULL DEFAULT 2026,
  date DATE,
  amount DECIMAL(10,2) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Inne koszty (tabela docelowa)
CREATE TABLE other_costs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES workspaces(id),
  month INTEGER NOT NULL,
  year INTEGER NOT NULL DEFAULT 2026,
  date DATE,
  name TEXT NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Wypłaty kierowcy
CREATE TABLE payrolls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES workspaces(id),
  driver_id UUID REFERENCES drivers(id),
  month INTEGER NOT NULL,
  year INTEGER NOT NULL DEFAULT 2026,
  days_worked INTEGER DEFAULT 0,
  total_loops INTEGER DEFAULT 0,
  base_amount DECIMAL(10,2) DEFAULT 0,
  training_amount DECIMAL(10,2) DEFAULT 0,
  sunday_bonus DECIMAL(10,2) DEFAULT 0,
  saturday_bonus DECIMAL(10,2) DEFAULT 0,
  total_amount DECIMAL(10,2) DEFAULT 0,
  status TEXT DEFAULT 'niewypłacone' CHECK (status IN ('niewypłacone','wypłacone')),
  paid_at TIMESTAMPTZ,
  paid_by UUID REFERENCES profiles(id),
  closed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(workspace_id, driver_id, month, year)
);

-- Notatki (tabela docelowa; aplikacja v1 trzyma notatki w workspaces.data)
CREATE TABLE notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES workspaces(id),
  author_id UUID REFERENCES profiles(id),
  author_name TEXT NOT NULL,
  content TEXT NOT NULL,
  event_date DATE,
  month INTEGER,
  year INTEGER DEFAULT 2026,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Historia zmian (audit log)
CREATE TABLE audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES workspaces(id),
  user_id UUID REFERENCES profiles(id),
  user_name TEXT NOT NULL,
  action TEXT NOT NULL,
  entity TEXT NOT NULL,
  entity_id TEXT,
  old_value JSONB,
  new_value JSONB,
  description TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX audit_log_ws_created ON audit_log (workspace_id, created_at DESC);

-- Push subskrypcje
CREATE TABLE push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES workspaces(id),
  user_id UUID REFERENCES profiles(id),
  user_name TEXT NOT NULL,
  subscription JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
-- Jedno urządzenie = jeden wpis
CREATE UNIQUE INDEX push_subscriptions_endpoint
  ON push_subscriptions ((subscription->>'endpoint'));

-- Log powiadomień
CREATE TABLE notifications_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES workspaces(id),
  user_name TEXT NOT NULL,
  action TEXT NOT NULL,
  description TEXT NOT NULL,
  read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX notifications_log_ws_created ON notifications_log (workspace_id, created_at DESC);

-- Ustawienia workspace
CREATE TABLE settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES workspaces(id) UNIQUE,
  loop_rate DECIMAL(10,2) DEFAULT 100.00,
  sunday_bonus DECIMAL(10,2) DEFAULT 250.00,
  saturday_bonus DECIMAL(10,2) DEFAULT 200.00,
  saturday_bonus_threshold INTEGER DEFAULT 4,
  leasing_amount DECIMAL(10,2) DEFAULT 2300.00,
  training_rate DECIMAL(10,2) DEFAULT 150.00,
  vat_rate DECIMAL(4,2) DEFAULT 0.23,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Zamknięcie miesiąca
CREATE TABLE month_locks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES workspaces(id),
  month INTEGER NOT NULL,
  year INTEGER NOT NULL DEFAULT 2026,
  locked BOOLEAN DEFAULT FALSE,
  locked_by UUID REFERENCES profiles(id),
  locked_at TIMESTAMPTZ,
  UNIQUE(workspace_id, month, year)
);

-- ── Dane startowe ──────────────────────────────────────────────────────────
-- Jeden workspace firmy. Skopiuj wygenerowany UUID — będzie potrzebny przy
-- tworzeniu rekordów w profiles (README, krok 4).
INSERT INTO workspaces (name) VALUES ('PapiTrans') RETURNING id;
