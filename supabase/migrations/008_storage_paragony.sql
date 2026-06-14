-- Bucket na załączniki kosztów (zdjęcia paragonów/dokumentów/liczników).
-- Aplikacja tworzy go też leniwie z kodu (lib/storage.ts), ale trzymamy SQL
-- dla kompletności i powtarzalnego provisioningu.
--
-- Upload i odczyt idą WYŁĄCZNIE przez service role (trasy /api/attachments*,
-- /api/driver/fuel), który omija RLS — dlatego nie definiujemy polityk dla
-- ról anon/authenticated. Bucket jest prywatny; podgląd tylko przez
-- krótkotrwały podpisany URL generowany server-side.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'paragony',
  'paragony',
  false,
  6291456, -- 6 MB
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do nothing;
