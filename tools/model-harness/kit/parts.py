# Reusable hard-surface parts. Metres, Z up. Every part's local +Z is the outward face,
# local +X is the long axis, and the geometry sits on +Z so it stays proud of a host
# instead of disappearing inside it. place() aims +Z along a world normal.
#
# A later pass can dress a building or another vehicle with the same calls the spinner uses.
import math
import random

import bmesh
import bpy
from mathutils import Matrix, Vector


def _link(obj, collection):
    collection.objects.link(obj)
    return obj


def _finish(bm, name, mat, collection):
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    if mat is not None:
        obj.data.materials.append(mat)
    _link(obj, collection)
    _shade(obj, math.radians(45))
    return obj


def _shade(obj, angle):
    """Smooth by angle. Blender 4.1 dropped `use_auto_smooth`; the operator is the replacement."""
    mesh = obj.data
    if hasattr(mesh, 'use_auto_smooth'):
        mesh.use_auto_smooth = True
        mesh.auto_smooth_angle = angle
        for poly in mesh.polygons:
            poly.use_smooth = True
        return
    if obj.name not in bpy.context.view_layer.objects:
        for poly in mesh.polygons:
            poly.use_smooth = False
        return
    view = bpy.context.view_layer.objects
    prev_active = view.active
    prev_sel = [o for o in view if o.select_get()]
    try:
        if bpy.context.mode != 'OBJECT':
            bpy.ops.object.mode_set(mode='OBJECT')
        bpy.ops.object.select_all(action='DESELECT')
        obj.select_set(True)
        view.active = obj
        bpy.ops.object.shade_smooth_by_angle(angle=angle)
    except (RuntimeError, AttributeError, TypeError):
        for poly in mesh.polygons:
            poly.use_smooth = True
    finally:
        try:
            bpy.ops.object.select_all(action='DESELECT')
        except RuntimeError:
            pass
        for other in prev_sel:
            if other.name in view:
                other.select_set(True)
        if prev_active and prev_active.name in view:
            view.active = prev_active


def _box(name, lo, hi, mat, collection):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    sx = hi[0] - lo[0]
    sy = hi[1] - lo[1]
    sz = hi[2] - lo[2]
    bmesh.ops.scale(bm, verts=bm.verts, vec=(sx, sy, sz))
    bmesh.ops.translate(bm, verts=bm.verts, vec=(
        (lo[0] + hi[0]) * 0.5,
        (lo[1] + hi[1]) * 0.5,
        (lo[2] + hi[2]) * 0.5,
    ))
    return _finish(bm, name, mat, collection)


def _cylinder(name, radius, depth, segments, mat, collection, center=(0, 0, 0)):
    bm = bmesh.new()
    bmesh.ops.create_cone(
        bm, cap_ends=True, cap_tris=False, segments=segments,
        radius1=radius, radius2=radius, depth=depth,
    )
    if center != (0, 0, 0):
        bmesh.ops.translate(bm, verts=bm.verts, vec=center)
    return _finish(bm, name, mat, collection)


def _annulus(name, r_out, r_in, z0, z1, segments, mat, collection):
    bm = bmesh.new()

    def ring(z, radius):
        verts = []
        for i in range(segments):
            a = i * math.tau / segments
            verts.append(bm.verts.new((math.cos(a) * radius, math.sin(a) * radius, z)))
        return verts

    outer0 = ring(z0, r_out)
    outer1 = ring(z1, r_out)
    inner1 = ring(z1, r_in)
    inner0 = ring(z0, r_in)
    for i in range(segments):
        j = (i + 1) % segments
        bm.faces.new((outer0[i], outer0[j], outer1[j], outer1[i]))
        bm.faces.new((outer1[i], outer1[j], inner1[j], inner1[i]))
        bm.faces.new((inner1[i], inner1[j], inner0[j], inner0[i]))
        bm.faces.new((inner0[i], inner0[j], outer0[j], outer0[i]))
    return _finish(bm, name, mat, collection)


def _append_tube(bm, a, b, radius, segments):
    a = Vector(a)
    b = Vector(b)
    delta = b - a
    length = delta.length
    if length < 1e-5:
        return
    tmp = bmesh.new()
    bmesh.ops.create_cone(
        tmp, cap_ends=True, cap_tris=False, segments=segments,
        radius1=radius, radius2=radius, depth=length,
    )
    quat = Vector((0, 0, 1)).rotation_difference(delta.normalized())
    mat = quat.to_matrix().to_4x4()
    mat.translation = (a + b) * 0.5
    bmesh.ops.transform(tmp, verts=tmp.verts, matrix=mat)
    mapping = {v: bm.verts.new(v.co) for v in tmp.verts}
    for face in tmp.faces:
        try:
            bm.faces.new([mapping[v] for v in face.verts])
        except ValueError:
            pass
    tmp.free()


def basis_quat(normal, up=(0, 0, 1)):
    """Quaternion that maps local +Z onto `normal` and keeps local +X horizontal when it can."""
    n = Vector(normal).normalized()
    u = Vector(up)
    if abs(n.dot(u)) > 0.85:
        u = Vector((0, 1, 0))
    x = u.cross(n)
    if x.length < 1e-6:
        x = Vector((1, 0, 0)).cross(n)
    x.normalize()
    y = n.cross(x).normalized()
    m = Matrix((
        (x.x, y.x, n.x, 0),
        (x.y, y.y, n.y, 0),
        (x.z, y.z, n.z, 0),
        (0, 0, 0, 1),
    ))
    return m.to_quaternion()


def _principled(name, color, metallic, roughness, emission=None, strength=0.0):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = (*color, 1)
    bsdf.inputs['Metallic'].default_value = metallic
    bsdf.inputs['Roughness'].default_value = roughness
    if emission is not None:
        bsdf.inputs['Emission Color'].default_value = (*emission, 1)
        bsdf.inputs['Emission Strength'].default_value = strength
    return mat


class Part:
    def __init__(self, root, meshes):
        self.root = root
        self.meshes = meshes


class Kit:
    """Small library of vents, panels, lights, intakes, nozzles, antennas, cables, bolts."""

    def __init__(self, collection=None):
        if collection is None:
            collection = bpy.data.collections.new('kit')
            bpy.context.scene.collection.children.link(collection)
        self.collection = collection
        # Linear colours. Dark blue-black metal, not a mid grey, so night shots stay black.
        self.body = _principled('body', (0.012, 0.013, 0.016), 0.72, 0.40)
        self.recess = _principled('recess', (0.004, 0.004, 0.005), 0.25, 0.72)
        # Smoked metal. A cyan base with a sharp coat read as a glowing bubble.
        self.glass = _principled('glass', (0.010, 0.011, 0.012), 0.78, 0.20)
        self.rubber = _principled('rubber', (0.008, 0.008, 0.009), 0.0, 0.94)
        self.satin = _principled('satin', (0.018, 0.019, 0.022), 0.82, 0.22)
        # Dark fin. Satin slats caught the rim and turned into white slabs.
        self.fin = _principled('fin', (0.028, 0.029, 0.031), 0.28, 0.66)
        self.chip = _principled('chip', (0.46, 0.47, 0.49), 0.62, 0.36)
        self.livery = _principled('livery', (0.62, 0.60, 0.56), 0.08, 0.55)
        # Matte cover. A shiny drum face mirrors the night practicals into a turbine ring.
        self.drum = _principled('drum', (0.010, 0.011, 0.013), 0.22, 0.78)
        self.lights = {
            'white': _principled('light-white', (0.02, 0.02, 0.02), 0, 0.4, (1, 0.96, 0.9), 4),
            'red': _principled('light-red', (0.02, 0, 0), 0, 0.35, (1, 0.02, 0.015), 5),
            'blue': _principled('light-blue', (0, 0.01, 0.03), 0, 0.35, (0.15, 0.35, 1), 5),
            'amber': _principled('light-amber', (0.02, 0.01, 0), 0, 0.4, (1, 0.45, 0.08), 3),
            'strobe-red': _principled('light-strobe-red', (0.02, 0, 0), 0, 0.3, (1, 0.02, 0.02), 6),
            'strobe-blue': _principled('light-strobe-blue', (0, 0.01, 0.03), 0, 0.3, (0.12, 0.28, 1), 6),
            'nozzle': _principled('light-nozzle', (0.02, 0.008, 0), 0, 0.45, (1, 0.32, 0.06), 2.2),
            'underglow': _principled('light-underglow', (0.01, 0.02, 0.03), 0, 0.4, (0.55, 0.82, 1.0), 2.4),
        }

    def _root(self, name, meshes):
        root = bpy.data.objects.new(name, None)
        root.empty_display_size = 0.05
        _link(root, self.collection)
        for mesh in meshes:
            mesh.parent = root
        return Part(root, meshes)

    def place(self, part, location, normal=None, rotation=None, scale=None, lift=0.0):
        root = part.root
        if normal is not None:
            n = Vector(normal).normalized()
            root.rotation_mode = 'QUATERNION'
            root.rotation_quaternion = basis_quat(n)
            root.location = Vector(location) + n * lift
        else:
            root.location = Vector(location)
            if rotation is not None:
                root.rotation_mode = 'XYZ'
                root.rotation_euler = rotation
        if scale is not None:
            root.scale = Vector(scale)
        return part

    def vent(self, name, width, height, depth=0.02, slats=5, contrast=False, inset=False):
        col = self.collection
        meshes = []
        # Inset keeps the fins inside a black cavity. Proud satin bars read as white slabs.
        cavity_z = depth * (0.85 if inset else 0.45)
        meshes.append(_box(f'{name}-cavity', (-width / 2, -height / 2, 0.0), (width / 2, height / 2, cavity_z), self.recess, col))
        rim = max(0.005 if inset else 0.008, min(width, height) * (0.045 if inset else 0.12))
        z0, z1 = (depth * 0.55, depth * 0.78) if inset else (depth * 0.35, depth)
        frames = [
            ((-width / 2, -height / 2, z0), (width / 2, -height / 2 + rim, z1)),
            ((-width / 2, height / 2 - rim, z0), (width / 2, height / 2, z1)),
            ((-width / 2, -height / 2, z0), (-width / 2 + rim, height / 2, z1)),
            ((width / 2 - rim, -height / 2, z0), (width / 2, height / 2, z1)),
        ]
        frame_mat = self.recess if inset else self.body
        for i, (lo, hi) in enumerate(frames):
            meshes.append(_box(f'{name}-rim-{i}', lo, hi, frame_mat, col))
        inner_w = width - rim * 2
        inner_h = height - rim * 2
        if slats > 0 and inner_h > 0.01:
            gap = inner_h / slats
            if inset:
                slat_t = min(gap * 0.22, 0.010)
                slat_mat = self.fin
                z_a, z_b = depth * 0.22, depth * 0.58
            else:
                slat_t = min(gap * (0.62 if contrast else 0.42), 0.046 if contrast else 0.012)
                slat_mat = self.satin if contrast else self.body
                z_a, z_b = depth * 0.55, depth * 1.05
            for i in range(slats):
                y = -inner_h / 2 + gap * (i + 0.5)
                meshes.append(_box(
                    f'{name}-slat-{i}',
                    (-inner_w / 2, y - slat_t / 2, z_a),
                    (inner_w / 2, y + slat_t / 2, z_b),
                    slat_mat, col,
                ))
        return self._root(name, meshes)

    def panel_inset(self, name, width, height, rim=0.012, bolts=False):
        col = self.collection
        meshes = []
        meshes.append(_box(
            f'{name}-plate',
            (-width / 2 + rim, -height / 2 + rim, 0.001),
            (width / 2 - rim, height / 2 - rim, 0.008),
            self.recess, col,
        ))
        z0, z1 = 0.004, 0.014
        bars = [
            ((-width / 2, -height / 2, z0), (width / 2, -height / 2 + rim, z1)),
            ((-width / 2, height / 2 - rim, z0), (width / 2, height / 2, z1)),
            ((-width / 2, -height / 2, z0), (-width / 2 + rim, height / 2, z1)),
            ((width / 2 - rim, -height / 2, z0), (width / 2, height / 2, z1)),
        ]
        for i, (lo, hi) in enumerate(bars):
            meshes.append(_box(f'{name}-rim-{i}', lo, hi, self.body, col))
        if bolts:
            inset = rim + 0.01
            for i, (x, y) in enumerate((
                (-width / 2 + inset, -height / 2 + inset),
                (width / 2 - inset, -height / 2 + inset),
                (-width / 2 + inset, height / 2 - inset),
                (width / 2 - inset, height / 2 - inset),
            )):
                meshes.append(_cylinder(f'{name}-bolt-{i}', 0.006, 0.005, 6, self.body, col, (x, y, 0.012)))
        return self._root(name, meshes)

    def seam(self, name, length, width=0.01, depth=0.006):
        mesh = _box(name, (-length / 2, -width / 2, 0.001), (length / 2, width / 2, depth), self.recess, self.collection)
        return self._root(name, [mesh])

    def light_strip(self, name, length, height=0.03, depth=0.012, kind='white'):
        col = self.collection
        bezel = _box(name + '-bezel', (-length / 2, -height / 2, 0.0), (length / 2, height / 2, depth * 0.7), self.body, col)
        lamp = _box(
            name + '-lamp',
            (-length / 2 + height * 0.25, -height / 2 * 0.55, depth * 0.45),
            (length / 2 - height * 0.25, height / 2 * 0.55, depth),
            self.lights[kind], col,
        )
        return self._root(name, [bezel, lamp])

    def intake(self, name, width, height, depth=0.06, vanes=3):
        col = self.collection
        meshes = []
        meshes.append(_box(name + '-cavity', (-width / 2, -height / 2, 0.0), (width / 2, height / 2, depth * 0.7), self.recess, col))
        lip = max(0.01, min(width, height) * 0.14)
        z0, z1 = depth * 0.55, depth
        for i, (lo, hi) in enumerate((
            ((-width / 2, -height / 2, z0), (width / 2, -height / 2 + lip, z1)),
            ((-width / 2, height / 2 - lip, z0), (width / 2, height / 2, z1)),
            ((-width / 2, -height / 2, z0), (-width / 2 + lip, height / 2, z1)),
            ((width / 2 - lip, -height / 2, z0), (width / 2, height / 2, z1)),
        )):
            meshes.append(_box(f'{name}-lip-{i}', lo, hi, self.body, col))
        if vanes > 0:
            span = height - lip * 2
            for i in range(vanes):
                y = -span / 2 + span * (i + 0.5) / vanes
                meshes.append(_box(
                    f'{name}-vane-{i}',
                    (-width / 2 + lip, y - 0.004, depth * 0.35),
                    (width / 2 - lip, y + 0.004, depth * 0.85),
                    self.body, col,
                ))
        return self._root(name, meshes)

    def thruster_nozzle(self, name, radius=0.16, depth=0.07, vanes=8, segments=16):
        col = self.collection
        meshes = []
        # Tube, not a solid plug, so the emissive core reads through the opening.
        meshes.append(_annulus(name + '-body', radius * 0.98, radius * 0.70, 0.0, depth * 0.72, segments, self.body, col))
        meshes.append(_annulus(name + '-ring', radius, radius * 0.62, depth * 0.55, depth, segments, self.body, col))
        meshes.append(_cylinder(name + '-core', radius * 0.42, 0.01, max(8, segments // 2), self.lights['nozzle'], col, (0, 0, depth * 0.42)))
        for i in range(vanes):
            ang = i * math.tau / vanes
            bm = bmesh.new()
            bmesh.ops.create_cube(bm, size=1.0)
            bmesh.ops.scale(bm, verts=bm.verts, vec=(radius * 0.55, 0.008, depth * 0.28))
            bmesh.ops.translate(bm, verts=bm.verts, vec=(radius * 0.55, 0, depth * 0.62))
            rot = Matrix.Rotation(ang, 4, 'Z')
            bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0), matrix=rot)
            meshes.append(_finish(bm, f'{name}-vane-{i}', self.body, col))
        return self._root(name, meshes)

    def antenna(self, name, height=0.28, kind='blade'):
        col = self.collection
        if kind == 'whip':
            mast = _cylinder(name + '-mast', 0.006, height, 6, self.body, col, (0, 0, height * 0.5))
            bm = bmesh.new()
            bmesh.ops.create_uvsphere(bm, u_segments=8, v_segments=6, radius=0.014)
            bmesh.ops.translate(bm, verts=bm.verts, vec=(0, 0, height))
            tip = _finish(bm, name + '-tip', self.body, col)
            return self._root(name, [mast, tip])
        # Blade: wide at the root, narrow at the tip, so it reads at 30 m and vanishes into the silhouette at 200 m.
        bm = bmesh.new()
        w0, w1, t = 0.045, 0.012, 0.008
        bottom = [
            bm.verts.new((-w0, -t, 0)), bm.verts.new((w0, -t, 0)),
            bm.verts.new((w0, t, 0)), bm.verts.new((-w0, t, 0)),
        ]
        top = [
            bm.verts.new((-w1, -t * 0.6, height)), bm.verts.new((w1, -t * 0.6, height)),
            bm.verts.new((w1, t * 0.6, height)), bm.verts.new((-w1, t * 0.6, height)),
        ]
        for i in range(4):
            j = (i + 1) % 4
            bm.faces.new((bottom[i], bottom[j], top[j], top[i]))
        bm.faces.new(bottom)
        bm.faces.new(list(reversed(top)))
        blade = _finish(bm, name, self.body, col)
        return self._root(name, [blade])

    def cable(self, name, points, radius=0.008, segments=5):
        bm = bmesh.new()
        for a, b in zip(points, points[1:]):
            _append_tube(bm, a, b, radius, segments)
        mesh = _finish(bm, name, self.body, self.collection)
        return self._root(name, [mesh])

    def pipe(self, name, points, radius=0.016, segments=6):
        return self.cable(name, points, radius=radius, segments=segments)

    def bolt_cluster(self, name, width, height, count=6, seed=1):
        rng = random.Random(seed)
        cols = max(2, int(math.sqrt(count)))
        rows = max(1, math.ceil(count / cols))
        meshes = []
        n = 0
        for r in range(rows):
            for c in range(cols):
                if n >= count:
                    break
                x = -width / 2 + width * (c + 0.5) / cols + rng.uniform(-width * 0.04, width * 0.04)
                y = -height / 2 + height * (r + 0.5) / rows + rng.uniform(-height * 0.04, height * 0.04)
                meshes.append(_cylinder(f'{name}-{n}', 0.006, 0.005, 6, self.body, self.collection, (x, y, 0.004)))
                n += 1
        return self._root(name, meshes)

    def greeble_cluster(self, name, width, height, depth=0.04, count=8, seed=1):
        rng = random.Random(seed)
        meshes = []
        for i in range(count):
            w = rng.uniform(width * 0.12, width * 0.28)
            h = rng.uniform(height * 0.12, height * 0.3)
            d = rng.uniform(depth * 0.3, depth)
            x = rng.uniform(-width / 2 + w / 2, width / 2 - w / 2)
            y = rng.uniform(-height / 2 + h / 2, height / 2 - h / 2)
            if rng.random() < 0.35:
                meshes.append(_cylinder(
                    f'{name}-{i}', min(w, h) * 0.5, d, 6, self.body, self.collection,
                    (x, y, d * 0.5),
                ))
            else:
                meshes.append(_box(
                    f'{name}-{i}',
                    (x - w / 2, y - h / 2, 0.0),
                    (x + w / 2, y + h / 2, d),
                    self.body, self.collection,
                ))
        return self._root(name, meshes)

    def side_pod(self, name, length=2.4, width=0.28, height=0.32, nose=0.45, tail=0.28):
        """Flat skirt. Local +X forward, +Y up, +Z outward. Nose wedges in, tail is square."""
        bm = bmesh.new()
        n = 8

        def section(i):
            t = i / (n - 1)
            x = -length / 2 + length * t
            nose_t = 1 - nose / length
            tail_t = tail / length
            z_out = width
            y_top = height
            y_bot = 0.0
            if t > nose_t:
                k = (t - nose_t) / max(1 - nose_t, 1e-4)
                z_out = width * (1 - 0.72 * k)
                y_top = height * (1 - 0.45 * k)
                y_bot = height * 0.08 * k
            elif t < tail_t:
                k = 1 - t / max(tail_t, 1e-4)
                z_out = width * (1 - 0.18 * k)
                y_top = height * (1 - 0.12 * k)
            return x, y_bot, y_top, z_out

        rings = []
        for i in range(n):
            x, y0, y1, z1 = section(i)
            ring = [
                bm.verts.new((x, y0, 0.0)),
                bm.verts.new((x, y0, z1)),
                bm.verts.new((x, y1, z1)),
                bm.verts.new((x, y1 * 0.92, 0.02)),
            ]
            rings.append(ring)
        for i in range(n - 1):
            for k in range(4):
                k2 = (k + 1) % 4
                bm.faces.new((rings[i][k], rings[i][k2], rings[i + 1][k2], rings[i + 1][k]))
        try:
            bm.faces.new(rings[0])
        except ValueError:
            pass
        try:
            bm.faces.new(list(reversed(rings[-1])))
        except ValueError:
            pass
        mesh = _finish(bm, name, self.body, self.collection)
        return self._root(name, [mesh])

    def fan_grille(self, name, width=0.42, height=0.16, depth=0.03, slats=5, glow=False):
        """Recessed rectangular cover. Local +Z is out of the opening. Not a round disc."""
        col = self.collection
        meshes = []
        meshes.append(_box(
            name + '-back',
            (-width / 2, -height / 2, -depth),
            (width / 2, height / 2, -depth * 0.25),
            self.recess, col,
        ))
        rim = max(0.008, min(width, height) * 0.12)
        z0, z1 = -depth * 0.2, depth * 0.35
        for i, (lo, hi) in enumerate((
            ((-width / 2, -height / 2, z0), (width / 2, -height / 2 + rim, z1)),
            ((-width / 2, height / 2 - rim, z0), (width / 2, height / 2, z1)),
            ((-width / 2, -height / 2, z0), (-width / 2 + rim, height / 2, z1)),
            ((width / 2 - rim, -height / 2, z0), (width / 2, height / 2, z1)),
        )):
            meshes.append(_box(f'{name}-rim-{i}', lo, hi, self.body, col))
        inner_h = height - rim * 2
        if slats > 0 and inner_h > 0.012:
            gap = inner_h / slats
            thick = min(gap * 0.38, 0.01)
            for i in range(slats):
                y = -inner_h / 2 + gap * (i + 0.5)
                meshes.append(_box(
                    f'{name}-slat-{i}',
                    (-width / 2 + rim, y - thick / 2, -depth * 0.05),
                    (width / 2 - rim, y + thick / 2, depth * 0.45),
                    self.body, col,
                ))
        if glow:
            meshes.append(_box(
                name + '-glow',
                (-width / 2 + rim, -height / 2 + rim, -depth * 0.85),
                (width / 2 - rim, height / 2 - rim, -depth * 0.55),
                self.lights['underglow'], col,
            ))
        return self._root(name, meshes)

    def wheel_housing(self, name, radius=0.36, width=0.34, segments=24, slots=3, pressed=False, covered=False, panel=False):
        """Enclosed drum. Local +Z is out of the cover, circle in XY.

        covered: one flat body-coloured disc. No lip, no hub, no slots.
        panel: the same cover, with the centre set back so the close-up has a seam.
        Otherwise the face is a cap with an optional pressed ring and intake slots.
        """
        col = self.collection
        meshes = []
        if covered:
            # Same outer radius as the old lip, so the side bulge does not move.
            # The face lands on the body material and bakes with the hull.
            meshes.append(_cylinder(
                name + '-drum', radius * 0.98, width * 0.70, segments, self.body, col, (0, 0, width * 0.30),
            ))
            if panel:
                # Flush cover, a thin dark ring, centre almost level. A deep cap read as an open bore.
                meshes.append(_annulus(
                    name + '-face', radius * 0.98, radius * 0.64,
                    width * 0.90, width * 0.98, segments, self.body, col,
                ))
                meshes.append(_annulus(
                    name + '-step', radius * 0.66, radius * 0.58,
                    width * 0.86, width * 0.92, max(12, segments // 2), self.recess, col,
                ))
                meshes.append(_cylinder(
                    name + '-cap', radius * 0.60, width * 0.035, segments, self.body, col, (0, 0, width * 0.885),
                ))
            else:
                meshes.append(_cylinder(
                    name + '-face', radius * 1.02, width * 0.10, segments, self.body, col, (0, 0, width * 0.90),
                ))
            return self._root(name, meshes)
        lip_mat = self.satin if pressed else self.drum
        slot_half = 0.016 if pressed else 0.007
        meshes.append(_cylinder(name + '-drum', radius, width * 0.82, segments, self.drum, col, (0, 0, width * 0.38)))
        meshes.append(_annulus(
            name + '-lip', radius * 1.02, radius * (0.78 if pressed else 0.90),
            width * 0.70, width * 0.84, max(12, segments // 2), lip_mat, col,
        ))
        meshes.append(_cylinder(
            name + '-cap', radius * 0.86, width * 0.045, segments, self.drum, col, (0, 0, width * 0.80),
        ))
        meshes.append(_cylinder(
            name + '-hub', radius * 0.16, width * 0.03, max(8, segments // 2), self.recess, col, (0, 0, width * 0.84),
        ))
        if slots > 0:
            span = radius * 0.9
            step = span / max(slots, 1)
            for i in range(slots):
                y = -span / 2 + step * (i + 0.5)
                meshes.append(_box(
                    f'{name}-slot-{i}',
                    (-radius * 0.55, y - slot_half, width * 0.72),
                    (radius * 0.55, y + slot_half, width),
                    self.recess, col,
                ))
        return self._root(name, meshes)

    def light_bar(self, name, length=0.66, width=0.12, height=0.038):
        """Low red/blue bar. Local +X long, +Y across, +Z up. Not a fin."""
        col = self.collection
        meshes = [
            _box(name + '-housing', (-length / 2, -width / 2, 0.0), (length / 2, width / 2, height * 0.55), self.body, col),
        ]
        gap = length * 0.06
        meshes.append(_box(
            name + '-red',
            (-length / 2 + gap, -width * 0.31, height * 0.4),
            (-gap * 0.5, width * 0.31, height),
            self.lights['strobe-red'], col,
        ))
        meshes.append(_box(
            name + '-blue',
            (gap * 0.5, -width * 0.31, height * 0.4),
            (length / 2 - gap, width * 0.31, height),
            self.lights['strobe-blue'], col,
        ))
        return self._root(name, meshes)

    def panel_slash(self, name, length=1.7, rise=0.38, thick=0.016, depth=0.012):
        """Diagonal door cut. Local +X toward the nose, +Y up, +Z proud of the slab."""
        span = math.hypot(length, rise) or 1.0
        px, py = -rise / span, length / span
        x0, y0 = -length * 0.5, -rise * 0.5
        x1, y1 = length * 0.5, rise * 0.5

        def strip(suffix, mat, z0, z1, offset, half):
            bm = bmesh.new()
            rings = []
            ox, oy = px * offset, py * offset
            for x, y in ((x0, y0), (x1, y1)):
                cx, cy = x + ox, y + oy
                rings.append([
                    bm.verts.new((cx + px * half, cy + py * half, z0)),
                    bm.verts.new((cx - px * half, cy - py * half, z0)),
                    bm.verts.new((cx - px * half, cy - py * half, z1)),
                    bm.verts.new((cx + px * half, cy + py * half, z1)),
                ])
            for k in range(4):
                k2 = (k + 1) % 4
                bm.faces.new((rings[0][k], rings[0][k2], rings[1][k2], rings[1][k]))
            try:
                bm.faces.new(list(reversed(rings[0])))
            except ValueError:
                pass
            try:
                bm.faces.new(rings[1])
            except ValueError:
                pass
            return _finish(bm, f'{name}-{suffix}', mat, self.collection)

        # Wide black gap, thin bright lip. A wide satin band read as a stripe.
        gap = strip('gap', self.recess, 0.0, depth, 0.0, thick * 0.72)
        lip = strip('lip', self.satin, depth * 0.15, depth + 0.008, thick * 0.82, thick * 0.14)
        return self._root(name, [gap, lip])

    def fender_cheek(self, name, length=0.72, depth=0.30, height=0.40):
        """Upper arm from the slab (local z=0) onto the drum. Local +X nose, +Y up, +Z out."""
        bm = bmesh.new()

        def ring(z, hx, hy):
            return [
                bm.verts.new((-hx, -hy * 0.15, z)),
                bm.verts.new((hx, -hy * 0.15, z)),
                bm.verts.new((hx * 0.62, hy, z)),
                bm.verts.new((-hx * 0.62, hy, z)),
            ]

        inner = ring(0.0, length * 0.5, height * 0.5)
        outer = ring(depth, length * 0.34, height * 0.22)
        for k in range(4):
            k2 = (k + 1) % 4
            bm.faces.new((inner[k], inner[k2], outer[k2], outer[k]))
        try:
            bm.faces.new(list(reversed(inner)))
        except ValueError:
            pass
        try:
            bm.faces.new(outer)
        except ValueError:
            pass
        mesh = _finish(bm, name, self.body, self.collection)
        return self._root(name, [mesh])

    def recess_plate(self, name, width, height, depth=0.006):
        mesh = _box(
            name,
            (-width / 2, -height / 2, 0.0),
            (width / 2, height / 2, depth),
            self.recess, self.collection,
        )
        return self._root(name, [mesh])

    def satin_plate(self, name, width, height, depth=0.01):
        mesh = _box(
            name,
            (-width / 2, -height / 2, 0.0),
            (width / 2, height / 2, depth),
            self.satin, self.collection,
        )
        return self._root(name, [mesh])

    def gullwing_lines(self, name, length=1.6, height=0.42, gap=0.012):
        """Door outline in local XY, proud on +Z. Suggests the cut, does not open it."""
        col = self.collection
        d = 0.008
        meshes = [
            _box(name + '-top', (-length / 2, height / 2 - gap / 2, 0.001), (length / 2, height / 2 + gap / 2, d), self.recess, col),
            _box(name + '-bot', (-length / 2, -height / 2 - gap / 2, 0.001), (length / 2, -height / 2 + gap / 2, d), self.recess, col),
            _box(name + '-front', (length / 2 - gap / 2, -height / 2, 0.001), (length / 2 + gap / 2, height / 2, d), self.recess, col),
            _box(name + '-rear', (-length / 2 - gap / 2, -height / 2, 0.001), (-length / 2 + gap / 2, height / 2, d), self.recess, col),
        ]
        return self._root(name, meshes)

    def chip_flake(self, name, length=0.05, width=0.014):
        mesh = _box(
            name, (-length / 2, -width / 2, 0.0), (length / 2, width / 2, 0.003),
            self.chip, self.collection,
        )
        return self._root(name, [mesh])

    def livery_decal(self, name, width=0.92, height=0.15):
        """Flat decal card. Local +X reads the word, +Y up, +Z out."""
        mesh = _box(name, (-width / 2, -height / 2, 0.0), (width / 2, height / 2, 0.004), self.livery, self.collection)
        return self._root(name, [mesh])
