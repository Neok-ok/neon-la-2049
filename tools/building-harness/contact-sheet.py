# Before/after contact sheet for the B1 towers. Game frames only.
#   python3 tools/building-harness/contact-sheet.py
import os
from PIL import Image, ImageDraw, ImageFont

BEFORE = os.environ.get('BEFORE', '/opt/cursor/artifacts/b1')
AFTER = os.environ.get('AFTER', '/opt/cursor/artifacts/b1/night')
OUT = os.environ.get('OUT', '/workspace/docs/buildings/compare.png')

cells = [
    ('Before, downtown street', os.path.join(BEFORE, 'before-dtla-street.png')),
    ('After, band slab street', os.path.join(AFTER, 'ultra-band-slab-street.png')),
    ('After, gate street', os.path.join(AFTER, 'ultra-hero-gate-street.png')),
    ('Before, financial skyline', os.path.join(BEFORE, 'before-mega-skyline.png')),
    ('After, band slab skyline', os.path.join(AFTER, 'ultra-band-slab-sky.png')),
    ('After, gate skyline', os.path.join(AFTER, 'ultra-hero-gate-sky.png')),
    ('Before, opening', os.path.join(BEFORE, 'before-opening.png')),
    ('After, band slab flyby', os.path.join(AFTER, 'ultra-band-slab-fly.png')),
    ('After, gate flyby', os.path.join(AFTER, 'ultra-hero-gate-fly.png')),
]

thumb_w, thumb_h = 480, 270
label_h = 28
pad = 10
cols = 3
rows = 3
sheet = Image.new('RGB', (cols * thumb_w + (cols + 1) * pad, rows * (thumb_h + label_h) + (rows + 1) * pad), (12, 12, 14))
draw = ImageDraw.Draw(sheet)
try:
    font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 14)
except OSError:
    font = ImageFont.load_default()

for i, (label, path) in enumerate(cells):
    c, r = i % cols, i // cols
    x = pad + c * (thumb_w + pad)
    y = pad + r * (thumb_h + label_h + pad)
    im = Image.open(path).convert('RGB')
    im.thumbnail((thumb_w, thumb_h))
    canvas = Image.new('RGB', (thumb_w, thumb_h), (0, 0, 0))
    canvas.paste(im, ((thumb_w - im.width) // 2, (thumb_h - im.height) // 2))
    sheet.paste(canvas, (x, y))
    draw.text((x, y + thumb_h + 4), label, fill=(230, 230, 230), font=font)

os.makedirs(os.path.dirname(OUT), exist_ok=True)
sheet.save(OUT, 'PNG')
print(OUT, sheet.size)
