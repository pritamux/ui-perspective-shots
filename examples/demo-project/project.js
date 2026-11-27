// Demo project for the bundled Acme demo app. Copy this file as the starting point for your own:
// keep the shape (PAGE, cleanChrome, BUILD, afterBuild, states, REELS, STILLS), replace the content.

/* ---------- pages: the captured page names and the size they are laid out at ---------- */
const PAGE = { home: [1440, 1200], order: [1100, 1250] };

/* ---------- data for the rows and the order ---------- */
const R = prng(7);
const pick = (a) => a[Math.floor(R() * a.length)];
const clock = (sec) => { const d = 9 * 3600 + 41 * 60 + 7 + Math.floor(sec); const p = (n) => String(n).padStart(2, "0"); return `${p(Math.floor(d / 3600))}:${p(Math.floor(d / 60) % 60)}:${p(d % 60)}`; };
const EVENTS = ["Payment received", "Refund issued", "Invoice sent", "Payout scheduled", "Subscription renewed"];
const AMOUNTS = ["$1,250.00", "$84.00", "$2,400.00", "$19.00", "$640.00", "$12,000.00", "$320.00"];
const STATUSES = [["Paid", "good"], ["Pending", "accent"], ["Shipped", "good"], ["Packed", "warn"]];
const N = 40, FUT = 18; // rows, newest first; the first FUT arrive during the reel
const ROWS = Array.from({ length: N }, (_, i) => ({
  event: pick(EVENTS), amount: pick(AMOUNTS), order: 1100 - i * 3, status: pick(STATUSES), time: clock(N * 0.5 - i * 0.5),
}));

/* ---------- cleanup: remove temporary chrome from every captured page ---------- */
function cleanChrome(root) {
  root.querySelectorAll("[data-dev-overlay], .banner").forEach((e) => e.remove());
}

/* ---------- builders: clone a captured row as the template, set each zone ---------- */
const BUILD = {
  home(zoom) {
    const page = zoom.firstElementChild;
    const [events, orders] = [...page.querySelectorAll(".feed ul")];
    const tplE = events.firstElementChild, tplO = orders.firstElementChild;
    events.replaceChildren(...ROWS.map((r, i) => {
      const li = tplE.cloneNode(true); li.dataset.k = "ev" + i;
      li.querySelector(".title").textContent = r.event; li.querySelector(".time").textContent = r.time;
      li.querySelector(".value").textContent = r.amount;
      li.insertAdjacentHTML("beforeend", '<div class="persp-glow"></div>'); return li;
    }));
    orders.replaceChildren(...ROWS.map((r, i) => {
      const li = tplO.cloneNode(true); li.dataset.k = "or" + i;
      li.querySelector(".title").textContent = `Order #${r.order}`; li.querySelector(".time").textContent = r.time;
      li.querySelector(".value").innerHTML = `<span class="dot ${r.status[1]}"></span>${r.status[0]}`;
      li.insertAdjacentHTML("beforeend", '<div class="persp-glow"></div>'); return li;
    }));
    events.dataset.k = "events"; orders.dataset.k = "orders";
  },
  order(zoom) {
    const page = zoom.firstElementChild;
    for (const label of ["Status", "Paid", "Balance", "Packed"]) dds(page, label).forEach((d) => (d.dataset.k = "o-" + label.toLowerCase()));
  },
};

/* ---------- after the layers exist: measure what needs layout ---------- */
let rowH = 0;
function afterBuild() {
  withSceneShown("home", () => { rowH = K("ev1")[0].offsetTop - K("ev0")[0].offsetTop; });
  setAll("end-title", (el) => (el.textContent = "Activity"));
  setAll("end-url", (el) => (el.textContent = "acme.example/activity"));
  const logo = LAYERS[0].el.querySelector("[data-logo]");
  setAll("end-logo", (el) => (el.innerHTML = logo ? logo.outerHTML.replace("data-logo", 'class="lockup"') : ""));
}

/* ---------- UI state, all from t ---------- */
const ARRIVALS = Array.from({ length: FUT }, (_, i) => 0.3 + i * 0.5);
const mixFg = (pct) => `color-mix(in oklab, var(--foreground) ${pct.toFixed(2)}%, transparent)`;
const glowAt = (since) => since < 0 ? 0 : since < 0.15 ? easeOutQuint(since / 0.15) : 1 - easeInOutCubic(clamp((since - 0.5) / 1.1));
// Rows land 0.5s apart; each push eases in and out over 0.42s, the new row fades in and glows.
function feedState(t) {
  let shift = 0;
  ARRIVALS.forEach((at, n) => {
    const i = FUT - 1 - n;
    shift += easeInOutCubic(seg(t, at, 0.42)) * rowH;
    for (const k of ["ev" + i, "or" + i]) setAll(k, (el) => { el.style.opacity = easeOutQuint(seg(t, at, 0.36)); el.querySelector(".persp-glow").style.opacity = glowAt(t - at); });
  });
  for (const k of ["events", "orders"]) setAll(k, (el) => (el.style.transform = `translateY(${-(FUT * rowH) + shift}px)`));
}
// The hero order: Pending → Paid → Packed → Shipped. Each change crossfades (swap) and pulses its row.
const STEPS = [
  { status: ["Pending", "accent"], paid: "$0.00", balance: "$1,250.00", packed: "0 of 3" },
  { status: ["Paid", "good"], paid: "$1,250.00", balance: "$0.00", packed: "0 of 3" },
  { status: ["Packed", "warn"], paid: "$1,250.00", balance: "$0.00", packed: "3 of 3" },
  { status: ["Shipped", "good"], paid: "$1,250.00", balance: "$0.00", packed: "3 of 3" },
];
function orderState(t, at) {
  const n = at.filter((x) => t >= x).length, since = n ? t - at[n - 1] : 9;
  const view = (s) => ({ status: `<span class="status"><span class="dot ${s.status[1]}"></span>${s.status[0]}</span>`, paid: s.paid, balance: s.balance, packed: s.packed });
  const prev = view(STEPS[Math.max(0, n - 1)]), cur = view(STEPS[n]);
  for (const k of ["status", "paid", "balance", "packed"]) {
    const s = swap(prev[k], cur[k], since);
    setAll("o-" + k, (el) => { el.innerHTML = `<span style="display:inline-block;${s.style}">${s.text}</span>`; el.parentElement.style.background = n && prev[k] !== cur[k] ? mixFg(6 * pulse(since)) : ""; });
  }
}

/* ---------- the launch reel: slow pans in one direction, one angle, hard cuts ---------- */
// Every shot shares the same angle and camera distance; only the target moves. Pans run left to
// right at constant speed (about 75px of ox per second, 5–8% of frame width per second). No zoom.
const CUT = { xfade: 0 };
const LOOK = { rx: 53, rz: -58, p: 1550, dz: 600 };
const panFocus = (t, c) => focusAtScreen(c, VW / 2, VH / 2, { band: 230, r1: 600, r2: 1250, b1: 2.2, b2: 6.5 });
const LAUNCH = [
  { // Both feeds, rows landing from the first frame
    ...CUT, ...track({ scene: "home", ...LOOK, tx: 1160, ty: 560, oy: 40 }, { ox: 160 }, { ox: -160 }, 4.4),
    focus: panFocus, state: (t) => feedState(t + 0.4),
  },
  { // The order: a slower pan while its status changes, focus fixed on the status
    ...CUT, ...track({ scene: "order", ...LOOK, tx: 420, ty: 380, oy: 0, fx: 400, fy: 330, band: 240 }, { ox: -60 }, { ox: -220 }, 4.4),
    state: (t) => orderState(t, [0.7, 1.8, 2.9]),
  },
  { // Further down the feeds, same direction
    ...CUT, ...track({ scene: "home", ...LOOK, tx: 700, ty: 820, oy: 40 }, { ox: 160 }, { ox: -160 }, 4.2),
    focus: panFocus, state: (t) => feedState(t + 5),
  },
  { ...CUT, dur: 3.0, end: true },
];

/* ---------- one arc, for comparison: an orbit around the status as the order completes ---------- */
const ARCS = [
  { ...arc({ scene: "order", tx: 420, ty: 330, rx: 52, ox: 0, oy: 40, p: 1450, band: 200 }, { rz: -34, dz: 600 }, { rz: -62, dz: 600 }, 5), state: (t) => orderState(t, [1.3, 2.5, 3.7]) },
];

const REELS = { launch: LAUNCH, arcs: ARCS };
const STILLS = [
  { cam: { scene: "home", tx: 1180, ty: 600, rx: 53, rz: -60, dz: 620, ox: -60, oy: 40, p: 1600 }, focus: { x: 1220, y: 520, band: 230, r1: 620, r2: 1300, b1: 2, b2: 6 }, state: () => feedState(5) },
  { cam: { scene: "order", tx: 440, ty: 420, rx: 54, rz: -57, dz: 600, ox: 60, oy: -20, p: 1400 }, focus: { x: 420, y: 380, band: 220, r1: 560, r2: 1100, b1: 2.2, b2: 6.5 }, state: () => orderState(9, [0, 1, 2]) },
];
const FLAT_STATE = { home: () => feedState(5), order: () => orderState(9, [0, 1, 2]) };
