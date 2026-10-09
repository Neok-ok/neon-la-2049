// Fixed clocks on graph nodes. No sensors. Axis 0 and axis 1 are half a cycle apart,
// with a short all-red between them. Cars only need the lamp and a stop line.

export const SIGNAL_CYCLE = 16;
export const STOP_LINE = 8.4;

export type Lamp = 'go' | 'yield' | 'stop';

const SHIFT = SIGNAL_CYCLE / 5;

/** Lamp for traffic running on `axis` through `node`. `time` is seconds. */
export function axisLamp(node: number, axis: 0 | 1, time: number): Lamp {
  let t = (time + (node % 5) * SHIFT) % SIGNAL_CYCLE;
  if (t < 0) t += SIGNAL_CYCLE;
  if (axis === 1) t = (t + SIGNAL_CYCLE * 0.5) % SIGNAL_CYCLE;
  if (t < 6.4) return 'go';
  if (t < 7.6) return 'yield';
  return 'stop';
}

/** True when a car this far from the node should not enter. */
export function lampHeld(lamp: Lamp, distToNode: number): boolean {
  if (lamp === 'stop') return true;
  if (lamp === 'yield') return distToNode > 16;
  return false;
}

export const LAMP_RGB: Record<Lamp, [number, number, number]> = {
  go: [0.18, 1.25, 0.32],
  yield: [1.4, 0.7, 0.08],
  stop: [1.5, 0.07, 0.045],
};
