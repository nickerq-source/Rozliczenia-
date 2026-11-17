/* eslint-disable @typescript-eslint/no-require-imports -- Isolated synthetic workspace, no real account or database. */
const fs = require('node:fs'), path = require('node:path'), http = require('node:http'), assert = require('node:assert/strict');
require('../tests/helpers/register-ts.cjs');
const { previewFixture } = require('../tests/fixtures/admin-preview.ts');
const { applyFleetCommand } = require('../src/lib/fleet-commands.ts');
const { recalculateWorkspaceFuelChains } = require('../src/lib/recalculate-fuel-chain.ts');
const { podatkiMiesiaca } = require('../src/lib/tax.ts');
const { formatZl, obliczWynikMiesiaca } = require('../src/lib/business-logic.ts');
const { getUstawienia } = require('../src/lib/tax.ts');
const runtime = require('next/dist/compiled/webpack/webpack'); runtime.init();
(async () => {
  const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
  const out = path.resolve('tmp/invoice-ui/admin-workspace'); fs.mkdirSync(out, { recursive: true });
  const compiler = runtime.webpack({ mode: 'development', devtool: false, entry: path.resolve('tests/admin-workspace-harness.tsx'),
    output: { path: out, filename: 'bundle.js' },
    resolve: { extensions: ['.tsx', '.ts', '.js'], alias: { '@': path.resolve('src'), 'next/navigation$': path.resolve('tests/helpers/navigation-mock.ts') } },
    plugins: [new runtime.webpack.DefinePlugin({ 'process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY': '""' })],
    module: { rules: [{ test: /\.tsx?$/, exclude: /node_modules/, use: path.resolve('tests/helpers/webpack-ts.cjs') }, { test: /\.css$/, type: 'asset/source' }] },
  });
  await new Promise((resolve, reject) => compiler.run((err, stats) => compiler.close(() => err || stats?.hasErrors() ? reject(err || Error(stats.toString({ all: false, errors: true }))) : resolve())));
  const cssDir = path.resolve(process.env.WORKSPACE_TEST_CSS_DIR || '.next/static/css');
  const css = fs.readdirSync(cssDir, { recursive: true }).filter(f => f.endsWith('.css')).map(f => fs.readFileSync(path.join(cssDir, f), 'utf8')).join('\n');
  let state, revision, sequence = 0, failNext = false, delaySave = false;
  const writes = [];
  const server = http.createServer(async (req, res) => {
    const json = (body, status = 200) => { res.statusCode = status; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(body)); };
    if (req.url === '/api/workspace/synthetic-workspace' && req.method === 'GET') return json({ data: state, updated_at: revision });
    if (req.url === '/api/workspace/synthetic-workspace' || req.url === '/api/admin/fleet') {
      let raw = ''; for await (const chunk of req) raw += chunk;
      const body = JSON.parse(raw); const fleet = req.url.endsWith('/fleet');
      if (failNext) { failNext = false; return json({ error: 'Test: zapis niedostępny' }, 503); }
      if ((fleet ? body.revision : req.headers['if-match']) !== revision) return json({ error: 'Test: dane zmienione w innej karcie' }, 409);
      if (delaySave) await new Promise(resolve => setTimeout(resolve, 300));
      try {
        if (fleet) state = applyFleetCommand(state, body.command, 'Test admin', `event-${++sequence}`, new Date().toISOString()).data;
        else {
          body.fleetHistory = state.fleetHistory;
          for (const [m, month] of Object.entries(state.miesiace)) if (month.rafal) body.miesiace[m].rafal = month.rafal;
          state = recalculateWorkspaceFuelChains(body).data;
        }
        revision = new Date(Date.parse(revision) + 1000).toISOString(); writes.push(fleet ? 'fleet' : 'workspace');
        return json({ data: state, updated_at: revision });
      } catch (err) { return json({ error: err.message }, 400); }
    }
    if (req.url === '/api/audit') return json({ ok: true });
    if (req.url.startsWith('/api/')) return json({ error: 'Synthetic API unavailable' }, 503);
    if (req.url === '/bundle.js') { res.setHeader('Content-Type', 'application/javascript'); return res.end(fs.readFileSync(path.join(out, 'bundle.js'))); }
    if (req.url === '/style.css') { res.setHeader('Content-Type', 'text/css'); return res.end(css); }
    if (req.url === '/fonts/pirata-one/PirataOne-Regular.ttf') {
      res.setHeader('Content-Type', 'font/ttf');
      return res.end(fs.readFileSync('public/fonts/pirata-one/PirataOne-Regular.ttf'));
    }
    if (req.url === '/papitrans-bg.jpg') { res.setHeader('Content-Type', 'image/jpeg'); return res.end(fs.readFileSync('public/papitrans-bg.jpg')); }
    if (req.url === '/art/dossier-paper.webp') { res.setHeader('Content-Type', 'image/webp'); return res.end(fs.readFileSync('public/art/dossier-paper.webp')); }
    if (req.url === '/avatars/gilberto-rodriguez.jpg' || req.url === '/avatars/joaquin-guzman.webp') {
      res.setHeader('Content-Type', req.url.endsWith('.jpg') ? 'image/jpeg' : 'image/webp');
      return res.end(fs.readFileSync(path.join('public', req.url)));
    }
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end('<!doctype html><html lang="pl"><head><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/style.css"></head><body><div id="root"></div><script src="/bundle.js"></script></body></html>');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE } : {}) });
    for (const width of [320, 390, 1280]) {
      state = structuredClone(previewFixture); revision = '2026-11-17T12:00:00Z'; writes.length = 0;
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      const errors = []; page.on('pageerror', e => errors.push(e.message)); page.on('dialog', dialog => dialog.accept());
      const base = `http://127.0.0.1:${server.address().port}/admin?miesiac=11`;
      const menu = () => page.getByRole('navigation', { name: 'Menu aplikacji', exact: true });
      const company = () => page.getByRole('navigation', { name: 'Działy firmy', exact: true });
      const driver = () => page.getByRole('navigation', { name: 'Działy kierowcy', exact: true });
      const switcher = () => page.getByRole('navigation', { name: 'Przełącz kierowcę', exact: true });
      const switchDriver = async (name, id) => {
        await switcher().getByRole('button', { name, exact: true }).click();
        await page.getByRole('region', { name: `Profil: ${name}`, exact: true }).waitFor();
        assert.equal(new URL(page.url()).searchParams.get('kierowca'), id);
        assert.equal(await switcher().getByRole('button', { name, exact: true }).getAttribute('aria-current'), 'page');
      };
      const driverView = async label => driver().getByRole('button', { name: label, exact: true }).click();
      const layout = async label => {
        const overflow = await page.evaluate(() => Array.from(document.querySelectorAll('main *')).filter(el => {
          if (el.closest('.overflow-x-auto,.scrollbar-none') || el.matches('.fc-wordmark image[clip-path]')) return false;
          const r = el.getBoundingClientRect(); return r.width > 0 && (r.left < -1 || r.right > innerWidth + 1);
        }).map(el => `${el.tagName}:${el.textContent.slice(0, 45)}`));
        assert.deepEqual(overflow, [], `${width} ${label}`);
        await page.screenshot({ path: path.join(out, `${width}-${label}.png`), fullPage: true });
      };
      await page.goto(base); await page.getByRole('region', { name: 'Wybierz dział' }).waitFor();
      assert.equal(await page.getByRole('region', { name: 'Wybierz dział' }).getByRole('button').count(), 2);
      const startTiles = page.getByRole('region', { name: 'Wybierz dział' });
      await startTiles.getByRole('heading', { name: 'PapiTrans', exact: true }).waitFor();
      assert.equal(await startTiles.locator('.fc-wordmark image').getAttribute('href'), '/papitrans-bg.jpg');
      assert.ok(await startTiles.locator('.fc-wordmark').evaluate(el =>
        el.getBoundingClientRect().width <= 124 && document.documentElement.scrollWidth <= innerWidth));
      const edges = await startTiles.getByRole('button').evaluateAll(items => items.map(el => getComputedStyle(el, '::before').clipPath));
      assert.ok(edges.every(edge => edge.startsWith('polygon(')) && edges[0] !== edges[1]);
      assert.ok(await startTiles.locator('.fc-entry strong').evaluateAll(async labels => {
        await document.fonts.ready;
        return [...document.fonts].some(face => face.family.includes('Pirata One') && face.status === 'loaded') &&
          labels.length === 2 && labels.every(label => getComputedStyle(label).fontFamily.startsWith('"Pirata One"') &&
            label.scrollWidth <= label.clientWidth && label.clientHeight <= Math.ceil(parseFloat(getComputedStyle(label).lineHeight)));
      }), 'local display font loads and both labels fit');
      await startTiles.screenshot({ path: path.join(out, `${width}-start-signs.png`) });
      assert.equal(await company().count(), 0); await layout('start');
      await page.getByRole('button', { name: 'Menu główne', exact: true }).click();
      await page.getByText(/Rachunek zysków i strat/).waitFor();
      const menuAccent = await menu().getByRole('button', { name: 'Menu główne' }).evaluate(el => getComputedStyle(el).color);
      assert.equal(await page.getByRole('button', { name: 'Oznacz jako wypłacone', exact: true }).count(), 0);
      await layout('company');
      assert.equal(await company().getByRole('button').count(), 9);
      assert.equal(await company().getByRole('button', { name: 'Podsumowanie', exact: true }).getAttribute('aria-current'), 'page');
      if (width < 640) {
        const positions = await company().getByRole('button').evaluateAll(items => items.map(item => item.getBoundingClientRect().top));
        assert.deepEqual([...new Set(positions)].map(y => positions.filter(pos => pos === y).length), [3, 3, 3]);
      }
      await page.screenshot({ path: path.join(out, `${width}-company-menu.png`) });
      await company().getByRole('button', { name: 'Koszty', exact: true }).click();
      assert.equal(await page.getByRole('button', { name: '+ Dodaj tankowanie', exact: true }).count(), 0);
      await page.getByRole('heading', { name: 'Koszty firmy', exact: true }).waitFor();
      await layout('company-costs');
      await menu().getByRole('button', { name: 'Kierowcy', exact: true }).click();
      const choices = page.getByRole('region', { name: 'Wybierz kierowcę' });
      assert.equal(await choices.getByRole('button').count(), 2);
      const portraits = choices.locator('.driver-avatar img');
      assert.equal(await portraits.count(), 2);
      const sources = await portraits.evaluateAll(async images => Promise.all(images.map(async img => {
        await img.decode(); return img.currentSrc;
      })));
      assert.equal(new Set(sources).size, 2);
      assert.deepEqual(await choices.locator('.fc-wanted[aria-hidden="true"]').allTextContents(), ['WANTED', 'WANTED']);
      assert.ok(await choices.evaluate(async region => {
        const paper = new Image(); paper.src = '/art/dossier-paper.webp'; await paper.decode();
        return paper.naturalWidth === 512 && paper.naturalHeight === 432 &&
          [...region.querySelectorAll('.fc-person')].every(card => {
            const stock = getComputedStyle(card, '::after');
            const photo = card.querySelector('.driver-avatar').getBoundingClientRect();
            const name = card.querySelector('strong').getBoundingClientRect();
            const action = card.querySelector('.fc-person-action').getBoundingClientRect();
            return stock.backgroundImage.includes('dossier-paper.webp') && stock.maskImage !== 'none' &&
              photo.bottom <= name.top && name.bottom <= action.top;
          });
      }), 'printed stock loads and portraits, names and controls do not collide');
      await page.mouse.move(0, 0);
      const cards = await choices.getByRole('button').all();
      const posterEdges = [];
      for (const card of cards) {
        const [rim, paper] = await card.evaluate(el => ['::before', '::after'].map(layer => getComputedStyle(el, layer).clipPath));
        assert.equal(rim, paper, 'paper and rim follow the same tear');
        assert.ok(rim.startsWith('polygon(') && !edges.includes(rim));
        posterEdges.push(rim);
        // Compare against the actual scene under this card, not an assumed background colour.
        const decode = png => require('sharp')(png).removeAlpha().raw().toBuffer({ resolveWithObject: true });
        const visible = await decode(await card.screenshot());
        const backdrop = await decode(await card.screenshot({ style: '.fc-person { opacity: 0 !important; }' }));
        const { width: w, height: h, channels } = visible.info;
        const pixel = (image, x, y) => image.data.subarray((y*w+x)*channels, (y*w+x+1)*channels);
        for (const [x, y] of [[6,5], [w-7,5], [6,h-6], [w-7,h-6]]) {
          assert.deepEqual(pixel(visible,x,y), pixel(backdrop,x,y), 'each torn corner reveals the underlying image');
        }
        assert.notDeepEqual(pixel(visible,12,50), pixel(backdrop,12,50), 'paper remains visible inside the card');
      }
      assert.equal(new Set(posterEdges).size, cards.length);
      const firstDriver = choices.getByRole('button').first();
      await firstDriver.hover();
      assert.equal(await firstDriver.evaluate(el => getComputedStyle(el, '::before').backgroundColor), menuAccent);
      await page.mouse.move(0, 0);
      await choices.screenshot({ path: path.join(out, `${width}-driver-signs.png`) });
      await layout('driver-choices');
      await page.getByRole('button', { name: 'Rafał Gustab', exact: true }).click();
      assert.equal(await page.getByRole('combobox', { name: 'Dział kierowcy', exact: true }).count(), 0);
      assert.equal(await driver().getByRole('button').count(), 7);
      for (const tile of await driver().getByRole('button').all()) {
        assert.equal(await tile.isVisible(), true);
        const box = await tile.boundingBox();
        assert.ok(box.height >= 72 && box.width >= 120, 'named driver section tiles have stable touch targets');
      }
      const beforeSwitching = JSON.stringify(state);
      const writesBeforeSwitching = writes.length;
      assert.equal(await switcher().getByRole('button').count(), 2);
      const switcherBox = await switcher().boundingBox();
      assert.equal(await switcher().locator('[aria-current="page"]').evaluate(el => getComputedStyle(el, '::before').backgroundColor), menuAccent);
      assert.equal(await switcher().locator('.driver-avatar img').count(), 2);
      await switcher().locator('.driver-avatar img').evaluateAll(images => Promise.all(images.map(img => img.decode())));
      const profileBox = await page.getByRole('region', { name: 'Profil: Rafał Gustab', exact: true }).boundingBox();
      assert.ok(switcherBox && profileBox);
      if (width >= 1024) assert.ok(switcherBox.x + switcherBox.width < profileBox.x, 'driver switcher stays left of the profile');
      else assert.ok(switcherBox.y + switcherBox.height <= profileBox.y, 'mobile switcher stays above the profile');
      await layout('driver-switcher');
      await switchDriver('Yevhenii Pitianin', 'zenia');
      assert.equal(await driver().getByRole('button').count(), 6);
      assert.equal(new URL(page.url()).searchParams.get('widok'), 'koszty');
      assert.equal(new URL(page.url()).searchParams.get('miesiac'), '11');
      await page.goBack();
      await page.getByRole('region', { name: 'Profil: Rafał Gustab', exact: true }).waitFor();
      await page.goForward();
      await page.getByRole('region', { name: 'Profil: Yevhenii Pitianin', exact: true }).waitFor();
      await switchDriver('Rafał Gustab', 'rafal');
      await driverView('Umowa');
      await switchDriver('Yevhenii Pitianin', 'zenia');
      assert.equal(new URL(page.url()).searchParams.get('widok'), 'wyplata');
      await switchDriver('Rafał Gustab', 'rafal');
      assert.equal(new URL(page.url()).searchParams.get('widok'), 'wyplata');
      await page.getByLabel('Kursy 2026-11-03', { exact: true }).fill('7');
      await switchDriver('Yevhenii Pitianin', 'zenia');
      await switchDriver('Rafał Gustab', 'rafal');
      await page.getByText('Niezapisane dni: 1', { exact: false }).waitFor();
      assert.equal(await page.getByLabel('Kursy 2026-11-03', { exact: true }).inputValue(), '7');
      await page.getByRole('button', { name: 'Odrzuć niezapisane zmiany', exact: true }).click();
      assert.equal(JSON.stringify(state), beforeSwitching, 'switching never changes financial records');
      assert.equal(writes.length, writesBeforeSwitching);
      await driverView('Dni i wypłata');
      assert.equal(await page.getByRole('table', { name: 'Dni pracy kierowcy' }).getByRole('row', { includeHidden: true }).count(), 31);
      const emptySalary = page.getByRole('region', { name: 'Podsumowanie wypłaty Rafała', exact: true });
      const emptySalaryValue = label => emptySalary.locator('.pv-row,.pv-payroll-total').filter({ has: page.getByText(label, { exact: true }) }).locator('strong');
      assert.equal(await emptySalaryValue('Zarobione z dni i kursów').innerText(), '0,00 zł');
      assert.equal(await emptySalaryValue('Oficjalna część · netto z umowy').innerText(), '3605,85 zł');
      assert.equal(await emptySalaryValue('Podatek i składki z umowy').innerText(), '2184,43 zł');
      assert.equal(await emptySalaryValue('Łączny koszt z podatkiem i składkami').innerText(), '5790,28 zł');
      await emptySalary.screenshot({ path: path.join(out, `${width}-rafal-empty-payroll.png`) });
      await page.getByLabel('Kursy 2026-11-03', { exact: true }).fill('2');
      failNext = true;
      await page.getByRole('button', { name: 'Zapisz dni', exact: true }).first().click();
      await page.getByRole('alert').filter({ hasText: 'Test: zapis niedostępny' }).waitFor();
      assert.equal(state.miesiace[11].rafal, undefined);
      await page.getByRole('button', { name: 'Zapisz dni', exact: true }).first().click();
      await page.getByText('Wszystkie zmiany zapisane', { exact: false }).waitFor();
      await page.getByRole('table', { name: 'Dni pracy kierowcy' }).getByText('180,00 zł', { exact: true }).waitFor();
      assert.equal(state.miesiace[11].rafal.days[0].courses, 2);
      await page.reload(); await page.getByRole('table').getByText('180,00 zł', { exact: true }).waitFor(); await layout('rafal-pay');
      const dayCard = page.getByTestId('rafal-day-2026-11-03');
      await dayCard.screenshot({ path: path.join(out, `${width}-rafal-day.png`) });
      const columnLayout = card => card.evaluate(row => {
        const bounds = row.getBoundingClientRect();
        return ['.rf-date', '.rf-status select', '.rf-courses input', '.rf-amount'].map(selector => {
          const rect = row.querySelector(selector).getBoundingClientRect();
          return [Math.round(rect.left - bounds.left), Math.round(rect.width), Math.round(rect.top - bounds.top)];
        });
      });
      const rafalColumns = await columnLayout(dayCard);
      if (width < 640) {
        const courseBox = await dayCard.getByLabel('Kursy 2026-11-03', { exact: true }).boundingBox();
        const statusBox = await dayCard.getByLabel('Status 2026-11-03', { exact: true }).boundingBox();
        assert.ok(courseBox.y >= statusBox.y + statusBox.height && courseBox.width > statusBox.width, 'mobile courses occupy the full row, like Zenia');
      }
      await driverView('Samochód i działalność');
      await page.getByText('Dane i przypisanie pojazdu', { exact: true }).click();
      await page.getByLabel('Nazwa pojazdu', { exact: true }).fill('Auto Rafała');
      await page.getByLabel('Rejestracja', { exact: true }).fill('TEST 2');
      await page.getByLabel('Pojemność baku (l)', { exact: true }).fill('100');
      await page.getByRole('button', { name: 'Zapisz pojazd', exact: true }).click();
      await page.getByRole('button', { name: '+ Dodaj koszt', exact: true }).click();
      await page.getByPlaceholder('Opis…', { exact: true }).fill('Serwis Rafała');
      await page.getByPlaceholder('0', { exact: true }).first().fill('123');
      // Switch into a fleet write while an ordinary debounced write is pending.
      delaySave = true;
      await driverView('Dni i wypłata');
      await page.getByLabel('Kursy 2026-11-04', { exact: true }).fill('3');
      await page.getByRole('button', { name: 'Zapisz dni', exact: true }).first().click();
      await page.getByText('Wszystkie zmiany zapisane', { exact: false }).waitFor();
      await page.getByRole('table').getByText('270,00 zł', { exact: true }).waitFor(); delaySave = false;
      assert.equal(state.miesiace[11].inneKoszty.find(c => c.driverId === 'rafal').koszt, 123);
      assert.equal(state.miesiace[11].inneKoszty.find(c => c.id === previewFixture.miesiace[11].inneKoszty[0].id).koszt, 300);
      assert.deepEqual(state.miesiace[11].dni, previewFixture.miesiace[11].dni);
      await driverView('Tankowanie');
      await page.getByRole('button', { name: '+ Dodaj tankowanie', exact: true }).click();
      await page.waitForFunction(() => document.body.textContent.includes('Zapisano'));
      await page.waitForTimeout(800);
      const fuel = state.miesiace[11].tankowanie.find(t => t.driverId === 'rafal');
      assert.ok(fuel); assert.equal(fuel.vehicleId, state.vehicles.find(v => v.driverId === 'rafal').id);
      await layout('rafal-fuel');
      await driverView('Statystyki tankowania'); await layout('rafal-stats');
      await menu().getByRole('button', { name: 'Kierowcy', exact: true }).click();
      await page.getByRole('button', { name: 'Yevhenii Pitianin', exact: true }).click();
      await driverView('Samochód i działalność');
      assert.equal(await page.locator('input[value="Serwis Rafała"]').count(), 0);
      await driverView('Dni i wypłata');
      const zeniaSalary = page.getByRole('region', { name: 'Podsumowanie wypłaty Żeni', exact: true });
      await zeniaSalary.getByText('Łączny koszt z podatkiem i składkami', { exact: true }).waitFor();
      const zeniaDay = page.getByTestId('zenia-day-2026-11-03');
      assert.deepEqual(await columnLayout(zeniaDay), rafalColumns, 'identical date, status, courses and pay columns');
      assert.equal(await page.getByRole('table', { name: 'Dni pracy kierowcy' }).getByRole('row', { includeHidden: true }).count(), 31);
      await zeniaDay.screenshot({ path: path.join(out, `${width}-zenia-day.png`) });
      const zeniaInput = zeniaDay.getByLabel('Kursy 2026-11-03', { exact: true });
      const unchangedRafal = structuredClone(state.miesiace[11].rafal);
      const original = await zeniaInput.inputValue();
      const manual = zeniaSalary.getByRole('button', { name: 'Zapisz dni' });
      const beforeSave = writes.length;
      failNext = true;
      await zeniaInput.fill(original === '3' ? '2' : '3');
      await zeniaSalary.getByRole('status').filter({ hasText: 'Nie zapisano zmian' }).waitFor();
      await manual.click();
      await zeniaSalary.getByRole('status').filter({ hasText: 'Wszystkie zmiany zapisane' }).waitFor();
      assert.equal(writes.length, beforeSave + 1);
      assert.deepEqual(state.miesiace[11].rafal, unchangedRafal);
      await zeniaDay.getByText('300,00 zł', { exact: true }).waitFor();
      assert.equal(await manual.isDisabled(), true);
      await zeniaInput.fill(original);
      await zeniaSalary.getByRole('status').filter({ hasText: 'Wszystkie zmiany zapisane' }).waitFor();
      assert.equal(writes.length, beforeSave + 2);
      await zeniaInput.fill(original === '4' ? '5' : '4');
      await zeniaInput.fill(original);
      await zeniaSalary.getByRole('status').filter({ hasText: 'Wszystkie zmiany zapisane' }).waitFor();
      assert.equal(writes.length, beforeSave + 2, 'reverting before autosave needs no write');
      const zeniaResult = obliczWynikMiesiaca(11, state.miesiace[11], getUstawienia(state));
      assert.deepEqual(await zeniaSalary.locator('.pv-payroll-total strong').allTextContents(), [formatZl(zeniaResult.wynagrodzenieDoWyplaty), formatZl(zeniaResult.wynagrodzenieDoWyplaty + zeniaResult.obciazeniaPracownika)]);
      await zeniaSalary.screenshot({ path: path.join(out, `${width}-zenia-closeout.png`) });
      await page.getByText('Historia zmian', { exact: true }).waitFor();
      await page.getByText('Rozliczenie wypłaty, potrącenia i PDF', { exact: true }).click();
      await page.getByRole('button', { name: 'Oznacz jako wypłacone', exact: true }).waitFor(); await layout('zenia-pay');
      await menu().getByRole('button', { name: 'Menu główne', exact: true }).click();
      await company().getByRole('button', { name: /Podsum/ }).click();
      const cash = formatZl(podatkiMiesiaca(state, 11).cashflowPoPodatkach);
      assert.ok((await page.locator('main').innerText()).includes(cash));
      await company().getByRole('button', { name: 'Podatki', exact: true }).click();
      const checkCompanyTax = async month => {
        const tax = podatkiMiesiaca(state, month);
        const result = obliczWynikMiesiaca(month, state.miesiace[month], getUstawienia(state));
        const liabilities = Math.max(0, tax.vatDoZaplaty) + tax.pitMiesiac + tax.zdrowotna + tax.obciazeniaPracownika + tax.rafal.charges;
        const summary = page.getByTestId('company-tax-summary');
        await summary.waitFor();
        const value = label => summary.locator('dt').filter({ has: page.locator('span', { hasText: label }) }).first().locator('..').locator('dd');
        assert.equal(await value('Wypłaty kierowców razem').innerText(), formatZl(result.wynagrodzenieDoWyplaty + tax.rafal.payout));
        assert.equal(await value('Podatki i składki razem').innerText(), formatZl(liabilities));
        assert.equal(await value('Paliwo obu aut').innerText(), formatZl(result.paliwo));
        assert.ok((await summary.innerText()).includes(formatZl(tax.cashflowPoPodatkach)));
        assert.ok((await page.getByTestId(`tax-liability-${month}`).innerText()).includes(formatZl(liabilities)));
        return tax;
      };
      const novemberTax = await checkCompanyTax(11);
      assert.ok(novemberTax.rafal.charges > 0);
      await page.getByText('Składniki kosztów i podatków', { exact: true }).click();
      await layout('company-taxes');
      await page.getByTestId('tax-liability-11').click();
      await page.waitForFunction(() => document.querySelector('[data-testid="tax-liability-11"]').getAttribute('aria-pressed') === 'true');
      await page.waitForTimeout(1200);
      assert.equal(state.podatkiOplacone[11].oplacono, true);
      assert.deepEqual(await checkCompanyTax(11), novemberTax, 'paid marker never changes income, costs or tax');
      await page.getByRole('button', { name: 'Cze', exact: true }).click();
      await page.getByRole('heading', { name: 'Czerwiec 2026 · cała firma', exact: true }).waitFor();
      assert.equal((await checkCompanyTax(6)).rafal.charges, 0);
      await layout('june-taxes');
      await page.getByRole('button', { name: 'Lis', exact: true }).click();
      await page.getByRole('heading', { name: 'Listopad 2026 · cała firma', exact: true }).waitFor();
      await checkCompanyTax(11);
      await page.goBack(); await company().getByRole('button', { name: 'Koszty', exact: true }).waitFor();
      await page.getByRole('button', { name: 'Lis', exact: true }).click();
      await menu().getByRole('button', { name: 'Kierowcy', exact: true }).click();
      await page.getByRole('button', { name: 'Rafał Gustab', exact: true }).click();
      await driverView('Dni i wypłata');
      await page.getByLabel('Kursy 2026-11-05', { exact: true }).fill('8');
      revision = new Date(Date.parse(revision) + 1000).toISOString();
      await page.getByRole('button', { name: 'Zapisz dni', exact: true }).first().click();
      await page.getByRole('alert').filter({ hasText: /dane zmieni|dane zmienione|odśwież panel/i }).waitFor();
      assert.equal(state.miesiace[11].rafal.days.some(d => d.date === '2026-11-05'), false);
      await page.reload();
      await page.getByText('Niezapisane dni: 1', { exact: false }).waitFor();
      assert.equal(await page.getByLabel('Kursy 2026-11-05', { exact: true }).inputValue(), '8');
      await page.getByRole('button', { name: 'Odrzuć niezapisane zmiany', exact: true }).click();
      await page.getByText('Historia zmian', { exact: true }).click();
      await page.getByRole('button', { name: 'Cofnij zmianę', exact: true }).click();
      await page.getByText('Rafał: dni miesiąca 11 (1) · cofnięto', { exact: true }).waitFor();
      assert.equal(state.miesiace[11].rafal.days.length, 1);
      assert.equal(state.miesiace[11].inneKoszty.find(c => c.driverId === 'rafal').koszt, 123);
      assert.equal(await page.getByRole('button', { name: 'Cofnij zmianę', exact: true }).count(), 1);
      // Whole-month entry, payout split and all statuses use the same saved payroll model.
      const savedBeforeCalendar = structuredClone(state);
      for (let day = 1; day <= 30; day++) await page.getByLabel(`Kursy 2026-11-${String(day).padStart(2, '0')}`, { exact: true }).fill('2');
      await page.getByRole('button', { name: 'Zapisz dni', exact: true }).first().click();
      await page.getByText('Wszystkie zmiany zapisane', { exact: false }).waitFor();
      assert.equal(state.miesiace[11].rafal.days.length, 30);
      assert.deepEqual(state.miesiace[11].dni, savedBeforeCalendar.miesiace[11].dni);
      assert.deepEqual(state.miesiace[6], savedBeforeCalendar.miesiace[6]);
      const salary = page.getByRole('region', { name: 'Podsumowanie wypłaty Rafała', exact: true });
      const salaryRow = label => salary.locator('.pv-row,.pv-payroll-total').filter({ has: page.getByText(label, { exact: true }) }).locator('strong');
      assert.equal(await salaryRow('Zarobione z dni i kursów').innerText(), '5400,00 zł');
      assert.equal(await salaryRow('Oficjalna część · netto z umowy').innerText(), '3605,85 zł');
      assert.equal(await salaryRow('Pozostała wypłata ponad netto umowy').innerText(), '1794,15 zł');
      assert.equal(await salaryRow('Razem do wypłaty').innerText(), '5400,00 zł');
      assert.equal(await salaryRow('Łączny koszt z podatkiem i składkami').innerText(), '7584,43 zł');
      await salary.screenshot({ path: path.join(out, `${width}-rafal-month-summary.png`) });
      if (width >= 1024) {
        await page.evaluate(() => window.scrollTo(0, 1000));
        const sidebar = await switcher().boundingBox();
        const header = await page.getByRole('banner').boundingBox();
        assert.ok(sidebar.y >= header.y + header.height && sidebar.y < 200, 'sticky switcher remains below the header');
        await page.screenshot({ path: path.join(out, `${width}-driver-switcher-scrolled.png`) });
      }
      await page.getByLabel('Status 2026-11-01', { exact: true }).selectOption('postojowe');
      await page.getByLabel('Status 2026-11-02', { exact: true }).selectOption('urlop');
      await page.getByLabel('Urlop 2026-11-02', { exact: true }).fill('150.50');
      await page.getByLabel('Status 2026-11-03', { exact: true }).selectOption('praca_zlecenia');
      await page.getByLabel('Zlecenia 2026-11-03', { exact: true }).fill('80.25');
      await page.getByRole('button', { name: 'Komentarz 2026-11-03', exact: true }).click();
      await page.getByLabel('Treść komentarza 2026-11-03', { exact: true }).fill('Dodatkowy odbiór');
      await page.getByLabel('Status 2026-11-04', { exact: true }).selectOption('wolne');
      await page.getByLabel('Kursy 2026-11-05', { exact: true }).fill('1e20');
      await page.getByRole('alert').filter({ hasText: 'Sprawdź kursy' }).waitFor();
      await page.getByLabel('Kursy 2026-11-05', { exact: true }).fill('2');
      await layout('rafal-calendar-statuses');
      await page.getByRole('button', { name: 'Zapisz dni', exact: true }).first().click();
      await page.getByText('Wszystkie zmiany zapisane', { exact: false }).waitFor();
      await page.reload(); await salary.waitFor();
      assert.equal(await salaryRow('Razem do wypłaty').innerText(), '5140,75 zł');
      assert.equal(state.miesiace[11].rafal.days[2].note, 'Dodatkowy odbiór');
      await menu().getByRole('button', { name: 'Menu główne', exact: true }).click();
      await company().getByRole('button', { name: 'Podatki', exact: true }).click();
      assert.equal((await checkCompanyTax(11)).rafal.payout, 5140.75);
      await menu().getByRole('button', { name: 'Kierowcy', exact: true }).click();
      await page.getByRole('button', { name: 'Rafał Gustab', exact: true }).click();
      await driverView('Dni i wypłata');
      await page.getByRole('button', { name: 'Gru', exact: true }).click();
      await page.getByRole('form', { name: 'Dni i wypłata Rafała' }).getByText('Grudzień 2026', { exact: true }).waitFor();
      assert.equal(await page.getByRole('table').getByRole('row', { includeHidden: true }).count(), 32);
      assert.equal(await salaryRow('Zarobione z dni i kursów').innerText(), '0,00 zł');
      assert.equal(await salaryRow('Łączny koszt z podatkiem i składkami').innerText(), '5790,28 zł');
      await switchDriver('Yevhenii Pitianin', 'zenia');
      await switchDriver('Rafał Gustab', 'rafal');
      assert.equal(new URL(page.url()).searchParams.get('miesiac'), '12');
      assert.equal(new URL(page.url()).searchParams.get('widok'), 'wyplata');
      await page.getByLabel('Kursy 2026-12-31', { exact: true }).fill('3');
      await page.getByRole('button', { name: 'Lis', exact: true }).click();
      await page.getByRole('form', { name: 'Dni i wypłata Rafała' }).getByText('Listopad 2026', { exact: true }).waitFor();
      assert.equal(await salaryRow('Razem do wypłaty').innerText(), '5140,75 zł');
      await page.getByRole('button', { name: 'Gru', exact: true }).click();
      await page.getByText('Niezapisane dni: 1', { exact: false }).waitFor();
      assert.equal(await page.getByLabel('Kursy 2026-12-31', { exact: true }).inputValue(), '3');
      assert.equal(state.miesiace[12]?.rafal, undefined);
      await page.getByRole('button', { name: 'Odrzuć niezapisane zmiany', exact: true }).click();
      await page.getByRole('button', { name: 'Lis', exact: true }).click();
      state.miesiace[11].zamkniety = { locked: true }; revision = new Date(Date.parse(revision) + 1000).toISOString();
      await page.reload(); await page.getByText('Miesiąc zamknięty. Edycja jest zablokowana.', { exact: true }).waitFor();
      assert.equal(await page.getByLabel('Kursy 2026-11-05', { exact: true }).isDisabled(), true);
      assert.equal(await page.getByRole('button', { name: 'Zapisz dni', exact: true }).first().isDisabled(), true);
      await switchDriver('Yevhenii Pitianin', 'zenia');
      await switchDriver('Rafał Gustab', 'rafal');
      assert.equal(await page.getByRole('button', { name: 'Zapisz dni', exact: true }).first().isDisabled(), true);
      await page.getByRole('button', { name: 'Cze', exact: true }).click();
      await switchDriver('Yevhenii Pitianin', 'zenia');
      const training = page.getByTestId('zenia-day-2026-06-02');
      await training.getByLabel('Szkolenie 2026-06-02', { exact: true }).fill('50.37');
      await training.getByText('250,37 zł', { exact: true }).waitFor();
      await page.getByRole('region', { name: 'Podsumowanie wypłaty Żeni' }).getByRole('status').filter({ hasText: 'Wszystkie zmiany zapisane' }).waitFor();
      assert.equal(state.miesiace[6].dni['2026-06-02'].szkolenie, 50.37);
      await page.goto(base + '&uklad=klasyczny');
      await page.getByRole('button', { name: 'Oznacz jako wypłacone', exact: true }).waitFor();
      assert.equal(await menu().count(), 0);
      assert.deepEqual(errors, []);
      await page.close(); console.log(`PASS ${width}: navigation, pay/cost save and undo, monthly calendar 30/31 days, all statuses, comments, draft recovery, payout split, company tax reconciliation, failure/conflict/locked month, responsive layout`);
    }
  } finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
