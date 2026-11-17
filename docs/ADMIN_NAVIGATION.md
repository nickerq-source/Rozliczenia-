# Admin navigation and driver ownership

Updated: 2026-11-17. Baseline before this change: `5d9d6bab81652877bd7ec552638d17188ca31ca2`.

Release delivery: the owner authorized production deployment on 2026-11-17.
The existing `main` branch of `nickerq-source/Rozliczenia-` triggers Vercel project
`papitrans`; the production site is `https://rozliczenia-zeta.vercel.app`.
Confirm release completion using the Vercel status for the actual Git commit,
not a local build or an older implementation note below.

## Scope

The actual `/admin` entry now opens two choices: Menu glowne and Kierowcy.
Company sections retain invoices, consolidated costs, profit/cash/tax, logistics,
reports, messages, legend, settings and the partners' 50/50 settlement.
Driver profiles contain operating costs, days/pay, fueling, car/business expenses,
leasing, per-vehicle fueling statistics and assigned invoice rows. Rafal also has
the existing automatic/manual employment payroll settings.

No duplicate editable payroll/fueling forms remain in company sections. Totals
still include both drivers and remain visible in company financial statements.
Zenia's payout confirmation, payroll PDF and deductions moved out of the company
summary into his days/pay view. Existing components and backend role checks are reused.

## Data and writes

- Additive optional `driverId: zenia | rafal` on expense and vehicle records.
- Old unowned expenses belong to the original Zenia operation, including the
  numeric legacy lease. No record is copied, removed or bulk migrated on opening.
- Fuel ownership uses explicit driverId first, then the vehicle's driverId;
  the historical unowned fallback is Zenia. Author names are not ownership keys.
- Scoped edits merge rows by ID into the complete month. Another driver's rows,
  payroll, revenue and unrelated fields are preserved. New rows get driverId.
- A new vehicle requires a real name and tank capacity. No guessed Rafal plate
  or tank capacity is inserted. Existing or new vehicles can be assigned in his
  car section. Assignment pins historical fuel ownership and old default vehicle
  IDs before changing the current vehicle owner; existing historical expenses do
  not follow the car to a different driver. Audit uses the existing audit endpoint.
- Statistics use one selected vehicle across all months, including a prior-month
  anchor; another vehicle's odometer cannot be used. Historical vehicle references
  remain available in the original driver's profile after reassignment.
- `useWorkspace.saveFleet` shares the ordinary autosave revision and queue. It
  flushes pending edits before `/api/admin/fleet`, prevents concurrent mutations,
  adopts the confirmed full server state, and shows 503/409 errors without claiming
  a successful save. Existing CAS, server admin checks and RLS are unchanged.
- The company invoice importer defaults to both drivers (`mode=fleet`) but retains
  the single-driver filter option. Existing invoice editing, comments, duplicate
  checks, payment markers, premium invoice and accounting stay in Zarobek.
- A Rafal lease must not suppress Zenia's numeric legacy lease. Shared accounting,
  income-tax costs and accountant export now use the same legacy replacement rule.

## Navigation and recovery

### Mobile driver sections and calendar (2026-11-17)

Driver sections now use named icon tiles at every viewport, rather than a native
select on phones. The driver chooser displays two tiles side by side; the existing
left/above-profile switcher remains. No section or action was removed.

Rafal's calendar follows Zenia's layout: day and status, courses, daily amount,
week dividers and weekend accents. On phones courses use the full row. Status
codes have a visible legend; comments, orders and paid leave retain their fields.
Zenia's mobile amount column has a stable width to avoid squeezing the daily pay.
The change is presentation-only: rates, payroll activation, monthly draft recovery,
batch save, conflict checks, locked months, audit and undo are unchanged.

Verification: 134 local regression tests, lint, TypeScript and production build
passed. The synthetic workspace UI suite passed at 320/390/1280 px, including
tile touch targets, 30/31-day calendars, save/failure/conflict/recovery, statuses,
comments, company reconciliation and month-preserving driver switches. Screenshots
were inspected. A read-only check of production confirmed November and December
survive driver switches and the company summary/cost/tax views reconcile both
drivers. No real financial records were changed during that check.

Driver profiles now keep both driver choices visible. At widths of 1024 px and
up they form a sticky left sidebar; on phones and smaller tablets the same two
buttons appear above the profile without squeezing its forms. Company navigation
and the initial driver-choice screen are unchanged. The current driver is marked
with `aria-current` and the existing amber accent.

`switchAdminDriver` preserves the selected month and shared section. Switching
from Rafal's contract-only view to Zenia opens days/pay instead of a blank panel.
Navigation uses the existing URL/history path and performs no workspace writes.
Rafal's per-month draft recovery remains in place when switching away and back.

Driver-switcher verification (2026-11-17): 134 unit/regression tests, lint,
TypeScript and production build passed. The workspace UI suite passed at
320/390/1280 px, including left/above positioning, sticky header clearance,
current-driver indication, back/forward, month/section preservation, contract
fallback, unsaved draft recovery and locked-month navigation. Switching caused
no workspace writes. Mobile and desktop screenshots were inspected.

Files for this increment: `src/components/admin/AdminNavigation.tsx`,
`src/components/WorkspaceView.tsx`, `src/lib/admin-navigation.ts`,
`tests/driver-costs.test.cjs`, `scripts/test-admin-workspace-ui.cjs`, this document.

URL state: `miesiac`, `menu=firma|kierowcy`, `zakladka`, `kierowca=zenia|rafal`,
`widok`. Browser back and reload preserve context. Old company deep links work;
day-report notifications with `zgloszenie` open Zenia's days.

The prior layout remains accessible at `/admin?uklad=klasyczny`. This changes only
the layout, not accounting or stored data. `/admin/flota` and `/admin/podglad` remain
available. The legacy layout shows all expenses together; it does not erase driverId.
Do not deploy an old backend after new payroll writes without the recovery process
in `FLEET_LIVE.md`. A code rollback is not a data rollback.

The targeted fleet history undo is retained, with confirmation, latest-unreverted
entry restriction and locked-month protection. New vehicle assignment and ordinary
cost edits use the existing save/audit path, not the fleet undo mechanism.

## Changed files

- `src/components/WorkspaceView.tsx`
- `src/components/AppHeader.tsx`
- `src/components/TabSwitch.tsx`
- `src/components/admin/AdminNavigation.tsx`
- `src/components/admin/CompanyCosts.tsx`
- `src/components/admin/DriverWorkspace.tsx`
- `src/components/admin-preview/FleetPanel.tsx`
- `src/components/admin-preview/PreviewDriver.tsx`
- `src/components/admin-preview/admin-preview.css`
- `src/components/tabs/KosztyTab.tsx`
- `src/components/tabs/PodsumowanieTab.tsx`
- `src/components/tabs/ZarobekTab.tsx`
- `src/hooks/useWorkspace.ts`
- `src/lib/admin-navigation.ts`
- `src/lib/driver-costs.ts`
- `src/lib/types.ts`
- `src/lib/business-logic.ts`
- `src/lib/tax.ts`
- `tests/driver-costs.test.cjs`
- `tests/admin-workspace-harness.tsx`
- `tests/helpers/navigation-mock.ts`
- `scripts/test-admin-workspace-ui.cjs`
- `docs/ADMIN_NAVIGATION.md`

## Verification

Unit suite: `node --experimental-strip-types --test tests/*.test.mjs tests/*.test.cjs`.
New regression cases cover URL state, row isolation and deletion, ownership,
payroll isolation, company reconciliation, per-vehicle cross-month statistics,
and independent leases in company costs and tax calculations.

Browser runner: `node scripts/test-admin-workspace-ui.cjs` with configured local
Playwright/Chrome. It bundles the real WorkspaceView, mocks only the session/router
and HTTP data store, and runs synthetic data at 320, 390 and 1280 px. It covers
navigation, reload, serial ordinary/fleet writes, error handling, vehicle setup,
driver-specific expenses/fuel, company cash consistency and the classic layout.
Screenshots are local under `tmp/invoice-ui/admin-workspace/` (not production data).

Existing fleet and read-only preview browser suites must also stay passing. Build,
lint and TypeScript are required. No production workspace or private document is
modified by these tests. A local build is not evidence of deployment to Vercel.

Verified for this change:

- 118 unit/regression tests passed.
- `npm run lint`, `npx tsc --noEmit` and `npm run build` passed.
- New workspace UI, existing fleet UI and read-only preview UI passed at 320/390/1280 px.
- New workspace tests also checked 503 retry, stale-revision rejection, targeted
  undo preserving unrelated expenses, and opening the classic layout.
- Local dev server restarted on port 3000; unauthenticated `/admin` returns 307
  to login. Authenticated writes were tested only against the synthetic HTTP store.
- This navigation verification preceded release; current deployment is tracked
  by the Vercel status of the GitHub commit as described above.

## Company taxes: combined drivers (2026-11-17)

The company tax engine and operating result already included both drivers, but
the annual payments list in `PodatkiDoZaplatyTab` omitted Rafal's payroll charges.
The list now uses `companyTaxLiabilities`, shared with the monthly statement and
`PodatkiCard`. VAT payable and carry are taken directly from `podatkiRoku` rather
than recomputed by the view.

The Taxes tab now starts with the selected month's company statement: combined
driver payouts, fuel for both vehicles, other expenses, both leases, all tax and
payroll liabilities, and final cash. A collapsed breakdown shows each driver's
payroll charges, operating costs and deductible payroll costs. Main Summary and
its tax card also show one combined payout row with the individual amounts below.
Changing a driver record updates these views from the same workspace state.

Cash reconciliation: gross revenue minus both net payouts, purchase costs and
all liabilities equals final cash. Employee charges belong in operating costs,
but in this cash table they are subtracted only in the liabilities row, never
again as part of payouts. Deductible payroll costs retain the existing contract
rules; this UI change does not change payroll or tax rates, stored financial
records, authorization, paid markers or database schema.

Files for this follow-up:

- `src/lib/company-settlement.ts`
- `src/components/admin/CompanyTaxSummary.tsx`
- `src/components/tabs/PodatkiDoZaplatyTab.tsx`
- `src/components/tabs/PodsumowanieTab.tsx`
- `src/components/PodatkiCard.tsx`
- `src/components/WorkspaceView.tsx`
- `tests/company-settlement.test.cjs`
- `scripts/test-admin-workspace-ui.cjs`
- `docs/ADMIN_NAVIGATION.md`

Verification: 124 unit/regression tests, lint, TypeScript and production
build passed. Six new cases cover both payrolls, annual/monthly consistency,
month isolation, changing payouts, pending versus approved costs for either
driver, and VAT carry. The workspace browser suite passed at 320/390/1280 px,
including selected June/November values, annual liabilities, paid-marker save
without accounting side effects, cash consistency, and responsive screenshots.
Existing fleet and read-only preview suites also passed at all three widths.
Tests use synthetic records and do not access production data. These checks
preceded release; verify the current production commit through GitHub/Vercel.
