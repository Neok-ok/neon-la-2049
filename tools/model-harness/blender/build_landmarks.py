#!/usr/bin/env python3
"""Headless landmark meshes for LAPD HQ, City Hall and the Wallace pyramid.

Metres, landmark space (+X right, +Y up, +Z depth). Blender is Z-up, so a
landmark point (x, y, z) is stored as (x, -z, y) and the glTF exporter's Y-up
conversion puts it back. The shell is stitched into one mesh: overlapping
solids share a vertex, so stairs and pads are not loose plates. Door openings
are cut from the podium before that stitch. The kit in
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
from mathutils.bvhtree import BVHTree

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
    _force_outward(bm)
    return mesh_of(bm, name)


def _force_outward(bm):
    """Consistent normals. A negative volume means they point into the solid."""
    if not bm.faces:
        return
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    volume = 0.0
    for face in bm.faces:
        volume += face.calc_center_median().dot(face.normal) * face.calc_area()
    if volume < 0:
        bmesh.ops.reverse_faces(bm, faces=list(bm.faces))


def _object_mode():
    if bpy.context.mode != 'OBJECT':
        bpy.ops.object.mode_set(mode='OBJECT')


def bool_op(host, other, operation, solver='EXACT'):
    """One boolean. The tower is not fused this way: a union of the whole stack stalls.

    Interior recesses use Exact. Fast retriangulates the outer wall and drops
    the quad above a door, so glass in that band has nothing to sit on.
    """
    _object_mode()
    mod = host.modifiers.new('bool', 'BOOLEAN')
    mod.operation = operation
    mod.solver = solver
    mod.object = other
    bpy.context.view_layer.objects.active = host
    host.select_set(True)
    bpy.ops.object.modifier_apply(modifier=mod.name)
    bpy.data.objects.remove(other, do_unlink=True)
    host.select_set(False)
    return host


def _aabb_obj(ob):
    xs = [v.co.x for v in ob.data.vertices]
    ys = [v.co.y for v in ob.data.vertices]
    zs = [v.co.z for v in ob.data.vertices]
    return (min(xs), min(ys), min(zs), max(xs), max(ys), max(zs))


def _aabb_bm(bm):
    xs = [v.co.x for v in bm.verts]
    ys = [v.co.y for v in bm.verts]
    zs = [v.co.z for v in bm.verts]
    return (min(xs), min(ys), min(zs), max(xs), max(ys), max(zs))


def _cutter_aabb(cx, cz, y, w, d, h):
    # Landmark (x, z, y) stored as Blender (x, -z, y).
    return (
        cx - w * 0.5,
        -(cz + d * 0.5),
        y,
        cx + w * 0.5,
        -(cz - d * 0.5),
        y + h,
    )


def _aabb_overlap(a, b, min_span=0.0):
    return all(min(a[i + 3], b[i + 3]) - max(a[i], b[i]) > min_span for i in range(3))


def _in_box(p, box, pad=0.0):
    return all(box[i] - pad <= p[i] <= box[i + 3] + pad for i in range(3))


def _pt(axis_val, u, u_val, v, v_val):
    p = [0.0, 0.0, 0.0]
    p[axis_val[0]] = axis_val[1]
    p[u] = u_val
    p[v] = v_val
    return tuple(p)


def punch_box(ob, hole):
    """Open a rectangular recess in an axis-aligned box. The float boolean leaves the front quad in place."""
    if len(ob.data.vertices) != 8:
        return False
    xs = [v.co.x for v in ob.data.vertices]
    ys = [v.co.y for v in ob.data.vertices]
    zs = [v.co.z for v in ob.data.vertices]
    o = [min(xs), min(ys), min(zs), max(xs), max(ys), max(zs)]
    axis = None
    sign = 0
    for i in range(3):
        if hole[i] < o[i] - 1e-3:
            axis, sign = i, -1
            break
        if hole[i + 3] > o[i + 3] + 1e-3:
            axis, sign = i, 1
            break
    if axis is None:
        return False
    face = o[axis] if sign < 0 else o[axis + 3]
    inner = hole[axis + 3] if sign < 0 else hole[axis]
    inner = min(o[axis + 3] - 0.08, max(o[axis] + 0.08, inner))
    others = [j for j in range(3) if j != axis]
    u, v = others
    hu0 = max(hole[u], o[u] + 0.02)
    hu1 = min(hole[u + 3], o[u + 3] - 0.02)
    hv0 = max(hole[v], o[v] + 0.02)
    hv1 = min(hole[v + 3], o[v + 3] - 0.02)
    if hu1 - hu0 < 0.2 or hv1 - hv0 < 0.2:
        return False
    u0, u1 = o[u], o[u + 3]
    v0, v1 = o[v], o[v + 3]
    bm = bmesh.new()
    cache = {}

    def V(p):
        key = tuple(round(c, 4) for c in p)
        vert = cache.get(key)
        if vert is None:
            vert = bm.verts.new(p)
            cache[key] = vert
        return vert

    def quad(a, b, c, d):
        try:
            bm.faces.new((V(a), V(b), V(c), V(d)))
        except ValueError:
            pass

    def face_quad(axis_k, value):
        a, b = [j for j in range(3) if j != axis_k]
        corners = []
        for ia, ib in ((0, 0), (1, 0), (1, 1), (0, 1)):
            p = [0.0, 0.0, 0.0]
            p[axis_k] = value
            p[a] = o[a] if ia == 0 else o[a + 3]
            p[b] = o[b] if ib == 0 else o[b + 3]
            corners.append(tuple(p))
        quad(*corners)

    for k in range(3):
        for side, value in ((-1, o[k]), (1, o[k + 3])):
            if k == axis and (value == face):
                continue
            face_quad(k, value)
    along = (axis, face)
    inner_at = (axis, inner)
    # Picture frame. Each band is a rectangle. A trapezoid from the sill up to
    # the door head leaves the wall above the opening as a diagonal gap, and
    # glass in that gap is a loose plate.
    quad(_pt(along, u, u0, v, v0), _pt(along, u, u1, v, v0), _pt(along, u, u1, v, hv0), _pt(along, u, u0, v, hv0))
    quad(_pt(along, u, u0, v, hv1), _pt(along, u, u1, v, hv1), _pt(along, u, u1, v, v1), _pt(along, u, u0, v, v1))
    quad(_pt(along, u, u0, v, hv0), _pt(along, u, hu0, v, hv0), _pt(along, u, hu0, v, hv1), _pt(along, u, u0, v, hv1))
    quad(_pt(along, u, hu1, v, hv0), _pt(along, u, u1, v, hv0), _pt(along, u, u1, v, hv1), _pt(along, u, hu1, v, hv1))
    for a0, b0, a1, b1 in (
        (hu0, hv0, hu1, hv0),
        (hu1, hv0, hu1, hv1),
        (hu1, hv1, hu0, hv1),
        (hu0, hv1, hu0, hv0),
    ):
        quad(_pt(along, u, a0, v, b0), _pt(along, u, a1, v, b1), _pt(inner_at, u, a1, v, b1), _pt(inner_at, u, a0, v, b0))
    quad(
        _pt(inner_at, u, hu0, v, hv0), _pt(inner_at, u, hu1, v, hv0),
        _pt(inner_at, u, hu1, v, hv1), _pt(inner_at, u, hu0, v, hv1),
    )
    _force_outward(bm)
    bm.to_mesh(ob.data)
    bm.free()
    ob.data.update()
    return True


def apply_cutters(objs, cutters):
    """Open doors in the podium. A box gets an explicit recess; the float boolean leaves the front quad."""
    if not cutters:
        return
    for cx, cz, y, w, d, h in cutters:
        box = _cutter_aabb(cx, cz, y, w, d, h)
        for ob in list(objs):
            if ob is None or ob.name not in bpy.data.objects or len(ob.data.vertices) == 0:
                continue
            if not _aabb_overlap(_aabb_obj(ob), box, 0.02):
                continue
            if punch_box(ob, box):
                print('punch', ob.name, 'verts', len(ob.data.vertices), flush=True)
                continue
            cutter = make_box('cut', cx, cz, y, w, d, h)
            before = len(ob.data.vertices)
            bool_op(ob, cutter, 'DIFFERENCE')
            print('cut', ob.name, 'verts', before, '->', len(ob.data.vertices), flush=True)
            if len(ob.data.vertices) == 0:
                bpy.data.objects.remove(ob, do_unlink=True)
                objs.remove(ob)


def _overlap_candidates(a, b):
    mn = [max(a[i], b[i]) for i in range(3)]
    mx = [min(a[i + 3], b[i + 3]) for i in range(3)]
    span = [mx[i] - mn[i] for i in range(3)]
    if any(s < 0.004 for s in span):
        return []
    fracs = []
    for s in span:
        fracs.append((0.5,) if s < 0.06 else (0.18, 0.5, 0.82))
    out = []
    for u in fracs[0]:
        for v in fracs[1]:
            for w in fracs[2]:
                out.append(tuple(mn[i] + span[i] * t for i, t in enumerate((u, v, w))))
    return out


def _inside(tree, point):
    """Parity of a ray. Face normals on the frustum point inward, so a half-space test lies."""
    origin = Vector(point)
    loc, _normal, _index, dist = tree.find_nearest(origin)
    if loc is not None and dist <= 0.002:
        return True
    direction = Vector((1.0, 0.017, 0.011))
    hits = 0
    for _ in range(12):
        hit, _normal, _index, travelled = tree.ray_cast(origin, direction)
        if hit is None:
            break
        hits += 1
        origin = hit + direction * 0.02
    return hits % 2 == 1


def _link_interior(bm, tree, point):
    """Share `point` with the shell by splitting the nearest face. The link stays inside."""
    loc, normal, index, dist = tree.find_nearest(Vector(point))
    if loc is None or index is None:
        return False
    bm.faces.ensure_lookup_table()
    bm.verts.ensure_lookup_table()
    face = bm.faces[index]
    s = None
    for vert in face.verts:
        if (vert.co - loc).length <= 0.001:
            s = vert
            break
    old = face.normal.copy()
    if s is None:
        s = bm.verts.new(loc)
        verts = [vert for vert in face.verts]
        bm.faces.remove(face)
        for i in range(len(verts)):
            try:
                nf = bm.faces.new((verts[i], verts[(i + 1) % len(verts)], s))
            except ValueError:
                continue
            if nf.normal.dot(old) < 0:
                nf.normal_flip()
    p = bm.verts.new(Vector(point))
    axis = p.co - s.co
    if axis.length < 1e-5:
        axis = Vector((0.0, 0.0, 1.0))
    axis.normalize()
    perp = axis.cross(Vector((1.0, 0.0, 0.0)))
    if perp.length < 1e-4:
        perp = axis.cross(Vector((0.0, 1.0, 0.0)))
    perp.normalize()
    offset = min(0.008, max(0.002, dist * 0.35))
    q = bm.verts.new(p.co + perp * offset)
    try:
        bm.faces.new((s, p, q))
    except ValueError:
        return False
    return True


def stitch_objects(objs, forbidden=None):
    """One mesh. Overlapping solids share a vertex so stray sees a single shell.

    A boolean union of the whole tower stalls. These solids already overlap, and
    a shared vertex welds the islands without a CSG pass.
    """
    objs = [ob for ob in objs if ob and ob.name in bpy.data.objects and len(ob.data.vertices)]
    if not objs:
        raise RuntimeError('no solids to stitch')
    if len(objs) == 1:
        return objs[0]
    forbidden = forbidden or []
    entries = []
    for ob in objs:
        bm = bmesh.new()
        bm.from_mesh(ob.data)
        _force_outward(bm)
        entries.append({
            'ob': ob, 'bm': bm, 'tree': None, 'box': None,
            'shell': BVHTree.FromBMesh(bm),
        })

    for entry in entries:
        _refresh_entry(entry)
    parent = list(range(len(entries)))

    def find(i):
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    def count():
        return len({find(i) for i in range(len(entries))})

    rounds = 0
    while count() > 1 and rounds < len(entries) + 3:
        rounds += 1
        print('stitch', len(entries), 'left', count(), flush=True)
        groups = {}
        for i in range(len(entries)):
            groups.setdefault(find(i), []).append(i)
        linked = False
        roots = list(groups)
        for ai in range(len(roots)):
            for bi in range(ai + 1, len(roots)):
                pair = _bridge(entries, groups[roots[ai]], groups[roots[bi]], forbidden)
                if pair is None:
                    continue
                i, j = pair
                parent[find(j)] = find(i)
                linked = True
                break
            if linked:
                break
        if not linked:
            break
    left = count()
    if left > 1:
        groups = {}
        for i in range(len(entries)):
            groups.setdefault(find(i), []).append(f'{i}:{entries[i]["ob"].name}')
        print('STITCH OPEN', groups, flush=True)
        raise RuntimeError(f'stitch left {left} shells from {len(entries)} solids')
    for entry in entries:
        entry['bm'].to_mesh(entry['ob'].data)
        entry['bm'].free()
    _object_mode()
    bpy.ops.object.select_all(action='DESELECT')
    for entry in entries:
        entry['ob'].select_set(True)
    host = entries[0]['ob']
    bpy.context.view_layer.objects.active = host
    bpy.ops.object.join()
    bm = bmesh.new()
    bm.from_mesh(host.data)
    bmesh.ops.remove_doubles(bm, verts=list(bm.verts), dist=0.001)
    bm.to_mesh(host.data)
    bm.free()
    host.data.update()
    print('stitched', len(host.data.polygons), 'faces', flush=True)
    return host


def _refresh_entry(entry):
    entry['tree'] = BVHTree.FromBMesh(entry['bm'])
    entry['box'] = _aabb_bm(entry['bm'])


def _bridge(entries, group_a, group_b, forbidden):
    for i in group_a:
        for j in group_b:
            for point in _overlap_candidates(entries[i]['box'], entries[j]['box']):
                if any(_in_box(point, box, 0.02) for box in forbidden):
                    continue
                if not _inside(entries[i]['shell'], point) or not _inside(entries[j]['shell'], point):
                    continue
                ok_i = _link_interior(entries[i]['bm'], entries[i]['tree'], point)
                if ok_i:
                    _refresh_entry(entries[i])
                ok_j = ok_i and _link_interior(entries[j]['bm'], entries[j]['tree'], point)
                if ok_j:
                    _refresh_entry(entries[j])
                    return i, j
            linked = _bridge_through_surface(entries, i, j, forbidden)
            if linked is not None:
                return linked
    return None


def _bridge_through_surface(entries, i, j, forbidden):
    """Weld a box whose volume crosses a coarse shell.

    Ray parity on the low pyramid is even, so an interior sample never counts
    as inside. The face still crosses the pylon: the nearest point of that
    face lies in the box, and a point just off it is shared by both meshes.
    """
    small, large = sorted((i, j), key=lambda k: len(entries[k]['bm'].verts))
    if len(entries[small]['bm'].verts) > 16:
        return None
    box = entries[small]['box']
    tree = entries[large]['shell']
    mn = [box[k] + 0.05 for k in range(3)]
    mx = [box[k + 3] - 0.05 for k in range(3)]
    spans = [mx[k] - mn[k] for k in range(3)]
    if any(s <= 0.05 for s in spans):
        return None
    for u in (0.25, 0.5, 0.75):
        for v in (0.25, 0.5, 0.75):
            for w in (0.25, 0.5, 0.75):
                sample = Vector(tuple(mn[k] + spans[k] * t for k, t in enumerate((u, v, w))))
                loc, _normal, _index, _dist = tree.find_nearest(sample)
                if loc is None or not _in_box((loc.x, loc.y, loc.z), box, 0.02):
                    continue
                delta = sample - loc
                if delta.length < 1e-5:
                    delta = Vector((0.0, 0.0, 0.04))
                else:
                    delta.normalize()
                    delta *= 0.04
                point = loc + delta
                if not _in_box((point.x, point.y, point.z), box, 0.0):
                    point = loc.lerp(sample, 0.5)
                pt = (point.x, point.y, point.z)
                if any(_in_box(pt, banned, 0.02) for banned in forbidden):
                    continue
                if not _link_interior(entries[large]['bm'], entries[large]['tree'], pt):
                    continue
                _refresh_entry(entries[large])
                if not _link_interior(entries[small]['bm'], entries[small]['tree'], pt):
                    continue
                _refresh_entry(entries[small])
                print('surface bridge', entries[large]['ob'].name, entries[small]['ob'].name, flush=True)
                return large, small
    return None


def graft_boxes(host, boxes):
    """Weld extra boxes onto an existing shell. `boxes` are landmark (cx, cz, y, w, d, h)."""
    objs = [host]
    for cx, cz, y, w, d, h in boxes:
        objs.append(make_box('graft', cx, cz, y, w, d, h))
    return stitch_objects(objs, [])


class Mass:
    """Positive solids, then cutters. Parts feed the stray silhouette."""

    def __init__(self):
        self.solids = []
        self.parts = []
        self.cutters = []

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
        forbidden = [_cutter_aabb(*cutter) for cutter in self.cutters]
        apply_cutters(self.solids, self.cutters)
        self.cutters = []
        self.solids = [
            ob for ob in self.solids
            if ob and ob.name in bpy.data.objects and len(ob.data.vertices)
        ]
        host = stitch_objects(self.solids, forbidden)
        self.solids = [host]
        return host

    def cut(self, cx, cz, y, w, d, h):
        # Recorded and applied on fuse, while each solid is still one box.
        self.cutters.append((cx, cz, y, w, d, h))
        return None


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
    hit, loc, normal, _idx = obj.closest_point_on_mesh(Vector(point))
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
    nmap.inputs['Strength'].default_value = {'lapd': 0.55, 'hall': 0.85, 'wallace': 1.65}[kind]
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


def place_lamp(kit, name, x, y, z, normal, length, height, kind, lift=-0.12):
    # The bezel starts 1 cm inside the face. A centred strip leaves every
    # sample 3 cm off the plane, and the recess then fails the 2 cm touch.
    part = kit.light_strip(name, length, height, 0.24, kind, bezel=kit.recess)
    kit.place(part, bl_point(x, y, z), normal=bl_normal(*normal), lift=lift)


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
        # 2 cm of overlap so the treads share a volume and can be stitched.
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
    # Bite stays under the door leaf. The top tread already overlaps the podium.
    mass.box(0, z1, y1 - 0.45, width, 1.4, 0.4, record=False)


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
HQ = dict(height=216, podiumW=86, podiumD=118, podiumH=18, shaftW=80, shaftD=108,
          crownW=124, crownD=154, crownH=28, lobbyFloor=5.2, lobbyCeil=12.4,
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
    # Dark wet concrete. Crushing the map under 0.25 turns the shaft into a black field.
    if y > HQ['height'] - 1.0:
        # The overhead still is a dark block, not a pale pad and not a black hole.
        tone = 0.72 + 0.08 * blot(x, z, 14.0)
        return (tone * 0.90, tone * 0.92, tone * 0.95)
    tone = 0.86 + 0.1 * blot(x + z * 0.13, y * 0.35, 42.0)
    if y < 2.4:
        tone *= 0.94
    tone = max(0.78, min(0.98, tone))
    return (tone * 0.92, tone * 0.94, tone * 0.97)


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
    if rank >= 1:
        for lx, lz in ((-28, -38), (28, -38), (-28, 38), (28, 38)):
            place_lamp(kit, f'pad-{lx}-{lz}', lx, HQ['height'] + HQ['padH'], lz, (0, 1, 0), 4.5, 0.28, 'amber')
        place_lamp(kit, 'mast', 0, HQ['height'] + HQ['padH'] + 5.6, 0, (0, 1, 0), 1.1, 0.28, 'amber')
    if rank >= 2:
        for i, y in enumerate(range(24, 150, 12)):
            # The mechanical belts sit outside the shaft. A seam under a belt is buried.
            if 56 <= y <= 66 or 104 <= y <= 116:
                continue
            place_seam(kit, f'seam-{i}', 0, y, face, (0, 0, -1), 60)
        place_vent(kit, 'vent-a', -30, 70, face, (0, 0, -1), 6.5, 3.2)
        place_vent(kit, 'vent-b', 30, 124, face, (0, 0, -1), 6.5, 3.2)
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
    # Limestone shaft, a slightly darker granite base, and a tiled pyramid.
    # The cap is a different material from the white shaft.
    # White limestone. The night still is floodlit stone, not a tan render.
    if y < 26:
        tone = 0.62 + 0.05 * blot(x, y, 9.0)
        return (tone * 0.96, tone * 0.95, tone * 0.92)
    if y >= 112:
        tone = 0.84 + 0.04 * blot(x * 0.4, y, 6.0)
        return (tone * 0.99, tone * 0.985, tone * 0.96)
    tone = 0.97 + 0.03 * blot(x + z * 0.2, y * 0.25, 22.0)
    return (tone * 0.995, tone * 0.99, tone * 0.975)


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
    # Thin setbacks and a drum. The nine-course voxel and the gold cap are gone.
    y0, y1 = HALL['neckTop'], HALL['pyramidTop']
    w_base, w_top = HALL['neck'] - 2, 6.2
    steps = 12
    for i in range(steps):
        ya = y0 + (y1 - y0) * i / steps
        w = w_base + (w_top - w_base) * (i / steps)
        mass.box(0, 0, ya, w, w, (y1 - y0) / steps + 0.08)
    mass.box(0, 0, HALL['pyramidTop'] - 0.1, 5.0, 5.0, HALL['lanternTop'] - HALL['pyramidTop'])
    mass.box(0, 0, HALL['lanternTop'], 1.25, 1.25, HALL['height'] - HALL['lanternTop'])
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
    # Stone grain is in the sheet. Vertex colour only separates courses.
    tone = 0.90 + 0.08 * blot(x * 0.01, y * 0.004, 30.0)
    if y < 80:
        tone *= 0.9
    tone = max(0.75, min(1.0, tone))
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
    # Mouth sits in the stone. No flat amber slab, no kilometre bars, no lantern cube.
    portal = make_box('portal', 0, -(half + 16), 0, 36, 16, 22)
    portal.data.materials.append(kit.lights['amber'])
    if rank >= 1:
        beacon = make_box('beacon', 0, 0, mast_y + 108, 2.2, 2.2, 2.2)
        beacon.data.materials.append(kit.lights['amber'])
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


if HERE not in sys.path:
    sys.path.insert(0, HERE)
import hero_build  # noqa: E402

hero_build.bind(sys.modules[__name__])
BUILDERS = {'lapd': hero_build.build_lapd, 'hall': hero_build.build_hall, 'wallace': hero_build.build_wallace}
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


def join_same_material():
    """One mesh per material. Thousands of window panes would otherwise be thousands of draws."""
    _object_mode()
    groups = {}
    for obj in list(bpy.context.scene.objects):
        if obj.type != 'MESH':
            continue
        name = obj.data.materials[0].name if obj.data.materials else ''
        groups.setdefault(name, []).append(obj)
    for name, objs in groups.items():
        if len(objs) < 2:
            continue
        bpy.ops.object.select_all(action='DESELECT')
        for obj in objs:
            obj.select_set(True)
        bpy.context.view_layer.objects.active = objs[0]
        bpy.ops.object.join()
        print('joined', name, len(objs), 'faces', len(objs[0].data.polygons), flush=True)


def export_glb(path, kind):
    bake_meshes(kind)
    join_same_material()
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
        'strayHullOnly': True,
        'source': (
            'Stray hull only. These boxes are the outer envelope the mesh is allowed to fill. '
            'They are not a film plan. Top-down overlap is the surveyed or photographed plan '
            'in tools/model-harness/scripts/film_iou.mjs, and topIsReconstructed is false there.'
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
    lock_path = '/tmp/landmark-scale.lock'
    blob = {}
    with open(lock_path, 'a', encoding='utf-8') as lock:
        import fcntl
        fcntl.flock(lock, fcntl.LOCK_EX)
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
            f.flush()
            os.fsync(f.fileno())
    print('SCALE', kind, lod, 'doorClear', report.get('doorClearM'), 'tip', report['heightTip'], 'tris', tris)


def exported_tris(path):
    """Triangle count in the glTF the city loads, after gltfpack."""
    with open(path, 'rb') as f:
        data = f.read()
    if data[:4] != b'glTF':
        raise SystemExit(f'{path} is not a glb')
    json_len = int.from_bytes(data[12:16], 'little')
    doc = json.loads(data[20:20 + json_len])
    total = 0
    accessors = doc['accessors']
    for mesh in doc.get('meshes', []):
        for prim in mesh.get('primitives', []):
            idx = prim.get('indices')
            if idx is None:
                continue
            total += accessors[idx]['count'] // 3
    return total


def tune_glass(mat, kind):
    """Dark panes. Warm light is a separate glass-warm material on a few bays."""
    bsdf = next(n for n in mat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    if kind == 'hall':
        base = (0.04, 0.035, 0.03, 1.0)
        emission = (0.04, 0.03, 0.02, 1.0)
        strength = 0.04
        rough = 0.48
        metal = 0.04
    elif kind == 'wallace':
        base = (0.05, 0.06, 0.07, 1.0)
        emission = (0.16, 0.18, 0.2, 1.0)
        strength = 0.02
        rough = 0.55
        metal = 0.04
    else:
        # Punched shadow, not a lit ladder. The concrete is the face.
        base = (0.01, 0.011, 0.01, 1.0)
        emission = (0.015, 0.014, 0.012, 1.0)
        strength = 0.012
        rough = 0.82
        metal = 0.02
    bsdf.inputs['Base Color'].default_value = base
    bsdf.inputs['Roughness'].default_value = rough
    bsdf.inputs['Metallic'].default_value = metal
    bsdf.inputs['Emission Color'].default_value = emission
    bsdf.inputs['Emission Strength'].default_value = strength


def build_one(kind, lod):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    size = MAP_SIZE[lod]
    albedo = os.path.join(MAPS, f'{kind}-albedo-{size}.jpg')
    if not os.path.isfile(albedo):
        subprocess.check_call(['python3', os.path.join(HERE, 'paint_landmark_maps.py'), str(size), kind])
    kit = Kit()
    tune_glass(kit.glass, kind)
    wire_maps(kit.body, size, kind)
    wire_decal(kit.livery, os.path.join(MAPS, f'decal-{kind}.png'))
    report = BUILDERS[kind](kit, RANK[lod])
    if report.get('doorClearM') is not None and report['doorClearM'] < 0.6:
        raise SystemExit(f'{kind} door is blocked, closest stone is {report["doorClearM"]:.3f} m')
    out = os.path.join(OUT_DIR, f'{kind}-{lod}.glb')
    export_glb(out, kind)
    tris = exported_tris(out)
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
