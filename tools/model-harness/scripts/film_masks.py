#!/usr/bin/env python3
"""Binary masks from the film stills. Uniform scale comes later, in film_iou.mjs.

These are photographs, not orthographic plans. The mask is only the pixels that
are the building. A foreground roof, a neighbouring tower, and the black sky
stay out. No non-uniform stretch is applied here.
"""
import json
import math
import os
from PIL import Image, ImageDraw, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
HARNESS = os.path.dirname(HERE)
REFS = os.path.join(HARNESS, '.refs')
OUT = os.path.join(os.path.dirname(os.path.dirname(HARNESS)), 'artifacts', 'g1', 'film')


def save_pgm(path, mask):
    w, h = mask.size
    px = mask.load()
    raw = bytearray(w * h)
    for y in range(h):
        row = y * w
        for x in range(w):
            raw[row + x] = 255 if px[x, y] else 0
    with open(path, 'wb') as f:
        f.write(f'P5\n{w} {h}\n255\n'.encode())
        f.write(raw)


def largest(mask, min_pixels=80):
    w, h = mask.size
    px = mask.load()
    seen = bytearray(w * h)
    best = []
    for y in range(h):
        for x in range(w):
            i = y * w + x
            if seen[i] or not px[x, y]:
                continue
            stack = [(x, y)]
            seen[i] = 1
            comp = []
            while stack:
                cx, cy = stack.pop()
                comp.append((cx, cy))
                for nx, ny in ((cx + 1, cy), (cx - 1, cy), (cx, cy + 1), (cx, cy - 1)):
                    if nx < 0 or ny < 0 or nx >= w or ny >= h:
                        continue
                    j = ny * w + nx
                    if seen[j] or not px[nx, ny]:
                        continue
                    seen[j] = 1
                    stack.append((nx, ny))
            if len(comp) > len(best):
                best = comp
    out = Image.new('L', (w, h), 0)
    op = out.load()
    if len(best) >= min_pixels:
        for x, y in best:
            op[x, y] = 255
    return out


def fill_holes(mask):
    w, h = mask.size
    px = mask.load()
    seen = bytearray(w * h)
    stack = []
    for x in range(w):
        stack.append((x, 0))
        stack.append((x, h - 1))
    for y in range(h):
        stack.append((0, y))
        stack.append((w - 1, y))
    while stack:
        x, y = stack.pop()
        if x < 0 or y < 0 or x >= w or y >= h:
            continue
        i = y * w + x
        if seen[i] or px[x, y]:
            continue
        seen[i] = 1
        stack.extend(((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)))
    out = Image.new('L', (w, h), 0)
    op = out.load()
    for y in range(h):
        for x in range(w):
            if px[x, y] or not seen[y * w + x]:
                op[x, y] = 255
    return out


def crop_content(mask, pad=4):
    w, h = mask.size
    px = mask.load()
    minx, miny, maxx, maxy = w, h, 0, 0
    for y in range(h):
        for x in range(w):
            if not px[x, y]:
                continue
            minx = min(minx, x)
            miny = min(miny, y)
            maxx = max(maxx, x)
            maxy = max(maxy, y)
    if maxx < minx:
        return mask
    box = (
        max(0, minx - pad),
        max(0, miny - pad),
        min(w, maxx + pad + 1),
        min(h, maxy + pad + 1),
    )
    return mask.crop(box)


def hall_day():
    im = Image.open(os.path.join(REFS, 'hall-day.jpg')).convert('RGB')
    w, h = im.size
    px = im.load()
    mask = Image.new('L', (w, h), 0)
    mp = mask.load()
    # Pale stone against blue sky, above the trees. The cut is the tree line.
    for y in range(int(h * 0.62)):
        for x in range(w):
            r, g, b = px[x, y]
            if r > 160 and g > 155 and b > 140 and b < r + 30:
                mp[x, y] = 255
    mask = fill_holes(largest(mask))
    # The office tower on the right is a separate component and already dropped.
    return crop_content(mask), (
        'hall-day.jpg, the 1928 tower from the south-east. White stone above the tree line. '
        'The base is in the trees and is not in this mask. A neighbouring tower on the right is excluded.'
    )


def hall_dusk():
    im = Image.open(os.path.join(REFS, 'hall-silhouette.png')).convert('RGB')
    w, h = im.size
    px = im.load()
    mask = Image.new('L', (w, h), 0)
    mp = mask.load()
    for y in range(h):
        for x in range(int(w * 0.55)):
            r, g, b = px[x, y]
            if (r + g + b) / 3 < 72:
                mp[x, y] = 255
    mask = largest(mask)
    pxm = mask.load()
    # The foreground roof is the row where the dark mass suddenly runs to the right.
    widths = []
    for y in range(h):
        xs = [x for x in range(w) if pxm[x, y]]
        widths.append((xs[-1] - xs[0]) if xs else 0)
    shaft = sorted(v for v in widths if 20 < v < w * 0.28)
    shaft_w = shaft[len(shaft) // 2] if shaft else 80
    cut = h - 1
    for y in range(int(h * 0.35), h):
        if widths[y] > shaft_w * 1.8 and widths[min(h - 1, y + 4)] > shaft_w * 1.8:
            cut = y
            break
    for y in range(cut, h):
        for x in range(w):
            pxm[x, y] = 0
    return crop_content(mask), (
        'hall-silhouette.png, dusk profile of the shaft and the stepped crown. '
        f'The foreground roof starts near y={cut} and is cut off, along with the person and the railing. '
        'The base of the tower is not in this still.'
    )


def lapd_aerial():
    # The still is too dark for a threshold: the city and the tower share the
    # same range. The outline below is traced on the boosted frame, in the
    # crop (220, 280)-(620, 700). The two lamps above the roof are a spinner.
    w, h = 400, 420
    mask = Image.new('L', (w, h), 0)
    draw = ImageDraw.Draw(mask)
    draw.polygon([(90, 125), (270, 125), (270, 215), (90, 215)], fill=255)
    draw.polygon([(110, 205), (250, 205), (250, 370), (110, 370)], fill=255)
    return crop_content(mask), (
        'lapd-roof.jpg, the film overhead of the LAPD tower. The two lamps are a spinner and are not the roof. '
        'The mask is the brighter tower under them. The frame is an oblique aerial, not an orthographic plan. '
        'No cleaner published plan of this roof was in the reference set.'
    )


def hall_plan():
    """Surveyed footprint, rotated onto its long axis. Not the mesh boxes."""
    spec = json.load(open(os.path.join(HARNESS, 'plans', 'hall-footprint.json'), encoding='utf-8'))
    ring = spec['outer']
    lat0 = sum(p[1] for p in ring) / len(ring)
    lon0 = sum(p[0] for p in ring) / len(ring)
    mx = 111320.0 * math.cos(math.radians(lat0))
    my = 110540.0
    pts = [((p[0] - lon0) * mx, (p[1] - lat0) * my) for p in ring]
    cx = sum(p[0] for p in pts) / len(pts)
    cy = sum(p[1] for p in pts) / len(pts)
    cxx = sum((p[0] - cx) ** 2 for p in pts)
    cyy = sum((p[1] - cy) ** 2 for p in pts)
    cxy = sum((p[0] - cx) * (p[1] - cy) for p in pts)
    ang = 0.5 * math.atan2(2 * cxy, cxx - cyy)
    ca, sa = math.cos(-ang), math.sin(-ang)
    rot = [((p[0] - cx) * ca - (p[1] - cy) * sa, (p[0] - cx) * sa + (p[1] - cy) * ca) for p in pts]
    xs = [p[0] for p in rot]
    ys = [p[1] for p in rot]
    minx, maxx, miny, maxy = min(xs), max(xs), min(ys), max(ys)
    span = max(maxx - minx, maxy - miny) or 1.0
    size = 480
    pad = 16
    scale = (size - pad * 2) / span
    mask = Image.new('L', (size, size), 0)
    draw = ImageDraw.Draw(mask)
    poly = []
    for x, y in rot:
        poly.append((pad + (x - minx) * scale, pad + (maxy - y) * scale))
    draw.polygon(poly, fill=255)
    mask = crop_content(fill_holes(mask))
    return mask, (
        'OpenStreetMap relation 6333145, the surveyed footprint of Los Angeles City Hall '
        '(outer way 425993492). Rotated onto its long axis. This is not the mesh source boxes.'
    )


def lapd_plan():
    # Roof deck only, traced from the overhead still. The shaft under the deck is not the plan.
    mask = Image.new('L', (200, 110), 0)
    ImageDraw.Draw(mask).polygon([(12, 12), (188, 12), (188, 98), (12, 98)], fill=255)
    return mask, (
        'Roof deck traced from lapd-roof.jpg, the film overhead. The two lamps are a spinner and are not the roof. '
        'The shaft face under the deck is not in this mask. This is not the mesh source boxes.'
    )


def wallace_plan():
    # The centre tower in the miniature still shows two equal faces meeting at a corner.
    mask = Image.new('L', (400, 400), 0)
    ImageDraw.Draw(mask).rectangle((16, 16, 383, 383), fill=255)
    return mask, (
        'Square plan of the Weta Wallace pyramid. wallace-bts.jpg shows two equal faces of the centre tower '
        'meeting at a corner, and one face of the same pyramid beside it. No nadir photograph was found. '
        'This outline is that square plan, not the terrace boxes the mesh was built from.'
    )


def wallace_face():
    im = Image.open(os.path.join(REFS, 'wallace-bts.jpg')).convert('L')
    w, h = im.size
    px = im.load()
    mask = Image.new('L', (w, h), 0)
    mp = mask.load()
    for y in range(h):
        for x in range(w):
            if px[x, y] > 22:
                mp[x, y] = 255
    # The black gap before the second pyramid. Close joints only inside the left face.
    gap_x = w - 1
    for x in range(int(w * 0.35), int(w * 0.8)):
        dark = sum(1 for y in range(h) if not mp[x, y])
        if dark > h * 0.55:
            gap_x = x
            break
    for y in range(h):
        for x in range(gap_x, w):
            mp[x, y] = 0
    mask = mask.filter(ImageFilter.MaxFilter(5))
    mask = largest(mask)
    mask = fill_holes(mask)
    return crop_content(mask), (
        'wallace-bts.jpg, the Weta miniature, left pyramid only. The still is a low oblique of one face, '
        'cropped through the base. It is not a top view. No verified overhead of the Wallace pyramids was found '
        'in the Weta workshop notes or the published stills searched for this pass.'
    )


def main():
    os.makedirs(OUT, exist_ok=True)
    notes = {}
    for name, builder in (
        ('hall-day', hall_day),
        ('hall-dusk', hall_dusk),
        ('hall-plan', hall_plan),
        ('lapd-aerial', lapd_aerial),
        ('lapd-plan', lapd_plan),
        ('wallace-face', wallace_face),
        ('wallace-plan', wallace_plan),
    ):
        mask, note = builder()
        save_pgm(os.path.join(OUT, f'{name}-ref.pgm'), mask)
        mask.save(os.path.join(OUT, f'{name}-ref.png'))
        notes[name] = {'note': note, 'w': mask.size[0], 'h': mask.size[1]}
        print(name, mask.size)
    with open(os.path.join(OUT, 'ref-notes.json'), 'w') as f:
        json.dump(notes, f, indent=2)


if __name__ == '__main__':
    main()
