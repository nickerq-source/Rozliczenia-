# PapiTrans: writable driver panel

Implemented 2026-11-17. Entry: `/admin/flota`, linked as "Menu glowne i kierowcy"
from the existing admin header. `/admin` and read-only `/admin/podglad` remain.

## Behaviour

- Admins can save and edit Rafal's days separately for each month June-December
  2026: work, work+orders, paid leave, standby, off. Course accrual is 90 PLN net,
  standby 50 PLN net; leave and order amounts are explicitly entered. Missing
  amounts stay incomplete, not invented zeroes. Zenia's days remain unchanged.
- The new company invoice importer selects Yevhenii Pitianin and Rafal Gustab
  from the driver column, including Polish diacritics, not notes or routes.
  Accepted rows have separate driver summaries but one company invoice total.
  Existing invoices are not silently recalculated. "Popraw podzial zapisanej
  faktury" loads source rows, shows a revised total and asks for confirmation.
- Import does not fill days or add wages. Same-period supplements coexist;
  repeated order IDs are checked across all saved months and driver scopes.
  Uncertain rows must be corrected or explicitly excluded before saving.
- The legacy import retains its explicit single-driver filter. Use the new
  shared importer for both drivers. Old invoices without source rows need
  re-upload; no fuzzy reassignment of historical financial amounts.
- Owner correction: no monthly payslip entry should be required. Rafal's default
  employment model now automatically estimates tax and contributions from the
  2026 minimum wage of 4806 PLN gross, for one full-time/full-month employment
  contract. The owner confirmed its start as November 2026. November and December
  accrue the fixed payroll even with no calendar entries or only off days.
  Days never activate/deactivate payroll. Earlier months remain inactive unless
  they have explicit contract settings or a manually entered payslip.
  The collapsed settings can explicitly activate/deactivate the contract.
- The main driver amount is earned net from days/courses, not the contract floor.
  Cash payout = max(day accrual, contract net); additional payout = max(0, accrual
  - contract net). Cash cost = payout + employee deductions + employer charges.
  Tax cost = contract gross + employer contributions, counted once. The automatic
  tax-cost checkbox defaults on; it can be disabled for a month. Missing day
  amounts remain flagged. The automatic full-month estimate is labelled as such.
- The remaining payout belongs to another contract in the owner's other company.
  The owner explicitly confirmed that ALL the earned payout still reduces the
  PapiTrans management cash result. Do not calculate the other contract's taxes,
  contributions or deductions here. Do not turn that management allocation into
  an extra tax deduction or represent this dashboard as a statutory payroll.
- Existing manually saved payslips are not overwritten. They remain the source
  until "Najniższa krajowa" is selected in monthly contract settings. Switching
  modes is audited and reversible; the original manual record stays intact.
  Manual mode remains available for exceptions (including part-month/PPK cases).
- Existing company summary, tax details, final cash and report calculations now
  include Rafal separately. Legacy Zenia-only fields keep their original meaning.
  VAT does not change because of payroll. Unassigned vehicle costs remain company
  expenses; this implementation does not guess driver profitability from a plate.
- No new driver login/account was created. Driver self-service endpoints remain
  unchanged in scope; the new panel/API allow admins only, under workspace RLS.

## Data and safety

Additive JSONB fields in `workspaces.data`:

```
miesiace[month].rafal = { days: FleetDay[], payroll?: RafalPayroll,
                        payrollSettings?: RafalPayrollSettings }
fleetHistory = [{ id, at, actor, month, kind, target, before, after,
                  description, undoneAt?, undoneBy? }]
PDFImportFilter.driverNames = ["YEVHENII PITIANIN", "RAFAL GUSTAB"]
```

No SQL migration or database reset. `/api/admin/fleet` derives workspace from
the session, checks admin role, validates input, recomputes invoice totals, rejects
locked months, and commits data+audit/undo entry together. History lives in the
protected workspace, not the legacy audit_log table. No history retention deletion.
History contains payroll/source data; do not publish workspace snapshots.

All read-modify-write workspace paths now compare `updated_at`. Stale admin
clients require reload (409), not last-write-wins. Legacy autosaves are serialized,
do not write immediately after loading, preserve additive fields and cannot
overwrite Rafal's separately audited data. Other driver/cron writers also compare
revisions so they cannot erase a concurrent save. Cron notifications follow the
successful write; a concurrent cron update is skipped rather than overwriting data.

## Rollback

1. UI rollback: select "Wroc do obecnego panelu". This preserves all data and
   continues to include saved Rafal costs in company totals.
2. Data rollback: "Historia zmian i cofanie" reverses the latest un-reversed
   operation after confirmation, retaining the audit record. It only restores the
   affected day, payslip, contract settings or invoice; unrelated changes remain. Closed months and
   externally modified targets cannot be undone until explicitly reconciled.
3. Code rollback: do NOT blindly redeploy the old read-only build after live data
   exists: it lacks Rafal accounting and revision guards. First export a private
   workspace backup, reconcile or undo live mutations, then revert this dedicated
   commit or disable only the new entry point. Never delete JSONB fields or reset
   the whole working tree. Private fixtures and unrelated work are present locally.

## Verification

Tests use synthetic data only; no production payroll or invoice records are
modified. Minimum-wage regression tests supplement the prior payout tests.
2026-11-17 verification: 110 tests, lint, TypeScript and production build passed;
both browser suites passed at 320/390/1280px. Production-authenticated data writes
were not exercised.

- `node --experimental-strip-types --test tests/*.test.mjs tests/*.test.cjs`
- `npx tsc --noEmit`, `npm run lint`, `npm run build`
- `node scripts/test-fleet-ui.cjs`: real components, synthetic local API;
  320/390/1280px, reload persistence, undo, failure/conflict, shared invoice
  allocation, automatic minimum-wage charges, PIT-2 settings and manual fallback.
  Screenshots: `tmp/invoice-ui/fleet` (untracked).
- Regression: 4500 PLN day accrual and 3500 PLN payslip net produce 4500 PLN
  full payout (3500 + 1000 remaining), not 3500 or 8000. With entered charges of
  2500 PLN, cash cost is 7000 PLN. Confirmed payslip tax cost remains 6000 PLN.
  Editing days updates company costs and final cash without changing entered
  charges, company tax calculations or VAT. Undo restores the prior amounts.
- `node scripts/test-admin-preview-ui.cjs`: old read-only preview, navigation,
  isolation and no application writes.

## Rafal: full-month calendar (2026-11-17)

The main admin driver profile (`/admin?menu=kierowcy&kierowca=rafal&widok=wyplata`)
now renders `RafalWorkCalendar`, not the one-day preview editor. Every calendar
day is editable in place, including empty days; November has 30 and December 31.
Statuses: work, work plus orders, paid leave, standby, off. Course rate remains
90 PLN net, standby 50 PLN, and leave/order amounts stay explicit. Each day has
an expandable comment. No changes to Zenia's calendar, payroll rates or tax model.

`Zapisz dni` submits only edited dates as one `kind: days` fleet command. The
server validates the entire batch before applying any part, rejects duplicates
and wrong-month dates, and reuses existing admin/RLS/revision/closed-month checks.
One audit event stores before/after maps for the touched dates. Undo restores
only those dates, keeping other days, driver records, invoices and payroll intact.
The previous one-day `day` command and `/admin/flota` editor remain supported.

At the foot of the calendar, the monthly statement shows day accrual, employment
contract net, remaining payout, any top-up to the contract net floor, full payout,
contract tax/contributions and total management cash cost. The official/remnant
split subtracts NET contract pay, not the gross minimum wage. It does not invent
tax calculations for the owner's other company/contract. Company tax cost is
still the confirmed/estimated employment contract amount from the existing model.
Missing leave/order amounts remain explicitly incomplete.

Unsaved edits preview the totals with an explicit unsaved marker; the company
result changes only after successful save. A failed request retains the form.
Drafts are scoped by workspace and month in sessionStorage (same browser tab),
restored on return/reload, and cleared only on confirmed save or confirmed discard.
A changed saved day blocks restoration-overwrite until the user discards the old
draft. A recovery copy matching already-saved values is dropped as acknowledged.
Invalid numeric drafts cannot crash financial previews or bypass server validation.

Recovery: use the existing confirmed history undo to revert the last batch.
For UI-only rollback, use `/admin/flota` with the current backend. Do not deploy
an older backend that does not recognize `FleetHistoryEntry.kind = days` while
batch history exists; it cannot correctly interpret or undo those records.
No schema migration, data cleanup or production data write was performed.

Changed files for the calendar:

- `src/components/admin/RafalWorkCalendar.tsx`
- `src/components/admin/DriverWorkspace.tsx`
- `src/components/admin-preview/admin-preview.css`
- `src/lib/rafal-calendar.ts`
- `src/lib/fleet.ts`
- `src/lib/fleet-commands.ts`
- `tests/rafal-calendar.test.cjs`
- `scripts/test-admin-workspace-ui.cjs`
- `docs/FLEET_LIVE.md`

Regression coverage: full-month atomic save, one audit event, surgical undo,
validation failure without partial writes, closed months, month/driver isolation,
all statuses and missing amounts, recovery/conflicting drafts, net pay split and
company cash consistency. Workspace browser tests cover the real calendar with
a synthetic local API at 320, 390 and 1280 px, including failed/stale saves,
30/31-day months, comments, draft restoration after switching month/reloading,
explicit discard, locked inputs and the company tax totals after saving days.

Verified: 129 unit/regression tests, `npm run lint`, `npx tsc --noEmit`,
`npm run build`, and all three workspace/fleet/read-only-preview browser suites
passed (320/390/1280 px). Screenshots were inspected on mobile and desktop.
Authenticated production writes were not tested. These checks preceded release;
production delivery and verification are described in `ADMIN_NAVIGATION.md`.
- API tests use mocked session/Supabase boundaries: no session, non-admin,
  own-workspace scoping, stale revision, race, write failure and legacy preservation.
- No test writes to production payroll or actual customer invoices. Authenticated
  production persistence/RLS still requires an actual admin-session check. This
  is a bounded minimum-wage planning calculator, not certified statutory payroll.

Browser tests accept `PLAYWRIGHT_MODULE` and `PLAYWRIGHT_EXECUTABLE`. Build must
run without a concurrent Next dev server writing `.next`.

## Minimum-wage model (2026)

`src/lib/minimum-payroll.ts` is intentionally scoped to the app's 2026 period.
Full-time/full-month, no PPK, no tax exemptions, no sickness/partial-month
proration or annual social-contribution cap aggregation across employers.
Leave amounts remain explicit daily inputs as previously requested.

Defaults: employee withholding 12%, employment expense allowance 250 PLN,
Rafal's PIT-2 reduction 300 PLN (explicitly confirmed by the owner on 2026-11-17), accident
contribution 1.67%, FP+FS and FGSP enabled. The monthly collapsed settings allow
PIT-2 0/100/150/300, costs 0/250/300, withholding 12/32 and employer-specific
accident/fund options. They do not change the owner's business income-tax rate.

The Rafal-specific default lives in `rafalPayrollSettings`; the generic payroll
calculator still defaults to no PIT-2. Saved monthly settings, including an
explicit zero, and manual payslips take precedence. The month is a required input
to both `rafalPayrollSettings` and `rafalMonthCost`; it must not be inferred from
the first day, current date or the presence of a Rafal record. Default contract
activation starts in November 2026, independently of calendar contents.
At default rates this gives 3605.85 PLN contract net and 168 PLN withholding.
The payout split and company settlement use the same `rafalMonthCost` result.
Changing PIT-2 does not change gross salary, employer contributions or deductible
contract cost. At the minimum net floor, the extra 300 PLN net offsets the lower
withholding, so total employment cost is unchanged. Above both net floors the
full accrued payout stays fixed, the remainder and charges fall by 300 PLN,
and company cash increases by 300 PLN. Regression tests cover both cases and
the interval between the two floors, persisted settings and undo.

## Fixed contract from November (2026-11-17)

Owner confirmation: "Od listopada 2026". Without explicit monthly overrides,
November and December include 3605.85 PLN contract net, 2184.43 PLN employee
deductions plus employer contributions, and 5790.28 PLN employment/tax cost even
before any workdays are saved. Calendar edits and undo affect only earned pay
and its remainder above contract net; they cannot switch these charges off.
June-October do not automatically receive the contract. Existing manual payslips
and explicit monthly enable/disable settings remain intact and reversible through
the existing audited fleet settings command.

Both the company tax and cash engines, the contract view and calendar preview
pass the selected month to the same calculation. Fixed contract costs alone do
not activate the legacy 2300 PLN lease default: a blank month has the Rafal
contract, not an invented vehicle expense. No DB migration or production write.

Changed files: `src/lib/fleet.ts`, `src/lib/business-logic.ts`, `src/lib/tax.ts`,
`src/components/admin-preview/FleetPanel.tsx`,
`src/components/admin/RafalWorkCalendar.tsx`, `tests/fleet.test.cjs`,
`tests/rafal-calendar.test.cjs`, `tests/company-settlement.test.cjs`,
`scripts/test-admin-workspace-ui.cjs`, `scripts/test-fleet-ui.cjs`, this document.

Verification for this correction: 133 unit/regression tests, lint, TypeScript
and production build passed. Workspace and fleet browser suites passed at
320/390/1280 px, including blank November/December, fixed charges after undo,
PIT-2 settings persistence and matching company totals. The blank-calendar
mobile summary screenshot was inspected. Synthetic test data only; no production
write. Deployment status must be checked separately through GitHub/Vercel.
Local dev server restarted on port 3000.

Each contribution is rounded separately to grosze. Income-tax base and the
advance are rounded to whole PLN. Golden values:

| Item | Amount (PLN) |
| --- | ---: |
| Gross | 4806.00 |
| Employee social: pension/disability/sickness | 469.07 / 72.09 / 117.75 |
| Employee social total | 658.91 |
| Health base / contribution | 4147.09 / 373.24 |
| Tax base | 3897 |
| Income tax, without PIT-2 / with 300 PLN PIT-2 | 468 / 168 |
| Contract net, without PIT-2 / with 300 PLN PIT-2 | 3305.85 / 3605.85 |
| Employer contributions including FP+FS/FGSP | 984.28 |
| Contract employer cost / default tax cost | 5790.28 |

Primary sources verified 2026-11-17:
- [Minimum wage, 2026 regulation](https://eli.gov.pl/eli/DU/2025/1242/ogl/pol/pdf).
- [ZUS social rates and financing](https://www.zus.pl/firmy/rozliczenia-z-zus/skladki-na-ubezpieczenia/spoleczne).
- [ZUS health base](https://bip.zus.pl/pl/web/guest/pracujacy/ubezpieczenie-zdrowotne-w-polsce/podstawa-wymiaru-skladek-na-ubezpieczenie-zdrowotne) and [9% rate](https://www.zus.pl/pl/firmy/rozliczenia-z-zus/skladki-na-ubezpieczenia/zdrowotne).
- [ZUS DRA 2026 FP/FS/FGSP examples](https://www.zus.pl/documents/10182/167567/poradnik%2BZUS%2BDRA.pdf/8b7a1ca0-6145-ae37-d90a-a74871de6ca7).
- [ZUS accident-rate guidance](https://www.zus.pl/-/z%C5%82%C3%B3%C5%BC-informacj%C4%99-zus-iwa-o-danych-do-ustalenia-stopy-procentowej-sk%C5%82adki-na-ubezpieczenie-wypadkowe).
- [MF employment costs and tax scale](https://podatki.gov.pl/podatki-osobiste/pit/informacje-podstawowe/co-jest-opodatkowane/dochody-z-pracy).
- [MF PIT-2 split among payers](https://podatki.gov.pl/poradniki-i-informatory/pit-2-pit-2a-pit-3-zasady-skladania-oswiadczen-o-stosowaniu-pomniejszenia-zaliczki-o-kwote-zmniejszajaca-podatek-112-124-lub-136).
- [Tax Ordinance, art. 63 rounding](https://isap.sejm.gov.pl/isap.Nsf/download.xsp/WDU20220002651/U/D20222651Lj.pdf).

Automatic payroll change files: `src/lib/minimum-payroll.ts`, `src/lib/fleet.ts`,
`src/lib/fleet-commands.ts`, `FleetPanel.tsx`, `PreviewDriver.tsx`, `AdminPreview.tsx`,
`PodatkiCard.tsx`, tabs `PodsumowanieTab.tsx`, `KosztyTab.tsx`, `RaportTab.tsx`,
`tests/minimum-payroll.test.cjs`, `tests/fleet.test.cjs`, `scripts/test-fleet-ui.cjs`
and this document. No database migration or changes to other drivers' rates.

## Changed files

New implementation:
- `src/app/admin/flota/page.tsx`
- `src/app/api/admin/fleet/route.ts`
- `src/components/admin-preview/FleetPanel.tsx`
- `src/lib/fleet.ts`
- `src/lib/fleet-commands.ts`
- `src/lib/driver-identity.ts`

Shared UI, calculation, import and types:
- `src/components/admin-preview/AdminPreview.tsx`
- `src/components/admin-preview/PreviewDriver.tsx`
- `src/components/admin-preview/admin-preview.css`
- `src/components/AppHeader.tsx`
- `src/components/ImportModal.tsx`
- `src/components/PodatkiCard.tsx`
- `src/components/tabs/PodsumowanieTab.tsx`
- `src/components/tabs/KosztyTab.tsx`
- `src/components/tabs/RaportTab.tsx`
- `src/components/ui/SaveStatus.tsx`
- `src/lib/admin-preview.ts`
- `src/lib/business-logic.ts`
- `src/lib/tax.ts`
- `src/lib/types.ts`
- `src/lib/invoice-import.ts`
- `src/lib/invoice-settlement.ts`
- `src/lib/invoice-table.ts`
- `src/app/api/import-invoice/route.ts`

Concurrent-save protection:
- `src/hooks/useWorkspace.ts`
- `src/app/api/workspace/[token]/route.ts`
- `src/app/api/driver/fuel/route.ts`
- `src/app/api/driver/notes/route.ts`
- `src/app/api/driver/verify/route.ts`
- `src/app/api/admin/recalculate-fuel/route.ts`
- `src/app/api/cron/auto-pay-invoices/route.ts`
- `src/app/api/cron/note-reminders/route.ts`

Tests and handoff:
- `tests/fleet.test.cjs`
- `tests/fleet-harness.tsx`
- `tests/fixtures/fleet.ts`
- `scripts/test-fleet-ui.cjs`
- `docs/ADMIN_PREVIEW.md`
- `docs/FLEET_LIVE.md`
