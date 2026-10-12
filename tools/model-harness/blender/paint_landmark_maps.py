#!/usr/bin/env python3
"""Original trim-sheet maps for the three landmarks. Not a copied texture.

One tileable concrete sheet (albedo, normal, roughness) plus a decal plate per
building. The sheet tiles in metres. Vertex colour on the mesh tints jacket,
stone and monolith, so the three buildings share the sheet and not a second copy.
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


def paint(size):
    os.makedirs(OUT, exist_ok=True)
    albedo = Image.new('RGB', (size, size))
    rough = Image.new('L', (size, size))
    normal = Image.new('RGB', (size, size))
    apx, rpx, npx = albedo.load(), rough.load(), normal.load()
    # Panel module is 8 m. The sheet is one module, tiled by the UV.
    seam = max(2, size // 128)
    for y in range(size):
        for x in range(size):
            u = x / size
            v = y / size
            edge = min(u, v, 1 - u, 1 - v)
            on_seam = edge < (seam / size)
            cell = hash2(x // 8, y // 8)
            grain = hash2(x, y)
            # Cool mid concrete. Vertex colour pulls it toward stone or black.
            base = 118 + grain * 18 + cell * 10
            if on_seam:
                base *= 0.55
            # A faint board-form streak, horizontal, so a wall reads as pours.
            streak = 6 * math.sin(v * math.pi * 18)
            base = clamp(base + streak)
            apx[x, y] = (clamp(base * 0.92), clamp(base * 0.95), clamp(base))
            r = 168 + grain * 40
            if on_seam:
                r = 210
            rpx[x, y] = clamp(r)
    # Normal from a height field: recessed joints, a soft pour undulation.
    height = [[0.0] * size for _ in range(size)]
    for y in range(size):
        row = height[y]
        for x in range(size):
            u = x / size
            v = y / size
            edge = min(u, v, 1 - u, 1 - v)
            h = 0.55
            if edge < (seam / size):
                h = 0.05
            h += 0.08 * math.sin(v * math.pi * 18)
            h += (hash2(x // 3, y // 3) - 0.5) * 0.06
            row[x] = h
    for y in range(size):
        for x in range(size):
            xm = height[y][(x - 1) % size]
            xp = height[y][(x + 1) % size]
            ym = height[(y - 1) % size][x]
            yp = height[(y + 1) % size][x]
            dx = (xm - xp) * 4.0
            dy = (ym - yp) * 4.0
            # Tangent-space normal, OpenGL-style (+Y up in the texture).
            nx, ny, nz = dx, dy, 1.0
            length = math.sqrt(nx * nx + ny * ny + nz * nz) or 1
            npx[x, y] = (
                clamp((nx / length) * 127 + 128),
                clamp((ny / length) * 127 + 128),
                clamp((nz / length) * 127 + 128),
            )
    albedo.save(os.path.join(OUT, f'concrete-albedo-{size}.jpg'), quality=86)
    rough.save(os.path.join(OUT, f'concrete-rough-{size}.jpg'), quality=82)
    normal.save(os.path.join(OUT, f'concrete-normal-{size}.png'))
    print('maps', size)


def decal(path, draw_fn, size=512):
    image = Image.new('RGBA', (size, size), (18, 20, 24, 255))
    draw = ImageDraw.Draw(image)
    draw_fn(draw, size)
    image = image.filter(ImageFilter.SMOOTH)
    image.save(path)
    print('decal', path)


def lapd_mark(draw, size):
    # Chevron and a sector numeral. No department wordmark.
    m = size
    draw.polygon([(m * 0.18, m * 0.62), (m * 0.50, m * 0.22), (m * 0.82, m * 0.62),
                  (m * 0.68, m * 0.62), (m * 0.50, m * 0.40), (m * 0.32, m * 0.62)], fill=(214, 220, 228, 255))
    draw.rectangle((m * 0.38, m * 0.68, m * 0.62, m * 0.90), fill=(214, 220, 228, 255))
    draw.rectangle((m * 0.46, m * 0.68, m * 0.54, m * 0.90), fill=(18, 20, 24, 255))


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
    paint(size)
    decal(os.path.join(OUT, 'decal-lapd.png'), lapd_mark)
    decal(os.path.join(OUT, 'decal-hall.png'), hall_mark)
    decal(os.path.join(OUT, 'decal-wallace.png'), wallace_mark)


if __name__ == '__main__':
    main()
