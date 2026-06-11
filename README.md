# 🚛 PapiTrans — Rozliczenia floty 2026

Aplikacja webowa do miesięcznych rozliczeń floty dostawczej z logowaniem
(Supabase Auth), rolami **admin / kierowca**, audit logiem, powiadomieniami
push i automatyką statusów faktur.

---

## ✨ Funkcje

- **Logowanie** email + hasło (Supabase Auth, bez publicznej rejestracji)
- **Role**: admin (pełny panel) i kierowca (tylko widok własnej wypłaty)
- Miesiące **Czerwiec–Grudzień 2026**, faktury tygodniowe, import PDF (pdfjs)
- Wynagrodzenie kierowcy: kółka × 100 zł, szkolenie, dodatek niedzielny, premia sobotnia
- **Statusy faktur** (do wystawienia → wystawiona → wysłana → opłacona / opóźniona)
  z auto-opłatą po 21 dniach od daty wystawienia (Vercel Cron)
- **Status wypłaty kierowcy** (oznaczanie jako wypłacone)
- **Zamknięcie miesiąca** (readonly + kłódka)
- **Notatki** z terminami + przypomnienia push (rano w dniu, wieczorem dzień przed)
- **Audit log** — każda zmiana zapisana + zakładka Historia z filtrami
- **Powiadomienia** Web Push + panel realtime (Supabase Realtime)
- Zakładka **Raport**: podsumowanie roczne, ranking tygodni, wykres
- Ciemny motyw PapiTrans (szmaragd + bursztyn, tło graficzne)

---

## 🚀 Wdrożenie krok po kroku

### 1. Utwórz projekt Supabase

1. [supabase.com](https://supabase.com) → **New project** (np. `papitrans`, region Frankfurt)
2. Poczekaj ~2 minuty na inicjalizację

### 2. Uruchom migracje SQL

W **SQL Editor** uruchom po kolei pliki z repo:

1. `supabase/migrations/001_initial.sql` — tabele.
   **Zapisz UUID workspace** zwrócony na końcu (`INSERT ... RETURNING id`).
2. `supabase/migrations/002_rls.sql` — Row Level Security i funkcje pomocnicze.

### 3. Utwórz konta w Supabase Auth

Logowanie w aplikacji jest **nazwą konta bez @** — formularz dokleja domenę
`@papitrans.local`. W Supabase utwórz konta z takimi syntetycznymi emailami:

**Authentication → Users → Add user → Create new user** (zaznacz „Auto Confirm User"):

| Email w Supabase | Konto w aplikacji | Hasło | Rola |
|------------------|-------------------|-------|------|
| `papiking@papitrans.local` | PapiKing | `K30A21K09` | admin |
| `papiminion@papitrans.local` | PapiMinion | `KK4898Y!` | admin |
| `kier01@papitrans.local` | kier01 | `Zenia01` | driver |

Skopiuj **UUID każdego usera** (kolumna UID).

### 4. Wpisz profile (SQL Editor)

Podmień `WORKSPACE_UUID` (z kroku 2) i `UUID_*` (z kroku 3):

```sql
INSERT INTO profiles (id, email, name, role, workspace_id) VALUES
  ('UUID_PAPIKING',   'papiking@papitrans.local',   'PapiKing',   'admin',  'WORKSPACE_UUID'),
  ('UUID_PAPIMINION', 'papiminion@papitrans.local', 'PapiMinion', 'admin',  'WORKSPACE_UUID'),
  ('UUID_KIER01',     'kier01@papitrans.local',     'Zenia',      'driver', 'WORKSPACE_UUID');

-- Rekord kierowcy (powiązanie profilu z danymi dni pracy)
INSERT INTO drivers (workspace_id, profile_id, name)
VALUES ('WORKSPACE_UUID', 'UUID_KIER01', 'Zenia');
```

### 5. Wygeneruj klucze VAPID (powiadomienia push)

```bash
npx web-push generate-vapid-keys
```

### 6. Uzupełnij `.env.local`

```bash
cp .env.example .env.local
```

| Zmienna | Skąd |
|---------|------|
| `NEXT_PUBLIC_SUPABASE_URL` | Project Settings → API → Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Project Settings → API → anon public |
| `SUPABASE_SERVICE_ROLE_KEY` | Project Settings → API → service_role (**sekret!**) |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Public Key z kroku 5 |
| `VAPID_PRIVATE_KEY` | Private Key z kroku 5 |
| `VAPID_SUBJECT` | `mailto:admin@papitrans.pl` |
| `CRON_SECRET` | dowolny losowy string |

### 7. Test lokalny

```bash
npm install
npm run dev
```

Otwórz [http://localhost:3000](http://localhost:3000) → przekierowanie na `/login`.
Zaloguj się kontem admina → `/admin`; kontem kierowcy → `/driver`.

### 8. Deploy na Vercel

1. Wrzuć repo na GitHub, zaimportuj w [vercel.com](https://vercel.com)
2. **Settings → Environment Variables**: wklej wszystkie zmienne z kroku 6
3. **Deploy**

Crony (`vercel.json`, czasy UTC — 6:00 UTC = 8:00 PL latem):

| Cron | Harmonogram | Działanie |
|------|-------------|-----------|
| `/api/cron/auto-pay-invoices` | codziennie 5:00 UTC | faktury starsze niż 21 dni od wystawienia → „opłacona" |
| `/api/cron/note-reminders` | 6:00 UTC | „Dziś termin: …" |
| `/api/cron/note-reminders` | 21:00 UTC | „Jutro termin: …" |

---

## 🔔 Powiadomienia push

- Włączenie: Podsumowanie → panel Powiadomienia → przełącznik (wymaga HTTPS)
- Autor zmiany nie dostaje powiadomień o własnych edycjach
- Wygasłe subskrypcje są usuwane automatycznie
- Każde zdarzenie trafia też do `audit_log` (zakładka Historia) i `notifications_log` (panel, realtime)

## 🔒 Role i bezpieczeństwo

- **RLS w Postgresie**: admin widzi tylko swój workspace; kierowca nie ma dostępu
  do faktur, kosztów ani zysków — jego widok wypłaty liczy serwer (service role)
  i zwraca wyłącznie dane wynagrodzenia
- Dane miesięcy przechowywane w `workspaces.data` (JSONB) — format zgodny
  z logiką obliczeń aplikacji; tabele relacyjne (invoices, driver_days, …)
  są w migracji jako struktura docelowa na przyszłość
- Crony chronione nagłówkiem `Authorization: Bearer CRON_SECRET`

---

## 🧮 Logika biznesowa

| Reguła | Opis |
|--------|------|
| Kółka | 1 kółko = 100 zł |
| Szkolenie | Tylko czerwiec, ręczne pole (150 zł/dzień) |
| Dodatek niedzielny | +250 zł jeśli niedziela ≥1 kółko ORAZ poprzednia sobota ≥1 kółko |
| Premia | +200 zł jeśli ≥4 przepracowane soboty w miesiącu |
| Leasing | Domyślnie 2300 zł (edytowalne) |
| Zysk | Przychód − wynagrodzenie − paliwo − inne − leasing |
| Termin płatności faktury | data wystawienia + 21 dni (auto-status „opłacona") |

---

## 🛠 Stack

- **Next.js 15** (App Router) + TypeScript + Tailwind CSS v4
- **Supabase**: Auth, Postgres + RLS, Realtime
- **web-push** (VAPID), Service Worker
- **Vercel**: hosting + Cron
