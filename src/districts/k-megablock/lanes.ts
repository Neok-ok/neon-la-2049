// Two open polylines over the roof pad. One direction arrives, the reverse leaves.
// altBias 0 keeps the car on the polyline. Every point stays at or above roof+6 m, which
// clears a 185 m roof with the 3.5 m lane pad. The run bends south of the head-house so
// settle() does not lift the pad crossing.
import { bearingToYaw } from '../../world/geo';
import { HOVER, PAD, localToWorld } from './spec';

export interface PadRun {
  id: string;
  loop: boolean;
  pts: Array<[number, number, number]>;
  weight: number;
  police: number;
  transport: number;
  speed: [number, number];
  sep: number;
  altBias: number;
  fade: number;
}

function settle(pts: Array<[number, number, number]>, blocked: (x: number, y: number, z: number) => boolean): boolean {
  const n = pts.length - 1;
  for (let lift = 0; lift < 5; lift++) {
    let hit = false;
    for (let i = 0; i < n && !hit; i++) {
      const a = pts[i]!, b = pts[i + 1]!;
      for (let k = 0; k <= 6; k++) {
        const t = k / 6;
        const x = a[0] + (b[0] - a[0]) * t;
        const y = a[1] + (b[1] - a[1]) * t;
        const z = a[2] + (b[2] - a[2]) * t;
        if (blocked(x, y, z)) { hit = true; break; }
      }
    }
    if (!hit) return true;
    for (const p of pts) p[1] += 6;
  }
  return false;
}

/** East-west and north-south. Both cross the pad at HOVER and climb away. */
export function kPadRuns(
  l: { x: number; z: number; bearingDeg: number },
  ground: number,
  blocked: (x: number, y: number, z: number) => boolean,
): PadRun[] {
  const yaw = bearingToYaw(l.bearingDeg);
  const w = (lx: number, y: number, lz: number): [number, number, number] => {
    const [x, z] = localToWorld(l.x, l.z, yaw, lx, lz);
    return [x, ground + y, z];
  };
  const zLane = PAD.z + 5.2;
  const paths: Array<{ id: string; pts: Array<[number, number, number]> }> = [
    {
      id: 'k-pad-ew',
      pts: [
        w(340, 246, zLane), w(140, HOVER, zLane), w(PAD.x, HOVER, zLane),
        w(-140, HOVER, zLane), w(-340, 246, zLane),
      ],
    },
    {
      id: 'k-pad-ns',
      pts: [
        w(PAD.x, 238, 240), w(PAD.x, HOVER, 62), w(PAD.x, HOVER, zLane),
        w(PAD.x, HOVER, -62), w(PAD.x, 238, -240),
      ],
    },
  ];
  const runs: PadRun[] = [];
  for (const p of paths) {
    if (!settle(p.pts, blocked)) continue;
    runs.push({
      id: p.id, loop: false, pts: p.pts,
      weight: 2.1, police: 0.12, transport: 0, speed: [16, 28], sep: 4, altBias: 0, fade: 60,
    });
  }
  return runs;
}
