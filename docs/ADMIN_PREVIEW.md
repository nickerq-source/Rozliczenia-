# PapiTrans admin preview

Added 2026-11-17. This is a reversible, admin-only UI trial at
`/admin/podglad`. The default `/admin` panel, financial formulas, PDF import,
driver accounts and database schema remain unchanged. The only entry added
to the existing UI is a preview link in `AppHeader.tsx`.

## Scope and data boundaries

- Two top-level areas: company main menu and Drivers. The earlier five-tab
  layout was rejected by the user and replaced on 2026-11-17.
- Company menu: company result, shared invoices, all purchases, taxes,
  logistics, partner settlement, reports, shared messages and company settings.
- Drivers: choose Yevhenii Pitianin or Rafal Gustab. Both profiles use the
  same overview, days/payroll, invoice items, fuel submissions and employment
  sections. The full-month payroll table follows the existing Zenia layout.
- Driver invoice views sum only explicit matched identities in accepted saved
  PDF rows (excluding review-needed rows) and assigned invoice additions.
  Unassigned/manual invoice amounts stay in the company view. These are
  partial revenue allocations, not driver wages or a duplicate company income.
- Fuel views use explicit submission author only, not vehicle/route/name
  guesses. Unassigned vehicle costs, leasing and tax remain in the company menu.
- Server reads the authenticated admin's workspace with the session-scoped
  Supabase client. Existing RLS applies; no service-role client is used.
- Existing financial data is read-only, normalized in a detached copy and
  calculated with the same business/tax/invoice/logistics functions as `/admin`.
  No alternative tax or payroll engine is introduced.
- Do not import `useWorkspace` into this preview: it autosaves. The preview
  has no API writes, local/session storage, uploads or audit mutations.
- Missing saved months and failed reads are not presented as real zero results.
- Existing import, approval, editing and export workflows remain in `/admin`;
  links preserve the selected month and open the appropriate legacy section.
- Month, section, selected driver and cost filters use the URL and browser
  history. Trial day edits remain in memory only; leaving warns about their loss.

## Rafal trial

Rafal Gustab is a separate test profile, not a production driver account.
Test work is 90 PLN net per course. Standby uses the requested 50 PLN net
assumption; lawful payroll values still need payroll confirmation. Paid leave
uses an explicitly supplied net amount from payroll, not an invented rate.
Work plus orders requires a manually supplied order amount; a missing amount
produces an incomplete result. An explicit zero is distinct from missing data.

These trial values never affect company cash, invoices, tax or Zenia's wages.
The eventual employment implementation requires official payroll, minimum-wage
and employer-cost handling, driver-scoped data/RLS and mixed-invoice allocation.
It must not add an off-the-books wage workflow. None of this future functionality
is represented as finished by this preview.

## Files

- `src/app/admin/podglad/page.tsx`: admin gate and read-only loading.
- `src/lib/admin-preview.ts`: detached snapshot, navigation and trial values.
- `src/components/admin-preview/AdminPreview.tsx`: compact read-only views.
- `src/components/admin-preview/PreviewDriver.tsx`: driver view and memory trial.
- `src/components/admin-preview/admin-preview.css`: isolated responsive styles.
- `src/components/AppHeader.tsx`: optional preview entry link.
- `tests/admin-preview.test.cjs`: calculator, role and isolation checks.
- `tests/fixtures/admin-preview.ts`: synthetic data only.
- `tests/admin-preview-harness.tsx`: isolated real-component browser mount.
- `scripts/test-admin-preview-ui.cjs`: 320/390/1280px browser checks.
- `tests/helpers/webpack-ts.cjs`: TypeScript loader for the isolated UI harness.

## Verification commands

```powershell
node --experimental-strip-types --test tests/admin-preview.test.cjs
node --experimental-strip-types --test tests/*.test.mjs tests/*.test.cjs
npx tsc --noEmit
npm run lint
npm run build
node scripts/test-admin-preview-ui.cjs
```

The browser runner accepts `PLAYWRIGHT_MODULE` (installed module path) and
`PLAYWRIGHT_EXECUTABLE` (Chrome executable) when Playwright is not a local
dependency. It uses synthetic data and writes screenshots under
`tmp/invoice-ui/admin-preview`; do not commit its generated bundle or images.
It checks responsive overflow, navigation/back/filter state, trial isolation,
missing-month states and absence of application API/storage writes. Known host
antivirus telemetry is counted separately, not treated as an application write.
This does not replace an authenticated end-to-end production test with live data.

## Rollback

For everyday use, select "Wroc do obecnego panelu"; `/admin` is still default.
For code rollback, revert only the dedicated preview commits after checking
for later changes, then redeploy. No database rollback or financial recalculation
is needed because the preview performs no business-data writes. Do not reset the
entire working tree: it also contains unrelated work and private invoice fixtures.
