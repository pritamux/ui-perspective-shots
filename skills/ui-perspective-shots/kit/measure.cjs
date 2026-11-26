// Prints where elements sit on a flat scene, in the scene coordinates the camera uses
// (tx/ty and focus x/y). Aim shots from these numbers, never from a screenshot.
//
//   node kit/measure.cjs action "dt=Current status" "dt=Fill size" "h1" "[aria-label=\"Latest transactions\"]"
//
// "dt=Label" finds a record row by its label; anything else is a CSS selector.
const { chromium } = require("playwright-core");
const path = require("path");

(async () => {
  const [scene, ...targets] = process.argv.slice(2);
  const b = await chromium.launch({ channel: "chrome", args: ["--allow-file-access-from-files"] });
  const p = await b.newPage({ viewport: { width: 1920, height: 1080 } });
  await p.goto("file://" + path.resolve("index.html"));
  await p.waitForTimeout(300);
  console.log(await p.evaluate(([scene, targets]) => {
    placeCamera({ scene, tx: 0, ty: 0, rx: 0, rz: 0, dz: 0, ox: -innerWidth / 2, oy: -innerHeight / 2, p: 100000 });
    const root = document.querySelector(`#L0 .scene[data-s="${scene}"]`);
    return targets.map((t) => {
      const el = t.startsWith("dt=")
        ? [...root.querySelectorAll("dt")].find((d) => d.textContent.trim() === t.slice(3))?.parentElement
        : root.querySelector(t);
      if (!el) return `${t}: not found`;
      const r = el.getBoundingClientRect();
      return `${t}: x ${Math.round(r.left)}–${Math.round(r.right)}  y ${Math.round(r.top)}–${Math.round(r.bottom)}  centre (${Math.round((r.left + r.right) / 2)}, ${Math.round((r.top + r.bottom) / 2)})`;
    }).join("\n");
  }, [scene, targets]));
  await b.close();
})();
