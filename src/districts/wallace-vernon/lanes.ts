// Freight into the precinct. Open polylines on the existing sky-lane list:
// one low corridor from the north apron into the western factory belt, and two
// loading-dock drops. Platoons are transports. Not a street graph.
import { factoryStreetX, factoryStreetZ, roadZMid } from './spec';

export interface FreightRun {
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
    for (const p of pts) p[1] += 8;
  }
  return false;
}

function push(runs: FreightRun[], run: FreightRun, blocked: (x: number, y: number, z: number) => boolean): void {
  if (settle(run.pts, blocked)) runs.push(run);
}

/**
 * Corridors in world metres. `px, pz` is the pyramid. The street snaps sit just
 * west of the reserve, on the 160 / 240 m grid, so a drop stays over a street.
 */
export function wallaceFreightRuns(
  px: number,
  pz: number,
  blocked: (x: number, y: number, z: number) => boolean,
): FreightRun[] {
  const runs: FreightRun[] = [];
  const streetX = factoryStreetX(px);
  const dockZ = factoryStreetZ(pz);
  const approachZ = pz + roadZMid();
  // North apron, down the causeway, then west into the factory belt and south along it.
  push(runs, {
    id: 'wallace-freight-in',
    loop: false,
    pts: [
      [px + 40, 168, pz - 4200],
      [px + 30, 96, pz - 2800],
      [px + 20, 72, approachZ],
      [streetX, 64, approachZ],
      [streetX, 58, pz + 400],
      [streetX, 54, pz + 1700],
    ],
    weight: 3.2,
    police: 0,
    transport: 1,
    speed: [20, 34],
    sep: 14,
    altBias: 0,
    fade: 90,
    platoon: [2, 5],
  }, blocked);

  // Drop along the north-south factory street, down to dock height.
  push(runs, {
    id: 'wallace-dock-ns',
    loop: false,
    pts: [
      [streetX, 110, pz - 200],
      [streetX, 64, pz + 500],
      [streetX, 28, pz + 1100],
      [streetX, 16, pz + 1600],
    ],
    weight: 4.4,
    police: 0,
    transport: 1,
    speed: [12, 20],
    sep: 8,
    altBias: 0,
    fade: 46,
    platoon: [2, 4],
  }, blocked);

  // Drop along an east-west street in the same belt.
  push(runs, {
    id: 'wallace-dock-ew',
    loop: false,
    pts: [
      [streetX + 700, 96, dockZ],
      [streetX + 280, 48, dockZ],
      [streetX - 40, 22, dockZ],
      [streetX - 360, 16, dockZ],
    ],
    weight: 3.8,
    police: 0,
    transport: 1,
    speed: [12, 20],
    sep: 8,
    altBias: 0,
    fade: 46,
    platoon: [2, 4],
  }, blocked);

  return runs;
}
