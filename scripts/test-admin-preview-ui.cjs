/* eslint-disable @typescript-eslint/no-require-imports -- Isolated browser verification; no production login or data. */
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const assert = require("node:assert/strict");
const webpackRuntime = require("next/dist/compiled/webpack/webpack");
webpackRuntime.init();

(async () => {
  const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
  const out = path.resolve("tmp/invoice-ui/admin-preview");
  fs.mkdirSync(out, { recursive: true });
  const compiler = webpackRuntime.webpack({ mode: "development", devtool: false,
    entry: path.resolve("tests/admin-preview-harness.tsx"), output: { path: out, filename: "bundle.js" },
    resolve: { extensions: [".tsx", ".ts", ".js"], alias: { "@": path.resolve("src") } },
    module: { rules: [
      { test: /\.tsx?$/, exclude: /node_modules/, use: path.resolve("tests/helpers/webpack-ts.cjs") },
      { test: /\.css$/, type: "asset/source" },
    ] },
  });
  await new Promise((resolve, reject) => compiler.run((err, stats) => compiler.close(() => err || stats?.hasErrors() ? reject(err || Error(stats.toString({ all: false, errors: true }))) : resolve())));
  const css = fs.readFileSync("src/components/admin-preview/admin-preview.css", "utf8");
  const server = http.createServer((req, res) => {
    if (req.url === "/bundle.js") { res.setHeader("Content-Type", "application/javascript"); res.end(fs.readFileSync(path.join(out, "bundle.js"))); }
    else if (req.url === "/style.css") { res.setHeader("Content-Type", "text/css"); res.end(css); }
    else if (req.url === "/papitrans-bg.jpg") { res.setHeader("Content-Type", "image/jpeg"); res.end(fs.readFileSync("public/papitrans-bg.jpg")); }
    else { res.setHeader("Content-Type", "text/html; charset=utf-8"); res.end('<!doctype html><html lang="pl"><head><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/style.css"><style>body{margin:0;font-family:Arial,sans-serif;background:#0b100d}button{border:0;background:none;color:inherit}a{color:inherit}p{margin:0}*{box-sizing:border-box}</style></head><body><div id="root"></div><script src="/bundle.js"></script></body></html>'); }
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  let browser;
  try {
    browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE } : {}) });
    for (const width of [320, 390, 1280]) {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      const writes = [], errors = [], antivirusRequests = [];
      page.on("pageerror", e => errors.push(e.message));
      page.on("request", req => {
        // The host antivirus injects its own telemetry into local HTML. Keep it separate,
        // without exempting any application origin or other third-party request.
        if (new URL(req.url()).hostname === "gc.kis.v2.scr.kaspersky-labs.com") {
          antivirusRequests.push(req.method());
        } else if (req.method() !== "GET" || req.url().includes("/api/")) {
          writes.push(`${req.method()} ${req.url()}`);
        }
      });
      page.on("dialog", d => d.accept());
      await page.goto(`http://127.0.0.1:${server.address().port}/admin/podglad?miesiac=11`);
      const result = await page.getByTestId("company-result").innerText();
      const assertLayout = async () => assert.deepEqual(await page.evaluate(() => Array.from(document.querySelectorAll('.admin-preview *')).filter(el => {
        const r = el.getBoundingClientRect(); return r.width > 0 && (r.right > innerWidth + 1 || r.left < -1);
      }).map(el => el.tagName + ':' + el.textContent.slice(0, 35))), [], `${width}px overflow`);
      await assertLayout();
      await page.screenshot({ path: path.join(out, `${width}-start.png`), fullPage: true });
      for (const title of ["Faktury", "Kierowcy", "Koszty", "Więcej"]) { await page.getByRole("navigation").getByRole("button", { name: title, exact: true }).click(); await assertLayout(); }
      for (const title of ["Zlecenia i logistyk", "Podatki firmy", "Rozliczenie 50/50", "Raporty", "Wiadomości", "Ustawienia"]) {
        await page.getByRole("button", { name: new RegExp('^' + title) }).click(); await assertLayout();
        await page.getByRole("button", { name: "Pozostałe działy", exact: true }).click();
      }
      await page.getByRole("navigation").getByRole("button", { name: "Kierowcy", exact: true }).click();
      await page.getByRole("button", { name: /^Rafał Gustab/ }).click();
      await page.getByRole("button", { name: "Dodaj dzień testowy" }).click();
      await page.getByLabel("Kursy · 90 zł netto").fill("3");
      await page.getByRole("button", { name: "Zastosuj tylko w podglądzie" }).click();
      await page.getByRole("button", { name: /270,00/ }).waitFor();
      await assertLayout();
      await page.screenshot({ path: path.join(out, `${width}-rafal.png`), fullPage: true });
      await page.getByRole("button", { name: /270,00/ }).click();
      await page.getByLabel("Status dnia", { exact: true }).selectOption("urlop");
      await page.getByRole("button", { name: "Zastosuj tylko w podglądzie" }).click();
      await page.getByRole("button", { name: /Do uzupełnienia/ }).waitFor();
      await page.getByRole("button", { name: "Wypłata", exact: true }).click();
      assert.match(await page.locator("main").innerText(), /Niepełne dane/);
      await page.getByRole("navigation").getByRole("button", { name: "Start", exact: true }).click();
      assert.equal(await page.getByTestId("company-result").innerText(), result, "trial cannot affect company cash");
      await page.getByLabel("Miesiąc", { exact: true }).selectOption("6");
      assert.notEqual(await page.getByTestId("company-result").innerText(), result);
      await page.getByLabel("Miesiąc", { exact: true }).selectOption("11");
      await page.getByRole("navigation").getByRole("button", { name: "Koszty", exact: true }).click();
      await page.getByRole("button", { name: "Paliwo", exact: true }).click();
      await page.getByRole("navigation").getByRole("button", { name: "Faktury", exact: true }).click();
      await page.goBack();
      assert.equal(await page.getByRole("button", { name: "Paliwo", exact: true }).getAttribute("aria-pressed"), "true");
      await page.getByRole("navigation").getByRole("button", { name: "Faktury", exact: true }).click();
      await page.getByRole("button", { name: /^Faktura 1/ }).click();
      await assertLayout();
      await page.getByRole("button", { name: "Lista faktur", exact: true }).click();
      await page.getByLabel("Miesiąc", { exact: true }).selectOption("12");
      await page.getByRole("navigation").getByRole("button", { name: "Start", exact: true }).click();
      assert.equal(await page.getByTestId("company-result").innerText(), "Brak danych");
      await page.getByRole("navigation").getByRole("button", { name: "Więcej", exact: true }).click();
      await page.getByRole("button", { name: /^Podatki firmy/ }).click();
      assert.equal(await page.getByText("Podstawa obliczeń", { exact: true }).count(), 0);
      assert.deepEqual(writes, [], "preview must never call APIs or send mutations");
      assert.deepEqual(errors, []);
      assert.equal(await page.evaluate(() => localStorage.length + sessionStorage.length), 0);
      const returnLink = page.getByRole("link", { name: "Wróć do obecnego panelu", exact: true });
      assert.match(await returnLink.getAttribute("href"), /\/admin\?miesiac=12/);
      await page.close();
      console.log(`PASS ${width}px: navigation, browser back, filters, trial isolation, missing data, no API/storage writes`);
      if (antivirusRequests.length) console.log(`Host antivirus telemetry excluded: ${antivirusRequests.length} requests`);
    }
  } finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(err => { console.error(err); process.exitCode = 1; });
