# Headless spinner build. Source of truth for public/models/spinner/spinner-{high,medium,low}.glb.
#
# Blender is Z-up, nose +Y. glTF export (y-up) maps that to three.js: nose -Z, height +Y,
# origin on the ground-contact centre. Metres.
#
#   blender --background --python tools/model-harness/blender/build_spinner.py -- \
#       --round 4 --lod all --out public/models/spinner
#
# Rounds:
#   1  wedge hull, canopy, enclosed drums, skirt, light strips, low light bar
#   2  louvers, gullwing cuts, panels, POLICE decal, underglow
#   3  bevel normal, AO, roughness/metal maps, subdivision on the high hull
#   4  tuned grade on the round-3 mesh (the first bake sparkled; sheet is that pass)
#   5  drums faired into a wider shoulder, diagonal door cut, clean PBR grade
#   6  thicker door cut, louver field, pressed drum ring, lamps that read at sheet size
#   7  flat covered drum faces, and a split nose with an open center channel
#   8  front-only nose slot, filled roof, door grooves, louver deck, worn gunmetal
#   9  dark panel gaps, louver field, calm gunmetal, clearcoat, no rim speckle
#  10  shallow smoked glass, inset louver fins, panel seams, worn paint, flat normal
#  11  those parts sit on the body: no cabin fins, no roof rod, no hanging rear plate
#  12  front drums housed in the nose prongs; flat tyre-and-face cylinders, not balls
import math
import os
import shutil
import subprocess
import sys
import array

import bmesh
import bpy
from mathutils import Matrix, Vector

HARNESS = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if HARNESS not in sys.path:
    sys.path.insert(0, HARNESS)

from kit.parts import HOUSED_INNER, HOUSED_OUTER, HOUSED_TREAD, Kit  # noqa: E402

TARGET = (5.45, 2.32, 1.36)  # length (Y), width (X), height (Z)

# y (nose +), half-width, belly z, top z.
HULL = (
    (2.55, 0.38, 0.34, 0.50),
    (2.05, 0.66, 0.24, 0.66),
    (1.45, 0.86, 0.18, 0.80),
    (0.75, 0.98, 0.17, 0.94),
    (0.05, 1.02, 0.18, 1.00),
    (-0.75, 1.00, 0.18, 1.02),
    (-1.45, 0.96, 0.18, 1.06),
    (-2.05, 0.96, 0.22, 0.86),
    (-2.58, 0.94, 0.28, 0.74),
)
CANOPY = (
    (1.20, 0.20, 0.74, 0.90),
    (0.60, 0.60, 0.86, 1.14),
    (0.05, 0.76, 0.94, 1.28),
    (-0.50, 0.74, 0.98, 1.33),
    (-1.05, 0.58, 0.90, 1.26),
    (-1.55, 0.36, 0.82, 1.10),
    (-1.95, 0.14, 0.72, 0.92),
)
SHARP = {2, 3, 5, 6, 10, 11, 13, 14}
# Low uses the same ring count as medium. A 10-side drum has no vertex on
# the vertical, so the car sits on a chord, the belly drops through the side
# trace, and the front shoulder separates from the justified drum.
SEG = {'high': 28, 'medium': 16, 'low': 16}
TEX = {'high': 1024, 'medium': 512, 'low': 256}


def link(obj):
    bpy.context.scene.collection.objects.link(obj)
    return obj


def smooth(obj, angle):
    mesh = obj.data
    mesh.use_auto_smooth = True
    mesh.auto_smooth_angle = angle
    for poly in mesh.polygons:
        poly.use_smooth = True


def box(name, lo, hi, mat):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    sx, sy, sz = hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]
    bmesh.ops.scale(bm, verts=bm.verts, vec=(max(sx, 1e-4), max(sy, 1e-4), max(sz, 1e-4)))
    bmesh.ops.translate(bm, verts=bm.verts, vec=(
        (lo[0] + hi[0]) * 0.5, (lo[1] + hi[1]) * 0.5, (lo[2] + hi[2]) * 0.5,
    ))
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    obj.data.materials.append(mat)
    smooth(obj, math.radians(45))
    return link(obj)


def hull_section(y, hw, belly, top, flare=False, pod=False):
    rise = max(top - belly, 1e-4)
    belt = belly + rise * 0.58
    # Flare keeps the roof narrow and pushes the shoulder out toward the drum.
    # The lower belt is still the widest point, so the plan view stays drum-led.
    # A pod keeps that same outer width and the same centreline height, and
    # carries the roof out over the drum so the prong still reads after the
    # channel is cut back.
    if flare and pod:
        # Same outer shoulder as the flare. The roof runs out over the drum
        # on the existing top line, so the side outline stays put.
        pts = [
            (0.0, y, top),
            # The roof reaches over the drum. It stays on the existing top
            # line, so the side outline does not rise, and the drum sits
            # under the prong instead of beside it.
            (hw * 0.94, y, top),
            (hw * 0.99, y, top - rise * 0.10),
            (hw * 0.94, y, belly + rise * 0.46),
            (hw * 0.99, y, belly + rise * 0.28),
            (hw, y, belly + rise * 0.16),
            (hw * 0.90, y, belly + rise * 0.05),
            (hw * 0.40, y, belly),
            (0.0, y, belly),
        ]
    elif flare:
        pts = [
            (0.0, y, top),
            (hw * 0.40, y, top),
            (hw * 0.78, y, top - rise * 0.10),
            (hw * 0.94, y, belly + rise * 0.46),
            (hw * 0.99, y, belly + rise * 0.28),
            (hw, y, belly + rise * 0.16),
            (hw * 0.90, y, belly + rise * 0.05),
            (hw * 0.40, y, belly),
            (0.0, y, belly),
        ]
    else:
        pts = [
            (0.0, y, top),
            (hw * 0.34, y, top),
            (hw * 0.52, y, top - rise * 0.05),
            (hw * 0.60, y, belt),
            (hw * 0.78, y, belly + rise * 0.34),
            (hw, y, belly + rise * 0.20),
            (hw * 0.94, y, belly + rise * 0.06),
            (hw * 0.42, y, belly),
            (0.0, y, belly),
        ]
    for i in (7, 6, 5, 4, 3, 2, 1):
        x, yy, z = pts[i]
        pts.append((-x, yy, z))
    return pts


def canopy_section(y, hw, base, top, shallow=False):
    rise = max(top - base, 1e-4)
    if shallow:
        # Flat crown. The old section was a dome and read as a bubble.
        pts = [
            (0.0, y, top),
            (hw * 0.80, y, top - rise * 0.02),
            (hw * 0.98, y, base + rise * 0.28),
            (hw, y, base + rise * 0.08),
            (hw * 0.34, y, base),
            (0.0, y, base),
        ]
    else:
        pts = [
            (0.0, y, top),
            (hw * 0.62, y, top - rise * 0.02),
            (hw * 0.92, y, base + rise * 0.55),
            (hw, y, base + rise * 0.16),
            (hw * 0.46, y, base),
            (0.0, y, base),
        ]
    for i in (4, 3, 2, 1):
        x, yy, z = pts[i]
        pts.append((-x, yy, z))
    return pts


def loft(sections, name, mat, sharp, crease, angle):
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
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    layer = None
    if crease > 0:
        layer = bm.edges.layers.float.get('crease_edge') or bm.edges.layers.float.new('crease_edge')
    for i in range(len(rings) - 1):
        for k in sharp:
            if k >= nring:
                continue
            edge = bm.edges.get((rings[i][k], rings[i + 1][k]))
            if edge is None:
                continue
            edge.smooth = False
            if layer is not None:
                edge[layer] = crease
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    obj.data.materials.append(mat)
    smooth(obj, angle)
    return link(obj)


def select_only(obj):
    if bpy.context.mode != 'OBJECT':
        bpy.ops.object.mode_set(mode='OBJECT')
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


def apply_mods(obj, angle):
    select_only(obj)
    for mod in list(obj.modifiers):
        try:
            bpy.ops.object.modifier_apply(modifier=mod.name)
        except RuntimeError as exc:
            print('modifier failed', obj.name, mod.name, exc)
    smooth(obj, angle)


def add_bevel(obj, segments, width):
    mod = obj.modifiers.new('Bevel', 'BEVEL')
    mod.limit_method = 'ANGLE'
    mod.angle_limit = math.radians(38)
    mod.width = width
    mod.segments = segments
    mod.harden_normals = True
    mod.use_clamp_overlap = True


def add_subdiv(obj):
    mod = obj.modifiers.new('Subsurf', 'SUBSURF')
    mod.levels = 1
    mod.render_levels = 1
    mod.use_creases = True


def add_weighted(obj):
    mod = obj.modifiers.new('Weighted', 'WEIGHTED_NORMAL')
    mod.keep_sharp = True


def frame(part, location, x_axis, y_axis, z_axis):
    """Columns are the images of local +X, +Y, +Z. A mirrored frame is corrected in bake_world."""
    x = Vector(x_axis).normalized()
    y = Vector(y_axis).normalized()
    z = Vector(z_axis).normalized()
    part.root.matrix_world = Matrix((
        (x.x, y.x, z.x, location[0]),
        (x.y, y.y, z.y, location[1]),
        (x.z, y.z, z.z, location[2]),
        (0, 0, 0, 1),
    ))


def stick(kit, part, target, guess, normal, lift=0.002):
    n = Vector(normal)
    if n.length < 1e-8:
        n = Vector((0, 0, 1))
    n.normalize()
    hit = False
    loc = Vector(guess)
    nor = n.copy()
    for start, dist in ((0.45, 0.9), (2.5, 4.0)):
        origin = Vector(guess) + n * start
        ok, loc, nor, _idx = target.ray_cast(origin, -n, distance=dist)
        if ok:
            hit = True
            break
    if not hit:
        print('MISS', part.root.name, [round(c, 3) for c in guess])
        kit.place(part, guess, normal=n, lift=lift)
        return Vector(guess)
    if nor.dot(n) < 0:
        nor.negate()
    kit.place(part, loc, normal=nor, lift=lift)
    return Vector(loc)


def bake_world(obj):
    select_only(obj)
    if obj.parent:
        bpy.ops.object.parent_clear(type='CLEAR_KEEP_TRANSFORM')
    apply_mods(obj, obj.data.auto_smooth_angle or math.radians(45))
    select_only(obj)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    select_only(obj)
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.mesh.normals_make_consistent(inside=False)
    bpy.ops.object.mode_set(mode='OBJECT')


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


def smart_uv(obj):
    select_only(obj)
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    try:
        bpy.ops.uv.smart_project(angle_limit=1.15, island_margin=0.02)
    except RuntimeError as exc:
        print('smart_project failed', exc)
        bpy.ops.uv.lightmap_pack(PREF_MARGIN_DIV=512)
    bpy.ops.object.mode_set(mode='OBJECT')


def gltfpack_bin():
    for cand in ('gltfpack', '/tmp/tools/gltfpack', '/usr/local/bin/gltfpack'):
        found = shutil.which(cand) if os.sep not in cand else cand
        if found and os.path.isfile(found) and os.access(found, os.X_OK):
            return found
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
        export_image_format='AUTO',
    )
    # Float UVs. Quantized UVs made gltfpack emit a 15x texture transform, and the paint tiled into grain.
    subprocess.check_call([
        gltfpack_bin(), '-i', raw, '-o', path,
        '-cc', '-km', '-kn', '-vp', '14', '-vn', '10', '-vt', '12', '-vtf',
    ])
    os.remove(raw)
    print('WROTE', path, os.path.getsize(path))


def sit_and_scale(objs):
    mn, mx = bounds_of(objs)
    dx = -(mn.x + mx.x) * 0.5
    dy = -(mn.y + mx.y) * 0.5
    dz = -mn.z
    for obj in objs:
        inv = obj.matrix_world.inverted()
        for vert in obj.data.vertices:
            p = obj.matrix_world @ vert.co
            p.x += dx
            p.y += dy
            p.z += dz
            vert.co = inv @ p
        obj.data.update()
    mn, mx = bounds_of(objs)
    length, width, height = mx.y - mn.y, mx.x - mn.x, mx.z - mn.z
    print(f'BEFORE scale L {length:.3f} W {width:.3f} H {height:.3f}')
    sx = TARGET[1] / width if width > 1e-4 else 1
    sy = TARGET[0] / length if length > 1e-4 else 1
    sz = TARGET[2] / height if height > 1e-4 else 1
    already = 5.30 <= length <= 5.60 and 2.20 <= width <= 2.40 and 1.30 <= height <= 1.40
    if already:
        print('scale skipped; already in range')
    elif all(0.82 < s < 1.22 for s in (sx, sy, sz)):
        for obj in objs:
            for vert in obj.data.vertices:
                vert.co.x *= sx
                vert.co.y *= sy
                vert.co.z *= sz
            obj.data.update()
        print(f'scaled by {sx:.4f} {sy:.4f} {sz:.4f}')
    else:
        print(f'scale skipped ({sx:.3f} {sy:.3f} {sz:.3f}); stations are off')
    mn, mx = bounds_of(objs)
    length, width, height = mx.y - mn.y, mx.x - mn.x, mx.z - mn.z
    print(f'BOUNDS L(Y) {length:.3f} W(X) {width:.3f} H(Z) {height:.3f} tris {tri_count(objs)}')
    ok = 5.30 <= length <= 5.60 and 2.20 <= width <= 2.40 and 1.30 <= height <= 1.40
    return ok


def cut_nose_channel(hull, filled=False, housed=False):
    """Open the hood. The cutter runs out past the nose and down through the slab,
    so the top and front silhouettes show two cheeks and a gap, not a solid panel.

    filled keeps the slot in the nose only. The deck behind it stays a roof.
    housed starts the slot behind the front drums, so each drum sits in its prong.
    """
    if housed:
        lo, hi = (-0.52, 1.06, 0.08), (0.52, 2.98, 1.02)
    elif filled:
        lo, hi = (-0.52, 1.78, 0.10), (0.52, 2.98, 0.92)
    else:
        lo, hi = (-0.58, 1.48, 0.08), (0.58, 2.95, 1.05)
    cutter = box('nose-channel', lo, hi, hull.data.materials[0])
    mod = hull.modifiers.new('Channel', 'BOOLEAN')
    mod.operation = 'DIFFERENCE'
    mod.object = cutter
    mod.solver = 'EXACT'
    select_only(hull)
    bpy.ops.object.modifier_apply(modifier=mod.name)
    bpy.data.objects.remove(cutter, do_unlink=True)


def darken_channel(hull, y0=1.76):
    """The slot interior is a recess, not the noisy body bake."""
    rec = bpy.data.materials.get('recess')
    if rec is None:
        return
    mesh = hull.data
    if rec.name not in [m.name for m in mesh.materials]:
        mesh.materials.append(rec)
    idx = mesh.materials.find('recess')
    n = 0
    for poly in mesh.polygons:
        c = poly.center
        if -0.54 <= c.x <= 0.54 and y0 <= c.y <= 3.05 and c.z <= 1.02:
            poly.material_index = idx
            n += 1
    print('channel faces recessed', n)


def cut_axle_well(hull, name, sign, y, z, radius, x0, x1, segments=32):
    """Open the outer face of a pod around a drum.

    The cutter is a cylinder along X. It stops short of the center channel,
    so the prong stays a fairing and the slot between the prongs stays open.
    """
    depth = abs(x1 - x0)
    cx = sign * (x0 + x1) * 0.5
    bm = bmesh.new()
    bmesh.ops.create_cone(
        bm, cap_ends=True, cap_tris=False, segments=segments,
        radius1=radius, radius2=radius, depth=depth,
    )
    # Cone axis is Z. A quarter turn about Y lays that axis along X.
    rot = Matrix.Rotation(math.radians(90), 4, 'Y')
    bmesh.ops.transform(bm, verts=bm.verts, matrix=rot)
    bmesh.ops.translate(bm, verts=bm.verts, vec=(cx, y, z))
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    cutter = bpy.data.objects.new(name, mesh)
    cutter.data.materials.append(hull.data.materials[0])
    link(cutter)
    mod = hull.modifiers.new(name, 'BOOLEAN')
    mod.operation = 'DIFFERENCE'
    mod.object = cutter
    mod.solver = 'EXACT'
    select_only(hull)
    bpy.ops.object.modifier_apply(modifier=mod.name)
    bpy.data.objects.remove(cutter, do_unlink=True)


def _part_aabb(part):
    bpy.context.view_layer.update()
    mn = Vector((1e9, 1e9, 1e9))
    mx = Vector((-1e9, -1e9, -1e9))
    for obj in part.meshes:
        for corner in obj.bound_box:
            p = obj.matrix_world @ Vector(corner)
            mn.x = min(mn.x, p.x)
            mn.y = min(mn.y, p.y)
            mn.z = min(mn.z, p.z)
            mx.x = max(mx.x, p.x)
            mx.y = max(mx.y, p.y)
            mx.z = max(mx.z, p.z)
    return mn, mx


def _down_hit(hull, x, y):
    ok, loc, _nor, _idx = hull.ray_cast(Vector((x, y, 3.0)), Vector((0, 0, -1)), distance=6.0)
    return loc if ok else None


def assert_wheels_housed(hull, specs):
    """Front drum centres sit under a prong roof, with the nose still ahead and the channel open."""
    problems = []
    for spec in specs:
        sign = spec['sign']
        mn, mx = _part_aabb(spec['part'])
        cx = sign * spec['center_x']
        lo_x, hi_x = min(mn.x, mx.x), max(mn.x, mx.x)
        if cx < lo_x - 0.02 or cx > hi_x + 0.02:
            problems.append(f"drum {spec['name']} centre {cx:.3f} outside mesh {lo_x:.3f}..{hi_x:.3f}")
        cy = (mn.y + mx.y) * 0.5
        cz = (mn.z + mx.z) * 0.5
        reach = max(abs(mn.y - cy), abs(mx.y - cy), abs(mn.z - cz), abs(mx.z - cz))
        if reach > spec['well_r'] + 0.025:
            problems.append(f"drum {spec['name']} radius {reach:.3f} leaves the well {spec['well_r']:.3f}")
        if max(abs(mn.x), abs(mx.x)) > spec['well_x1'] + 0.02:
            problems.append(f"drum {spec['name']} face sticks out of the pod opening")
        if spec['front']:
            # The fairing over the drum is the inboard prong roof. The outer
            # shoulder is the wheel opening, so the ray goes through the cheek.
            roof = _down_hit(hull, sign * 0.58, spec['y'])
            need = spec['z'] + spec['radius'] * 0.55
            if roof is None or roof.z < need:
                got = None if roof is None else round(roof.z, 3)
                problems.append(f"no prong roof over {spec['name']} (hit {got}, need {need:.2f})")
            ahead_y = spec['y'] + spec['radius'] + 0.42
            nose = _down_hit(hull, sign * 0.78, ahead_y)
            if nose is None or nose.z < 0.32:
                got = None if nose is None else round(nose.z, 3)
                problems.append(f"prong does not continue ahead of {spec['name']} (hit {got})")
            slot = _down_hit(hull, 0.0, spec['y'])
            if slot is not None and slot.z > 0.28:
                problems.append(f"channel is filled beside {spec['name']} (hit z {slot.z:.3f})")
        else:
            cover = _down_hit(hull, sign * min(spec['center_x'], 0.62), spec['y'])
            need = spec['z'] + spec['radius'] * 0.35
            if cover is None or cover.z < need:
                got = None if cover is None else round(cover.z, 3)
                problems.append(f"no rear fender over {spec['name']} (hit {got}, need {need:.2f})")
    if problems:
        for line in problems:
            print('WHEEL', line)
        raise SystemExit('wheels are not housed in their pods')
    print('wheels housed', len(specs))


def cut_ribbon(hull, name, location, euler, half):
    """Boolean a slot into the hull. half is (x, y, z) before rotation."""
    hx, hy, hz = half
    cutter = box(name, (-hx, -hy, -hz), (hx, hy, hz), hull.data.materials[0])
    cutter.location = Vector(location)
    cutter.rotation_euler = euler
    bpy.context.view_layer.update()
    mod = hull.modifiers.new(name, 'BOOLEAN')
    mod.operation = 'DIFFERENCE'
    mod.object = cutter
    mod.solver = 'EXACT'
    select_only(hull)
    bpy.ops.object.modifier_apply(modifier=mod.name)
    bpy.data.objects.remove(cutter, do_unlink=True)


def place_wheel(kit, name, sign, y, radius, width, segments, slots, x=0.78, pressed=False, covered=False, panel=False, housed=False):
    part = kit.wheel_housing(
        name, radius=radius, width=width, segments=segments, slots=0 if covered else slots,
        pressed=pressed, covered=covered, panel=panel, housed=housed,
    )
    # local +Z out the cover, +Y up, +X toward the nose. Left side is a mirror; normals are fixed later.
    frame(part, (sign * x, y, radius + 0.02), (0, 1, 0), (0, 0, 1), (sign, 0, 0))
    return part


def place_skirt(kit, sign, x=0.78, width=0.30, height=0.20, z=0.16):
    # Bridge the drums. Nose taper is local +X, so both sides point that axis at the nose.
    part = kit.side_pod(f'skirt-{sign:+d}', length=2.55, width=width, height=height, nose=0.48, tail=0.32)
    frame(part, (sign * x, -0.22, z), (0, 1, 0), (0, 0, 1), (sign, 0, 0))
    return part


def place_bar(kit, canopy, length=0.84, height=0.046):
    part = kit.light_bar('light-bar', length, 0.14, height)
    loc = stick(kit, part, canopy, (0.0, -0.35, 1.34), (0, 0, 1), lift=0.0)
    # local +X is the long axis and runs across the roof. +Z up. A few centimetres, not a fin.
    frame(part, (loc.x, loc.y, loc.z + 0.004), (1, 0, 0), (0, 1, 0), (0, 0, 1))
    return part


def place_decal(kit, hull, sign, width=1.28, height=0.22):
    part = kit.livery_decal(f'police-{sign:+d}', width, height)
    # A single ray falls into the door groove and the card ends up inside the hull.
    # Take the outermost hit, then sit the card just proud of that skin.
    best = None
    for dy in (-0.40, -0.15, 0.10, 0.35):
        for dz in (-0.06, 0.04, 0.12):
            loc, _nor = ray_hit(hull, (sign * 1.55, dy, 0.48 + dz), (sign, 0.0, 0.0))
            if loc is None:
                continue
            if best is None or abs(loc.x) > abs(best.x):
                best = loc
    if best is None:
        print('MISS decal', sign)
        discard(part)
        return None
    seat = (best.x + sign * 0.012, -0.12, 0.48)
    if sign > 0:
        frame(part, seat, (0, 1, 0), (0, 0, 1), (1, 0, 0))
    else:
        frame(part, seat, (0, -1, 0), (0, 0, 1), (-1, 0, 0))
    return part


def paint_livery(path):
    """Original POLICE word, set in a bold sans. The 4x6 bitmap read as pixels."""
    os.makedirs(os.path.dirname(path) or '.', exist_ok=True)
    subprocess.check_call([
        '/usr/bin/python3', '-c',
        (
            'from PIL import Image, ImageDraw, ImageFont\n'
            'import sys\n'
            'path = sys.argv[1]\n'
            'w, h = 1024, 198\n'
            'img = Image.new("RGBA", (w, h), (11, 12, 14, 255))\n'
            'draw = ImageDraw.Draw(img)\n'
            'font = ImageFont.truetype("/usr/share/fonts/truetype/noto/NotoSans-Bold.ttf", 156)\n'
            'word = "POLICE"\n'
            'tracking = 72\n'
            'widths = [font.getbbox(ch)[2] - font.getbbox(ch)[0] for ch in word]\n'
            'word_w = sum(widths) + tracking * (len(word) - 1)\n'
            'x = (w - word_w) // 2\n'
            'bbox = font.getbbox(word)\n'
            'y = (h - (bbox[3] - bbox[1])) // 2 - bbox[1]\n'
            'ink = (220, 214, 200, 255)\n'
            'rule = (132, 126, 116, 255)\n'
            'top = y + bbox[1] - 10\n'
            'bot = y + bbox[3] + 6\n'
            'draw.line((x, top, x + word_w, top), fill=rule, width=2)\n'
            'draw.line((x, bot, x + word_w, bot), fill=rule, width=2)\n'
            'cx = x\n'
            'for ch, cw in zip(word, widths):\n'
            '    draw.text((cx, y), ch, font=font, fill=ink)\n'
            '    cx += cw + tracking\n'
            'img.save(path)\n'
        ),
        path,
    ])
    img = bpy.data.images.load(path)
    img.name = 'livery-police'
    img.colorspace_settings.name = 'sRGB'
    img.pack()
    print('livery', path)
    return img


def assign_decal_uvs():
    """The outward local +Z face carries the word. Other faces get a corner so they stay dark."""
    for obj in meshes():
        if not obj.data.materials or obj.data.materials[0].name != 'livery':
            continue
        mesh = obj.data
        if not mesh.uv_layers:
            mesh.uv_layers.new(name='UVMap')
        uv = mesh.uv_layers.active.data
        for poly in mesh.polygons:
            loops = list(poly.loop_indices)
            if poly.normal.z < 0.9:
                for li in loops:
                    uv[li].uv = (0.0, 0.0)
                continue
            coords = [mesh.vertices[mesh.loops[li].vertex_index].co for li in loops]
            min_x = min(c.x for c in coords)
            max_x = max(c.x for c in coords)
            min_y = min(c.y for c in coords)
            max_y = max(c.y for c in coords)
            span_x = max(max_x - min_x, 1e-6)
            span_y = max(max_y - min_y, 1e-6)
            for li, co in zip(loops, coords):
                uv[li].uv = ((co.x - min_x) / span_x, (co.y - min_y) / span_y)


def assign_livery(mat, image):
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    bsdf = nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = (1, 1, 1, 1)
    bsdf.inputs['Metallic'].default_value = 0.05
    bsdf.inputs['Roughness'].default_value = 0.58
    tex = nodes.new('ShaderNodeTexImage')
    tex.image = image
    tex.location = (-300, 200)
    links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])


def _active_image(obj, name, size, colorspace):
    img = bpy.data.images.new(name, width=size, height=size, alpha=False, float_buffer=True)
    img.colorspace_settings.name = colorspace
    mat = obj.data.materials[0]
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    tex = nodes.new('ShaderNodeTexImage')
    tex.image = img
    nodes.active = tex
    for node in nodes:
        node.select = False
    tex.select = True
    return img


def _bake(obj, kind, extra=None):
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    scene.cycles.samples = 1 if kind == 'NORMAL' else 8
    scene.cycles.use_denoising = False
    scene.render.threads_mode = 'FIXED'
    scene.render.threads = os.cpu_count() or 4
    scene.render.bake.margin = 8
    scene.render.bake.use_clear = True
    select_only(obj)
    if extra is not None:
        extra.select_set(True)
        bpy.context.view_layer.objects.active = obj
    print('BAKE', kind, 'threads', scene.render.threads, 'samples', scene.cycles.samples, flush=True)
    bpy.ops.object.bake(type=kind)
    print('BAKE done', kind, flush=True)


def bake_normal(obj, size):
    select_only(obj)
    bpy.ops.object.duplicate()
    high = bpy.context.view_layer.objects.active
    high.name = 'body-high'
    bev = high.modifiers.new('Bevel', 'BEVEL')
    bev.limit_method = 'ANGLE'
    bev.angle_limit = math.radians(42)
    bev.width = 0.012
    bev.segments = 2
    apply_mods(high, math.radians(30))
    img = _active_image(obj, 'normal-bake', size, 'Non-Color')
    scene = bpy.context.scene
    scene.render.bake.use_selected_to_active = True
    scene.render.bake.cage_extrusion = 0.03
    scene.render.bake.normal_space = 'TANGENT'
    try:
        _bake(obj, 'NORMAL', extra=high)
        print('normal bake ok')
    except RuntimeError as exc:
        print('normal bake failed', exc)
        img.pixels.foreach_set(array.array('f', [0.5, 0.5, 1.0, 1.0] * (size * size)))
    scene.render.bake.use_selected_to_active = False
    bpy.data.objects.remove(high, do_unlink=True)
    return img


def bake_ao(obj, size):
    img = _active_image(obj, 'ao-bake', size, 'Non-Color')
    try:
        _bake(obj, 'AO')
        print('ao bake ok')
    except RuntimeError as exc:
        print('ao bake failed', exc)
        img.pixels.foreach_set(array.array('f', [1, 1, 1, 1] * (size * size)))
    return img


def _image_floats(img):
    buf = array.array('f', [0.0]) * (img.size[0] * img.size[1] * img.channels)
    img.pixels.foreach_get(buf)
    return buf


def _box_blur(src, size, radius):
    """Separable box blur. Edge samples clamp. A flat field stays flat."""
    tmp = array.array('f', [0.0]) * (size * size)
    inv = 1.0 / (radius * 2 + 1)
    for y in range(size):
        row = y * size
        acc = 0.0
        for k in range(-radius, radius + 1):
            acc += src[row + min(size - 1, max(0, k))]
        for x in range(size):
            tmp[row + x] = acc * inv
            acc += src[row + min(size - 1, x + radius + 1)]
            acc -= src[row + max(0, x - radius)]
    out = array.array('f', [0.0]) * (size * size)
    for x in range(size):
        acc = 0.0
        for k in range(-radius, radius + 1):
            acc += tmp[min(size - 1, max(0, k)) * size + x]
        for y in range(size):
            out[y * size + x] = acc * inv
            acc += tmp[min(size - 1, y + radius + 1) * size + x]
            acc -= tmp[max(0, y - radius) * size + x]
    return out


def _hash(ix, iy):
    n = (int(ix) * 374761393 + int(iy) * 668265263) & 0xFFFFFFFF
    n = (n ^ (n >> 13)) * 1274126177 & 0xFFFFFFFF
    return ((n >> 8) & 0xFFFFFF) / float(0xFFFFFF)


def _channel_mean(img, ch):
    buf = _image_floats(img)
    step = max(int(img.channels), 1)
    n = img.size[0] * img.size[1]
    acc = 0.0
    count = 0
    for i in range(0, n, 8):
        acc += buf[i * step + min(ch, step - 1)]
        count += 1
    return acc / max(count, 1)


def _byte_image(name, buf, size, space):
    img = bpy.data.images.new(name, width=size, height=size, alpha=True, float_buffer=False)
    img.colorspace_settings.name = space
    img.pixels.foreach_set(buf)
    img.pack()
    return img


def _as_byte(img, name, space):
    """Float bakes export as a black PNG. Copy into an 8-bit image first."""
    w, h = img.size
    raw = _image_floats(img)
    step = max(int(img.channels), 1)
    n = w * h
    buf = array.array('f', [0.0]) * (n * 4)
    for i in range(n):
        base = i * step
        if step >= 3:
            buf[i * 4] = raw[base]
            buf[i * 4 + 1] = raw[base + 1]
            buf[i * 4 + 2] = raw[base + 2]
            buf[i * 4 + 3] = raw[base + 3] if step >= 4 else 1.0
        else:
            buf[i * 4] = buf[i * 4 + 1] = buf[i * 4 + 2] = raw[base]
            buf[i * 4 + 3] = 1.0
    return _byte_image(name, buf, w, space)


def ao_normal_image(ao_img, size):
    """Seam relief from a blurred AO. A missed Cycles bake was a black map, and that speckled under the rim."""
    raw = _image_floats(ao_img)
    step = max(int(ao_img.channels), 1)
    aos = array.array('f', raw[0::step])
    blur = _box_blur(aos, size, 8)
    buf = array.array('f', [0.0]) * (size * size * 4)
    strength = 1.5
    for y in range(size):
        row = y * size
        for x in range(size):
            left = blur[row + max(0, x - 1)]
            right = blur[row + min(size - 1, x + 1)]
            down = blur[max(0, y - 1) * size + x]
            up = blur[min(size - 1, y + 1) * size + x]
            nx = (left - right) * strength
            ny = (down - up) * strength
            nz = 1.0
            inv = 1.0 / math.sqrt(nx * nx + ny * ny + nz * nz)
            o = (row + x) * 4
            buf[o] = nx * inv * 0.5 + 0.5
            buf[o + 1] = ny * inv * 0.5 + 0.5
            buf[o + 2] = nz * inv * 0.5 + 0.5
            buf[o + 3] = 1.0
    return _byte_image('body-normal', buf, size, 'Non-Color')


def flat_normal_image(size):
    """No cavity bump. The AO relief read as a wavy fingerprint in the close-ups."""
    buf = array.array('f', [0.5, 0.5, 1.0, 1.0]) * (size * size)
    return _byte_image('body-normal', buf, size, 'Non-Color')


def _surface_tone(co, normal):
    """Panel steps along the length, belly dirt, a few chips. A Z contour reads as a swirl."""
    z = co.z
    x = abs(co.x)
    y = co.y
    iy = int(math.floor(y * 0.55))
    panel = 0.56 + 0.48 * _hash(iy, int(math.floor(x * 0.8 + 2)))
    # Breaks across the car, not around the loft.
    seam = min((y * 0.55) - iy, 1.0 - ((y * 0.55) - iy))
    if seam < 0.045:
        panel *= 0.58
    if z < 0.42:
        panel *= 0.60 + 0.40 * max(0.0, z) / 0.42
    stain = _hash(int(math.floor(y * 1.25 + 4)), int(math.floor(x * 1.7)))
    if stain > 0.62 and z < 0.95:
        panel *= 0.74 + 0.18 * (1.0 - stain)
    chip = _hash(
        int(math.floor(x * 3.2)),
        int(math.floor(y * 3.2)) + int(math.floor(z * 3.2)),
    )
    if chip > 0.986 and z > 0.55 and abs(normal.z) < 0.75:
        return min(1.45, panel * 1.7)
    return panel


def stamp_surface(obj, img):
    """Darken bellies and rain tracks, and lift a few edge chips, in the albedo."""
    size = img.size[0]
    raw = _image_floats(img)
    ch = max(int(img.channels), 1)
    mesh = obj.data
    uvdata = mesh.uv_layers.active.data
    loops = mesh.loops
    verts = mesh.vertices
    painted = 0
    for poly in mesh.polygons:
        if poly.area < 0.004 or len(poly.loop_indices) < 3:
            continue
        ids = poly.loop_indices
        normal = poly.normal
        for i in range(1, len(ids) - 1):
            tri = (ids[0], ids[i], ids[i + 1])
            us = []
            vs = []
            cos = []
            for li in tri:
                uv = uvdata[li].uv
                us.append(uv.x * size)
                vs.append(uv.y * size)
                cos.append(verts[loops[li].vertex_index].co)
            minx = max(0, int(min(us)))
            maxx = min(size - 1, int(max(us)) + 1)
            miny = max(0, int(min(vs)))
            maxy = min(size - 1, int(max(vs)) + 1)
            den = (vs[1] - vs[2]) * (us[0] - us[2]) + (us[2] - us[1]) * (vs[0] - vs[2])
            if abs(den) < 1e-4:
                continue
            for py in range(miny, maxy + 1):
                for px in range(minx, maxx + 1):
                    sx = px + 0.5
                    sy = py + 0.5
                    w0 = ((vs[1] - vs[2]) * (sx - us[2]) + (us[2] - us[1]) * (sy - vs[2])) / den
                    w1 = ((vs[2] - vs[0]) * (sx - us[2]) + (us[0] - us[2]) * (sy - vs[2])) / den
                    w2 = 1.0 - w0 - w1
                    if w0 < -0.002 or w1 < -0.002 or w2 < -0.002:
                        continue
                    co = cos[0] * w0 + cos[1] * w1 + cos[2] * w2
                    mul = _surface_tone(co, normal)
                    o = (py * size + px) * ch
                    for c in range(min(3, ch)):
                        raw[o + c] = min(1.0, max(0.0, raw[o + c] * mul))
                    painted += 1
    img.pixels.foreach_set(raw)
    print('surface stamped', painted)


def _grade(ao_img, size, tuned, loud=False, worn=False, flat=False):
    raw = _image_floats(ao_img)
    step = max(int(ao_img.channels), 1)
    aos = array.array('f', raw[0::step])
    # Eight AO samples are grainy. Blur before the worn grade or the rim turns the grain into sparkles.
    if worn:
        aos = _box_blur(aos, size, 4)
    # Open panels are the bright end of the bake. Scale to that, or a dim AO
    # paints the whole car as a crevice.
    hi = sorted(aos)[int((len(aos) - 1) * 0.92)]
    hi = max(hi, 1e-4)
    blur = _box_blur(aos, size, 2)
    wide = _box_blur(aos, size, 14) if worn else blur
    base = array.array('f', [0.0]) * (size * size * 4)
    rough = array.array('f', [0.0]) * (size * size * 4)
    metal = array.array('f', [0.0]) * (size * size * 4)
    # Charcoal that still shows a panel in studio. Near-black (0.01) read as empty.
    # Loud is a step lighter so the studio row is not a black hole, with a wider cavity.
    # Worn is gunmetal: lighter, more metal, with panel-sized tone and a few chips.
    if worn:
        paint = (0.18, 0.185, 0.195)
    elif loud:
        paint = (0.14, 0.145, 0.155)
    elif tuned:
        paint = (0.062, 0.064, 0.070)
    else:
        paint = (0.045, 0.047, 0.050)
    cell = 160 if size >= 1024 else (80 if size >= 512 else 40)
    chip_cell = 64 if size >= 1024 else 32
    for i, ao in enumerate(aos):
        ao_n = min(1.0, ao / hi)
        blur_n = min(1.0, blur[i] / hi)
        wide_n = min(1.0, wide[i] / hi)
        if flat:
            # AO on a smooth loft is a gradient of the curvature. Any cutoff of that
            # gradient paints concentric swirls. Panel gaps are the mesh, not this map.
            shade = 1.0
        else:
            shade = (0.62 + 0.38 * ao_n) if worn else ((0.48 + 0.52 * ao_n) if loud else (0.62 + 0.38 * ao_n))
        # Soft exposed-edge lift. A one-pixel neighbour test sparkled under the rim.
        edge = (ao_n - wide_n) if worn else (ao_n - blur_n)
        edge_lift = 0.08 if worn else (0.12 if loud else 0.22)
        edge_cut = 0.08 if worn else 0.035
        if tuned and not flat and edge > edge_cut:
            shade *= 1.0 + min(edge_lift, (edge - edge_cut) * (1.1 if worn else (1.4 if loud else 2.4)))
        if ao_n < 0.5 and not flat:
            if worn:
                shade *= 0.20 + 0.50 * (ao_n / 0.5)
            else:
                shade *= 0.55 + 0.45 * (ao_n / 0.5) if loud else 0.7 + 0.3 * (ao_n / 0.5)
        tone = 1.0
        chip = 0.0
        grit = 0.0
        if worn and not flat:
            x, y = i % size, i // size
            tone = 0.97 + 0.05 * _hash(x // cell, y // cell)
            # Grime sits in cavities, not as a checker on an open panel.
            if ao_n < 0.55 and _hash(x // cell + 5, y // cell + 11) > 0.78:
                grit = 1.0
                tone *= 0.84
            if _hash(x // chip_cell + 17, y // chip_cell + 3) > 0.994 and edge > 0.10:
                chip = 1.0
        o = i * 4
        cr = min(1.0, paint[0] * shade * tone)
        cg = min(1.0, paint[1] * shade * tone)
        cb = min(1.0, paint[2] * shade * tone)
        if worn and not flat and edge > 0.08:
            wear = min(0.32, (edge - 0.08) * 1.3)
            cr = cr * (1.0 - wear) + 0.34 * wear
            cg = cg * (1.0 - wear) + 0.35 * wear
            cb = cb * (1.0 - wear) + 0.37 * wear
        if chip:
            cr, cg, cb = 0.46, 0.47, 0.50
        base[o] = cr
        base[o + 1] = cg
        base[o + 2] = cb
        base[o + 3] = 1.0
        if worn:
            # Paint, not chrome. The coat carries the shine.
            r = 0.50 + 0.16 * (1.0 - ao_n)
            m = 0.34 + 0.14 * ao_n
            if grit:
                r = min(0.92, r + 0.24)
                m = max(0.08, m - 0.20)
            if edge > 0.08:
                r = max(0.30, r - 0.06)
                m = min(0.62, m + 0.05)
            if chip:
                r = 0.34
                m = 0.62
        elif loud:
            r = 0.58 + 0.22 * (1.0 - ao_n)
            m = 0.18 + 0.16 * ao_n
        else:
            r = 0.46 + 0.28 * (1.0 - ao_n)
            if tuned and edge > 0.035:
                r = max(0.34, r - 0.08)
            m = 0.28 + 0.30 * ao_n
            if tuned and edge > 0.035:
                m = min(0.72, m + 0.08)
        rough[o:o + 4] = array.array('f', (r, r, r, 1))
        metal[o:o + 4] = array.array('f', (m, m, m, 1))
    def finish(name, buf, space):
        img = bpy.data.images.new(name, width=size, height=size, alpha=True, float_buffer=False)
        img.colorspace_settings.name = space
        img.pixels.foreach_set(buf)
        img.pack()
        return img
    return (
        finish('body-albedo', base, 'sRGB'),
        finish('body-rough', rough, 'Non-Color'),
        finish('body-metal', metal, 'Non-Color'),
    )


def connect_pbr(obj, albedo, rough, metal, normal, worn=False):
    mat = obj.data.materials[0]
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    bsdf = nodes.get('Principled BSDF')
    for node in list(nodes):
        if node.type == 'TEX_IMAGE' and node.image and node.image.name.endswith('-bake'):
            nodes.remove(node)

    def tex_node(image, x):
        tex = nodes.new('ShaderNodeTexImage')
        tex.image = image
        tex.location = (x, 300)
        return tex

    links.new(tex_node(albedo, -420).outputs['Color'], bsdf.inputs['Base Color'])
    links.new(tex_node(rough, -420).outputs['Color'], bsdf.inputs['Roughness'])
    links.new(tex_node(metal, -640).outputs['Color'], bsdf.inputs['Metallic'])
    nmap = nodes.new('ShaderNodeNormalMap')
    nmap.location = (-200, -120)
    nt = tex_node(normal, -640)
    nt.image.colorspace_settings.name = 'Non-Color'
    links.new(nt.outputs['Color'], nmap.inputs['Color'])
    links.new(nmap.outputs['Normal'], bsdf.inputs['Normal'])
    bsdf.inputs['Metallic'].default_value = 1.0
    bsdf.inputs['Roughness'].default_value = 1.0
    if worn and 'Coat Weight' in bsdf.inputs:
        # A sharp coat turned the loft's loops into a machined swirl.
        bsdf.inputs['Coat Weight'].default_value = 0.16
        bsdf.inputs['Coat Roughness'].default_value = 0.82


def pack_uv_trim(obj):
    """Pull repeated kit islands off the unique paint region so a corner stays a shared trim cell."""
    mesh = obj.data
    if not mesh.uv_layers:
        return
    uv = mesh.uv_layers.active.data
    # Bolts and slat faces are small. Leave them; the grade is unique per island.
    # The shared trim cell is the top-left 8% : any loop whose island is tiny gets moved there.
    # Counting per polygon.
    polys = mesh.polygons
    for poly in polys:
        if poly.area > 0.004:
            continue
        for li in poly.loop_indices:
            u, v = uv[li].uv
            uv[li].uv = (0.01 + (u % 1) * 0.07, 0.92 + (v % 1) * 0.07)


def bake_body(obj, size, tuned, loud=False, worn=False, seamed=False):
    if bpy.context.scene.world is None:
        bpy.context.scene.world = bpy.data.worlds.new('World')
    smart_uv(obj)
    pack_uv_trim(obj)
    # The selected-to-active bevel bake came back as a fingerprint and speckled under the rim.
    # Worn rounds use a blurred AO cavity instead. Seamed rounds leave the normal flat.
    ao = bake_ao(obj, size)
    if seamed:
        normal = flat_normal_image(size)
        print('normal flat')
    elif worn:
        normal = ao_normal_image(ao, size)
        print('normal from AO cavity')
    else:
        normal = bake_normal(obj, size)
        mean_b = _channel_mean(normal, 2)
        print(f'normal mean B {mean_b:.3f}')
        if mean_b < 0.25:
            print('normal bake empty; seams from AO')
            normal = ao_normal_image(ao, size)
        else:
            normal = _as_byte(normal, 'body-normal', 'Non-Color')
    albedo, rough, metal = _grade(ao, size, tuned, loud=loud, worn=worn, flat=seamed)
    if seamed:
        stamp_surface(obj, albedo)
        # The AO roughness draws contour lines. Paint is one roughness; the albedo carries the wear.
        _flatten_maps(rough, metal, size)
    connect_pbr(obj, albedo, rough, metal, normal, worn=worn)


def _flatten_maps(rough, metal, size):
    raw_r = _image_floats(rough)
    raw_m = _image_floats(metal)
    ch_r = max(int(rough.channels), 1)
    ch_m = max(int(metal.channels), 1)
    n = size * size
    for i in range(n):
        o = i * ch_r
        for c in range(min(3, ch_r)):
            raw_r[o + c] = 0.52
        o = i * ch_m
        for c in range(min(3, ch_m)):
            raw_m[o + c] = 0.40
    rough.pixels.foreach_set(raw_r)
    metal.pixels.foreach_set(raw_m)


def discard(part):
    for obj in list(part.meshes):
        bpy.data.objects.remove(obj, do_unlink=True)
    if part.root and part.root.name in bpy.data.objects:
        bpy.data.objects.remove(part.root, do_unlink=True)


def ray_hit(target, guess, normal):
    n = Vector(normal)
    if n.length < 1e-8:
        n = Vector((0, 0, 1))
    n.normalize()
    for start, dist in ((0.55, 1.4), (2.6, 5.5)):
        origin = Vector(guess) + n * start
        ok, loc, nor, _idx = target.ray_cast(origin, -n, distance=dist)
        if ok:
            if nor.dot(n) < 0:
                nor.negate()
            return loc, nor
    return None, None


def lay_gullwing(kit, hull, sign):
    """One diagonal shadow. Short overlapping pieces stay on the skin; a lip on each piece read as a stack of blocks."""
    y0, y1 = -0.88, 0.98
    z0, z1 = 0.36, 0.84
    steps = 7
    for i in range(steps):
        pad = 0.22 / steps
        t0 = max(0.0, i / steps - pad)
        t1 = min(1.0, (i + 1) / steps + pad)
        ya = y0 + (y1 - y0) * t0
        yb = y0 + (y1 - y0) * t1
        za = z0 + (z1 - z0) * t0
        zb = z0 + (z1 - z0) * t1
        part = kit.panel_slash(
            f'door-{sign:+d}-{i}',
            abs(yb - ya),
            zb - za,
            0.042,
            depth=0.012,
            lip=False,
        )
        y = (ya + yb) * 0.5
        z = (za + zb) * 0.5
        loc, _nor = ray_hit(hull, (sign * 1.35, y, z), (sign, 0.0, 0.0))
        if loc is None:
            print('MISS door', sign, i)
            discard(part)
            continue
        # Sit the dark gap in the skin. A proud bar on every piece was the stack.
        frame(part, (loc.x - sign * 0.004, y, z), (0, 1, 0), (0, 0, 1), (sign, 0, 0))


def lay_belt(kit, hull, sign):
    part = kit.seam(f'belt-{sign:+d}', 1.45, 0.028, 0.012)
    loc, _nor = ray_hit(hull, (sign * 1.35, 0.08, 0.36), (sign, 0.0, 0.0))
    if loc is None:
        print('MISS belt', sign)
        discard(part)
        return
    frame(part, loc, (0, 1, 0), (0, 0, 1), (sign, 0, 0))


def lay_jamb(kit, hull, sign):
    part = kit.seam(f'door-jamb-{sign:+d}', 0.42, 0.026, 0.012)
    loc, _nor = ray_hit(hull, (sign * 1.35, 0.82, 0.52), (sign, 0.0, 0.0))
    if loc is None:
        print('MISS jamb', sign)
        discard(part)
        return
    frame(part, loc, (0, 0, 1), (0, 1, 0), (sign, 0, 0))


def place_flush_louvers(kit, hull, lod):
    """Louver bars in the mouth of the deck. A buried pocket read as a flat black inset."""
    banks = (
        (-1.70, 0.98, 0.92, 0.46, 0.30, 8 if lod == 'high' else 5),
        (-2.14, 0.82, 1.00, 0.40, 0.46, 7 if lod == 'high' else 4),
    )
    depth = 0.05
    for i, (y, z, width, along, slope, slats) in enumerate(banks):
        part = kit.vent(f'louver-deck-{i}', width, along, depth, slats, inset=True)
        stick(kit, part, hull, (0.0, y, z), (0.0, -slope, 1.0), lift=-depth * 0.98)
    depth = 0.042
    tail_n = 6 if lod == 'high' else (4 if lod == 'medium' else 3)
    tail = kit.vent('louver-tail', 0.90, 0.22, depth, tail_n, inset=True)
    stick(kit, tail, hull, (0.0, -2.42, 0.58), (0.0, -1.0, 0.22), lift=-depth * 0.98)


def build(round_n, lod, out_path):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    try:
        bpy.ops.preferences.addon_enable(module='io_scene_gltf2')
    except RuntimeError:
        pass
    kit = Kit()
    detail = lod != 'low' and round_n >= 2
    rich = lod == 'high' and round_n >= 3
    bake = round_n >= 3
    tuned = round_n >= 4
    dressed = round_n >= 2
    faired = round_n >= 5
    loud = round_n >= 6
    split = round_n >= 7
    filled = round_n >= 8
    seamed = round_n >= 10
    # Round 11 keeps the round-10 surface, and deletes the parts that stood off it.
    flush = round_n >= 11
    # Round 12 puts the front drums inside the nose prongs and turns every drum
    # into a flat-faced cylinder. The side circle stays on the old station.
    housed = round_n >= 12
    wheel_rows = (
        (1, 1.48, 0.36),
        (-1, 1.48, 0.36),
        (1, -1.92, 0.30),
        (-1, -1.92, 0.30),
    )
    print(f'BUILD round {round_n} lod {lod} detail {detail} rich {rich} bake {bake} faired {faired} loud {loud} split {split} filled {filled} seamed {seamed} flush {flush} housed {housed}')

    stations = list(HULL)
    if split:
        # Wider cheeks so the open channel has two sides, without moving the side profile.
        # Same heights as the round-6 stations, so the side profile stays put.
        # The cheeks are wider in plan so the channel can be a real gap.
        stations[0] = (2.55, 1.02, 0.34, 0.50)
        stations[1] = (2.05, 1.06, 0.24, 0.66)
        stations[2] = (1.45, 1.00, 0.18, 0.80)
    if housed:
        # Halfway from the 1.45 station to the 0.75 station, on the old centreline.
        # The flat pod roof is the only new shape, so the side outline stays put
        # when the channel moves back over the front drums.
        stations.insert(3, (1.10, 0.99, 0.175, 0.87))
    hull = loft(
        [hull_section(*row, flare=faired, pod=housed and 1.05 <= row[0] <= 1.50) for row in stations],
        'hull', kit.body, SHARP, 0.9 if rich else 0.0, math.radians(50),
    )
    if detail:
        add_bevel(hull, 2 if lod == 'high' else 1, 0.006)
    if rich:
        add_subdiv(hull)
        add_weighted(hull)
    apply_mods(hull, math.radians(32 if detail else 50))
    if split:
        cut_nose_channel(hull, filled=filled, housed=housed)
        if housed:
            for sign, y, radius in wheel_rows:
                front = y > 0
                cut_axle_well(
                    hull, f'well-{sign:+d}-{y:+.2f}', sign, y, radius + 0.02,
                    radius * HOUSED_TREAD + 0.010,
                    0.56 if front else 0.50,
                    # Front opening stops just outside the tire, under the prong roof.
                    0.92 if front else 1.15,
                )
        if filled:
            darken_channel(hull, y0=1.04 if housed else 1.76)
    if filled and detail:
        # Thin diagonal slot. The dark gap mesh sits in it; a wide shallow bite just speckled.
        for sign in (1, -1):
            cut_ribbon(
                hull, f'door-groove-{sign:+d}',
                (sign * 0.98, 0.02, 0.60),
                (math.radians(18), 0.0, 0.0),
                (0.08, 1.08, 0.055),
            )

    canopy_rows = CANOPY
    if filled:
        # Same rake and peak, narrower in plan, so the roof around the glass stays body.
        # The outline stays. Round 10 only changes the glass colour, so the cabin stops reading as a cyan dome.
        # Same peak. Narrower in plan so the glass is a windshield, not a diamond cabin.
        canopy_rows = tuple((y, hw * 0.64, base, top) for y, hw, base, top in CANOPY)
    canopy = loft(
        [canopy_section(*row, shallow=filled) for row in canopy_rows],
        'canopy', kit.glass, set(), 0.0, math.radians(35),
    )
    solid = canopy.modifiers.new('Solidify', 'SOLIDIFY')
    solid.thickness = 0.012
    solid.offset = 0.0
    if detail:
        add_bevel(canopy, 1, 0.003)
    apply_mods(canopy, math.radians(35))

    seg = SEG[lod]
    slots = 3 if detail else (1 if lod != 'low' else 0)
    drum_x = 0.64 if faired else 0.78
    housed_specs = []
    for sign, y, radius in wheel_rows:
        width = 0.40 if abs(y) > 1 else 0.36
        # Front drums sit under the prong roof, inboard of the outer lip.
        # Rear drums stay in the tail fender.
        root_x = (0.70 if y > 0 else 0.78) if housed else drum_x
        part = place_wheel(
            kit, f'drum-{sign:+d}-{y:+.2f}', sign, y, radius, width, seg,
            slots if y > 0 or detail else 0, x=root_x, pressed=loud and not split, covered=split,
            panel=seamed, housed=housed,
        )
        if housed:
            housed_specs.append({
                'name': f'{sign:+d}-{y:+.2f}',
                'sign': sign,
                'y': y,
                'z': radius + 0.02,
                'radius': radius,
                'center_x': root_x + (HOUSED_INNER + HOUSED_OUTER) * 0.5,
                'well_r': radius * HOUSED_TREAD + 0.010,
                'well_x1': 0.92 if y > 0 else 1.15,
                'front': y > 0,
                'part': part,
            })
    if housed:
        assert_wheels_housed(hull, housed_specs)
    if faired:
        place_skirt(kit, 1, x=0.60, width=0.20, height=0.12, z=0.07)
        place_skirt(kit, -1, x=0.60, width=0.20, height=0.12, z=0.07)
    else:
        place_skirt(kit, 1)
        place_skirt(kit, -1)
    place_bar(kit, canopy, 0.84 if flush else (1.05 if loud else 0.84), 0.07 if flush else (0.058 if loud else 0.046))
    if seamed:
        red = bpy.data.materials.get('light-red')
        if red is not None:
            red.node_tree.nodes['Principled BSDF'].inputs['Emission Strength'].default_value = 2.2

    head_h = 0.05 if loud else 0.028
    tail_len = 1.45 if loud else 1.05
    tail_h = 0.08 if loud else 0.03
    bezel = kit.recess if flush else None
    if split:
        for sign in (1, -1):
            stick(
                kit, kit.light_strip(f'head-{sign:+d}', 0.26, head_h, 0.016, 'white', bezel=bezel),
                hull, (sign * 0.78, 2.28, 0.55), (0, 0.35, 1),
            )
    else:
        stick(kit, kit.light_strip('head', 0.72 if loud else 0.55, head_h, 0.016, 'white', bezel=bezel), hull, (0, 2.52, 0.42), (0, 1, 0.08))
    stick(kit, kit.light_strip('tail', tail_len, tail_h, 0.016, 'red', bezel=bezel), hull, (0, -2.45, 0.46), (0, -1, 0.2))
    amber_len = 0.36 if loud else (0.28 if faired else 0.14)
    amber_h = 0.07 if loud else (0.042 if faired else 0.022)
    amber_spots = ((1, 2.16), (-1, 2.16), (1, -2.40), (-1, -2.40)) if housed else ((1, 1.85), (-1, 1.85), (1, -2.15), (-1, -2.15))
    for sign, y in amber_spots:
        stick(
            kit, kit.light_strip(f'amber-{sign:+d}-{y:+.2f}', amber_len, amber_h, 0.012, 'amber', bezel=bezel),
            hull, (sign * 0.95, y, 0.48), (sign, 0.15, 0.2),
        )
    if detail:
        if faired:
            if seamed and flush:
                place_flush_louvers(kit, hull, lod)
            elif seamed:
                deck_n = 16 if lod == 'high' else (9 if lod == 'medium' else 5)
                tail_n = 10 if lod == 'high' else (6 if lod == 'medium' else 4)
                stick(
                    kit, kit.vent('louver-deck', 1.70, 1.08, 0.07, deck_n, inset=True),
                    hull, (0, -1.70, 0.84), (0, -0.2, 1), lift=0.0,
                )
                stick(
                    kit, kit.vent('louver-tail', 1.22, 0.32, 0.05, tail_n, inset=True),
                    hull, (0, -2.42, 0.52), (0, -1, 0.2), lift=0.0,
                )
            elif filled:
                banks = ((-1.32, 1.62, 0.56, 7), (-1.98, 1.42, 0.50, 6))
                for i, (y, width, height, slats) in enumerate(banks):
                    stick(
                        kit, kit.vent(f'louver-{i}', width, height, 0.08, slats if lod == 'high' else 4, contrast=True),
                        hull, (0, y, 0.76), (0, -0.35, 1), lift=0.0,
                    )
                stick(
                    kit, kit.vent('louver-tail', 1.40, 0.46, 0.09, 6 if lod == 'high' else 3, contrast=True),
                    hull, (0, -2.46, 0.50), (0, -1, 0.25), lift=0.0,
                )
            else:
                louver_h = 0.34 if loud else 0.18
                louver_n = 3 if loud else (5 if lod == 'high' else 3)
                for i, y in enumerate((-1.48, -1.86, -2.20)):
                    stick(
                        kit, kit.vent(
                            f'louver-{i}', 1.25 if loud else 1.15, louver_h, 0.06 if loud else 0.055,
                            louver_n, contrast=loud,
                        ),
                        hull, (0, y, 0.70), (0, -0.55, 1),
                    )
                stick(
                    kit, kit.vent(
                        'louver-tail', 1.15 if loud else 0.95, 0.32 if loud else 0.22, 0.06 if loud else 0.05,
                        3 if loud else (4 if lod == 'high' else 2), contrast=loud,
                    ),
                    hull, (0, -2.48, 0.50), (0, -1, 0.2),
                )
        else:
            for i, y in enumerate((-1.55, -1.85, -2.15)):
                stick(kit, kit.vent(f'louver-{i}', 0.72, 0.11, 0.022, 4 if lod == 'high' else 2), hull, (0, y, 0.78), (0, -0.35, 1))
        if not flush:
            # A bar across the glass. The ends cleared the canopy and read as a rod behind the lamp.
            stick(kit, kit.seam('hinge', 1.3, 0.012, 0.008), canopy, (0, -0.2, 1.30), (0, 0, 1))
        for sign in (1, -1):
            if faired:
                if filled and flush:
                    lay_gullwing(kit, hull, sign)
                    lay_belt(kit, hull, sign)
                    lay_jamb(kit, hull, sign)
                    if seamed:
                        # Ahead of the front drum. At 1.55 the panel lands in the wheel well.
                        cheek_y = 2.12 if housed else 1.55
                        cheek_z = 0.46 if housed else 0.50
                        cheek_x = 0.74 if housed else 0.82
                        cheek = kit.panel_inset(f'cheek-{sign:+d}', 0.48, 0.18, rim=0.018)
                        stick(kit, cheek, hull, (sign * cheek_x, cheek_y, cheek_z), (sign, 0.15, 0.45))
                        quarter = kit.panel_inset(f'quarter-{sign:+d}', 0.36, 0.14, rim=0.014)
                        stick(kit, quarter, hull, (sign * 0.95, -1.05, 0.62), (sign, -0.1, 0.35))
                elif filled:
                    part = kit.panel_slash(f'door-{sign:+d}', 2.2, 0.72, 0.13, depth=0.026)
                    frame(part, (sign * 1.00, 0.02, 0.60), (0, 1, 0), (0, 0, 1), (sign, 0, 0))
                    belt = kit.seam(f'belt-{sign:+d}', 2.35, 0.042, 0.018)
                    frame(belt, (sign * 1.00, 0.08, 0.36), (0, 1, 0), (0, 0, 1), (sign, 0, 0))
                    jamb = kit.seam(f'door-jamb-{sign:+d}', 0.46, 0.032, 0.016)
                    frame(jamb, (sign * 1.00, 0.98, 0.52), (0, 0, 1), (0, 1, 0), (sign, 0, 0))
                    if seamed:
                        # Panels the nose and pod cameras can see. A second slash sat off the hull and cut the side score.
                        cheek = kit.panel_inset(f'cheek-{sign:+d}', 0.48, 0.18, rim=0.018)
                        stick(kit, cheek, hull, (sign * 0.82, 1.55, 0.50), (sign, 0.15, 0.45))
                        quarter = kit.panel_inset(f'quarter-{sign:+d}', 0.36, 0.14, rim=0.014)
                        stick(kit, quarter, hull, (sign * 0.95, -1.05, 0.62), (sign, -0.1, 0.35))
                else:
                    part = kit.panel_slash(f'door-{sign:+d}', 1.9, 0.48, 0.055 if loud else 0.018)
                    frame(part, (sign * 1.04, -0.05, 0.72), (0, 1, 0), (0, 0, 1), (sign, 0, 0))
            else:
                part = kit.gullwing_lines(f'door-{sign:+d}', 1.7, 0.52, 0.028)
                stick(kit, part, hull, (sign * 0.95, -0.05, 0.55), (sign, 0, 0.15))
            stick(
                kit, kit.fan_grille(f'fan-{sign:+d}', 0.55, 0.18, 0.028, 4 if lod == 'high' else 2, glow=not loud),
                hull, (sign * 0.55, -0.15, 0.12), (0, 0, -1),
            )
        if faired and not split:
            stick(kit, kit.recess_plate('hood-gap', 0.62, 0.40), hull, (0, 1.70, 0.62), (0, 0.82, 0.35), lift=0.0)
            stick(kit, kit.satin_plate('hood-satin', 0.44, 0.24), hull, (0, 1.70, 0.64), (0, 0.82, 0.35), lift=0.004)
        elif not faired and not split:
            box('hood-satin', (-0.28, 1.20, 0.70), (0.28, 1.85, 0.732), kit.satin)
        if filled:
            # The housed slot comes back to the windshield, so the old cowl ray falls into it.
            cowl_y = 0.96 if housed else 1.28
            cowl_z = 0.90 if housed else 0.80
            stick(kit, kit.seam('cowl-seam', 1.15, 0.022, 0.014), hull, (0, cowl_y, cowl_z), (0, 0, 1), lift=0.002)
            if seamed:
                for i, guess in enumerate((
                    (0.98, 0.35, 0.82),
                    (-0.96, -0.15, 0.86),
                    (0.72, 1.35, 0.58),
                    (-1.02, -1.35, 0.70),
                    (0.58, -0.55, 0.98),
                    (-0.64, 0.7, 0.92),
                )):
                    flake = kit.chip_flake(f'chip-{i}', 0.055, 0.016)
                    stick(kit, flake, hull, guess, (guess[0], 0.0, 0.35))
            if not flush:
                # Axis-aligned slabs beside the glass. They read as fins, and the left one collapsed to a sheet.
                for sign in (1, -1):
                    box(
                        f'seal-{sign:+d}',
                        (sign * 0.58, -1.48, 0.82),
                        (sign * 0.66, 0.72, 0.90),
                        kit.rubber,
                    )
                box('seal-front', (-0.46, 0.74, 0.78), (0.46, 0.82, 0.88), kit.rubber)
        if faired:
            y0, y1 = (-0.35, 0.55) if loud else (-1.15, 0.95)
            half = 0.025 if loud else 0.04
            for sign in (1, -1):
                x = sign * 0.62
                # Overlaps the skirt. A strip under the skirt, clear of the skin, read as a loose bar.
                box(
                    f'rocker-{sign:+d}',
                    (x - half, y0, 0.06),
                    (x + half, y1, 0.10),
                    kit.lights['underglow'],
                )
        if rich:
            stick(kit, kit.bolt_cluster('bolts-door-r', 0.08, 0.05, 4, 3), hull, (0.9, 0.55, 0.7), (1, 0, 0.2))
            stick(kit, kit.bolt_cluster('bolts-door-l', 0.08, 0.05, 4, 4), hull, (-0.9, 0.55, 0.7), (-1, 0, 0.2))
            if not flush:
                for sign in (1, -1):
                    kit.place(kit.cable(
                        f'skirt-cable-{sign:+d}',
                        ((0, 0, 0), (0, 0.08, 0.04), (sign * 0.06, 0.16, 0.02)),
                        radius=0.008,
                    ), (sign * 0.8, -0.9, 0.32))
    if dressed:
        for sign in (1, -1):
            if filled:
                place_decal(kit, hull, sign, width=1.55, height=0.30)
            else:
                place_decal(kit, hull, sign)
        if not detail:
            # Sits in the belly. The old strip hung below the hull and failed the loose-part check.
            box('underglow', (-0.28, -0.55, 0.12), (0.28, 0.35, 0.18), kit.lights['underglow'])

    livery_dir = os.path.join(HARNESS, 'reviews', 'm2')
    os.makedirs(livery_dir, exist_ok=True)
    livery_png = os.path.join(livery_dir, 'livery-police.png')
    image = paint_livery(livery_png)
    assign_livery(kit.livery, image)
    assign_decal_uvs()

    bpy.context.view_layer.update()
    for obj in meshes():
        bake_world(obj)
    for obj in list(bpy.data.objects):
        if obj.type != 'MESH':
            bpy.data.objects.remove(obj, do_unlink=True)
    join_by_material()
    if bake:
        body = bpy.data.objects.get('body')
        if body:
            bake_body(body, TEX[lod], tuned, loud=loud, worn=filled, seamed=seamed)
        # Livery UVs were authored on the card. smart_project would put the word on the edge.
    objs = meshes()
    ok = sit_and_scale(objs)
    export_glb(out_path)
    if not ok:
        raise SystemExit(f'bounds out of range for {out_path}')


def main():
    argv = sys.argv
    argv = argv[argv.index('--') + 1:] if '--' in argv else []
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument('--round', type=int, default=4)
    parser.add_argument('--lod', choices=('low', 'medium', 'high', 'all'), default='high')
    parser.add_argument('--out', required=True)
    args = parser.parse_args(argv)
    if args.lod == 'all':
        os.makedirs(args.out, exist_ok=True)
        for lod in ('high', 'medium', 'low'):
            build(args.round, lod, os.path.join(args.out, f'spinner-{lod}.glb'))
    else:
        build(args.round, args.lod, args.out)


if __name__ == '__main__':
    main()
