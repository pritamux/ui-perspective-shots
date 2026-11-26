---
name: ui-perspective-shots
description: Make a launch video and a set of stills that show a product's real UI on a tilted plane, with depth of field, light falloff and a live, moving interface. Captures the running app's DOM and CSS, fills it with clean mock data, frames it with a 3D camera and renders frame by frame. Use when asked for perspective shots, tilted or angled UI shots, launch or announcement videos of a screen or feature, macro pans across UI, or "shots like these" with dark, angled product references. Triggers on: perspective shot, tilted UI, angled screenshot, isometric UI, launch video, announcement video, feature video, social stills, macro pan, depth of field UI, product shots.
---

# UI Perspective Shots

The output is a set: one video for the announcement post and 5–8 stills, all from the same captured UI. The product's own interface is the subject; the camera, focus and light make it feel filmed rather than screenshotted.

Everything is rendered frame by frame from HTML. Never screen-record: real-time capture drops frames, and wall-clock animation differs between runs.

## 1. Set up the project

1. Make a project folder outside the product's source tree. Copy `kit/` from this skill into it, copy `kit/stage.html` to `index.html`, and run `npm i playwright-core`. The renderer uses an installed Google Chrome and needs `ffmpeg` on the PATH.
2. Copy `examples/demo-project/project.js` and `shots.config.json` as the starting point. Keep the structure (`PAGE`, `cleanChrome`, `BUILD`, `afterBuild`, state functions, `REELS`, `STILLS`); replace the pages, builders, data and shots.
3. Never hand-draw a replica of the UI. Capture it (§2). A hand-built copy drifts from the product within days, and every font, border and badge has to be redone; the capture gets all of them right for free.

## 2. Capture the real UI

1. Run the product's dev server from the branch with the final UI. Ask which branch if it isn't clear.
2. Capture with mock or disconnected accounts only. The capture saves page DOM to disk; a logged-in session would save real names, balances and IDs.
3. List every screen in `shots.config.json` → `pages`. Find real URLs by visiting the index page and reading its links; pick records with the richest content (an order with several line items beats an empty one).
4. Popovers, menus and results that need an interaction go in `popovers` (click a selector, type text, capture a selector). Type a full identifier when the product only resolves full ones.
5. Run `node kit/capture.cjs`. It saves each page's DOM, the compiled CSS and the fonts it references, and bundles `capture/data.js`. A font count of zero means the product uses system fonts or the font URLs failed; check before going on.

## 3. Fill it with mock data

Always mock. Never ship the live values the capture came with. Real data is uneven (a zero fill, a ten-decimal size, a truncated name) and reads as broken at a glance.

- Numbers are round and varied: `12,000`, `2.5`, `0.25`, `$1,250.00`. Two decimals at most unless the unit needs more.
- Names (products, markets, plans, customers) are ones a user of this product would recognise; invent nothing that looks off-brand.
- IDs are short (`37`, `#1042`); hashes are random hex with a recognisable head (`0x7a3f9c…`).
- One hero record carries the story across screens: the same order or transaction appears in the search result, the record page and the activity list.
- Statuses are the ones that look alive: open, in progress, done. Failures do not appear.

Drive the data into the captured DOM:
- Rows: clone a captured row as a template and set each zone. Never rebuild rows from scratch.
- Record pages: set values by their label (`setDD(page, "Status", …)`). Labels are stable; positions are not.
- Remove temporary chrome in `cleanChrome`: announcement banners, migration prompts, dev overlays. Keep the navigation and the product's own controls.

Check every scene flat before any camera work: `node kit/flat.cjs`, then look at each `out/flat-<scene>.png`. Fix anything truncated, empty, duplicated or still showing a template's original value. A flat page that looks wrong looks worse at an angle.

When the product itself clips or breaks something (a truncated timestamp, an overflowing label), fix it in the shot and report it as a product bug. Never silently ship the bug, never silently hide it.

## 4. Frame each shot

Aim from numbers: `node kit/measure.cjs <scene> "dt=Label" "<selector>"` prints scene coordinates. Use them for `tx/ty` (camera target) and focus `fx/fy`. Never guess coordinates from a screenshot; guessed frames land on empty panel space.

Camera values:

```
Which framing?
├── Standard angle (feeds, tables, records)
│   rz -54…-60, rx 50…54, p 1450–1600, dz 540–680
│   Why: spinning the page ~55° flat first, then tilting it back, leaves text running
│   up-right into depth at ~30–35° on screen and fills the frame. With rz around -30
│   the page recedes along its columns and half the frame is black.
├── Hook / title (first shot)
│   rz -38…-42, rx 47…48, dz 720–860, target on the page title
│   Why: a gentler spin keeps the title readable on a phone in the first second.
├── Macro truck (sideways move across the screen)
│   dz 820–1000, depth band 110–170, truck(base, from, to, dur), from − to = 800–1200
│   ├── Along a long value (hash, ID): rz -10…-14, rx 62–64, reads like a ticker
│   ├── Across a table's columns: rz -4…-8, rx 58–60, rows recede up the frame
│   ├── Across a feed: rz -56…-60, rx 55–57
│   └── Label to value on a record: rz -18…-22, rx 56–58
│   Why: animating ox is a true sideways camera move; focusAtScreen refocuses each
│   frame on whatever sits at the frame centre.
├── Arc (fixed circular path around a pivot), 5s: arc(base, from, to, dur)
│   The pivot is tx/ty and stays fixed on screen and in focus. Speed is constant with
│   soft ramps over the first and last quarter (cruise): a camera on a track.
│   ├── Sweep: rz -78 → -38 over a wide subject, dz 420–450, rx 56
│   ├── Orbit + push: rz -34 → -62 with dz 560 → 760, on a value that changes meanwhile
│   ├── Crane: rx 64 → 44 with dz 560 → 620, rz fixed near -56
│   ├── Macro orbit: rz -8 → -38, rx 62, dz 900–960, depth band 130, on a long value
│   └── Orbit a lifted element: rz -72 → -36 around a popover or result
│   Never sweep more than 40° in 5s; faster reads as a spin.
└── Two moments on one page far apart (status at top, figures at bottom)
    pairs: hold near the first, one 1.3s glide, hold near the second
    Why: a single wide frame makes both moments too small to read.
```

Every shot must:
- Show UI to at least three of the four frame edges. One corner of black void is the look; more than one wastes the frame.
- Keep trucks and arcs inside the page. Check the first and last frame of every move; trim the range when either end shows black.
- Carry the subject at 40–60% of frame height, not at an edge.

Depth of field (fields on the camera, or a `focus` object): band 200–240, r1 560–620, r2 1100–1300, b1 2–2.2px, b2 6–6.5px for standard shots. Tighten the band to 110–170 and raise blur to 2.6–2.8 / 7.5–8 for macro. The focus point sits on the element the shot is about.

## 5. Make the UI move

The interface is never still in a video shot. Everything is a function of `t`; the stage disables all CSS animations and transitions, because they run on wall-clock time and would differ between frames. Ease-out for things arriving, ease-in-out for things already on screen that move.

| Motion | Curve | Timing | Why |
|---|---|---|---|
| List push (new row arrives) | ease-in-out-cubic `(0.645, 0.045, 0.355, 1)` | 0.42s, arrivals 0.5s apart | The list is already on screen. Overlapping pushes start the next one at full speed and jerk. |
| Arriving row | ease-out-quint `(0.23, 1, 0.32, 1)` opacity 0 → 1 | 0.36s | Fades in as it leaves the clip edge instead of popping out from under the header. |
| New row highlight | ease-out-quint rise, ease-in-out-cubic settle | 0.15s rise, 0.35s hold, 1.1s settle | A highlight that starts at full strength reads as a flash. |
| Value change | `swap`: old out 0.12s, new in 0.2s, 2px blur bridge, 3px rise | 0.32s | A text swap in one frame reads as a glitch at 60fps. |
| Changed row background | `pulse`, 6% foreground | 0.12s rise, 0.9s settle | Leads the eye to the change without a flash. |
| Popover open | ease-out-quint opacity + scale 0.97 → 1, origin top | 0.2s | Match the product's own popover. Never scale from 0. |
| Popover lift | ease-out-quart translateZ 0 → 22px, shadow shares it | 0.55s | The lift is the filmed part, so it runs longer than the open. Above 30px it covers the field. |
| Focus ring, selection | ease-out-quint | 0.15s | Colour changes stay under 150ms. |

Clip moving lists at the list's own container, never at the panel, or new rows draw over the panel header.

### Camera language

Each shot gets one kind of move, and the kinds vary across the reel. A cut where every shot is an arc or a glide reads as busy; a mix reads as filmed.

```
What is the shot for?
├── Opening / title → steady push-in: dz +100–120 over 2.6–3s, constant speed (track)
├── A live surface (feeds) → constant drift along the rows, ~4% of frame width per second,
│   with a slow push; the UI's own motion is the subject
├── An interaction (search, place, filter) → locked hold, drift under 1% of width per second
├── Two moments far apart on one page → hold, one 1.3s ease-in-out-cubic glide, hold (pairs)
└── A showcase moment, at most one per reel → an arc
```

- Inside a shot, the camera moves at constant speed (`track`) or holds. No ease-in at the start of a shot and no ease-out at its end. Shots are cut into already moving and cut out of still moving. Measured on well-regarded product release videos: about 5% of frame width per second for a drift, 12.5% for a faster track, and holds of 1.5–5s at zero.
- Easing belongs to one deliberate glide between two holds (`pairs`, 1.3s ease-in-out-cubic).
- Between shots: hard cuts that land on motion. The incoming shot starts with something already moving (a row arriving, a value changing), so the eye is carried across the cut. Keep dissolves (`xfade`) for reels of arcs.
- End card: hard cut to the empty card, then logo, title and URL come into focus one after another (blur 12px → 0 with opacity, no movement, 0.7s each, at 0.15 / 0.35 / 0.9s), held to the end.
- Rotation inside one shot changes by 2° at most, unless the shot is an arc.
- Never fade the first frame in from black: on most social platforms the first frame is the thumbnail.
- To compare a cut with a reference video, run `python3 kit/motion.py <video>` (needs numpy). It prints camera speed per half second as a percentage of frame width per second.

## 6. Build the launch video

| # | Shot | Move | Length |
|---|------|------|--------|
| 1 | Hook: logo and page title, live motion below | Steady push-in | 2.8s |
| 2 | Live surface (the busiest screen) | Constant drift along the rows | 3.8s |
| 3 | Core interaction (search, place, filter) | Locked hold | 3.6s |
| 4 | Payoff: a record changing state, read close | Hold, 1.3s glide, hold | 4.4s |
| 5 | End card: product mark, feature name in the product's title face, short URL | Static, lines focus in | 3.0s |

About 17.5s, hard cuts throughout. The hook must read with the sound off on a phone in the first second. Confirm the URL before posting; never guess a launch address. If the result feels rushed, stretch the whole reel with `SPEEDS = { launch: 1.15 }` rather than retiming shots one by one; that keeps camera, UI motion and cuts in proportion.

## 7. Review, then render

1. Render the look first: `node kit/render.cjs frames <t1,t2,…>` at the start, middle and end of every shot, tiled into one contact sheet with ffmpeg `xstack`. Get a go before the full render.
2. Video: `node kit/render.cjs video out/<name>.mp4` (1920×1080, 60 fps by default). 1080p is enough for social video; 4K multiplies render time and file size without a visible gain in the feed.
3. Other reels (arcs, pans): add them to `REELS` and render with `REEL=<name>`.
4. Stills: `SCALE=2 node kit/render.cjs stills 1,2,…` for 3840×2160 PNGs (`stills 1` is `STILLS[0]`).
5. Verify the encoded file, not the frames you rendered: `ffprobe` the size, fps and length, and look at a contact sheet plus one frame per shot extracted from the mp4.

## Look

- Grain 2.5% opacity, reseeded each frame. Heavier grain reads as a filter and bloats the file.
- Light: the far side darkens to 42% black along the depth gradient, the near side to 14%; vignette 38% at the corners.
- Stage background `#070605`; the captured page keeps its own surfaces and colours. Never recolour the UI.
