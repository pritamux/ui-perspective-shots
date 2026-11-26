// Renders each scene flat (no camera, no blur) to out/flat-<scene>.png, to check that the
// pages read right before any camera work. Prints page errors.
//
//   node kit/flat.cjs                 every scene in PAGE
//   node kit/flat.cjs home,tx         just these
//
// If the project defines FLAT_STATE = { scene: () => {…} }, that state is applied first.
const { chromium } = require("playwright-core");
const path = require("path");

(async () => {
  const b = await chromium.launch({ channel: "chrome", args: ["--allow-file-access-from-files"] });
  const p = await b.newPage({ viewport: { width: 1920, height: 1080 } });
  const errs = [];
  p.on("pageerror", (e) => errs.push(e.message));
  p.on("console", (m) => m.type() === "error" && errs.push(m.text()));
  await p.goto("file://" + path.resolve("index.html"));
  await p.evaluate(() => document.fonts.ready);
  await p.waitForTimeout(400);
  const scenes = process.argv[2] ? process.argv[2].split(",") : await p.evaluate(() => Object.keys(PAGE));
  for (const scene of scenes) {
    await p.evaluate((scene) => {
      if (typeof FLAT_STATE !== "undefined" && FLAT_STATE[scene]) FLAT_STATE[scene]();
      placeCamera({ scene, tx: 0, ty: 0, rx: 0, rz: 0, dz: 0, ox: -innerWidth / 2, oy: -innerHeight / 2, p: 100000 });
      document.querySelectorAll(".layer").forEach((l, i) => (l.style.cssText = i ? "display:none" : ""));
      ["fx-light", "fx-vig", "grain"].forEach((id) => (document.getElementById(id).style.display = "none"));
    }, scene);
    await p.screenshot({ path: `out/flat-${scene}.png` });
    console.log(`out/flat-${scene}.png`);
  }
  console.log(errs.join("\n") || "no errors");
  await b.close();
})();
