#!/usr/bin/env python3
"""Headless landmark meshes for LAPD HQ, City Hall and the Wallace pyramid.

Metres, landmark space (+X right, +Y up, +Z depth). Blender is Z-up, so a
landmark point (x, y, z) is stored as (x, -z, y) and the glTF exporter's Y-up
conversion puts it back. Structural boxes are EXACT-booleaned into one shell
so stairs, pads and the door jambs are not loose plates. The kit in
tools/model-harness/kit dresses vents, lamps, seams and decals. No third-party
mesh is imported.

  blender --background --python tools/model-harness/blender/build_landmarks.py -- --only lapd --lod low
"""
import json
import math
import os
import subprocess
import sys

import bmesh
import bpy
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
HARNESS = os.path.dirname(HERE)
ROOT = os.path.dirname(os.path.dirname(HARNESS))
sys.path.insert(0, HARNESS)

from kit.parts import Kit  # noqa: E402

MAPS = os.path.join(HARNESS, '.rounds', 'maps')
OUT_DIR = os.path.join(ROOT, 'public', 'models', 'landmarks')
SIL_DIR = os.path.join(HARNESS, 'silhouettes')

# F1 planFlight, copied so the flight matches src/world/architecture/scale.ts.
RISE_MIN, RISE_MAX, RISE_TARGET = 0.15, 0.18, 0.17
TREAD_MIN, TREAD_MAX = 0.28, 0.32
BLONDEL = 0.63
PERSON = 1.8
DOOR_H = 2.2
RAIL_H = 1.05
STOREY = 3.6


def plan_flight(total_rise):
    span = max(0.05, total_rise)
    risers = max(1, round(span / RISE_TARGET))
    rise = span / risers
    if rise > RISE_MAX:
        risers = max(1, math.ceil(span / RISE_MAX - 1e-9))
    if rise < RISE_MIN and span >= RISE_MIN:
        risers = max(1, math.floor(span / RISE_MIN))
    rise = span / risers
    tread = BLONDEL - 2 * rise
    tread = min(TREAD_MAX, max(TREAD_MIN, tread))
    tread = round(tread / 0.01) * 0.01
    return {'risers': risers, 'rise': rise, 'tread': tread, 'run': risers * tread}


def link(obj):
    bpy.context.scene.collection.objects.link(obj)
    return obj


def mesh_of(bm, name):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    return link(ob)


def make_box(name, cx, cz, y, w, d, h):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, verts=list(bm.verts), vec=(w, d, h))
    bmesh.ops.translate(bm, verts=list(bm.verts), vec=(cx, -cz, y + h * 0.5))
    return mesh_of(bm, name)


def make_frustum(name, cx, cz, y, w0, d0, w1, d1, h):
    bm = bmesh.new()

    def ring(yy, w, d):
        hw, hd = w * 0.5, d * 0.5
        return [bm.verts.new(p) for p in (
            (cx - hw, -(cz - hd), yy),
            (cx + hw, -(cz - hd), yy),
            (cx + hw, -(cz + hd), yy),
            (cx - hw, -(cz + hd), yy),
        )]

    bottom = ring(y, w0, d0)
    top = ring(y + h, w1, d1)
    bm.faces.new(list(reversed(bottom)))
    bm.faces.new(top)
    for i in range(4):
        j = (i + 1) % 4
        bm.faces.new((bottom[i], bottom[j], top[j], top[i]))
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    return mesh_of(bm, name)


def _object_mode():
    if bpy.context.mode != 'OBJECT':
        bpy.ops.object.mode_set(mode='OBJECT')


def bool_op(host, other, operation):
    _object_mode()
    mod = host.modifiers.new('bool', 'BOOLEAN')
    mod.operation = operation
    mod.solver = 'EXACT'
    mod.object = other
    bpy.context.view_layer.objects.active = host
    host.select_set(True)
    bpy.ops.object.modifier_apply(modifier=mod.name)
    bpy.data.objects.remove(other, do_unlink=True)
    host.select_set(False)
    return host


def unite(objs, mat=None):
    host = objs[0]
    if mat is not None:
        host.data.materials.clear()
        host.data.materials.append(mat)
    for other in objs[1:]:
        if mat is not None:
            other.data.materials.clear()
            other.data.materials.append(mat)
        bool_op(host, other, 'UNION')
    return host


class Mass:
    """Positive solids, then cutters. Parts feed the stray silhouette."""

    def __init__(self):
        self.solids = []
        self.parts = []

    def box(self, cx, cz, y, w, d, h, record=True):
        if w < 0.08 or d < 0.08 or h < 0.08:
            return None
        ob = make_box(f'solid-{len(self.solids)}', cx, cz, y, w, d, h)
        self.solids.append(ob)
        if record:
            self.parts.append({'type': 'box', 'cx': cx, 'cz': cz, 'y': y, 'w': w, 'd': d, 'h': h})
        return ob

    def frustum(self, cx, cz, y, w0, d0, w1, d1, h, record=True):
        ob = make_frustum(f'frustum-{len(self.solids)}', cx, cz, y, w0, d0, w1, d1, h)
        self.solids.append(ob)
        if record:
            self.parts.append({
                'type': 'frustum', 'cx': cx, 'cz': cz, 'y': y,
                'w0': w0, 'd0': d0, 'w1': w1, 'd1': d1, 'h': h,
            })
        return ob

    def fuse(self):
        if not self.solids:
            raise RuntimeError('no solids')
        host = unite(self.solids)
        self.solids = [host]
        return host

    def cut(self, cx, cz, y, w, d, h):
        cutter = make_box('cut', cx, cz, y, w, d, h)
        bool_op(self.solids[0], cutter, 'DIFFERENCE')
        return self.solids[0]


def project_uvs(obj, tile):
    me = obj.data
    if not me.uv_layers:
        me.uv_layers.new(name='UVMap')
    uv = me.uv_layers.active.data
    for poly in me.polygons:
        normal = poly.normal
        axes = sorted((0, 1, 2), key=lambda i: abs(normal[i]))
        u_axis, v_axis = axes[0], axes[1]
        for li in poly.loop_indices:
            co = me.vertices[me.loops[li].vertex_index].co
            uv[li].uv = (co[u_axis] / tile, co[v_axis] / tile)


def paint_corners(obj, tint):
    me = obj.data
    attr = me.color_attributes.new(name='Col', type='BYTE_COLOR', domain='CORNER')
    me.color_attributes.active_color = attr
    for poly in me.polygons:
        for li in poly.loop_indices:
            co = me.vertices[me.loops[li].vertex_index].co
            # Blender (x, y, z) = landmark (x, -z, y).
            col = tint(co.x, co.z, -co.y)
            attr.data[li].color = (col[0], col[1], col[2], 1.0)
    for poly in me.polygons:
        poly.use_smooth = False


def finish_shell(obj, mat, tint, tile=16.0):
    obj.data.materials.clear()
    obj.data.materials.append(mat)
    project_uvs(obj, tile)
    paint_corners(obj, tint)
    return obj


def gap_at(obj, point):
    hit, loc, _normal, _idx = obj.closest_point_on_mesh(Vector(point))
    if not hit:
        return None
    return (Vector(point) - loc).length


def bake_meshes(kind):
    """World-space meshes. Kit parts inherit the shell tint so a missing colour is not black."""
    tint = {'lapd': tint_lapd, 'hall': tint_hall, 'wallace': tint_wallace}[kind]
    _object_mode()
    meshes = [obj for obj in list(bpy.context.scene.objects) if obj.type == 'MESH']
    for obj in meshes:
        world = obj.matrix_world.copy()
        obj.parent = None
        obj.matrix_world = world
        bpy.ops.object.select_all(action='DESELECT')
        obj.select_set(True)
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
        obj.select_set(False)
        uses_body = any(slot and slot.name == 'body' for slot in obj.data.materials)
        if uses_body and obj.data.color_attributes.get('Col') is None:
            paint_corners(obj, tint)


def wire_maps(mat, size, kind):
    nt = mat.node_tree
    bsdf = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
    bsdf.inputs['Base Color'].default_value = (1, 1, 1, 1)
    bsdf.inputs['Metallic'].default_value = 0.02
    bsdf.inputs['Roughness'].default_value = 1.0

    def tex(path, noncolor):
        node = nt.nodes.new('ShaderNodeTexImage')
        image = bpy.data.images.load(path)
        image.colorspace_settings.name = 'Non-Color' if noncolor else 'sRGB'
        node.image = image
        return node

    alb = tex(os.path.join(MAPS, f'{kind}-albedo-{size}.jpg'), False)
    # glTF only keeps a vertex colour that reaches Base Color through a Mix
    # (RGBA, MULTIPLY) or a direct Vertex Color node. A Vector Math node is dropped.
    tint = nt.nodes.new('ShaderNodeVertexColor')
    tint.layer_name = 'Col'
    mix = nt.nodes.new('ShaderNodeMix')
    mix.data_type = 'RGBA'
    mix.blend_type = 'MULTIPLY'
    factor = mix.inputs.get('Factor')
    if factor is not None and not factor.is_linked:
        factor.default_value = 1.0
    nt.links.new(alb.outputs['Color'], mix.inputs[6])
    nt.links.new(tint.outputs['Color'], mix.inputs[7])
    nt.links.new(mix.outputs[2], bsdf.inputs['Base Color'])
    nrm = tex(os.path.join(MAPS, f'{kind}-normal-{size}.png'), True)
    nmap = nt.nodes.new('ShaderNodeNormalMap')
    # Limestone beds stay shallow. Ashlar joints need enough relief to catch the rim.
    nmap.inputs['Strength'].default_value = {'lapd': 0.9, 'hall': 0.7, 'wallace': 1.2}[kind]
    nt.links.new(nrm.outputs['Color'], nmap.inputs['Color'])
    nt.links.new(nmap.outputs['Normal'], bsdf.inputs['Normal'])
    rg = tex(os.path.join(MAPS, f'{kind}-rough-{size}.jpg'), True)
    nt.links.new(rg.outputs['Color'], bsdf.inputs['Roughness'])


def wire_decal(mat, path):
    nt = mat.node_tree
    bsdf = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
    bsdf.inputs['Base Color'].default_value = (1, 1, 1, 1)
    node = nt.nodes.new('ShaderNodeTexImage')
    image = bpy.data.images.load(path)
    node.image = image
    nt.links.new(node.outputs['Color'], bsdf.inputs['Base Color'])


def uv_card(obj):
    me = obj.data
    if not me.uv_layers:
        me.uv_layers.new(name='UVMap')
    uv = me.uv_layers.active.data
    for poly in me.polygons:
        if poly.normal.z < 0.8:
            for li in poly.loop_indices:
                uv[li].uv = (0.0, 0.0)
            continue
        xs, ys = [], []
        for li in poly.loop_indices:
            co = me.vertices[me.loops[li].vertex_index].co
            xs.append(co.x)
            ys.append(co.y)
        min_x, max_x = min(xs), max(xs)
        min_y, max_y = min(ys), max(ys)
        for li in poly.loop_indices:
            co = me.vertices[me.loops[li].vertex_index].co
            u = (co.x - min_x) / max(1e-6, max_x - min_x)
            v = (co.y - min_y) / max(1e-6, max_y - min_y)
            uv[li].uv = (u, v)


def bl_normal(nx, ny, nz):
    return Vector((nx, -nz, ny))


def bl_point(x, y, z):
    return Vector((x, -z, y))


def place_lamp(kit, name, x, y, z, normal, length, height, kind):
    # The depth edge is centred on the face, so a sample sits on the shell.
    part = kit.light_strip(name, length, height, 0.24, kind, bezel=kit.recess)
    kit.place(part, bl_point(x, y, z), normal=bl_normal(*normal), lift=-0.12)


def place_vent(kit, name, x, y, z, normal, w, h):
    depth = 0.24
    part = kit.vent(name, w, h, depth, slats=4, inset=True)
    # Cavity ends at 0.85 of the depth. This lift leaves that outer face 1 cm
    # proud, so a sample sits on the shell. The fins and the rim cross it too.
    kit.place(part, bl_point(x, y, z), normal=bl_normal(*normal), lift=-depth * 0.85 + 0.01)


def place_greeble(kit, name, x, y, z, normal, seed):
    part = kit.greeble_cluster(name, 7.5, 9.0, 0.42, 5, seed)
    kit.place(part, bl_point(x, y, z), normal=bl_normal(*normal), lift=0.0)


def place_seam(kit, name, x, y, z, normal, length):
    part = kit.seam(name, length, width=0.14, depth=0.03)
    kit.place(part, bl_point(x, y, z), normal=bl_normal(*normal), lift=0.0)


def place_decal(kit, name, x, y, z, normal, sx, sy, z_scale=18, lift=-0.03):
    part = kit.livery_decal(name, 0.92, 0.28)
    uv_card(part.meshes[0])
    # Card is 0.92 x 0.28 x 0.004. Scale brings it to building size.
    # The card straddles the face so a quantized shell still touches it.
    kit.place(part, bl_point(x, y, z), normal=bl_normal(*normal), scale=(sx, sy, z_scale), lift=lift)


def add_stairs(mass, z0, z1, y0, y1, n, width, rail=True):
    run = (z1 - z0) / n
    rise = (y1 - y0) / n
    for i in range(n):
        z = z0 + run * (i + 0.5)
        # 2 cm of overlap so the treads are one shell, not a stack of plates.
        mass.box(0, z, y0 + rise * i - 0.01, width, abs(run) + 0.02, rise + 0.012, record=False)
    span_z = (z0 + z1) * 0.5
    span_d = abs(z1 - z0) + 0.4
    extra = 1.3 if rail else 0.2
    mass.parts.append({
        'type': 'box', 'cx': 0, 'cz': span_z, 'y': y0,
        'w': width + extra * 2, 'd': span_d, 'h': (y1 + (RAIL_H if rail else 0)) - y0,
    })
    if rail:
        for side in (-1, 1):
            # 15 cm into the treads. A rail that only meets the tread edge
            # stays a second shell after the boolean.
            mass.box(side * (width * 0.5 + 0.15), span_z, 0, 0.7, span_d, y1 + RAIL_H, record=False)
    # Bite the host so a flight that ends on the face is one shell.
    mass.box(0, z1, y1 - 0.25, width, 1.4, 0.5, record=False)


def glass_box(cx, cz, y, w, d, h, mat):
    ob = make_box('glass', cx, cz, y, w, d, h)
    ob.data.materials.append(mat)
    return ob


def curtain_z(mat, face_z, outward, x0, x1, y0, y1, slot_h, pitch, sink=0.0):
    """Horizontal slots on a z=constant wall. Each pane straddles the stone."""
    sign = -1 if outward < 0 else 1
    thick = 0.1
    # sink moves the pane into a reveal. The back of the pane still meets the cut.
    cz = face_z + sign * 0.01 - sign * sink
    y = y0
    guard = 0
    while y + slot_h <= y1 + 0.01 and guard < 40:
        glass_box((x0 + x1) * 0.5, cz, y, x1 - x0, thick, slot_h, mat)
        y += pitch
        guard += 1
    glass_box((x0 + x1) * 0.5, cz, y0, 0.35, thick, max(0.4, y1 - y0), mat)


def curtain_x(mat, face_x, outward, z0, z1, y0, y1, slot_h, pitch, sink=0.0):
    sign = -1 if outward < 0 else 1
    thick = 0.1
    cx = face_x + sign * 0.01 - sign * sink
    y = y0
    guard = 0
    while y + slot_h <= y1 + 0.01 and guard < 40:
        glass_box(cx, (z0 + z1) * 0.5, y, thick, z1 - z0, slot_h, mat)
        y += pitch
        guard += 1
    glass_box(cx, (z0 + z1) * 0.5, y0, thick, 0.35, max(0.4, y1 - y0), mat)


def slits_z(mat, face_z, outward, xs, y0, height, slit_w, sink=0.0):
    sign = -1 if outward < 0 else 1
    cz = face_z + sign * 0.01 - sign * sink
    for x in xs:
        glass_box(x, cz, y0, slit_w, 0.1, height, mat)


def slits_x(mat, face_x, outward, zs, y0, height, slit_w, sink=0.0):
    sign = -1 if outward < 0 else 1
    cx = face_x + sign * 0.01 - sign * sink
    for z in zs:
        glass_box(cx, z, y0, 0.1, slit_w, height, mat)


# ---------------------------------------------------------------- LAPD
HQ = dict(height=216, podiumW=86, podiumD=118, podiumH=18, shaftW=72, shaftD=100,
          crownW=132, crownD=165, crownH=62, lobbyFloor=5.2, lobbyCeil=12.4,
          doorHalf=1.1, doorHead=2.2, hallHalf=7.4, pad=22, padH=0.9)
SHAFT_Y = HQ['height'] - HQ['crownH']


def _h2(ix, iy):
    n = (int(ix) * 374761393 + int(iy) * 668265263) & 0xFFFFFFFF
    n = (n ^ (n >> 13)) * 1274126177 & 0xFFFFFFFF
    return ((n ^ (n >> 16)) & 255) / 255.0


def blot(x, y, scale):
    fx, fy = x / scale, y / scale
    x0, y0 = math.floor(fx), math.floor(fy)
    tx, ty = fx - x0, fy - y0
    sx, sy = tx * tx * (3 - 2 * tx), ty * ty * (3 - 2 * ty)
    return (
        _h2(x0, y0) * (1 - sx) * (1 - sy)
        + _h2(x0 + 1, y0) * sx * (1 - sy)
        + _h2(x0, y0 + 1) * (1 - sx) * sy
        + _h2(x0 + 1, y0 + 1) * sx * sy
    )


def weather(x, y, z):
    """Large stains in metres, so the 16 m tile does not repeat as a panel."""
    return 0.90 + 0.10 * blot(x + z * 0.17, y * 0.45, 34.0)


def tint_lapd(x, y, z):
    # The sheet is already dark concrete. Tint only stains the base and the crown.
    if y > SHAFT_Y:
        tone = 0.78
    elif y < 8:
        tone = 0.70
    else:
        tone = 0.92
    tone *= weather(x, y, z)
    return (tone * 0.94, tone * 0.97, tone)


def cut_reveal_z(mass, face_z, inward, x, y, w, h, depth):
    """inward is +1 when +Z enters the stone. The cut starts just outside the face."""
    cz = face_z + inward * (depth * 0.5 - 0.04)
    mass.cut(x, cz, y, w, depth, h)


def cut_reveal_x(mass, face_x, inward, z, y, d, h, depth):
    cx = face_x + inward * (depth * 0.5 - 0.04)
    mass.cut(cx, z, y, depth, d, h)


def lapd_reveals(mass):
    depth = 1.2
    y, h, w = 30.0, 114.0, 4.8
    north, south = -HQ['shaftD'] / 2, HQ['shaftD'] / 2
    east, west = HQ['shaftW'] / 2, -HQ['shaftW'] / 2
    for x in (-18, -9, 9, 18):
        cut_reveal_z(mass, north, 1, x, y, w, h, depth)
        cut_reveal_z(mass, south, -1, x, y, w, h, depth)
    for z in (-24, -8, 8, 24):
        cut_reveal_x(mass, east, -1, z, y, w, h, depth)
        cut_reveal_x(mass, west, 1, z, y, w, h, depth)


def lapd_deck(mass):
    """Wells in the carrier deck. They stay off the mast and off the four pads."""
    y, h = HQ['height'] - 2.0, 2.5
    mass.cut(-31.5, 0, y, 55, 40, h)
    mass.cut(31.5, 0, y, 55, 40, h)
    mass.cut(0, -50, y, 28, 40, h)
    mass.cut(0, 50, y, 28, 40, h)


def lapd_courses(mass):
    """3.6 m-class joints on the entrance face, kept clear of the door leaf."""
    face = -HQ['podiumD'] / 2
    depth = 0.32
    for y in (0.4, 3.5, 9.1, 12.7, 16.15):
        cz = face + (depth * 0.5 - 0.03)
        mass.cut(0, cz, y, HQ['podiumW'] - 6, depth, 0.18)


def build_lapd(kit, rank):
    flight = plan_flight(HQ['lobbyFloor'] - 0.18)
    assert flight['risers'] == 30 and abs(flight['tread'] - 0.3) < 1e-9, flight
    z1 = -59.15
    z0 = z1 - flight['run']
    mass = Mass()
    # Podium is one block. The lobby and the leaf are cut out of it.
    mass.box(0, 0, 0, HQ['podiumW'], HQ['podiumD'], HQ['podiumH'])
    mass.box(0, 0, HQ['podiumH'] - 0.12, HQ['shaftW'], HQ['shaftD'], SHAFT_Y - HQ['podiumH'] + 0.2)
    mass.frustum(0, 0, SHAFT_Y - 0.08, HQ['shaftW'], HQ['shaftD'], HQ['crownW'], HQ['crownD'], HQ['crownH'] + 0.08)
    for lx, lz in ((-28, -38), (28, -38), (-28, 38), (28, 38)):
        mass.box(lx, lz, HQ['height'] - 0.05, HQ['pad'], HQ['pad'], HQ['padH'] + 0.05)
    # Beacon housing on the crown. A 1.4 m stick read as a loose fin.
    mast_top = HQ['height'] + HQ['padH'] + 6
    mass.box(0, 0, HQ['height'] - 0.4, 4.2, 4.2, mast_top - (HQ['height'] - 0.4), record=True)
    # Mechanical belts. They sit outside the shaft, so they are in the silhouette.
    if rank >= 1:
        mass.box(0, 0, 58, HQ['shaftW'] + 1.2, HQ['shaftD'] + 1.2, 4.2)
        mass.box(0, 0, 108, HQ['shaftW'] + 1.6, HQ['shaftD'] + 1.6, 4.6)
    add_stairs(mass, z0, z1, 0.18, HQ['lobbyFloor'], flight['risers'], 30, rail=True)
    host = mass.fuse()
    # Hall stops short of the face. The leaf cuts the remaining skin.
    mass.cut(0, -50.15, 5.22, HQ['hallHalf'] * 2 - 0.2, 16.3, HQ['lobbyCeil'] - 5.22)
    mass.cut(0, -58.55, HQ['lobbyFloor'], HQ['doorHalf'] * 2, 1.7, HQ['doorHead'])
    if rank >= 2:
        for lx in (-5.4, 5.4):
            for lz in (-56.2, -50.4, -45.2):
                mass.box(lx, lz, HQ['lobbyFloor'], 0.9, 0.9, HQ['lobbyCeil'] - HQ['lobbyFloor'] - 0.15, record=False)
        mass.fuse()
    if rank >= 1:
        lapd_reveals(mass)
        lapd_deck(mass)
        lapd_courses(mass)
    finish_shell(host, kit.body, tint_lapd)
    face = -HQ['shaftD'] / 2
    podium_face = -HQ['podiumD'] / 2
    sink = 1.13
    if rank >= 1:
        slits_z(kit.glass, face, -1, (-18, -9, 9, 18), 32, 108, 3.4, sink)
        slits_z(kit.glass, -face, 1, (-18, -9, 9, 18), 32, 108, 3.4, sink)
        slits_x(kit.glass, HQ['shaftW'] / 2, 1, (-24, -8, 8, 24), 32, 108, 3.4, sink)
        slits_x(kit.glass, -HQ['shaftW'] / 2, -1, (-24, -8, 8, 24), 32, 108, 3.4, sink)
        place_lamp(kit, 'band-door', 0, 9.2, podium_face, (0, 0, -1), 42, 1.6, 'white')
        place_lamp(kit, 'band-shaft', 0, 30, face, (0, 0, -1), 52, 2.4, 'white')
        for lx, lz in ((-28, -38), (28, -38), (-28, 38), (28, 38)):
            place_lamp(kit, f'pad-{lx}-{lz}', lx, HQ['height'] + HQ['padH'], lz - 10.2, (0, 1, 0), 18, 0.45, 'amber')
        place_lamp(kit, 'mast', 0, HQ['height'] + HQ['padH'] + 6, 0, (0, 1, 0), 2.4, 0.4, 'amber')
    if rank >= 2:
        for i, y in enumerate(range(24, 150, 12)):
            # The mechanical belts sit outside the shaft. A seam under a belt is buried.
            if 56 <= y <= 66 or 104 <= y <= 116:
                continue
            place_seam(kit, f'seam-{i}', 0, y, face, (0, 0, -1), 60)
        place_vent(kit, 'vent-a', -30, 70, face, (0, 0, -1), 6.5, 3.2)
        place_vent(kit, 'vent-b', 30, 124, face, (0, 0, -1), 6.5, 3.2)
        place_decal(kit, 'mark', 0, 14.5, podium_face, (0, 0, -1), 8, 14)
    door_clear = gap_at(host, (0, 59.15, HQ['lobbyFloor'] + 1.1))
    tread_clear = gap_at(host, (0, -(-z0 - flight['run'] * 0.5 + flight['run'] / flight['risers'] * 0.5), 0.18 + flight['rise']))
    # Landmark point on the outer tread: z near z0, y near y0.
    outer = gap_at(host, (0, -(z0 + (z1 - z0) / flight['risers'] * 0.5), 0.18 + flight['rise'] * 0.5))
    return {
        'parts': mass.parts,
        'flight': flight,
        'doorClearM': door_clear,
        'treadClearM': outer,
        'heightTip': HQ['height'] + HQ['padH'] + 6,
        'heightRoof': HQ['height'],
        'door': {'min': [-1.0, 5.35, -59.35], 'max': [1.0, 7.25, -58.85]},
        'stair': {'z0': z0, 'z1': z1, 'y0': 0.18, 'y1': HQ['lobbyFloor'], **flight, 'rail': RAIL_H, 'width': 30},
    }


# ---------------------------------------------------------------- City Hall
HALL = dict(height=138, baseW=92, baseD=62, baseH=28, shaft=34, shaftTop=100,
            neck=26, neckTop=114, pyramidTop=132, lanternTop=136)


def tint_hall(x, y, z):
    stone = y >= 27.2 and max(abs(x), abs(z)) <= 22
    if y > 132:
        return (0.95, 0.78, 0.48)
    if stone:
        # Near-white multiplier. The limestone sheet carries the colour.
        damp = 0.97 + 0.03 * blot(x + z * 0.2, y * 0.3, 28.0)
        return (0.98 * damp, 1.0 * damp, 0.97 * damp)
    grime = 0.84 if y < 6 else 1.0
    damp = weather(x, y, z)
    tone = 0.30 * grime * damp
    return (tone * 0.86, tone * 0.90, tone * 0.96)


def hall_courses(mass, face):
    depth = 0.42
    for y in (0.55, 8.4, 13.6, 19.2, 24.6):
        cz = face - (depth * 0.5 - 0.03)
        mass.cut(0, cz, y, HALL['baseW'] - 8, depth, 0.24)


def hall_bays(mass):
    """Full-height recesses between the piers, so the windows sit in stone."""
    depth = 0.48
    half = HALL['shaft'] / 2
    gaps = ((-10.6, -6.8), (-5.2, -0.8), (0.8, 5.2), (6.8, 10.6))
    y, h = 31.0, 66.0
    for a, b in gaps:
        mid = (a + b) * 0.5
        span = (b - a) - 0.15
        cut_reveal_z(mass, half, -1, mid, y, span, h, depth)
        cut_reveal_z(mass, -half, 1, mid, y, span, h, depth)
        cut_reveal_x(mass, half, -1, mid, y, span, h, depth)
        cut_reveal_x(mass, -half, 1, mid, y, span, h, depth)


def build_hall(kit, rank):
    flight = plan_flight(3.6 - 0.16)
    assert flight['risers'] == 20 and abs(flight['tread'] - 0.29) < 1e-9, flight
    z1 = 36.4
    z0 = z1 + flight['run']
    mass = Mass()
    mass.box(0, 0, 0, HALL['baseW'], HALL['baseD'], HALL['baseH'])
    mass.box(0, 0, HALL['baseH'] - 0.15, HALL['shaft'], HALL['shaft'], HALL['shaftTop'] - HALL['baseH'] + 0.25)
    mass.box(0, 0, HALL['shaftTop'] - 0.1, HALL['neck'], HALL['neck'], HALL['neckTop'] - HALL['shaftTop'] + 0.15)
    # Stepped pyramid inside the published 24 m → 4.2 m envelope.
    y0, y1 = HALL['neckTop'], HALL['pyramidTop']
    w_base, w_top = HALL['neck'] - 2, 4.2
    # Same taper on every LOD. Nine courses read as the tower crown; one block does not.
    steps = 9
    for i in range(steps):
        ya = y0 + (y1 - y0) * i / steps
        yb = y0 + (y1 - y0) * (i + 1) / steps
        w = w_base + (w_top - w_base) * (i / steps)
        mass.box(0, 0, ya - 0.08, w, w, (yb - ya) + 0.16)
    mass.box(0, 0, HALL['pyramidTop'] - 0.05, 5.5, 5.5, 2.5)
    mass.box(0, 0, HALL['pyramidTop'] + 1.8, 3.2, 3.2, HALL['height'] - HALL['pyramidTop'] - 1.8)
    if rank >= 1:
        mass.box(0, 0, HALL['baseH'] - 1.2, HALL['shaft'] + 6, HALL['shaft'] + 6, 2.4)
    # Piers on the shaft. They are inside the collar envelope at the base and
    # proud of the shaft, so the silhouette records them.
    if rank >= 2:
        shaft_h = HALL['shaftTop'] - HALL['baseH']
        for x in (-12, -6, 0, 6, 12):
            mass.box(x, HALL['shaft'] / 2 + 0.45, HALL['baseH'], 1.15, 0.9, shaft_h)
            mass.box(x, -(HALL['shaft'] / 2 + 0.45), HALL['baseH'], 1.15, 0.9, shaft_h)
        for z in (-10, -4, 4, 10):
            mass.box(HALL['shaft'] / 2 + 0.45, z, HALL['baseH'], 0.9, 1.15, shaft_h)
            mass.box(-(HALL['shaft'] / 2 + 0.45), z, HALL['baseH'], 0.9, 1.15, shaft_h)
        for lx in (-8.4, -3.1, 3.1, 8.4):
            mass.box(lx, HALL['baseD'] / 2 + 1.6, 3.6, 1.15, 1.15, 6.4)
        mass.box(0, HALL['baseD'] / 2 + 1.6, 3.6 + 6.4, 20, 1.3, 0.7)
    add_stairs(mass, z0, z1, 0.16, 3.6, flight['risers'], 22, rail=True)
    # Landing between the top tread and the door.
    mass.box(0, 34.2, 3.46, 16, 8.4, 0.2, record=True)
    host = mass.fuse()
    face = HALL['baseD'] / 2
    mass.cut(0, 28.0, 3.65, 11.6, 4.8, 6.5)
    mass.cut(0, 30.85, 3.6, 2.2, 1.8, DOOR_H)
    if rank >= 2:
        hall_courses(mass, face)
        hall_bays(mass)
    finish_shell(host, kit.body, tint_hall)
    if rank >= 1:
        pitch = STOREY if rank >= 2 else STOREY * 2
        slot_h = 2.85 if rank >= 2 else 2.4
        half = HALL['shaft'] / 2
        # Piers cover x/z = -12,-6,0,6,12. A pane whose samples land on a pier
        # never sees the shaft face. The gaps between the piers are the glass.
        gaps = ((-10.6, -6.8), (-5.2, -0.8), (0.8, 5.2), (6.8, 10.6))
        sink = 0.41 if rank >= 2 else 0.0
        for a, b in gaps:
            curtain_z(kit.glass, half, 1, a, b, 32, 96, slot_h, pitch, sink)
            curtain_z(kit.glass, -half, -1, a, b, 32, 96, slot_h, pitch, sink)
            curtain_x(kit.glass, half, 1, a, b, 32, 96, slot_h, pitch, sink)
            curtain_x(kit.glass, -half, -1, a, b, 32, 96, slot_h, pitch, sink)
        place_lamp(kit, 'hall-door', 0, 8.6, face, (0, 0, 1), 16, 0.7, 'amber')
        place_lamp(kit, 'hall-neck', 0, HALL['neckTop'] - 2.2, HALL['neck'] / 2, (0, 0, 1), HALL['neck'] - 4, 0.7, 'amber')
    if rank >= 2:
        for i, y in enumerate((6, 14, 22)):
            place_seam(kit, f'jacket-{i}', 0, y, face, (0, 0, 1), 70)
        place_decal(kit, 'fret', 0, 16.5, face, (0, 0, 1), 7, 12)
        place_vent(kit, 'hall-vent', 40, 8, face, (0, 0, 1), 4.5, 2.4)
    door_clear = gap_at(host, (0, -face, 3.6 + 1.1))
    return {
        'parts': mass.parts,
        'flight': flight,
        'doorClearM': door_clear,
        'heightTip': HALL['height'],
        'heightRoof': HALL['pyramidTop'],
        'door': {'min': [-1.0, 3.75, 30.7], 'max': [1.0, 5.65, 31.35]},
        'stair': {'z0': z0, 'z1': z1, 'y0': 0.16, 'y1': 3.6, **flight, 'rail': RAIL_H, 'width': 22},
    }


# ---------------------------------------------------------------- Wallace
# Numbers are the Stage 3 pyramid (src/districts/_shared/megatower/pyramid.ts
# and src/districts/wallace-vernon/spec.ts). The shell is the battered steps.
# Corner ribs and the old cornice boxes are not rebuilt: they broke the pyramid.
PY_H = 3500
PY_BASE = 3200
PY_TOP = 420
PY_N = 21
BATTER = 0.42
APEX = min(220, PY_H * 0.06)
STEP_H = (PY_H - APEX) / PY_N


def width_at(i):
    return PY_BASE + (PY_TOP - PY_BASE) * (i / PY_N)


def step_profile(i):
    wb = width_at(i)
    wn = width_at(i + 1)
    wt = wb - (wb - wn) * BATTER
    return i * STEP_H, (i + 1) * STEP_H, wb, wt


def tint_wallace(x, y, z):
    # Sheet is blue-grey ashlar. Large stains sit in the vertex colour so a 256 m
    # tile does not repeat as one tone across a 3 km face.
    stain = 0.84 + 0.16 * blot(x * 0.05 + z * 0.02, y * 0.012, 48.0)
    if y < 140:
        stain *= 0.86
    elif y > 3300:
        stain = min(1.0, stain * 1.06)
    tone = min(1.0, 0.98 * stain)
    return (tone * 0.96, tone * 0.99, tone)


def _joint_boxes(face, offset):
    """One channel, one box per riser, so the slots line up along the batter."""
    boxes = []
    for step in range(1, PY_N - 1):
        y0, y1, wb, wt = step_profile(step)
        t = 0.5
        half_w = (wb + (wt - wb) * t) * 0.5
        along = offset * half_w
        slot = max(42.0, half_w * 0.085)
        depth = max(16.0, half_w * 0.02)
        y = y0 + (y1 - y0) * 0.05
        h = (y1 - y0) * 0.90
        if face == 'n':
            boxes.append(make_box('j', along, -half_w + depth * 0.5 - 0.4, y, slot, depth, h))
        elif face == 's':
            boxes.append(make_box('j', along, half_w - depth * 0.5 + 0.4, y, slot, depth, h))
        elif face == 'e':
            boxes.append(make_box('j', half_w - depth * 0.5 + 0.4, along, y, depth, slot, h))
        else:
            boxes.append(make_box('j', -half_w + depth * 0.5 - 0.4, along, y, depth, slot, h))
    return boxes


def wallace_joints(mass):
    """Vertical channels on every face. A 28 m nick did not read on a 3 km pyramid."""
    host = mass.solids[0]
    for face in ('n', 's', 'e', 'w'):
        for offset in (-0.56, -0.18, 0.18, 0.56):
            cutter = unite(_joint_boxes(face, offset))
            print('joint', face, offset, flush=True)
            bool_op(host, cutter, 'DIFFERENCE')


def build_wallace(kit, rank):
    mass = Mass()
    for i in range(PY_N):
        y0, y1, wb, wt = step_profile(i)
        drop = 0.0 if i == 0 else 0.35
        mass.frustum(0, 0, y0 - drop, wb, wb, wt, wt, (y1 - y0) + drop)
    y_a = PY_H - APEX
    lantern_h = APEX * 0.36
    cap_h = APEX * 0.2
    crown_h = APEX * 0.3
    roof_h = APEX * 0.14
    cap_y = y_a + lantern_h
    crown_y = cap_y + cap_h
    roof_y = crown_y + crown_h
    mast_y = roof_y + roof_h
    mass.box(0, 0, cap_y - 0.2, PY_TOP * 1.02, PY_TOP * 1.02, cap_h + 0.2)
    mass.box(0, 0, crown_y - 0.15, PY_TOP * 0.62, PY_TOP * 0.62, crown_h + 0.15)
    mass.box(0, 0, roof_y - 0.1, PY_TOP * 0.3, PY_TOP * 0.3, roof_h + 0.1)
    # Beacon mast. A 3 m tip read as a loose spike. This obelisk is the same 110 m
    # and still sits on the roof. The strobe in the district code lands on the tip.
    mass.box(0, 0, mast_y - 6, 36, 36, 18)
    mass.frustum(0, 0, mast_y + 10, 18, 18, 10, 10, 100)
    # The lantern bay is a gap. Posts carry the cap so the apex is one shell.
    post = 48
    arm = PY_TOP * 0.42
    for sx in (-1, 1):
        for sz in (-1, 1):
            mass.box(sx * arm, sz * arm, y_a - 2, post, post, lantern_h + 8, record=True)
    half = PY_BASE / 2
    portal_w = PY_BASE * 0.09
    portal_h = STEP_H * 1.25
    # Pylons, lintel and plinth match buildPyramid so the beacons still sit on them.
    for s in (-1, 1):
        mass.box(s * (portal_w / 2 + 30), -(half + 40), 0, 60, 80, portal_h * 1.55)
    mass.box(0, -(half + 40), portal_h, portal_w + 120, 80, 36)
    # The 3 m plinth stays on the plaza mesh. A copy in this shell sat 40 m off
    # the face and read as a loose plate.
    host = mass.fuse()
    if rank >= 2:
        wallace_joints(mass)
    # 256 m tile: the ashlar blocks stay large enough to read beside the still.
    finish_shell(host, kit.body, tint_wallace, tile=256.0)
    # Bright portal. Light material, so the stray silhouette ignores it.
    # It is deep enough to read as a mouth and it intersects the stone.
    portal = make_box('portal', 0, -(half + 6), 0, portal_w * 0.92, 18, portal_h * 0.92)
    portal.data.materials.append(kit.lights['amber'])
    # Bottom vertices sit on the last terrace. Top vertices sit under the cap.
    # A box buried through the bay has no sample on either face.
    lantern = make_box('lantern', 0, 0, y_a, PY_TOP * 0.5, PY_TOP * 0.5, cap_y - y_a)
    lantern.data.materials.append(kit.lights['amber'])
    beacon = make_box('beacon', 0, 0, mast_y + 94, 8, 8, 16)
    beacon.data.materials.append(kit.lights['amber'])
    if rank >= 1:
        # Warm lip on the battered face, not on the mathematical top width.
        # The face leans in about 0.18 m per metre; a vertical box at the
        # narrow top would sit half a metre inside the stone.
        for tier in range(1, 8):
            step = tier * 3 - 1
            y0, y1, wb, wt = step_profile(step)
            y = y1 - 8.0
            t = (y - y0) / max(1e-6, y1 - y0)
            half_w = (wb + (wt - wb) * t) * 0.5
            shrink = (wb - wt) * 0.5 / max(1e-6, y1 - y0)
            length = half_w * 0.55
            place_lamp(kit, f'tier-{tier}-n', 0, y, -half_w, (0, shrink, -1), length, 6, 'amber')
            if rank >= 2:
                place_lamp(kit, f'tier-{tier}-s', 0, y, half_w, (0, shrink, 1), length, 6, 'amber')
                place_lamp(kit, f'tier-{tier}-e', half_w, y, 0, (1, shrink, 0), length, 6, 'amber')
                place_lamp(kit, f'tier-{tier}-w', -half_w, y, 0, (-1, shrink, 0), length, 6, 'amber')
    if rank >= 2:
        place_decal(kit, 'diamond', 0, portal_h + 18, -(half + 40 + 40), (0, 0, -1), 40, 80, z_scale=100, lift=-0.25)
    return {
        'parts': mass.parts,
        'flight': None,
        'doorClearM': None,
        'heightTip': mast_y + 110,
        'heightRoof': PY_H,
        'door': None,
        'portal': {'w': portal_w, 'h': portal_h, 'z': -(half + 1.5)},
        'plinthH': 3,
        'stepH': STEP_H,
        'apex': APEX,
    }


BUILDERS = {'lapd': build_lapd, 'hall': build_hall, 'wallace': build_wallace}
MAP_SIZE = {'high': 1024, 'medium': 512, 'low': 256}
RANK = {'high': 2, 'medium': 1, 'low': 0}


def gltfpack_bin():
    for cand in ('gltfpack', '/tmp/tools/gltfpack', '/usr/local/bin/gltfpack'):
        found = cand if os.sep in cand else None
        if found is None:
            from shutil import which
            found = which(cand)
        if found and os.path.isfile(found) and os.access(found, os.X_OK):
            return found
    raise SystemExit('gltfpack is not on PATH')


def export_glb(path, kind):
    bake_meshes(kind)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    raw = path + '.raw.glb'
    _object_mode()
    bpy.ops.object.select_all(action='DESELECT')
    count = 0
    for obj in bpy.context.scene.objects:
        if obj.type == 'MESH':
            obj.select_set(True)
            count += 1
    if count == 0:
        raise SystemExit('no meshes to export')
    bpy.ops.export_scene.gltf(
        filepath=raw,
        export_format='GLB',
        use_selection=True,
        export_yup=True,
        export_apply=True,
        export_cameras=False,
        export_lights=False,
        export_draco_mesh_compression_enable=False,
        export_image_format='AUTO',
        export_vertex_color='ACTIVE',
    )
    subprocess.check_call([
        gltfpack_bin(), '-i', raw, '-o', path,
        '-cc', '-km', '-kn', '-vp', '16', '-vn', '10', '-vt', '12',
    ])
    os.remove(raw)
    print('WROTE', path, os.path.getsize(path))


def bounds_of_parts(parts):
    min_x = min_y = min_z = 1e18
    max_x = max_y = max_z = -1e18
    for part in parts:
        if part['type'] == 'frustum':
            hw = max(part['w0'], part['w1']) * 0.5
            hd = max(part['d0'], part['d1']) * 0.5
            y1 = part['y'] + part['h']
        else:
            hw = part['w'] * 0.5
            hd = part['d'] * 0.5
            y1 = part['y'] + part['h']
        min_x = min(min_x, part['cx'] - hw)
        max_x = max(max_x, part['cx'] + hw)
        min_z = min(min_z, part['cz'] - hd)
        max_z = max(max_z, part['cz'] + hd)
        min_y = min(min_y, part['y'])
        max_y = max(max_y, y1)
    return {'minX': min_x, 'maxX': max_x, 'minY': min_y, 'maxY': max_y, 'minZ': min_z, 'maxZ': max_z}


def write_silhouette(kind, report):
    parts = report['parts']
    bounds = bounds_of_parts(parts)
    span = max(bounds['maxX'] - bounds['minX'], bounds['maxY'] - bounds['minY'], bounds['maxZ'] - bounds['minZ'])
    # Ortho image stays under ~900 px. The fringe allowance is two pixels,
    # because a 3 cm rule is smaller than one cell on a building.
    ppm = 900 / max(1.0, span + 16)
    if kind == 'wallace':
        ppm = min(ppm, 0.28)
    fringe = round(max(0.2, 2.0 / ppm), 3)
    dilate = 0.55
    if kind == 'wallace':
        voxel = 26
        half = 4600
        oblique_ppm = 0.045
    elif kind == 'hall':
        voxel = 1.2
        half = 180
        oblique_ppm = 1.1
    else:
        voxel = 1.8
        half = 280
        oblique_ppm = 0.7
    reason = (
        f'Orthographic cell of the {kind} envelope is {round(1 / ppm, 3)} m. '
        'A two-pixel fringe is the raster, not a spike. A part past this fringe still fails.'
    )
    justified = [{'view': view, 'maxM': fringe, 'reason': reason} for view in ('side', 'front', 'rear', 'top')]
    justified.append({
        'view': 'oblique',
        'maxM': voxel,
        'reason': (
            f'The {kind} visual hull is voxelised at {voxel} m so the rear loop stays '
            'a few million cells. The orthographic views keep the pixel fringe.'
        ),
    })
    length = max(span, report['heightTip'])
    payload = {
        'kind': kind,
        'lengthM': length,
        'ppm': round(ppm, 5),
        'dilateM': dilate,
        'pad': 8 if kind != 'wallace' else 40,
        'parts': parts,
        'bounds': bounds,
        'justified': justified,
        'oblique': {
            'ppm': oblique_ppm,
            'half': half,
            'target': [0, report['heightTip'] * 0.42, 0],
            'voxel': voxel,
            'hull': {
                'x0': bounds['minX'] - dilate,
                'x1': bounds['maxX'] + dilate,
                'y0': bounds['minY'] - 1,
                'y1': bounds['maxY'] + dilate,
                'z0': bounds['minZ'] - dilate,
                'z1': bounds['maxZ'] + dilate,
            },
        },
        'source': (
            'Structural envelope of the landmark, the same boxes the mesh is booleaned from. '
            'Film frames are perspective and are not this orthographic trace. '
            'They sit beside the turntable. No published building ortho exists.'
        ),
    }
    os.makedirs(SIL_DIR, exist_ok=True)
    path = os.path.join(SIL_DIR, f'{kind}.json')
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(payload, f)
    print('SILHOUETTE', path, 'ppm', payload['ppm'], 'fringe', fringe)
    return payload


def write_scale(kind, report, lod, tris):
    path = os.path.join(OUT_DIR, 'scale.json')
    blob = {}
    if os.path.isfile(path):
        with open(path, encoding='utf-8') as f:
            blob = json.load(f)
    prev = blob.get(kind) if isinstance(blob.get(kind), dict) else {}
    prev_tris = prev.get('tris') if isinstance(prev.get('tris'), dict) else {}
    prev_tris[lod] = tris
    flight = report.get('flight') or {}
    blob[kind] = {
        'personM': PERSON,
        'doorH': DOOR_H,
        'railH': RAIL_H,
        'storeyM': STOREY,
        'heightRoof': report['heightRoof'],
        'heightTip': report['heightTip'],
        'door': report.get('door'),
        'stair': report.get('stair'),
        'rise': flight.get('rise'),
        'tread': flight.get('tread'),
        'risers': flight.get('risers'),
        'doorClearM': report.get('doorClearM'),
        'portal': report.get('portal'),
        'stepH': report.get('stepH'),
        'apex': report.get('apex'),
        'plinthH': report.get('plinthH'),
        'tris': prev_tris,
    }
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(blob, f, indent=2)
    print('SCALE', kind, lod, 'doorClear', report.get('doorClearM'), 'tip', report['heightTip'], 'tris', tris)


def count_tris():
    total = 0
    for obj in bpy.context.scene.objects:
        if obj.type == 'MESH':
            total += len(obj.data.polygons)
    return total


def tune_glass(mat):
    """Cool office glass. The kit default is a black spinner canopy."""
    bsdf = next(n for n in mat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    bsdf.inputs['Base Color'].default_value = (0.22, 0.28, 0.34, 1.0)
    bsdf.inputs['Roughness'].default_value = 0.14
    bsdf.inputs['Metallic'].default_value = 0.38
    bsdf.inputs['Emission Color'].default_value = (0.55, 0.72, 0.92, 1.0)
    bsdf.inputs['Emission Strength'].default_value = 0.85


def build_one(kind, lod):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    size = MAP_SIZE[lod]
    albedo = os.path.join(MAPS, f'{kind}-albedo-{size}.jpg')
    if not os.path.isfile(albedo):
        subprocess.check_call(['python3', os.path.join(HERE, 'paint_landmark_maps.py'), str(size), kind])
    kit = Kit()
    tune_glass(kit.glass)
    wire_maps(kit.body, size, kind)
    wire_decal(kit.livery, os.path.join(MAPS, f'decal-{kind}.png'))
    report = BUILDERS[kind](kit, RANK[lod])
    if report.get('doorClearM') is not None and report['doorClearM'] < 0.6:
        raise SystemExit(f'{kind} door is blocked, closest stone is {report["doorClearM"]:.3f} m')
    tris = count_tris()
    export_glb(os.path.join(OUT_DIR, f'{kind}-{lod}.glb'), kind)
    if lod == 'high' or not os.path.isfile(os.path.join(SIL_DIR, f'{kind}.json')):
        write_silhouette(kind, report)
    write_scale(kind, report, lod, tris)


def main():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    only = None
    lods = ['high', 'medium', 'low']
    if '--only' in argv:
        only = argv[argv.index('--only') + 1]
    if '--lod' in argv:
        lods = [argv[argv.index('--lod') + 1]]
    kinds = [only] if only else ['lapd', 'hall', 'wallace']
    # Flight numbers the civic spec already published.
    lapd = plan_flight(5.2 - 0.18)
    hall = plan_flight(3.6 - 0.16)
    print('planFlight lapd', lapd)
    print('planFlight hall', hall)
    if lapd['risers'] != 30 or hall['risers'] != 20:
        raise SystemExit('planFlight drifted from spec.ts')
    for kind in kinds:
        for lod in lods:
            print('BUILD', kind, lod)
            build_one(kind, lod)


if __name__ == '__main__':
    main()
