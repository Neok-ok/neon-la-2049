# Veil House canyon figure. Geometric, no face. Proportions are the Broadway plate:
# crown 59.5 m above the hem, raised hand at 64.4 m, middle skirt 13.2 m, depth ≤ 1.8 m.
import math

from .geom import Mesh, loft, x_span
from .plates import DANCER_BIND, DANCER_OUTER, DANCER_SIDE

# Pink core and a hotter edge. The game tints with sign pink; these are the mask values.
PINK = (1.0, 0.72, 0.82, 1.0)
CORE = (0.95, 0.97, 1.0, 1.0)

BONES = ['root', 'hip', 'waist', 'chest', 'head', 'armUp', 'armOut', 'skirtL', 'skirtM', 'skirtU', 'veil']
BI = {n: i for i, n in enumerate(BONES)}
FRAMES = 32
# Bind pivots. The sway is a pure +X offset, so any pivot works as long as the
# animated pivot is this plus that offset. Y is the part's height so the rig reads.
REST = {
    'root': (0.0, 0.0, 0.0),
    'hip': (0.0, 34.0, 0.0),
    'waist': (0.0, 40.0, 0.0),
    'chest': (0.0, 48.0, 0.0),
    'head': (0.0, 56.0, 0.0),
    'armUp': (2.0, 50.0, 0.0),
    'armOut': (-2.0, 34.0, 0.0),
    'skirtL': (0.0, 6.0, 0.0),
    'skirtM': (0.0, 16.0, 0.0),
    'skirtU': (0.0, 28.0, 0.0),
    'veil': (1.4, 26.0, -0.4),
}
PARENT = {n: ('root' if n != 'root' else None) for n in BONES}


def _body_z(y):
    span = x_span(DANCER_SIDE, y) or x_span(DANCER_SIDE, y + 0.05) or x_span(DANCER_SIDE, y - 0.05)
    if span is None:
        return (-0.6, 0.6)
    return span


def _inside(y, thick, bias=0.0):
    z0, z1 = _body_z(y)
    mid = (z0 + z1) * 0.5 + bias
    half = min(thick * 0.5, max(0.05, (z1 - z0) * 0.5 - 0.02))
    return (mid - half, mid + half)


def _bone_body(y):
    if y < 12:
        return BI['skirtL']
    if y < 24:
        return BI['skirtM']
    if y < 32:
        return BI['skirtU']
    if y < 37:
        return BI['hip']
    if y < 44:
        return BI['waist']
    if y < 52:
        return BI['chest']
    return BI['head']


def _samples(poly, step):
    ys = [p[1] for p in poly]
    lo, hi = min(ys), max(ys)
    extra = []
    y = lo
    while y < hi:
        extra.append(round(y, 4))
        y += step
    extra.append(round(hi, 4))
    return extra


def build_dancer(lod='high'):
    mesh = Mesh()
    if lod == 'low':
        loft(
            mesh, DANCER_OUTER, _body_z, 4, 0, lambda _y: BI['root'], PINK, (0.0, 0.0, 1.0, 1.0),
            y_extra=_samples(DANCER_OUTER, 2.4),
        )
        return mesh.finish()
    step = 1.15 if lod == 'medium' else 0.55
    segs = 8 if lod == 'medium' else 12
    loft(
        mesh, DANCER_BIND['body'], _body_z, segs, 1, _bone_body, PINK, (0.0, 0.0, 1.0, 1.0),
        y_extra=_samples(DANCER_BIND['body'], step),
    )
    loft(
        mesh, DANCER_BIND['armUp'], lambda y: _inside(y, 0.7, 0.05), max(4, segs // 2), 2,
        lambda _y: BI['armUp'], CORE, (0.0, 0.0, 1.0, 1.0),
        y_extra=_samples(DANCER_BIND['armUp'], step),
    )
    loft(
        mesh, DANCER_BIND['armOut'], lambda y: _inside(y, 0.55, 0.0), 4, 3,
        lambda _y: BI['armOut'], PINK, (0.0, 0.0, 1.0, 1.0),
        y_extra=_samples(DANCER_BIND['armOut'], step * 1.4),
    )
    # Veil sits toward the back of the blade and stays inside the side plate.
    loft(
        mesh, DANCER_BIND['veil'], lambda y: _inside(y, 0.4, -0.15), 4, 4,
        lambda _y: BI['veil'], CORE, (0.0, 0.0, 1.0, 1.0),
        y_extra=_samples(DANCER_BIND['veil'], step),
    )
    if lod == 'high':
        # Facet edge on the diamond: an inset ribbon, brighter, inside the head span.
        facet = ((-1.2, 53.2), (1.2, 53.2), (0.35, 58.6), (-0.35, 58.6))
        loft(mesh, facet, lambda y: _inside(y, 0.35, 0.05), 4, 1, lambda _y: BI['head'], CORE, (0.0, 0.0, 1.0, 1.0))
    return mesh.finish()


def sway_offsets(time):
    """Lateral metres on the 60 m figure. One bend, skirts a fifth of a radian behind.
    Neighboring bones stay within about 0.7 m so the loft does not split into
    shards at the neck or the veil. The crown still travels about 5 m, which
    reads from the street. No steps.
    """
    lead = math.sin(time * 1.2)
    skirt = math.sin(time * 1.2 - 0.22)
    return {
        'root': lead * 0.5,
        'hip': lead * 3.2,
        'waist': lead * 3.9,
        'chest': lead * 4.6,
        'head': lead * 5.1,
        'armUp': lead * 4.8,
        'armOut': lead * 2.4,
        'skirtL': skirt * 0.9,
        'skirtM': skirt * 1.8,
        'skirtU': skirt * 2.6,
        'veil': skirt * 2.4,
    }


def dancer_palette():
    """One sway loop. Width = bones * 6, height = FRAMES. Range [-2, 4] is too small
    for a 60 m figure, so the palette stores the lateral offset only (one float in m00's
    translation x). The shader adds it to bind X. Other matrix terms stay identity.
    """
    # Full 3x4 identity plus tx = offset, so the same decoder as the crowd works.
    lo, hi = -8.0, 8.0
    span = hi - lo
    width = len(BONES) * 6
    height = FRAMES
    raw = bytearray(width * height * 4)
    period = math.tau / 1.2

    def pack(value):
        t = max(0.0, min(1.0, (value - lo) / span))
        q = int(round(t * 65535.0))
        return q >> 8, q & 255

    ident = (1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0)
    for fi in range(FRAMES):
        offsets = sway_offsets(fi / FRAMES * period)
        for bi, name in enumerate(BONES):
            elems = list(ident)
            elems[3] = offsets[name]
            base = bi * 6
            for p in range(6):
                a, b = pack(elems[p * 2]), pack(elems[p * 2 + 1])
                o = ((fi * width) + (base + p)) * 4
                raw[o:o + 4] = bytes((a[0], a[1], b[0], b[1]))
    return bytes(raw), width, height, lo, hi
