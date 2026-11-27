---
name: ui-perspective-shots
description: Make a launch video and a set of stills that show a product's real UI on a tilted plane, with depth of field, light falloff and a live, moving interface. Captures the running app's DOM and CSS, frames it with a 3D camera and renders frame by frame. Use when asked for perspective shots, tilted or angled UI shots, launch or announcement videos of a screen or feature, macro pans across UI, or "shots like these" with dark, angled product references. Triggers on: perspective shot, tilted UI, angled screenshot, isometric UI, launch video, announcement video, feature video, social stills, macro pan, depth of field UI, product shots.
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
2. Capture with test or disconnected accounts only. The capture saves page DOM to disk; a logged-in session would save real names, balances and IDs.
3. List every screen in `shots.config.json` → `pages`. Find real URLs by visiting the index page and reading its links; pick records with the richest content (an order with several line items beats an empty one).
4. Popovers, menus and results that need an interaction go in `popovers` (click a selector, type text, capture a selector). Type a full identifier when the product only resolves full ones.
5. Run `node kit/capture.cjs`. It saves each page's DOM, the compiled CSS and the fonts it references, and bundles `capture/data.js`. A font count of zero means the product uses system fonts or the font URLs failed; check before going on.

## 3. Prepare the pages

Rows that arrive during a shot need content to arrive with. Set it in the captured DOM:
- Rows: clone a captured row as a template and set each zone. Never rebuild rows from scratch.
- Record pages: set values by their label (`setDD(page, "Status", …)`). Labels are stable; positions are not.

Remove temporary chrome in `cleanChrome`: announcement banners, migration prompts, dev overlays. Keep the navigation and the product's own controls.

Check every scene flat before any camera work: `node kit/flat.cjs`, then look at each `out/flat-<scene>.png`. Fix anything truncated, empty or duplicated. A flat page that looks wrong looks worse at an angle.

When the product itself clips or breaks something (a truncated timestamp, an overflowing label), fix it in the shot and report it as a product bug. Never silently ship the bug, never silently hide it.

## 4. Frame each shot

Aim from numbers: `node kit/measure.cjs <scene> "dt=Label" "<selector>"` prints scene coordinates. Use them for `tx/ty` (camera target) and focus `fx/fy`. Never guess coordinates from a screenshot; guessed frames land on empty panel space.

Camera values:

```
Which framing?
├── Standard angle (feeds, tables, records): use it for every shot of a reel
│   rz -54…-60, rx 50…54, p 1450–1600, dz 540–680, the same values in every shot
│   Why: spinning the page ~55° flat first, then tilting it back, leaves text running
│   up-right into depth at ~30–35° on screen and fills the frame. With rz around -30
│   the page recedes along its columns and half the frame is black.
├── Macro truck (sideways move across the screen), for a reel of pans only
│   dz 820–1000, depth band 110–170, truck(base, from, to, dur), from − to ≈ 75px per
│   second of shot (320 over 4.2s), which measures 5–8% of frame width per second
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
│   ├── Orbit: rz -34 → -62 at a fixed dz, on a value that changes meanwhile
│   ├── Crane: rx 64 → 44 at a fixed dz, rz fixed near -56
│   ├── Macro orbit: rz -8 → -38, rx 62, dz 900–960, depth band 130, on a long value
│   └── Orbit a lifted element: rz -72 → -36 around a popover or result
│   Never sweep more than 40° in 5s; faster reads as a spin. Never change dz during an
│   arc: orbiting and pushing in at once is two moves.
└── Two moments on one page far apart (status at top, figures at bottom)
    two shots, one per moment, or one constant pan past both. Never hold, glide, hold:
    each part eases to a stop and the camera reads as stalling.
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

### Camera language: cinematic, never jumpy

The aim is a film, not a screen recording with effects. Every shot should look like it came from one camera operator with one plan. Jumpy, mixed moves read as amateur. When in doubt, do less.

1. Pick one move family for the whole video and keep it. Pans (sideways trucks and drifts) plus holds is the default. Never cut from a pan to a zoom or from a zoom to a pan: across a hard cut, a change of move type reads as a jump.
2. One move per shot, never two at once. A pan keeps `dz` constant; a push-in keeps `tx`, `ty` and `ox` constant. A drift with a slow push is a pan and a zoom together, so don't.
3. Keep the angle and camera distance identical across the reel (one `rx`, `rz`, `p`, `dz`). Only the target moves. A new angle on every cut looks like a slideshow.
4. Run every pan in the same direction, left to right by default, so cuts flow instead of reversing.
5. Three or four shots is enough. Each extra shot is another cut the eye has to recover from.

```
What is the shot for?
├── A live surface (feeds, tables) → pan along the rows at constant speed, 5–8% of frame width per second (measure with motion.py; above 10% reads as a whip)
├── An interaction (search, place, filter) → locked hold; the UI is the motion
├── A record changing state → slow constant pan in the reel's direction, focus fixed on the value that changes
└── A showcase moment, at most one per reel and only in an arc reel → an arc
```

- Inside a shot, the camera moves at constant speed (`track`) or holds. No ease-in at the start of a shot and no ease-out at its end. Shots are cut into already moving and cut out of still moving. Measured on well-regarded product release videos: about 5% of frame width per second for a drift, 12.5% for a faster track, and holds of 1.5–5s at zero.
- Never stop and start inside a shot. A hold, then a glide, then a hold eases to zero three times and reads as the camera stalling. If two moments sit far apart on one page, give each its own shot, or pan past both at one speed.
- Between shots: hard cuts that land on motion. The incoming shot starts with something already moving (a row arriving, a value changing), so the eye is carried across the cut. Keep dissolves (`xfade`) for reels of arcs.
- End card (optional): hard cut to the empty card, then logo, title and URL come into focus one after another (blur 12px → 0 with opacity, no movement, 0.7s each, at 0.15 / 0.35 / 0.9s), held to the end.
- Rotation inside one shot changes by 2° at most, unless the shot is an arc.
- Never fade the first frame in from black: on most social platforms the first frame is the thumbnail.
- To compare a cut with a reference video, run `python3 kit/motion.py <video>` (needs numpy). It prints camera speed per half second as a percentage of frame width per second.

### Unreleased pages

When the page isn't public yet, show the content without anything that names it. Hide the navigation bar, the page title or breadcrumb, the search field and the status bar. Hide them after `afterBuild` has measured the layout (set `display: none` on those elements), then re-run `measure.cjs`: the content moves up, so every camera target changes. With the header gone, the first content sits at the page's top edge, so frame it near the top-left corner of the screen. Centred, the empty space above the page fills half the frame.

## 6. Build the launch video

| # | Shot | Move | Length |
|---|------|------|--------|
| 1 | Live surface (the busiest screen), rows landing from the first frame | Pan along the rows | 4.4s |
| 2 | Payoff: a record changing state, read close | Slow pan, same direction | 4.4s |
| 3 | A second surface (a list or history) | Pan, same direction | 4.2s |
| 4 | End card, if the feature is public: product mark, feature name, short URL | Static, lines focus in | 3.0s |

About 13–16s, one angle and one camera distance throughout, hard cuts. The first shot must read with the sound off on a phone in the first second. Confirm the URL before posting; never guess a launch address. If the result feels rushed, stretch the whole reel with `SPEEDS = { launch: 1.15 }` rather than retiming shots one by one; that keeps camera, UI motion and cuts in proportion.

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
