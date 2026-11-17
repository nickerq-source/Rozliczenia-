/* eslint-disable @typescript-eslint/no-require-imports -- Standalone browser check; never submits credentials. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const sharp = require("sharp");

(async () => {
  const out = path.resolve("tmp/invoice-ui/login-print");
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ headless: true, channel: "chrome" });
  try {
    for (const width of [320, 390, 1280]) {
      const page = await browser.newPage({ viewport: { width, height: 844 }, isMobile: width < 640, deviceScaleFactor: 1 });
      const errors = [];
      page.on("pageerror", e => errors.push(e.message));
      const response = await page.goto(new URL("/login", process.env.LOGIN_BASE_URL || "http://localhost:3000").href);
      assert.equal(response.status(), 200);
      const form = page.locator("form");
      await form.waitFor();
      await page.evaluate(async () => {
        await document.fonts.ready;
        const form = document.querySelector("form"), title = document.querySelector("h1");
        for (const url of [
          getComputedStyle(form, "::before").backgroundImage,
          getComputedStyle(title).maskImage, 'url("/papitrans-bg.jpg")',
        ]) {
          const image = new Image(); image.src = url.match(/url\(["']?(.*?)["']?\)/)[1]; await image.decode();
        }
      });
      const title = page.getByRole("heading", { level: 1 });
      assert.equal(await title.textContent(), "PapiTrans");
      assert.ok(await title.locator("..").locator('img[alt=""]').evaluate(async img => {
        await img.decode();
        const box = img.getBoundingClientRect();
        const name = img.parentElement.querySelector("h1").getBoundingClientRect();
        return img.naturalWidth >= box.width * 3 && img.naturalWidth > img.naturalHeight &&
          box.width >= 88 && box.width <= 120 && box.bottom <= name.top + 1;
      }), "the transparent high-density truck fits above the wordmark before login");
      assert.ok(await title.evaluate(el => {
        const s = getComputedStyle(el);
        return s.fontWeight === "900" && s.fontStyle === "italic" &&
          [...document.fonts].some(face => s.fontFamily.includes(face.family.replaceAll('"', "")) && face.status === "loaded");
      }));
      assert.ok(await page.evaluate(() => {
        const form = document.querySelector("form").getBoundingClientRect();
        return document.documentElement.scrollWidth === innerWidth && form.left >= 0 && form.right <= innerWidth &&
          [...document.querySelectorAll("form input, form button")].every(el => {
            const r = el.getBoundingClientRect();
            return r.left >= form.left + 15 && r.right <= form.right - 15;
          });
      }));
      const decode = png => sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true });
      const printed = await decode(await form.screenshot());
      const backdrop = await decode(await form.screenshot({ style: "form::before { visibility:hidden }" }));
      const { width: w, height: h, channels } = printed.info;
      const difference = (fx, fy) => {
        const i = (Math.floor(h * fy) * w + Math.floor(w * fx)) * channels;
        return Math.max(...[0,1,2].map(c => Math.abs(printed.data[i+c] - backdrop.data[i+c])));
      };
      // The recessed corners can retain a soft shadow but must not be filled with stock.
      assert.ok(difference(.992,.975) < difference(.5,.018), "background visible beneath the missing corner");
      await page.getByRole("button", { name: "Pokaż hasło" }).click();
      await page.getByRole("button", { name: "Ukryj hasło" }).click();
      assert.equal(await form.locator('input[autocomplete="current-password"]').getAttribute("type"), "password");
      await page.getByRole("button", { name: "Zaloguj się" }).waitFor();
      await page.screenshot({ path: path.join(out, width + ".png") });
      assert.deepEqual(errors, []);
      await page.close();
      console.log("PASS /login " + width + " px");
    }
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
