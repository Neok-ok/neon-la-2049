// Stepped colliders for both sea walls.
// yaw = atan2(nx, nz) makes local X run along the wall and local Z run seaward
// (CityQuery.local). Stage 1 stored the segment length in `hd` and the base width
// in `hw`, which laid a short slab a couple of kilometres wide at the crest.
// These slices keep hw along the wall and hd across it.
import type { CityLayout } from '../../world/layout';
import type { LandmarkCollider } from '../../world/landmarks/registry';
import {
  COLLIDER_OVERLAP,
  COLLIDER_RUN,
  PARAPET_H,
  PARAPET_T,
  TOWER_ACROSS,
  TOWER_H,
  TOWER_SIZE,
  fightHit,
  framePoint,
  massSlices,
  orientSegment,
  parapetRuns,
  stairChain,
  towerSites,
  wallProfile,
  type WallFrame,
} from './profile';

function pushBox(
  cols: LandmarkCollider[],
  frame: WallFrame,
  across: number,
  along: number,
  alongLen: number,
  acrossLen: number,
  y0: number,
  top: number,
): void {
  if (alongLen < 0.3 || acrossLen < 0.05 || top <= y0) return;
  const p = framePoint(frame, across, along);
  cols.push({
    x: p.x,
    z: p.z,
    hw: alongLen / 2,
    hd: acrossLen / 2,
    yaw: frame.yaw,
    y0,
    top,
  });
}

function addParapets(
  cols: LandmarkCollider[],
  frame: WallFrame,
  crest: number,
  H: number,
  half: number,
  stairLocal: number | null,
): void {
  const y0 = H;
  const top = H + PARAPET_H;
  const land = -crest / 2 - PARAPET_T * 0.35;
  const sea = crest / 2 + PARAPET_T * 0.35;
  pushBox(cols, frame, land, 0, half * 2, PARAPET_T, y0, top);
  for (const [a, b] of parapetRuns(half, stairLocal)) {
    pushBox(cols, frame, sea, (a + b) / 2, b - a, PARAPET_T, y0, top);
  }
}

/** Exported for the surface mesh so the visual parapet uses the same gap. */
export function stairLocalOn(chain0: number, len: number, stair: number, wallMatch: boolean): number | null {
  if (!wallMatch) return null;
  const centre = chain0 + len / 2;
  const local = stair - centre;
  if (local < -len / 2 - 2 || local > len / 2 + 2) return null;
  return local;
}

export function seaWallColliders(layout: CityLayout): LandmarkCollider[] {
  const cols: LandmarkCollider[] = [];
  const fight = fightHit(layout);
  const stair = stairChain(layout);
  for (const wall of layout.seaWalls) {
    const profile = wallProfile(wall);
    const slices = massSlices(profile);
    let chain = 0;
    for (let i = 0; i < wall.pts.length - 1; i++) {
      const ax0 = wall.pts[i]![0];
      const az0 = wall.pts[i]![1];
      const bx0 = wall.pts[i + 1]![0];
      const bz0 = wall.pts[i + 1]![1];
      const o = orientSegment(layout, ax0, az0, bx0, bz0);
      for (let s = 0; s < o.len - 0.4; s += COLLIDER_RUN) {
        const runLen = Math.min(COLLIDER_RUN, o.len - s);
        const mid = s + runLen / 2;
        const frame: WallFrame = {
          x: ax0 + o.tx * mid,
          z: az0 + o.tz * mid,
          nx: o.nx,
          nz: o.nz,
          tx: o.tx,
          tz: o.tz,
          yaw: o.yaw,
          H: profile.H,
          crest: profile.crest,
        };
        const half = runLen / 2 + COLLIDER_OVERLAP;
        for (const sl of slices) {
          const midA = (sl.across0 + sl.across1) / 2;
          pushBox(cols, frame, midA, 0, half * 2, Math.abs(sl.across1 - sl.across0), sl.y0, sl.top);
        }
        const local = stairLocalOn(chain + s, runLen, stair, wall.id === fight.piece.wallId);
        addParapets(cols, frame, profile.crest, profile.H, half, local);
      }
      chain += o.len;
    }
  }
  for (const t of towerSites(layout)) {
    const p = framePoint(t.frame, TOWER_ACROSS, 0);
    cols.push({
      x: p.x,
      z: p.z,
      hw: TOWER_SIZE / 2,
      hd: TOWER_SIZE / 2,
      yaw: t.frame.yaw,
      y0: t.frame.H,
      top: t.frame.H + TOWER_H,
    });
  }
  return cols;
}
