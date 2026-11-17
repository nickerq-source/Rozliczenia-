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
- Manual official payslip: gross, net, employee tax/health/social contributions,
  employer contributions, other deductions, document reference, and a checkbox
  confirming tax recognition in this month. Gross must reconcile with net and
  employee deductions. Tax cost is gross+employer contributions, never net plus
  gross or employee deductions counted twice. Tax recognition timing is an
  accountant-confirmed input, not inferred by this app.
- Before payslip entry, positive daily accrual is an incomplete cash-cost estimate.
  Payslip net is part of the full payout, not a replacement that can discard the
  remainder. Full payout = max(daily accrual, payslip net); remaining payout =
  max(0, daily accrual - payslip net). Total cash cost = full payout + entered
  payslip charges. A payslip above existing daily accrual or missing day amounts
  still requires reconciliation. A payslip without any days remains usable.
- Per the owner's clarification, the remaining payout is under another contract;
  do not infer its terms or automatically gross it up / calculate extra taxes or
  contributions. Only entered payslip amounts determine charges and confirmed
  tax costs. This is a manual-data calculation, not a tax-exemption assessment.
  No additional contract form or automatic payroll tax engine was requested.
- Existing company summary, tax details, final cash and report calculations now
  include Rafal separately. Legacy Zenia-only fields keep their original meaning.
  VAT does not change because of payroll. Unassigned vehicle costs remain company
  expenses; this implementation does not guess driver profitability from a plate.
- No new driver login/account was created. Driver self-service endpoints remain
  unchanged in scope; the new panel/API allow admins only, under workspace RLS.

## Data and safety

Additive JSONB fields in `workspaces.data`:

```
miesiace[month].rafal = { days: FleetDay[], payroll?: RafalPayroll }
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
   affected day, payslip or invoice; unrelated changes remain. Closed months and
   externally modified targets cannot be undone until explicitly reconciled.
3. Code rollback: do NOT blindly redeploy the old read-only build after live data
   exists: it lacks Rafal accounting and revision guards. First export a private
   workspace backup, reconcile or undo live mutations, then revert this dedicated
   commit or disable only the new entry point. Never delete JSONB fields or reset
   the whole working tree. Private fixtures and unrelated work are present locally.

## Verification

Payout correction verified on 2026-11-17: 103 tests passed, TypeScript, lint,
production build and both browser suites passed. Tests use synthetic data only;
no production payroll or invoice records were modified.

- `node --experimental-strip-types --test tests/*.test.mjs tests/*.test.cjs`
- `npx tsc --noEmit`, `npm run lint`, `npm run build`
- `node scripts/test-fleet-ui.cjs`: real components, synthetic local API;
  320/390/1280px, reload persistence, undo, failure/conflict, shared invoice
  allocation and payslip save. Screenshots: `tmp/invoice-ui/fleet` (untracked).
- Regression: 4500 PLN day accrual and 3500 PLN payslip net produce 4500 PLN
  full payout (3500 + 1000 remaining), not 3500 or 8000. With entered charges of
  2500 PLN, cash cost is 7000 PLN. Confirmed payslip tax cost remains 6000 PLN.
  Editing days updates company costs and final cash without changing entered
  charges, company tax calculations or VAT. Undo restores the prior amounts.
- `node scripts/test-admin-preview-ui.cjs`: old read-only preview, navigation,
  isolation and no application writes.
- API tests use mocked session/Supabase boundaries: no session, non-admin,
  own-workspace scoping, stale revision, race, write failure and legacy preservation.
- No test writes to production payroll or actual customer invoices. Authenticated
  production persistence/RLS still requires an actual admin-session check. Statutory
  payroll/minimum-wage calculations are NOT implemented or certified here.

Browser tests accept `PLAYWRIGHT_MODULE` and `PLAYWRIGHT_EXECUTABLE`. Build must
run without a concurrent Next dev server writing `.next`.

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
