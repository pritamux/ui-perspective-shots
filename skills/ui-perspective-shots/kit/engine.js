// Perspective-shot engine: camera, depth of field, light, grain, keyframes, end card, render loop.
document.documentElement.className = CAPTURE.root.html_class;
// The project file (project.js) supplies PAGE, BUILD, cleanChrome, afterBuild, REELS, STILLS.
const VW = innerWidth, VH = innerHeight;
const Z = 1.5; // captured pages drawn at 1.5x so text stays crisp on the plane

/* ---------- maths ---------- */
// Cubic Bézier easing with CSS cubic-bezier() semantics. Both axes in Bernstein form; x is inverted
// from a 64-sample table, then refined with a few Newton steps inside the bracketing sample.
function cubicBezier(p1x, p1y, p2x, p2y) {
  const B = (t, a, b) => 3 * (1 - t) * (1 - t) * t * a + 3 * (1 - t) * t * t * b + t * t * t;
  const dB = (t, a, b) => 3 * (1 - t) * (1 - t) * a + 6 * (1 - t) * t * (b - a) + 3 * t * t * (1 - b);
  const N = 64, table = Float64Array.from({ length: N + 1 }, (_, i) => B(i / N, p1x, p2x));
  return (x) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let i = 0;
    while (i < N - 1 && table[i + 1] < x) i++;
    let t = (i + (x - table[i]) / (table[i + 1] - table[i] || 1)) / N;
    for (let k = 0; k < 6; k++) {
      const slope = dB(t, p1x, p2x);
      if (Math.abs(slope) < 1e-7) break;
      t = Math.min(1, Math.max(0, t - (B(t, p1x, p2x) - x) / slope));
    }
    return B(t, p1y, p2y);
  };
}
const bez = cubicBezier;
// Ease-out for things arriving, ease-in-out for things already on screen moving.
// Curve values are the standard ones published at easings.net.
const easeOutQuint = bez(0.23, 1, 0.32, 1);
const easeOutQuart = bez(0.165, 0.84, 0.44, 1);
const easeInOutCubic = bez(0.645, 0.045, 0.355, 1);
const easeOut = bez(0.22, 1, 0.36, 1);
const easeIO = bez(0.65, 0, 0.35, 1);
const drift = bez(0.37, 0, 0.63, 1);
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lerp = (a, b, t) => a + (b - a) * t;
const seg = (t, start, dur) => clamp((t - start) / dur);
// Seeded PRNG: xorshift32 (Marsaglia 2003), seed scrambled so neighbouring seeds diverge at once.
function prng(seed) {
  let s = (Math.imul(seed ^ 0x9e3779b9, 0x85ebca6b) ^ 0xc2b2ae35) >>> 0 || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}


const mix = (a, b, p) => Object.fromEntries(Object.keys(a).map((k) => [k, typeof a[k] === "number" ? lerp(a[k], b[k], p) : a[k]]));
const K = (k) => document.querySelectorAll(`[data-k="${k}"]`);
const setAll = (k, fn) => K(k).forEach(fn);

/* ---------- DOM helpers ---------- */
function replaceText(root, from, to) {
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n; (n = w.nextNode()); ) if (n.nodeValue.includes(from)) n.nodeValue = n.nodeValue.split(from).join(to);
}
const byText = (root, sel, text) => [...root.querySelectorAll(sel)].filter((e) => e.textContent.trim() === text);
const dds = (root, label) => byText(root, "dt", label).map((dt) => dt.nextElementSibling).filter(Boolean);
const setDD = (root, label, html) => dds(root, label).forEach((dd) => (dd.innerHTML = html));
const dropRow = (root, label) => byText(root, "dt", label).forEach((dt) => dt.parentElement.remove());


/* ---------- layers: the scene three times (sharp, soft, heavy blur) ---------- */
let LAYERS = [];
const sceneOf = (L, name) => L.scenes.find((s) => s.dataset.s === name);
function buildLayers() {
  LAYERS = ["L0", "L1", "L2"].map((id) => {
    const el = document.getElementById(id);
    // One camera per scene, so two scenes can be on screen at once during a dissolve.
    el.innerHTML = Object.keys(PAGE).map((s) => `<div class="cam" data-s="${s}"><div class="rig"><div class="scene" data-s="${s}"><div class="zoom" style="zoom:${Z};width:${PAGE[s][0]}px;height:${PAGE[s][1]}px">${CAPTURE[s]}</div></div></div></div>`).join("");
    const scenes = [...el.querySelectorAll(".scene")];
    for (const s of scenes) {
      const zoom = s.firstElementChild, page = zoom.firstElementChild, [w, h] = PAGE[s.dataset.s];
      cleanChrome(page); BUILD[s.dataset.s]?.(zoom);
      page.style.height = h + "px"; page.style.width = w + "px";
    }
    return { el, cams: [...el.querySelectorAll(".cam")], scenes };
  });
}
// Run fn with one scene laid out flat in every layer (for measuring before any camera).
function withSceneShown(name, fn) {
  for (const L of LAYERS) sceneOf(L, name).style.display = "block";
  try { return fn(); } finally { for (const L of LAYERS) sceneOf(L, name).style.display = "none"; }
}

/* ---------- camera ---------- */
function projector(c) {
  const m = new DOMMatrix().translate(VW / 2 + c.ox, VH / 2 + c.oy, c.dz).rotateAxisAngle(1, 0, 0, c.rx).rotateAxisAngle(0, 0, 1, c.rz);
  return (x, y, z = 0) => { const p = m.transformPoint(new DOMPoint(x, y, z, 1)); const k = c.p / (c.p - p.z); return { x: VW / 2 + (p.x - VW / 2) * k, y: VH / 2 + (p.y - VH / 2) * k, z: p.z }; };
}
// list: [[cam, opacity], …] back to front. Scenes not listed are hidden.
function placeCameras(list) {
  document.getElementById("endcard").style.display = "none";
  for (const L of LAYERS) {
    L.el.style.visibility = "visible";
    for (const cam of L.cams) cam.style.display = "none";
    list.forEach(([c, alpha], i) => {
      const cam = L.cams.find((x) => x.dataset.s === c.scene), scene = cam.querySelector(".scene");
      Object.assign(cam.style, { display: "block", opacity: alpha, zIndex: i, perspective: c.p + "px" });
      cam.firstElementChild.style.transform = `translate3d(${VW / 2 + c.ox}px, ${VH / 2 + c.oy}px, ${c.dz}px) rotateX(${c.rx}deg) rotateZ(${c.rz}deg)`;
      scene.style.display = "block"; scene.style.transform = `translate(${-c.tx}px, ${-c.ty}px)`;
    });
  }
}
const placeCamera = (c) => placeCameras([[c, 1]]);

/* ---------- depth of field and light, measured along the plane's depth ---------- */
function applyFocus(c, f) {
  const proj = projector(c);
  const lx = f.x - c.tx, ly = f.y - c.ty;
  const a = proj(lx, ly), b = proj(lx + 1, ly), d = proj(lx, ly + 1);
  let gx = b.z - a.z, gy = d.z - a.z; const gl = Math.hypot(gx, gy); gx /= -gl; gy /= -gl;
  const at = (s) => proj(lx + gx * s, ly + gy * s);
  const far = at(400);
  const ang = Math.atan2(far.x - a.x, -(far.y - a.y));
  const ux = Math.sin(ang), uy = -Math.cos(ang);
  const len = Math.abs(VW * ux) + Math.abs(VH * uy);
  // Near-side points can fall behind the camera, where the projection flips; push those off-screen.
  const pos = (s) => { const p = at(s); if (c.p - p.z < 60) return s < 0 ? -300 : 400; return (((p.x - VW / 2) * ux + (p.y - VH / 2) * uy) / len + 0.5) * 100; };
  const deg = (ang * 180) / Math.PI;
  let last = -Infinity;
  const pct = (v) => { last = Math.max(last, v); return `${last.toFixed(2)}%`; };
  const reset = () => (last = -Infinity);
  reset(); const soft = `linear-gradient(${deg}deg, #000 ${pct(pos(-f.r1))}, transparent ${pct(pos(-f.band))}, transparent ${pct(pos(f.band))}, #000 ${pct(pos(f.r1))})`;
  reset(); const heavy = `linear-gradient(${deg}deg, #000 ${pct(pos(-f.r2))}, transparent ${pct(pos(-f.r1))}, transparent ${pct(pos(f.r1 * 1.1))}, #000 ${pct(pos(f.r2))})`;
  LAYERS[1].el.style.cssText = `filter: blur(${f.b1}px); -webkit-mask-image: ${soft}; mask-image: ${soft}`;
  LAYERS[2].el.style.cssText = `filter: blur(${f.b2}px); -webkit-mask-image: ${heavy}; mask-image: ${heavy}`;
  reset();
  document.getElementById("fx-light").style.background =
    `linear-gradient(${deg}deg, rgb(0 0 0 / 0.14) ${pct(pos(-f.r2))}, transparent ${pct(pos(-f.band))}, transparent ${pct(pos(f.band * 0.6))}, rgb(0 0 0 / 0.42) ${pct(pos(f.r2 * 1.6))})`;
  document.getElementById("fx-vig").style.opacity = 1;
}
document.getElementById("fx-vig").style.background = "radial-gradient(ellipse 80% 80% at 50% 50%, transparent 55%, rgb(0 0 0 / 0.38) 100%)";

/* ---------- grain: barely there ---------- */
const gctx = document.getElementById("grain").getContext("2d");
const gimg = gctx.createImageData(1920, 1080);
function grain(frame) {
  const r = prng(1000 + frame), d = gimg.data;
  for (let i = 0; i < d.length; i += 4) { const v = r() * 255; d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255; }
  gctx.putImageData(gimg, 0, 0);
}


// The scene point under a screen point: the ray from the eye meets the plane z = 0.
function unproject(c, sx, sy) {
  const m = new DOMMatrix().translate(VW / 2 + c.ox, VH / 2 + c.oy, c.dz).rotateAxisAngle(1, 0, 0, c.rx).rotateAxisAngle(0, 0, 1, c.rz).inverse();
  const e = m.transformPoint(new DOMPoint(VW / 2, VH / 2, c.p, 1)), q = m.transformPoint(new DOMPoint(sx, sy, 0, 1));
  const k = e.z / (e.z - q.z);
  return { x: e.x + (q.x - e.x) * k + c.tx, y: e.y + (q.y - e.y) * k + c.ty };
}
const focusAtScreen = (c, sx, sy, f) => ({ ...unproject(c, sx, sy), ...f });


// Screen-space truck: ox runs from `from` to `to`, so the camera travels across a fixed plane.
const truck = (base, from, to, dur) => [[0, { ...base, ox: from }], [dur, { ...base, ox: to }]];
const linearKeys = (keys, t) => { const [[a, ca], [b, cb]] = keys; return mix(ca, cb, drift(clamp((t - a) / (b - a)))); };
// Camera keyframes [time, cam] joined by one smooth curve: speed carries through every key
// (no stop at each one), and the move eases in at the first key and out at the last.
// Monotone tangents (Fritsch–Carlson) so a hold between two glides never overshoots.
function tangents(ts, v) {
  const n = v.length, d = [], m = Array(n).fill(0);
  for (let i = 0; i < n - 1; i++) d[i] = (v[i + 1] - v[i]) / (ts[i + 1] - ts[i]);
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) { m[i] = m[i + 1] = 0; continue; }
    const a = m[i] / d[i], b = m[i + 1] / d[i], r = a * a + b * b;
    if (r > 9) { const k = 3 / Math.sqrt(r); m[i] = k * a * d[i]; m[i + 1] = k * b * d[i]; }
  }
  return m;
}
function keyed(keys, t) {
  const ts = keys.map((k) => k[0]), n = keys.length;
  if (t <= ts[0]) return keys[0][1];
  if (t >= ts[n - 1]) return keys[n - 1][1];
  let i = 0; while (t > ts[i + 1]) i++;
  const h = ts[i + 1] - ts[i], s = (t - ts[i]) / h, s2 = s * s, s3 = s2 * s;
  const out = { ...keys[i][1] };
  for (const k of Object.keys(out)) {
    if (typeof out[k] !== "number") continue;
    const v = keys.map((kk) => kk[1][k]), m = tangents(ts, v);
    out[k] = (2 * s3 - 3 * s2 + 1) * v[i] + (s3 - 2 * s2 + s) * h * m[i] + (-2 * s3 + 3 * s2) * v[i + 1] + (s3 - s2) * h * m[i + 1];
  }
  return out;
}
// Cruise: steady speed with soft ends. Velocity ramps up over the first `e` of the move, holds,
// and ramps down over the last `e`. A fixed arc or truck at constant speed reads as a camera on a
// track; smoothstep-style easing reads as a push.
function cruise(p, e = 0.25) {
  p = clamp(p); const v = 1 / (1 - e);
  if (p < e) return v * p * p / (2 * e);
  if (p < 1 - e) return v * (e / 2 + (p - e));
  return 1 - v * (1 - p) * (1 - p) / (2 * e);
}
// A fixed arc: the camera orbits the pivot (tx, ty) from one angle set to another at cruise speed.
// The rig already rotates about its target, so sweeping rz is an orbit around the pivot (azimuth)
// and sweeping rx is a crane over it (elevation). dz may change too for an arc that pushes in.
const arc = (base, from, to, dur, e = 0.25) => ({ dur, path: (t) => mix({ ...base, ...from }, { ...base, ...to }, cruise(t / dur, e)) });

// Track: constant speed from frame 0 to the last frame, no easing inside the shot. Linear's
// releases move this way (measured: 5% of frame width per second for a drift, 12.5% for a track);
// the shot is cut into already moving and cut out of still moving, so nothing eases to a stop.
const track = (base, from, to, dur) => ({ dur, path: (t) => mix({ ...base, ...from }, { ...base, ...to }, clamp(t / dur)) });
// Pairwise keyframes: each pair eases in and out on its own (a hold, a glide, a hold). Use for one
// deliberate glide between two holds; the glide's 1.3s ease-in-out-cubic speed is the approved one.
function keyedPairs(keys, t) {
  let i = keys.findIndex(([at], j) => j < keys.length - 1 && t < keys[j + 1][0]); if (i < 0) i = keys.length - 2;
  const [a, ca] = keys[i], [b, cb] = keys[i + 1];
  return mix(ca, cb, easeInOutCubic(clamp((t - a) / (b - a))));
}

// Focus that travels with the camera: cam objects may carry fx, fy, band, r1, r2, b1, b2.
const camFocus = (c) => ({ x: c.fx ?? c.tx, y: c.fy ?? c.ty, band: c.band ?? 220, r1: c.r1 ?? 600, r2: c.r2 ?? 1200, b1: c.b1 ?? 2.2, b2: c.b2 ?? 6.5 });

// Crossfade a value change: the old one fades out (120ms), the new one fades in (200ms) with a
// 2px blur bridge and a 3px rise. Returns { text, style } for `since` seconds after the change.
function swap(prev, next, since) {
  if (since >= 0.32 || prev === next) return { text: next, style: "" };
  if (since < 0.12) { const p = easeOutQuint(since / 0.12); return { text: prev, style: `opacity:${1 - p};filter:blur(${2 * p}px)` }; }
  const p = easeOutQuint((since - 0.12) / 0.2);
  return { text: next, style: `opacity:${p};filter:blur(${2 * (1 - p)}px);transform:translateY(${3 * (1 - p)}px)` };
}
// A highlight that rises over 120ms and settles over 900ms.
const pulse = (since) => since < 0 ? 0 : since < 0.12 ? easeOutQuint(since / 0.12) : 1 - easeInOutCubic(clamp((since - 0.12) / 0.9));

// End card: the card's ground comes in with `alpha` (1 on a hard cut), then logo, title and URL
// come into focus one after another, as Linear's end cards do: blur 12px → 0 with opacity, no
// movement, 0.7s ease-out-quint each.
function endCard(t, alpha = 1) {
  if (alpha >= 1) { for (const L of LAYERS) L.el.style.visibility = "hidden"; document.getElementById("fx-light").style.background = "none"; }
  document.getElementById("fx-vig").style.opacity = lerp(1, 0.6, alpha);
  const end = document.getElementById("endcard"); end.style.display = "flex"; end.style.opacity = alpha;
  [["end-logo", 0.15], ["end-title", 0.35], ["end-url", 0.9]].forEach(([k, at]) => {
    const p = easeOutQuint(seg(t, at, 0.7));
    setAll(k, (el) => { el.style.opacity = p; el.style.filter = `blur(${(12 * (1 - p)).toFixed(2)}px)`; el.style.transform = ""; });
  });
}

