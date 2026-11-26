# ui-perspective-shots

An agent skill for launch videos and social stills of a product's real interface: the UI on a tilted plane, with depth of field, light falloff and a live, moving interface, rendered frame by frame.

Capture the real thing, fill it with clean mock data, then point a camera at it.

![A live activity feed shot on a tilted plane, rows landing while the camera drifts](media/reference.jpg)

## Install

```sh
npx skills add pritamux/ui-perspective-shots
```

Or copy `skills/ui-perspective-shots/` into your agent's skills folder (for Claude Code, `~/.claude/skills/ui-perspective-shots/`).

Then ask your agent for the set, or call it directly:

```
/ui-perspective-shots launch video and stills for the new activity page
```

## What it makes

- **One launch video:** about 17 seconds at 1080p, 60 fps. A steady push-in on the page title, a constant drift over the live surface, a locked hold on the core interaction, one glide between two moments on a record, and an end card whose lines come into focus. Hard cuts that land on motion.
- **5–8 stills:** 3840×2160 PNGs from the same captured UI.
- **Optional reels:** fixed camera arcs (orbit, crane, sweep) and macro trucks, for standalone posts.

## How it works

1. **Capture.** `capture.cjs` opens each page on your dev server and saves its DOM, the compiled CSS and the fonts. The shots use your product's real components instead of a hand-drawn copy.
2. **Mock.** A small project file clones captured rows as templates and fills them with round numbers, recognisable names and one hero record that carries the story across screens.
3. **Check flat.** `flat.cjs` renders every page head-on, so you can catch truncation or leftover template values before any camera work.
4. **Frame.** `measure.cjs` prints element positions in scene coordinates; the camera aims at numbers, never at guesses.
5. **Render.** The stage draws the page three times (sharp, soft, heavy blur), masks the blurred copies along the plane's depth for a real focus band, adds light falloff and a trace of grain, then advances time frame by frame and hands each frame to ffmpeg.

The camera language is in `SKILL.md`: which move each kind of shot gets, constant-speed tracking inside a shot, easing only for one deliberate glide, and exact curves and timings for every UI change (rows landing, values crossfading, popovers lifting).

## What's inside

| File | What it does |
| --- | --- |
| `skills/ui-perspective-shots/SKILL.md` | The process, the camera decision trees and the motion rules the agent follows |
| `skills/ui-perspective-shots/kit/capture.cjs` | Saves pages, CSS and fonts from a running dev server into `capture/` |
| `skills/ui-perspective-shots/kit/engine.js` | Camera, depth of field, light, grain, tracks, arcs, keyframes, value crossfades, end card |
| `skills/ui-perspective-shots/kit/run.js` | Builds the stage, picks a reel and exposes `frameAt(t)`, `stillAt(n)` and `reelLength` |
| `skills/ui-perspective-shots/kit/stage.html` | The page the renderer loads (copy it to `index.html`) |
| `skills/ui-perspective-shots/kit/render.cjs` | Renderer: frames, stills or H.264 video, one exact frame at a time |
| `skills/ui-perspective-shots/kit/flat.cjs` | Renders each page head-on to check the mock data |
| `skills/ui-perspective-shots/kit/measure.cjs` | Prints element positions for aiming the camera |
| `skills/ui-perspective-shots/kit/motion.py` | Measures camera speed in any video, to compare a cut with a reference |
| `examples/demo-app/` | A small static dashboard to try the kit on |
| `examples/demo-project/` | A complete project for the demo app: data, builders, reels and stills |

## Try it on the demo

Needs Node 18+, Google Chrome, `ffmpeg` and Python 3.

```sh
# 1. Serve the demo app
python3 -m http.server 4173 --directory examples/demo-app &

# 2. Make a project folder from the kit and the demo project
mkdir -p /tmp/shots && cp -r skills/ui-perspective-shots/kit /tmp/shots/kit
cp skills/ui-perspective-shots/kit/stage.html /tmp/shots/index.html
cp examples/demo-project/* /tmp/shots/
cd /tmp/shots && npm i playwright-core

# 3. Capture, check, render
node kit/capture.cjs
node kit/flat.cjs
node kit/render.cjs frames 1,5,9
node kit/render.cjs stills 1,2
node kit/render.cjs video out/demo.mp4
```

`REEL=arcs node kit/render.cjs video out/arcs.mp4` renders the demo's arc reel. `SCALE=2` doubles the resolution (3840×2160) for stills.

## Safety notes

- `capture.cjs` only visits the pages listed in `shots.config.json`, plus the font files their CSS references (which may live on a font CDN). Font filenames are sanitised, and everything it writes stays in `capture/`.
- The capture saves page HTML to disk. Point it at a dev server with mock or disconnected accounts, never a logged-in production session.
- The renderer opens the local stage with `--allow-file-access-from-files`, so the stage can load its own CSS, fonts and data. Only render project folders you created.
- No telemetry, no network calls during rendering, no dependencies beyond `playwright-core` (and `numpy` for `motion.py`).

## Credits

Inspired by Emil Kowalski and the many other great designers and design engineers who share their craft on X. The tracking speeds and hard-cut grammar were measured from Linear's product release videos.

## License

MIT
