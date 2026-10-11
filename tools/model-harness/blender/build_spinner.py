# Headless spinner build. Source of truth for public/models/spinner/spinner-{high,medium,low}.glb.
#
# Blender is Z-up, nose +Y. glTF export (y-up) maps that to three.js: nose -Z, height +Y,
# origin stays on the ground-contact centre. Metres.
#
#   blender --background --python tools/model-harness/blender/build_spinner.py -- \
#       --round 3 --lod all --out public/models/spinner
#
# Rounds (same script, so the critic loop is a parameter change, not a hidden blend file):
#   1  lofted hull, faceted canopy, plain pods, skids, light strips
#   2  bevel, panels, vents, intakes, nozzles, canopy frame, spine  (low stays round-1)
#   3  high: subdiv + bolts + cables + greebles + 1024 AO bake
#      medium: greebles + 512 bake, no subdiv / bolts / cables
#      low: the simple shell
import math
import os
import subprocess
import sys
import array

import bmesh
import bpy
from mathutils import Matrix, Vector

HARNESS = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if HARNESS not in sys.path:
    sys.path.insert(0, HARNESS)

from kit.parts import Kit  # noqa: E402

# y (nose +), half-width, belly z, top z. Roof width is a fraction of half-width.
HULL = (
    (2.50, 0.04, 0.46, 0.50),
    (2.15, 0.32, 0.32, 0.60),
    (1.55, 0.70, 0.16, 0.74),
    (0.85, 0.96, 0.10, 0.88),
    (0.10, 1.08, 0.08, 0.92),
    (-0.70, 1.12, 0.08, 0.86),
    (-1.40, 0.90, 0.12, 0.70),
    (-2.00, 0.55, 0.22, 0.56),
    (-2.50, 0.16, 0.34, 0.46),
)
CANOPY = (
    (1.00, 0.22, 0.84, 0.98),
    (0.55, 0.46, 0.88, 1.16),
    (0.05, 0.50, 0.90, 1.40),
    (-0.40, 0.40, 0.84, 1.12),
    (-0.72, 0.16, 0.74, 0.90),
)
# Longitudinal corners that should stay crisp under bevel and subdivision.
SHARP = {2, 3, 4, 8, 9, 10}
SEG = {'high': 16, 'medium': 10, 'low': 6}
NOZZLE_VANES = {'high': 8, 'medium': 4, 'low': 0}
SLATS = {'high': 5, 'medium': 3, 'low': 0}


def roof_for(y):
    if y > 1.7:
        return 0.75
    if y > 0.5:
        return 0.48
    if y > -0.8:
        return 0.58
    return 0.42


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


def cylinder_y(name, radius, length, segments, mat, center):
    bm = bmesh.new()
    bmesh.ops.create_cone(
        bm, cap_ends=True, cap_tris=False, segments=segments,
        radius1=radius, radius2=radius, depth=length,
    )
    rot = Matrix.Rotation(math.radians(90), 4, 'X')
    bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0), matrix=rot)
    bmesh.ops.translate(bm, verts=bm.verts, vec=center)
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    obj.data.materials.append(mat)
    smooth(obj, math.radians(35))
    return link(obj)


def hull_section(y, hw, belly, top):
    rise = max(top - belly, 1e-4)
    roof = roof_for(y)
    pts = [
        (0.0, y, top),
        (hw * roof, y, top - rise * 0.04),
        (hw * 0.86, y, belly + rise * 0.62),
        (hw, y, belly + rise * 0.38),
        (hw * 0.90, y, belly + rise * 0.16),
        (hw * 0.48, y, belly + rise * 0.05),
        (0.0, y, belly),
    ]
    for i in (5, 4, 3, 2, 1):
        x, yy, z = pts[i]
        pts.append((-x, yy, z))
    return pts


def canopy_section(y, hw, base, top):
    rise = max(top - base, 1e-4)
    pts = [
        (0.0, y, top),
        (hw * 0.42, y, base + rise * 0.78),
        (hw, y, base + rise * 0.46),
        (hw * 0.78, y, base + rise * 0.06),
        (0.0, y, base),
    ]
    for i in (3, 2, 1):
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
    mod.angle_limit = math.radians(36)
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


def stick_euler(kit, part, target, guess, normal, euler, lift=0.002):
    loc = stick(kit, part, target, guess, normal, lift)
    # stick() aimed +Z along the surface. Override with a fixed yaw so a blade
    # antenna runs along the centreline instead of across it.
    part.root.rotation_mode = 'XYZ'
    part.root.rotation_euler = euler
    part.root.location = loc + Vector(normal).normalized() * lift
    return loc


def bake_world(obj):
    select_only(obj)
    if obj.parent:
        bpy.ops.object.parent_clear(type='CLEAR_KEEP_TRANSFORM')
    apply_mods(obj, obj.data.auto_smooth_angle or math.radians(45))
    select_only(obj)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)


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
        bpy.ops.uv.smart_project(angle_limit=1.15, island_margin=0.03)
    except RuntimeError as exc:
        print('smart_project failed', exc)
        bpy.ops.uv.lightmap_pack(PREF_MARGIN_DIV=512)
    bpy.ops.object.mode_set(mode='OBJECT')


def _ensure_world():
    if bpy.context.scene.world is None:
        bpy.context.scene.world = bpy.data.worlds.new('World')


def _bake_image(obj, size, bake_type):
    img = bpy.data.images.new('ao-bake', width=size, height=size, alpha=False, float_buffer=True)
    img.colorspace_settings.name = 'Non-Color'
    mat = obj.data.materials[0]
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    tex = nodes.new('ShaderNodeTexImage')
    tex.image = img
    nodes.active = tex
    for node in nodes:
        node.select = False
    tex.select = True
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    scene.cycles.samples = 8
    scene.cycles.use_denoising = False
    scene.render.bake.margin = 16
    scene.render.bake.use_clear = True
    select_only(obj)
    bpy.ops.object.bake(type=bake_type)
    return img


def _ao_variance(img):
    step = max(1, (img.size[0] * img.size[1]) // 8000)
    acc = 0.0
    acc2 = 0.0
    n = 0
    px = img.pixels
    for i in range(0, img.size[0] * img.size[1], step):
        v = px[i * 4]
        acc += v
        acc2 += v * v
        n += 1
    mean = acc / max(n, 1)
    var = acc2 / max(n, 1) - mean * mean
    return mean, var


def _grade(src, size):
    px = array.array('f', src.pixels)
    w = h = size
    aos = array.array('f', (px[i] for i in range(0, len(px), 4)))
    out = array.array('f', px)
    base = (0.013, 0.014, 0.017)

    def cell(gx, gy):
        n = (gx * 374761393 + gy * 668265263) & 0xFFFFFFFF
        n = (n ^ (n >> 13)) * 1274126177 & 0xFFFFFFFF
        return 0.78 + 0.22 * ((n & 0xFFFF) / 65535.0)

    for y in range(h):
        gy = min(47, int(y / h * 48))
        for x in range(w):
            i = y * w + x
            ao = aos[i]
            shade = 0.48 + 0.52 * ao
            gx = min(47, int(x / w * 48))
            wear = 1.0
            if ao > 0.72 and x > 0 and y > 0:
                neighbor = min(aos[i - 1], aos[i - w])
                if neighbor < ao - 0.18:
                    wear = 1.22
            k = shade * cell(gx, gy) * wear
            o = i * 4
            out[o] = min(1.0, base[0] * k)
            out[o + 1] = min(1.0, base[1] * k)
            out[o + 2] = min(1.0, base[2] * k)
            out[o + 3] = 1.0
    img = bpy.data.images.new('body-albedo', width=size, height=size, alpha=True, float_buffer=True)
    img.colorspace_settings.name = 'sRGB'
    img.pixels.foreach_set(out)
    img.pack()
    try:
        img.filepath_raw = '/tmp/m1-albedo.png'
        img.file_format = 'PNG'
        img.save()
    except RuntimeError as exc:
        print('albedo save failed', exc)
    return img


def _connect_albedo(obj, img):
    mat = obj.data.materials[0]
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    bsdf = nodes.get('Principled BSDF')
    for node in list(nodes):
        if node.type == 'TEX_IMAGE' and node.image and node.image.name == 'ao-bake':
            nodes.remove(node)
    tex = nodes.new('ShaderNodeTexImage')
    tex.image = img
    tex.location = (-300, 300)
    links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])
    bsdf.inputs['Metallic'].default_value = 0.72
    bsdf.inputs['Roughness'].default_value = 0.40


def bake_body(obj, size):
    _ensure_world()
    smart_uv(obj)
    img = None
    try:
        img = _bake_image(obj, size, 'AO')
        mean, var = _ao_variance(img)
        print(f'AO bake mean {mean:.4f} var {var:.6f}')
    except RuntimeError as exc:
        print('AO bake failed', exc)
        mean, var = 0.0, 0.0
    if img is None or var < 1e-5:
        print('AO flat or missing; baking an AO shader as emission')
        mat = obj.data.materials[0]
        nodes = mat.node_tree.nodes
        links = mat.node_tree.links
        ao = nodes.new('ShaderNodeAmbientOcclusion')
        ao.inputs['Distance'].default_value = 0.22
        emit = nodes.new('ShaderNodeEmission')
        out = nodes.get('Material Output')
        links.new(ao.outputs['Color'], emit.inputs['Color'])
        links.new(emit.outputs['Emission'], out.inputs['Surface'])
        try:
            img = _bake_image(obj, size, 'EMIT')
            mean, var = _ao_variance(img)
            print(f'EMIT-AO mean {mean:.4f} var {var:.6f}')
        except RuntimeError as exc:
            print('EMIT bake failed', exc)
            img = bpy.data.images.new('ao-bake', width=size, height=size, alpha=False, float_buffer=True)
            img.pixels.foreach_set(array.array('f', [1, 1, 1, 1] * (size * size)))
            print('grade will be noise only')
        # Put the principled surface back before connecting the albedo.
        bsdf = nodes.get('Principled BSDF')
        links.new(bsdf.outputs['BSDF'], out.inputs['Surface'])
    graded = _grade(img, size)
    _connect_albedo(obj, graded)


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
    length = mx.y - mn.y
    width = mx.x - mn.x
    height = mx.z - mn.z
    print(f'BEFORE scale L {length:.3f} W {width:.3f} H {height:.3f}')
    sx = 2.30 / width if width > 1e-4 else 1
    sy = 5.00 / length if length > 1e-4 else 1
    sz = 1.45 / height if height > 1e-4 else 1
    if all(0.82 < s < 1.18 for s in (sx, sy, sz)):
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
    ok = 4.6 <= length <= 5.4 and 2.0 <= width <= 2.7 and 1.2 <= height <= 1.6
    return ok


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
    subprocess.check_call([
        'gltfpack', '-i', raw, '-o', path,
        '-cc', '-km', '-kn', '-vp', '14', '-vn', '10', '-vt', '12',
    ])
    os.remove(raw)
    print('WROTE', path, os.path.getsize(path))


def make_skids(mat):
    for sx in (-0.42, 0.42):
        box(f'skid-{sx:+.2f}', (sx - 0.03, -1.15, 0.0), (sx + 0.03, 0.65, 0.04), mat)
        box(f'strut-a-{sx:+.2f}', (sx - 0.02, -0.75, 0.03), (sx + 0.02, -0.58, 0.12), mat)
        box(f'strut-b-{sx:+.2f}', (sx - 0.02, 0.22, 0.03), (sx + 0.02, 0.40, 0.12), mat)


def place_lights(kit, hull, canopy):
    stick(kit, kit.light_strip('head', 0.55, 0.032, 0.018, 'white'), hull, (0, 2.15, 0.55), (0, 1, 0.15))
    stick(kit, kit.light_strip('tail', 0.70, 0.036, 0.018, 'red'), hull, (0, -2.15, 0.42), (0, -1, 0.1))
    stick(kit, kit.light_strip('side-l', 0.22, 0.028, 0.014, 'amber'), hull, (-1.05, 0.15, 0.48), (-1, 0, 0.1))
    stick(kit, kit.light_strip('side-r', 0.22, 0.028, 0.014, 'amber'), hull, (1.05, 0.15, 0.48), (1, 0, 0.1))
    stick(kit, kit.light_strip('strobe-l', 0.28, 0.03, 0.045, 'strobe-red'), canopy, (-0.16, 0.05, 1.40), (0, 0, 1))
    stick(kit, kit.light_strip('strobe-r', 0.28, 0.03, 0.045, 'strobe-blue'), canopy, (0.16, 0.05, 1.40), (0, 0, 1))


def place_dress(kit, hull, pods, lod, rich):
    slats = SLATS[lod]
    vanes = 3 if lod == 'high' else 2
    bolts = rich
    panels = (
        ('hood', (0.0, 1.35, 0.78), (0, 0.35, 1), 0.52, 0.40),
        ('nose', (0.0, 1.95, 0.52), (0, 1, 0.2), 0.26, 0.14),
        ('deck', (0.0, -0.9, 0.78), (0, -0.15, 1), 0.58, 0.36),
        ('flank-l', (-1.02, -0.15, 0.40), (-1, 0, 0.12), 0.72, 0.26),
        ('flank-r', (1.02, -0.15, 0.40), (1, 0, 0.12), 0.72, 0.26),
        ('sill-l', (-0.9, 0.45, 0.20), (-0.3, 0.1, -1), 0.46, 0.12),
        ('sill-r', (0.9, 0.45, 0.20), (0.3, 0.1, -1), 0.46, 0.12),
    )
    for name, guess, normal, w, h in panels:
        stick(kit, kit.panel_inset(name, w, h, bolts=bolts), hull, guess, normal)
    for name, guess, normal in (
        ('intake-l', (-0.88, 0.25, 0.74), (-0.55, 0.1, 0.85)),
        ('intake-r', (0.88, 0.25, 0.74), (0.55, 0.1, 0.85)),
    ):
        stick(kit, kit.intake(name, 0.34, 0.16, 0.05, vanes), hull, guess, normal)
    stick(kit, kit.vent('deck-vent', 0.22, 0.10, 0.025, slats), hull, (0.0, -1.35, 0.68), (0, -0.2, 1))
    for y in (1.65, -1.55, -1.9):
        stick(kit, kit.seam(f'spine-{y:+.2f}', 0.38, 0.008, 0.006), hull, (0, y, 0.85), (0, 0, 1))
    # Canopy sill: a dark seam where the glass meets the roof, both sides and the windshield header.
    for name, guess, normal, length in (
        ('frame-l', (-0.42, 0.15, 0.95), (-0.7, 0, 0.7), 0.7),
        ('frame-r', (0.42, 0.15, 0.95), (0.7, 0, 0.7), 0.7),
        ('frame-front', (0.0, 0.85, 0.95), (0, 0.6, 0.8), 0.4),
    ):
        stick(kit, kit.seam(name, length, 0.012, 0.008), hull, guess, normal)
    segments = SEG[lod]
    nvanes = NOZZLE_VANES[lod]
    rear_l, rear_r, front_l, front_r = pods
    for pod, sign in ((rear_l, -1), (rear_r, 1)):
        stick(
            kit, kit.thruster_nozzle(f'nozzle-rear-{sign:+d}', 0.16, 0.07, nvanes, segments),
            pod, (sign * 0.95, -2.05, 0.40), (sign * 0.32, -1, 0.12),
        )
    for pod, sign in ((front_l, -1), (front_r, 1)):
        stick(
            kit, kit.thruster_nozzle(f'nozzle-front-{sign:+d}', 0.11, 0.05, max(0, nvanes // 2), segments),
            pod, (sign * 0.74, 1.32, 0.16), (0, 0.2, -1),
        )
        stick(kit, kit.vent(f'pod-vent-{sign:+d}', 0.16, 0.08, 0.02, max(2, slats // 2)), pod, (sign * 0.74, 1.32, 0.55), (0, 0, 1))


def place_greebles(kit, hull, count):
    spots = (
        ((-0.72, -1.45, 0.48), (-0.6, -0.3, 0.7), 0.16, 0.12, 11),
        ((0.72, -1.45, 0.48), (0.6, -0.3, 0.7), 0.16, 0.12, 12),
        ((-0.95, 0.1, 0.55), (-1, 0, 0.2), 0.14, 0.10, 13),
        ((0.95, 0.1, 0.55), (1, 0, 0.2), 0.14, 0.10, 14),
        ((0.0, 1.15, 0.82), (0, 0.2, 1), 0.12, 0.08, 15),
        ((0.0, -0.55, 0.84), (0, 0, 1), 0.12, 0.08, 16),
    )
    for i, (guess, normal, w, h, seed) in enumerate(spots[:count]):
        stick(kit, kit.greeble_cluster(f'greeble-{i}', w, h, 0.025, 4, seed), hull, guess, normal)


def place_rich(kit, hull):
    stick_euler(
        kit, kit.antenna('blade', 0.22, 'blade'), hull,
        (0.0, -1.05, 0.8), (0, 0, 1), (0, 0, math.pi / 2),
    )
    stick(kit, kit.antenna('whip', 0.16, 'whip'), hull, (0.08, -1.22, 0.75), (0, 0, 1))
    stick(kit, kit.bolt_cluster('bolts-intake-l', 0.08, 0.05, 4, 3), hull, (-0.7, 0.42, 0.7), (-0.4, 0.1, 1))
    stick(kit, kit.bolt_cluster('bolts-intake-r', 0.08, 0.05, 4, 4), hull, (0.7, 0.42, 0.7), (0.4, 0.1, 1))
    for sign, seed in ((-1, 21), (1, 22)):
        kit.place(kit.cable(
            f'pod-cable-{sign:+d}',
            ((0, 0, 0), (sign * 0.08, 0.06, 0.04), (sign * 0.16, 0.14, 0.02)),
            radius=0.007,
        ), (sign * 0.72, -1.25, 0.46))


def build(round_n, lod, out_path):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    try:
        bpy.ops.preferences.addon_enable(module='io_scene_gltf2')
    except RuntimeError:
        pass
    kit = Kit()
    detail = lod != 'low' and round_n >= 2
    rich = lod == 'high' and round_n >= 3
    greeble = lod != 'low' and round_n >= 3
    print(f'BUILD round {round_n} lod {lod} detail {detail} rich {rich}')

    sections = [hull_section(*row) for row in HULL]
    hull = loft(sections, 'hull', kit.body, SHARP, 0.85 if rich else 0.0, math.radians(50))
    if detail:
        add_bevel(hull, 2 if lod == 'high' else 1, 0.008)
    if rich:
        add_subdiv(hull)
        add_weighted(hull)
    apply_mods(hull, math.radians(50))

    canopy = loft(
        [canopy_section(*row) for row in CANOPY],
        'canopy', kit.glass, set(), 0.0, math.radians(35),
    )
    solid = canopy.modifiers.new('Solidify', 'SOLIDIFY')
    solid.thickness = 0.014
    solid.offset = 0.0
    if detail:
        add_bevel(canopy, 1, 0.003)
    apply_mods(canopy, math.radians(35))

    seg = SEG[lod]
    pods = (
        cylinder_y('pod-rear-l', 0.20, 0.78, seg, kit.body, (-0.95, -1.62, 0.40)),
        cylinder_y('pod-rear-r', 0.20, 0.78, seg, kit.body, (0.95, -1.62, 0.40)),
        cylinder_y('pod-front-l', 0.15, 0.52, seg, kit.body, (-0.74, 1.32, 0.34)),
        cylinder_y('pod-front-r', 0.15, 0.52, seg, kit.body, (0.74, 1.32, 0.34)),
    )
    make_skids(kit.body)
    place_lights(kit, hull, canopy)
    if detail:
        place_dress(kit, hull, pods, lod, rich)
    if greeble:
        place_greebles(kit, hull, 6 if rich else 3)
    if rich:
        place_rich(kit, hull)

    bpy.context.view_layer.update()
    for obj in meshes():
        bake_world(obj)
    for obj in list(bpy.data.objects):
        if obj.type != 'MESH':
            bpy.data.objects.remove(obj, do_unlink=True)
    join_by_material()
    if round_n >= 3 and lod != 'low':
        body = bpy.data.objects.get('body')
        if body:
            bake_body(body, 1024 if lod == 'high' else 512)
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
    parser.add_argument('--round', type=int, default=3)
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
