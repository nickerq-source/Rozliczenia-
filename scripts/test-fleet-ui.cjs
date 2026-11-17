/* eslint-disable @typescript-eslint/no-require-imports -- Isolated synthetic UI tests. */
const fs = require("node:fs"), path = require("node:path"), http = require("node:http"), assert = require("node:assert/strict");
require("../tests/helpers/register-ts.cjs");
const { previewFixture } = require("../tests/fixtures/admin-preview.ts");
const { fleetInvoiceFixture } = require("../tests/fixtures/fleet.ts");
const { applyFleetCommand } = require("../src/lib/fleet-commands.ts");
const webpackRuntime = require("next/dist/compiled/webpack/webpack");
webpackRuntime.init();

(async () => {
  const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
  const out = path.resolve("tmp/invoice-ui/fleet"); fs.mkdirSync(out, { recursive: true });
  const compiler = webpackRuntime.webpack({ mode: "development", devtool: false,
    entry: path.resolve("tests/fleet-harness.tsx"), output: { path: out, filename: "bundle.js" },
    resolve: { extensions: [".tsx", ".ts", ".js"], alias: { "@": path.resolve("src") } },
    module: { rules: [{ test: /\.tsx?$/, exclude: /node_modules/, use: path.resolve("tests/helpers/webpack-ts.cjs") }, { test: /\.css$/, type: "asset/source" }] },
  });
  await new Promise((resolve, reject) => compiler.run((err, stats) => compiler.close(() => err || stats?.hasErrors() ? reject(err || Error(stats.toString({ all: false, errors: true }))) : resolve())));
  const cssDir = path.resolve(".next/static/css");
  const css = fs.readdirSync(cssDir, { recursive: true }).filter(f => f.endsWith(".css")).map(f => fs.readFileSync(path.join(cssDir, f), "utf8")).join("\n") + fs.readFileSync("src/components/admin-preview/admin-preview.css", "utf8");
  let state, revision, failNext = false, sequence = 0;
  const server = http.createServer(async (req, res) => {
    const json = (body, status = 200) => { res.statusCode = status; res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify(body)); };
    if (req.url === "/test-state") return json({ data: state, updated_at: revision });
    if (req.url === "/api/import-invoice") {
      let raw = ""; for await (const chunk of req) raw += chunk;
      assert.match(raw, /name="mode"\r\n\r\nfleet/);
      return json({ filtered: fleetInvoiceFixture, invoiceNumber: "SYNTHETIC-1" });
    }
    if (req.url === "/api/admin/fleet") {
      let raw = ""; for await (const chunk of req) raw += chunk;
      const input = JSON.parse(raw);
      if (failNext) { failNext = false; return json({ error: "Test: zapis niedostępny" }, 503); }
      if (input.revision !== revision) return json({ error: "Dane zmieniły się w innej karcie. Odśwież panel przed zapisem." }, 409);
      try { state = applyFleetCommand(state, input.command, "Test admin", `event-${++sequence}`, new Date().toISOString()).data; revision = new Date(Date.parse(revision) + 1000).toISOString(); return json({ data: state, updated_at: revision, message: "Zmiana testowa" }); }
      catch (err) { return json({ error: err.message }, 400); }
    }
    if (req.url === "/bundle.js") { res.setHeader("Content-Type", "application/javascript"); return res.end(fs.readFileSync(path.join(out, "bundle.js"))); }
    if (req.url === "/style.css") { res.setHeader("Content-Type", "text/css"); return res.end(css); }
    if (req.url === "/papitrans-bg.jpg") { res.setHeader("Content-Type", "image/jpeg"); return res.end(fs.readFileSync("public/papitrans-bg.jpg")); }
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.end('<!doctype html><html lang="pl"><head><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/style.css"></head><body><div id="root"></div><script src="/bundle.js"></script></body></html>');
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  let browser;
  try {
    browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE } : {}) });
    for (const width of [320, 390, 1280]) {
      state = structuredClone(previewFixture); revision = "2026-11-17T12:00:00Z";
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      const errors = []; page.on("pageerror", e => errors.push(e.message)); page.on("dialog", d => d.accept());
      const base = `http://127.0.0.1:${server.address().port}/admin/flota?miesiac=11`;
      const openDays = async () => { await page.goto(base + "&sekcja=kierowcy&kierowca=rafal&widok=dni"); await page.getByRole("heading", { name: "Rafał Gustab", exact: true }).waitFor(); };
      const dayRow = () => page.getByRole("table").getByRole("row").filter({ hasText: "03 Wt" });
      const layout = async () => assert.deepEqual(await page.evaluate(() => Array.from(document.querySelectorAll(".admin-preview *")).filter(el => {
        const r = el.getBoundingClientRect(); return r.width > 0 && (r.right > innerWidth + 1 || r.left < -1);
      }).map(el => el.tagName + ":" + el.textContent.slice(0, 40))), [], `overflow ${width}`);
      await openDays();
      await page.getByRole("button", { name: "Edytuj dzień 2026-11-03", exact: true }).click();
      await page.getByLabel("Kursy · 90 zł netto").fill("2");
      await page.getByRole("button", { name: "Zapisz dzień", exact: true }).click();
      await page.getByText("Zapisano. Zmiana testowa", { exact: true }).waitFor();
      assert.equal(state.miesiace[11].rafal.days[0].courses, 2);
      await page.reload(); await dayRow().getByText("180,00 zł", { exact: true }).waitFor();
      assert.deepEqual(state.miesiace[11].dni, previewFixture.miesiace[11].dni);
      await layout(); await page.screenshot({ path: path.join(out, `${width}-days.png`), fullPage: true });
      await page.getByText("Historia zmian i cofanie", { exact: true }).click();
      await page.getByRole("button", { name: /^Cofnij:/ }).click();
      await dayRow().getByText("Brak wpisu", { exact: true }).waitFor();
      assert.equal(state.miesiace[11].rafal.days.length, 0);
      failNext = true;
      await page.getByRole("button", { name: "Edytuj dzień 2026-11-03", exact: true }).click();
      await page.getByLabel("Kursy · 90 zł netto").fill("3");
      await page.getByRole("button", { name: "Zapisz dzień", exact: true }).click();
      await page.getByRole("alert").filter({ hasText: "Test: zapis niedostępny" }).waitFor();
      assert.equal(state.miesiace[11].rafal.days.length, 0);
      await page.getByRole("button", { name: "Zapisz dzień", exact: true }).click();
      await dayRow().getByText("270,00 zł", { exact: true }).waitFor();
      await page.goto(base + "&sekcja=faktury");
      await page.getByRole("heading", { name: "Wspólne faktury · Żenia i Rafał", exact: true }).waitFor();
      await page.locator('input[type="file"]').setInputFiles({ name: "synthetic.pdf", mimeType: "application/pdf", buffer: Buffer.from("synthetic mocked upload") });
      await page.getByRole("dialog").waitFor();
      await page.getByRole("dialog").getByText("RAFAL GUSTAB · netto", { exact: true }).waitFor();
      await layout(); await page.screenshot({ path: path.join(out, `${width}-invoice.png`), animations: "disabled" });
      await page.getByRole("button", { name: "Zapisz fakturę", exact: true }).click();
      await page.getByRole("dialog").waitFor({ state: "detached" });
      assert.equal(state.miesiace[11].faktury.at(-1).pdfImport.netto, 300.33);
      assert.equal(state.miesiace[11].rafal.days[0].courses, 3);
      await page.goto(base + "&sekcja=kierowcy&kierowca=rafal&widok=faktury");
      await page.getByText("200,22 zł", { exact: true }).waitFor(); await layout();
      await page.goto(base + "&sekcja=kierowcy&kierowca=zenia&widok=faktury");
      await page.getByText("100,11 zł", { exact: true }).waitFor(); await layout();
      await page.goto(base + "&sekcja=kierowcy&kierowca=rafal&widok=umowa");
      await page.getByLabel("Brutto z listy płac", { exact: true }).fill("5000");
      const fields = { net: "3500", employeeIncomeTax: "500", employeeHealth: "400", employeeSocial: "600", employerContributions: "1000", otherDeductions: "0", reference: "TEST-11" };
      for (const [key, value] of Object.entries(fields)) await page.locator(`[name="${key}"]`).fill(value);
      await page.getByLabel("Koszt podatkowy potwierdzony dla tego miesiąca").check();
      await page.getByRole("button", { name: "Zapisz listę płac", exact: true }).click();
      await page.getByText("Zapisano. Zmiana testowa", { exact: true }).waitFor();
      assert.equal(state.miesiace[11].rafal.payroll.gross, 5000);
      await layout(); await page.screenshot({ path: path.join(out, `${width}-payroll.png`), fullPage: true });
      await openDays(); revision = new Date(Date.parse(revision) + 1000).toISOString();
      await page.getByRole("button", { name: "Edytuj dzień 2026-11-03", exact: true }).click();
      await page.getByLabel("Kursy · 90 zł netto").fill("5");
      await page.getByRole("button", { name: "Zapisz dzień", exact: true }).click();
      await page.getByRole("alert").filter({ hasText: "Dane zmieniły się" }).waitFor();
      assert.equal(state.miesiace[11].rafal.days[0].courses, 3);
      assert.deepEqual(errors, []);
      await page.close();
    }
    console.log("PASS: 320/390/1280px; persist/reload, undo, save failure, conflict, invoice split, payslip; no overflow/runtime errors.");
  } finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(err => { console.error(err); process.exitCode = 1; });
