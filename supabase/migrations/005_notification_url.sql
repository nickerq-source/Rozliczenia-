-- ════════════════════════════════════════════════════════════════════════
-- PapiTrans — migracja 005: deep-link w powiadomieniach
-- Kolumna url pozwala kliknąć powiadomienie (np. zgłoszenie kierowcy) i przejść
-- prosto do odpowiedniego miejsca w panelu (miesiąc + zakładka koszty).
-- ════════════════════════════════════════════════════════════════════════

ALTER TABLE notifications_log ADD COLUMN IF NOT EXISTS url TEXT;
