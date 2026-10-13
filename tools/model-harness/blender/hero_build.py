"""Hero meshes for LAPD, City Hall and the Wallace pyramid.

A facade bay is a pier, a recessed opening, a spandrel and a glass pane, in
metres. A pyramid face is one welded grid on the battered steps: block, joint,
terrace and channel share vertices, so the skin is a single shell. No imported
mesh. The published door, stair, pad and tip stay where the district lights are.
"""
import bmesh

H = None


def bind(mod):
    global H
    H = mod


def _metal():
    from kit.parts import _principled
    # Dark bronze. Bright stainless mullions read as louvers.
    return _principled('metal', (0.16, 0.17, 0.18), 0.58, 0.62)


def _rec(parts, cx, cz, y, w, d, h):
    parts.append({'type': 'box', 'cx': cx, 'cz': cz, 'y': y, 'w': w, 'd': d, 'h': h})


def _body(cx, cz, y, w, d, h, tint, tile, mat):
    if w < 0.1 or d < 0.1 or h < 0.1:
        return None
    _cube_into(_slot(mat, tint, tile)['bm'], cx, cz, y, w, d, h)
    return None


def _glass(cx, cz, y, w, d, h, mat):
    if w < 0.08 or d < 0.08 or h < 0.08:
        return None
    _cube_into(_slot(mat, None, 8.0)['bm'], cx, cz, y, w, d, h)
    return None


def _span_z(face_z, outward, embed, depth):
    """Inner face sits `embed` metres inside a z=constant wall."""
    inner = face_z - outward * embed
    outer = inner + outward * depth
    return (inner + outer) * 0.5, abs(outer - inner)


def _span_x(face_x, outward, embed, depth):
    inner = face_x - outward * embed
    outer = inner + outward * depth
    return (inner + outer) * 0.5, abs(outer - inner)


def _floors(y0, y1, pitch, win_h):
    out = []
    y = y0
    guard = 0
    while y + win_h <= y1 + 0.02 and guard < 80:
        out.append(y)
        y += pitch
        guard += 1
    return out


def _overlaps(a0, a1, b0, b1):
    return a1 > b0 + 0.05 and a0 < b1 - 0.05


# Detail (fins, frames, glass) is one mesh per material. A scene object per
# window makes the high tier spend minutes in the dependency graph.
_BATCH = None


def begin_detail():
    global _BATCH
    _BATCH = {}


def _slot(mat, tint, tile):
    key = mat.name
    slot = _BATCH.get(key)
    if slot is None:
        slot = {'bm': bmesh.new(), 'mat': mat, 'tint': tint, 'tile': tile}
        _BATCH[key] = slot
    return slot


def _cube_into(bm, cx, cz, y, w, d, h):
    geom = bmesh.ops.create_cube(bm, size=1.0)
    verts = geom['verts']
    bmesh.ops.scale(bm, verts=verts, vec=(w, d, h))
    bmesh.ops.translate(bm, verts=verts, vec=(cx, -cz, y + h * 0.5))


def _take_bm(mat, src, tint, tile):
    slot = _slot(mat, tint, tile)
    me = bpy_mesh()
    src.to_mesh(me)
    src.free()
    slot['bm'].from_mesh(me)
    H.bpy.data.meshes.remove(me)


def bpy_mesh():
    return H.bpy.data.meshes.new('detail-tmp')


def flush_detail():
    global _BATCH
    if not _BATCH:
        return
    for slot in _BATCH.values():
        ob = H.mesh_of(slot['bm'], slot['mat'].name + '-detail')
        if slot['tint'] is not None:
            H.finish_shell(ob, slot['mat'], slot['tint'], slot['tile'])
        else:
            ob.data.materials.append(slot['mat'])
            H.project_uvs(ob, slot['tile'])
        print('detail', slot['mat'].name, len(ob.data.polygons), 'faces', flush=True)
    _BATCH = None


# ---------------------------------------------------------------- LAPD
def build_lapd(kit, rank):
    begin_detail()
    Q = H.HQ
    shaft_y = H.SHAFT_Y
    flight = H.plan_flight(Q['lobbyFloor'] - 0.18)
    if flight['risers'] != 30 or abs(flight['tread'] - 0.3) > 1e-9:
        raise RuntimeError(f'LAPD flight drifted {flight}')
    z1 = -59.15
    z0 = z1 - flight['run']
    metal = _metal()
    # 7.2 m is two storeys, so a pour joint in the map lands on the 3.6 m grid.
    tile = 7.2
    tint = H.tint_lapd
    mass = H.Mass()
    mass.box(0, 0, 0, Q['podiumW'], Q['podiumD'], Q['podiumH'])
    mass.box(0, 0, Q['podiumH'] - 0.25, Q['shaftW'], Q['shaftD'], shaft_y - Q['podiumH'] + 0.4)
    mast_top = Q['height'] + Q['padH'] + 6
    if rank >= 1:
        mass.box(0, 0, 64, Q['shaftW'] + 1.6, Q['shaftD'] + 1.6, 3.6)
        mass.box(0, 0, 118, Q['shaftW'] + 2.0, Q['shaftD'] + 2.0, 3.8)
    H.add_stairs(mass, z0, z1, 0.18, Q['lobbyFloor'], flight['risers'], 30, rail=True)
    # Cuts land on the podium box. The stitch runs after, so the hole stays open.
    # Door first so the opening reaches the street, then the lobby behind it.
    mass.cut(0, -58.55, Q['lobbyFloor'], Q['doorHalf'] * 2, 1.7, Q['doorHead'])
    mass.cut(0, -50.15, 5.22, Q['hallHalf'] * 2 - 0.2, 16.3, Q['lobbyCeil'] - 5.22)
    print('fuse lapd', len(mass.solids), flush=True)
    host = mass.fuse()
    H.finish_shell(host, kit.body, tint, tile)
    # A lighter deck on the black shaft. Vertex colour cannot lift the dark map.
    _lapd_crown(mass, Q, shaft_y, mast_top)

    # Low keeps every other fin of the high grid, so it sits inside the high envelope.
    shaft_fins_x = [-(Q['shaftW'] * 0.5 - 4) + i * (Q['shaftW'] - 8) / 6 for i in range(7)]
    shaft_fins_z = [-(Q['shaftD'] * 0.5 - 6) + i * (Q['shaftD'] - 12) / 6 for i in range(7)]
    if rank < 1:
        shaft_fins_x = shaft_fins_x[::2]
        shaft_fins_z = shaft_fins_z[::2]
    # Shallow ribs. A 5 m fin lights up as a window ladder.
    fin_t = 2.4
    fin_d = 1.55
    north, south = -Q['shaftD'] / 2, Q['shaftD'] / 2
    east, west = Q['shaftW'] / 2, -Q['shaftW'] / 2
    print('facade', rank, flush=True)
    for x in shaft_fins_x:
        _fin_z(mass.parts, kit.body, tint, tile, x, north, -1, Q['podiumH'] - 0.3, shaft_y, fin_t, fin_d)
        _fin_z(mass.parts, kit.body, tint, tile, x, south, 1, Q['podiumH'] - 0.3, shaft_y, fin_t, fin_d)
    for z in shaft_fins_z:
        _fin_x(mass.parts, kit.body, tint, tile, z, east, 1, Q['podiumH'] - 0.3, shaft_y, fin_t, fin_d)
        _fin_x(mass.parts, kit.body, tint, tile, z, west, -1, Q['podiumH'] - 0.3, shaft_y, fin_t, fin_d)

    # A few punched rows. A lip on every 3.6 m floor is the window chart.
    pitch = 21.6 if rank >= 2 else 28.8
    win_h = 1.35 if rank >= 2 else 1.7
    # Windows sit in the dark part of a 3.6 m floor. The lip is the top 0.9 m.
    win_y0 = 18.45
    _shaft_windows(
        kit, metal, tint, tile, rank, pitch, win_h,
        shaft_fins_x, fin_t, north, -1, 'z', win_y0, shaft_y - 2.5,
    )
    _shaft_windows(
        kit, metal, tint, tile, rank, pitch, win_h,
        shaft_fins_x, fin_t, south, 1, 'z', win_y0, shaft_y - 2.5,
    )
    _shaft_windows(
        kit, metal, tint, tile, rank, pitch, win_h,
        shaft_fins_z, fin_t, east, 1, 'x', win_y0, shaft_y - 2.5,
    )
    _shaft_windows(
        kit, metal, tint, tile, rank, pitch, win_h,
        shaft_fins_z, fin_t, west, -1, 'x', win_y0, shaft_y - 2.5,
    )
    face = -Q['podiumD'] / 2
    # Street pilasters and the door surround. The leaf stays empty.
    for x in (-36, -24, -14, 14, 24, 36):
        _fin_z(mass.parts, kit.body, tint, tile, x, face, -1, 0.2, Q['podiumH'] - 0.3, 2.6, 1.5)
    _body(-2.6, face + 0.55, Q['lobbyFloor'], 1.5, 1.3, Q['doorHead'] + 0.4, tint, tile, kit.body)
    _body(2.6, face + 0.55, Q['lobbyFloor'], 1.5, 1.3, Q['doorHead'] + 0.4, tint, tile, kit.body)
    _body(0, face + 0.55, Q['lobbyFloor'] + Q['doorHead'], 6.6, 1.3, 1.1, tint, tile, kit.body)
    _rec(mass.parts, 0, face + 0.4, 0.2, Q['podiumW'] - 4, 2.2, Q['podiumH'])
    if rank >= 1:
        _podium_storeys(mass.parts, kit.body, tint, tile)
        _podium_windows(kit, metal, tint, tile, rank, face, -1, 'z', Q['podiumW'], True)
        _podium_windows(kit, metal, tint, tile, rank, -face, 1, 'z', Q['podiumW'], False)
        _podium_windows(kit, metal, tint, tile, rank, Q['podiumW'] / 2, 1, 'x', Q['podiumD'], False)
        _podium_windows(kit, metal, tint, tile, rank, -Q['podiumW'] / 2, -1, 'x', Q['podiumD'], False)
        for lx, lz in ((-28, -38), (28, -38), (-28, 38), (28, 38)):
            # Short and thick. A long bezel on the crown fails the thin-part gate.
            _crown_lamp(kit, f'pad-{lx}-{lz}', lx, Q['height'] + Q['padH'], lz)
        _crown_lamp(kit, 'mast', 0, mast_top - 0.15, 0)
        # Sconces beside the 2.2 m leaf. A bar across the door is the old white band.
        H.place_lamp(kit, 'door-l', -4.4, Q['lobbyFloor'] + 1.5, face, (0, 0, -1), 0.55, 1.6, 'amber', -0.08)
        H.place_lamp(kit, 'door-r', 4.4, Q['lobbyFloor'] + 1.5, face, (0, 0, -1), 0.55, 1.6, 'amber', -0.08)
    flush_detail()
    door_clear = H.gap_at(host, (0, 59.15, Q['lobbyFloor'] + 1.1))
    return {
        'parts': mass.parts,
        'flight': flight,
        'doorClearM': door_clear,
        'heightTip': mast_top,
        'heightRoof': Q['height'],
        'door': {'min': [-1.1, 5.2, -59.4], 'max': [1.1, 7.4, -58.7]},
        'stair': {
            'z0': z0, 'z1': z1, 'y0': 0.18, 'y1': Q['lobbyFloor'],
            **flight, 'rail': H.RAIL_H, 'width': 30,
        },
    }


def _fin_z(parts, mat, tint, tile, x, face_z, outward, y0, y1, thick, relief):
    cz, d = _span_z(face_z, outward, 0.01, relief)
    _body(x, cz, y0, thick, d, y1 - y0, tint, tile, mat)
    _rec(parts, x, cz, y0, thick, d, y1 - y0)


def _fin_x(parts, mat, tint, tile, z, face_x, outward, y0, y1, thick, relief):
    cx, w = _span_x(face_x, outward, 0.01, relief)
    _body(cx, z, y0, w, thick, y1 - y0, tint, tile, mat)
    _rec(parts, cx, z, y0, w, thick, y1 - y0)


def _intervals(centers, thick, margin):
    xs = sorted(centers)
    out = []
    for a, b in zip(xs, xs[1:]):
        lo = a + thick * 0.5 + margin
        hi = b - thick * 0.5 - margin
        if hi - lo > 0.8:
            out.append((lo, hi))
    return out


def _shaft_windows(kit, metal, tint, tile, rank, pitch, win_h, fins, fin_t, face, outward, axis, y0, y1):
    bays = _intervals(fins, fin_t, 0.45)
    if rank == 0:
        # Two punched bands. A full-height pane is the cool glass column.
        for a, b in bays:
            inset = (b - a) * 0.28
            aa, bb = a + inset, b - inset
            if bb - aa < 0.7:
                continue
            for y in (y0 + 6.0, y0 + (y1 - y0) * 0.46):
                if y + 2.2 >= y1:
                    continue
                _opening(kit.glass, metal, tint, tile, rank, face, outward, axis, aa, bb, y, 2.05, jambs=False)
        return
    floors = _floors(y0, y1, pitch * 2, win_h)
    for i, (a, b) in enumerate(bays):
        # Most bays stay solid. A ladder of identical slots is not this shaft.
        if (i + (0 if outward > 0 else 1)) % 3 != 0:
            continue
        inset = (b - a) * 0.3
        a, b = a + inset, b - inset
        if b - a < 0.8 or not floors:
            continue
        picks = floors[(i % 2)::2][:2]
        for y in picks:
            _opening(kit.glass, metal, tint, tile, rank, face, outward, axis, a, b, y, win_h, jambs=rank >= 2)
            if rank >= 2:
                _sill(kit.body, tint, tile, face, outward, axis, a, b, y - 0.15, 1.15, 0.72)


def _opening(glass, metal, tint, tile, rank, face, outward, axis, a, b, y, h, jambs):
    mid = (a + b) * 0.5
    span = b - a
    if axis == 'z':
        cz, d = _span_z(face, outward, 0.01, 0.12)
        _glass(mid, cz, y, span, d, h, glass)
        if jambs:
            for x in (a, b):
                mx, _md = _span_z(face, outward, 0.01, 0.28)
                _body(x, mx, y, 0.16, _md, h, tint, tile, metal)
    else:
        cx, w = _span_x(face, outward, 0.01, 0.12)
        _glass(cx, mid, y, w, span, h, glass)
        if jambs:
            for z in (a, b):
                mz, mw = _span_x(face, outward, 0.01, 0.28)[0], 0.2
                _body(mz, z, y, mw, 0.16, h, tint, tile, metal)


def _sill(mat, tint, tile, face, outward, axis, a, b, y, depth=0.42, band=0.32):
    if axis == 'z':
        cz, d = _span_z(face, outward, 0.01, depth)
        _body((a + b) * 0.5, cz, y, b - a, d, band, tint, tile, mat)
    else:
        cx, w = _span_x(face, outward, 0.01, depth)
        _body(cx, (a + b) * 0.5, y, w, b - a, band, tint, tile, mat)


def _band(parts, mat, tint, tile, face, outward, axis, a, b, y, h, depth):
    """A storey lip straddling the wall, so an edge midpoint sits on the shell."""
    if b - a < 0.5 or h < 0.2 or depth < 0.2:
        return
    # Half the lip is inside the wall. The stray check needs a sample on the face.
    embed = depth * 0.5
    if axis == 'z':
        cz, d = _span_z(face, outward, embed, depth)
        _body((a + b) * 0.5, cz, y, b - a, d, h, tint, tile, mat)
        _rec(parts, (a + b) * 0.5, cz, y, (b - a) + 0.08, d + 0.08, h)
    else:
        cx, w = _span_x(face, outward, embed, depth)
        _body(cx, (a + b) * 0.5, y, w, b - a, h, tint, tile, mat)
        _rec(parts, cx, (a + b) * 0.5, y, w + 0.08, (b - a) + 0.08, h)


def _podium_storeys(parts, mat, tint, tile):
    """Lips whose tops are 3.6, 7.2, 10.8 and 14.4 m. The street pole is 3.6 m."""
    Q = H.HQ
    h = 0.9
    depth = 1.8
    for n in range(1, 5):
        y = n * 3.6 - h
        span = Q['podiumW'] - 3.0
        for face, outward in ((-Q['podiumD'] / 2, -1), (Q['podiumD'] / 2, 1)):
            # The leaf at 7.2 m is the door. The lip stops at the jambs.
            if outward < 0 and n == 2:
                _band(parts, mat, tint, tile, face, outward, 'z', -span * 0.5, -4.4, y, h, depth)
                _band(parts, mat, tint, tile, face, outward, 'z', 4.4, span * 0.5, y, h, depth)
            else:
                _band(parts, mat, tint, tile, face, outward, 'z', -span * 0.5, span * 0.5, y, h, depth)
        span_d = Q['podiumD'] - 3.0
        for face, outward in ((Q['podiumW'] / 2, 1), (-Q['podiumW'] / 2, -1)):
            _band(parts, mat, tint, tile, face, outward, 'x', -span_d * 0.5, span_d * 0.5, y, h, depth)


def _shaft_storeys(parts, mat, tint, tile, pitch, fins_x, fins_z, fin_t, north, south, east, west, shaft_y):
    """A lip in each bay, on the same 3.6 m grid as the podium. Not past the fins."""
    h = 0.95
    depth = 2.2
    y_top = 21.6
    guard = 0
    while y_top < shaft_y - 1.0 and guard < 80:
        y = y_top - h
        for a, b in _intervals(fins_x, fin_t, 0.25):
            _band(parts, mat, tint, tile, north, -1, 'z', a, b, y, h, depth)
            _band(parts, mat, tint, tile, south, 1, 'z', a, b, y, h, depth)
        for a, b in _intervals(fins_z, fin_t, 0.25):
            _band(parts, mat, tint, tile, east, 1, 'x', a, b, y, h, depth)
            _band(parts, mat, tint, tile, west, -1, 'x', a, b, y, h, depth)
        y_top += pitch
        guard += 1


def _podium_windows(kit, metal, tint, tile, rank, face, outward, axis, span, skip_door):
    # The pane sits under the lip. The lip top is the storey, not the plywood sheet.
    # Punched openings. A 2 m pane on a 3.6 m pitch is a ribbon window.
    pitch = 7.2
    win_h = 1.25 if rank >= 2 else 1.55
    n = 5 if rank >= 2 else 3
    margin = 6.0
    bay = (span - margin * 2) / n
    for i in range(n):
        a = -span * 0.5 + margin + i * bay + 0.35
        b = a + bay - 0.7
        if skip_door and _overlaps(a, b, -3.2, 3.2):
            continue
        for y in _floors(0.55, H.HQ['podiumH'] - 1.2, pitch, win_h):
            _opening(kit.glass, metal, tint, tile, rank, face, outward, axis, a, b, y, win_h, jambs=rank >= 2)


def _crown_lamp(kit, name, x, y, z):
    # 2.6 m over a 0.34 m bezel stays under the stray aspect cap.
    part = kit.light_strip(name, 2.6, 0.42, 0.48, 'amber', bezel=kit.recess)
    kit.place(part, H.bl_point(x, y, z), normal=H.bl_normal(0, 1, 0), lift=-0.16)


def _pad_lip(mat, tint, tile, lx, lz, y):
    pad = H.HQ['pad']
    t = 0.7
    h = 0.9
    _body(lx, lz - pad * 0.5 + t * 0.4, y, pad, t, h, tint, tile, mat)
    _body(lx, lz + pad * 0.5 - t * 0.4, y, pad, t, h, tint, tile, mat)
    _body(lx - pad * 0.5 + t * 0.4, lz, y, t, pad - t, h, tint, tile, mat)
    _body(lx + pad * 0.5 - t * 0.4, lz, y, t, pad - t, h, tint, tile, mat)


def _deck_lip(mass, Q):
    """A parapet on the deck edge. Four bars, so the field of the roof stays open."""
    lip_t = 2.8
    lip_h = 3.4
    y = Q['height'] - 0.25
    cw, cd = Q['crownW'], Q['crownD']
    mass.box(0, -cd * 0.5, y, cw + lip_t, lip_t, lip_h)
    mass.box(0, cd * 0.5, y, cw + lip_t, lip_t, lip_h)
    mass.box(-cw * 0.5, 0, y, lip_t, cd, lip_h)
    mass.box(cw * 0.5, 0, y, lip_t, cd, lip_h)


def _seam(mat, cx, cz, y, w, d, h):
    if w < 0.08 or d < 0.08 or h < 0.08:
        return
    _cube_into(_slot(mat, None, 4.0)['bm'], cx, cz, y, w, d, h)


def _deck_seams(parts, mat, Q):
    """Dark joints on the pale deck. The bottom face sits on the roof."""
    y = Q['height']
    h = 0.28
    t = 0.42
    cw, cd = Q['crownW'] - 8.0, Q['crownD'] - 8.0
    # Two broad joints. A four-by-four grid reads as roof tile.
    for x in (-32, 32):
        _seam(mat, x, 0, y, t, cd, h)
        _rec(parts, x, 0, y, t + 0.2, cd, h + 0.15)
    for z in (-40, 40):
        _seam(mat, 0, z, y, cw, t, h)
        _rec(parts, 0, z, y, cw, t + 0.2, h + 0.15)


def _deck_mat():
    import bpy
    found = bpy.data.materials.get('deck-stone')
    if found is not None:
        return found
    from kit.parts import _principled
    # The overhead still is a pale metal deck, not the black shaft.
    return _principled('deck-stone', (0.62, 0.66, 0.72), 0.38, 0.42, (0.0, 0.0, 0.0), 0.0)


def _paint_deck(ob):
    ob.data.materials.clear()
    ob.data.materials.append(_deck_mat())
    return ob


def _lapd_crown(mass, Q, shaft_y, mast_top):
    # One shell. Pads and the mast share roof vertices, and the bottom corners
    # sit on the shaft corners so the pale deck is not a floating plate.
    import bmesh
    from mathutils import Vector
    top = shaft_y + 0.15
    hw0, hd0 = Q['shaftW'] * 0.5, Q['shaftD'] * 0.5
    eave = 1.2
    hw1, hd1 = Q['crownW'] * 0.5 + eave, Q['crownD'] * 0.5 + eave
    y_flare = Q['height'] - 6.4
    y_deck = Q['height']
    lip_h = 2.6
    half = Q['pad'] * 0.5
    centres = ((-28.0, -38.0), (28.0, -38.0), (-28.0, 38.0), (28.0, 38.0))
    xs = sorted({-hw1, hw1, *{px - half for px, _pz in centres}, *{px + half for px, _pz in centres}})
    zs = sorted({-hd1, hd1, *{pz - half for _px, pz in centres}, *{pz + half for _px, pz in centres}})
    if any(b - a < 0.2 for a, b in zip(xs, xs[1:])) or any(b - a < 0.2 for a, b in zip(zs, zs[1:])):
        raise RuntimeError(f'crown grid collapsed {xs} {zs}')
    bm = bmesh.new()

    def add_face(verts, interior):
        face = bm.faces.new(tuple(verts))
        face.normal_update()
        centre = face.calc_center_median()
        if face.normal.dot(interior - centre) > 0:
            bmesh.ops.reverse_faces(bm, faces=[face])
        return face

    def ring(y, hw, hd):
        return [bm.verts.new((x, -z, y)) for x, z in (
            (-hw, -hd), (hw, -hd), (hw, hd), (-hw, hd),
        )]

    def link(lower, upper, interior):
        for i in range(4):
            j = (i + 1) % 4
            add_face((lower[i], lower[j], upper[j], upper[i]), interior)

    shell = Vector((0.0, 0.0, (top + y_deck) * 0.5))
    bottom = ring(top, hw0, hd0)
    flare = ring(y_flare, Q['crownW'] * 0.5, Q['crownD'] * 0.5)
    link(bottom, flare, shell)
    grid = [[bm.verts.new((x, -z, y_deck)) for x in xs] for z in zs]
    outer = [grid[0][0], grid[0][-1], grid[-1][-1], grid[-1][0]]
    link(flare, outer, shell)

    def pad_cell(zi, xi):
        cx = (xs[xi] + xs[xi + 1]) * 0.5
        cz = (zs[zi] + zs[zi + 1]) * 0.5
        return any(abs(cx - px) < 0.1 and abs(cz - pz) < 0.1 for px, pz in centres)

    origin = None
    for zi in range(len(zs) - 1):
        for xi in range(len(xs) - 1):
            corners = (
                grid[zi][xi], grid[zi][xi + 1],
                grid[zi + 1][xi + 1], grid[zi + 1][xi],
            )
            if xs[xi] < 0 < xs[xi + 1] and zs[zi] < 0 < zs[zi + 1]:
                origin = corners
                continue
            if pad_cell(zi, xi):
                cap = [bm.verts.new((v.co.x, v.co.y, y_deck + Q['padH'])) for v in corners]
                interior = Vector((
                    (corners[0].co.x + corners[2].co.x) * 0.5,
                    (corners[0].co.y + corners[2].co.y) * 0.5,
                    y_deck + Q['padH'] * 0.5,
                ))
                link(corners, cap, interior)
                add_face(cap, interior)
                continue
            add_face(corners, shell)
    if origin is None:
        raise RuntimeError('crown has no centre bay')
    mast_hw = 2.3
    mast_base = ring(y_deck, mast_hw, mast_hw)
    mast_cap = ring(mast_top, mast_hw, mast_hw)
    mast_in = Vector((0.0, 0.0, (y_deck + mast_top) * 0.5))
    link(mast_base, mast_cap, mast_in)
    add_face(mast_cap, mast_in)
    a, b, c, d = origin
    m0, m1, m2, m3 = mast_base
    add_face((a, b, m1, m0), shell)
    add_face((b, c, m2, m1), shell)
    add_face((c, d, m3, m2), shell)
    add_face((d, a, m0, m3), shell)
    lip = ring(y_deck + lip_h, hw1, hd1)
    link(outer, lip, Vector((0.0, 0.0, y_deck + lip_h * 0.5)))
    ob = H.mesh_of(bm, 'crown')
    _paint_deck(ob)
    mass.parts.append({
        'type': 'frustum', 'cx': 0, 'cz': 0, 'y': top,
        'w0': Q['shaftW'], 'd0': Q['shaftD'], 'w1': Q['crownW'], 'd1': Q['crownD'],
        'h': y_flare - top,
    })
    mass.parts.append({
        'type': 'box', 'cx': 0, 'cz': 0, 'y': y_flare,
        'w': Q['crownW'] + 2.4, 'd': Q['crownD'] + 2.4, 'h': y_deck - y_flare,
    })
    mass.parts.append({
        'type': 'box', 'cx': 0, 'cz': 0, 'y': y_deck,
        'w': Q['crownW'] + 2.4, 'd': Q['crownD'] + 2.4, 'h': lip_h,
    })
    for lx, lz in centres:
        mass.parts.append({
            'type': 'box', 'cx': lx, 'cz': lz, 'y': y_deck,
            'w': Q['pad'], 'd': Q['pad'], 'h': Q['padH'],
        })
    mass.parts.append({
        'type': 'box', 'cx': 0, 'cz': 0, 'y': y_deck, 'w': 4.6, 'd': 4.6, 'h': mast_top - y_deck,
    })


def _crown_tiers(shaft_y):
    """Three short fascias on the inverted flare. The top one is the roof cap."""
    Q = H.HQ
    tiers = []
    for i in range(3):
        t1 = (i + 1) / 3.0
        h = 3.2
        y = shaft_y + Q['crownH'] * t1 - h - 0.4
        w = Q['shaftW'] + (Q['crownW'] - Q['shaftW']) * t1 + 1.8
        d = Q['shaftD'] + (Q['crownD'] - Q['shaftD']) * t1 + 1.8
        tiers.append((y, h, w, d))
    return tiers


def _crown_half_w(y, shaft_y):
    Q = H.HQ
    t = (y - shaft_y) / Q['crownH']
    t = 0.0 if t < 0 else 1.0 if t > 1 else t
    return (Q['shaftW'] + (Q['crownW'] - Q['shaftW']) * t) * 0.5


def _crown_half_d(y, shaft_y):
    Q = H.HQ
    t = (y - shaft_y) / Q['crownH']
    t = 0.0 if t < 0 else 1.0 if t > 1 else t
    return (Q['shaftD'] + (Q['crownD'] - Q['shaftD']) * t) * 0.5


def _crown_skin(parts, kit, metal, tint, tile, rank, shaft_y):
    """Ribs on each crown fascia. Slope wedges hung under the soffit as teeth."""
    for y, h, w, d in _crown_tiers(shaft_y):
        n = 5 if rank >= 1 else 3
        xs = [-(w * 0.5 - 8) + k * (w - 16) / (n - 1) for k in range(n)]
        zs = [-(d * 0.5 - 8) + k * (d - 16) / (n - 1) for k in range(n)]
        y1 = y + h
        for x in xs:
            _fin_z(parts, kit.body, tint, tile, x, -d * 0.5, -1, y, y1, 2.2, 1.35)
            _fin_z(parts, kit.body, tint, tile, x, d * 0.5, 1, y, y1, 2.2, 1.35)
        for z in zs:
            _fin_x(parts, kit.body, tint, tile, z, w * 0.5, 1, y, y1, 2.2, 1.35)
            _fin_x(parts, kit.body, tint, tile, z, -w * 0.5, -1, y, y1, 2.2, 1.35)
        if rank < 1 or h < 2.2:
            continue
        win_h = min(1.6, h * 0.34)
        win_y = y + max(0.4, h * 0.3)
        for a, b in _intervals(xs, 2.2, 0.7):
            inset = (b - a) * 0.2
            _opening(kit.glass, metal, tint, tile, rank, -d * 0.5, -1, 'z', a + inset, b - inset, win_y, win_h, False)
            _opening(kit.glass, metal, tint, tile, rank, d * 0.5, 1, 'z', a + inset, b - inset, win_y, win_h, False)
        for a, b in _intervals(zs, 2.2, 0.7):
            inset = (b - a) * 0.2
            _opening(kit.glass, metal, tint, tile, rank, w * 0.5, 1, 'x', a + inset, b - inset, win_y, win_h, False)
            _opening(kit.glass, metal, tint, tile, rank, -w * 0.5, -1, 'x', a + inset, b - inset, win_y, win_h, False)


def _wedge(parts, mat, tint, tile, axis, at, thick, y0, y1, shaft_y, outward, relief):
    bm = bmesh.new()
    ht = thick * 0.5
    verts = {}
    for yi, y in enumerate((y0, y1)):
        for ei, extra in enumerate((0.0, relief)):
            for oi, off in enumerate((-ht, ht)):
                if axis == 'z':
                    half = _crown_half_d(y, shaft_y)
                    face = outward * half
                    z = face - outward * 0.01 + outward * extra
                    co = (at + off, -z, y)
                else:
                    half = _crown_half_w(y, shaft_y)
                    face = outward * half
                    x = face - outward * 0.01 + outward * extra
                    co = (x, -(at + off), y)
                verts[(yi, ei, oi)] = bm.verts.new(co)

    def quad(a, b, c, d):
        try:
            bm.faces.new((verts[a], verts[b], verts[c], verts[d]))
        except ValueError:
            pass

    quad((0, 0, 0), (0, 0, 1), (0, 1, 1), (0, 1, 0))
    quad((1, 0, 0), (1, 1, 0), (1, 1, 1), (1, 0, 1))
    quad((0, 0, 0), (1, 0, 0), (1, 0, 1), (0, 0, 1))
    quad((0, 1, 0), (0, 1, 1), (1, 1, 1), (1, 1, 0))
    quad((0, 0, 0), (0, 1, 0), (1, 1, 0), (1, 0, 0))
    quad((0, 0, 1), (1, 0, 1), (1, 1, 1), (0, 1, 1))
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    xs = [v.co.x for v in verts.values()]
    ys = [v.co.z for v in verts.values()]
    zs = [-v.co.y for v in verts.values()]
    _take_bm(mat, bm, tint, tile)
    _rec(parts, (min(xs) + max(xs)) * 0.5, (min(zs) + max(zs)) * 0.5, min(ys),
         max(0.2, max(xs) - min(xs)), max(0.2, max(zs) - min(zs)), max(0.2, max(ys) - min(ys)))
    return None


def _wedge_pane(mat, axis, a, b, y0, y1, shaft_y, outward):
    bm = bmesh.new()
    thick = 0.1

    def corner(y, along, extra):
        if axis == 'z':
            half = _crown_half_d(y, shaft_y)
            face = outward * half
            z = face + outward * 0.02 + outward * extra
            return (along, -z, y)
        half = _crown_half_w(y, shaft_y)
        face = outward * half
        x = face + outward * 0.02 + outward * extra
        return (x, -along, y)

    verts = {}
    for yi, y in enumerate((y0, y1)):
        for ei, extra in enumerate((0.0, thick)):
            for oi, along in enumerate((a, b)):
                verts[(yi, ei, oi)] = bm.verts.new(corner(y, along, extra))

    def quad(i, j, k, l):
        try:
            bm.faces.new((verts[i], verts[j], verts[k], verts[l]))
        except ValueError:
            pass

    quad((0, 0, 0), (0, 0, 1), (0, 1, 1), (0, 1, 0))
    quad((1, 0, 0), (1, 1, 0), (1, 1, 1), (1, 0, 1))
    quad((0, 0, 0), (1, 0, 0), (1, 0, 1), (0, 0, 1))
    quad((0, 1, 0), (0, 1, 1), (1, 1, 1), (1, 1, 0))
    quad((0, 0, 0), (0, 1, 0), (1, 1, 0), (1, 0, 0))
    quad((0, 0, 1), (1, 0, 1), (1, 1, 1), (0, 1, 1))
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    _take_bm(mat, bm, None, 8.0)
    return None


# ---------------------------------------------------------------- City Hall
def _clay():
    import bpy
    found = bpy.data.materials.get('roof-clay')
    if found is not None:
        return found
    from kit.parts import _principled
    # Clay tile. The 1928 wings carry red hips, not a white lid.
    return _principled('roof-clay', (0.42, 0.13, 0.07), 0.74, 0.02, (0.0, 0.0, 0.0), 0.0)


def _wing_roofs(Q, shaft, wing_h):
    clay = _clay()
    # Sit inside the wing top. A hip that overhangs the parapet fails the touch gate.
    side_w = (Q['baseW'] - shaft) * 0.5 - 8.0
    cx = shaft * 0.5 + 2.2 + side_w * 0.5
    depth = Q['baseD'] - 18.0
    for sx in (-1, 1):
        hip = H.make_frustum(
            f'wing-hip-{sx}', sx * cx, 0.0, wing_h - 1.6,
            side_w, depth, 3.4, 4.6, 4.8,
        )
        hip.data.materials.clear()
        hip.data.materials.append(clay)


def _add_drum(mass, y, radius, height, sides):
    bm = bmesh.new()
    bmesh.ops.create_cone(
        bm, cap_ends=True, segments=sides,
        radius1=radius, radius2=radius * 0.9, depth=height,
    )
    bmesh.ops.translate(bm, verts=list(bm.verts), vec=(0.0, 0.0, y + height * 0.5))
    mass.solids.append(H.mesh_of(bm, 'hall-drum'))
    mass.parts.append({
        'type': 'box', 'cx': 0.0, 'cz': 0.0, 'y': y,
        'w': radius * 2, 'd': radius * 2, 'h': height,
    })


def _colonnade_lamps(kit, Q):
    # Short sconces on the shaft, just under the columns, so the colonnade is lit.
    y = Q['shaftTop'] - 1.1
    face = Q['shaft'] * 0.5
    for i, x in enumerate((-10.0, -3.4, 3.4, 10.0)):
        H.place_lamp(kit, f'col-s-{i}', x, y, face, (0, 0, 1), 0.55, 0.14, 'white', -0.12)
        H.place_lamp(kit, f'col-n-{i}', x, y, -face, (0, 0, -1), 0.55, 0.14, 'white', -0.12)
    for i, z in enumerate((-8.0, 0.0, 8.0)):
        H.place_lamp(kit, f'col-e-{i}', face, y, z, (1, 0, 0), 0.55, 0.14, 'white', -0.12)
        H.place_lamp(kit, f'col-w-{i}', -face, y, z, (-1, 0, 0), 0.55, 0.14, 'white', -0.12)


def build_hall(kit, rank):
    begin_detail()
    Q = H.HALL
    flight = H.plan_flight(3.6 - 0.16)
    if flight['risers'] != 20 or abs(flight['tread'] - 0.29) > 1e-9:
        raise RuntimeError(f'Hall flight drifted {flight}')
    z1 = 36.4
    z0 = z1 + flight['run']
    metal = _metal()
    tile = 4.0
    tint = H.tint_hall
    mass = H.Mass()
    # Published 1928 massing (spec.ts HALL): wings 28 m, a 34 m shaft to 100 m,
    # a 26 m colonnade to 114 m, then the stepped pyramid and the lantern at 138.
    base_h = Q['baseH']
    shaft = Q['shaft']
    shaft_top = Q['shaftTop']
    neck = Q['neck']
    neck_top = Q['neckTop']
    pyramid_top = Q['pyramidTop']
    # The wide wings are the street block in the 1928 photos, not a low plinth.
    wing_h = 26.0
    mass.box(0, 0, 0, Q['baseW'], Q['baseD'], wing_h)
    # Corner pavilions, proud of the slab, so the base is not one box.
    for sx in (-1, 1):
        for sz in (-1, 1):
            mass.box(
                sx * (Q['baseW'] * 0.5 - 5.5), sz * (Q['baseD'] * 0.5 - 4.5),
                0, 16, 13, wing_h + 3.2,
            )
    mass.box(0, 0, wing_h - 1.5, Q['baseW'] + 2.0, Q['baseD'] + 2.0, 1.8)
    mid_w, mid_d = 58.0, 42.0
    mass.box(0, 0, wing_h - 0.6, mid_w, mid_d, base_h - wing_h + 1.4)
    mass.box(0, 0, base_h - 1.5, mid_w + 1.6, mid_d + 1.6, 1.6)
    mass.box(0, 0, base_h - 0.3, shaft + 5.0, shaft + 5.0, 3.2)
    mass.box(0, 0, base_h + 1.6, shaft, shaft, shaft_top - base_h - 1.2)
    mass.box(0, 0, shaft_top - 2.2, shaft + 2.4, shaft + 2.4, 2.6)
    mass.box(0, 0, shaft_top, neck, neck, neck_top - shaft_top)
    _wing_roofs(Q, shaft, wing_h)
    # Openings between the colonnade piers. The pier itself stays, so the post is not loose.
    half_n = neck * 0.5
    slot_y = shaft_top + 0.9
    slot_h = neck_top - shaft_top - 2.1
    # Wider than the pier, so a three-quarter view still sees the opening.
    bay, pier = 3.6, 0.92
    posts = []
    cursor = -(half_n - 2.2)
    while cursor <= half_n - 2.1:
        posts.append(round(cursor, 3))
        cursor += bay
    inset = pier * 0.5
    for i in range(len(posts) - 1):
        a = posts[i] + inset
        b = posts[i + 1] - inset
        if b - a < 0.8:
            continue
        mid = (a + b) * 0.5
        span = b - a
        for face in (half_n, -half_n):
            outward = 1 if face > 0 else -1
            # Deep slots. A shallow groove reads as a scratch, not a colonnade.
            mass.cut(mid, face - outward * 0.9, slot_y, span, 3.2, slot_h)
            mass.cut(face - outward * 0.9, mid, slot_y, 3.2, span, slot_h)
    # Square terraces. A smooth hip reads as a roof, and an open drum reads as a well.
    pyr0 = neck_top - 0.15
    span0 = neck - 0.8
    span1 = 11.2
    # Seven deep terraces. Twelve shallow ones alias into a smooth pyramid.
    n_steps = 7
    rise = (pyramid_top - pyr0) / n_steps
    for i in range(n_steps):
        y0 = pyr0 + rise * i
        span = span0 + (span1 - span0) * (i / float(n_steps))
        mass.box(0, 0, y0, span, span, rise + 0.25)
    # Round lantern, wide enough to read on the contact sheet.
    _add_drum(mass, pyramid_top - 0.25, 3.35, 5.1, 20)
    mass.box(0, 0, Q['lanternTop'], 0.7, 0.7, Q['height'] - Q['lanternTop'])
    # Pier relief sits outside the stone. The collar is the envelope, not extra stone.
    _rec(mass.parts, 0, 0, 0, Q['baseW'] + 2.6, Q['baseD'] + 2.6, base_h + 0.6)
    _rec(mass.parts, 0, 0, base_h + 1.2, shaft + 2.6, shaft + 2.6, shaft_top - base_h)
    H.add_stairs(mass, z0, z1, 0.16, 3.6, flight['risers'], 22, rail=True)
    mass.box(0, 34.2, 3.46, 16, 8.4, 0.2, record=True)
    face = Q['baseD'] / 2
    mass.cut(0, 30.2, 3.6, 2.2, 3.2, H.DOOR_H)
    # Porch stops inside the facade. The columns stay bedded in the remaining skin.
    mass.cut(0, 27.4, 3.5, 30.0, 6.4, 8.4)
    print('fuse hall', len(mass.solids), flush=True)
    host = mass.fuse()
    H.finish_shell(host, kit.body, tint, tile)

    _portico(mass.parts, kit.body, tint, tile, face, rank)
    if rank >= 1:
        _hall_belts(mass.parts, kit.body, tint, tile)
    pitch = 3.6 if rank >= 2 else (7.2 if rank == 1 else 14)
    _hall_facade(kit, metal, tint, tile, rank, pitch, face, 1, 'z', Q['baseW'], 4.4, wing_h - 2.0, True, 1)
    _hall_facade(kit, metal, tint, tile, rank, pitch, -face, -1, 'z', Q['baseW'], 4.4, wing_h - 2.0, False, 1)
    _hall_facade(kit, metal, tint, tile, rank, pitch, Q['baseW'] / 2, 1, 'x', Q['baseD'], 4.4, wing_h - 2.0, False, 1)
    _hall_facade(kit, metal, tint, tile, rank, pitch, -Q['baseW'] / 2, -1, 'x', Q['baseD'], 4.4, wing_h - 2.0, False, 1)
    _hall_facade(kit, metal, tint, tile, rank, pitch, mid_d / 2, 1, 'z', mid_w, wing_h + 0.4, base_h - 2.0, False, 1)
    _hall_facade(kit, metal, tint, tile, rank, pitch, -mid_d / 2, -1, 'z', mid_w, wing_h + 0.4, base_h - 2.0, False, 1)
    _hall_facade(kit, metal, tint, tile, rank, pitch, mid_w / 2, 1, 'x', mid_d, wing_h + 0.4, base_h - 2.0, False, 1)
    _hall_facade(kit, metal, tint, tile, rank, pitch, -mid_w / 2, -1, 'x', mid_d, wing_h + 0.4, base_h - 2.0, False, 1)
    shaft_face = shaft / 2
    _hall_facade(kit, metal, tint, tile, rank, pitch, shaft_face, 1, 'z', shaft, base_h + 3.2, shaft_top - 2.8, False, 1)
    _hall_facade(kit, metal, tint, tile, rank, pitch, -shaft_face, -1, 'z', shaft, base_h + 3.2, shaft_top - 2.8, False, 1)
    _hall_facade(kit, metal, tint, tile, rank, pitch, shaft_face, 1, 'x', shaft, base_h + 3.2, shaft_top - 2.8, False, 1)
    _hall_facade(kit, metal, tint, tile, rank, pitch, -shaft_face, -1, 'x', shaft, base_h + 3.2, shaft_top - 2.8, False, 1)
    _colonnade(mass.parts, kit, metal, tint, tile, rank, shaft_top + 0.3, neck_top - 0.8, neck / 2)

    if rank >= 1:
        H.place_lamp(kit, 'hall-door-l', -6.4, 8.6, face, (0, 0, 1), 1.2, 0.32, 'amber', -0.01)
        H.place_lamp(kit, 'hall-door-r', 6.4, 8.6, face, (0, 0, 1), 1.2, 0.32, 'amber', -0.01)
        H.place_lamp(kit, 'hall-beacon', 0, Q['height'], 0, (0, 1, 0), 0.7, 0.28, 'red', -0.16)
        _colonnade_lamps(kit, Q)

    flush_detail()
    door_clear = H.gap_at(host, (0, -face, 3.6 + 1.1))
    return {
        'parts': mass.parts,
        'flight': flight,
        'doorClearM': door_clear,
        'heightTip': Q['height'],
        'heightRoof': pyramid_top,
        'door': {'min': [-1.1, 3.6, 30.5], 'max': [1.1, 5.8, 31.4]},
        'stair': {
            'z0': z0, 'z1': z1, 'y0': 0.16, 'y1': 3.6,
            **flight, 'rail': H.RAIL_H, 'width': 22,
        },
    }


def _hall_belts(parts, mat, tint, tile):
    """Four stone belts on the wing. Tops at 3.6 m so the pole matches a floor."""
    Q = H.HALL
    h = 0.5
    depth = 1.05
    for n in range(1, 5):
        y = n * 3.6 - h
        span_w = Q['baseW'] - 4.0
        for face, outward in ((Q['baseD'] / 2, 1), (-Q['baseD'] / 2, -1)):
            if outward > 0 and n == 1:
                _band(parts, mat, tint, tile, face, outward, 'z', -span_w * 0.5, -3.6, y, h, depth)
                _band(parts, mat, tint, tile, face, outward, 'z', 3.6, span_w * 0.5, y, h, depth)
            else:
                _band(parts, mat, tint, tile, face, outward, 'z', -span_w * 0.5, span_w * 0.5, y, h, depth)
        span_d = Q['baseD'] - 4.0
        for face, outward in ((Q['baseW'] / 2, 1), (-Q['baseW'] / 2, -1)):
            _band(parts, mat, tint, tile, face, outward, 'x', -span_d * 0.5, span_d * 0.5, y, h, depth)


def _portico(parts, mat, tint, tile, face, rank):
    # A real porch: columns in front of the dark opening, not pilasters on a flat wall.
    # The centre bay stays wide enough for the 2.2 m door.
    xs = (-16.0, -10.5, -6.4, 6.4, 10.5, 16.0) if rank >= 1 else (-12.0, -6.2, 6.2, 12.0)
    depth = 2.7
    cz, d = _span_z(face, 1, 0.01, depth)
    for x in xs:
        _body(x, cz, 3.5, 1.65, d, 8.7, tint, tile, mat)
    _body(0, cz, 11.9, 31.5, d, 1.45, tint, tile, mat)
    _rec(parts, 0, face + depth * 0.42, 3.4, 34, depth + 0.6, 10.4)


def _warm_glass():
    import bpy
    found = bpy.data.materials.get('glass-warm')
    if found is not None:
        return found
    from kit.parts import _principled
    # A few bays, warm. The rest of the curtain stays dark limestone.
    return _principled('glass-warm', (0.05, 0.035, 0.02), 0.45, 0.02, (0.55, 0.32, 0.1), 0.16)


def _hall_facade(kit, metal, tint, tile, rank, pitch, face, outward, axis, span, y0, y1, skip_door, pier):
    n = 8 if span > 70 else (6 if span > 40 else 5)
    if rank == 0:
        n = max(3, n // 2)
    margin = 3.2
    bay = (span - margin * 2) / n
    pier_w = 1.35 if pier else 0.2
    win_h = 1.45 if rank >= 2 else 2.05
    for i in range(n):
        a = -span * 0.5 + margin + i * bay + 0.3
        b = a + bay - 0.6
        mid = (a + b) * 0.5
        win = min(2.15, max(1.15, (b - a) * 0.52))
        a, b = mid - win * 0.5, mid + win * 0.5
        if skip_door and _overlaps(a, b, -3.4, 3.4):
            continue
        glass = _warm_glass() if i % 8 == 3 else kit.glass
        if rank == 0:
            for y in _floors(y0, min(y1, y0 + 18.0), 7.2, 1.7)[:3]:
                _opening(glass, metal, tint, tile, rank, face, outward, axis, a, b, y, 1.7, jambs=False)
        else:
            for y in _floors(y0, y1 - 0.6, pitch, win_h):
                if skip_door and y < 8.2 and _overlaps(a, b, -3.4, 3.4):
                    continue
                _opening(glass, metal, tint, tile, rank, face, outward, axis, a, b, y, win_h, jambs=rank >= 2)
                if rank >= 2:
                    _sill(kit.body, tint, tile, face, outward, axis, a, b, y - 0.05)
        if pier:
            if axis == 'z':
                cz, d = _span_z(face, outward, 0.01, 0.95)
                _body(a - 0.2, cz, y0, pier_w, d, y1 - y0, tint, tile, kit.body)
            else:
                cx, w = _span_x(face, outward, 0.01, 0.95)
                _body(cx, a - 0.2, y0, w, pier_w, y1 - y0, tint, tile, kit.body)


def _colonnade(parts, kit, metal, tint, tile, rank, y0, y1, half):
    # Piers under the pyramid. The dark pane sits just behind them, not at the
    # back of a two-metre slot, or a three-quarter view only sees stone cheeks.
    step, pier = 3.6, 0.92
    height = y1 - y0
    xs = []
    x = -(half - 2.2)
    while x <= half - 2.1:
        xs.append(round(x, 3))
        x += step
    for face, outward in ((half, 1), (-half, -1)):
        cz, d = _span_z(face, outward, 0.02, 0.95)
        _rec(parts, 0, cz, y0, (half - 1.2) * 2, d, height)
        for x in xs:
            _body(x, cz, y0, pier, d, height, tint, tile, kit.body)
    zs = []
    z = -(half - 2.2)
    while z <= half - 2.1:
        zs.append(round(z, 3))
        z += step
    for face, outward in ((half, 1), (-half, -1)):
        cx, w = _span_x(face, outward, 0.02, 0.95)
        _rec(parts, cx, 0, y0, w, (half - 1.2) * 2, height)
        for z in zs:
            _body(cx, z, y0, w, pier, height, tint, tile, kit.body)
    if rank < 1:
        return
    gap = step - pier
    pane_w = gap + 0.24
    warm = _warm_glass()
    for i in range(len(xs) - 1):
        mid = (xs[i] + xs[i + 1]) * 0.5
        pane = warm if i % 5 == 1 else kit.glass
        for face, outward in ((half, 1), (-half, -1)):
            cz, d = _span_z(face, outward, 0.42, 0.78)
            _glass(mid, cz, y0 + 0.35, pane_w, d, height - 0.7, pane)
    for i in range(len(zs) - 1):
        mid = (zs[i] + zs[i + 1]) * 0.5
        pane = warm if i % 5 == 3 else kit.glass
        for face, outward in ((half, 1), (-half, -1)):
            cx, w = _span_x(face, outward, 0.42, 0.78)
            _glass(cx, mid, y0 + 0.35, w, pane_w, height - 0.7, pane)


# ---------------------------------------------------------------- Wallace
# Ashlar on a battered pyramid. Street courses are exact 3.6 m storeys.
# A few vertical joints are grouped and they stop at the ledges, so the face
# is not one flute from the base to the lantern.
PY_H = 3500.0
PY_BASE = 3200.0
PY_TOP = 420.0
APEX = min(220.0, PY_H * 0.06)
TIP = 3610.0
BODY_Y = PY_H - APEX
N_LEDGE = 0
LEDGE = 0.0
PORTAL_W = 360.0
PORTAL_H = 96.0
# One flat back plane, deep enough that the jamb is a room, not a notch.
PORTAL_BACK = 72.0
# Three bundles of thin joints, the Weta miniature's parallel lines.
# One fat slot reads as a black column of blocks.
def _flute_lines():
    lines = []
    # Three bundles. Each line is wide enough to survive a full-pyramid frame.
    for center in (0.20, 0.50, 0.80):
        lines.extend((center - 0.022, center, center + 0.022))
    return tuple(round(v, 5) for v in lines)


CHANNEL_LINES = _flute_lines()
FLUTE_HALF = 0.0055
WALLACE_TILE = 120.0


def _hash(i, j=0):
    n = (int(i) * 374761393 + int(j) * 668265263) & 0xFFFFFFFF
    n = (n ^ (n >> 13)) * 1274126177 & 0xFFFFFFFF
    return ((n ^ (n >> 16)) & 255) / 255.0


def _half_at(y, cum=0.0):
    t = 0.0 if y <= 0 else 1.0 if y >= BODY_Y else y / BODY_Y
    crown = PY_TOP * 0.5 + N_LEDGE * LEDGE
    base = PY_BASE * 0.5
    return (base + (crown - base) * t) - cum


def _courses(rank):
    # Four human storeys at the door, then large ashlar. A 3.6 m bed up the whole face is a shingle.
    out = []
    y = 0.0
    for _ in range(4):
        out.append((round(y, 4), round(y + 3.6, 4), False))
        y += 3.6
    i = 0
    # Large irregular courses. A 3.6 m bed is a shingle; a 300 m band is one slab.
    base = 24.0 if rank >= 2 else (40.0 if rank == 1 else 64.0)
    while y < BODY_Y - 0.4 and i < 220:
        h = base * (0.55 + 1.25 * _hash(i, 11))
        if y < PORTAL_H < y + h:
            gap = PORTAL_H - y
            # A short remainder is not the end of the wall. Snap and keep coursing.
            if gap < 0.8:
                y = PORTAL_H
                continue
            h = gap
        if y + h > BODY_Y:
            h = BODY_Y - y
        h = round(h, 4)
        if h < 0.8:
            break
        y1 = round(y + h, 4)
        out.append((round(y, 4), y1, False))
        y = y1
        i += 1
    if out[-1][1] < BODY_Y - 0.2:
        out.append((out[-1][1], BODY_Y, False))
    return out


def _clean_u(values, pins=()):
    # Jambs and flute edges stay put. Merging them into a stone joint pulls the mouth.
    held = {round(p, 5) for p in pins if 0.0 < p < 1.0}
    vals = sorted(v for v in values if 0.0 <= v <= 1.0)
    out = [0.0]
    for v in vals:
        v = 0.0 if v < 0.0015 else 1.0 if v > 0.9985 else round(v, 5)
        if v in (0.0, 1.0):
            continue
        if v - out[-1] < 1e-6:
            continue
        if v in held:
            if out[-1] not in held and v - out[-1] < 0.0028:
                out[-1] = v
            else:
                out.append(v)
            continue
        if v - out[-1] >= 0.0028:
            out.append(v)
    if out[-1] != 1.0:
        if 1.0 - out[-1] < 0.0028 and out[-1] not in held:
            out[-1] = 1.0
        else:
            out.append(1.0)
    return out


def _splits(rank, course_i, half, y0, terrace):
    n = 22 if rank >= 2 else (12 if rank == 1 else 7)
    weights = [0.18 + _hash(course_i + 2, i + 6) * 3.1 for i in range(n)]
    total = sum(weights) or 1.0
    shift = (0.45 / n) if course_i % 2 else 0.0
    edges = []
    acc = 0.0
    for w in weights:
        edges.append((acc + shift) % 1.0)
        acc += w / total
    breaks = list(edges)
    pins = []
    if y0 <= PORTAL_H:
        half_u = (PORTAL_W * 0.5) / max(8.0, 2.0 * half)
        pins.extend((round(0.5 - half_u, 5), round(0.5 + half_u, 5)))
        breaks.extend(pins)
    if not terrace:
        for c in CHANNEL_LINES:
            breaks.extend((c - FLUTE_HALF, c + FLUTE_HALF))
            pins.extend((round(c - FLUTE_HALF, 5), round(c + FLUTE_HALF, 5)))
    return _clean_u(breaks, pins)


def _channel(um, width):
    if width > 0.016:
        return False
    for c in CHANNEL_LINES:
        if abs(um - c) <= FLUTE_HALF + 0.0004:
            return True
    return False


def _span_kind(face, u0, u1, y0, half, course_i, terrace):
    um = (u0 + u1) * 0.5
    if face == 0 and y0 < PORTAL_H:
        x0 = -half + 2.0 * half * u0
        x1 = -half + 2.0 * half * u1
        lo, hi = (x0, x1) if x0 <= x1 else (x1, x0)
        overlap = min(hi, PORTAL_W * 0.5) - max(lo, -PORTAL_W * 0.5)
        span = hi - lo
        # Only the opening itself recedes. A span that merely crosses the jamb stays stone.
        if span > 0.0 and overlap >= span - 0.4 and overlap > 0.35:
            return 'portal', -130.0
    if not terrace and _channel(um, u1 - u0):
        return 'channel', -6.0
    # Only a hairline joint. The stone between two flutes is still ashlar.
    if (u1 - u0) < 0.00045:
        return 'mortar', -0.35
    if y0 < 0.05:
        return 'podium', 0.2
    if y0 < 14.41:
        return 'stone', 0.22
    # Flush ashlar. A proud course is a brick, and the paint carries the joint.
    return 'stone', 0.0


def _spans_for(rank, course_i, half, y0, terrace):
    us = _splits(rank, course_i, half, y0, terrace)
    faces = []
    for face in range(4):
        row = []
        for u0, u1 in zip(us, us[1:]):
            kind, relief = _span_kind(face, u0, u1, y0, half, course_i, terrace)
            row.append((u0, u1, relief, kind))
        faces.append(row)
    return faces


def _xyz(face, half, u, relief):
    if face == 0:
        if relief < -40.0:
            return -half + 2 * half * u, -(PY_BASE * 0.5 - PORTAL_BACK)
        return -half + 2 * half * u, -(half + relief)
    if face == 1:
        return half + relief, -half + 2 * half * u
    if face == 2:
        return half - 2 * half * u, half + relief
    return -(half + relief), half - 2 * half * u


def _co(face, y, half, u, relief):
    x, z = _xyz(face, half, u, relief)
    return (x, -z, y)


def _rgb(kind, course_i, stone_i, face):
    if kind == 'channel':
        return (0.07, 0.075, 0.08)
    if kind == 'portal':
        # Darker and warmer than the face. The same tint as the wall reads as no mouth.
        return (0.22, 0.16, 0.11)
    if kind == 'mortar':
        return (0.16, 0.17, 0.18)
    if kind == 'ledge':
        return (0.78, 0.80, 0.82)
    if kind == 'podium' or (kind == 'stone' and course_i < 4):
        # Alternate the four street courses so a 3.6 m floor reads at the door.
        tone = 0.82 if course_i % 2 == 0 else 0.48
        return (tone, tone * 0.97, tone * 0.92)
    tone = 0.70 + 0.16 * _hash(course_i * 3 + face * 17, stone_i * 5 + 2)
    if _hash(course_i + 4, stone_i + 9) > 0.82:
        tone *= 0.78
    return (tone, tone * 0.97, tone * 0.90)


def _paint_face(face, layer, rgb):
    if face is None:
        return
    for loop in face.loops:
        loop[layer] = (*rgb, 1.0)


def _tri(bm, layer, a, b, c, rgb):
    if a == b or b == c or a == c:
        return
    try:
        face = bm.faces.new((a, b, c))
    except ValueError:
        return
    _paint_face(face, layer, rgb)


def _quad(bm, layer, verts, rgb):
    uniq = []
    for v in verts:
        if v not in uniq:
            uniq.append(v)
    if len(uniq) < 3:
        return
    if len(uniq) == 3:
        _tri(bm, layer, uniq[0], uniq[1], uniq[2], rgb)
        return
    try:
        face = bm.faces.new(tuple(uniq))
    except ValueError:
        return
    _paint_face(face, layer, rgb)


def _stitch(bm, layer, lower, upper, rgb):
    if len(lower) < 2 or len(upper) < 2:
        return
    A = list(lower) + [(lower[0][0] + 4.0, lower[0][1])]
    B = list(upper) + [(upper[0][0] + 4.0, upper[0][1])]
    i = j = 0
    guard = 0
    limit = (len(A) + len(B)) * 3
    while (i < len(A) - 1 or j < len(B) - 1) and guard < limit:
        guard += 1
        a_next = A[i + 1][0] if i < len(A) - 1 else 1e9
        b_next = B[j + 1][0] if j < len(B) - 1 else 1e9
        if i < len(A) - 1 and a_next <= b_next + 1e-9:
            _tri(bm, layer, A[i][1], A[i + 1][1], B[j][1], rgb)
            i += 1
        elif j < len(B) - 1:
            _tri(bm, layer, A[i][1], B[j + 1][1], B[j][1], rgb)
            j += 1
        else:
            break


def _course_shell(bm, layer, y0, y1, half0, half1, spans, course_i):
    lower = []
    upper = []
    first = [None] * 4
    last = [None] * 4
    for face, row in enumerate(spans):
        prev = None
        stone_i = 0
        for u0, u1, relief, kind in row:
            b0 = bm.verts.new(_co(face, y0, half0, u0, relief))
            b1 = bm.verts.new(_co(face, y0, half0, u1, relief))
            t0 = bm.verts.new(_co(face, y1, half1, u0, relief))
            t1 = bm.verts.new(_co(face, y1, half1, u1, relief))
            _quad(bm, layer, (b0, b1, t1, t0), _rgb(kind, course_i, stone_i, face))
            if prev is None:
                first[face] = (b0, t0)
            else:
                pb, pt = prev
                _quad(bm, layer, (pb, b0, t0, pt), _rgb('mortar', course_i, stone_i, face))
            prev = (b1, t1)
            lower.append((face + u0, b0))
            lower.append((face + u1, b1))
            upper.append((face + u0, t0))
            upper.append((face + u1, t1))
            if kind == 'stone' or kind == 'podium':
                stone_i += 1
        last[face] = prev
    for face in range(4):
        nxt = (face + 1) % 4
        if last[face] is None or first[nxt] is None:
            continue
        pb, pt = last[face]
        nb, nt = first[nxt]
        _quad(bm, layer, (pb, nb, nt, pt), _rgb('mortar', course_i, 0, face))
    return lower, upper


def _cum_before(courses, index):
    cum = 0.0
    for i, (_y0, _y1, terrace) in enumerate(courses):
        if i == index:
            return cum
        if terrace:
            cum += LEDGE
    return cum


def build_wallace(kit, rank):
    begin_detail()
    courses = _courses(rank)
    print('wallace courses', len(courses), 'street', courses[:4], 'portal end', PORTAL_H, flush=True)
    bm = bmesh.new()
    layer = bm.loops.layers.color.new('Col')
    parts = []
    prev = None
    max_relief = 10.0
    for i, (y0, y1, terrace) in enumerate(courses):
        cum = _cum_before(courses, i)
        half0 = _half_at(y0, cum)
        half1 = _half_at(y1, cum)
        spans = _spans_for(rank, i, half0, y0, terrace)
        lower, upper = _course_shell(bm, layer, y0, y1, half0, half1, spans, i)
        if prev is not None:
            _stitch(bm, layer, prev, lower, _rgb('mortar', i, 0, 0))
        else:
            center = bm.verts.new((0.0, 0.0, 0.0))
            loop = lower + [(lower[0][0] + 4.0, lower[0][1])]
            for ( _t0, v0), (_t1, v1) in zip(loop, loop[1:]):
                _tri(bm, layer, v0, v1, center, _rgb('podium', 0, 0, 0))
        prev = upper
        outer = max(half0, half1) + max_relief
        _rec(parts, 0, 0, y0, outer * 2, outer * 2, max(0.5, y1 - y0) + 0.8)
        if i % 15 == 0:
            print('wallace course', i, y0, 'terrace' if terrace else '', flush=True)

    # Flat crown, then a short lantern roof. A 320 m taper reads as a pointed hat.
    apex = _half_at(BODY_Y, 0.0)
    flat_top_y = BODY_Y + (TIP - BODY_Y) * 0.72
    cap = []
    flat_steps = 4
    for i in range(flat_steps):
        y0 = BODY_Y + (flat_top_y - BODY_Y) * i / flat_steps
        y1 = BODY_Y + (flat_top_y - BODY_Y) * (i + 1) / flat_steps
        h0 = apex + (176.0 - apex) * i / flat_steps
        h1 = apex + (176.0 - apex) * (i + 1) / flat_steps
        cap.append((y0, y1, h0, h1))
    roof_steps = 2
    for i in range(roof_steps):
        y0 = flat_top_y + (TIP - flat_top_y) * i / roof_steps
        y1 = TIP if i == roof_steps - 1 else flat_top_y + (TIP - flat_top_y) * (i + 1) / roof_steps
        h0 = 176.0 + (42.0 - 176.0) * i / roof_steps
        h1 = 176.0 + (42.0 - 176.0) * (i + 1) / roof_steps
        cap.append((y0, y1, h0, h1))
    for j, (y0, y1, half0, half1) in enumerate(cap):
        spans = [[(0.0, 0.5, 0.15, 'stone'), (0.5, 1.0, 0.15, 'stone')] for _ in range(4)]
        lower, upper = _course_shell(bm, layer, y0, y1, half0, half1, spans, 400 + j)
        if prev is not None:
            _stitch(bm, layer, prev, lower, _rgb('ledge', 400 + j, 0, 0))
        prev = upper
        _rec(parts, 0, 0, y0, max(half0, half1) * 2 + 30.0, max(half0, half1) * 2 + 30.0, (y1 - y0) + 1.0)
    tip = bm.verts.new((0.0, 0.0, TIP))
    if prev:
        loop = prev + [(prev[0][0] + 4.0, prev[0][1])]
        for (_t0, v0), (_t1, v1) in zip(loop, loop[1:]):
            _tri(bm, layer, v0, v1, tip, _rgb('stone', 500, 0, 0))

    # Course stitches that jump the mouth become blades. The back wall and the jambs stay.
    blades = []
    for face in bm.faces:
        xs = [v.co.x for v in face.verts]
        ys = [v.co.z for v in face.verts]
        zs = [-v.co.y for v in face.verts]
        if max(ys) > PORTAL_H + 1.0:
            continue
        cx = (min(xs) + max(xs)) * 0.5
        cz = (min(zs) + max(zs)) * 0.5
        if abs(cx) > 520.0 or cz < -1680.0 or cz > -1480.0:
            continue
        if max(xs) - min(xs) > 28.0 and max(zs) - min(zs) > 18.0:
            blades.append(face)
    if blades:
        bmesh.ops.delete(bm, geom=blades, context='FACES')
        print('wallace mouth blades', len(blades), flush=True)
    loose = sum(1 for e in bm.edges if not e.is_manifold)
    print('wallace edges', len(bm.edges), 'open', loose, flush=True)
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    ob = H.mesh_of(bm, 'wallace')
    for poly in ob.data.polygons:
        poly.use_smooth = False
    cols = ob.data.color_attributes.get('Col')
    if cols is not None:
        ob.data.color_attributes.active_color = cols
    else:
        print('wallace colour missing', flush=True)
    print('wallace shell', len(ob.data.polygons), 'faces', flush=True)
    ob.data.materials.clear()
    ob.data.materials.append(kit.body)
    H.project_uvs(ob, WALLACE_TILE)
    _seat_lights(kit, ob, rank)
    flush_detail()
    return {
        'parts': parts,
        'flight': None,
        'doorClearM': None,
        'heightTip': TIP,
        'heightRoof': PY_H,
        'door': None,
        'portal': {'w': PORTAL_W, 'h': PORTAL_H, 'z': -(PY_BASE * 0.5 + 1.5)},
        'plinthH': 3.6,
        'stepH': 3.6,
        'apex': APEX,
    }


def _portal_glow(rank):
    from kit.parts import _principled
    # Low keeps the mouth and drops the bloom. High stays under a clip.
    strength = 0.05 if rank < 1 else 0.55
    return _principled('portal-glow', (0.08, 0.028, 0.01), 0.85, 0.0, (0.62, 0.24, 0.06), strength)


def _tip_lamp():
    from kit.parts import _principled
    return _principled('light-amber', (0.02, 0.008, 0.0), 0.0, 0.4, (0.85, 0.38, 0.08), 0.45)


def _seat_lights(kit, ob, rank):
    # The +Z face centroid sits on a recess vertex. That sample is the touch.
    best = None
    best_d = 1e9
    for v in ob.data.vertices:
        x, z, y = v.co.x, -v.co.y, v.co.z
        if z > -1320.0 or z < -1680.0 or y < 3.0 or y > PORTAL_H + 6.0 or abs(x) > PORTAL_W * 0.55:
            continue
        d = abs(x) * 1.4 + abs(y - 40.0)
        if d < best_d:
            best_d = d
            best = (x, y, z)
    if best is None:
        raise RuntimeError('portal recess has no vertex to seat the throat')
    _vx, cy, cz = best
    # Centre the throat in the mouth. A vertex on one jamb is not the middle.
    cx = 0.0 if abs(_vx) > 8.0 else _vx
    # A human door on the floor of the monumental mouth. A glow whose
    # sill sits near 9 m reads as a ledge with no storey line under it.
    depth = 16.0
    width = 7.2
    height = 4.2
    back_z = -(PY_BASE * 0.5 - PORTAL_BACK)
    throat = H.make_box(
        'throat', 0.0, back_z - 0.06 + depth * 0.5, 0.2,
        width, depth, height,
    )
    throat.data.materials.append(_portal_glow(rank))
    print('portal seat', best, 'size', width, depth, height, flush=True)
    if rank >= 1:
        # A point on the tip. The 210 m lantern cube is not this building.
        # Top face sits on the tip vertex. The box must not rise past the published tip.
        beacon = H.make_box('beacon', 0, 0, TIP - 2.2, 2.2, 2.2, 2.2)
        beacon.data.materials.append(_tip_lamp())
