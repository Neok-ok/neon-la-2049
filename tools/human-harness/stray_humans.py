# Protrusion, loose-part, and thin-spike check for the human meshes.
# The spinner stray gate compares a car to K's trace. These bodies use the
# pedestrian and dancer plates instead. Run:
#   python3 tools/human-harness/stray_humans.py
import json
import sys
from collections import defaultdict
from pathlib import Path

from PIL import Image, ImageFilter

sys.path.insert(0, str(Path(__file__).resolve().parent))
from lib.crowd import build_crowd
from lib.dancer import build_dancer
from lib.score import (
    LONG, RAIN, SHORT, _front, _groups, _iou, _mesh_mask, _project, _raster, _side,
    SVG_CROWD, SVG_DANCER,
)

OUT = Path(__file__).resolve().parent / 'sheets' / 'stray-humans.json'

# 3 cm on a person. On the 60 m dancer, 1% of height, so a skirt step is not a fin.
CROWD_LIMIT_M = 0.03
DANCER_LIMIT_M = 0.64


def _components(mesh, weld):
    parent = list(range(len(mesh.pos)))

    def find(a):
        while parent[a] != a:
            parent[a] = parent[parent[a]]
            a = parent[a]
        return a

    def union(a, b):
        ra, rb = find(a), find(b)
        if ra != rb:
            parent[rb] = ra

    buckets = defaultdict(list)
    for i, p in enumerate(mesh.pos):
        buckets[(round(p[0] / weld), round(p[1] / weld), round(p[2] / weld))].append(i)
    for ids in buckets.values():
        for j in ids[1:]:
            union(ids[0], j)
    for i in range(0, len(mesh.idx), 3):
        a, b, c = mesh.idx[i], mesh.idx[i + 1], mesh.idx[i + 2]
        union(a, b)
        union(b, c)
    groups = defaultdict(list)
    for i in range(len(mesh.pos)):
        groups[find(i)].append(i)
    return list(groups.values())


def _bounds(pts):
    xs = [p[0] for p in pts]
    ys = [p[1] for p in pts]
    zs = [p[2] for p in pts]
    return (min(xs), min(ys), min(zs), max(xs), max(ys), max(zs))


def _aabb_gap(a, b):
    gap = 0.0
    for i in range(3):
        gap += max(0.0, a[i] - b[i + 3], b[i] - a[i + 3]) ** 2
    return gap ** 0.5


def _thin(mesh, min_edge, max_area):
    """A long edge with almost no area is a spike, not a limb."""
    hits = 0
    worst = 0.0
    for i in range(0, len(mesh.idx), 3):
        a, b, c = (mesh.pos[mesh.idx[i + k]] for k in range(3))
        def dist(p, q):
            return ((p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2 + (p[2] - q[2]) ** 2) ** 0.5
        ab, bc, ca = dist(a, b), dist(b, c), dist(c, a)
        edge = max(ab, bc, ca)
        # Heron
        s = (ab + bc + ca) * 0.5
        area2 = max(0.0, s * (s - ab) * (s - bc) * (s - ca))
        area = area2 ** 0.5
        if edge >= min_edge and area <= max_area:
            hits += 1
            worst = max(worst, edge)
    return hits, round(worst, 3)


def _outside(mesh_img, plate_img, limit_px):
    dilated = plate_img.convert('L').filter(ImageFilter.MaxFilter(limit_px * 2 + 1)).convert('1')
    mb, db = mesh_img.tobytes(), dilated.tobytes()
    outside = 0
    mesh_px = 0
    for m, d in zip(mb, db):
        outside += (m & ~d).bit_count()
        mesh_px += m.bit_count()
    return outside, mesh_px


def crowd_report(lod):
    mesh = build_crowd(lod)
    svg = SVG_CROWD.read_text()
    groups, xf = _groups(svg)
    size = (700, 280)
    # 1 m = 100 plate px, raster scale 2 → 200 px/m. 3 cm ≈ 6 px, filter needs an odd size.
    limit_px = 7
    views = {}
    for name, gid, parts, project in (
        ('stand', 'stand', LONG, lambda p, o=xf['stand']: _front(p[0], p[1], o)),
        ('short', 'short', SHORT, lambda p, o=xf['short']: _front(p[0], p[1], o)),
        ('side', 'side', LONG, lambda p, o=xf['side']: _side(p[2], p[1], o)),
    ):
        ref = _raster(groups[gid], xf[gid], size)
        got = _mesh_mask(mesh, project, parts, None, size)
        outside, mesh_px = _outside(got, ref, limit_px)
        views[name] = {
            'iou': round(_iou(ref, got), 4),
            'outsidePx': outside,
            'meshPx': mesh_px,
            'protrusion': outside > 40,
        }
    comps = _components(mesh, 0.01)
    comps.sort(key=len, reverse=True)
    # Nearest gap to any larger component. Body parts meet within a few centimetres.
    boxes = [_bounds([mesh.pos[j] for j in comp]) for comp in comps]
    # Join pieces whose boxes meet. A leg does not have to be the largest
    # piece to count as attached to the coat.
    parent = list(range(len(comps)))

    def find(a):
        while parent[a] != a:
            parent[a] = parent[parent[a]]
            a = parent[a]
        return a

    def union(a, b):
        ra, rb = find(a), find(b)
        if ra != rb:
            parent[rb] = ra

    for i in range(len(comps)):
        for j in range(i):
            if _aabb_gap(boxes[i], boxes[j]) <= 0.12:
                union(i, j)
    clusters = defaultdict(list)
    for i in range(len(comps)):
        clusters[find(i)].append(i)
    body = max(clusters.values(), key=len)
    loose = []
    for i, comp in enumerate(comps):
        if i in body or len(comp) < 8:
            continue
        parts = sorted({int(mesh.uv1[j][0]) for j in comp})
        gap = min(_aabb_gap(boxes[i], boxes[j]) for j in body)
        # Umbrella, hood, hat, bag, and the respirator are separate lofts on the body.
        if gap > 0.12 and not set(parts) <= {7, 8, 9, 10, 11, 15, 16}:
            loose.append({'parts': parts, 'verts': len(comp), 'gapM': round(gap, 3)})
    thin_n, thin_edge = _thin(mesh, 0.25, 0.0004)
    return {
        'lod': lod,
        'triangles': mesh.triangles,
        'limitM': CROWD_LIMIT_M,
        'views': views,
        'components': len(comps),
        'loose': loose,
        'thinTriangles': thin_n,
        'thinEdgeM': thin_edge,
        'pass': not any(v['protrusion'] for v in views.values()) and not loose and thin_n == 0,
    }


def dancer_report(lod):
    mesh = build_dancer(lod)
    if lod == 'low':
        return {'lod': lod, 'triangles': mesh.triangles, 'pass': True, 'note': 'low is the filled mask glyph'}
    svg = SVG_DANCER.read_text()
    groups, xf = _groups(svg)
    size = (430, 730)
    # 1 m = 10 px at scale 1. 0.64 m ≈ 7 px.
    limit_px = 7

    def front(p, origin):
        return (origin[0] + 75.0 + p[0] * 10.0, origin[1] + 666.0 - p[1] * 10.0)

    def side(p, origin):
        return (origin[0] + 18.0 + p[2] * 10.0, origin[1] + 666.0 - p[1] * 10.0)

    gid = 'bind'
    views = {}
    for name, project in (
        ('front', lambda p, o=xf[gid]: front(p, o)),
        ('side', lambda p, o=xf['side']: side(p, o)),
    ):
        ref_gid = gid if name == 'front' else 'side'
        ref = _raster(groups[ref_gid], xf[ref_gid], size, scale=1)
        got = _project(mesh, project, size, 1)
        outside, mesh_px = _outside(got, ref, limit_px)
        views[name] = {
            'iou': round(_iou(ref, got), 4),
            'outsidePx': outside,
            'meshPx': mesh_px,
            'protrusion': outside > 80,
        }
    comps = _components(mesh, 0.08)
    # Skirt steps, the diamond, and the raised hand are separate on purpose.
    # A component is loose only when it sits off the figure, not in a skirt gap.
    # 6, 7, 8 are the three skirt widths. 9 is the dark stem inside the plate point.
    authored = {1, 2, 3, 4, 5, 6, 7, 8, 9}
    loose = []
    comps.sort(key=len, reverse=True)
    boxes = [_bounds([mesh.pos[j] for j in comp]) for comp in comps]
    for i, comp in enumerate(comps):
        parts = sorted({int(mesh.uv1[j][0]) for j in comp})
        if set(parts) <= authored:
            continue
        gap = 0.0 if i == 0 else min(_aabb_gap(boxes[i], boxes[j]) for j in range(i))
        if gap > 2.5:
            loose.append({'parts': parts, 'verts': len(comp), 'gapM': round(gap, 3)})
    thin_n, thin_edge = _thin(mesh, 6.0, 0.15)
    return {
        'lod': lod,
        'triangles': mesh.triangles,
        'limitM': DANCER_LIMIT_M,
        'views': views,
        'components': len(comps),
        'authoredSeparations': 'diamond head, raised hand, three skirt steps, veil',
        'loose': loose,
        'thinTriangles': thin_n,
        'thinEdgeM': thin_edge,
        'pass': not any(v['protrusion'] for v in views.values()) and not loose and thin_n == 0,
    }


def main():
    report = {
        'crowd': {lod: crowd_report(lod) for lod in ('medium', 'high')},
        'dancer': {lod: dancer_report(lod) for lod in ('medium', 'high')},
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(report, indent=2))
    ok = all(v['pass'] for kind in report.values() for v in kind.values())
    print(json.dumps({k: {lod: {'pass': v['pass'], 'loose': len(v.get('loose', [])), 'thin': v.get('thinTriangles'), 'views': {n: {'out': d['outsidePx'], 'iou': d['iou']} for n, d in v.get('views', {}).items()}} for lod, v in d.items()} for k, d in report.items()}, indent=2))
    print('STRAY', 'pass' if ok else 'fail')
    return 0 if ok else 1


if __name__ == '__main__':
    raise SystemExit(main())
