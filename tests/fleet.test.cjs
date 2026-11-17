/* eslint-disable @typescript-eslint/no-require-imports -- Node TS test harness. */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");
require("./helpers/register-ts.cjs");
const commands = require("../src/lib/fleet-commands.ts");
const { rafalMonthCost, rafalPayrollSettings } = require("../src/lib/fleet.ts");
const { obliczWynikMiesiaca } = require("../src/lib/business-logic.ts");
const { previewDriverEntries } = require("../src/lib/admin-preview.ts");
const { podatkiMiesiaca, getUstawienia } = require("../src/lib/tax.ts");
const { previewFixture } = require("./fixtures/admin-preview.ts");
const { fleetInvoiceFixture } = require("./fixtures/fleet.ts");
const fixture = () => structuredClone(previewFixture);
const day = { date: "2026-11-03", status: "praca", courses: 3, ordersNet: null, leaveNet: null, note: "Test" };
const payroll = { gross: 5000, net: 3500, employeeIncomeTax: 500, employeeHealth: 400, employeeSocial: 600, employerContributions: 1000, otherDeductions: 0, reference: "TEST-11", deductibleThisMonth: true };
let seq = 0;
const apply = (data, command) => commands.applyFleetCommand(data, command, "Test admin", `change-${++seq}`, "2026-11-17T12:00:00Z").data;
const invoice = { kind: "invoice", month: 11, preview: fleetInvoiceFixture, fileName: "synthetic.pdf", number: "TEST-1" };

test("saved days survive JSON reload, months and drivers remain isolated; targeted undo", () => {
  const source = fixture();
  const saved = JSON.parse(JSON.stringify(apply(source, { kind: "day", month: 11, day })));
  assert.deepEqual(saved.miesiace[11].rafal.days, [day]);
  assert.deepEqual(saved.miesiace[11].dni, source.miesiace[11].dni);
  assert.deepEqual(saved.miesiace[6], source.miesiace[6]);
  assert.equal(source.miesiace[11].rafal, undefined);
  saved.notatki.push({ id: "unrelated" });
  const undone = apply(saved, { kind: "undo", id: saved.fleetHistory.at(-1).id });
  assert.deepEqual(undone.miesiace[11].rafal.days, []);
  assert.equal(undone.notatki.at(-1).id, "unrelated");
  assert.equal(undone.fleetHistory.at(-1).undoneBy, "Test admin");
});
test("day editing replaces same date, rejects invalid numbers, wrong month and closed month", () => {
  const saved = apply(fixture(), { kind: "day", month: 11, day });
  const edited = apply(saved, { kind: "day", month: 11, day: { ...day, courses: 4 } });
  assert.equal(edited.miesiace[11].rafal.days.length, 1);
  for (const patch of [{ courses: -1 }, { courses: 1.5 }, { leaveNet: Infinity }, { ordersNet: 1.234 }, { date: "2026-10-03" }, { status: "invalid" }]) {
    assert.throws(() => apply(saved, { kind: "day", month: 11, day: { ...day, ...patch } }), commands.FleetInputError);
  }
  saved.miesiace[11].zamkniety = { locked: true };
  assert.throws(() => apply(saved, { kind: "day", month: 11, day }), /zamknięty/);
  assert.throws(() => apply(saved, { kind: "undo", id: saved.fleetHistory.at(-1).id }), /zamknięty/);
});
test("undo refuses out-of-order and later external modification", () => {
  const saved = apply(apply(fixture(), { kind: "day", month: 11, day }), { kind: "day", month: 11, day: { ...day, date: "2026-11-04" } });
  assert.throws(() => apply(saved, { kind: "undo", id: saved.fleetHistory[0].id }), /ostatnią/);
  saved.miesiace[11].rafal.days[1].courses = 6;
  assert.throws(() => apply(saved, { kind: "undo", id: saved.fleetHistory.at(-1).id }), /później/);
});
test("days do not trigger payroll or add minimum wage twice; explicit payslip remains usable", () => {
  const source = fixture(), u = getUstawienia(source);
  const old = obliczWynikMiesiaca(11, source.miesiace[11], u), oldTax = podatkiMiesiaca(source, 11);
  const saved = apply(source, { kind: "day", month: 11, day });
  const estimate = obliczWynikMiesiaca(11, saved.miesiace[11], u);
  assert.equal(estimate.rafal.calculated, 270);
  assert.equal(estimate.rafal.payout, 3605.85);
  assert.equal(estimate.rafal.incomplete, false);
  assert.equal(estimate.rafal.estimated, true);
  assert.equal(old.rafal.total, 5790.28);
  assert.equal(estimate.kosztyOperacyjne, old.kosztyOperacyjne);
  assert.equal(podatkiMiesiaca(saved, 11).kosztyPodatkowe, oldTax.kosztyPodatkowe);
  const official = apply(saved, { kind: "payroll", month: 11, payroll });
  const result = obliczWynikMiesiaca(11, official.miesiace[11], u), tax = podatkiMiesiaca(official, 11);
  assert.equal(result.rafal.payout, 3500);
  assert.equal(result.rafal.total, 6000);
  assert.equal(Math.round(result.kosztyOperacyjne * 100), Math.round(old.kosztyOperacyjne * 100) + 20972);
  assert.equal(Math.round(tax.kosztyPodatkowe * 100), Math.round(oldTax.kosztyPodatkowe * 100) + 20972);
  assert.equal(tax.zyskPrzedPodatkami, result.zysk);
  assert.equal(tax.rafal.incomplete, true, "unreconciled payslip cannot be presented as final");
  assert.ok(Math.abs(tax.cashflowPoPodatkach - (result.zysk - tax.pitMiesiac - tax.zdrowotna - Math.max(0, tax.vatDoZaplaty))) < .01);
  assert.equal(rafalMonthCost(11, { rafal: { days: [], payroll } }).taxCost, 6000);
  assert.equal(rafalMonthCost(11, { rafal: { days: [], payroll: { ...payroll, deductibleThisMonth: false } } }).taxCost, 0);
  assert.throws(() => commands.validatePayroll({ ...payroll, gross: 5001 }), /Brutto/);
});

test("automatic payroll settings persist, audit and undo without changing days or stored payslip", () => {
  const source = apply(fixture(), { kind: "day", month: 11, day: { ...day, courses: 50 } });
  source.miesiace[11].rafal.payrollSettings = { ...rafalPayrollSettings(11, source.miesiace[11]), taxReduction: 0 };
  const before = rafalMonthCost(11, source.miesiace[11]);
  assert.equal(before.payroll.employeeIncomeTax, 468);
  assert.equal(before.charges, 2484.43);
  assert.equal(before.payout, 4500);
  const settings = { ...rafalPayrollSettings(11, source.miesiace[11]), taxReduction: 300 };
  const saved = JSON.parse(JSON.stringify(apply(source, { kind: "payrollSettings", month: 11, settings })));
  const after = rafalMonthCost(11, saved.miesiace[11]);
  assert.equal(after.payroll.employeeIncomeTax, 168);
  assert.equal(after.payrollNet, 3605.85);
  assert.equal(after.additionalPayout, 894.15);
  assert.equal(after.payout, 4500);
  assert.equal(after.charges, 2184.43);
  assert.equal(after.total, 6684.43);
  assert.equal(after.taxCost, 5790.28);
  assert.equal(saved.miesiace[11].rafal.payroll, undefined, "calculation does not fabricate a saved payslip");
  assert.deepEqual(saved.miesiace[11].rafal.days, source.miesiace[11].rafal.days);
  assert.deepEqual(saved.miesiace[6], source.miesiace[6]);
  const undone = apply(saved, { kind: "undo", id: saved.fleetHistory.at(-1).id });
  assert.deepEqual(rafalMonthCost(11, undone.miesiace[11]), before);
  assert.equal(saved.fleetHistory.at(-1).kind, "payrollSettings");
});

test("Rafal defaults to PIT-2 300 without activating months before November or replacing saved settings", () => {
  const empty = rafalMonthCost(10, {});
  assert.equal(empty.settings.taxReduction, 300);
  assert.equal(empty.minimumCalculation.net, 3605.85);
  assert.equal(empty.minimumCalculation.employeeIncomeTax, 168);
  assert.equal(empty.payout, 0);
  assert.equal(empty.charges, 0);
  assert.equal(empty.total, 0);
  const settings = { ...empty.settings, enabled: true, taxReduction: 0 };
  const explicit = rafalMonthCost(11, { rafal: { days: [], payrollSettings: settings } });
  assert.equal(explicit.payrollNet, 3305.85);
  assert.deepEqual(explicit.settings, settings);
  const manual = rafalMonthCost(11, { rafal: { days: [], payroll } });
  assert.equal(manual.settings.mode, "manual");
  assert.deepEqual(manual.payroll, payroll);
});

test("minimum-wage charges and tax cost do not rise with courses; all extra payout reduces final cash", () => {
  const source = apply(fixture(), { kind: "day", month: 11, day: { ...day, courses: 50 } });
  const before = podatkiMiesiaca(source, 11);
  const saved = apply(source, { kind: "day", month: 11, day: { ...day, courses: 60 } });
  const after = podatkiMiesiaca(saved, 11);
  assert.equal(after.rafal.calculated, 5400);
  assert.equal(after.rafal.payout, 5400);
  assert.equal(after.rafal.charges, before.rafal.charges);
  assert.equal(Math.round(after.cashflowPoPodatkach * 100), Math.round(before.cashflowPoPodatkach * 100) - 90000);
  for (const field of ["kosztyPodatkowe", "pitMiesiac", "zdrowotna", "vatDoZaplaty"]) assert.equal(after[field], before[field]);
  assert.equal(after.zyskPrzedPodatkami, obliczWynikMiesiaca(11, saved.miesiace[11], getUstawienia(saved)).zysk);
});

test("contract starts in November without courses; explicit monthly disable and undo remain available", () => {
  const source = fixture();
  assert.equal(rafalMonthCost(11, source.miesiace[11]).total, 5790.28);
  assert.equal(rafalMonthCost(12, {}).total, 5790.28);
  const settings = rafalPayrollSettings(11, source.miesiace[11]);
  const saved = apply(source, { kind: "payrollSettings", month: 11, settings });
  assert.equal(rafalMonthCost(11, saved.miesiace[11]).total, 5790.28);
  assert.equal(rafalMonthCost(6, saved.miesiace[6]).total, 0);
  const disabled = apply(saved, { kind: "payrollSettings", month: 11, settings: { ...settings, enabled: false } });
  assert.equal(rafalMonthCost(11, disabled.miesiace[11]).total, 0);
  const restored = apply(disabled, { kind: "undo", id: disabled.fleetHistory.at(-1).id });
  assert.equal(rafalMonthCost(11, restored.miesiace[11]).total, 5790.28);
  const noDeduction = apply(saved, { kind: "payrollSettings", month: 11, settings: { ...settings, deductibleThisMonth: false } });
  assert.equal(rafalMonthCost(11, noDeduction.miesiace[11]).taxCost, 0);
  assert.equal(rafalMonthCost(11, noDeduction.miesiace[11]).total, 5790.28);
});

test("contract activation follows month, never day counts, statuses, accrual or undo", () => {
  for (const month of [6, 7, 8, 9, 10, 11, 12]) {
    const date = `2026-${String(month).padStart(2, '0')}-03`;
    for (const days of [[], [{ ...day, date, courses: 0 }], [{ ...day, date, courses: 90 }], [{ ...day, date, status: 'wolne' }], [{ ...day, date, status: 'urlop', leaveNet: null }]]) {
      const result = rafalMonthCost(month, { rafal: { days } });
      assert.equal(result.settings.enabled, month >= 11);
      assert.equal(result.charges, month >= 11 ? 2184.43 : 0);
      assert.equal(result.taxCost, month >= 11 ? 5790.28 : 0);
      assert.equal(result.payrollNet, month >= 11 ? 3605.85 : 0);
      if (month >= 11) assert.equal(result.payroll.employeeIncomeTax, 168);
    }
  }
  const source = fixture();
  const before = podatkiMiesiaca(source, 11);
  const saved = apply(source, { kind: 'day', month: 11, day });
  const undone = apply(saved, { kind: 'undo', id: saved.fleetHistory.at(-1).id });
  assert.equal(undone.miesiace[11].rafal.days.length, 0);
  assert.deepEqual(podatkiMiesiaca(undone, 11), before);
  assert.equal(before.rafal.charges, 2184.43);
});

test("switching between automatic and manual preserves the original payslip; invalid settings rejected", () => {
  const source = apply(fixture(), { kind: "payroll", month: 11, payroll });
  const settings = { ...rafalPayrollSettings(11, source.miesiace[11]), mode: "minimum" };
  const automatic = apply(source, { kind: "payrollSettings", month: 11, settings });
  assert.equal(rafalMonthCost(11, automatic.miesiace[11]).payroll.gross, 4806);
  assert.deepEqual(automatic.miesiace[11].rafal.payroll, payroll);
  const undone = apply(automatic, { kind: "undo", id: automatic.fleetHistory.at(-1).id });
  assert.deepEqual(rafalMonthCost(11, undone.miesiace[11]), rafalMonthCost(11, source.miesiace[11]));
  for (const patch of [{ enabled: "true" }, { mode: "other" }, { taxReduction: 600 }, { taxCosts: -1 }, { taxRate: 24 }, { accidentRate: NaN }, { accidentRate: 11 }, { accidentRate: 1.123 }, { labourFund: null }]) {
    assert.throws(() => apply(source, { kind: "payrollSettings", month: 11, settings: { ...settings, ...patch } }), commands.FleetInputError);
  }
  source.miesiace[11].zamkniety = { locked: true };
  assert.throws(() => apply(source, { kind: "payrollSettings", month: 11, settings }), /zamknięty/);
});

test("full accrued payout survives lower payslip net; remainder changes cash without extra tax or charges", () => {
  const source = apply(fixture(), { kind: "payroll", month: 11, payroll });
  const before = podatkiMiesiaca(source, 11);
  const saved = JSON.parse(JSON.stringify(apply(source, { kind: "day", month: 11, day: { ...day, courses: 50 } })));
  const result = obliczWynikMiesiaca(11, saved.miesiace[11], getUstawienia(saved));
  const tax = podatkiMiesiaca(saved, 11);
  assert.equal(result.rafal.calculated, 4500);
  assert.equal(result.rafal.payrollNet, 3500);
  assert.equal(result.rafal.additionalPayout, 1000);
  assert.equal(result.rafal.payout, 4500);
  assert.equal(result.rafal.charges, 2500);
  assert.equal(result.rafal.total, 7000);
  assert.equal(result.rafal.taxCost, 6000);
  assert.equal(result.rafal.incomplete, false);
  for (const field of ["kosztyPodatkowe", "pitMiesiac", "zdrowotna", "vatDoZaplaty", "vatNaliczony", "vatNalezny"]) assert.equal(tax[field], before[field], field);
  assert.equal(tax.cashflowPoPodatkach, before.cashflowPoPodatkach - 1000);
  assert.equal(tax.zyskPrzedPodatkami, result.zysk);
  assert.deepEqual(tax.rafal, result.rafal);
  assert.deepEqual(podatkiMiesiaca(saved, 6), podatkiMiesiaca(source, 6));
  assert.deepEqual(saved.miesiace[11].dni, source.miesiace[11].dni);
  const undone = apply(saved, { kind: "undo", id: saved.fleetHistory.at(-1).id });
  assert.deepEqual(podatkiMiesiaca(undone, 11), before);
});

test("payroll edits reallocate full payout without dropping or adding the payslip twice", () => {
  const source = apply(fixture(), { kind: "day", month: 11, day: { ...day, courses: 50 } });
  const saved = apply(source, { kind: "payroll", month: 11, payroll });
  const edited = apply(saved, { kind: "payroll", month: 11, payroll: { ...payroll, gross: 5500, net: 4000 } });
  const result = rafalMonthCost(11, edited.miesiace[11]);
  assert.equal(result.additionalPayout, 500);
  assert.equal(result.payout, 4500);
  assert.equal(result.total, 7000);
  assert.equal(result.taxCost, 6500);
  assert.deepEqual(edited.miesiace[11].rafal.days, saved.miesiace[11].rafal.days);
  const undone = apply(edited, { kind: "undo", id: edited.fleetHistory.at(-1).id });
  assert.deepEqual(rafalMonthCost(11, undone.miesiace[11]), rafalMonthCost(11, saved.miesiace[11]));
  const noDeduction = apply(saved, { kind: "payroll", month: 11, payroll: { ...payroll, deductibleThisMonth: false } });
  assert.equal(rafalMonthCost(11, noDeduction.miesiace[11]).taxCost, 0);
  assert.equal(rafalMonthCost(11, noDeduction.miesiace[11]).payout, 4500);
});

test("payout splits use cents, retain missing-amount warnings and handle empty or off-only months", () => {
  const cost = days => rafalMonthCost(11, { rafal: { days, payroll } });
  const rounded = cost([{ ...day, courses: 38, status: "praca_zlecenia", ordersNet: 80.01 }]);
  assert.equal(rounded.additionalPayout, .01);
  assert.equal(rounded.payout, 3500.01);
  assert.equal(rounded.total, 6000.01);
  assert.equal(rounded.incomplete, false);
  assert.equal(cost([{ ...day, status: "urlop", leaveNet: null }]).incomplete, true);
  assert.equal(cost([{ ...day, status: "praca_zlecenia", ordersNet: null }]).incomplete, true);
  const matched = cost([{ ...day, status: "urlop", leaveNet: 3500 }]);
  assert.equal(matched.additionalPayout, 0);
  assert.equal(matched.payout, 3500);
  assert.equal(matched.incomplete, false);
  assert.equal(cost([]).payout, 3500);
  assert.equal(cost([]).incomplete, false);
  assert.equal(rafalMonthCost(10, {}).payout, 0);
  assert.equal(rafalMonthCost(10, {}).active, false);
  const offOnly = rafalMonthCost(11, { rafal: { days: [{ ...day, status: "wolne" }] } });
  assert.equal(offOnly.incomplete, false);
  assert.equal(offOnly.total, 5790.28);
});
test("shared invoice counts once for company, splits exact names, does not touch wages", () => {
  const source = fixture();
  const saved = apply(source, invoice), month = saved.miesiace[11];
  const pdf = month.faktury.at(-1).pdfImport;
  assert.equal(pdf.netto, 300.33); assert.equal(pdf.brutto, 369.41);
  assert.equal(pdf.pozycjeUwzglednione.length, 2); assert.equal(pdf.pozycjeOdrzucone.length, 1);
  assert.equal(previewDriverEntries(month, "zenia").assignedNet, 100.11);
  assert.equal(previewDriverEntries(month, "rafal").assignedNet, 200.22);
  assert.deepEqual(month.dni, source.miesiace[11].dni); assert.equal(month.rafal, undefined);
  const restored = JSON.parse(JSON.stringify(saved));
  assert.throws(() => apply(restored, invoice), /już zapisane/);
  const updated = apply(restored, { ...invoice, id: month.faktury.at(-1).id });
  assert.equal(updated.miesiace[11].faktury.length, month.faktury.length);
  assert.throws(() => apply(restored, { ...invoice, month: 12 }), /już zapisane/);
});
test("server recomputes forged totals; uncertain rows fail closed; explicit exclusions preserved", () => {
  const forged = { ...fleetInvoiceFixture, netto: 999999, brutto: 999999, totalBrutto: 999999 };
  assert.equal(apply(fixture(), { ...invoice, preview: forged }).miesiace[11].faktury.at(-1).kwota, 369.41);
  const review = structuredClone(fleetInvoiceFixture); review.sourceRows[1].needsReview = true;
  assert.throws(() => apply(fixture(), { ...invoice, preview: review }), /wymagające sprawdzenia/);
  review.recordOverrides = [{ transportOrderId: review.sourceRows[1].orderNumber, includeInSettlement: false }];
  assert.equal(apply(fixture(), { ...invoice, preview: review }).miesiace[11].faktury.at(-1).pdfImport.netto, 100.11);
});
test("same-period supplement is independent; invoice undo restores original values", () => {
  const saved = apply(fixture(), invoice);
  const supplement = structuredClone(fleetInvoiceFixture);
  supplement.sourceRows.forEach(row => { row.orderNumber = row.orderNumber.replace("100", "200"); });
  const added = apply(saved, { ...invoice, number: "TEST-2", preview: supplement });
  assert.equal(added.miesiace[11].faktury.length, saved.miesiace[11].faktury.length + 1);
  const undone = apply(added, { kind: "undo", id: added.fleetHistory.at(-1).id });
  assert.deepEqual(undone.miesiace[11].faktury, saved.miesiace[11].faktury);
});

function route(profile, current, saved) {
  const calls = [];
  const query = { select(v) { calls.push(["select", v]); return this; }, eq(k,v) { calls.push(["eq",k,v]); return this; }, update(v) { calls.push(["update", v]); return this; }, async single() { return current; }, async maybeSingle() { return saved; } };
  const imports = {
    "next/server": { NextResponse: { json(body, opts) { return { body, status: opts?.status ?? 200 }; } } },
    "@/lib/supabase-server": { getSessionProfile: async () => profile, getServerSupabase: async () => ({ from(t) { calls.push(["from",t]); return query; } }) },
    "@/lib/fleet-commands": commands,
  };
  const code = ts.transpileModule(fs.readFileSync("src/app/api/admin/fleet/route.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const loadedModule = { exports: {} };
  vm.runInNewContext(code, { module: loadedModule, exports: loadedModule.exports, require: key => imports[key] ?? require(key), crypto: { randomUUID: () => "test-event" } });
  return { post: body => loadedModule.exports.POST({ text: async () => JSON.stringify(body) }), calls };
}
test("API denies anonymous/driver/logistic before DB access, scopes admin to session workspace", async () => {
  for (const role of [null, "driver", "logistyk"]) {
    const api = route(role ? { role } : null);
    assert.equal((await api.post({})).status, role ? 403 : 401); assert.deepEqual(api.calls, []);
  }
  const revision = "2026-11-17T12:00:00Z";
  const api = route({ role: "admin", workspace_id: "own", name: "Admin" }, { data: { data: fixture(), updated_at: revision } }, { data: { updated_at: "2026-11-17T12:00:01Z" } });
  const response = await api.post({ revision, command: { kind: "day", month: 11, day }, workspace: "foreign" });
  assert.equal(response.status, 200);
  assert.ok(api.calls.some(c => c[0] === "eq" && c[1] === "id" && c[2] === "own"));
  assert.ok(api.calls.some(c => c[0] === "eq" && c[1] === "updated_at" && c[2] === revision));
});
test("stale revision and write race return 409; DB failure is not reported as saved", async () => {
  const profile = { role: "admin", workspace_id: "own", name: "Admin" };
  const current = { data: { data: fixture(), updated_at: "2026-11-17T12:00:00Z" } };
  const stale = route(profile, current);
  assert.equal((await stale.post({ revision: "old", command: { kind: "day", month: 11, day } })).status, 409);
  assert.ok(!stale.calls.some(c => c[0] === "update"));
  for (const [saved, status] of [[{ data: null }, 409], [{ error: { message: "DB" } }, 503]]) {
    assert.equal((await route(profile, current, saved).post({ revision: current.data.updated_at, command: { kind: "day", month: 11, day } })).status, status);
  }
});

test("legacy workspace saves preserve Rafal payroll and undo history; require current revision", async () => {
  const current = apply(fixture(), { kind: "day", month: 11, day });
  const updates = [];
  const q = { select() { return this; }, eq() { return this; }, async single() { return { data: { data: current, updated_at: "2026-11-17T12:00:00Z" } }; }, update(value) { updates.push(value); return this; }, async maybeSingle() { return { data: { updated_at: "2026-11-17T12:00:01Z" } }; } };
  const imports = {
    "next/server": { NextResponse: { json(body, opts) { return { body, status: opts?.status ?? 200 }; } } },
    "@/lib/supabase-server": { getSessionProfile: async () => ({ role: "admin", workspace_id: "own" }), getServerSupabase: async () => ({ from: () => q }) },
    "@/lib/recalculate-fuel-chain": require("../src/lib/recalculate-fuel-chain.ts"),
  };
  const code = ts.transpileModule(fs.readFileSync("src/app/api/workspace/[token]/route.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const loaded = { exports: {} };
  vm.runInNewContext(code, { module: loaded, exports: loaded.exports, require: key => imports[key] ?? require(key) });
  const body = fixture(); body.miesiace[11].inneKoszty.push({ id: "new-cost", data: "2026-11-03", koszt: 1 });
  const params = { params: Promise.resolve({ token: "own" }) };
  assert.equal((await loaded.exports.PUT({ json: async () => body, headers: { get: () => null } }, params)).status, 409);
  assert.equal(updates.length, 0);
  assert.equal((await loaded.exports.PUT({ json: async () => body, headers: { get: () => "2026-11-17T12:00:00Z" } }, params)).status, 200);
  assert.deepEqual(updates[0].data.miesiace[11].rafal, current.miesiace[11].rafal);
  assert.deepEqual(updates[0].data.fleetHistory, current.fleetHistory);
  assert.equal(updates[0].data.miesiace[11].inneKoszty.at(-1).id, "new-cost");
});

test("other full-workspace writers use revision guards before sending success", () => {
  for (const file of ["driver/fuel", "driver/notes", "driver/verify", "cron/note-reminders", "cron/auto-pay-invoices", "admin/recalculate-fuel"]) {
    const code = fs.readFileSync(`src/app/api/${file}/route.ts`, "utf8");
    const writes = [...code.matchAll(/\.update\(\{ data:[\s\S]*?;/g)];
    assert.ok(writes.length, file);
    for (const [write] of writes) assert.match(write, /\.eq\("updated_at",/, file);
  }
});
