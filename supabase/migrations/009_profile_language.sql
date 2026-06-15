-- ════════════════════════════════════════════════════════════════════════
-- PapiTrans — migracja 009: preferowany język kierowcy
-- Uruchom w Supabase SQL Editor po wcześniejszych migracjach.
-- ════════════════════════════════════════════════════════════════════════

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS preferred_language TEXT NOT NULL DEFAULT 'pl';

UPDATE profiles
SET preferred_language = 'pl'
WHERE preferred_language IS NULL
   OR preferred_language NOT IN ('pl', 'ru');

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'profiles_preferred_language_check'
      AND conrelid = 'profiles'::regclass
  ) THEN
    ALTER TABLE profiles
      ADD CONSTRAINT profiles_preferred_language_check
      CHECK (preferred_language IN ('pl', 'ru'));
  END IF;
END $$;
