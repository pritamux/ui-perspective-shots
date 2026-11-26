// Captures live pages from a running dev server: each page's DOM, the compiled CSS and the
// fonts it references, then bundles them into capture/data.js for the stage.
//
//   node kit/capture.cjs            (reads shots.config.json in the project folder)
//
// shots.config.json:
// {
//   "base": "http://localhost:3000",
//   "viewport": [1440, 1000],
//   "settle": 9000,
//   "pages": { "home": "/dashboard", "record": "/orders/1042" },
//   "popovers": [{ "name": "popover", "page": "/dashboard", "click": "input", "type": "1042",
//                  "selector": "[data-slot=\"popover-content\"]" }]
// }
const { chromium } = require("playwright-core");
const fs = require("fs");

const cfg = JSON.parse(fs.readFileSync("shots.config.json", "utf8"));
const [W, H] = cfg.viewport || [1440, 1000];
const SETTLE = cfg.settle ?? 9000;

(async () => {
  fs.mkdirSync("capture/fonts", { recursive: true });
  const b = await chromium.launch({ channel: "chrome" });
  const p = await b.newPage({ viewport: { width: W, height: H }, colorScheme: "dark" });
  const bundle = {};
  let css = null, root = null;

  for (const [name, url] of Object.entries(cfg.pages)) {
    await p.goto(cfg.base + url, { waitUntil: "domcontentloaded", timeout: 120000 });
    await p.waitForSelector("h1", { timeout: 90000 });
    await p.waitForTimeout(SETTLE);
    const res = await p.evaluate(() => {
      document.querySelectorAll("nextjs-portal, script, noscript, [data-sonner-toaster], iframe").forEach((e) => e.remove());
      let wrap = document.querySelector("h1");
      while (wrap.parentElement && wrap.parentElement !== document.body) wrap = wrap.parentElement;
      const css = [...document.styleSheets].map((s) => { try { return [...s.cssRules].map((r) => r.cssText).join("\n"); } catch { return ""; } }).join("\n");
      const sheet = [...document.styleSheets].find((s) => s.href)?.href || location.href;
      return { html: wrap.outerHTML, css, sheet, html_class: document.documentElement.className };
    });
    bundle[name] = res.html;
    css = css || { text: res.css, sheet: res.sheet };
    root = root || { html_class: res.html_class };
    console.log(name, res.html.length);
  }

  for (const pop of cfg.popovers || []) {
    await p.goto(cfg.base + pop.page, { waitUntil: "domcontentloaded", timeout: 120000 });
    await p.waitForSelector(pop.click, { timeout: 90000 });
    await p.waitForTimeout(SETTLE / 2);
    await p.click(pop.click);
    await p.keyboard.type(pop.type, { delay: 15 });
    await p.waitForTimeout(5000);
    bundle[pop.name] = await p.evaluate((sel) => document.querySelector(sel)?.outerHTML || null, pop.selector);
    console.log(pop.name, bundle[pop.name] ? bundle[pop.name].length : "NOT FOUND");
  }

  // Fonts: resolve each url() against the stylesheet it came from, save locally, rewrite.
  let text = css.text;
  const urls = [...new Set([...text.matchAll(/url\("?([^")]+\.(?:woff2?|ttf|otf))"?\)/g)].map((m) => m[1]))];
  for (const u of urls) {
    const abs = new URL(u, css.sheet).href;
    // Keep only a safe basename, so a URL can never write outside capture/fonts/.
    const file = "fonts/" + (abs.split("/").pop().split("?")[0].replace(/[^\w.-]/g, "_").replace(/^\.+/, "") || "font.woff2");
    const r = await p.request.get(abs);
    if (!r.ok()) { console.log("font failed", abs); continue; }
    fs.writeFileSync("capture/" + file, await r.body());
    text = text.split(u).join(file);
  }
  fs.writeFileSync("capture/app.css", text);
  bundle.root = root;
  fs.writeFileSync("capture/data.js", "window.CAPTURE=" + JSON.stringify(bundle) + ";");
  console.log("fonts", urls.length, "→ capture/data.js");
  await b.close();
})();
