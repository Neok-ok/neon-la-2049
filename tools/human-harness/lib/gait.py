# Walk, idle, umbrella, queue, gaze, and vendor clips.
# One skeleton, bind pose identity. Skinning is R * (p - pivot_bind) + pivot_anim.
# Foot contact is solved so the sole stays on the ground while the body advances
# one stride per cycle. Stride scale and height scale stay locked to that travel.
import math

from .math3d import (
    add, apply3, clamp, cross, dot, ident3, length, mul, mul3, norm, quat_from_mat,
    rot_x, rot_y, rot_z, rotation_between, sub, transp,
)

BONES = [
    'pelvis', 'spine', 'chest', 'head',
    'thighL', 'shinL', 'footL', 'thighR', 'shinR', 'footR',
    'armUL', 'armFL', 'handL', 'armUR', 'armFR', 'handR',
    'coat', 'hood', 'bag', 'umbrella',
]
BONE_INDEX = {n: i for i, n in enumerate(BONES)}

PARENT = {
    'pelvis': None,
    'spine': 'pelvis', 'chest': 'spine', 'head': 'chest', 'coat': 'chest', 'hood': 'head',
    'thighL': 'pelvis', 'shinL': 'thighL', 'footL': 'shinL',
    'thighR': 'pelvis', 'shinR': 'thighR', 'footR': 'shinR',
    'armUL': 'chest', 'armFL': 'armUL', 'handL': 'armFL',
    'armUR': 'chest', 'armFR': 'armUR', 'handR': 'armFR',
    'bag': 'pelvis', 'umbrella': 'handR',
}

# Bind pivots in the stand pose. Y up, +Z forward, +X the figure's right.
# Leg and arm X follow the overlap plate, which is a few centimetres asymmetric.
REST = {
    'pelvis': (0.0, 0.96, 0.0),
    'spine': (0.0, 1.22, 0.0),
    'chest': (0.0, 1.40, 0.0),
    'head': (0.0, 1.62, 0.0),
    'thighL': (-0.08, 0.96, 0.0),
    'shinL': (-0.08, 0.45, 0.0),
    'footL': (-0.08, 0.06, 0.02),
    'thighR': (0.09, 0.96, 0.0),
    'shinR': (0.09, 0.45, 0.0),
    'footR': (0.09, 0.06, 0.02),
    'armUL': (-0.26, 1.46, 0.02),
    'armFL': (-0.26, 1.16, 0.02),
    'handL': (-0.26, 0.92, 0.02),
    'armUR': (0.27, 1.46, 0.02),
    'armFR': (0.27, 1.16, 0.02),
    'handR': (0.27, 0.92, 0.02),
    'coat': (0.0, 1.40, 0.0),
    'hood': (0.0, 1.68, 0.0),
    'bag': (-0.32, 1.05, 0.04),
    'umbrella': (0.32, 1.10, 0.08),
}

THIGH = 0.51
SHIN = 0.39
UPPER = 0.30
FORE = 0.24
STRIDE = 1.42
FRAMES = 16

CLIPS = [
    'stand', 'walk', 'walkNarrow', 'walkWide',
    'umbrellaIdle', 'umbrellaWalk', 'queue', 'gaze', 'vendor',
]
CLIP_INDEX = {n: i for i, n in enumerate(CLIPS)}
STRIDE_OF = {'walk': 1.0, 'walkNarrow': 0.92, 'walkWide': 1.08, 'umbrellaWalk': 1.0}


def _knee(hip, ankle, l1, l2, pole):
    delta = sub(ankle, hip)
    dist = length(delta)
    max_d = l1 + l2 - 1e-4
    if dist > max_d:
        delta = mul(norm(delta), max_d)
        ankle = add(hip, delta)
        dist = max_d
    dist = max(dist, abs(l1 - l2) + 1e-4)
    direction = mul(delta, 1.0 / dist)
    along = (l1 * l1 - l2 * l2 + dist * dist) / (2.0 * dist)
    lift = math.sqrt(max(0.0, l1 * l1 - along * along))
    side = sub(pole, mul(direction, dot(pole, direction)))
    if length(side) < 1e-5:
        side = cross(direction, (1.0, 0.0, 0.0))
    side = mul(norm(side), lift)
    knee = add(hip, add(mul(direction, along), side))
    return knee, ankle


def _aim(bind_offset, anim_offset):
    if length(bind_offset) < 1e-6 or length(anim_offset) < 1e-6:
        return ident3()
    return rotation_between(bind_offset, anim_offset)


def _chain(locals_map):
    """locals_map: bone -> (local_R, local_t). Returns world R, world t."""
    world = {}

    def rec(name):
        if name in world:
            return world[name]
        R, t = locals_map[name]
        parent = PARENT[name]
        if parent is None:
            world[name] = (R, t)
            return world[name]
        pR, pt = rec(parent)
        world[name] = (mul3(pR, R), add(pt, apply3(pR, t)))
        return world[name]

    for n in BONES:
        rec(n)
    return world


def _bind_locals():
    out = {}
    for n in BONES:
        p = PARENT[n]
        if p is None:
            out[n] = (ident3(), REST[n])
        else:
            out[n] = (ident3(), sub(REST[n], REST[p]))
    return out


BIND_LOCAL = _bind_locals()
BIND_WORLD = _chain(BIND_LOCAL)


def _pose_from_world(world_R, world_t):
    """Convert absolute bone worlds into parent-local TRS, then back, and
    return skin rotations plus animated pivots. world_R is the skin delta
    (bind rotation is identity), world_t is the animated pivot."""
    skin = {}
    for n in BONES:
        skin[n] = (world_R[n], world_t[n], REST[n])
    return skin


def _identity_skin():
    return {n: (ident3(), REST[n], REST[n]) for n in BONES}


# Sole samples on the foot bone, in the stand pose. The plant locks one of these
# to a world point that does not move while that end of the shoe is down.
HEEL_Z = -0.13
TOE_Z = 0.11
FOOT_LEN = TOE_Z - HEEL_Z
ANKLE_Y = 0.06
ANKLE_Z = 0.02


def _smooth(t):
    t = clamp(t, 0.0, 1.0)
    return t * t * (3.0 - 2.0 * t)


def _roll_kind(phase):
    """Foot pitch through one step. Negative roll lifts the toe (heel strike)."""
    p = phase % 1.0
    if p > 0.5:
        u = (p - 0.5) / 0.5
        s = _smooth(u)
        r0, k0 = _roll_kind(0.5)
        r1, _k1 = _roll_kind(0.0)
        return r0 * (1.0 - s) + r1 * s, 'swing'
    u = p / 0.5
    if u < 0.18:
        return -0.50 * (1.0 - u / 0.18), 'heel'
    if u > 0.64:
        return 0.95 * _smooth((u - 0.64) / 0.36), 'toe'
    return 0.0, 'flat'


def _ankle_on(hip_x, roll, contact_z, bind_z):
    """Foot pivot that puts the sole vertex (hip_x, 0, bind_z) on (hip_x, 0, contact_z)."""
    t_bind = (hip_x, ANKLE_Y, ANKLE_Z)
    planted = (hip_x, 0.0, bind_z)
    R = rot_x(roll)
    target = (hip_x, 0.0, contact_z)
    t_anim = sub(target, apply3(R, sub(planted, t_bind)))
    return t_anim, R


def _foot_target(hip_x, phase, stride):
    """Ankle and foot rotation. Stance contacts are fixed in the world."""
    p = phase % 1.0
    half = 0.355 * stride
    heel_z = half - p * STRIDE * stride
    toe_z = heel_z + FOOT_LEN
    roll, kind = _roll_kind(p)
    if kind == 'swing':
        u = (p - 0.5) / 0.5
        s = _smooth(u)
        a0, R0, _, _, _ = _foot_target(hip_x, 0.5, stride)
        a1, _R1, _, _, _ = _foot_target(hip_x, 0.0, stride)
        # 14 cm of clearance. 11 cm stayed on the pavement and read as a
        # skate. 20 cm kicked the foot up to the hem.
        lift = math.sin(u * math.pi) * 0.14
        ankle = (
            hip_x,
            a0[1] * (1.0 - s) + a1[1] * s + lift,
            a0[2] * (1.0 - s) + a1[2] * s,
        )
        return ankle, rot_x(roll), 'swing', heel_z, toe_z
    if kind == 'toe':
        ankle, R = _ankle_on(hip_x, roll, toe_z, TOE_Z)
    else:
        ankle, R = _ankle_on(hip_x, roll, heel_z, HEEL_Z)
    return ankle, R, kind, heel_z, toe_z


def _z_interval(ankle_l, ankle_r, lat, hy, slack=0.004):
    lo = hi = None
    for zi in range(-40, 80):
        hz = zi * 0.005
        d_l = length(sub(ankle_l, (-0.08 + lat, hy, hz)))
        d_r = length(sub(ankle_r, (0.09 + lat, hy, hz)))
        if min(THIGH + SHIN - d_l, THIGH + SHIN - d_r) >= slack:
            lo = hz if lo is None else lo
            hi = hz
    if lo is None:
        return None
    return (lo, hi)


def _pelvis_z_track(stride, samples=64):
    """Smooth hip path through the reachable interval, one sample per phase."""
    raw = []
    for i in range(samples):
        p = i / samples
        ankle_l = _foot_target(-0.08, p, stride)[0]
        ankle_r = _foot_target(0.09, (p + 0.5) % 1.0, stride)[0]
        lat = -0.026 * math.sin(p * math.tau)
        hy = 0.938 + 0.020 * abs(math.sin(p * math.tau))
        iv = None
        for drop in range(18):
            iv = _z_interval(ankle_l, ankle_r, lat, hy - drop * 0.002)
            if iv is not None:
                break
        raw.append((iv[0] + iv[1]) * 0.5 if iv else 0.15)
    sm = raw
    for _ in range(4):
        sm = [
            0.25 * sm[i - 1] + 0.5 * sm[i] + 0.25 * sm[(i + 1) % samples]
            for i in range(samples)
        ]
    return tuple(sm)


_PELVIS_Z = {}


def _pelvis_z(phase, stride):
    key = round(float(stride), 3)
    track = _PELVIS_Z.get(key)
    if track is None:
        track = _pelvis_z_track(stride)
        _PELVIS_Z[key] = track
    n = len(track)
    x = (phase % 1.0) * n
    i = int(x) % n
    t = x - int(x)
    return track[i] * (1.0 - t) + track[(i + 1) % n] * t


def _place_pelvis(phase, stride, ankle_l, ankle_r):
    """Hip height follows a 2 cm bob. Forward travel stays on a smooth track
    that the legs can reach, so the ankles never get pulled off the plant."""
    p = phase % 1.0
    bob = 0.020 * abs(math.sin(p * math.tau))
    target_y = 0.938 + bob
    # Onto the stance foot. Left stance is the first half, where sin is positive.
    lat = -0.026 * math.sin(p * math.tau)
    hz = _pelvis_z(p, stride)
    best = None
    for drop_i in range(0, 22):
        hy = target_y - drop_i * 0.002
        iv = _z_interval(ankle_l, ankle_r, lat, hy)
        if iv is None:
            continue
        z = min(max(hz, iv[0]), iv[1])
        d_l = length(sub(ankle_l, (-0.08 + lat, hy, z)))
        d_r = length(sub(ankle_r, (0.09 + lat, hy, z)))
        slack = min(THIGH + SHIN - d_l, THIGH + SHIN - d_r)
        best = (hy, z, slack, abs(z - hz))
        if abs(z - hz) < 1e-6:
            break
    if best is None:
        best = (target_y - 0.04, hz, -1.0, 0.0)
    return (lat, best[0], best[1]), best[2]


def _solve_legs(phase, stride, pelvis, ankle_l, ankle_r, foot_l, foot_r):
    """Knees between the placed hips and the planted ankles. Ankles stay put."""
    out_R = {}
    out_t = {}
    soles = {}
    lat = pelvis[0]
    for side, hip_x, ankle, foot in (
        ('L', -0.08, ankle_l, foot_l),
        ('R', 0.09, ankle_r, foot_r),
    ):
        ph = phase if side == 'L' else (phase + 0.5) % 1.0
        _ankle, foot_R, kind, heel_z, toe_z = foot
        hip = (hip_x + lat, pelvis[1], pelvis[2])
        knee, ankle_ik = _knee(hip, ankle, THIGH, SHIN, (0.0, 0.2, 1.0))
        pulled = length(sub(ankle_ik, ankle))
        thigh_name, shin_name, foot_name = f'thigh{side}', f'shin{side}', f'foot{side}'
        out_t[thigh_name] = hip
        out_t[shin_name] = knee
        # The plant owns the ankle. A pull here means the pelvis search missed.
        out_t[foot_name] = ankle
        out_R[thigh_name] = _aim((0.0, -1.0, 0.0), sub(knee, hip))
        out_R[shin_name] = _aim((0.0, -1.0, 0.0), sub(ankle, knee))
        out_R[foot_name] = foot_R
        soles[side] = {
            'phase': ph,
            'kind': kind,
            'heel_z': heel_z,
            'toe_z': toe_z,
            'ankle': ankle,
            'knee': knee,
            'hip': hip,
            'pulled': pulled,
        }
    return out_R, out_t, soles


def _arm(shoulder, wrist, l1, l2, pole):
    elbow, wrist = _knee(shoulder, wrist, l1, l2, pole)
    return elbow, wrist


def _hang_wrist(rest_hand, swing):
    # swing > 0 reaches forward (+Z). The coat body is only about ±0.15 m
    # deep, so a 0.24 m hang leaves the forearm inside the profile.
    # UPPER + FORE is 0.54 m. This wrist stays inside that reach, and at
    # full swing it clears the coat's front and back faces.
    return (
        rest_hand[0],
        rest_hand[1] + 0.16 + 0.20 * abs(swing),
        rest_hand[2] + 0.46 * swing,
    )


def walk_skin(phase, stride=1.0, umbrella=False):
    """One walk frame. Umbrella keeps the modeled bent arm and canopy upright."""
    p = phase % 1.0
    foot_l = _foot_target(-0.08, p, stride)
    foot_r = _foot_target(0.09, (p + 0.5) % 1.0, stride)
    ankle_l, ankle_r = foot_l[0], foot_r[0]
    pelvis, _slack = _place_pelvis(p, stride, ankle_l, ankle_r)
    lat = pelvis[0]

    leg_R, leg_t, soles = _solve_legs(p, stride, pelvis, ankle_l, ankle_r, foot_l, foot_r)

    # Arms oppose the legs. Left arm swings with the right leg (phase + 0.5).
    swing_l = math.sin((p + 0.5) * math.tau)
    swing_r = math.sin(p * math.tau)
    worlds_R = {n: ident3() for n in BONES}
    worlds_t = {n: REST[n] for n in BONES}
    worlds_t['pelvis'] = pelvis
    worlds_R['pelvis'] = rot_z(-lat * 1.4)
    # The torso rides the pelvis. A partial z follow shears the spine off the hips.
    delta = sub(pelvis, REST['pelvis'])
    worlds_t['spine'] = add(REST['spine'], (delta[0] * 0.92, delta[1], delta[2] * 0.92))
    worlds_R['spine'] = rot_z(lat * 0.5)
    worlds_t['chest'] = add(REST['chest'], (delta[0] * 0.82, delta[1], delta[2] * 0.82))
    worlds_R['chest'] = rot_y(0.05 * math.sin(p * math.tau))
    worlds_t['head'] = add(REST['head'], (delta[0] * 0.7, delta[1], delta[2] * 0.7))
    worlds_R['head'] = rot_x(0.04 * math.sin((p + 0.25) * math.tau))
    # Coat lags the chest by a small pitch so the hem trails the step.
    worlds_t['coat'] = worlds_t['chest']
    worlds_R['coat'] = rot_x(-0.05 * math.sin(p * math.tau))
    worlds_t['hood'] = worlds_t['head']
    worlds_R['hood'] = worlds_R['head']
    worlds_t['bag'] = add(REST['bag'], (delta[0], delta[1], delta[2] * 0.8 - 0.03 * math.sin(p * math.tau)))
    worlds_R['bag'] = rot_x(0.12 * math.sin((p + 0.5) * math.tau))

    for n, R in leg_R.items():
        worlds_R[n] = R
    for n, t in leg_t.items():
        worlds_t[n] = t

    def swing_arm(side, swing, lock):
        sh = REST[f'armU{side}']
        shoulder = add(sh, (delta[0] * 0.82, delta[1], delta[2] * 0.82))
        if lock:
            wrist = add((0.33, 1.10, 0.10), (0.0, delta[1], delta[2] * 0.82))
            pole = (-0.2 if side == 'R' else 0.2, -0.2, -1.0)
        else:
            rest_w = REST[f'hand{side}']
            wrist = _hang_wrist(add(rest_w, (delta[0] * 0.7, delta[1], delta[2] * 0.7)), swing)
            # The elbow leads the swing. A pole on -Z folds it back into the coat,
            # which is why the profile still showed a sleeve glued to the cloth.
            sign = 1.0 if side == 'R' else -1.0
            pole = (sign * 0.28 * abs(swing), -0.35, 0.95 * swing)
        elbow, wrist = _arm(shoulder, wrist, UPPER, FORE, pole)
        worlds_t[f'armU{side}'] = shoulder
        worlds_t[f'armF{side}'] = elbow
        worlds_t[f'hand{side}'] = wrist
        worlds_R[f'armU{side}'] = _aim((0.0, -1.0, 0.0), sub(elbow, shoulder))
        worlds_R[f'armF{side}'] = _aim((0.0, -1.0, 0.0), sub(wrist, elbow))
        flex = 0.55 if lock else 0.25 + 0.15 * max(0.0, -swing)
        worlds_R[f'hand{side}'] = rot_x(-flex if lock else 0.15 * swing)

    swing_arm('L', swing_l, False)
    swing_arm('R', swing_r, False)
    if umbrella:
        # The canopy and the bent arm are modeled on the rain plate. Follow the
        # chest translation and do not spin them around the grip.
        delta = sub(worlds_t['chest'], REST['chest'])
        worlds_t['umbrella'] = add(REST['umbrella'], delta)
        worlds_R['umbrella'] = ident3()
        worlds_t['coat'] = worlds_t['chest']
        worlds_R['coat'] = ident3()
    else:
        worlds_t['umbrella'] = worlds_t['handR']
        worlds_R['umbrella'] = worlds_R['handR']
    return _pose_from_world(worlds_R, worlds_t), soles, pelvis


def rain_stand_skin():
    """Feet together, bent arm and canopy already in the mesh. Identity skin."""
    return _identity_skin()


def stand_skin(phase):
    """Planted idle. A 2 cm shift onto one leg and back. Feet do not travel."""
    p = phase % 1.0
    lat = 0.02 * math.sin(p * math.tau)
    worlds_R = {n: ident3() for n in BONES}
    worlds_t = {n: REST[n] for n in BONES}
    worlds_t['pelvis'] = (lat, 0.96, 0.0)
    worlds_R['pelvis'] = rot_z(-lat * 2.0)
    worlds_t['spine'] = (lat * 0.4, REST['spine'][1], 0.0)
    worlds_t['chest'] = (lat * 0.2, REST['chest'][1], 0.0)
    worlds_t['head'] = (lat * 0.1, REST['head'][1], 0.0)
    worlds_t['coat'] = worlds_t['chest']
    worlds_R['coat'] = rot_z(-lat)
    worlds_t['hood'] = worlds_t['head']
    # Free leg softens. Left knee bends a little as weight goes right.
    bend = max(0.0, -lat) * 0.0
    if bend:
        pass
    return _pose_from_world(worlds_R, worlds_t)


def queue_skin(phase):
    p = phase % 1.0
    lat = 0.035 * math.sin(p * math.tau)
    worlds_R = {n: ident3() for n in BONES}
    worlds_t = {n: REST[n] for n in BONES}
    worlds_t['pelvis'] = (lat, 0.955, 0.0)
    worlds_R['pelvis'] = rot_z(-lat * 1.5)
    worlds_t['chest'] = (lat * 0.4, REST['chest'][1] - 0.005, 0.0)
    worlds_t['coat'] = worlds_t['chest']
    worlds_R['coat'] = rot_z(-lat * 0.8)
    worlds_t['head'] = (lat * 0.2, REST['head'][1], 0.0)
    worlds_R['head'] = rot_y(0.12 * math.sin(p * math.tau))
    # Weight leg stays straight. The other knee gives.
    hip = (0.09, 0.955, 0.0)
    ankle = (0.09, 0.09, 0.04)
    knee, ankle = _knee(hip, ankle, THIGH, SHIN, (0.0, 0.2, 1.0))
    worlds_t['thighR'] = hip
    worlds_t['shinR'] = knee
    worlds_t['footR'] = ankle
    worlds_R['thighR'] = _aim((0.0, -1.0, 0.0), sub(knee, hip))
    worlds_R['shinR'] = _aim((0.0, -1.0, 0.0), sub(ankle, knee))
    return _pose_from_world(worlds_R, worlds_t)


def gaze_skin(phase):
    p = phase % 1.0
    worlds_R = {n: ident3() for n in BONES}
    worlds_t = {n: REST[n] for n in BONES}
    # Look up about 33 degrees. The plate's current gaze is -0.58 rad.
    worlds_R['head'] = rot_x(-0.58)
    worlds_t['head'] = REST['head']
    worlds_R['hood'] = worlds_R['head']
    worlds_t['hood'] = REST['hood']
    worlds_R['chest'] = rot_x(-0.08)
    sway = 0.01 * math.sin(p * math.tau)
    worlds_t['pelvis'] = (sway, 0.96, 0.0)
    return _pose_from_world(worlds_R, worlds_t)


def vendor_skin(phase):
    p = phase % 1.0
    swing = math.sin(p * math.tau) * 0.42
    worlds_R = {n: ident3() for n in BONES}
    worlds_t = {n: REST[n] for n in BONES}
    shoulder = REST['armUL']
    wrist = (
        shoulder[0] - 0.05,
        1.05 + 0.08 * math.cos(p * math.tau),
        0.18 * math.sin(p * math.tau),
    )
    elbow, wrist = _arm(shoulder, wrist, UPPER, FORE, (-0.4, -0.2, -1.0))
    worlds_t['armUL'] = shoulder
    worlds_t['armFL'] = elbow
    worlds_t['handL'] = wrist
    worlds_R['armUL'] = _aim((0.0, -1.0, 0.0), sub(elbow, shoulder))
    worlds_R['armFL'] = _aim((0.0, -1.0, 0.0), sub(wrist, elbow))
    worlds_R['armUL'] = mul3(worlds_R['armUL'], rot_x(swing * 0.15))
    return _pose_from_world(worlds_R, worlds_t)


def clip_skin(clip, phase):
    if clip == 'stand':
        return stand_skin(phase)
    if clip == 'walk':
        return walk_skin(phase, 1.0, False)[0]
    if clip == 'walkNarrow':
        return walk_skin(phase, STRIDE_OF['walkNarrow'], False)[0]
    if clip == 'walkWide':
        return walk_skin(phase, STRIDE_OF['walkWide'], False)[0]
    if clip == 'umbrellaIdle':
        return rain_stand_skin()
    if clip == 'umbrellaWalk':
        return walk_skin(phase, 1.0, True)[0]
    if clip == 'queue':
        return queue_skin(phase)
    if clip == 'gaze':
        return gaze_skin(phase)
    if clip == 'vendor':
        return vendor_skin(phase)
    raise KeyError(clip)


def skin_point(skin, bone, p):
    R, t_anim, t_bind = skin[bone]
    return add(apply3(R, sub(p, t_bind)), t_anim)


def local_trs(skin):
    """Parent-local translation and quaternion for glTF / Blender keyframes."""
    # Reconstruct world R, t from the skin delta. Bind R is I, so world R is the
    # skin R and world pivot is t_anim.
    world_R = {n: skin[n][0] for n in BONES}
    world_t = {n: skin[n][1] for n in BONES}
    out = {}
    for n in BONES:
        parent = PARENT[n]
        if parent is None:
            out[n] = (world_t[n], quat_from_mat(world_R[n]))
            continue
        pR = world_R[parent]
        local_R = mul3(transp(pR), world_R[n])
        local_t = apply3(transp(pR), sub(world_t[n], world_t[parent]))
        out[n] = (local_t, quat_from_mat(local_R))
    return out


def _flex(a, pivot, b):
    u = norm(sub(a, pivot))
    v = norm(sub(b, pivot))
    return 180.0 - math.degrees(math.acos(clamp(dot(u, v), -1.0, 1.0)))


def measure_plant(stride=1.0, height=1.0, samples=64):
    """World sole during stance. The body advances `stride * STRIDE * height` per cycle.

    Heel contact (strike and flat) holds one world Z. Toe contact holds another.
    A slide is the range of that world Z, not the distance from the ankle.
    """
    travel = STRIDE * stride * height
    heel_z = {s: [] for s in ('L', 'R')}
    toe_z = {s: [] for s in ('L', 'R')}
    pen = 0.0
    float_max = 0.0
    knee_min = 180.0
    knee_max = 0.0
    swing_knee = 0.0
    elbow_max = 0.0
    pull_max = 0.0
    ys = []
    for i in range(samples):
        phase = i / samples
        skin, soles, pelvis = walk_skin(phase, stride, False)
        ys.append(pelvis[1])
        body_z = phase * travel
        for side, hip_x in (('L', -0.08), ('R', 0.09)):
            info = soles[side]
            pull_max = max(pull_max, info['pulled'])
            bone = f'foot{side}'
            heel = skin_point(skin, bone, (hip_x, 0.0, HEEL_Z))
            mid = skin_point(skin, bone, (hip_x, 0.0, -0.01))
            toe = skin_point(skin, bone, (hip_x, 0.0, TOE_Z))
            # Phase 0 is also the end of the right foot's previous stance. Shift
            # that one sample forward a cycle so it joins the plant it belongs to.
            wrap = STRIDE * stride * height if side == 'R' and phase < 1e-8 else 0.0
            for pt in (heel, mid, toe):
                pen = min(pen, pt[1])
            flex = _flex(info['hip'], info['knee'], info['ankle'])
            if info['phase'] <= 0.5:
                knee_min = min(knee_min, flex)
                knee_max = max(knee_max, flex)
                if info['kind'] in ('heel', 'flat'):
                    heel_z[side].append(body_z + heel[2] * height + wrap)
                    float_max = max(float_max, abs(heel[1]))
                if info['kind'] == 'toe':
                    toe_z[side].append(body_z + toe[2] * height + wrap)
                    float_max = max(float_max, abs(toe[1]))
                if info['kind'] == 'flat':
                    float_max = max(float_max, abs(mid[1]), abs(toe[1]), abs(heel[1]))
            else:
                swing_knee = max(swing_knee, flex)
        sh = skin_point(skin, 'armUL', REST['armUL'])
        el = skin_point(skin, 'armFL', REST['armFL'])
        hd = skin_point(skin, 'handL', REST['handL'])
        elbow_max = max(elbow_max, _flex(sh, el, hd))
    def span(vals):
        return (max(vals) - min(vals)) if vals else 0.0
    slide = max(span(heel_z['L']), span(heel_z['R']), span(toe_z['L']), span(toe_z['R']))
    return {
        'sole_error_m': slide,
        'sole_pen_m': pen,
        'sole_float_m': float_max,
        'pull_m': pull_max,
        'bob_m': (max(ys) - min(ys)) if ys else 0.0,
        'pelvis_y_m': (min(ys), max(ys)) if ys else (0, 0),
        'stance_knee_deg': (knee_min, knee_max),
        'swing_knee_deg': swing_knee,
        'elbow_deg': elbow_max,
        'samples': samples,
    }


def palette_bytes():
    """Uint8 bone palette. Width = bones * 6, height = clips * FRAMES.
    Each bone is 6 pixels, two floats per pixel, range [-1.5, 2.5]."""
    lo, hi = -1.5, 2.5
    span = hi - lo
    width = len(BONES) * 6
    height = len(CLIPS) * FRAMES
    raw = bytearray(width * height * 4)

    def pack(value):
        t = clamp((value - lo) / span, 0.0, 1.0)
        q = int(round(t * 65535.0))
        return q >> 8, q & 255

    for ci, clip in enumerate(CLIPS):
        for fi in range(FRAMES):
            phase = 0.0 if clip in ('umbrellaIdle', 'gaze') and fi == 0 else fi / FRAMES
            if clip == 'umbrellaIdle':
                phase = 0.0
            skin = clip_skin(clip, phase)
            row = ci * FRAMES + fi
            for bi, name in enumerate(BONES):
                R, t_anim, t_bind = skin[name]
                # 3x4 row-major skin matrix: [R | t_anim - R * t_bind]
                rt = sub(t_anim, apply3(R, t_bind))
                elems = [
                    R[0][0], R[0][1], R[0][2], rt[0],
                    R[1][0], R[1][1], R[1][2], rt[1],
                    R[2][0], R[2][1], R[2][2], rt[2],
                ]
                base = bi * 6
                for p in range(6):
                    a, b = pack(elems[p * 2]), pack(elems[p * 2 + 1])
                    o = ((row * width) + (base + p)) * 4
                    raw[o:o + 4] = bytes((a[0], a[1], b[0], b[1]))
    return bytes(raw), width, height, lo, hi
