# One parametric pedestrian. Every outfit is this body with parts shown or hidden.
# Front outline is the overlap plate. Depth is the side plate. Bones match lib.gait.
from .gait import BONE_INDEX as BI
from .geom import Mesh, ball, box, disc, loft, wafer, x_span
from .plates import CANOPY, RAIN_ARM, SHAFT, SHORT, SIDE, STAND

SKIN = (0.02, 0.52, 0.48, 0.98)
WOOL = (0.52, 0.52, 0.98, 0.98)
VINYL = (0.02, 0.02, 0.48, 0.48)
LEATHER = (0.52, 0.02, 0.78, 0.48)

# Vertex colour is a multiply (weave, soot, the darker shoe). Not a portrait.
CLOTH = (0.92, 0.90, 0.88, 1.0)
CLOTH_DARK = (0.62, 0.60, 0.58, 1.0)
SKIN_C = (0.96, 0.90, 0.86, 1.0)
SHOE = (0.38, 0.36, 0.34, 1.0)
SHAFT_C = (1.0, 0.86, 0.62, 1.0)


def _z_of(poly, y, fallback):
    span = x_span(poly, y)
    if span is None:
        span = x_span(poly, y + 1e-3) or x_span(poly, y - 1e-3)
    return span if span is not None else fallback


def _coat_z(y):
    return _z_of(SIDE['coat'], y, (-0.14, 0.14))


def _head_z(y):
    return _z_of(SIDE['head'], y, (-0.10, 0.08))


def _neck_z(y):
    return _z_of(SIDE['neck'], y, (-0.06, 0.05))


def _leg_z(y):
    return _z_of(SIDE['leg'], y, (-0.07, 0.05))


def _foot_z(y):
    return _z_of(SIDE['foot'], y, (-0.08, 0.12))


def _arm_z(y):
    bump = x_span(SIDE['arm'], y)
    if bump is not None:
        return bump
    coat = _coat_z(y)
    mid = (coat[0] + coat[1]) * 0.5
    return (mid - 0.04, mid + 0.045)


def _canopy_z(y):
    span = x_span(CANOPY, y)
    width = (span[1] - span[0]) if span else 0.2
    # A real roof, not a fin. Depth matches the width so the side view has height and body.
    half = max(0.02, width * 0.5)
    return (0.08 - half, 0.08 + half)


def _shaft_z(_y):
    return (0.06, 0.10)


def _one_leg_wafer(mesh, poly, y, segs, part, side, which):
    span = x_span(poly, y) or x_span(poly, y + 1e-4) or x_span(poly, y - 1e-4)
    if span is None:
        return
    z0, z1 = _leg_z(y)
    cx = (span[0] + span[1]) * 0.5
    rx = max(1e-4, (span[1] - span[0]) * 0.5)
    cz = (z0 + z1) * 0.5
    rz = max(1e-4, (z1 - z0) * 0.5)
    wafer(mesh, cx, y, cz, rx, rz, segs, part, BI[f'{which}{side}'], CLOTH_DARK, WOOL)


def _knee_ball(mesh, poly, part, side):
    """Knee volume inside the leg plate. The shader blends it across both bones."""
    y = 0.45
    span = x_span(poly, y) or x_span(poly, y + 1e-4)
    if span is None:
        return
    z0, z1 = _leg_z(y)
    cx = (span[0] + span[1]) * 0.5
    rx = max(1e-4, (span[1] - span[0]) * 0.5)
    cz = (z0 + z1) * 0.5
    rz = max(1e-4, (z1 - z0) * 0.5)
    ball(mesh, cx, y, cz, min(rx, rz), part, BI[f'thigh{side}'], CLOTH_DARK, WOOL)


def _leg_wafers(mesh, poly, segs, part, side):
    """Disks every 5 cm for the end-on stride, plus one knee volume."""
    ring = 8 if segs < 8 else segs
    for i in range(13):
        y = round(0.10 + i * 0.05, 5)
        _one_leg_wafer(mesh, poly, y, ring, part, side, 'shin' if y < 0.45 else 'thigh')
    _one_leg_wafer(mesh, poly, 0.45, ring, part, side, 'shin')
    _knee_ball(mesh, poly, part, side)


def _bind_coat_hem(mesh):
    """Long-coat hem rides the thigh on that side.

    The harness skins one bone. The game shader fades this hem from the coat
    bone onto that thigh, so the single-bone bind is the fully weighted end
    of the same blend.
    """
    for i, (part, _bone) in enumerate(mesh.uv1):
        if part == 6 and mesh.pos[i][1] <= 0.82:
            side = 'thighL' if mesh.pos[i][0] <= 0 else 'thighR'
            mesh.uv1[i] = (part, BI[side])


def build_crowd(lod='high'):
    # Medium keeps the four silhouette extrema and two extra stations so a
    # head is a volume, not a square tube, when the camera is on the sidewalk.
    segs = {'low': 4, 'medium': 6, 'high': 8}[lod]
    mesh = Mesh()
    _body(mesh, segs, lod)
    _clothes(mesh, segs, lod)
    _rain(mesh, segs, lod)
    _bind_coat_hem(mesh)
    return mesh.finish()


def _body(mesh, segs, lod):
    loft(mesh, STAND['head'], _head_z, segs, 1, lambda _y: BI['head'], SKIN_C, SKIN)
    loft(mesh, STAND['neck'], _neck_z, max(4, segs - 2), 0, lambda _y: BI['head'], SKIN_C, SKIN)
    # Respirator: a blank plastic band on the chin. It stays inside the head's
    # width and only a few millimetres proud of the side plate, so the outline holds.
    # No mouth, no lenses, no logo. Hoods hide it.
    box(mesh, 0.0, 1.62, 0.062, 0.09, 0.055, 0.030, 16, BI['head'], (0.16, 0.18, 0.19, 1.0), VINYL)

    def arm(side, poly, part, extra):
        def bone(y):
            if y < 0.94:
                return BI[f'hand{side}']
            if y < 1.18:
                return BI[f'armF{side}']
            return BI[f'armU{side}']

        def apart(y):
            return 0 if y < 0.90 else part

        def color(y):
            return SKIN_C if y < 0.90 else CLOTH

        loft(mesh, poly, _arm_z, segs, apart, bone, color, SKIN, y_extra=extra)

    arm_extra = (0.90, 1.16) if lod == 'low' else (0.88, 0.92, 0.94, 1.14, 1.18)
    arm('L', STAND['armL'], 4, arm_extra)
    arm('R', STAND['armR'], 5, arm_extra)

    def leg(side, poly):
        part = 2 if side == 'L' else 3

        def bone(y):
            if y < 0.09:
                return BI[f'foot{side}']
            if y < 0.45:
                return BI[f'shin{side}']
            return BI[f'thigh{side}']

        # Short rings so a frame blend cannot twist one long quad open.
        extra = tuple(round(0.08 + i * 0.06, 5) for i in range(11))
        loft(mesh, poly, _leg_z, segs, part, bone, CLOTH_DARK, WOOL, y_extra=extra)
        loft(mesh, STAND[f'foot{side}'], _foot_z, segs, part, lambda _y: BI[f'foot{side}'], SHOE, LEATHER)
        # Facing disks along the limb. Walls vanish when the thigh points at
        # the camera; the disks stay inside the plate and keep hem, knee, and
        # shin one surface. The knee station is skinned to both bones.
        _leg_wafers(mesh, poly, segs, part, side)

    leg('L', STAND['legL'])
    leg('R', STAND['legR'])


def _clothes(mesh, segs, lod):
    def coat_color(y):
        # Hem and the centre-front lapel read darker. The outline does not move.
        if y < 0.82:
            return CLOTH_DARK
        return CLOTH

    # Stations through the hem so the coat/thigh blend has cloth to bend,
    # instead of one quad sheared between the chest and the knee.
    coat_ys = (0.78, 0.86, 0.94, 1.02, 1.10, 1.20, 1.32)
    loft(mesh, STAND['coat'], _coat_z, segs, 6, lambda _y: BI['coat'], coat_color, WOOL, y_extra=coat_ys)
    loft(mesh, SHORT['coat'], _coat_z, segs, 12, lambda _y: BI['coat'], CLOTH, WOOL)

    # Hood, 0.30 m across, over the blank head. No face inside it.
    hood = ((-0.15, 1.52), (0.15, 1.52), (0.15, 1.84), (-0.15, 1.84))
    loft(mesh, hood, lambda _y: (-0.14, 0.12), max(4, segs - 2), 9, lambda _y: BI['hood'], CLOTH_DARK, WOOL)

    # Hat. Brim 0.34 m, crown to 1.92 m. Sits on the head bone so a gaze lifts it.
    if lod == 'low':
        box(mesh, 0.0, 1.79, 0.0, 0.34, 0.03, 0.34, 10, BI['hood'], CLOTH, WOOL)
    else:
        disc(mesh, 0.0, 1.78, 0.0, 0.17, segs * 2, 10, BI['hood'], CLOTH, WOOL, y_lift=0.02)
    crown = ((-0.08, 1.80), (0.08, 1.80), (0.08, 1.92), (-0.08, 1.92))
    loft(mesh, crown, lambda _y: (-0.08, 0.08), 4 if lod == 'low' else max(4, segs - 2), 10, lambda _y: BI['hood'], CLOTH_DARK, WOOL)

    # Bag on the left hip. 0.16 × 0.30 × 0.13 m.
    box(mesh, -0.32, 0.98, 0.06, 0.16, 0.30, 0.13, 11, BI['bag'], CLOTH_DARK, LEATHER)

    if lod == 'high':
        # Lapel break, inset so the front plate's outline stays the coat trapezoid.
        lapel = ((-0.045, 0.86), (0.045, 0.86), (0.03, 1.42), (-0.03, 1.42))
        loft(mesh, lapel, lambda _y: (0.10, 0.145), 4, 6, lambda _y: BI['coat'], (0.45, 0.43, 0.42, 1), WOOL)
        # Hem thickness, tucked inside the hem span.
        hem = ((-0.15, 0.74), (0.15, 0.74), (0.15, 0.78), (-0.15, 0.78))
        loft(mesh, hem, lambda _y: (-0.10, 0.10), 4, 6, lambda _y: BI['coat'], CLOTH_DARK, WOOL)


def _canopy_poly(lod):
    if lod != 'low':
        return CANOPY
    # Three heights of the same arch, so the roof keeps its width and its apex.
    rim = x_span(CANOPY, 1.98)
    mid = x_span(CANOPY, 2.06)
    apex = x_span(CANOPY, 2.145) or (0.28, 0.32)
    return (
        (rim[0], 1.98), (rim[1], 1.98), (mid[1], 2.06),
        (apex[1], 2.145), (apex[0], 2.145), (mid[0], 2.06),
    )


def _rain(mesh, segs, lod):
    canopy_segs = 4 if lod != 'high' else segs
    loft(mesh, _canopy_poly(lod), _canopy_z, canopy_segs, 7, lambda _y: BI['umbrella'], CLOTH, VINYL)
    loft(mesh, SHAFT, _shaft_z, 4, 8, lambda _y: BI['umbrella'], SHAFT_C, VINYL)
    # Bent right arm, the rain plate. Shown only while the umbrella is up; the
    # straight arm (part 5) is the one the walk swings in dry weather.
    loft(mesh, RAIN_ARM, lambda _y: (0.02, 0.14), max(4, segs - 2), 15, lambda _y: BI['coat'], CLOTH, WOOL)
    if lod == 'high':
        # Ribs inside the arch. They do not push the outline past the plate.
        for i, x in enumerate((-0.28, -0.08, 0.14, 0.36)):
            rib = ((x - 0.012, 1.985), (x + 0.012, 1.985), (x * 0.55 + 0.01, 2.12), (x * 0.55 - 0.01, 2.12))
            loft(mesh, rib, lambda _y: (0.02, 0.14), 3, 7, lambda _y: BI['umbrella'], CLOTH_DARK, VINYL)
