// Four-frame strips for the motion critic. Each cell is large enough to read a stride.
import { readdirSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const OUT = '/workspace/docs/humans/after';
const STRIP = join(OUT, 'strips');
mkdirSync(STRIP, { recursive: true });
const CELL_W = 480;
const CELL_H = 270;

const ONLY = new Set((process.env.ONLY || '').split(',').filter(Boolean));
const FULL = new Set((process.env.FULL || '').split(',').filter(Boolean));
const stems = new Set();
for (const name of readdirSync(OUT)) {
  if (name.startsWith('.')) continue;
  const m = name.match(/^(.+)-f0\.png$/);
  if (m && (!ONLY.size || ONLY.has(m[1]))) stems.add(m[1]);
}

const py = `
import json, sys
from PIL import Image, ImageDraw, ImageFont
stems = json.loads(sys.argv[1])
full = set(json.loads(sys.argv[6])) if len(sys.argv) > 6 else set()
out, strip, cw, ch = sys.argv[2:6]
cw, ch = int(cw), int(ch)
font = ImageFont.load_default()
def pale(r, g, b):
    return r > 145 and g > 125 and b > 100 and abs(r - g) < 60

def figure_box(frames):
    # Densest pale figure in each frame (head, pants, umbrella), one shared window.
    w, h = frames[0].size
    minx, miny, maxx, maxy = w, h, 0, 0
    hits = 0
    for im in frames:
        px = im.load()
        col = [0] * w
        for y in range(int(h * 0.18), int(h * 0.9), 2):
            for x in range(0, w, 2):
                r, g, b = px[x, y]
                if pale(r, g, b):
                    col[x] += 1
        best, bx = 0, 0
        for x in range(0, w, 2):
            s = 0
            for k in range(max(0, x - 36), min(w, x + 36), 2):
                s += col[k]
            if s > best:
                best, bx = s, x
        if best < 12:
            continue
        hits += 1
        for y in range(0, h, 2):
            for x in range(max(0, bx - 100), min(w, bx + 100), 2):
                r, g, b = px[x, y]
                if pale(r, g, b):
                    if x < minx: minx = x
                    if y < miny: miny = y
                    if x > maxx: maxx = x
                    if y > maxy: maxy = y
    if hits < 3 or maxx <= minx:
        return None
    bw, bh = maxx - minx, maxy - miny
    if bh < h * 0.08:
        return None
    pad_x = int(max(48, bw * 0.12))
    pad_y = int(max(36, bh * 0.16))
    return (max(0, minx - pad_x), max(0, miny - pad_y), min(w, maxx + pad_x), min(h, maxy + pad_y))

def pink_box(im):
    w, h = im.size
    px = im.load()
    minx, miny, maxx, maxy = w, h, 0, 0
    n = 0
    # Night exposure leaves the veil mauve, not hot pink. Keep the column test
    # so a dim figure still beats the neon signs.
    col = [0] * w
    for y in range(int(h * 0.12), int(h * 0.88), 2):
        for x in range(0, w, 2):
            r, g, b = px[x, y]
            pink = r > 48 and r > g + 12 and b > 36 and r > b * 0.7
            # Diamond and the raised hand are the pale core, not the pink cloth.
            hot = r > 168 and g > 168 and b > 150 and abs(r - g) < 36
            if pink or hot:
                col[x] += 1
    best, bx = 0, w // 2
    for x in range(0, w, 2):
        s = sum(col[max(0, x - 24):min(w, x + 24)])
        if s > best:
            best, bx = s, x
    for y in range(0, h, 2):
        for x in range(max(0, bx - 90), min(w, bx + 90), 2):
            r, g, b = px[x, y]
            pink = r > 48 and r > g + 12 and b > 36 and r > b * 0.7
            hot = r > 168 and g > 168 and b > 150 and abs(r - g) < 36
            if pink or hot:
                n += 1
                if x < minx: minx = x
                if y < miny: miny = y
                if x > maxx: maxx = x
                if y > maxy: maxy = y
    return n, minx, miny, maxx, maxy

for stem in stems:
    raw = [Image.open(f"{out}/{stem}-f{i}.png").convert("RGB") for i in range(4)]
    if stem.startswith("dancer-"):
        # One window for all four phases, so a lean is not cropped back to center.
        w, h = raw[0].size
        minx, miny, maxx, maxy, n = w, h, 0, 0, 0
        for im in raw:
            c, x0, y0, x1, y1 = pink_box(im)
            n += c
            minx, miny = min(minx, x0), min(miny, y0)
            maxx, maxy = max(maxx, x1), max(maxy, y1)
        if n > 80 and maxx > minx and (maxx - minx) < w * 0.85:
            pad_x = int((maxx - minx) * 0.22) + 28
            pad_y = int((maxy - miny) * 0.06) + 16
            box = (max(0, minx - pad_x), max(0, miny - pad_y), min(w, maxx + pad_x), min(h, maxy + pad_y))
            raw = [im.crop(box) for im in raw]
    elif stem not in full:
        box = figure_box(raw)
        if box and (box[3] - box[1]) > (box[2] - box[0]) * 0.85:
            raw = [im.crop(box) for im in raw]
    frames = [im.resize((cw, ch), Image.Resampling.LANCZOS) for im in raw]
    sheet = Image.new("RGB", (cw * 4, ch + 22), (12, 12, 14))
    draw = ImageDraw.Draw(sheet)
    for i, fr in enumerate(frames):
        sheet.paste(fr, (i * cw, 22))
    draw.text((8, 4), stem, fill=(230, 230, 230), font=font)
    sheet.save(f"{strip}/{stem}.png")
print(len(stems))
`;

const r = spawnSync('python3', ['-c', py, JSON.stringify([...stems]), OUT, STRIP, String(CELL_W), String(CELL_H), JSON.stringify([...FULL])], { encoding: 'utf8' });
if (r.status !== 0) {
  console.error(r.stderr);
  process.exit(r.status || 1);
}
console.log('strips', r.stdout.trim());
