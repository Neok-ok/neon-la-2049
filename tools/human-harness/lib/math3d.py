# Column-vector 3x3 / 4x4 helpers. Rotations are right-handed.
import math


def sub(a, b):
    return (a[0] - b[0], a[1] - b[1], a[2] - b[2])


def add(a, b):
    return (a[0] + b[0], a[1] + b[1], a[2] + b[2])


def mul(a, s):
    return (a[0] * s, a[1] * s, a[2] * s)


def dot(a, b):
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]


def cross(a, b):
    return (
        a[1] * b[2] - a[2] * b[1],
        a[2] * b[0] - a[0] * b[2],
        a[0] * b[1] - a[1] * b[0],
    )


def length(a):
    return math.sqrt(dot(a, a))


def norm(a):
    L = length(a) or 1.0
    return (a[0] / L, a[1] / L, a[2] / L)


def clamp(v, lo, hi):
    return lo if v < lo else hi if v > hi else v


def lerp(a, b, t):
    return a + (b - a) * t


def ident3():
    return ((1.0, 0.0, 0.0), (0.0, 1.0, 0.0), (0.0, 0.0, 1.0))


def mul3(a, b):
    rows = []
    for r in range(3):
        rows.append(tuple(sum(a[r][k] * b[k][c] for k in range(3)) for c in range(3)))
    return tuple(rows)


def transp(a):
    return tuple(tuple(a[r][c] for r in range(3)) for c in range(3))


def apply3(m, v):
    return tuple(m[r][0] * v[0] + m[r][1] * v[1] + m[r][2] * v[2] for r in range(3))


def rot_x(a):
    c, s = math.cos(a), math.sin(a)
    return ((1.0, 0.0, 0.0), (0.0, c, -s), (0.0, s, c))


def rot_y(a):
    c, s = math.cos(a), math.sin(a)
    return ((c, 0.0, s), (0.0, 1.0, 0.0), (-s, 0.0, c))


def rot_z(a):
    c, s = math.cos(a), math.sin(a)
    return ((c, -s, 0.0), (s, c, 0.0), (0.0, 0.0, 1.0))


def rotation_between(a, b):
    """Minimal rotation taking unit vector a onto unit vector b."""
    a = norm(a)
    b = norm(b)
    c = clamp(dot(a, b), -1.0, 1.0)
    if c > 0.999999:
        return ident3()
    if c < -0.999999:
        axis = cross(a, (1.0, 0.0, 0.0))
        if length(axis) < 1e-6:
            axis = cross(a, (0.0, 0.0, 1.0))
        axis = norm(axis)
        return _rodrigues(axis, math.pi)
    axis = norm(cross(a, b))
    return _rodrigues(axis, math.acos(c))


def _rodrigues(axis, ang):
    x, y, z = axis
    c, s = math.cos(ang), math.sin(ang)
    t = 1.0 - c
    return (
        (t * x * x + c, t * x * y - s * z, t * x * z + s * y),
        (t * x * y + s * z, t * y * y + c, t * y * z - s * x),
        (t * x * z - s * y, t * y * z + s * x, t * z * z + c),
    )


def quat_from_mat(m):
    """glTF xyzw quaternion from a 3x3."""
    tr = m[0][0] + m[1][1] + m[2][2]
    if tr > 0:
        s = math.sqrt(tr + 1.0) * 2
        w = 0.25 * s
        x = (m[2][1] - m[1][2]) / s
        y = (m[0][2] - m[2][0]) / s
        z = (m[1][0] - m[0][1]) / s
    elif m[0][0] > m[1][1] and m[0][0] > m[2][2]:
        s = math.sqrt(1.0 + m[0][0] - m[1][1] - m[2][2]) * 2
        w = (m[2][1] - m[1][2]) / s
        x = 0.25 * s
        y = (m[0][1] + m[1][0]) / s
        z = (m[0][2] + m[2][0]) / s
    elif m[1][1] > m[2][2]:
        s = math.sqrt(1.0 + m[1][1] - m[0][0] - m[2][2]) * 2
        w = (m[0][2] - m[2][0]) / s
        x = (m[0][1] + m[1][0]) / s
        y = 0.25 * s
        z = (m[1][2] + m[2][1]) / s
    else:
        s = math.sqrt(1.0 + m[2][2] - m[0][0] - m[1][1]) * 2
        w = (m[1][0] - m[0][1]) / s
        x = (m[0][2] + m[2][0]) / s
        y = (m[1][2] + m[2][1]) / s
        z = 0.25 * s
    L = math.sqrt(x * x + y * y + z * z + w * w) or 1.0
    return (x / L, y / L, z / L, w / L)


def skin_apply(R, t_anim, t_bind, p):
    """p' = R * (p - t_bind) + t_anim. Bind rotation is identity."""
    d = sub(p, t_bind)
    return add(apply3(R, d), t_anim)
