// Police pad approaches. Open polylines in the existing sky-lane list, not a second traffic system.
// Each run crosses one pad at HOVER_Y: one direction is the arrival, the reverse is the departure.
// They start and end near the downtown avenue band (about 190 m) so they read as side-spurs of that layer.
// `hold-lapd` stays the high orbit and is not replaced.
import { bearingToYaw } from '../../world/geo';
import { HOVER_Y, localToWorld } from './spec';

export interface PadRun {
  id: string;
  loop: boolean;
  pts: Array<[number, number, number]>;
  weight: number;
  police: number;
  transport: number;
  speed: [number, number];
  sep: number;
  /** 0 keeps the car on the polyline. Avenue lanes keep the sampler's +7 m split. */
  altBias: number;
  fade: number;
}

function settle(pts: Array<[number, number, number]>, blocked: (x: number, y: number, z: number) => boolean, loop: boolean): boolean {
  const n = loop ? pts.length : pts.length - 1;
  for (let lift = 0; lift < 5; lift++) {
    let hit = false;
    for (let i = 0; i < n && !hit; i++) {
      const a = pts[i]!, b = pts[(i + 1) % pts.length]!;
      for (let k = 0; k <= 5; k++) {
        const t = k / 5;
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

/**
 * Four pad runs plus a slow circuit over the deck.
 * `blocked` is `insideLandmark` with a few metres of pad; points over the roof must already sit above it.
 */
export function lapdPadRuns(
  l: { x: number; z: number; bearingDeg: number },
  blocked: (x: number, y: number, z: number) => boolean,
): PadRun[] {
  const yaw = bearingToYaw(l.bearingDeg);
  const w = (lx: number, y: number, lz: number): [number, number, number] => {
    const [x, z] = localToWorld(l.x, l.z, yaw, lx, lz);
    return [x, y, z];
  };
  const runs: PadRun[] = [];
  // Plaza-side pads (local −Z, toward City Hall): a long departure to the southwest so the
  // pad itself sits past the open-lane fade. Far-side pads mirror that.
  const paths: Array<{ id: string; pts: Array<[number, number, number]> }> = [
    {
      id: 'lapd-pad-a',
      pts: [
        w(-200, 196, -250), w(-90, 206, -170), w(-40, 216, -110),
        w(-28, HOVER_Y, -72), w(-28, HOVER_Y, -38), w(-28, HOVER_Y + 1, 10),
        w(20, 214, 140), w(70, 200, 320), w(110, 188, 520),
      ],
    },
    {
      id: 'lapd-pad-b',
      pts: [
        w(210, 198, -260), w(100, 208, -175), w(48, 216, -112),
        w(28, HOVER_Y, -72), w(28, HOVER_Y, -38), w(28, HOVER_Y + 1, 16),
        w(-10, 216, 150), w(-60, 202, 330), w(-100, 190, 530),
      ],
    },
    {
      id: 'lapd-pad-c',
      pts: [
        w(-160, 190, 520), w(-80, 200, 300), w(-40, 214, 140),
        w(-28, HOVER_Y, 70), w(-28, HOVER_Y, 38), w(-28, HOVER_Y + 1, -8),
        w(10, 214, -120), w(50, 202, -280), w(90, 190, -480),
      ],
    },
    {
      id: 'lapd-pad-d',
      pts: [
        w(170, 192, 530), w(90, 204, 310), w(46, 216, 145),
        w(28, HOVER_Y, 72), w(28, HOVER_Y, 38), w(28, HOVER_Y + 1, -6),
        w(-16, 214, -130), w(-55, 200, -290), w(-95, 188, -490),
      ],
    },
  ];
  for (const p of paths) {
    if (!settle(p.pts, blocked, false)) continue;
    runs.push({
      id: p.id, loop: false, pts: p.pts,
      weight: 3.2, police: 1, transport: 0, speed: [18, 32], sep: 4.2, altBias: 0, fade: 70,
    });
  }
  const circuit: Array<[number, number, number]> = [];
  const n = 28;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    circuit.push(w(Math.cos(a) * 36, HOVER_Y + 1.2, Math.sin(a) * 48));
  }
  if (settle(circuit, blocked, true)) {
    runs.push({
      id: 'lapd-pad-circuit', loop: true, pts: circuit,
      weight: 1.5, police: 1, transport: 0, speed: [12, 18], sep: 0, altBias: 0, fade: 40,
    });
  }
  return runs;
}
