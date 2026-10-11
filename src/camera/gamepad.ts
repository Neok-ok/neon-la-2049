// Standard gamepad mapping. Missing pads and drifting sticks stay at zero.
// One poll per frame: edges are consumed on read.

export interface Pad {
  connected: boolean;
  lx: number;
  ly: number;
  rx: number;
  ry: number;
  lt: number;
  rt: number;
  a: boolean;
  b: boolean;
  x: boolean;
  y: boolean;
  lb: boolean;
  rb: boolean;
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
}

const DEAD = 0.18;

const idle: Pad = {
  connected: false,
  lx: 0, ly: 0, rx: 0, ry: 0, lt: 0, rt: 0,
  a: false, b: false, x: false, y: false, lb: false, rb: false,
  up: false, down: false, left: false, right: false,
};

const held = {
  a: false, b: false, x: false, y: false, lb: false, rb: false,
  up: false, down: false, left: false, right: false,
};

function axis(v: number): number {
  if (Math.abs(v) < DEAD) return 0;
  const s = Math.sign(v);
  return s * (Math.abs(v) - DEAD) / (1 - DEAD);
}

function edge(now: boolean, key: keyof typeof held): boolean {
  const prev = held[key];
  held[key] = now;
  return now && !prev;
}

export function pollPad(): Pad {
  const pads = typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : [];
  let pad: Gamepad | null = null;
  for (const candidate of pads) {
    if (candidate && candidate.connected) { pad = candidate; break; }
  }
  if (!pad) {
    for (const key of Object.keys(held) as Array<keyof typeof held>) held[key] = false;
    return idle;
  }
  const b = pad.buttons;
  const ax = pad.axes;
  const on = (i: number) => (b[i]?.pressed ?? false) || (b[i]?.value ?? 0) > 0.55;
  return {
    connected: true,
    lx: axis(ax[0] ?? 0),
    ly: axis(-(ax[1] ?? 0)),
    rx: axis(ax[2] ?? 0),
    ry: axis(-(ax[3] ?? 0)),
    lt: b[6]?.value ?? 0,
    rt: b[7]?.value ?? 0,
    a: edge(on(0), 'a'),
    b: edge(on(1), 'b'),
    x: edge(on(2), 'x'),
    y: edge(on(3), 'y'),
    lb: edge(on(4), 'lb'),
    rb: edge(on(5), 'rb'),
    up: edge(on(12), 'up'),
    down: edge(on(13), 'down'),
    left: edge(on(14), 'left'),
    right: edge(on(15), 'right'),
  };
}
