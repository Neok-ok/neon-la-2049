// One ladder per mouth. Each bar stops short of the box the other direction occupies,
// so the corner is empty asphalt instead of two white stamps crossed on top of each other.

export const BAR_PITCH = 0.72;
export const BAR_THICK = 0.48;
export const BAR_START = 0.55;
export const BAR_GAP = 0.42;

export interface CrossBar {
  /** 0 = bar across the v mouths (long along u). 1 = bar across the u mouths. */
  axis: 0 | 1;
  /** Signed metres from the crossing centre, along that mouth's inward axis. */
  at: number;
  /** Full length of the bar, metres. */
  span: number;
}

function reachOf(n: number): number {
  return BAR_START + (n - 1) * BAR_PITCH + BAR_THICK * 0.5;
}

/** Fewer bars when the carriageway cannot hold a ladder and still leave a gap. */
function fitCount(curb: number, want: number): number {
  let n = Math.max(2, want);
  while (n > 2 && curb - reachOf(n) < 1.4) n--;
  return n;
}

/**
 * `curb0` / `curb1` are carriage half-widths along u and v.
 * `want` is 6 where arrows exist and 4 on the lighter tier.
 */
export function crosswalkBars(curb0: number, curb1: number, want: number): CrossBar[] {
  const nV = fitCount(curb1, want);
  const nU = fitCount(curb0, want);
  const reachV = reachOf(nV);
  const reachU = reachOf(nU);
  const halfU = Math.max(0.8, curb0 - reachU - BAR_GAP);
  const halfV = Math.max(0.8, curb1 - reachV - BAR_GAP);
  const out: CrossBar[] = [];
  const clear = BAR_THICK * 0.5 + 0.08;
  for (const sv of [-1, 1]) {
    for (let i = 0; i < nV; i++) {
      const v = sv * (curb1 - BAR_START - i * BAR_PITCH);
      if (Math.abs(v) < halfV + clear) continue;
      out.push({ axis: 0, at: v, span: halfU * 2 });
    }
  }
  for (const su of [-1, 1]) {
    for (let i = 0; i < nU; i++) {
      const u = su * (curb0 - BAR_START - i * BAR_PITCH);
      if (Math.abs(u) < halfU + clear) continue;
      out.push({ axis: 1, at: u, span: halfV * 2 });
    }
  }
  return out;
}
