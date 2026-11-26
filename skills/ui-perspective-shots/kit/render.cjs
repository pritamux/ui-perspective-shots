#!/usr/bin/env node
// Drives the stage (index.html in the current folder) in headless Chrome. Time is a parameter, not
// a clock: each frame calls window.frameAt(t) and waits for the page to paint, so a video never
// drops or doubles a frame however slow the machine is.
//
//   node kit/render.cjs frames 0.5,4.2     PNG of the reel at those seconds  → out/<reel>-<t>s.png
//   node kit/render.cjs stills 1,2,3       PNG of STILLS[n - 1]              → out/still-<n>.png
//   node kit/render.cjs video [file.mp4]   the whole reel, H.264             → out/<reel>.mp4
//
// Environment:
//   SIZE=1920x1080   CSS pixels of the frame          SCALE=1   device pixel ratio (2 → 3840×2160)
//   FPS=60           video frame rate                 REEL=…    which entry of REELS to play
//   QUALITY=18       x264 CRF (lower is larger)       CHROME=…  path to another Chrome build
const { chromium } = require("playwright-core");
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

const [width, height] = (process.env.SIZE || "1920x1080").split("x").map(Number);
const settings = {
  width, height,
  scale: Number(process.env.SCALE || 1),
  fps: Number(process.env.FPS || 60),
  reel: process.env.REEL || "",
  quality: Number(process.env.QUALITY || 18),
  chrome: process.env.CHROME || "",
};

class Stage {
  async open() {
    this.browser = await chromium.launch({
      ...(settings.chrome ? { executablePath: settings.chrome } : { channel: "chrome" }),
      // The stage is a local page that reads its own capture/, kit/ and fonts from disk.
      args: ["--allow-file-access-from-files", "--force-color-profile=srgb"],
    });
    this.page = await this.browser.newPage({ viewport: { width: settings.width, height: settings.height }, deviceScaleFactor: settings.scale });
    const problems = [];
    this.page.on("pageerror", (err) => problems.push(err.message));
    const url = new URL("file://" + path.resolve("index.html"));
    if (settings.reel) url.hash = settings.reel;
    await this.page.goto(url.href);
    await this.page.waitForFunction(() => typeof window.frameAt === "function" && document.fonts.status === "loaded");
    if (problems.length) throw new Error("the stage threw: " + problems.join(" | "));
    this.name = settings.reel || (await this.page.evaluate(() => Object.keys(REELS)[0]));
    return this;
  }
  length() { return this.page.evaluate(() => window.reelLength); }
  async snap(drawCall, arg) {
    await this.page.evaluate(([call, value]) => window[call](value), [drawCall, arg]);
    await this.page.evaluate(() => new Promise((done) => requestAnimationFrame(() => done())));
    return this.page.screenshot({ type: "png" });
  }
  close() { return this.browser.close(); }
}

function encoder(file) {
  const ffmpeg = spawn("ffmpeg", [
    "-v", "error", "-y",
    "-f", "image2pipe", "-vcodec", "png", "-r", String(settings.fps), "-i", "pipe:0",
    "-c:v", "libx264", "-preset", "slower", "-crf", String(settings.quality),
    "-pix_fmt", "yuv420p", "-movflags", "+faststart", file,
  ], { stdio: ["pipe", "inherit", "inherit"] });
  const finished = new Promise((ok, fail) => ffmpeg.on("close", (code) => (code === 0 ? ok() : fail(new Error(`ffmpeg failed (${code})`)))));
  return {
    async push(png) { if (!ffmpeg.stdin.write(png)) await new Promise((r) => ffmpeg.stdin.once("drain", r)); },
    end() { ffmpeg.stdin.end(); return finished; },
  };
}

async function main() {
  const [command, list] = process.argv.slice(2);
  if (!["frames", "stills", "video"].includes(command)) {
    console.log("usage: node kit/render.cjs frames <t,…> | stills <n,…> | video [file.mp4]");
    process.exit(1);
  }
  fs.mkdirSync("out", { recursive: true });
  const stage = await new Stage().open();
  try {
    if (command === "frames" || command === "stills") {
      for (const value of (list || "0").split(",").map(Number)) {
        const png = await stage.snap(command === "frames" ? "frameAt" : "stillAt", value);
        const file = command === "frames" ? `out/${stage.name}-${value}s.png` : `out/still-${value}.png`;
        fs.writeFileSync(file, png);
        console.log(file);
      }
    } else {
      const file = list || `out/${stage.name}.mp4`;
      const count = Math.round((await stage.length()) * settings.fps);
      const out = encoder(file);
      for (let n = 0; n < count; n++) {
        await out.push(await stage.snap("frameAt", n / settings.fps));
        if (n % settings.fps === 0) process.stdout.write(`\r${Math.round((100 * n) / count)}%`);
      }
      await out.end();
      console.log(`\r${file}`);
    }
  } finally {
    await stage.close();
  }
}

main().catch((err) => { console.error(err.message); process.exit(1); });
