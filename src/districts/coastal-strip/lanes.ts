// One low patrol spinner along the crest near the finale apron.
// Open polyline, one ship, not a street graph.
import type { CityLayout } from '../../world/layout';
import { fightHit, framePoint } from './profile';

export interface PatrolRun {
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
  platoon: [number, number];
}

function settle(pts: Array<[number, number, number]>, blocked: (x: number, y: number, z: number) => boolean): boolean {
  const n = pts.length - 1;
  for (let lift = 0; lift < 6; lift++) {
    let hit = false;
    for (let i = 0; i < n && !hit; i++) {
      const a = pts[i]!;
      const b = pts[i + 1]!;
      for (let k = 0; k <= 6; k++) {
        const t = k / 6;
        if (blocked(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t)) {
          hit = true;
          break;
        }
      }
    }
    if (!hit) return true;
    for (const p of pts) p[1] += 8;
  }
  return false;
}

export function coastPatrolRuns(layout: CityLayout, blocked: (x: number, y: number, z: number) => boolean): PatrolRun[] {
  const hit = fightHit(layout);
  const y = hit.frame.H + 18;
  const pts: Array<[number, number, number]> = [];
  for (let along = -1500; along <= 1500; along += 180) {
    const p = framePoint(hit.frame, -4, along);
    pts.push([p.x, y, p.z]);
  }
  if (!settle(pts, blocked)) return [];
  return [{
    id: 'coast-patrol',
    loop: false,
    pts,
    weight: 0.2,
    police: 1,
    transport: 0,
    speed: [22, 36],
    sep: 9,
    altBias: 0,
    fade: 90,
    platoon: [1, 1],
  }];
}
