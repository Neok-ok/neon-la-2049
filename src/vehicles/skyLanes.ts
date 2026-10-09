// High spinner lanes between the megatowers (Stage 3): grid-aligned sky avenues through the Financial District,
// holding patterns (MT-1 crown, the Wallace apex, LAPD, the MT-2/MT-4 pair) and long corridors (downtown →
// Wallace climb, Wallace → the old pyramids, the southwest transport run toward LAX).
// Lanes are derived from the landmark JSON, then checked against landmark colliders; a blocked avenue
// is lifted or dropped, so lanes follow the towers if the JSON moves them.
import { Vector3 } from 'three/webgpu';
import { bearingToDir } from '../world/geo';
import type { CityQuery } from '../world/CityQuery';
import type { Landmark } from '../world/layout';

export type LaneClass = 'civilian' | 'police' | 'transport';

export interface SkyLane {
  id: string;
  /** Closed loops wrap; open lanes carry traffic both ways (right-hand, offset laterally and vertically). */
  loop: boolean;
  pts: Vector3[];
  /** Cumulative arc length at each point (and the closing segment for loops). */
  cum: number[];
  length: number;
  /** Relative share of the lane cars. */
  weight: number;
  /** Probability per car of each class (rest civilian). */
  police: number;
  transport: number;
  speed: [number, number];
  /** Lateral half-separation of the two directions (m). */
  sep: number;
}

function lane(id: string, pts: Vector3[], loop: boolean, o: Partial<SkyLane> = {}): SkyLane {
  const cum = [0];
  const n = loop ? pts.length + 1 : pts.length;
  for (let i = 1; i < n; i++) cum.push(cum[i - 1]! + pts[i % pts.length]!.distanceTo(pts[i - 1]!));
  return {
    id, loop, pts, cum, length: cum[cum.length - 1]!,
    weight: o.weight ?? 1, police: o.police ?? 0.12, transport: o.transport ?? 0.1,
    speed: o.speed ?? [55, 95], sep: o.sep ?? 16,
  };
}

/** Point and unit tangent at arc length `s` (wrapped for loops, clamped for lines). */
export function sampleLane(l: SkyLane, s: number, out: Vector3, tan: Vector3): void {
  const L = l.length;
  s = l.loop ? ((s % L) + L) % L : Math.max(0, Math.min(L, s));
  let i = 1;
  while (i < l.cum.length - 1 && l.cum[i]! < s) i++;
  const a = l.pts[(i - 1) % l.pts.length]!, b = l.pts[i % l.pts.length]!;
  const seg = l.cum[i]! - l.cum[i - 1]!;
  const t = seg > 0 ? (s - l.cum[i - 1]!) / seg : 0;
  out.lerpVectors(a, b, t);
  tan.subVectors(b, a).normalize();
}

function ellipse(cx: number, cz: number, y: number, rx: number, rz: number, yaw: number, n = 28, wobble = 0): Vector3[] {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  const out: Vector3[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const x = Math.cos(a) * rx, z = Math.sin(a) * rz;
    out.push(new Vector3(cx + x * c + z * s, y + Math.sin(a * 2) * wobble, cz - x * s + z * c));
  }
  return out;
}

function line(ax: number, az: number, ay: number, bx: number, bz: number, by: number, step = 250): Vector3[] {
  const len = Math.hypot(bx - ax, bz - az);
  const n = Math.max(1, Math.ceil(len / step));
  const out: Vector3[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    // ease the climb so long corridors level out at both ends
    const e = t * t * (3 - 2 * t);
    out.push(new Vector3(ax + (bx - ax) * t, ay + (by - ay) * e, az + (bz - az) * t));
  }
  return out;
}

/** True if every sample along the polyline clears landmark colliders by `pad` metres. */
function clear(q: CityQuery, pts: Vector3[], loop: boolean, pad: number): boolean {
  const n = loop ? pts.length : pts.length - 1;
  for (let i = 0; i < n; i++) {
    const a = pts[i]!, b = pts[(i + 1) % pts.length]!;
    const steps = Math.max(1, Math.ceil(a.distanceTo(b) / 30));
    for (let k = 0; k <= steps; k++) {
      const t = k / steps;
      if (q.insideLandmark(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, a.z + (b.z - a.z) * t, pad)) return false;
    }
  }
  return true;
}

/** Grow a loop until it clears the structure it circles. */
function clearLoop(q: CityQuery, make: (k: number) => Vector3[], pad: number): Vector3[] | null {
  for (let k = 1; k < 2.6; k += 0.12) {
    const pts = make(k);
    if (clear(q, pts, true, pad)) return pts;
  }
  return null;
}

export function buildSkyLanes(q: CityQuery): SkyLane[] {
  const L = q.layout;
  const lanes: SkyLane[] = [];
  const lm = (id: string): Landmark | undefined => L.landmarkById(id);
  const heroes = L.landmarks.filter((l) => l.type === 'megatower' || l.type === 'legacy-tower');

  // ---- sky avenues on the downtown grid (38° and 128°), in the gaps between the heroes
  const fin = L.districts.find((d) => d.id === 'financial-megatowers');
  if (fin && heroes.length) {
    const cx = heroes.reduce((a, l) => a + l.x, 0) / heroes.length;
    const cz = heroes.reduce((a, l) => a + l.z, 0) / heroes.length;
    const bands = [430, 560, 700, 860];
    for (const bearing of [38, 128]) {
      const [ax, az] = bearingToDir(bearing);
      const [bx, bz] = bearingToDir(bearing + 90);
      let made = 0;
      for (const off of [-420, -260, -100, 60, 220, 380, 540]) {
        if (made >= 3) break;
        const ox = cx + bx * off, oz = cz + bz * off;
        const half = 2600;
        for (const [bi, y] of bands.entries()) {
          if ((bi + made + (bearing === 38 ? 0 : 1)) % 2 === 1) continue;
          const pts = line(ox - ax * half, oz - az * half, y, ox + ax * half, oz + az * half, y);
          if (!clear(q, pts, false, 45)) continue;
          lanes.push(lane(`avenue-${bearing}-${off}`, pts, false, { weight: 2.2, police: 0.14, transport: 0.12, speed: [60, 105] }));
          made++;
          break;
        }
      }
    }
  }

  // ---- holding patterns
  const mt1 = lm('megatower-1');
  if (mt1) {
    const top = mt1.height + 140;
    const pts = clearLoop(q, (k) => ellipse(mt1.x, mt1.z, top, 260 * k, 190 * k, -0.663, 24, 18), 40);
    if (pts) lanes.push(lane('hold-mt1', pts, true, { weight: 1.1, police: 0.2, transport: 0.05, speed: [40, 60], sep: 0 }));
    const mid = clearLoop(q, (k) => ellipse(mt1.x, mt1.z, mt1.height * 0.62, 210 * k, 170 * k, -0.663, 24, 10), 40);
    if (mid) lanes.push(lane('hold-mt1-mid', mid, true, { weight: 0.8, police: 0.1, transport: 0, speed: [35, 55], sep: 0 }));
  }
  const m2 = lm('megatower-2'), m4 = lm('megatower-4');
  if (m2 && m4) {
    const cx = (m2.x + m4.x) / 2, cz = (m2.z + m4.z) / 2;
    const yaw = Math.atan2(-(m4.z - m2.z), m4.x - m2.x);
    const span = Math.hypot(m4.x - m2.x, m4.z - m2.z);
    const pts = clearLoop(q, (k) => ellipse(cx, cz, Math.max(m2.height, m4.height) + 90, (span / 2 + 220) * k, 220 * k, yaw, 28, 12), 40);
    if (pts) lanes.push(lane('hold-mt2-mt4', pts, true, { weight: 0.9, police: 0.1, transport: 0.1, speed: [45, 70], sep: 0 }));
  }
  const lapd = lm('lapd-hq');
  if (lapd) {
    const pts = clearLoop(q, (k) => ellipse(lapd.x, lapd.z, lapd.height + 90, 230 * k, 200 * k, 0, 20, 8), 30);
    if (pts) lanes.push(lane('hold-lapd', pts, true, { weight: 0.7, police: 0.85, transport: 0, speed: [30, 50], sep: 0 }));
  }
  const wal = lm('wallace-pyramid');
  if (wal) {
    const apex = wal.height - 260;
    const pts = clearLoop(q, (k) => ellipse(wal.x, wal.z, apex, 820 * k, 820 * k, 0, 40, 40), 60);
    if (pts) lanes.push(lane('hold-wallace-apex', pts, true, { weight: 1.2, police: 0.05, transport: 0.25, speed: [70, 110], sep: 0 }));
    const low = clearLoop(q, (k) => ellipse(wal.x, wal.z, wal.height * 0.36, 1500 * k, 1500 * k, 0.4, 48, 30), 60);
    if (low) lanes.push(lane('hold-wallace-mid', low, true, { weight: 1.0, police: 0.04, transport: 0.3, speed: [80, 120], sep: 0 }));
    // ---- corridors: the climb from downtown to the apex pattern, and on to the old pyramids
    if (mt1) {
      const dx = mt1.x - wal.x, dz = mt1.z - wal.z, d = Math.hypot(dx, dz);
      const r = 900;
      const pts = line(mt1.x - (dx / d) * 420, mt1.z - (dz / d) * 420, 760, wal.x + (dx / d) * r, wal.z + (dz / d) * r, apex, 300);
      if (clear(q, pts, false, 60)) lanes.push(lane('corridor-wallace', pts, false, { weight: 1.4, police: 0.06, transport: 0.3, speed: [80, 125], sep: 26 }));
    }
    const op = lm('old-pyramid-north');
    if (op) {
      const pts = line(wal.x + 1700, wal.z + 400, 1250, op.x - 700, op.z - 200, 1150, 400);
      if (clear(q, pts, false, 60)) lanes.push(lane('corridor-old-pyramids', pts, false, { weight: 0.6, police: 0.04, transport: 0.4, speed: [80, 120], sep: 24 }));
    }
  }
  // southwest transport run (downtown → LAX direction), clipped to 9 km
  if (mt1) {
    const [ax, az] = bearingToDir(232);
    const sx = mt1.x - 300, sz = mt1.z + 900;
    const pts = line(sx, sz, 470, sx + ax * 9000, sz + az * 9000, 520, 400);
    if (clear(q, pts, false, 50)) lanes.push(lane('corridor-sw-transport', pts, false, { weight: 1.1, police: 0.05, transport: 0.55, speed: [70, 100], sep: 30 }));
    const [nx, nz] = bearingToDir(305);
    const pn = line(mt1.x - 500, mt1.z - 400, 400, mt1.x - 500 + nx * 7000, mt1.z - 400 + nz * 7000, 360, 400);
    if (clear(q, pn, false, 50)) lanes.push(lane('corridor-hollywood', pn, false, { weight: 0.8, police: 0.1, transport: 0.15, speed: [65, 95], sep: 20 }));
  }
  return lanes;
}
