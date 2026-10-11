// Memory-pressure governor. One step at a time, with a hold so a single spike
// does not flicker the skyline or the resolution. Order matches the brief:
// far detail, then texture mips, then render-target resolution.

export interface Pressure {
  level: 0 | 1 | 2 | 3;
  farScale: number;
  sseScale: number;
  mipBias: number;
  resolutionScale: number;
  reflector: boolean;
  overMs: number;
  underMs: number;
}

export const PRESSURE_REST: Pressure = {
  level: 0,
  farScale: 1,
  sseScale: 1,
  mipBias: 0,
  resolutionScale: 1,
  reflector: true,
  overMs: 0,
  underMs: 0,
};

const ENTER = 0.82;
const EXIT = 0.62;
const ENTER_MS = 1500;
const EXIT_MS = 3000;

export function pressureKnobs(level: Pressure['level']): Omit<Pressure, 'level' | 'overMs' | 'underMs'> {
  if (level <= 0) return { farScale: 1, sseScale: 1, mipBias: 0, resolutionScale: 1, reflector: true };
  if (level === 1) return { farScale: 0.72, sseScale: 1.25, mipBias: 0, resolutionScale: 1, reflector: true };
  if (level === 2) return { farScale: 0.55, sseScale: 1.45, mipBias: 1, resolutionScale: 1, reflector: false };
  return { farScale: 0.42, sseScale: 1.7, mipBias: 2, resolutionScale: 0.75, reflector: false };
}

/**
 * `usage` and `budget` are the worse of the JS-heap ratio and the GPU ratio,
 * passed already as a single fraction via usage/budget (budget may be 1).
 */
export function stepGovernor(prev: Pressure, usage: number, budget: number, dtMs: number): Pressure {
  const dt = Math.max(0, Math.min(500, dtMs));
  const ratio = budget > 0 ? usage / budget : 0;
  let overMs = prev.overMs;
  let underMs = prev.underMs;
  let level = prev.level;
  if (ratio >= ENTER) {
    overMs += dt;
    underMs = 0;
    if (overMs >= ENTER_MS && level < 3) {
      level = (level + 1) as Pressure['level'];
      overMs = 0;
    }
  } else if (ratio <= EXIT) {
    underMs += dt;
    overMs = 0;
    if (underMs >= EXIT_MS && level > 0) {
      level = (level - 1) as Pressure['level'];
      underMs = 0;
    }
  } else {
    overMs = Math.max(0, overMs - dt);
    underMs = Math.max(0, underMs - dt);
  }
  return { level, ...pressureKnobs(level), overMs, underMs };
}
