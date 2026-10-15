# Lofts a plate polygon into an elliptical tube. The left and right extrema stay on
# the polygon, so the front silhouette matches the plate. Depth is the side plate.
import math

from .math3d import add, cross, length, mul, norm, sub


class Mesh:
    def __init__(self):
        self.pos = []
        self.nrm = []
        self.uv = []
        self.uv1 = []
        self.col = []
        self.idx = []

    def add(self, p, uv, part, bone, color):
        self.pos.append((float(p[0]), float(p[1]), float(p[2])))
        self.nrm.append((0.0, 1.0, 0.0))
        self.uv.append(uv)
        # uv1.x = part, uv1.y = bone index. Kept as raw ids; the shader divides.
        self.uv1.append((float(part), float(bone)))
        self.col.append(color)
        return len(self.pos) - 1

    def tri(self, a, b, c):
        self.idx.extend((a, b, c))

    def quad(self, a, b, c, d):
        self.tri(a, b, c)
        self.tri(a, c, d)

    def finish(self):
        acc = [[0.0, 0.0, 0.0] for _ in self.pos]
        for i in range(0, len(self.idx), 3):
            a, b, c = self.idx[i], self.idx[i + 1], self.idx[i + 2]
            n = cross(sub(self.pos[b], self.pos[a]), sub(self.pos[c], self.pos[a]))
            for k in (a, b, c):
                acc[k][0] += n[0]
                acc[k][1] += n[1]
                acc[k][2] += n[2]
        for i, n in enumerate(acc):
            L = length(n)
            self.nrm[i] = (n[0] / L, n[1] / L, n[2] / L) if L > 1e-8 else (0.0, 1.0, 0.0)
        return self

    @property
    def triangles(self):
        return len(self.idx) // 3


def x_span(polygon, y):
    xs = []
    n = len(polygon)
    for i in range(n):
        x0, y0 = polygon[i]
        x1, y1 = polygon[(i + 1) % n]
        if abs(y1 - y0) < 1e-8:
            if abs(y - y0) < 1e-5:
                xs.extend((x0, x1))
            continue
        lo, hi = (y0, y1) if y0 <= y1 else (y1, y0)
        if y < lo - 1e-8 or y > hi + 1e-8:
            continue
        t = (y - y0) / (y1 - y0)
        if -1e-6 <= t <= 1 + 1e-6:
            xs.append(x0 + (x1 - x0) * t)
    if len(xs) < 2:
        return None
    return min(xs), max(xs)


def _region_uv(region, u, v):
    x0, y0, x1, y1 = region
    return (x0 + (x1 - x0) * u, y0 + (y1 - y0) * v)


def _angles(segs):
    """Always include the four silhouette extrema, then fill toward `segs`."""
    base = [0.0, math.pi * 0.5, math.pi, math.pi * 1.5]
    if segs <= 4:
        return base
    extra = []
    for i in range(segs):
        a = i / segs * math.tau
        if all(abs((a - b + math.pi) % math.tau - math.pi) > 0.2 for b in base):
            extra.append(a)
    return sorted(base + extra)


def _call(v, y):
    return v(y) if callable(v) else v


def loft(mesh, polygon, z_at, segs, part, bone_at, color, region, y_extra=(), both_sides=False):
    """Extrude `polygon` (x, y) along Z. `z_at(y) -> (z0, z1)`, `bone_at(y) -> int`.
    `part` and `color` may be constants or callables of y."""
    ys = sorted(set([round(p[1], 5) for p in polygon] + [round(y, 5) for y in y_extra]))
    rings = []
    meta = []
    for y in ys:
        span = x_span(polygon, y + 0.0)
        if span is None:
            # Nudge off an exact vertex if the span collapsed to a point sample.
            span = x_span(polygon, y + 1e-4) or x_span(polygon, y - 1e-4)
        if span is None:
            continue
        z0, z1 = z_at(y)
        bone = bone_at(y)
        part_y = _call(part, y)
        color_y = _call(color, y)
        cx = (span[0] + span[1]) * 0.5
        rx = max(1e-4, (span[1] - span[0]) * 0.5)
        cz = (z0 + z1) * 0.5
        rz = max(1e-4, (z1 - z0) * 0.5)
        angs = _angles(segs)
        ring = []
        for i, a in enumerate(angs):
            p = (cx + rx * math.cos(a), y, cz + rz * math.sin(a))
            uv = _region_uv(region, i / len(angs), (y - ys[0]) / max(1e-4, ys[-1] - ys[0]))
            ring.append(mesh.add(p, uv, part_y, bone, color_y))
        rings.append(ring)
        meta.append((cx, y, cz, bone, part_y, color_y))
    if len(rings) < 2:
        return
    nseg = len(rings[0])
    for r in range(len(rings) - 1):
        a, b = rings[r], rings[r + 1]
        for i in range(nseg):
            j = (i + 1) % nseg
            mesh.quad(a[i], a[j], b[j], b[i])
            if both_sides:
                mesh.quad(a[i], b[i], b[j], a[j])
    # Caps. Fan from a centre so the top and bottom read as closed cloth / skin.
    for ring, (cx, y, cz, bone, part_y, color_y), sign in (
        (rings[0], meta[0], True), (rings[-1], meta[-1], False),
    ):
        c = mesh.add((cx, y, cz), _region_uv(region, 0.5, 0.0 if sign else 1.0), part_y, bone, color_y)
        for i in range(nseg):
            j = (i + 1) % nseg
            if sign:
                mesh.tri(c, ring[j], ring[i])
                if both_sides:
                    mesh.tri(c, ring[i], ring[j])
            else:
                mesh.tri(c, ring[i], ring[j])
                if both_sides:
                    mesh.tri(c, ring[j], ring[i])


def box(mesh, cx, cy, cz, w, h, d, part, bone, color, region):
    x, y, z = w * 0.5, h * 0.5, d * 0.5
    pts = [
        (cx - x, cy - y, cz + z), (cx + x, cy - y, cz + z), (cx + x, cy + y, cz + z), (cx - x, cy + y, cz + z),
        (cx + x, cy - y, cz - z), (cx - x, cy - y, cz - z), (cx - x, cy + y, cz - z), (cx + x, cy + y, cz - z),
    ]
    uv = _region_uv(region, 0.5, 0.5)
    v = [mesh.add(p, uv, part, bone, color) for p in pts]
    faces = (
        (0, 1, 2, 3), (4, 5, 6, 7), (1, 4, 7, 2), (5, 0, 3, 6), (3, 2, 7, 6), (5, 4, 1, 0),
    )
    for a, b, c, d_ in faces:
        mesh.quad(v[a], v[b], v[c], v[d_])


def ellipsoid(mesh, cx, cy, cz, rx, ry, rz, stacks, slices, part, bone, color, region):
    """One blank volume. A loft's stations read as rings; this is a single cranium."""
    uv = _region_uv(region, 0.5, 0.5)
    top = mesh.add((cx, cy + ry, cz), uv, part, bone, color)
    bot = mesh.add((cx, cy - ry, cz), uv, part, bone, color)
    rings = []
    for i in range(1, stacks):
        theta = i / stacks * math.pi
        sr = math.sin(theta)
        y = cy + ry * math.cos(theta)
        ring = []
        for j in range(slices):
            phi = j / slices * math.tau
            ring.append(mesh.add(
                (cx + rx * sr * math.cos(phi), y, cz + rz * sr * math.sin(phi)),
                uv, part, bone, color,
            ))
        rings.append(ring)
    r0 = rings[0]
    for j in range(slices):
        mesh.tri(top, r0[j], r0[(j + 1) % slices])
    for i in range(len(rings) - 1):
        upper, lower = rings[i], rings[i + 1]
        for j in range(slices):
            j2 = (j + 1) % slices
            mesh.quad(lower[j], lower[j2], upper[j2], upper[j])
    last = rings[-1]
    for j in range(slices):
        mesh.tri(bot, last[(j + 1) % slices], last[j])


def ball(mesh, cx, cy, cz, radius, part, bone, color, region):
    """Icosahedron. A flat disk vanishes edge-on; this keeps a knee in every view."""
    t = (1.0 + math.sqrt(5.0)) / 2.0
    raw = (
        (-1, t, 0), (1, t, 0), (-1, -t, 0), (1, -t, 0),
        (0, -1, t), (0, 1, t), (0, -1, -t), (0, 1, -t),
        (t, 0, -1), (t, 0, 1), (-t, 0, -1), (-t, 0, 1),
    )
    uv = _region_uv(region, 0.5, 0.5)
    ids = []
    for x, y, z in raw:
        length = math.sqrt(x * x + y * y + z * z)
        ids.append(mesh.add(
            (cx + x / length * radius, cy + y / length * radius, cz + z / length * radius),
            uv, part, bone, color,
        ))
    faces = (
        (0, 11, 5), (0, 5, 1), (0, 1, 7), (0, 7, 10), (0, 10, 11),
        (1, 5, 9), (5, 11, 4), (11, 10, 2), (10, 7, 6), (7, 1, 8),
        (3, 9, 4), (3, 4, 2), (3, 2, 6), (3, 6, 8), (3, 8, 9),
        (4, 9, 5), (2, 4, 11), (6, 2, 10), (8, 6, 7), (9, 8, 1),
    )
    for a, b, c in faces:
        mesh.tri(ids[a], ids[b], ids[c])


def wafer(mesh, cx, y, cz, rx, rz, segs, part, bone, color, region):
    """Elliptical limb cross-section, facing ±Y.

    A tube's walls are edge-on when the bone points at the camera, so the
    coat hem and the shin read as two separate pieces. These disks sit inside
    the plate and face the lens in that pose. Front and side views see them
    edge-on, so the silhouette does not grow.
    """
    angs = _angles(segs)
    n = len(angs)
    ring = []
    for i, a in enumerate(angs):
        p = (cx + rx * math.cos(a), y, cz + rz * math.sin(a))
        uv = _region_uv(region, i / max(1, n), 0.5)
        ring.append(mesh.add(p, uv, part, bone, color))
    center = mesh.add((cx, y, cz), _region_uv(region, 0.5, 0.5), part, bone, color)
    for i in range(n):
        j = (i + 1) % n
        mesh.tri(center, ring[i], ring[j])


def disc(mesh, cx, cy, cz, radius, segs, part, bone, color, region, y_lift=0.0):
    """A flat brim in the XZ plane, plus a thin lip so it has height."""
    uv = _region_uv(region, 0.5, 0.5)
    top, bot = [], []
    for i in range(segs):
        a = i / segs * math.tau
        x = cx + math.cos(a) * radius
        z = cz + math.sin(a) * radius
        top.append(mesh.add((x, cy + y_lift, z), uv, part, bone, color))
        bot.append(mesh.add((x, cy, z), uv, part, bone, color))
    c0 = mesh.add((cx, cy + y_lift, cz), uv, part, bone, color)
    c1 = mesh.add((cx, cy, cz), uv, part, bone, color)
    for i in range(segs):
        j = (i + 1) % segs
        mesh.tri(c0, top[i], top[j])
        mesh.tri(c1, bot[j], bot[i])
        mesh.quad(bot[i], bot[j], top[j], top[i])
