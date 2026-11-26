# Global motion per frame via phase correlation on 480px grayscale frames.
# Prints, per 0.5s window: mean speed as % of frame width per second, and direction.
import sys, subprocess, numpy as np
path, fps = sys.argv[1], 24
W, H = 480, 270
raw = subprocess.run(["ffmpeg", "-v", "error", "-i", path, "-vf", f"fps={fps},scale={W}:{H},format=gray", "-f", "rawvideo", "-"], capture_output=True).stdout
fr = np.frombuffer(raw, np.uint8).reshape(-1, H, W).astype(np.float32)
win = np.outer(np.hanning(H), np.hanning(W))
def shift(a, b):
    A = np.fft.fft2((a - a.mean()) * win); B = np.fft.fft2((b - b.mean()) * win)
    R = A * np.conj(B); R /= np.abs(R) + 1e-6
    r = np.fft.ifft2(R).real; y, x = np.unravel_index(np.argmax(r), r.shape)
    if y > H // 2: y -= H
    if x > W // 2: x -= W
    peak = r.max() / (np.abs(r).mean() + 1e-9)
    return x, y, peak
rows = []
for i in range(1, len(fr)):
    x, y, pk = shift(fr[i], fr[i - 1]); rows.append((i / fps, x, y, pk))
rows = np.array(rows)
step = int(fps * 0.5)
for s in range(0, len(rows), step):
    c = rows[s:s + step]
    good = c[c[:, 3] > 8]
    if len(good) == 0: print(f"{c[0,0]:5.1f}s  --"); continue
    vx, vy = good[:, 1].mean() * fps / W * 100, good[:, 2].mean() * fps / W * 100
    sp = np.hypot(good[:, 1], good[:, 2]).mean() * fps / W * 100
    cut = " CUT?" if (c[:, 3] < 4).any() else ""
    print(f"{c[0,0]:5.1f}s  {sp:5.1f}%W/s  vx {vx:+5.1f} vy {vy:+5.1f}{cut}")
