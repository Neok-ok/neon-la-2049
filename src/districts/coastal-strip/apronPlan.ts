// Final-apron layout at the toe nearest POI `sea-wall-fight`.
// The published pin stays inland. This plan does not move it.
// Treads rise ≤ 0.40 m and step inland, so walk mode can climb them
// and a stacked column cannot auto-climb the whole flight.
import type { CityLayout } from '../../world/layout';
import {
  SEA_Y,
  STAIR_ALONG,
  STAIR_GAP,
  fightHit,
  framePoint,
  type WallFrame,
} from './profile';

export type ApronRole = 'deck' | 'step' | 'post' | 'rail' | 'bollard' | 'barrier' | 'grate' | 'lamp' | 'ladder';

export interface ApronSolid {
  role: ApronRole;
  across: number;
  along: number;
  y0: number;
  /** Size along the wall (local X). */
  w: number;
  /** Size seaward (local Z). */
  d: number;
  h: number;
  yawExtra: number;
  block: boolean;
}

export interface ApronPlan {
  frame: WallFrame;
  deckY: number;
  across0: number;
  across1: number;
  along0: number;
  along1: number;
  stairAlong: number;
  stairHalf: number;
  solids: ApronSolid[];
}

const DECK_Y = SEA_Y + 1.05;

function dryOuter(layout: CityLayout, frame: WallFrame, along: number, lo: number): number {
  const ocean = (a: number) => {
    const p = framePoint(frame, a, along);
    return layout.isOcean(p.x, p.z);
  };
  if (ocean(lo + 0.5)) return lo;
  let best = lo;
  let a = lo;
  const hi = lo + 80;
  while (a < hi && !ocean(a)) {
    best = a;
    a += 2;
  }
  let L = best;
  let R = Math.min(a, hi);
  for (let k = 0; k < 10; k++) {
    const m = (L + R) / 2;
    if (ocean(m)) R = m;
    else L = m;
  }
  return L - 1;
}

function addFlight(
  solids: ApronSolid[],
  y0: number,
  y1: number,
  acrossBottom: number,
  acrossTop: number,
  along: number,
  width: number,
): void {
  const rise = y1 - y0;
  const n = Math.max(2, Math.round(rise / 0.39));
  const riser = rise / n;
  const run = acrossBottom - acrossTop;
  const da = run / n;
  for (let i = 0; i < n; i++) {
    const top = y0 + riser * (i + 1);
    const across = acrossBottom - da * (i + 0.5);
    solids.push({
      role: 'step',
      across,
      along,
      y0: top - riser,
      w: width,
      d: da + 0.08,
      h: riser,
      yawExtra: 0,
      block: true,
    });
    if (i % 4 === 0) {
      for (const side of [-1, 1]) {
        solids.push({
          role: 'post',
          across,
          along: along + side * (width / 2 + 0.2),
          y0: top - riser,
          w: 0.22,
          d: 0.22,
          h: 1.12,
          yawExtra: 0,
          block: true,
        });
      }
    }
  }
}

let cache: { layout: CityLayout; plan: ApronPlan } | null = null;

export function planApron(layout: CityLayout): ApronPlan {
  if (cache?.layout === layout) return cache.plan;
  const hit = fightHit(layout);
  const frame = hit.frame;
  const prof = hit.piece.profile;
  const dryTread = [...prof.treads].reverse().find((t) => t.y >= 8) ?? prof.treads[0]!;
  const across0 = dryTread.outer + 0.55;
  let across1 = Math.min(
    dryOuter(layout, frame, -34, across0 + 4),
    dryOuter(layout, frame, 0, across0 + 4),
    dryOuter(layout, frame, 34, across0 + 4),
  );
  if (across1 < across0 + 10) across1 = across0 + 14;
  const along0 = -34;
  const along1 = 34;
  const stairAlong = STAIR_ALONG;
  const stairHalf = STAIR_GAP / 2;
  const solids: ApronSolid[] = [];

  const deckH = DECK_Y - 0.2;
  const pushDeck = (a0: number, a1: number, c0: number, c1: number) => {
    if (a1 - a0 < 0.4 || c1 - c0 < 0.4) return;
    solids.push({
      role: 'deck',
      across: (c0 + c1) / 2,
      along: (a0 + a1) / 2,
      y0: 0.2,
      w: a1 - a0,
      d: c1 - c0,
      h: deckH,
      yawExtra: 0,
      block: true,
    });
  };
  // Stair column is open so the treads are the only floor there.
  pushDeck(along0, stairAlong - stairHalf, across0, across1);
  pushDeck(stairAlong + stairHalf, along1, across0, across1);

  const flights: { y0: number; y1: number; bottom: number; top: number }[] = [];
  const up = prof.treads.filter((t) => t.y >= 8).sort((a, b) => a.y - b.y);
  // Deck → lowest dry terrace, ~8 m of run, seaward of that terrace.
  const first = up[0]!;
  const firstTop = first.outer - 0.04;
  flights.push({ y0: DECK_Y, y1: first.y, bottom: firstTop + 8, top: firstTop });
  for (let i = 0; i < up.length - 1; i++) {
    const lo = up[i]!;
    const hi = up[i + 1]!;
    flights.push({
      y0: lo.y,
      y1: hi.y,
      bottom: lo.outer - 0.15,
      top: hi.outer - 0.04,
    });
  }
  const crestTop = prof.crest / 2 - 0.04;
  const lastTread = up[up.length - 1]!;
  flights.push({
    y0: lastTread.y,
    y1: prof.H,
    bottom: lastTread.outer - 0.15,
    top: crestTop,
  });

  let stairOuter = across0;
  for (const f of flights) {
    if (f.bottom > stairOuter) stairOuter = f.bottom;
    addFlight(solids, f.y0, f.y1, f.bottom, f.top, stairAlong, STAIR_GAP - 0.35);
  }
  // Deck fills the stair column only seaward of the lowest flight.
  pushDeck(stairAlong - stairHalf, stairAlong + stairHalf, stairOuter - 0.15, across1);

  // Vertical ladder beside the lowest flight. Rails block; rungs do not.
  const ladderAlong = stairAlong + stairHalf + 0.55;
  const ladderAcross = first.outer + 0.35;
  for (const side of [-0.18, 0.18]) {
    solids.push({
      role: 'ladder',
      across: ladderAcross,
      along: ladderAlong + side,
      y0: DECK_Y,
      w: 0.08,
      d: 0.08,
      h: first.y - DECK_Y,
      yawExtra: 0,
      block: true,
    });
  }
  const rungN = Math.floor((first.y - DECK_Y) / 0.4);
  for (let i = 1; i < rungN; i++) {
    solids.push({
      role: 'ladder',
      across: ladderAcross,
      along: ladderAlong,
      y0: DECK_Y + i * 0.4,
      w: 0.42,
      d: 0.06,
      h: 0.05,
      yawExtra: 0,
      block: false,
    });
  }

  for (let along = along0 + 3; along <= along1 - 3; along += 6) {
    if (Math.abs(along) < 5.5) continue;
    if (Math.abs(along - stairAlong) < stairHalf + 1.2) continue;
    solids.push({
      role: 'bollard',
      across: across1 - 1.8,
      along,
      y0: DECK_Y,
      w: 0.38,
      d: 0.38,
      h: 0.95,
      yawExtra: 0,
      block: true,
    });
  }

  solids.push({
    role: 'barrier',
    across: across0 + 5.5,
    along: -22,
    y0: DECK_Y,
    w: 6.2,
    d: 0.7,
    h: 0.85,
    yawExtra: 0.62,
    block: true,
  });

  solids.push({
    role: 'grate',
    across: (across0 + across1) * 0.5,
    along: -12,
    y0: DECK_Y + 0.03,
    w: 2.2,
    d: 3.4,
    h: 0.05,
    yawExtra: 0,
    block: false,
  });

  solids.push({
    role: 'lamp',
    across: across0 + 2.4,
    along: stairAlong + stairHalf + 1.4,
    y0: DECK_Y,
    w: 0.28,
    d: 0.28,
    h: 3.4,
    yawExtra: 0,
    block: true,
  });
  solids.push({
    role: 'lamp',
    across: across0 + 2.4,
    along: stairAlong + stairHalf + 1.4,
    y0: DECK_Y + 3.25,
    w: 0.7,
    d: 0.36,
    h: 0.16,
    yawExtra: 0,
    block: false,
  });

  const plan: ApronPlan = {
    frame, deckY: DECK_Y, across0, across1, along0, along1, stairAlong, stairHalf, solids,
  };
  cache = { layout, plan };
  return plan;
}

/** True when a lot footprint would sit on the apron or in the stair column. */
export function inApron(layout: CityLayout, x: number, z: number, margin = 4): boolean {
  const plan = planApron(layout);
  const f = plan.frame;
  const dx = x - f.x;
  const dz = z - f.z;
  const along = dx * f.tx + dz * f.tz;
  const across = dx * f.nx + dz * f.nz;
  if (
    across > plan.across0 - margin && across < plan.across1 + margin
    && along > plan.along0 - margin && along < plan.along1 + margin
  ) return true;
  if (
    Math.abs(along - plan.stairAlong) < plan.stairHalf + margin
    && across > f.crest / 2 - 2 && across < plan.across1 + margin
  ) return true;
  return false;
}
