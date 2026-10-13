#!/usr/bin/env python3
"""Original trim sheets for the three landmarks. Not a copied texture.

Each building gets its own tileable albedo, normal and roughness. LAPD is
board-formed concrete, City Hall is limestone, Wallace is coursed blue-grey
ashlar. A decal plate per building carries an original mark, not a wordmark.
Vertex colour only stains and splits jacket from stone. It does not supply
the material.
"""
import math
import os
import sys

from PIL import Image, ImageDraw, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
HARNESS = os.path.dirname(HERE)
OUT = os.path.join(HARNESS, '.rounds', 'maps')


def clamp(v):
    return 0 if v < 0 else 255 if v > 255 else int(v)


def hash2(x, y):
    n = (x * 374761393 + y * 668265263) & 0xFFFFFFFF
    n = (n ^ (n >> 13)) * 1274126177 & 0xFFFFFFFF
    return ((n ^ (n >> 16)) & 0xFFFFFF) / 0xFFFFFF


def fade(t):
    return t * t * (3.0 - 2.0 * t)


def noise2(x, y, cx, cy):
    """Value noise. x and y wrap on 1, with separate cell counts so a streak can be tall."""
    fx = x * cx
    fy = y * cy
    x0 = int(math.floor(fx)) % cx
    y0 = int(math.floor(fy)) % cy
    x1 = (x0 + 1) % cx
    y1 = (y0 + 1) % cy
    tx = fade(fx - math.floor(fx))
    ty = fade(fy - math.floor(fy))
    n00 = hash2(x0, y0 + 17)
    n10 = hash2(x1, y0 + 17)
    n01 = hash2(x0, y1 + 17)
    n11 = hash2(x1, y1 + 17)
    return (n00 * (1 - tx) + n10 * tx) * (1 - ty) + (n01 * (1 - tx) + n11 * tx) * ty


def bands(n, seed, lo=0.72, hi=1.38):
    """Seam positions that wrap, so the tile has no drawn border."""
    weights = [lo + (hi - lo) * hash2(i + 1, seed) for i in range(n)]
    total = sum(weights) or 1.0
    edges = [0.0]
    acc = 0.0
    for w in weights:
        acc += w / total
        edges.append(acc)
    edges[-1] = 1.0
    return edges


def locate(t, edges):
    t = t % 1.0
    last = len(edges) - 2
    for i in range(len(edges) - 1):
        if t < edges[i + 1] or i == last:
            span = max(1e-6, edges[i + 1] - edges[i])
            return i, (t - edges[i]) / span, span
    return 0, 0.0, 1.0


def groove(local, span_uv, tile, width_m):
    dist = min(local, 1.0 - local) * span_uv * tile
    if dist >= width_m:
        return 0.0
    t = 1.0 - dist / width_m
    return t * t


def write_normal(height, npx, scale):
    size = len(height)
    for y in range(size):
        for x in range(size):
            xm = height[y][(x - 1) % size]
            xp = height[y][(x + 1) % size]
            ym = height[(y - 1) % size][x]
            yp = height[(y + 1) % size][x]
            dx = (xm - xp) * scale
            dy = (ym - yp) * scale
            length = math.sqrt(dx * dx + dy * dy + 1.0) or 1.0
            npx[x, y] = (
                clamp((dx / length) * 127 + 128),
                clamp((dy / length) * 127 + 128),
                clamp((1.0 / length) * 127 + 128),
            )


def save_maps(kind, size, albedo, rough, normal):
    os.makedirs(OUT, exist_ok=True)
    albedo.save(os.path.join(OUT, f'{kind}-albedo-{size}.jpg'), quality=90)
    rough.save(os.path.join(OUT, f'{kind}-rough-{size}.jpg'), quality=86)
    normal.save(os.path.join(OUT, f'{kind}-normal-{size}.png'))
    print('maps', kind, size)


def paint_lapd(size, tile=7.2):
    """Board-formed concrete. Boards are grain, not a panel colour. The pour is the 3.6 m floor."""
    albedo = Image.new('RGB', (size, size))
    rough = Image.new('L', (size, size))
    normal = Image.new('RGB', (size, size))
    apx, rpx, npx = albedo.load(), rough.load(), normal.load()
    sheet_w, sheet_h = 1.22, 2.44
    height = [[0.0] * size for _ in range(size)]
    for y in range(size):
        row = height[y]
        ym = (y / size) * tile
        sy = int(ym / sheet_h)
        ly = ym - sy * sheet_h
        pour = min(ym % 3.6, 3.6 - (ym % 3.6)) < 0.045
        for x in range(size):
            xm = (x / size) * tile
            sx = int(xm / sheet_w)
            lx = xm - sx * sheet_w
            seam = lx < 0.008 or lx > sheet_w - 0.008 or ly < 0.008 or ly > sheet_h - 0.008
            tie = abs((lx % 0.61) - 0.305) < 0.012 and abs((ly % 1.22) - 0.4) < 0.012
            sheet = hash2(sx + 3, sy + 11)
            grain = hash2(x, y)
            # Horizontal board grain. A sine across the sheet paints arch blotches.
            board = hash2(sx + 9, int(ly * 90.0) + sy * 5)
            grit = noise2(xm * 2.4, ym * 2.4, 11, 11)
            stain = noise2(xm * 0.35, ym * 0.2, 4, 2)
            # Charcoal you can see. A 1.2 m form seam at full depth reads as roof tile.
            base = 72 + (sheet - 0.5) * 8 + (grain - 0.5) * 5 + (grit - 0.5) * 6 + (board - 0.5) * 7
            if stain > 0.88:
                base -= 8
            if seam:
                base -= 3
            if pour:
                base -= 6
            if tie:
                base -= 4
            base = clamp(base)
            apx[x, y] = (clamp(base * 0.96), clamp(base * 0.98), clamp(base * 1.0))
            rpx[x, y] = clamp(176 + (1.0 - grit) * 16 + (4 if seam else 0) + (6 if pour else 0))
            hgt = 0.52 + (board - 0.8) * 0.03 + (grit - 0.5) * 0.02
            if seam:
                hgt -= 0.012
            if pour:
                hgt -= 0.03
            if tie:
                hgt -= 0.02
            row[x] = hgt
    write_normal(height, npx, 2.2)
    save_maps('lapd', size, albedo, rough, normal)


def paint_hall(size, tile=4.0):
    """Coursed limestone. Bed joints and staggered perpends, not blotchy clouds."""
    albedo = Image.new('RGB', (size, size))
    rough = Image.new('L', (size, size))
    normal = Image.new('RGB', (size, size))
    apx, rpx, npx = albedo.load(), rough.load(), normal.load()
    course = 0.48
    stone = 1.05
    height = [[0.0] * size for _ in range(size)]
    for y in range(size):
        row = height[y]
        ym = (y / size) * tile
        cy = int(ym / course)
        ly = ym - cy * course
        bed = ly < 0.016 or ly > course - 0.016
        shift = (stone * 0.5) if (cy % 2) else 0.0
        for x in range(size):
            xm = (x / size) * tile + shift
            cx = int(xm / stone)
            lx = xm - cx * stone
            perp = lx < 0.014 or lx > stone - 0.014
            block = hash2(cx + 5, cy + 9)
            speckle = hash2(x, y)
            base = 232 + (block - 0.5) * 14 + (speckle - 0.5) * 3
            if bed:
                base -= 36
            elif perp:
                base -= 20
            base = clamp(base)
            apx[x, y] = (clamp(base * 0.995), clamp(base * 0.99), clamp(base * 0.975))
            rpx[x, y] = clamp(92 + (1.0 - block) * 16 + (28 if bed else 0) + (14 if perp else 0))
            h = 0.55 + (block - 0.5) * 0.04
            if bed:
                h -= 0.2
            elif perp:
                h -= 0.1
            row[x] = h
    write_normal(height, npx, 7.5)
    save_maps('hall', size, albedo, rough, normal)


def _ashlar_rows(tile):
    """Tall irregular beds. Equal courses with a half-shift are a brick bond."""
    rows = []
    y = 0.0
    i = 0
    while y < tile + 2.0 and i < 48:
        h = 5.5 + hash2(i, 4) * 11.0
        if hash2(i, 8) > 0.84:
            h *= 1.7
        rows.append((y, y + h, i))
        y += h
        i += 1
    return rows


def _ashlar_stones(row_i, tile):
    stones = []
    x = (hash2(row_i, 2) - 0.5) * 14.0
    k = 0
    while x < tile + 16.0 and k < 48:
        w = 7.0 + hash2(row_i, k + 6) * 16.0
        if hash2(row_i + 3, k) > 0.88:
            w *= 1.65
        stones.append((x, x + w, k))
        x += w
        k += 1
    return stones


def paint_wallace(size, tile=120.0):
    """Irregular blue-grey ashlar. Stones differ in both directions, nearly flush."""
    albedo = Image.new('RGB', (size, size))
    rough = Image.new('L', (size, size))
    normal = Image.new('RGB', (size, size))
    apx, rpx, npx = albedo.load(), rough.load(), normal.load()
    rows = _ashlar_rows(tile)
    stones = [_ashlar_stones(i, tile) for i in range(len(rows))]
    height = [[0.0] * size for _ in range(size)]
    for y in range(size):
        row = height[y]
        ym = (y / size) * tile
        y0, y1, cy = rows[0]
        for a, b, i in rows:
            if a <= ym < b or i == len(rows) - 1:
                y0, y1, cy = a, b, i
                if ym < b:
                    break
        course_h = max(2.0, y1 - y0)
        ly = ym - y0
        near_bed = ly < 0.38 or ly > course_h - 0.38
        for x in range(size):
            xm = (x / size) * tile
            sx0, sx1, sk = stones[cy][0]
            for a, b, k in stones[cy]:
                if a <= xm < b or k == len(stones[cy]) - 1:
                    sx0, sx1, sk = a, b, k
                    if xm < b:
                        break
            lx = xm - sx0
            stone_w = max(2.0, sx1 - sx0)
            # A tall stone skips the bed, so the joint does not run the full course.
            tall = hash2(sk + 11, cy) > 0.74
            bed = near_bed and not tall
            perp = lx < 0.32 or lx > stone_w - 0.32
            block = hash2(sk + 5, cy * 3 + 9)
            mineral = noise2(xm * 0.009, ym * 0.007, 4, 2)
            stain = noise2(xm * 0.003, ym * 0.004, 3, 7)
            base = 108 + (block - 0.5) * 88 + (mineral - 0.5) * 26
            if stain > 0.78:
                base -= 18
            if hash2(sk + 2, cy + 6) > 0.92:
                base -= 26
            if bed or perp:
                base -= 28
            base = clamp(base)
            apx[x, y] = (clamp(base * 0.70), clamp(base * 0.80), clamp(base * 0.92))
            rpx[x, y] = clamp(132 + (1.0 - block) * 24 + (18 if bed or perp else 0))
            hgt = 0.55 + (block - 0.5) * 0.04
            if bed or perp:
                hgt -= 0.08
            row[x] = hgt
    write_normal(height, npx, 4.6)
    save_maps('wallace', size, albedo, rough, normal)


def paint(size):
    paint_lapd(size)
    paint_hall(size)
    paint_wallace(size)


def decal(path, draw_fn, size=512):
    image = Image.new('RGBA', (size, size), (18, 20, 24, 255))
    draw = ImageDraw.Draw(image)
    draw_fn(draw, size)
    image = image.filter(ImageFilter.SMOOTH)
    image.save(path)
    print('decal', path)


def lapd_mark(draw, size):
    # Open chevron and a numeral 5. No department wordmark.
    m = size
    ink = (214, 220, 228, 255)
    draw.polygon([
        (m * 0.22, m * 0.38), (m * 0.50, m * 0.12), (m * 0.78, m * 0.38),
        (m * 0.64, m * 0.38), (m * 0.50, m * 0.24), (m * 0.36, m * 0.38),
    ], fill=ink)
    t = m * 0.07
    x0, x1 = m * 0.34, m * 0.68
    y0, y1, y2 = m * 0.48, m * 0.66, m * 0.90
    draw.rectangle((x0, y0, x1, y0 + t), fill=ink)
    draw.rectangle((x0, y0, x0 + t, y1 + t * 0.4), fill=ink)
    draw.rectangle((x0, y1, x1, y1 + t), fill=ink)
    draw.rectangle((x1 - t, y1, x1, y2), fill=ink)
    draw.rectangle((x0, y2 - t, x1, y2), fill=ink)


def hall_mark(draw, size):
    # Stepped fret. No city seal and no lettering.
    m = size
    ink = (196, 184, 162, 255)
    for i, inset in enumerate((0.16, 0.28, 0.40)):
        a = m * inset
        b = m * (1 - inset)
        w = max(4, int(m * 0.035))
        draw.rectangle((a, a, b, a + w), fill=ink)
        draw.rectangle((a, b - w, b, b), fill=ink)
        draw.rectangle((a, a, a + w, b), fill=ink)
        draw.rectangle((b - w, a, b, b), fill=ink)
    draw.polygon([(m * 0.5, m * 0.36), (m * 0.62, m * 0.5), (m * 0.5, m * 0.64), (m * 0.38, m * 0.5)], outline=ink)


def wallace_mark(draw, size):
    # Nested diamond. No corporate wordmark.
    m = size
    ink = (176, 148, 96, 255)
    for scale in (0.34, 0.22, 0.10):
        s = m * scale
        cx = cy = m * 0.5
        draw.polygon([(cx, cy - s), (cx + s, cy), (cx, cy + s), (cx - s, cy)], outline=ink)
        # Pillow outline width via a second, slightly smaller diamond.
        s2 = s - max(3, m * 0.012)
        draw.line([(cx, cy - s), (cx + s, cy), (cx, cy + s), (cx - s, cy), (cx, cy - s)], fill=ink, width=max(2, int(m * 0.012)))
        if s2 > 4:
            draw.line([(cx, cy - s2), (cx + s2, cy), (cx, cy + s2), (cx - s2, cy), (cx, cy - s2)], fill=(18, 16, 14, 255), width=max(2, int(m * 0.008)))


def main():
    size = int(sys.argv[1]) if len(sys.argv) > 1 else 1024
    kind = sys.argv[2] if len(sys.argv) > 2 else 'all'
    os.makedirs(OUT, exist_ok=True)
    painters = {'lapd': paint_lapd, 'hall': paint_hall, 'wallace': paint_wallace}
    if kind == 'all':
        paint(size)
    else:
        painters[kind](size)
    decal(os.path.join(OUT, 'decal-lapd.png'), lapd_mark)
    decal(os.path.join(OUT, 'decal-hall.png'), hall_mark)
    decal(os.path.join(OUT, 'decal-wallace.png'), wallace_mark)


if __name__ == '__main__':
    main()
