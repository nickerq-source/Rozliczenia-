/* eslint-disable @typescript-eslint/no-require-imports -- Node test runner for application TS. */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");
require("./helpers/register-ts.cjs");
const { preparePreviewSnapshot, previewMonth, previewDayNet, readPreviewLocation, previewSearch, previewDriverMatches, previewDriverEntries } = require("../src/lib/admin-preview.ts");
const { previewFixture } = require("./fixtures/admin-preview.ts");
const { obliczWynikMiesiaca } = require("../src/lib/business-logic.ts");
const { getUstawienia, podatkiMiesiaca } = require("../src/lib/tax.ts");

test("preview uses the existing accounting functions for every month and does not mutate source", () => {
  const original = structuredClone(previewFixture);
  const snapshot = preparePreviewSnapshot(previewFixture);
  for (const month of [6, 7, 8, 9, 10, 11, 12]) {
    const model = previewMonth(snapshot, month);
    assert.deepEqual(model.result, obliczWynikMiesiaca(month, snapshot.miesiace[month], getUstawienia(snapshot)));
    assert.deepEqual(model.tax, podatkiMiesiaca(snapshot, month));
  }
  snapshot.miesiace[11].faktury[0].kwota = 999999;
  assert.deepEqual(previewFixture, original);
  assert.equal(previewFixture.miesiace[12], undefined, "missing month must remain distinguishable from a saved zero");
});

test("Rafal trial days use explicit net amounts and do not change company cash or Zenia salary", () => {
  const snapshot = preparePreviewSnapshot(previewFixture);
  const before = previewMonth(snapshot, 11);
  const day = { date: "2026-11-03", status: "praca", courses: 3, ordersNet: null, leaveNet: null, note: "" };
  assert.equal(previewDayNet(day), 270);
  assert.equal(previewDayNet({ ...day, status: "postojowe" }), 50);
  assert.equal(previewDayNet({ ...day, status: "urlop" }), null);
  assert.equal(previewDayNet({ ...day, status: "urlop", leaveNet: 123.45 }), 123.45);
  assert.equal(previewDayNet({ ...day, status: "praca_zlecenia" }), null);
  assert.equal(previewDayNet({ ...day, status: "praca_zlecenia", ordersNet: 0 }), 270);
  assert.equal(previewDayNet({ ...day, status: "praca_zlecenia", ordersNet: 40 }), 310);
  assert.equal(previewDayNet({ ...day, status: "wolne" }), 0);
  assert.deepEqual(previewMonth(snapshot, 11), before);
});

test("navigation roundtrips month, selected driver, invoice and filters; rejects invalid values", () => {
  const loc = { month: 6, section: "faktury", driver: "rafal", part: "dni", invoice: "safe/a&b", filter: "paliwo" };
  assert.deepEqual(readPreviewLocation(previewSearch(loc), 11), loc);
  const fallback = readPreviewLocation("?miesiac=1&sekcja=admin&widok=invalid&kierowca=unknown", 11);
  assert.equal(fallback.month, 11);
  assert.equal(fallback.section, "menu");
  assert.equal(fallback.part, "podsumowanie");
  assert.equal(fallback.driver, null);
  assert.equal(readPreviewLocation("?sekcja=wiecej&widok=wyplata", 11).section, "menu");
  assert.equal(readPreviewLocation("?widok=wyplata", 11).part, "dni");
});

test("driver views include only explicit identities, accepted PDF rows and attributed fuel submissions", () => {
  const data = preparePreviewSnapshot(previewFixture).miesiace[11];
  const row = (driverName, cost, extra = {}) => ({ driverName, cost, ...extra });
  data.faktury = [{ id: "shared", kwota: 9999, label: "Shared", pdfImport: {
    pozycjeUwzglednione: [row("YEVHENII PITIANIN", 100.11), row("Rafał Gustab", 200.22), row("ARTUR SZADY", 300), row("", 400), row("Rafal Gustab", 500, { needsReview: true })],
    pozycjeOdrzucone: [row("Rafal Gustab", 600)],
    dodatkiReczne: [{ id: "r", driverName: "Rafal Gustab", netto: 20, addToInvoice: true }, { driverName: "YEVHENII PITIANIN", netto: 80, addToInvoice: false }],
  } }, { id: "manual", kwota: 8888, label: "Unassigned" }];
  data.tankowanie = [{ id: "z", dodaneBy: "Żenia", koszt: 10 }, { id: "r", dodaneBy: "Rafal Gustab", koszt: 20 }, { id: "unassigned", koszt: 30, opis: "Rafal Gustab" }];
  const original = structuredClone(data);
  const zenia = previewDriverEntries(data, "zenia");
  const rafal = previewDriverEntries(data, "rafal");
  assert.equal(zenia.assignedNet, 100.11);
  assert.equal(rafal.assignedNet, 220.22);
  assert.deepEqual(zenia.fuel.map(row => row.id), ["z"]);
  assert.deepEqual(rafal.fuel.map(row => row.id), ["r"]);
  assert.equal(previewDriverMatches("Rafal", "rafal"), false);
  assert.equal(previewDriverMatches("Yevhenii Uczyce", "zenia"), false);
  assert.deepEqual(data, original);
});

function loadPage(profile, response) {
  const calls = [];
  const fake = { select(value) { calls.push(["select", value]); return this; }, eq(key, value) { calls.push(["eq", key, value]); return this; }, async single() { calls.push(["single"]); return response; } };
  const imports = {
    "next/navigation": { redirect: path => { throw new Error(`REDIRECT:${path}`); } },
    "@/lib/supabase-server": { getSessionProfile: async () => profile, getServerSupabase: async () => ({ from(table) { calls.push(["from", table]); return fake; } }) },
    "@/components/admin-preview/AdminPreview": { AdminPreview: () => null },
  };
  const code = ts.transpileModule(fs.readFileSync("src/app/admin/podglad/page.tsx", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020 } }).outputText;
  const loadedModule = { exports: {} };
  vm.runInNewContext(code, { module: loadedModule, exports: loadedModule.exports, require: key => imports[key] ?? require(key) });
  return { page: loadedModule.exports.default, calls };
}

test("preview route rejects anonymous, driver and logistics users before workspace access", async () => {
  for (const role of [null, "driver", "logistyk"]) {
    const { page, calls } = loadPage(role ? { role, workspace_id: "other" } : null, {});
    await assert.rejects(page, new RegExp(role ? "REDIRECT:/dashboard" : "REDIRECT:/login"));
    assert.deepEqual(calls, []);
  }
});

test("admin preview reads only the authenticated workspace through the session client", async () => {
  const { page, calls } = loadPage({ role: "admin", workspace_id: "own-workspace" }, { data: { data: previewFixture, updated_at: null }, error: null });
  const element = await page();
  assert.deepEqual(calls, [["from", "workspaces"], ["select", "data, updated_at"], ["eq", "id", "own-workspace"], ["single"]]);
  assert.deepEqual(element.props.source, previewFixture);
});

test("a failed workspace read renders an error instead of a zero financial dashboard", async () => {
  const { page } = loadPage({ role: "admin", workspace_id: "own" }, { data: null, error: { message: "Unavailable" } });
  const html = require("react-dom/server").renderToStaticMarkup(await page());
  assert.match(html, /Podgląd niedostępny/);
  assert.match(html, /role="alert"/);
});

test("preview client has no autosave, storage, audit, upload or API-writing dependencies", () => {
  for (const file of ["src/components/admin-preview/AdminPreview.tsx", "src/components/admin-preview/PreviewDriver.tsx", "src/lib/admin-preview.ts"]) {
    const code = fs.readFileSync(file, "utf8");
    assert.doesNotMatch(code, /\bfetch\s*\(|localStorage|sessionStorage|useWorkspace|logChange|getAdminSupabase|getBrowserSupabase|ImportModal|sendBeacon/);
  }
});
