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


def paint_lapd(size, tile=16.0):
    """Dark board-formed concrete. Hairline vertical joints on one pour, not a panel grid."""
    albedo = Image.new('RGB', (size, size))
    rough = Image.new('L', (size, size))
    normal = Image.new('RGB', (size, size))
    apx, rpx, npx = albedo.load(), rough.load(), normal.load()
    boards = bands(17, 4, 0.88, 1.14)
    lifts = bands(3, 8, 0.85, 1.2)
    height = [[0.0] * size for _ in range(size)]
    for y in range(size):
        row = height[y]
        v = y / size
        _li, lv, lw = locate(v, lifts)
        for x in range(size):
            u = x / size
            _bi, bu, bw = locate(u, boards)
            cloud = noise2(u, v, 3, 3)
            grit = hash2(x // 2, y // 2)
            grain = hash2(x, y)
            stain = noise2(u + 0.13, v, 8, 2)
            pit = noise2(u + 0.2, v + 0.2, 18, 18)
            seam = groove(bu, bw, tile, 0.03)
            lift = groove(lv, lw, tile, 0.03) * 0.25
            drip = max(0.0, stain - 0.62) * 1.8
            base = 72 + cloud * 30 + (pit - 0.5) * 20 + (grit - 0.5) * 14 + (grain - 0.5) * 7
            base -= seam * 10 + lift * 5 + drip * 26
            base = clamp(base)
            apx[x, y] = (clamp(base * 0.90), clamp(base * 0.93), clamp(base * 0.96))
            rpx[x, y] = clamp(150 + seam * 14 + drip * 22 + pit * 16 - cloud * 12)
            h = 0.46 + (cloud - 0.5) * 0.12 + (pit - 0.5) * 0.12
            h -= seam * 0.07 + lift * 0.03 + drip * 0.1
            row[x] = h
    write_normal(height, npx, 5.2)
    save_maps('lapd', size, albedo, rough, normal)


def paint_hall(size, tile=16.0):
    """Honed limestone. Pits and clouds, not a tile grid, so the shaft stays one pale mass."""
    albedo = Image.new('RGB', (size, size))
    rough = Image.new('L', (size, size))
    normal = Image.new('RGB', (size, size))
    apx, rpx, npx = albedo.load(), rough.load(), normal.load()
    height = [[0.0] * size for _ in range(size)]
    for y in range(size):
        row = height[y]
        v = y / size
        for x in range(size):
            u = x / size
            cloud = noise2(u, v, 4, 4)
            mid = noise2(u + 0.17, v + 0.31, 9, 9)
            pit = noise2(u + 0.4, v + 0.08, 17, 17)
            grain = hash2(x, y)
            grit = hash2(x // 2, y // 2)
            pocket = max(0.0, 0.38 - pit) * 2.2
            base = 186 + cloud * 30 + (mid - 0.5) * 20 + (pit - 0.5) * 14
            base += (grit - 0.5) * 8 + (grain - 0.5) * 5
            base -= pocket * 26
            base = clamp(base)
            apx[x, y] = (clamp(base * 1.0), clamp(base * 0.988), clamp(base * 0.96))
            rpx[x, y] = clamp(96 + pocket * 40 + (1.0 - cloud) * 22 + pit * 12)
            h = 0.5 + (cloud - 0.5) * 0.14 + (mid - 0.5) * 0.08
            h -= pocket * 0.28
            row[x] = h
    write_normal(height, npx, 4.6)
    save_maps('hall', size, albedo, rough, normal)


def paint_wallace(size, tile=256.0):
    """Coursed blue-grey ashlar. Large blocks read at orbit; smaller stones read up close."""
    albedo = Image.new('RGB', (size, size))
    rough = Image.new('L', (size, size))
    normal = Image.new('RGB', (size, size))
    apx, rpx, npx = albedo.load(), rough.load(), normal.load()
    macro_u = bands(4, 21, 0.75, 1.45)
    macro_v = bands(5, 22, 0.7, 1.5)
    micros = {}
    for mc in range(len(macro_v) - 1):
        for ms in range(len(macro_u) - 1):
            micros[(mc, ms)] = (
                bands(5 + int(hash2(mc, ms) * 3), 200 + mc * 8 + ms, 0.7, 1.4),
                bands(3 + int(hash2(ms, mc + 2) * 3), 400 + mc * 8 + ms, 0.65, 1.5),
                hash2(mc + 4, ms + 9),
            )
    height = [[0.0] * size for _ in range(size)]
    for y in range(size):
        row = height[y]
        v = y / size
        mc, mv, mh = locate(v, macro_v)
        for x in range(size):
            u = x / size
            ms, mu, mw = locate(u + (0.5 if mc % 2 else 0.0), macro_u)
            courses, stones, bond = micros[(mc, ms)]
            sc, sv, sh = locate(mv, courses)
            ss, su, sw = locate(mu + bond, stones)
            panel = hash2(mc + 1, ms + 3)
            block = hash2(mc * 13 + sc, ms * 9 + ss)
            grit = hash2(x // 2, y // 2)
            streak = noise2(u, v, 11, 3)
            pit = noise2(u + 0.15, v + 0.3, 16, 16)
            drip = max(0.0, streak - 0.66) * 1.5
            macro_g = max(groove(mv, mh, tile, 2.4), groove(mu, mw, tile, 2.4))
            micro_g = max(
                groove(sv, sh * mh, tile, 0.9),
                groove(su, sw * mw, tile, 0.9),
            )
            # A broad stain keeps the 256 m repeat from reading as one pasted tile.
            patch = noise2(u + 0.07, v + 0.2, 2, 2)
            fine = noise2(u, v, 26, 26)
            base = 86 + panel * 46 + (block - 0.5) * 32 + (patch - 0.5) * 16
            base += (pit - 0.5) * 14 + (fine - 0.5) * 16 + (grit - 0.5) * 8
            base -= drip * 28 + macro_g * 32 + micro_g * 16
            base = clamp(base)
            apx[x, y] = (clamp(base * 0.84), clamp(base * 0.93), clamp(base * 1.04))
            rpx[x, y] = clamp(132 + (1.0 - panel) * 24 + macro_g * 36 + micro_g * 18 + drip * 16)
            h = 0.5 + (panel - 0.5) * 0.16 + (block - 0.5) * 0.1
            h -= macro_g * 0.55 + micro_g * 0.28 + drip * 0.08
            row[x] = h
    write_normal(height, npx, 5.0)
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
