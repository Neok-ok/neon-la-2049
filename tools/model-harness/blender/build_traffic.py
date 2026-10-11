# Headless ground-traffic build. Source of truth for
# public/models/traffic/{car,hauler}-{high,medium,low}.glb.
#
# Blender is Z-up, nose +Y. glTF export (y-up) maps that to three.js: nose -Z,
# height +Y, origin on the ground-contact centre. Metres. No badges, no brands.
#
#   blender --background --python tools/model-harness/blender/build_traffic.py -- \
#       --kind all --lod all --out public/models/traffic
#
# Ultra and high share the high file. Medium is the lighter dress. Low is the shell.
import json
import math
import os
import shutil
import subprocess
import sys

import bmesh
import bpy
import numpy as np
from mathutils import Matrix, Vector

HARNESS = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if HARNESS not in sys.path:
    sys.path.insert(0, HARNESS)

from kit.parts import Kit  # noqa: E402

# Legal envelopes. The mesh has to land inside these, and inside a 3.55 m lane.
# Half-width of the hauler stays inside the 1.16 m of asphalt D7 keeps between
# a driving line and the curb (CAR_HALF 0.91 + 0.25).
CAR = dict(length=4.85, width=1.78, height=1.48, wheel_r=0.33, wheel_w=0.21)
HAULER = dict(length=16.20, width=2.28, height=3.90, wheel_r=0.52, wheel_w=0.30)
LANE_W = 3.55
CURB_CLEAR = 1.16
PERSON = 1.80
DOOR_H = 2.20
DOOR_W = 1.00

SEG = {'high': 16, 'medium': 12, 'low': 8}


def link(obj):
    bpy.context.scene.collection.objects.link(obj)
    return obj


def shade(obj, angle):
    view = bpy.context.view_layer.objects
    try:
        if bpy.context.mode != 'OBJECT':
            bpy.ops.object.mode_set(mode='OBJECT')
        bpy.ops.object.select_all(action='DESELECT')
        obj.select_set(True)
        view.active = obj
        bpy.ops.object.shade_smooth_by_angle(angle=angle)
    except (RuntimeError, AttributeError, TypeError):
        for poly in obj.data.polygons:
            poly.use_smooth = True


def finish_mesh(bm, name, mat, angle):
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    if mat is not None:
        obj.data.materials.append(mat)
    link(obj)
    shade(obj, angle)
    return obj


def box(name, lo, hi, mat):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    sx = max(hi[0] - lo[0], 1e-4)
    sy = max(hi[1] - lo[1], 1e-4)
    sz = max(hi[2] - lo[2], 1e-4)
    bmesh.ops.scale(bm, verts=bm.verts, vec=(sx, sy, sz))
    bmesh.ops.translate(bm, verts=bm.verts, vec=(
        (lo[0] + hi[0]) * 0.5, (lo[1] + hi[1]) * 0.5, (lo[2] + hi[2]) * 0.5,
    ))
    return finish_mesh(bm, name, mat, math.radians(50))


def cylinder_x(name, radius, length, segments, mat, center):
    bm = bmesh.new()
    bmesh.ops.create_cone(
        bm, cap_ends=True, cap_tris=False, segments=segments,
        radius1=radius, radius2=radius, depth=length,
    )
    rot = Matrix.Rotation(math.radians(90), 4, 'Y')
    bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0), matrix=rot)
    bmesh.ops.translate(bm, verts=bm.verts, vec=center)
    return finish_mesh(bm, name, mat, math.radians(35))


def mirror_section(pts):
    out = list(pts)
    for i in range(len(pts) - 2, 0, -1):
        x, y, z = pts[i]
        out.append((-x, y, z))
    return out


def loft(sections, name, mat, angle):
    bm = bmesh.new()
    rings = [[bm.verts.new(p) for p in sec] for sec in sections]
    nring = len(rings[0])
    for i in range(len(rings) - 1):
        for k in range(nring):
            k2 = (k + 1) % nring
            try:
                bm.faces.new((rings[i][k], rings[i][k2], rings[i + 1][k2], rings[i + 1][k]))
            except ValueError:
                pass
    for cap in (rings[0], list(reversed(rings[-1]))):
        try:
            bm.faces.new(cap)
        except ValueError:
            pass
    return finish_mesh(bm, name, mat, angle)


def sedan_section(y, hw, belly, top):
    rise = max(top - belly, 1e-4)
    pts = [
        (0.0, y, top),
        (hw * 0.62, y, top - rise * 0.015),
        (hw * 0.94, y, belly + rise * 0.62),
        (hw, y, belly + rise * 0.36),
        (hw * 0.97, y, belly + rise * 0.10),
        (hw * 0.62, y, belly + rise * 0.02),
        (0.0, y, belly),
    ]
    return mirror_section(pts)


def glass_section(y, hw, base, top):
    rise = max(top - base, 1e-4)
    pts = [
        (0.0, y, top),
        (hw * 0.55, y, base + rise * 0.82),
        (hw, y, base + rise * 0.46),
        (hw * 0.72, y, base + rise * 0.04),
        (0.0, y, base),
    ]
    return mirror_section(pts)


def trailer_section(y, hw, z0, z1, chamfer):
    c = chamfer
    pts = [
        (0.0, y, z1),
        (hw - c, y, z1),
        (hw, y, z1 - c),
        (hw, y, z0 + c),
        (hw - c, y, z0),
        (0.0, y, z0),
    ]
    return mirror_section(pts)


def car_body_sections():
    half = CAR['length'] / 2
    stations = (
        (0.00, 0.38, 0.28, 0.44),
        (0.05, 0.62, 0.18, 0.62),
        (0.14, 0.78, 0.15, 0.76),
        (0.28, 0.86, 0.145, 0.86),
        (0.40, 0.89, 0.14, 0.92),
        (0.52, 0.89, 0.14, 0.98),
        (0.64, 0.88, 0.145, 0.96),
        (0.76, 0.82, 0.15, 0.86),
        (0.88, 0.68, 0.17, 0.70),
        (1.00, 0.42, 0.24, 0.50),
    )
    return [sedan_section(half - t * CAR['length'], hw, belly, top) for t, hw, belly, top in stations]


def car_glass_sections():
    half = CAR['length'] / 2
    stations = (
        (0.36, 0.42, 0.90, 1.02),
        (0.44, 0.62, 0.96, 1.30),
        (0.54, 0.70, 1.00, 1.46),
        (0.66, 0.68, 0.98, 1.45),
        (0.76, 0.48, 0.90, 1.16),
        (0.84, 0.22, 0.84, 0.96),
    )
    return [glass_section(half - t * CAR['length'], hw, base, top) for t, hw, base, top in stations]


def cab_sections():
    nose = HAULER['length'] / 2
    cab_l = 2.55
    stations = (
        (0.00, 0.48, 0.58, 0.82),
        (0.16, 0.86, 0.50, 1.25),
        (0.36, 1.02, 0.48, 1.70),
        (0.55, 1.08, 0.46, 2.20),
        (0.74, 1.08, 0.46, 3.00),
        (1.00, 1.04, 0.46, 3.18),
    )
    return [sedan_section(nose - t * cab_l, hw, belly, top) for t, hw, belly, top in stations]


def cab_glass_sections():
    nose = HAULER['length'] / 2
    cab_l = 2.55
    stations = (
        (0.34, 0.55, 1.55, 1.85),
        (0.48, 0.78, 1.70, 2.55),
        (0.62, 0.86, 1.85, 3.05),
        (0.78, 0.82, 1.90, 3.12),
        (0.92, 0.50, 1.80, 2.70),
    )
    return [glass_section(nose - t * cab_l, hw, base, top) for t, hw, base, top in stations]


def meshes():
    return [o for o in bpy.context.scene.objects if o.type == 'MESH']


def bounds_of(objs):
    mn = Vector((1e9, 1e9, 1e9))
    mx = Vector((-1e9, -1e9, -1e9))
    for obj in objs:
        for vert in obj.data.vertices:
            p = obj.matrix_world @ vert.co
            mn.x, mn.y, mn.z = min(mn.x, p.x), min(mn.y, p.y), min(mn.z, p.z)
            mx.x, mx.y, mx.z = max(mx.x, p.x), max(mx.y, p.y), max(mx.z, p.z)
    return mn, mx


def tri_count(objs):
    total = 0
    for obj in objs:
        obj.data.calc_loop_triangles()
        total += len(obj.data.loop_triangles)
    return total


def select_only(obj):
    if bpy.context.mode != 'OBJECT':
        bpy.ops.object.mode_set(mode='OBJECT')
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


def bake_world(obj):
    select_only(obj)
    if obj.parent:
        bpy.ops.object.parent_clear(type='CLEAR_KEEP_TRANSFORM')
        bpy.context.view_layer.update()
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)


def join_by_material():
    groups = {}
    for obj in meshes():
        mat = obj.data.materials[0] if obj.data.materials else None
        groups.setdefault(mat.name if mat else 'none', []).append(obj)
    for name, group in groups.items():
        select_only(group[0])
        for obj in group[1:]:
            obj.select_set(True)
        if len(group) > 1:
            bpy.ops.object.join()
        bpy.context.view_layer.objects.active.name = name


def sit(objs):
    mn, mx = bounds_of(objs)
    dx = -(mn.x + mx.x) * 0.5
    dy = -(mn.y + mx.y) * 0.5
    dz = -mn.z
    for obj in objs:
        for vert in obj.data.vertices:
            vert.co.x += dx
            vert.co.y += dy
            vert.co.z += dz
        obj.data.update()


def wheel(name, x, y, radius, width, segments, rubber, hub, detailed):
    cylinder_x(name, radius, width, segments, rubber, (x, y, radius))
    if not detailed:
        return
    cylinder_x(name + '-hub', radius * 0.42, width * 0.55, max(6, segments // 2), hub, (x, y, radius))
    # A thin disc just outside the tyre so the rim reads at 30 m.
    side = math.copysign(width * 0.5 + 0.004, x if abs(x) > 1e-4 else 1)
    cylinder_x(
        name + '-rim', radius * 0.72, 0.012, max(8, segments // 2), hub,
        (x + side, y, radius),
    )


def rubber_mat():
    mat = bpy.data.materials.new('rubber')
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = (0.012, 0.012, 0.013, 1)
    bsdf.inputs['Metallic'].default_value = 0.0
    bsdf.inputs['Roughness'].default_value = 0.72
    return mat


def place(kit, part, location, normal):
    kit.place(part, location=location, normal=normal, lift=0.0)


def place_frame(part, location, x_axis, z_axis):
    """Aim local +X and +Z when basis_quat would lay the long axis across the car.

    Kit parts keep +X horizontal. A roof normal therefore runs a belt line across
    the width, and a side normal runs a trailer rib along the trailer. Call this
    when the long axis has to be vertical or fore-aft on a horizontal face.
    """
    z = Vector(z_axis).normalized()
    x = Vector(x_axis)
    x = x - z * x.dot(z)
    if x.length < 1e-8:
        raise ValueError('x_axis parallel to z_axis')
    x.normalize()
    y = z.cross(x).normalized()
    m = Matrix((
        (x.x, y.x, z.x, 0),
        (x.y, y.y, z.y, 0),
        (x.z, y.z, z.z, 0),
        (0, 0, 0, 1),
    ))
    root = part.root
    root.rotation_mode = 'QUATERNION'
    root.rotation_quaternion = m.to_quaternion()
    root.location = Vector(location)
    return part


def trim_mat():
    """Steel line. Dark-on-dark seams disappear once the sheet is scaled down."""
    mat = bpy.data.materials.new('trim')
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = (0.55, 0.56, 0.58, 1)
    bsdf.inputs['Metallic'].default_value = 0.78
    bsdf.inputs['Roughness'].default_value = 0.34
    return mat


def emissive(name, rgb, strength):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = (0.01, 0.01, 0.012, 1)
    bsdf.inputs['Metallic'].default_value = 0.0
    bsdf.inputs['Roughness'].default_value = 0.28
    bsdf.inputs['Emission Color'].default_value = (rgb[0], rgb[1], rgb[2], 1)
    bsdf.inputs['Emission Strength'].default_value = strength
    return mat


def trim_bar(name, a, b, mat, thick=0.11, depth=0.016):
    a = Vector(a)
    b = Vector(b)
    delta = b - a
    length = delta.length
    if length < 1e-3:
        return None
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, verts=bm.verts, vec=(depth, length, thick))
    quat = delta.normalized().to_track_quat('Y', 'Z')
    bmesh.ops.rotate(bm, verts=bm.verts, cent=Vector((0, 0, 0)), matrix=quat.to_matrix().to_4x4())
    bmesh.ops.translate(bm, verts=bm.verts, vec=(a + b) * 0.5)
    return finish_mesh(bm, name, mat, math.radians(25))


def car_shoulder(sign):
    """Points on the flank, nose to tail, so one crease splits hood, side, and tail."""
    half = CAR['length'] / 2
    stations = (
        (0.06, 0.66, 0.17, 0.66),
        (0.16, 0.80, 0.15, 0.78),
        (0.32, 0.88, 0.145, 0.90),
        (0.50, 0.89, 0.14, 0.98),
        (0.66, 0.86, 0.145, 0.94),
        (0.80, 0.74, 0.155, 0.80),
        (0.92, 0.58, 0.18, 0.64),
    )
    pts = []
    for t, hw, belly, top in stations:
        y = half - t * CAR['length']
        rise = max(top - belly, 1e-4)
        # Just outside the flank. The lower body is still the widest point, so the lane width holds.
        pts.append((sign * min(0.86, hw * 0.94 + 0.02), y, belly + rise * 0.55))
    return pts


def dress_car(kit, lod):
    # Openings are large on purpose. A 4 cm blade disappears when the contact sheet is viewed whole.
    # They sit proud of the nose and the tail, still inside the 5.6 m length and the 1.82 m width.
    white = emissive('light-white', (1.0, 0.96, 0.88), 16)
    red = emissive('light-red', (1.0, 0.03, 0.015), 14)
    for sign in (-1, 1):
        hx = sign * 0.24
        box(
            f'head-pocket-{sign:+d}',
            (hx - 0.20, 2.38, 0.30),
            (hx + 0.20, 2.47, 0.56),
            kit.recess,
        )
        box(
            f'head-lamp-{sign:+d}',
            (hx - 0.13, 2.44, 0.35),
            (hx + 0.13, 2.53, 0.51),
            white,
        )
        tx = sign * 0.30
        box(
            f'tail-pocket-{sign:+d}',
            (tx - 0.11, -2.47, 0.34),
            (tx + 0.11, -2.38, 0.56),
            kit.recess,
        )
        box(
            f'tail-lamp-{sign:+d}',
            (tx - 0.07, -2.53, 0.39),
            (tx + 0.07, -2.44, 0.51),
            red,
        )
    if lod == 'low':
        return
    # Side skin is at x=±0.89. Parts grow along +Z, so their origin sits just inboard.
    place(kit, kit.light_strip('side-l', 0.36, 0.026, 0.010, 'amber'), (-0.84, -0.15, 0.52), (-1, 0, 0.08))
    place(kit, kit.light_strip('side-r', 0.36, 0.026, 0.010, 'amber'), (0.84, -0.15, 0.52), (1, 0, 0.08))
    bolts = lod == 'high'
    for name, loc, normal, w, h in (
        ('hood', (0.0, 1.20, 0.78), (0, 0.12, 1), 0.62, 0.38),
        ('door-l', (-0.84, 0.05, 0.58), (-1, 0, 0.04), 0.78, 0.36),
        ('door-r', (0.84, 0.05, 0.58), (1, 0, 0.04), 0.78, 0.36),
        ('deck', (0.0, -1.35, 0.68), (0, -0.2, 1), 0.48, 0.26),
    ):
        place(kit, kit.panel_inset(name, w, h, rim=0.028, bolts=bolts), loc, normal)
    place(kit, kit.vent('cowl', 0.28, 0.07, 0.016, 4 if lod == 'high' else 3), (0.0, 0.85, 0.90), (0, 0.15, 1))
    steel = trim_mat()
    for sign in (-1, 1):
        pts = car_shoulder(sign)
        for i in range(len(pts) - 1):
            trim_bar(f'crease-{sign:+d}-{i}', pts[i], pts[i + 1], steel)
    if lod != 'high':
        return
    place(kit, kit.intake('flank-l', 0.22, 0.08, 0.03, 3), (-0.82, 1.15, 0.46), (-1, 0.08, 0))
    place(kit, kit.intake('flank-r', 0.22, 0.08, 0.03, 3), (0.82, 1.15, 0.46), (1, 0.08, 0))
    place(kit, kit.bolt_cluster('hood-bolts', 0.16, 0.05, 4, 3), (0.0, 1.55, 0.72), (0, 0.15, 1))
    place(kit, kit.greeble_cluster('sail-l', 0.10, 0.06, 0.016, 4, 7), (-0.55, -0.7, 0.86), (-0.35, -0.1, 1))
    place(kit, kit.greeble_cluster('sail-r', 0.10, 0.06, 0.016, 4, 8), (0.55, -0.7, 0.86), (0.35, -0.1, 1))


def dress_hauler(kit, lod):
    nose = HAULER['length'] / 2 - 0.06
    tail = -HAULER['length'] / 2 + 0.06
    # Cab nose is 0.96 m wide. The blade stays inside it. The tail face is 2.28 m.
    place(kit, kit.light_strip('head', 0.78, 0.06, 0.018, 'white'), (0, nose, 0.92), (0, 1, 0.10))
    place(kit, kit.light_strip('tail', 1.70, 0.07, 0.018, 'red'), (0, tail, 1.55), (0, -1, 0.04))
    if lod == 'low':
        return
    for sign in (-1, 1):
        place(
            kit, kit.light_strip(f'marker-{sign:+d}', 0.14, 0.05, 0.016, 'amber'),
            (sign * 0.95, tail + 0.12, 3.55), (0, -1, 0.15),
        )
        place(
            kit, kit.light_strip(f'cab-marker-{sign:+d}', 0.12, 0.045, 0.014, 'amber'),
            (sign * 0.72, nose - 0.55, 2.95), (sign * 0.2, 0.15, 1),
        )
    place(kit, kit.panel_inset('cab-door-l', 0.62, 0.85, bolts=lod == 'high'), (-1.02, 6.55, 1.65), (-1, 0, 0.04))
    place(kit, kit.panel_inset('cab-door-r', 0.62, 0.85, bolts=lod == 'high'), (1.02, 6.55, 1.65), (1, 0, 0.04))
    place(kit, kit.vent('cab-vent', 0.28, 0.10, 0.018, 4 if lod == 'high' else 2), (0.0, 7.35, 1.35), (0, 0.3, 1))
    # Vertical ribs. 18 cm fore-aft so a side view at street distance sees a post, not a pixel.
    # Both ends are ordered: a negative sign would otherwise collapse the box to a hairline.
    # Outer face stays at 1.158 m, inside the 1.165 m curb clearance.
    rib_n = 8 if lod == 'high' else 4
    for i in range(rib_n):
        y = -6.2 + i * (10.2 / max(1, rib_n - 1))
        for sign in (-1, 1):
            inner, outer = sign * 1.05, sign * 1.158
            lo_x, hi_x = (inner, outer) if inner < outer else (outer, inner)
            box(
                f'rib-{sign:+d}-{i}',
                (lo_x, y - 0.09, 1.32),
                (hi_x, y + 0.09, 3.78),
                kit.recess,
            )
    place(kit, kit.panel_inset('rear-door-l', 0.85, 1.6, bolts=False), (-0.48, tail, 2.40), (0, -1, 0))
    place(kit, kit.panel_inset('rear-door-r', 0.85, 1.6, bolts=False), (0.48, tail, 2.40), (0, -1, 0))
    if lod != 'high':
        return
    place(kit, kit.bolt_cluster('fifth-bolts', 0.2, 0.08, 4, 5), (0.0, 5.15, 1.28), (0, 0, 1))
    kit.place(kit.cable(
        'gladhand',
        ((0, 0, 0), (0.05, -0.18, 0.08), (0.02, -0.36, -0.05)),
        radius=0.012,
    ), (0.55, 5.35, 1.35))
    place(kit, kit.antenna('cab-blade', 0.22, 'blade'), (0.35, 6.15, 3.16), (0, 0, 1))


def build_car(lod, kit, rubber):
    body = loft(car_body_sections(), 'car-body', kit.body, math.radians(45))
    glass = loft(car_glass_sections(), 'car-glass', kit.glass, math.radians(28))
    solid = glass.modifiers.new('Solidify', 'SOLIDIFY')
    solid.thickness = 0.012
    solid.offset = 0
    bpy.context.view_layer.objects.active = glass
    bpy.ops.object.modifier_apply(modifier=solid.name)
    seg = SEG[lod]
    r, w = CAR['wheel_r'], CAR['wheel_w']
    for y in (1.36, -1.36):
        for x in (-0.74, 0.74):
            wheel(f'wheel-{x:+.2f}-{y:+.2f}', x, y, r, w, seg, rubber, kit.recess, lod != 'low')
    # Rocker, so the gap under the doors is a sill and not a missing face.
    box('sill', (-0.78, -0.7, 0.12), (0.78, 0.7, 0.20), kit.recess)
    dress_car(kit, lod)
    return body


def build_hauler(lod, kit, rubber):
    loft(cab_sections(), 'cab', kit.body, math.radians(40))
    glass = loft(cab_glass_sections(), 'cab-glass', kit.glass, math.radians(28))
    solid = glass.modifiers.new('Solidify', 'SOLIDIFY')
    solid.thickness = 0.016
    solid.offset = 0
    bpy.context.view_layer.objects.active = glass
    bpy.ops.object.modifier_apply(modifier=solid.name)
    half = HAULER['length'] / 2
    trailer_y = (-half + 0.15, half - 2.95)
    loft(
        [trailer_section(y, 1.14, 1.22, HAULER['height'], 0.08) for y in trailer_y],
        'trailer', kit.body, math.radians(50),
    )
    # Chassis rails and a fifth-wheel plate in the gap. The trailer floor is not the road.
    for x in (-0.48, 0.48):
        box(f'rail-{x:+.2f}', (x - 0.08, -half + 0.8, 0.42), (x + 0.08, half - 1.3, 0.78), kit.recess)
    box('fifth', (-0.55, 4.85, 1.05), (0.55, 5.45, 1.28), kit.recess)
    box('bumper', (-1.05, half - 0.22, 0.45), (1.05, half - 0.02, 0.85), kit.body)
    box('underride', (-1.0, -half + 0.08, 0.42), (1.0, -half + 0.22, 0.72), kit.recess)
    seg = SEG[lod]
    r, w = HAULER['wheel_r'], HAULER['wheel_w']
    axles = (7.15, 5.85, 5.15, -5.15, -6.15)
    for y in axles:
        for x in (-0.78, 0.78):
            wheel(f'wheel-{x:+.2f}-{y:+.2f}', x, y, r, w, max(8, seg - 2), rubber, kit.recess, lod == 'high')
    if lod != 'low':
        for y in (-5.15, -6.15):
            box(f'flap-{y:+.2f}', (-0.95, y - r - 0.12, 0.15), (0.95, y - r + 0.02, 0.62), kit.recess)
    dress_hauler(kit, lod)


def world_tris(objs):
    tris = []
    for obj in objs:
        obj.data.calc_loop_triangles()
        mw = obj.matrix_world
        verts = [mw @ v.co for v in obj.data.vertices]
        for tri in obj.data.loop_triangles:
            tris.append(tuple(verts[i] for i in tri.vertices))
    return tris


def raster_tris(tris, u, v, origin, scale, nu, nv):
    mask = np.zeros((nv, nu), np.uint8)
    ou, ov = origin
    for tri in tris:
        p = np.array([[tri[0][u], tri[0][v]], [tri[1][u], tri[1][v]], [tri[2][u], tri[2][v]]], dtype=np.float64)
        area = (p[1, 0] - p[0, 0]) * (p[2, 1] - p[0, 1]) - (p[2, 0] - p[0, 0]) * (p[1, 1] - p[0, 1])
        if abs(area) < 1e-10:
            continue
        minp = np.floor((p.min(0) - (ou, ov)) / scale).astype(int)
        maxp = np.ceil((p.max(0) - (ou, ov)) / scale).astype(int)
        minp = np.clip(minp, 0, (nu - 1, nv - 1))
        maxp = np.clip(maxp, 0, (nu - 1, nv - 1))
        if minp[0] > maxp[0] or minp[1] > maxp[1]:
            continue
        xs = (np.arange(minp[0], maxp[0] + 1) + 0.5) * scale + ou
        ys = (np.arange(minp[1], maxp[1] + 1) + 0.5) * scale + ov
        gx, gy = np.meshgrid(xs, ys)
        d0 = (p[1, 0] - gx) * (p[2, 1] - gy) - (p[2, 0] - gx) * (p[1, 1] - gy)
        d1 = (p[2, 0] - gx) * (p[0, 1] - gy) - (p[0, 0] - gx) * (p[2, 1] - gy)
        d2 = (p[0, 0] - gx) * (p[1, 1] - gy) - (p[1, 0] - gx) * (p[0, 1] - gy)
        pos = (d0 >= -1e-6) & (d1 >= -1e-6) & (d2 >= -1e-6)
        neg = (d0 <= 1e-6) & (d1 <= 1e-6) & (d2 <= 1e-6)
        block = mask[minp[1]:maxp[1] + 1, minp[0]:maxp[0] + 1]
        block[pos | neg] = 1
    return mask


def fill_polygon(nu, nv, pts, origin, scale):
    mask = np.zeros((nv, nu), np.uint8)
    ou, ov = origin
    pts = np.asarray(pts, dtype=np.float64)
    n = len(pts)
    for j in range(nv):
        y = (j + 0.5) * scale + ov
        xs = []
        for i in range(n):
            x0, y0 = pts[i]
            x1, y1 = pts[(i + 1) % n]
            if (y0 <= y < y1) or (y1 <= y < y0):
                t = (y - y0) / (y1 - y0)
                xs.append(x0 + t * (x1 - x0))
        xs.sort()
        for a, b in zip(xs[0::2], xs[1::2]):
            i0 = max(0, int(math.floor((a - ou) / scale)))
            i1 = min(nu, int(math.ceil((b - ou) / scale)))
            if i1 > i0:
                mask[j, i0:i1] = 1
    return mask


def fill_circle(mask, cx, cy, radius, origin, scale):
    ou, ov = origin
    nv, nu = mask.shape
    j0 = max(0, int((cy - radius - ov) / scale))
    j1 = min(nv, int((cy + radius - ov) / scale) + 1)
    i0 = max(0, int((cx - radius - ou) / scale))
    i1 = min(nu, int((cx + radius - ou) / scale) + 1)
    r2 = radius * radius
    for j in range(j0, j1):
        y = (j + 0.5) * scale + ov
        for i in range(i0, i1):
            x = (i + 0.5) * scale + ou
            if (x - cx) ** 2 + (y - cy) ** 2 <= r2:
                mask[j, i] = 1


def iou(a, b):
    inter = np.logical_and(a, b).sum()
    union = np.logical_or(a, b).sum()
    return float(inter) / float(union) if union else 0.0


def save_mask(mask, path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    h, w = mask.shape
    img = bpy.data.images.new(os.path.basename(path), width=w, height=h, alpha=True, float_buffer=False)
    px = np.zeros(h * w * 4, dtype=np.float32)
    flat = np.flipud(mask).reshape(-1).astype(np.float32)
    px[0::4] = flat
    px[1::4] = flat
    px[2::4] = flat
    px[3::4] = 1
    img.pixels.foreach_set(px)
    img.filepath_raw = path
    img.file_format = 'PNG'
    img.save()
    bpy.data.images.remove(img)


def car_reference(length, height, width):
    """A three-box sedan envelope, independent of the loft stations."""
    half = length / 2
    side = [
        (half, 0.22 * height),
        (half * 0.82, 0.52 * height),
        (half * 0.42, 0.60 * height),
        (half * 0.18, 0.78 * height),
        (-half * 0.05, 0.98 * height),
        (-half * 0.42, 0.99 * height),
        (-half * 0.62, 0.78 * height),
        (-half * 0.82, 0.58 * height),
        (-half, 0.36 * height),
        (-half, 0.16 * height),
        (-half * 0.55, 0.14 * height),
        (half * 0.15, 0.13 * height),
        (half * 0.55, 0.14 * height),
        (half, 0.18 * height),
    ]
    top = [
        (half * 0.15, half),
        (width * 0.28, half * 0.72),
        (width * 0.50, half * 0.15),
        (width * 0.48, -half * 0.35),
        (width * 0.36, -half * 0.82),
        (width * 0.18, -half),
        (-width * 0.18, -half),
        (-width * 0.36, -half * 0.82),
        (-width * 0.48, -half * 0.35),
        (-width * 0.50, half * 0.15),
        (-width * 0.28, half * 0.72),
        (-half * 0.15, half),
    ]
    # top polygon is (x, y). front is (x, z).
    front = [
        (-width * 0.5, 0.16 * height),
        (-width * 0.5, 0.62 * height),
        (-width * 0.36, 0.78 * height),
        (-width * 0.28, 0.98 * height),
        (width * 0.28, 0.98 * height),
        (width * 0.36, 0.78 * height),
        (width * 0.5, 0.62 * height),
        (width * 0.5, 0.16 * height),
    ]
    return side, top, front


def hauler_reference(length, height, width):
    half = length / 2
    cab_back = half - 2.55
    trailer_front = half - 3.05
    side = [
        (half, 0.18 * height),
        (half, 0.28 * height),
        (half - 0.4, 0.42 * height),
        (cab_back + 0.3, 0.55 * height),
        (cab_back, 0.82 * height),
        (cab_back, 0.32 * height),
        (trailer_front, 0.32 * height),
        (trailer_front, 0.99 * height),
        (-half, 0.99 * height),
        (-half, 0.30 * height),
        (-half + 0.4, 0.28 * height),
        (cab_back, 0.28 * height),
        (half - 0.5, 0.16 * height),
    ]
    top = [
        (width * 0.42, half),
        (width * 0.50, cab_back),
        (width * 0.50, -half),
        (-width * 0.50, -half),
        (-width * 0.50, cab_back),
        (-width * 0.42, half),
    ]
    # Front view is the trailer: a full-width box, with a narrower bumper and the tyres under it.
    # A cab wedge would miss the box that actually hides the cab.
    front = [
        (-width * 0.50, 0.30 * height),
        (-width * 0.50, 0.99 * height),
        (width * 0.50, 0.99 * height),
        (width * 0.50, 0.30 * height),
        (width * 0.42, 0.30 * height),
        (width * 0.42, 0.06 * height),
        (-width * 0.42, 0.06 * height),
        (-width * 0.42, 0.30 * height),
    ]
    return side, top, front


def score_iou(kind, objs, length, width, height):
    scale = 0.035
    pad = 0.4
    tris = world_tris(objs)
    scores = {}
    ref_dir = os.path.join(HARNESS, 'reference')
    views = {
        'side': (1, 2, -length / 2 - pad, -pad, int((length + pad * 2) / scale), int((height + pad * 2) / scale)),
        'top': (0, 1, -width / 2 - pad, -length / 2 - pad, int((width + pad * 2) / scale), int((length + pad * 2) / scale)),
        'front': (0, 2, -width / 2 - pad, -pad, int((width + pad * 2) / scale), int((height + pad * 2) / scale)),
    }
    side_ref, top_ref, front_ref = (car_reference if kind == 'car' else hauler_reference)(length, height, width)
    refs = {'side': side_ref, 'top': top_ref, 'front': front_ref}
    wheels = []
    if kind == 'car':
        wheels = [(1.36, CAR['wheel_r']), (-1.36, CAR['wheel_r'])]
    else:
        wheels = [(y, HAULER['wheel_r']) for y in (7.15, 5.85, 5.15, -5.15, -6.15)]
    for name, (u, v, ou, ov, nu, nv) in views.items():
        nu = max(8, nu)
        nv = max(8, nv)
        got = raster_tris(tris, u, v, (ou, ov), scale, nu, nv)
        ref = fill_polygon(nu, nv, refs[name], (ou, ov), scale)
        if name == 'side':
            for y, radius in wheels:
                fill_circle(ref, y, radius, radius, (ou, ov), scale)
        scores[name] = round(iou(got, ref), 3)
        save_mask(got, os.path.join(ref_dir, f'{kind}-{name}-mesh.png'))
        save_mask(ref, os.path.join(ref_dir, f'{kind}-{name}-ref.png'))
    return scores


def measure(kind):
    mn, mx = bounds_of(meshes())
    length = mx.y - mn.y
    width = mx.x - mn.x
    height = mx.z - mn.z
    spec = CAR if kind == 'car' else HAULER
    print(f'BOUNDS {kind} L {length:.3f} W {width:.3f} H {height:.3f} tris {tri_count(meshes())}')
    ok = True
    if kind == 'car':
        ok = 4.5 <= length <= 5.6 and 1.40 <= height <= 1.55 and width <= 1.82
    else:
        ok = 14.0 <= length <= 18.0 and 3.5 <= height <= 4.2 and width / 2 <= CURB_CLEAR + 0.005
    if width >= LANE_W:
        ok = False
    if abs(mn.z) > 0.02:
        print(f'ground contact off by {mn.z:.3f}')
        ok = False
    return {
        'length': round(length, 3),
        'width': round(width, 3),
        'roof': round(height, 3),
        'tris': tri_count(meshes()),
        'target': {'length': spec['length'], 'width': spec['width'], 'roof': spec['height']},
        'lane': LANE_W,
        'person': PERSON,
        'door': {'width': DOOR_W, 'height': DOOR_H},
        'ok': ok,
    }


def gltfpack_bin():
    for cand in (os.environ.get('GLTFPACK'), shutil.which('gltfpack'), '/tmp/tools/gltfpack'):
        if cand and os.path.isfile(cand) and os.access(cand, os.X_OK):
            return cand
    raise SystemExit('gltfpack 1.1 not on PATH')


def export_glb(path):
    os.makedirs(os.path.dirname(path) or '.', exist_ok=True)
    raw = path + '.raw.glb'
    bpy.ops.object.select_all(action='DESELECT')
    for obj in meshes():
        obj.select_set(True)
    bpy.ops.export_scene.gltf(
        filepath=raw,
        export_format='GLB',
        use_selection=True,
        export_yup=True,
        export_apply=True,
        export_cameras=False,
        export_lights=False,
        export_draco_mesh_compression_enable=False,
    )
    subprocess.check_call([
        gltfpack_bin(), '-i', raw, '-o', path,
        '-cc', '-km', '-kn', '-vp', '14', '-vn', '10', '-vt', '12',
    ])
    os.remove(raw)
    print('WROTE', path, os.path.getsize(path))


def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    try:
        bpy.ops.preferences.addon_enable(module='io_scene_gltf2')
    except RuntimeError:
        pass


def build(kind, lod, out_path):
    reset_scene()
    kit = Kit()
    rubber = rubber_mat()
    print(f'BUILD {kind} {lod}')
    if kind == 'car':
        build_car(lod, kit, rubber)
    else:
        build_hauler(lod, kit, rubber)
    bpy.context.view_layer.update()
    for obj in list(meshes()):
        bake_world(obj)
    for obj in list(bpy.data.objects):
        if obj.type != 'MESH':
            bpy.data.objects.remove(obj, do_unlink=True)
    join_by_material()
    sit(meshes())
    dims = measure(kind)
    # IoU on the high mesh only. Medium and low share the shell, and rasterising
    # every rib twice dominates the build.
    if lod == 'high':
        dims['iou'] = score_iou(kind, meshes(), dims['length'], dims['width'], dims['roof'])
        print(f"IOU {kind} {dims['iou']}")
    export_glb(out_path)
    return dims


def main():
    argv = sys.argv
    argv = argv[argv.index('--') + 1:] if '--' in argv else []
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument('--kind', choices=('car', 'hauler', 'all'), default='all')
    parser.add_argument('--lod', choices=('low', 'medium', 'high', 'all'), default='all')
    parser.add_argument('--out', required=True)
    args = parser.parse_args(argv)
    kinds = ('car', 'hauler') if args.kind == 'all' else (args.kind,)
    lods = ('high', 'medium', 'low') if args.lod == 'all' else (args.lod,)
    os.makedirs(args.out, exist_ok=True)
    report = {}
    failed = False
    for kind in kinds:
        report[kind] = {}
        for lod in lods:
            dims = build(kind, lod, os.path.join(args.out, f'{kind}-{lod}.glb'))
            report[kind][lod] = dims
            if not dims['ok']:
                failed = True
    high = {kind: report[kind].get('high', next(iter(report[kind].values()))) for kind in report}
    summary = {
        kind: {
            'length': row['length'],
            'width': row['width'],
            'roof': row['roof'],
            'tris': {lod: report[kind][lod]['tris'] for lod in report[kind]},
            'iou': row.get('iou'),
            'lane': row['lane'],
            'person': row['person'],
            'door': row['door'],
        }
        for kind, row in high.items()
    }
    bounds_path = os.path.join(args.out, 'bounds.json')
    with open(bounds_path, 'w') as fh:
        json.dump(summary, fh, indent=2)
        fh.write('\n')
    print('BOUNDS', bounds_path)
    if failed:
        raise SystemExit('bounds out of the legal envelope')


if __name__ == '__main__':
    main()
