# Silhouette IoU against the overlap plates, plus anthropometry and the foot plant.
import re
from pathlib import Path

from PIL import Image, ImageDraw

from .crowd import build_crowd
from .dancer import build_dancer
from .gait import BONES, clip_skin, measure_plant, skin_point
from .math3d import sub

ROOT = Path(__file__).resolve().parents[3]
SVG_CROWD = ROOT / 'docs' / 'models' / 'pedestrians' / 'silhouette.svg'
SVG_DANCER = ROOT / 'docs' / 'models' / 'dancer' / 'silhouette.svg'
SCALE = 2


def _groups(svg_text):
    """Polygon point lists keyed by group id, in that group's local pixels."""
    out = {}
    for m in re.finditer(r'<g id="([^"]+)"[^>]*>(.*?)</g>', svg_text, re.S):
        gid, body = m.group(1), m.group(2)
        polys = []
        for pm in re.finditer(r'points="([^"]+)"', body):
            nums = [float(v) for v in re.split(r'[,\s]+', pm.group(1).strip()) if v]
            polys.append(list(zip(nums[0::2], nums[1::2])))
        out[gid] = polys
    transforms = {}
    for m in re.finditer(r'<g id="([^"]+)"[^>]*transform="translate\(([^)]+)\)"', svg_text):
        parts = [float(v) for v in m.group(2).replace(',', ' ').split()]
        transforms[m.group(1)] = (parts[0], parts[1] if len(parts) > 1 else 0.0)
    return out, transforms


def _raster(polys, translate, size, scale=SCALE):
    img = Image.new('1', (size[0] * scale, size[1] * scale), 0)
    draw = ImageDraw.Draw(img)
    ox, oy = translate
    for poly in polys:
        pts = [((ox + x) * scale, (oy + y) * scale) for x, y in poly]
        if len(pts) >= 3:
            draw.polygon(pts, fill=1)
    return img


def _mesh_mask(mesh, project, parts, skin, size, scale=SCALE):
    img = Image.new('1', (size[0] * scale, size[1] * scale), 0)
    draw = ImageDraw.Draw(img)
    pos = mesh.pos
    if skin is not None:
        posed = []
        for p, uv1 in zip(mesh.pos, mesh.uv1):
            bone = BONES[int(uv1[1])]
            posed.append(skin_point(skin, bone, p))
        pos = posed
    idx = mesh.idx
    uv1 = mesh.uv1
    for i in range(0, len(idx), 3):
        a, b, c = idx[i], idx[i + 1], idx[i + 2]
        if int(uv1[a][0]) not in parts or int(uv1[b][0]) not in parts or int(uv1[c][0]) not in parts:
            continue
        tri = [project(pos[k]) for k in (a, b, c)]
        tri = [(x * scale, y * scale) for x, y in tri]
        if max(p[0] for p in tri) < 0 or min(p[0] for p in tri) > size[0] * scale:
            continue
        draw.polygon(tri, fill=1)
    return img


def _iou(a, b):
    ba, bb = a.tobytes(), b.tobytes()
    inter = union = 0
    for x, y in zip(ba, bb):
        # Mode '1' packs 8 pixels per byte. Compare bits.
        inter += (x & y).bit_count()
        union += (x | y).bit_count()
    return (inter / union) if union else 0.0


def _front(x, y, origin):
    return (origin[0] + 70.0 + x * 100.0, origin[1] + 210.0 - y * 100.0)


def _side(z, y, origin):
    return (origin[0] + 37.0 + z * 100.0, origin[1] + 210.0 - y * 100.0)


BODY = {0, 1, 2, 3, 4, 5}
LONG = BODY | {6}
SHORT = BODY | {12}
RAIN = (LONG - {5}) | {7, 8, 15}


def score_crowd(lod='high'):
    svg = SVG_CROWD.read_text()
    groups, xf = _groups(svg)
    size = (700, 280)
    mesh = build_crowd(lod)
    rain = clip_skin('umbrellaIdle', 0)
    views = {
        'stand': ('stand', LONG, None, lambda p, o=xf['stand']: _front(p[0], p[1], o)),
        'short': ('short', SHORT, None, lambda p, o=xf['short']: _front(p[0], p[1], o)),
        'rain': ('rain', RAIN, rain, lambda p, o=xf['rain']: _front(p[0], p[1], o)),
        'side': ('side', LONG, None, lambda p, o=xf['side']: _side(p[2], p[1], o)),
    }
    ious = {}
    masks = {}
    for name, (gid, parts, skin, project) in views.items():
        ref = _raster(groups[gid], xf[gid], size)
        got = _mesh_mask(mesh, project, parts, skin, size)
        ious[name] = _iou(ref, got)
        masks[name] = (ref, got)
    anthro = anthropometry(mesh)
    plant = measure_plant()
    return {'lod': lod, 'triangles': mesh.triangles, 'iou': ious, 'anthro': anthro, 'plant': plant, 'mesh': mesh, 'masks': masks}


def anthropometry(mesh):
    def ys(parts):
        vals = [p[1] for p, uv in zip(mesh.pos, mesh.uv1) if int(uv[0]) in parts]
        return (min(vals), max(vals)) if vals else (0, 0)

    def xs(parts):
        vals = [p[0] for p, uv in zip(mesh.pos, mesh.uv1) if int(uv[0]) in parts]
        return (min(vals), max(vals)) if vals else (0, 0)

    crown = ys({1})[1]
    chin = ys({1})[0]
    shoulder_y = max(p[1] for p, uv in zip(mesh.pos, mesh.uv1) if int(uv[0]) == 6)
    coat_x = xs({6})
    head_x = xs({1})
    hem = ys({6})[0]
    short_hem = ys({12})[0]
    sole = min(p[1] for p in mesh.pos if int(mesh.uv1[mesh.pos.index(p)][0]) in (2, 3)) if False else 0.0
    soles = [p[1] for p, uv in zip(mesh.pos, mesh.uv1) if int(uv[0]) in (2, 3)]
    sole = min(soles) if soles else 0.0
    hip = 0.96
    return {
        'stature_m': round(crown, 3),
        'head_m': round(crown - chin, 3),
        'head_over_stature': round((crown - chin) / crown, 3) if crown else None,
        'one_over_ratio': round(crown / (crown - chin), 2) if crown > chin else None,
        'shoulder_breadth_m': round(coat_x[1] - coat_x[0], 3),
        'head_breadth_m': round(head_x[1] - head_x[0], 3),
        'shoulder_y_m': round(shoulder_y, 3),
        'hem_long_m': round(hem, 3),
        'hem_short_m': round(short_hem, 3),
        'sole_m': round(sole, 3),
        'hip_pivot_m': hip,
        'knee_pivot_m': 0.45,
    }


def score_dancer(lod='high'):
    svg = SVG_DANCER.read_text()
    groups, xf = _groups(svg)
    size = (430, 730)
    mesh = build_dancer(lod)
    gid = 'outer' if lod == 'low' else 'bind'

    def front(p, origin):
        return (origin[0] + 75.0 + p[0] * 10.0, origin[1] + 666.0 - p[1] * 10.0)

    def side(p, origin):
        return (origin[0] + 18.0 + p[2] * 10.0, origin[1] + 666.0 - p[1] * 10.0)

    parts = set(range(0, 8))
    ious = {}
    masks = {}
    ref = _raster(groups[gid], xf[gid], size, scale=1)
    got = _mesh_mask(mesh, lambda p, o=xf[gid]: front(p, o), parts, None, size, scale=1)
    # _mesh_mask multiplies by SCALE globally. Call a local path instead.
    ious['front'] = _iou(ref, _project(mesh, lambda p, o=xf[gid]: front(p, o), size, 1))
    masks['front'] = (ref, _project(mesh, lambda p, o=xf[gid]: front(p, o), size, 1))
    ref_s = _raster(groups['side'], xf['side'], size, scale=1)
    got_s = _project(mesh, lambda p, o=xf['side']: side(p, o), size, 1)
    ious['side'] = _iou(ref_s, got_s)
    masks['side'] = (ref_s, got_s)
    return {'lod': lod, 'triangles': mesh.triangles, 'iou': ious, 'masks': masks}


def _project(mesh, project, size, scale):
    img = Image.new('1', (size[0] * scale, size[1] * scale), 0)
    draw = ImageDraw.Draw(img)
    idx, pos = mesh.idx, mesh.pos
    for i in range(0, len(idx), 3):
        tri = [project(pos[idx[i + k]]) for k in range(3)]
        tri = [(x * scale, y * scale) for x, y in tri]
        draw.polygon(tri, fill=1)
    return img


def save_overlap(masks, path):
    """White reference, green mesh, red where they disagree. One row per view."""
    names = list(masks)
    w, h = masks[names[0]][0].size
    sheet = Image.new('RGB', (w, h * len(names)), (16, 14, 12))
    for i, name in enumerate(names):
        ref, got = masks[name]
        row = Image.new('RGB', (w, h), (16, 14, 12))
        px = row.load()
        rb, gb = ref.tobytes(), got.tobytes()
        # Expand bits.
        scale_bits = []
        for byte_r, byte_g in zip(rb, gb):
            for bit in range(7, -1, -1):
                scale_bits.append(((byte_r >> bit) & 1, (byte_g >> bit) & 1))
        for n, (r, g) in enumerate(scale_bits[: w * h]):
            x, y = n % w, n // w
            if r and g:
                px[x, y] = (226, 214, 196)
            elif r:
                px[x, y] = (180, 60, 50)
            elif g:
                px[x, y] = (70, 150, 90)
        sheet.paste(row, (0, i * h))
    path.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(path)
