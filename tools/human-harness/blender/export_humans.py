# Headless Blender export. Game space is Y-up, +Z forward. Blender is Z-up.
# A vertex (x, y, z) is built at (x, -z, y). The glTF exporter turns that back
# into Y-up, and a bone whose tail points along Blender +Z keeps game axes.
#
# Run: blender -b --python export_humans.py -- <repo> <out-dir>
import os
import sys

import bpy
from mathutils import Matrix, Vector

argv = sys.argv[sys.argv.index('--') + 1:]
REPO = argv[0]
OUT = argv[1]
sys.path.insert(0, os.path.join(REPO, 'tools', 'human-harness'))

from lib.crowd import build_crowd
from lib.dancer import BONES as D_BONES
from lib.dancer import FRAMES as D_FRAMES
from lib.dancer import PARENT as D_PARENT
from lib.dancer import REST as D_REST
from lib.dancer import sway_offsets
from lib.gait import BONES, CLIPS, FRAMES, PARENT, REST, clip_skin
from lib.math3d import ident3

# Game column vector -> Blender. det +1, so triangle winding survives.
_C = Matrix(((1.0, 0.0, 0.0), (0.0, 0.0, -1.0), (0.0, 1.0, 0.0)))


def to_blender(p):
    return (p[0], -p[2], p[1])


def pose_matrix(R, t):
    linear = (_C @ Matrix(R)).to_4x4()
    return Matrix.Translation(Vector(to_blender(t))) @ linear


def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.scene.render.fps = 24
    bpy.context.scene.frame_start = 1


def build_armature(name, bones, parents, rest):
    arm_data = bpy.data.armatures.new(name)
    arm = bpy.data.objects.new(name, arm_data)
    bpy.context.scene.collection.objects.link(arm)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode='EDIT')
    edit = {}
    for bone in bones:
        eb = arm_data.edit_bones.new(bone)
        head = to_blender(rest[bone])
        eb.head = head
        # Tail along Blender +Z, which is game +Y. Roll 0 keeps game +X on bone +X.
        eb.tail = (head[0], head[1], head[2] + 0.12)
        eb.roll = 0.0
        eb.use_deform = True
        parent = parents[bone]
        if parent:
            eb.parent = edit[parent]
        edit[bone] = eb
    bpy.ops.object.mode_set(mode='OBJECT')
    return arm


def build_mesh(name, mesh, arm, bones):
    me = bpy.data.meshes.new(name)
    verts = [to_blender(p) for p in mesh.pos]
    faces = [(mesh.idx[i], mesh.idx[i + 1], mesh.idx[i + 2]) for i in range(0, len(mesh.idx), 3)]
    me.from_pydata(verts, [], faces)
    me.update()
    uv = me.uv_layers.new(name='UVMap')
    uv1 = me.uv_layers.new(name='UV1')
    for poly in me.polygons:
        poly.use_smooth = True
        for li in poly.loop_indices:
            vi = me.loops[li].vertex_index
            uv.data[li].uv = mesh.uv[vi]
            # glTF flips V on export (1 - v). Part stays in U. Bone id is stored
            # so the flip lands back on the id the palette indexes.
            part, bone = mesh.uv1[vi]
            uv1.data[li].uv = (part, 1.0 - bone)
    if mesh.col and hasattr(me, 'color_attributes'):
        attr = me.color_attributes.new(name='Color', type='FLOAT_COLOR', domain='POINT')
        for i, c in enumerate(mesh.col):
            attr.data[i].color = c
    obj = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(obj)
    obj.parent = arm
    groups = {}
    for bone in arm.data.bones:
        groups[bone.name] = obj.vertex_groups.new(name=bone.name)
    for vi, coord in enumerate(mesh.uv1):
        groups[bones[int(coord[1])]].add([vi], 1.0, 'REPLACE')
    mod = obj.modifiers.new('Armature', 'ARMATURE')
    mod.object = arm
    return obj


def key_poses(arm, bones, nframes, sample):
    """sample(frame_index) -> bone name -> (R, t_anim). One action, then an NLA strip."""
    if arm.animation_data is None:
        arm.animation_data_create()
    action = bpy.data.actions.new(sample.__name__)
    arm.animation_data.action = action
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode='POSE')
    for pb in arm.pose.bones:
        pb.rotation_mode = 'QUATERNION'
    for f in range(nframes):
        posed = sample(f)
        bpy.context.scene.frame_set(f + 1)
        for name in bones:
            R, t = posed[name]
            arm.pose.bones[name].matrix = pose_matrix(R, t)
            bpy.context.view_layer.update()
        for pb in arm.pose.bones:
            pb.keyframe_insert(data_path='location', frame=f + 1)
            pb.keyframe_insert(data_path='rotation_quaternion', frame=f + 1)
    bpy.ops.object.mode_set(mode='OBJECT')
    track = arm.animation_data.nla_tracks.new()
    track.name = sample.__name__
    track.strips.new(sample.__name__, 1, action)
    arm.animation_data.action = None
    arm.animation_data.use_nla = True


def export(arm, mesh_obj, path):
    bpy.ops.object.select_all(action='DESELECT')
    arm.select_set(True)
    mesh_obj.select_set(True)
    bpy.context.view_layer.objects.active = arm
    os.makedirs(os.path.dirname(path), exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format='GLB',
        use_selection=True,
        export_animations=True,
        export_animation_mode='NLA_TRACKS',
        export_skins=True,
        export_yup=True,
        export_texcoords=True,
        export_normals=True,
        export_colors=True,
        export_materials='NONE',
        export_draco_mesh_compression_enable=False,
        export_force_sampling=True,
        export_frame_range=False,
    )
    print('wrote', path, os.path.getsize(path))


def crowd_sample(clip):
    def sample(frame):
        skin = clip_skin(clip, frame / FRAMES)
        return {name: (skin[name][0], skin[name][1]) for name in BONES}

    sample.__name__ = clip
    return sample


def export_crowd():
    for lod in ('low', 'medium', 'high'):
        reset_scene()
        mesh = build_crowd(lod)
        arm = build_armature('crowd', BONES, PARENT, REST)
        obj = build_mesh(f'crowd-{lod}', mesh, arm, BONES)
        for clip in CLIPS:
            key_poses(arm, BONES, FRAMES, crowd_sample(clip))
        export(arm, obj, os.path.join(OUT, f'crowd-{lod}.raw.glb'))


def dancer_sample(frame):
    # One sway period. Offsets are metres on X. Rotation stays identity.
    period = 6.28318530718 / 1.2
    offsets = sway_offsets(frame / D_FRAMES * period)
    out = {}
    for name in D_BONES:
        rest = D_REST[name]
        out[name] = (ident3(), (rest[0] + offsets[name], rest[1], rest[2]))
    return out


dancer_sample.__name__ = 'sway'


def export_dancer():
    from lib.dancer import build_dancer

    for lod in ('low', 'medium', 'high'):
        reset_scene()
        mesh = build_dancer(lod)
        arm = build_armature('dancer', D_BONES, D_PARENT, D_REST)
        obj = build_mesh(f'dancer-{lod}', mesh, arm, D_BONES)
        key_poses(arm, D_BONES, D_FRAMES, dancer_sample)
        export(arm, obj, os.path.join(OUT, f'dancer-{lod}.raw.glb'))


if __name__ == '__main__':
    which = argv[2] if len(argv) > 2 else 'all'
    if which in ('all', 'crowd'):
        export_crowd()
    if which in ('all', 'dancer'):
        export_dancer()
