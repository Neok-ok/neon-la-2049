// Before/after contact sheet for the PR. Seven pairs, medium night-rain frames.
import { spawnSync } from 'node:child_process';

const py = `
from PIL import Image, ImageDraw, ImageFont
pairs = [
    ("docs/humans/before/market-crowd.png", "docs/humans/after/little-tokyo-market-medium-f0.png", "Little Tokyo"),
    ("docs/humans/before/broadway-bridge.png", "docs/humans/after/dancer-broadway-medium-f0.png", "Broadway dancer"),
    ("docs/humans/before/hw-holo.png", "docs/humans/after/dancer-hollywood-medium-f0.png", "Hollywood dancer"),
    ("docs/humans/before/civic-steps-rain.png", "docs/humans/after/civic-center-medium-f0.png", "Civic Center"),
    ("docs/humans/before/dtla-street-rain.png", "docs/humans/after/dtla-medium-f0.png", "DTLA"),
    ("docs/humans/before/interior-door.png", "docs/humans/after/scale-door-car-medium.png", "Door and car"),
    ("docs/humans/before/market-iphone.png", "docs/humans/after/historic-core-medium-f0.png", "Historic Core"),
]
cell_w, cell_h, label_h, gap = 460, 258, 22, 8
font = ImageFont.load_default()
rows = len(pairs)
W = cell_w * 2 + gap
H = rows * (cell_h + label_h) + gap * (rows - 1)
sheet = Image.new("RGB", (W, H), (10, 10, 12))
draw = ImageDraw.Draw(sheet)
for i, (before, after, title) in enumerate(pairs):
    y = i * (cell_h + label_h + gap)
    draw.text((6, y + 4), title + "   before", fill=(180, 180, 180), font=font)
    draw.text((cell_w + gap + 6, y + 4), "after", fill=(220, 210, 170), font=font)
    for col, path in enumerate((before, after)):
        im = Image.open(path).convert("RGB")
        im = im.resize((cell_w, cell_h), Image.Resampling.LANCZOS)
        sheet.paste(im, (col * (cell_w + gap), y + label_h))
sheet.save("docs/humans/after/compare.png")
print(sheet.size)
`;
const r = spawnSync('python3', ['-c', py], { cwd: '/workspace', encoding: 'utf8' });
if (r.status !== 0) {
  console.error(r.stderr);
  process.exit(r.status || 1);
}
console.log(r.stdout.trim());
