// Boots the stage and publishes its timeline for the renderer:
//   window.reelLength      seconds in the selected reel
//   window.frameAt(t)      draw the reel at time t (seconds)
//   window.stillAt(n)      draw STILLS[n - 1]
//
// The reel is chosen by the page hash (index.html#arcs), else window.REEL, else the first key of
// REELS. SPEEDS[reel] stretches it in time (1.15 = 15% slower) without retiming any shot.
//
// Consecutive shots overlap by their `xfade` seconds (default 0.5; 0 is a hard cut). During an
// overlap the incoming shot fades in over the outgoing one, both cameras keep moving, and a light
// blur peaks at the midpoint. Two shots on the same page cannot overlap (one DOM per page), so
// that boundary always cuts.
buildLayers();
afterBuild();

const reelName = location.hash.slice(1) || window.REEL || Object.keys(REELS)[0];
const reel = REELS[reelName];
if (!reel) throw new Error(`no reel named "${reelName}" in REELS`);
const stretch = (typeof SPEEDS !== "undefined" && SPEEDS[reelName]) || 1;

function cameraFor(shot, local) {
  if (shot.path) return shot.path(local);
  if (shot.pairs) return keyedPairs(shot.pairs, local);
  if (shot.keys) return keyed(shot.keys, local);
  if (shot.lin) return linearKeys(shot.lin, local);
  return mix(shot.cam[0], shot.cam[1], drift(clamp(local / shot.dur)));
}
function overlapAfter(i) {
  const a = reel[i], b = reel[i + 1];
  if (!b) return 0;
  const samePage = !a.end && !b.end && cameraFor(a, 0).scene === cameraFor(b, 0).scene;
  return samePage ? 0 : b.xfade ?? 0.5;
}
const starts = [];
let total = 0;
reel.forEach((shot, i) => { starts.push(total); total += shot.dur - overlapAfter(i); });

window.reelLength = total * stretch;

window.frameAt = (seconds) => {
  grain(Math.round(seconds * 60));
  const t = seconds / stretch;
  const live = [];
  reel.forEach((shot, i) => {
    const local = t - starts[i];
    const last = i === reel.length - 1;
    if (local >= 0 && (local < shot.dur || last)) live.push({ shot, i, local });
  });
  const [under, over] = live.length > 1 ? live.slice(-2) : [live[0], null];
  const mixIn = over ? easeInOutCubic(clamp(over.local / overlapAfter(under.i))) : 0;
  const onStage = [under, over].filter((x) => x && !x.shot.end);
  const card = [under, over].find((x) => x && x.shot.end);

  if (onStage.length) {
    const cams = onStage.map((x) => cameraFor(x.shot, x.local));
    placeCameras(cams.map((c, k) => [c, k === 0 ? 1 : mixIn]));
    onStage.forEach((x) => x.shot.state(x.local));
    const lead = cams.length > 1 && mixIn > 0.5 ? 1 : 0;
    const leadShot = onStage[lead];
    applyFocus(cams[lead], leadShot.shot.focus ? leadShot.shot.focus(leadShot.local, cams[lead]) : camFocus(cams[lead]));
    LAYERS[0].el.style.filter = cams.length > 1 ? `blur(${(1.5 * Math.sin(Math.PI * mixIn)).toFixed(2)}px)` : "";
  }
  if (card) endCard(card.local, card === over ? mixIn : 1);
};

window.stillAt = (n) => {
  const still = STILLS[n - 1];
  if (!still) throw new Error(`no still ${n}; STILLS has ${STILLS.length}`);
  grain(n);
  placeCamera(still.cam);
  still.state();
  applyFocus(still.cam, still.focus ?? camFocus(still.cam));
};

window.frameAt(0);
