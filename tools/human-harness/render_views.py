# Orthographic sheets for the critic rounds. Neutral key light, then a neon rim.
# The 200 m card is the impostor study. The game does not draw the crowd out there.
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'tools' / 'human-harness'))

from lib.crowd import build_crowd
from lib.dancer import build_dancer
from lib.gait import BONES, clip_skin, measure_plant, skin_point

OUT = ROOT / 'tools' / 'human-harness' / 'sheets'
BODY = {0, 1, 2, 3, 4, 5}
LONG = BODY | {6, 16}
RAIN = (LONG - {5}) | {7, 8, 15}


def _posed(mesh, skin):
    pos = []
    for p, uv1 in zip(mesh.pos, mesh.uv1):
        if skin is None:
            pos.append(p)
        else:
            pos.append(skin_point(skin, BONES[int(uv1[1])], p))
    return pos


def _raster(pos, idx, uv1, parts, cam, size, ppm, origin, light, rim, rim_color):
    w, h = size
    color = np.zeros((h, w, 3), np.float32)
    depth = np.full((h, w), 1e9, np.float32)
    light = np.array(light, np.float32)
    light /= np.linalg.norm(light)
    rim = np.array(rim, np.float32)
    rim /= max(1e-6, np.linalg.norm(rim))
    base = np.array((0.62, 0.56, 0.5), np.float32)
    rim_c = np.array(rim_color, np.float32)
    for i in range(0, len(idx), 3):
        ids = (idx[i], idx[i + 1], idx[i + 2])
        if any(int(uv1[k][0]) not in parts for k in ids):
            continue
        tri = [pos[k] for k in ids]
        n = np.cross(
            np.subtract(tri[1], tri[0]),
            np.subtract(tri[2], tri[0]),
        )
        ln = np.linalg.norm(n)
        if ln < 1e-8:
            continue
        n = n / ln
        ndl = max(0.0, float(np.dot(n, light)))
        ndr = max(0.0, float(np.dot(n, rim)))
        shade = base * (0.16 + 0.84 * ndl) + rim_c * ndr
        pts = []
        zs = []
        for p in tri:
            s, d = cam(p)
            pts.append((origin[0] + s[0] * ppm, origin[1] - s[1] * ppm))
            zs.append(d)
        xs = [p[0] for p in pts]
        ys = [p[1] for p in pts]
        minx, maxx = max(0, int(min(xs))), min(w - 1, int(max(xs)) + 1)
        miny, maxy = max(0, int(min(ys))), min(h - 1, int(max(ys)) + 1)
        if minx >= maxx or miny >= maxy:
            continue
        # Barycentric in screen space. Depth is interpolated the same way.
        x0, y0 = pts[0]
        x1, y1 = pts[1]
        x2, y2 = pts[2]
        den = (y1 - y2) * (x0 - x2) + (x2 - x1) * (y0 - y2)
        if abs(den) < 1e-6:
            continue
        yy, xx = np.mgrid[miny:maxy, minx:maxx]
        w0 = ((y1 - y2) * (xx - x2) + (x2 - x1) * (yy - y2)) / den
        w1 = ((y2 - y0) * (xx - x2) + (x0 - x2) * (yy - y2)) / den
        w2 = 1.0 - w0 - w1
        inside = (w0 >= -0.001) & (w1 >= -0.001) & (w2 >= -0.001)
        z = w0 * zs[0] + w1 * zs[1] + w2 * zs[2]
        closer = inside & (z < depth[miny:maxy, minx:maxx])
        depth[miny:maxy, minx:maxx][closer] = z[closer]
        color[miny:maxy, minx:maxx][closer] = shade
    return Image.fromarray((np.clip(color, 0, 1) * 255).astype(np.uint8), 'RGB')


def _cam_front(p):
    return (p[0], p[1]), -p[2]


def _cam_back(p):
    return (-p[0], p[1]), p[2]


def _cam_side(p):
    return (p[2], p[1]), p[0]


def _cam_top(p):
    return (p[0], -p[2]), -p[1]


def _sheet(images, labels, path):
    w = max(im.width for im in images)
    h = max(im.height for im in images)
    pad = 18
    sheet = Image.new('RGB', (len(images) * (w + pad) + pad, h + 36), (12, 11, 14))
    draw = ImageDraw.Draw(sheet)
    for i, (im, label) in enumerate(zip(images, labels)):
        x = pad + i * (w + pad)
        sheet.paste(im, (x, 8))
        draw.text((x, h + 14), label, fill=(220, 210, 200))
    path.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(path)
    print('wrote', path)


def main():
    mesh = build_crowd('high')
    idx = mesh.idx
    uv1 = mesh.uv1
    size = (220, 280)
    origin = (110, 250)
    ppm = 120
    neutral_l = (0.15, 0.95, 0.25)
    neutral_r = (0.0, 0.35, 0.15)
    neutral_c = (0.25, 0.27, 0.3)
    neon_l = (0.1, 0.55, 0.2)
    neon_r = (0.85, -0.1, 0.5)
    neon_c = (1.0, 0.22, 0.55)
    views = (('front', _cam_front), ('side', _cam_side), ('back', _cam_back), ('top', _cam_top))
    stand = _posed(mesh, clip_skin('stand', 0.25))
    rain = _posed(mesh, clip_skin('umbrellaIdle', 0))
    for name, light, rim, rim_c in (
        ('neutral', neutral_l, neutral_r, neutral_c),
        ('neon', neon_l, neon_r, neon_c),
    ):
        imgs, labels = [], []
        for label, cam in views:
            imgs.append(_raster(stand, idx, uv1, LONG, cam, size, ppm, origin, light, rim, rim_c))
            labels.append(f'{label} {name}')
        imgs.append(_raster(rain, idx, uv1, RAIN, _cam_front, size, ppm, origin, light, rim, rim_c))
        labels.append(f'rain {name}')
        _sheet(imgs, labels, OUT / f'crowd-turntable-{name}.png')

    frames = []
    for i in range(8):
        skin = clip_skin('walk', i / 8)
        posed = _posed(mesh, skin)
        frames.append(_raster(posed, idx, uv1, LONG, _cam_front, size, ppm, origin, neutral_l, neutral_r, neutral_c))
    _sheet(frames, [f'walk {i}/8' for i in range(8)], OUT / 'crowd-walk-strip.png')

    uframes = []
    for i in range(4):
        skin = clip_skin('umbrellaWalk', i / 4)
        posed = _posed(mesh, skin)
        uframes.append(_raster(posed, idx, uv1, RAIN, _cam_side, (260, 300), ppm, (70, 270), neon_l, neon_r, neon_c))
    _sheet(uframes, [f'umbrella {i}/4' for i in range(4)], OUT / 'crowd-umbrella-strip.png')

    # Impostor study: the front neutral frame, shrunk the way a 200 m card would read.
    card = frames[0].resize((36, 46), Image.Resampling.BILINEAR)
    board = Image.new('RGB', (220, 120), (12, 11, 14))
    board.paste(card, (16, 28))
    ImageDraw.Draw(board).text((70, 40), '200 m impostor card', fill=(220, 210, 200))
    ImageDraw.Draw(board).text((70, 58), 'harness only — crowd radius stops at 88 m', fill=(160, 150, 140))
    board.save(OUT / 'crowd-impostor-200m.png')

    dancer = build_dancer('high')
    dpos = dancer.pos
    dw, dh = 360, 720
    dimg = _raster(
        dpos, dancer.idx, dancer.uv1, set(range(0, 8)), _cam_front,
        (dw, dh), 9, (dw / 2, dh - 20), neon_l, (1.0, 0.05, 0.4), (1.0, 0.18, 0.55),
    )
    dside = _raster(
        dpos, dancer.idx, dancer.uv1, set(range(0, 8)), _cam_side,
        (180, dh), 9, (90, dh - 20), neon_l, (1.0, 0.05, 0.4), (1.0, 0.18, 0.55),
    )
    _sheet([dimg, dside], ['dancer front', 'dancer side'], OUT / 'dancer-turntable-neon.png')

    plants = {s: measure_plant(s) for s in (0.92, 1.0, 1.08)}
    print({k: {m: round(v, 5) if isinstance(v, float) else v for m, v in p.items() if m != 'pelvis_y_m'} for k, p in plants.items()})


if __name__ == '__main__':
    main()
