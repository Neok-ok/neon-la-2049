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
    _shade(obj, math.radians(45))
    return _link(obj, collection)


def _shade(obj, angle):
    mesh = obj.data
    mesh.use_auto_smooth = True
    mesh.auto_smooth_angle = angle
    for poly in mesh.polygons:
        poly.use_smooth = True


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
        self.glass = _principled('glass', (0.006, 0.008, 0.010), 0.88, 0.045)
        self.lights = {
            'white': _principled('light-white', (0.02, 0.02, 0.02), 0, 0.4, (1, 0.96, 0.9), 4),
            'red': _principled('light-red', (0.02, 0, 0), 0, 0.35, (1, 0.02, 0.015), 5),
            'blue': _principled('light-blue', (0, 0.01, 0.03), 0, 0.35, (0.15, 0.35, 1), 5),
            'amber': _principled('light-amber', (0.02, 0.01, 0), 0, 0.4, (1, 0.45, 0.08), 3),
            'strobe-red': _principled('light-strobe-red', (0.02, 0, 0), 0, 0.3, (1, 0.02, 0.02), 6),
            'strobe-blue': _principled('light-strobe-blue', (0, 0.01, 0.03), 0, 0.3, (0.12, 0.28, 1), 6),
            'nozzle': _principled('light-nozzle', (0.02, 0.008, 0), 0, 0.45, (1, 0.32, 0.06), 2.2),
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

    def vent(self, name, width, height, depth=0.02, slats=5):
        col = self.collection
        meshes = []
        meshes.append(_box(f'{name}-cavity', (-width / 2, -height / 2, 0.0), (width / 2, height / 2, depth * 0.45), self.recess, col))
        rim = max(0.008, min(width, height) * 0.12)
        z0, z1 = depth * 0.35, depth
        frames = [
            ((-width / 2, -height / 2, z0), (width / 2, -height / 2 + rim, z1)),
            ((-width / 2, height / 2 - rim, z0), (width / 2, height / 2, z1)),
            ((-width / 2, -height / 2, z0), (-width / 2 + rim, height / 2, z1)),
            ((width / 2 - rim, -height / 2, z0), (width / 2, height / 2, z1)),
        ]
        for i, (lo, hi) in enumerate(frames):
            meshes.append(_box(f'{name}-rim-{i}', lo, hi, self.body, col))
        inner_w = width - rim * 2
        inner_h = height - rim * 2
        if slats > 0 and inner_h > 0.01:
            gap = inner_h / slats
            slat_t = min(gap * 0.42, 0.012)
            for i in range(slats):
                y = -inner_h / 2 + gap * (i + 0.5)
                meshes.append(_box(
                    f'{name}-slat-{i}',
                    (-inner_w / 2, y - slat_t / 2, depth * 0.55),
                    (inner_w / 2, y + slat_t / 2, depth * 1.05),
                    self.body, col,
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
