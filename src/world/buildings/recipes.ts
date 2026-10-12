// Eight downtown families, four field families, and three hero recipes.
// Original masses in the 2049 spirit: banded slabs, setbacks, buttresses, a dark taper,
// a residential stack, an ad shaft, a top-heavy cantilever, a cruciform lantern.
// Field masses stay local: a Hollywood screen, an Arts District flue bank,
// an East LA housing bar, and a South Bay flare bed.
// The kite recipe stays. It is not placed: a 480 m needle beside Caldera Step is a third spire.
// Storeys are 3.4 m (housing) or 3.6 m (everything else), from the shared scale module.
// Doors are 2.2 m square. A ground flight uses planFlight when the facade has room.
// Nothing here copies a film building, a logo, or a real brand.
import { Rng } from '../../core/rng';
import { planFlight } from '../architecture/scale';
import { Style, type StyleId } from '../fabric/types';
import { AD_COLORS } from './lights';
import {
  DOOR_H, DOOR_W, RES_STOREY, STOREY, addBox, band, emptyDraft, entryFlight, mastTip, rail, skin, snap,
  type Draft, type TowerKind,
} from './parts';

export interface TowerSpec {
  kind: TowerKind;
  variant: number;
  seed: number;
  height: number;
  /** Footprint along B (t). */
  w: number;
  /** Footprint along A (s). */
  d: number;
  lit: number;
  tint: number;
  /** Full-width street wall up to this height. 0 means the sculpture starts at the ground. */
  plinth: number;
  decks: readonly number[];
  phrases: readonly number[];
  holo: boolean;
  /** Hard clamp. Heroes pass their design height. Fabric passes the district ceiling. */
  minH: number;
  maxH: number;
}

function rngOf(spec: TowerSpec): Rng {
  const n = Math.floor(Math.abs(spec.seed) * 1e6) || 1;
  return new Rng(n);
}


export function buildTower(spec: TowerSpec): Draft {
  const module = spec.kind === 'res-stack' || spec.kind === 'shelf-row' ? RES_STOREY : STOREY;
  let maxH = spec.maxH;
  // Roof plant sits above the crown. Keep the whole fabric stack under 305 m.
  if (maxH <= 320) maxH = Math.min(maxH, 299 - crownExtra(spec.kind));
  const minH = Math.min(maxH, Math.max(spec.minH, module * 8));
  const height = snap(spec.height, module, minH, maxH);
  const variant = ((spec.variant % 3) + 3) % 3;
  const d = emptyDraft(spec.kind, variant, spec.w, spec.d, module);
  const r = rngOf(spec);
  const plinth = Math.min(height - module * 4, Math.max(0, spec.plinth));
  if (plinth >= module * 3) {
    skin(d, {
      s: 0, t: 0, lb: spec.w, la: spec.d, h: plinth, base: 0,
      style: Style.Megablock, lit: spec.lit * 0.65, tint: spec.tint, door: true,
    });
    for (const y of spec.decks) {
      if (y < 6 || y > plinth - 1) continue;
      deckRing(d, spec.w, spec.d, y, spec.tint);
    }
  }
  const y0 = plinth >= module * 3 ? plinth : 0;
  const door = y0 === 0;
  const H = height - y0;
  switch (spec.kind) {
    case 'band-slab': bandSlab(d, spec, H, y0, door, variant); break;
    case 'ziggurat': ziggurat(d, spec, H, y0, door, variant); break;
    case 'buttress': buttress(d, spec, H, y0, door, variant); break;
    case 'monolith': monolith(d, spec, H, y0, door, variant); break;
    case 'res-stack': resStack(d, spec, H, y0, door, variant); break;
    case 'holo-shaft': holoShaft(d, spec, H, y0, door, variant); break;
    case 'cantilever': cantilever(d, spec, H, y0, door, variant); break;
    case 'lantern': lantern(d, spec, H, y0, door, variant); break;
    case 'screen-wall': screenWall(d, spec, H, y0, door, variant); break;
    case 'flue-bank': flueBank(d, spec, H, y0, door, variant); break;
    case 'shelf-row': shelfRow(d, spec, H, y0, door, variant); break;
    case 'flare-bed': flareBed(d, spec, H, y0, door, variant); break;
    case 'hero-gate': heroGate(d, spec, height); break;
    case 'hero-step': heroStep(d, spec, height); break;
    case 'hero-obelisk': heroObelisk(d, spec, height); break;
    default: bandSlab(d, spec, H, y0, door, variant); break;
  }
  dressRoof(d, spec, r);
  dressSigns(d, spec);
  entryFlight(d);
  d.height = height;
  return d;
}

function deckRing(d: Draft, w: number, depth: number, y: number, tint: number): void {
  const t = 0.2;
  const reach = 1.35;
  // Proud of the B faces. w is the B size, depth is the A size.
  addBox(d, {
    s: 0, t: w / 2 + reach / 2, lb: reach, la: depth * 0.72, h: t, base: y,
    style: Style.Solid, lit: 0.05, tint: tint * 0.75, detail: 1, ornament: 1, role: 'deck',
  });
  addBox(d, {
    s: 0, t: -(w / 2 + reach / 2), lb: reach, la: depth * 0.72, h: t, base: y,
    style: Style.Solid, lit: 0.05, tint: tint * 0.75, detail: 1, ornament: 1, role: 'deck',
  });
  rail(d, 0, w / 2 + reach * 0.85, 0.1, depth * 0.68, y + t, tint);
  rail(d, 0, -(w / 2 + reach * 0.85), 0.1, depth * 0.68, y + t, tint);
}

/** Metres of crown, mast or antennas that sit above the snapped roof. Fabric stays under 305. */
function crownExtra(kind: TowerKind): number {
  switch (kind) {
    case 'buttress': return 20;
    case 'holo-shaft': return 26;
    case 'res-stack': return 16;
    case 'lantern': return 16;
    case 'band-slab': return 12;
    case 'ziggurat': return 12;
    case 'monolith': return 8;
    case 'cantilever': return 12;
    case 'screen-wall': return 8;
    case 'flue-bank': return 6;
    case 'shelf-row': return 6;
    case 'flare-bed': return 6;
    case 'hero-obelisk': return 0;
    default: return 8;
  }
}

function bandSlab(d: Draft, spec: TowerSpec, H: number, y0: number, door: boolean, variant: number): void {
  const rhythm = variant === 1 ? 6 : 4;
  const step = spec.kind === 'res-stack' ? RES_STOREY * rhythm : STOREY * rhythm;
  const inset = variant === 2 ? 0.78 : 0.84;
  const bw = spec.w * inset;
  const bd = spec.d * inset;
  // A 2 m belt disappears into the window grid past a hundred metres. These are storey-and-a-half stripes.
  const dark = 6.2;
  let y = 0;
  let first = true;
  while (y < H - 0.5) {
    const slice = Math.min(step, H - y);
    let bandH = Math.min(dark, slice * 0.46);
    let winH = slice - bandH;
    if (first && door && winH < DOOR_H + 0.6) {
      winH = Math.min(Math.max(slice - 1.2, 0), Math.max(winH, DOOR_H + 0.6));
      bandH = Math.max(0, slice - winH);
    }
    const style = variant === 0 ? Style.Panel : Style.Megablock;
    if (first && door) {
      skin(d, {
        s: 0, t: 0, lb: bw, la: bd, h: winH, base: y0 + y,
        style, lit: spec.lit, tint: spec.tint, door: true,
      });
    } else if (winH > 0.4) {
      addBox(d, {
        s: 0, t: 0, lb: bw, la: bd, h: winH, base: y0 + y,
        style, lit: spec.lit, tint: spec.tint, detail: 0, role: 'mass',
      });
    }
    if (bandH > 0.8) {
      band(d, 0, 0, spec.w, spec.d, y0 + y + winH, bandH, spec.lit, spec.tint);
      // Short in the vertical, so the glow stays one light bar and does not tile into windows.
      const lip = y0 + y + winH;
      addBox(d, {
        s: -(spec.d / 2 + 0.4), t: 0, lb: spec.w * 0.98, la: 0.42, h: 1.55, base: lip,
        style: Style.Glow, lit: 0.7, tint: 1.12, detail: 0, role: 'band',
      });
      addBox(d, {
        s: 0, t: spec.w / 2 + 0.35, lb: 0.4, la: spec.d * 0.96, h: 1.55, base: lip,
        style: Style.Glow, lit: 0.7, tint: 1.12, detail: 0, role: 'band',
      });
    }
    y += slice;
    first = false;
  }
}

function ziggurat(d: Draft, spec: TowerSpec, H: number, y0: number, door: boolean, variant: number): void {
  const steps = variant === 0 ? 6 : variant === 1 ? 8 : 5;
  const slice = H / steps;
  for (let i = 0; i < steps; i++) {
    const f = 1 - i * (0.62 / steps);
    const h = i === steps - 1 ? H - slice * i : slice;
    const bw = spec.w * f;
    const bd = spec.d * f;
    if (i === 0 && door) {
      skin(d, {
        s: 0, t: 0, lb: bw, la: bd, h, base: y0 + slice * i,
        style: Style.Megablock, lit: spec.lit * (1 - i * 0.08), tint: spec.tint, door: true,
      });
    } else {
      addBox(d, {
        s: 0, t: 0, lb: bw, la: bd, h, base: y0 + slice * i,
        style: i > steps - 3 ? Style.Office : Style.Megablock,
        lit: spec.lit * (1 - i * 0.06), tint: spec.tint * (1 - i * 0.04),
        detail: 0, role: 'mass',
      });
    }
  }
}

function buttress(d: Draft, spec: TowerSpec, H: number, y0: number, door: boolean, variant: number): void {
  // The core is the building. Megablock cells are 3.6 m, the same as a storey, so the
  // street sees punched windows beside the door and the flyover sees a floor grid.
  // A monolith core read as a blank wall. A tall glow face would tile into a window wall.
  const cw = spec.w * (variant === 2 ? 0.56 : variant === 1 ? 0.48 : 0.52);
  const cd = spec.d * (variant === 2 ? 0.56 : variant === 1 ? 0.48 : 0.52);
  skin(d, {
    s: 0, t: 0, lb: cw, la: cd, h: H, base: y0,
    style: Style.Megablock, lit: 0.86, tint: Math.min(0.58, spec.tint * 0.8), door,
  });
  const pw = Math.min(spec.w * 0.16, 8);
  const pd = Math.min(spec.d * 0.16, 8);
  const ph = H * (variant === 1 ? 0.48 : 0.64);
  const corners: Array<[number, number]> = [
    [1, 1], [1, -1], [-1, 1], [-1, -1],
  ];
  for (const [as, bt] of corners) {
    const s = as * (spec.d / 2 - pd / 2);
    const t = bt * (spec.w / 2 - pw / 2);
    addBox(d, {
      s, t, lb: pw, la: pd, h: ph, base: y0,
      style: Style.Slit, lit: 0.42, tint: spec.tint * 0.55, detail: 0, role: 'mass',
    });
    // A short cap, not a tall glow column. The column tiled into window slots.
    addBox(d, {
      s: as * (spec.d / 2 - pd * 0.15), t, lb: pw * 0.92, la: 0.42, h: 1.55, base: y0 + ph - 1.7,
      style: Style.Glow, lit: 0.66, tint: 1.12, detail: 0, role: 'band',
    });
  }
  // Thin plates between the piers. A 3 m belt hid the window grid.
  for (const f of [0.32, 0.5]) {
    const y = y0 + H * f;
    if (y > y0 + ph - 2) continue;
    addBox(d, {
      s: 0, t: 0, lb: spec.w * 0.98, la: spec.d * 0.98, h: 1.45, base: y,
      style: Style.Solid, lit: 0.08, tint: spec.tint * 0.62, detail: 0, role: 'deck',
    });
  }
  const walks = variant === 2 ? [0.22, 0.4, 0.58] : [0.3, 0.52];
  for (const f of walks) {
    const y = y0 + H * f;
    if (y > y0 + ph - 2) continue;
    addBox(d, {
      s: 0, t: 0, lb: spec.w * 0.78, la: 2.2, h: 0.22, base: y,
      style: Style.Solid, lit: 0.06, tint: spec.tint * 0.7, detail: 1, ornament: 1, role: 'deck',
    });
    addBox(d, {
      s: 0, t: 0, lb: 2.2, la: spec.d * 0.78, h: 0.22, base: y,
      style: Style.Solid, lit: 0.06, tint: spec.tint * 0.7, detail: 1, ornament: 1, role: 'deck',
    });
    rail(d, 1.05, 0, spec.w * 0.7, 0.1, y + 0.22, spec.tint);
    rail(d, -1.05, 0, spec.w * 0.7, 0.1, y + 0.22, spec.tint);
    rail(d, 0, 1.05, 0.1, spec.d * 0.7, y + 0.22, spec.tint);
    rail(d, 0, -1.05, 0.1, spec.d * 0.7, y + 0.22, spec.tint);
  }
  // Entry brow and side piers. They stay clear of the flight (the run ends near 7.6 m).
  const faceS = -cd / 2;
  addBox(d, {
    s: faceS - 0.7, t: 0, lb: 2.3, la: 1.15, h: 0.28, base: y0 + 2.45,
    style: Style.Solid, lit: 0.12, tint: 0.9, detail: 0, role: 'mass',
  });
  const pierT = cw * 0.42;
  if (pierT > 8.6 && pierT < cw / 2 - 0.8) {
    for (const side of [-1, 1]) {
      addBox(d, {
        s: faceS - 0.28, t: side * pierT, lb: 0.72, la: 0.55, h: STOREY * 2, base: y0,
        style: Style.Solid, lit: 0.08, tint: spec.tint * 0.85, detail: 0, role: 'mass',
      });
    }
  }
  // Cage on the core. Not a glow crown: the monolith already wears that hat.
  const roof = y0 + H;
  addBox(d, {
    s: 0, t: 0, lb: cw * 0.9, la: cd * 0.9, h: 1.05, base: roof,
    style: Style.Solid, lit: 0.06, tint: spec.tint * 0.5, detail: 0, role: 'mass',
  });
  const postH = variant === 1 ? 6.5 : 8.5;
  const insetT = cw * 0.9 / 2 - 0.85;
  const insetS = cd * 0.9 / 2 - 0.85;
  for (const [as, bt] of corners) {
    addBox(d, {
      s: as * insetS, t: bt * insetT, lb: 1.5, la: 1.5, h: postH, base: roof + 1.05,
      style: Style.Solid, lit: 0.05, tint: spec.tint * 0.48, detail: 0, role: 'mass',
    });
  }
  addBox(d, {
    s: 0, t: 0, lb: cw * 0.9, la: 0.45, h: 0.7, base: roof + 1.05 + postH - 0.7,
    style: Style.Solid, lit: 0.05, tint: spec.tint * 0.5, detail: 0, role: 'mass',
  });
  addBox(d, {
    s: 0, t: 0, lb: 0.45, la: cd * 0.9, h: 0.7, base: roof + 1.05 + postH - 0.7,
    style: Style.Solid, lit: 0.05, tint: spec.tint * 0.5, detail: 0, role: 'mass',
  });
  const plants: Array<[number, number, number, number, number]> = [
    [cd * 0.12, cw * 0.16, 3.2, 2.2, 2.6],
    [-cd * 0.1, -cw * 0.14, 2.4, 3.4, 1.9],
  ];
  for (const [s, t, lb, la, h] of plants) {
    addBox(d, {
      s, t, lb, la, h, base: roof + 1.05,
      style: Style.Industrial, lit: 0.03, tint: 0.42, detail: 2, ornament: 2, role: 'mass',
    });
  }
  for (let k = 0; k < 3; k++) {
    addBox(d, {
      s: (k - 1) * insetS * 0.55, t: (1 - k) * insetT * 0.4,
      lb: 0.28, la: 0.28, h: 4.2 + k * 3.1, base: roof + 1.05,
      style: Style.Industrial, lit: 0, tint: 0.38, detail: 2, ornament: 2, role: 'mass',
    });
  }
  mastTip(d, cw * 0.18, -cd * 0.12, roof + 1.05, variant === 0 ? 12 : 8);
}

function monolith(d: Draft, spec: TowerSpec, H: number, y0: number, door: boolean, variant: number): void {
  const steps = variant === 1 ? 5 : 7;
  let faceS = -spec.d / 2;
  let faceW = spec.w;
  for (let i = 0; i < steps; i++) {
    const f0 = 1 - i * (0.72 / steps);
    const f1 = 1 - (i + 1) * (0.72 / steps);
    const h = H / steps;
    const bw = spec.w * (f0 + f1) / 2;
    const bd = spec.d * (f0 + f1) / 2;
    if (i === 0) {
      faceS = -bd / 2;
      faceW = bw;
    }
    if (i === 0 && door) {
      skin(d, {
        s: 0, t: 0, lb: bw, la: bd, h, base: y0 + h * i,
        style: Style.Monolith, lit: 0.08, tint: spec.tint * 0.72, door: true,
      });
    } else {
      addBox(d, {
        s: 0, t: 0, lb: bw, la: bd, h, base: y0 + h * i,
        style: Style.Monolith, lit: 0.06, tint: spec.tint * (0.78 - i * 0.04),
        detail: 0, role: 'mass',
      });
    }
  }
  // The slit used to sit in the middle of the footprint, inside the stone.
  // It belongs on the street face, starting one storey above the door.
  const slitH = Math.min(H * 0.7, Math.max(12, H - 6));
  addBox(d, {
    s: faceS - 0.35, t: faceW * 0.08, lb: 2.4, la: 0.7, h: slitH, base: y0 + STOREY,
    style: Style.Glow, lit: 0.72, tint: 1.15, detail: 0, role: 'mass',
  });
}

function resStack(d: Draft, spec: TowerSpec, H: number, y0: number, door: boolean, variant: number): void {
  const bw = spec.w * 0.9;
  const bd = spec.d * 0.9;
  skin(d, {
    s: 0, t: 0, lb: bw, la: bd, h: H, base: y0,
    // Panel strips, not the monolith's dark stone. The shelves are what separate this shaft.
    style: Style.Panel, lit: spec.lit * 0.9, tint: spec.tint, door,
  });
  const every = (variant === 1 ? 3 : 4) * RES_STOREY;
  const face = bd / 2;
  const limit = spec.d / 2 + 2.0;
  const plateD = Math.min(4.8, Math.max(1.8, limit - face - 0.55));
  const plateH = 1.7;
  for (let y = y0 + every; y < y0 + H - 2; y += every) {
    addBox(d, {
      s: -(face + plateD / 2), t: 0, lb: bw * 0.88, la: plateD, h: plateH, base: y,
      style: Style.Solid, lit: 0.07, tint: spec.tint * 0.75, detail: 0, role: 'balcony',
    });
    addBox(d, {
      s: -(face + plateD + 0.16), t: 0, lb: bw * 0.9, la: 0.28, h: 1.35, base: y + plateH - 0.15,
      style: Style.Glow, lit: 0.72, tint: 1.12, detail: 0, role: 'balcony',
    });
    if (variant === 2) {
      addBox(d, {
        s: 0, t: bw / 2 + 1.15, lb: 2.0, la: bd * 0.5, h: plateH, base: y,
        style: Style.Solid, lit: 0.07, tint: spec.tint * 0.75, detail: 0, role: 'balcony',
      });
    }
    if (variant !== 0 && ((y / every) | 0) % 2 === 0) {
      addBox(d, {
        s: bd / 2 + 0.35, t: bw * 0.22, lb: 0.85, la: 0.55, h: 0.62, base: y,
        style: Style.Industrial, lit: 0.02, tint: 0.55,
        detail: 2, ornament: 2, role: 'mass',
      });
    }
  }
  addBox(d, {
    s: -bd / 2, t: bw * 0.38, lb: 0.55, la: 0.55, h: H * 0.92, base: y0 + 4,
    style: Style.Industrial, lit: 0.02, tint: 0.48, detail: 2, ornament: 2, role: 'mass',
  });
  for (let k = 0; k < 3; k++) {
    addBox(d, {
      s: (k - 1) * bd * 0.18, t: (k - 1) * bw * 0.12,
      lb: 0.45, la: 0.45, h: 6 + k * 3, base: y0 + H,
      style: Style.Industrial, lit: 0, tint: 0.4, detail: 2, ornament: 2, role: 'mass',
    });
  }
}

function holoShaft(d: Draft, spec: TowerSpec, H: number, y0: number, door: boolean, variant: number): void {
  const bw = spec.w * (variant === 1 ? 0.38 : 0.48);
  const bd = spec.d * 0.42;
  skin(d, {
    s: 0, t: 0, lb: Math.max(bw, spec.w * 0.7), la: spec.d * 0.72, h: Math.min(18, H * 0.12), base: y0,
    style: Style.Megablock, lit: spec.lit * 0.5, tint: spec.tint, door,
  });
  const shaftBase = y0 + Math.min(18, H * 0.12);
  const shaftH = y0 + H - shaftBase;
  addBox(d, {
    s: 0, t: 0, lb: bw, la: bd, h: shaftH, base: shaftBase,
    style: Style.Monolith, lit: 0.16, tint: spec.tint * 0.7, detail: 0, role: 'mass',
  });
  // Two faces of one corner, each a single light line. A wide glow face tiles into windows.
  const slitH = shaftH * 0.62;
  const slitBase = shaftBase + shaftH * 0.16;
  addBox(d, {
    s: -(bd / 2 + 0.3), t: bw * 0.06, lb: 2.4, la: 0.55, h: slitH, base: slitBase,
    style: Style.Glow, lit: 0.74, tint: 1.15, detail: 0, role: 'mass',
  });
  addBox(d, {
    s: bd * 0.08, t: bw / 2 + 0.3, lb: 0.55, la: 2.4, h: slitH, base: slitBase,
    style: Style.Glow, lit: 0.74, tint: 1.15, detail: 0, role: 'mass',
  });
  mastTip(d, 0, 0, shaftBase + shaftH, 16);
}

function cantilever(d: Draft, spec: TowerSpec, H: number, y0: number, door: boolean, variant: number): void {
  const split = variant === 1 ? 0.34 : 0.28;
  const baseH = H * split;
  // Narrow in width only. Depth stays put so the street door does not move.
  const bw = spec.w * 0.4;
  const bd = spec.d * 0.62;
  skin(d, {
    s: 0, t: 0, lb: bw, la: bd, h: baseH, base: y0,
    style: Style.Megablock, lit: spec.lit * 0.7, tint: spec.tint, door,
  });
  const topW = Math.min(spec.w * 1.2, spec.w + 3.6);
  const topD = spec.d * 0.9;
  const t = 0;
  addBox(d, {
    s: 0, t, lb: topW, la: topD, h: H - baseH, base: y0 + baseH,
    style: Style.Panel, lit: spec.lit, tint: spec.tint, detail: 0, role: 'mass',
  });
  // A short lip, not a window wall. It marks the joint; the wider top is the mass above it.
  addBox(d, {
    s: 0, t, lb: Math.min(topW + 0.5, spec.w + 4.0), la: topD, h: 2.1, base: y0 + baseH - 0.3,
    style: Style.Glow, lit: 0.86, tint: 1.2, detail: 0, role: 'band',
  });
  const bands = variant === 0 ? 4 : 3;
  for (let i = 1; i <= bands; i++) {
    const y = y0 + baseH + ((H - baseH) * i) / (bands + 1);
    band(d, 0, t, topW, topD, y, 1.8, spec.lit, spec.tint);
  }
}

function lantern(d: Draft, spec: TowerSpec, H: number, y0: number, door: boolean, variant: number): void {
  // The cross is a street-face figure: a full-height 2.4 m slit (one glow column,
  // the same shaft the monolith uses) crossed by lips shorter than one 4.5 m cell.
  // A wide glow box taller than that cell tiles into a window wall. The mid bar
  // is solid stone, the width that still reads past a flyby.
  // The depth arm sits behind the street face. It does not project into the sidewalk.
  const wingW = Math.min(spec.w * 0.92, variant === 1 ? 40 : 34);
  const wingLa = Math.min(spec.d * 0.42, 14);
  const face = -spec.d / 2 + 0.9;
  const wingS = face + wingLa / 2;
  const armW = Math.min(variant === 1 ? 12 : 10, wingW * 0.36);
  const armFront = face + 0.55;
  const armBack = Math.min(spec.d / 2 - 0.5, armFront + wingLa + 16);
  const armD = Math.max(wingLa * 0.8, armBack - armFront);
  const armS = armFront + armD / 2;
  // The flight runs to +t. The cross sits on the other side of the door,
  // close enough that the scale camera still has it in frame.
  const barW = Math.min(12.5, wingW * 0.48);
  const flightNeed = 8.4;
  const crossOff = barW / 2 - 0.7;
  const doorMin = -wingW / 2 + 0.8 + crossOff + barW / 2;
  const doorMax = wingW / 2 - 1.3 - flightNeed;
  const doorT = Math.min(Math.max(doorMin, -wingW * 0.22), doorMax);
  const slitT = doorT - crossOff;
  skin(d, {
    s: wingS, t: 0, lb: wingW, la: wingLa, h: H, base: y0,
    style: Style.Monolith, lit: 0.07, tint: spec.tint * 0.66, door, doorT,
  });
  addBox(d, {
    s: armS, t: 0, lb: armW, la: armD, h: H - 0.3, base: y0,
    style: Style.Monolith, lit: 0.06, tint: spec.tint * 0.6, detail: 0, role: 'mass',
  });
  const limitS = spec.d / 2 + 2.05;
  const placeS = (s: number, la: number): number => {
    const front = -(s - la / 2);
    return front > limitS ? s + (front - limitS) : s;
  };
  const lipH = 1.55;
  const shaftLa = 0.5;
  const shaftS = placeS(face - 2.05, shaftLa);
  addBox(d, {
    s: shaftS, t: slitT, lb: 2.4, la: shaftLa, h: Math.max(STOREY * 4, H * 0.9 - STOREY), base: y0 + STOREY,
    style: Style.Glow, lit: 0.76, tint: 1.16, detail: 0, role: 'mass',
  });
  addBox(d, {
    s: placeS(face - 1.78, 0.32), t: slitT, lb: barW, la: 0.32, h: lipH, base: y0 + 5.05 - lipH / 2,
    style: Style.Glow, lit: 0.8, tint: 1.14, detail: 0, role: 'band',
  });
  // Stone belt, narrower than the wing so the elevation stays a slab with a bar, not a band-slab.
  const beltH = 6.2;
  const beltW = Math.min(18, wingW - 3);
  const beltLimit = wingW / 2 - beltW / 2 - 0.35;
  const beltT = Math.max(-beltLimit, Math.min(beltLimit, slitT));
  const beltLa = 1.6;
  const beltS = placeS(face - 0.95, beltLa);
  const beltBase = y0 + H * 0.52 - beltH / 2;
  addBox(d, {
    s: beltS, t: beltT, lb: beltW, la: beltLa, h: beltH, base: beltBase,
    style: Style.Solid, lit: 0.1, tint: 0.94, detail: 0, role: 'band',
  });
  addBox(d, {
    s: placeS(beltS - beltLa / 2 - 0.22, 0.3), t: slitT, lb: Math.min(10, beltW - 1), la: 0.3, h: lipH,
    base: beltBase + (beltH - lipH) / 2,
    style: Style.Glow, lit: 0.8, tint: 1.14, detail: 0, role: 'band',
  });
  addBox(d, {
    s: placeS(face - 1.7, 0.32), t: slitT, lb: Math.min(11, beltW - 2), la: 0.32, h: lipH,
    base: y0 + H * 0.78 - lipH / 2,
    style: Style.Glow, lit: 0.74, tint: 1.12, detail: 0, role: 'band',
  });
  const roof = y0 + H;
  // Cruciform parapet. The glowing hat belongs to the monolith.
  addBox(d, {
    s: face + 0.5, t: 0, lb: wingW * 0.94, la: 0.7, h: 1.35, base: roof,
    style: Style.Solid, lit: 0.05, tint: spec.tint * 0.72, detail: 0, role: 'mass',
  });
  addBox(d, {
    s: armS, t: 0, lb: 0.75, la: Math.max(2, armD - 1.2), h: 1.35, base: roof,
    style: Style.Solid, lit: 0.05, tint: spec.tint * 0.68, detail: 0, role: 'mass',
  });
  addBox(d, {
    s: wingS, t: slitT, lb: 2.2, la: Math.min(wingLa * 0.8, 8), h: 2.6, base: roof,
    style: Style.Solid, lit: 0.06, tint: spec.tint * 0.7, detail: 0, role: 'mass',
  });
  const plants: Array<[number, number, number, number, number]> = [
    [armS + Math.min(armD * 0.12, 2), armW * 0.22, 2.6, 1.6, 2.4],
    [armS - Math.min(armD * 0.06, 1.2), -armW * 0.18, 1.8, 1.4, 3.2],
    [wingS + 0.4, Math.min(slitT + 4.2, wingW / 2 - 2), 2.4, 1.5, 1.9],
  ];
  for (const [s, t, lb, la, h] of plants) {
    addBox(d, {
      s, t, lb, la, h, base: roof + 1.4,
      style: Style.Industrial, lit: 0.03, tint: 0.4, detail: 2, ornament: 2, role: 'mass',
    });
  }
  for (let k = 0; k < 3; k++) {
    addBox(d, {
      s: armS + (k - 1) * 1.4, t: (k === 1 ? 0.6 : -0.8) * (k === 0 ? 1 : 1.4),
      lb: 0.32, la: 0.32, h: 4.2 + k * 2.2, base: roof + 1.4,
      style: Style.Industrial, lit: 0, tint: 0.38, detail: 2, ornament: 2, role: 'mass',
    });
  }
  mastTip(d, armS, armW * 0.15, roof + 1.4, 8);
  // The flight is dark stone on dark stone. A lighter plate behind it lets the risers read.
  entryFlight(d);
  const flight = planFlight(STOREY);
  const run0 = doorT + DOOR_W / 2 + 0.4;
  addBox(d, {
    s: face - 0.08, t: run0 + flight.run / 2, lb: flight.run + 0.4, la: 0.14, h: STOREY + 0.25, base: y0,
    style: Style.Solid, lit: 0.18, tint: 1.05, detail: 0, role: 'mass',
  });
  addBox(d, {
    s: placeS(face - 0.62, 1.05), t: doorT, lb: 2.4, la: 1.05, h: 0.26, base: y0 + 2.42,
    style: Style.Solid, lit: 0.14, tint: 1.0, detail: 0, role: 'mass',
  });
  const flightEnd = run0 + flight.run;
  let piers = 0;
  for (let t = flightEnd + 1.15; t < wingW / 2 - 1.05 && piers < 4; t += 2.7) {
    addBox(d, {
      s: placeS(face - 0.55, 1.25), t, lb: 0.85, la: 1.25, h: STOREY * 2, base: y0,
      style: Style.Solid, lit: 0.08, tint: 0.9, detail: 0, role: 'mass',
    });
    piers++;
  }
  if (flightEnd + 1.6 < wingW / 2 - 1.2) {
    addBox(d, {
      s: placeS(face - 0.2, 0.4), t: (flightEnd + 1.4 + wingW / 2 - 0.8) / 2,
      lb: Math.max(1.2, wingW / 2 - 0.8 - (flightEnd + 1.4)), la: 0.4, h: 0.45, base: y0 + STOREY * 2,
      style: Style.Solid, lit: 0.07, tint: spec.tint * 0.8, detail: 0, role: 'band',
    });
  }
  const fins = variant === 2 ? 4 : 3;
  for (let i = 1; i <= fins; i++) {
    const y = y0 + (H * i) / (fins + 1);
    addBox(d, {
      s: armS, t: armW / 2 + 0.28, lb: 0.32, la: Math.min(armD * 0.5, 10), h: 0.4, base: y,
      style: Style.Solid, lit: 0.06, tint: spec.tint * 0.7, detail: 1, ornament: 1, role: 'band',
    });
  }
}

function heroGate(d: Draft, spec: TowerSpec, H: number): void {
  const gap = Math.min(18, spec.w * 0.22);
  const slabW = (spec.w - gap) / 2;
  const slabD = spec.d * 0.9;
  for (const side of [-1, 1]) {
    const t = side * (gap / 2 + slabW / 2);
    skin(d, {
      s: 0, t, lb: slabW * 0.94, la: slabD, h: H, base: 0,
      style: Style.Panel, lit: spec.lit * 0.42, tint: spec.tint, door: side < 0,
    });
    // A light column on the inner face. Narrower than one glow cell, so it stays a shaft.
    addBox(d, {
      s: 0, t: side * (gap / 2 - 1.5), lb: 2.6, la: 0.6, h: H * 0.66, base: STOREY * 3,
      style: Style.Glow, lit: 0.78, tint: 1.18, detail: 0, role: 'mass',
    });
    for (let i = 1; i <= 7; i++) {
      band(d, 0, t, slabW, slabD * 1.02, (H * i) / 8, 2.2, spec.lit, spec.tint);
    }
  }
  for (const f of [0.28, 0.52, 0.74]) {
    const y = H * f;
    addBox(d, {
      s: 0, t: 0, lb: gap + 2, la: 8, h: 4.2, base: y,
      style: Style.Solid, lit: 0.12, tint: spec.tint * 0.7, detail: 0, role: 'deck',
    });
    addBox(d, {
      s: 0, t: 0, lb: gap + 1.6, la: 8.8, h: 1.1, base: y + 2.9,
      style: Style.Glow, lit: 0.5, tint: 1.15, detail: 0, role: 'band',
    });
    rail(d, 0, 0, gap, 0.12, y + 4.2, spec.tint);
  }
  mastTip(d, 0, -spec.w * 0.28, H, 22);
}

function heroStep(d: Draft, spec: TowerSpec, H: number): void {
  const steps = 11;
  const slice = H / steps;
  for (let i = 0; i < steps; i++) {
    const f = 1 - i * (0.7 / steps);
    const fw = spec.w * f;
    const fd = spec.d * f;
    if (i === 0) {
      // The first setback is nearly 60 m up. A windowless base reads as a void from the street.
      skin(d, {
        s: 0, t: 0, lb: fw, la: fd, h: slice, base: slice * i,
        style: Style.Megablock, lit: Math.max(0.28, spec.lit), tint: spec.tint, door: true,
      });
    } else {
      addBox(d, {
        s: 0, t: 0, lb: fw, la: fd, h: slice, base: slice * i,
        style: Style.Megablock, lit: spec.lit * 0.45, tint: spec.tint * (0.85 - i * 0.03),
        detail: 0, role: 'mass',
      });
    }
    // A short lip on the street face and the side the flyby sees. Tall glow faces become window walls.
    const nose = slice * (i + 1) - 1.55;
    addBox(d, {
      s: -(fd / 2 + 0.35), t: 0, lb: fw * 0.96, la: 0.45, h: 1.55, base: nose,
      style: Style.Glow, lit: 0.66, tint: 1.12, detail: 0, role: 'band',
    });
    addBox(d, {
      s: 0, t: fw / 2 + 0.3, lb: 0.45, la: fd * 0.9, h: 1.55, base: nose,
      style: Style.Glow, lit: 0.66, tint: 1.12, detail: 0, role: 'band',
    });
  }
}

/**
 * Kite elevation: narrow stem, full shoulders, a needle.
 * `y` is 0 at the ground and 1 at the published roof. The widest point is the shoulder.
 */
export function kiteProfile(y: number): number {
  const shoulder = 0.26;
  const base = 0.34;
  const tip = 0.045;
  const t = Math.max(0, Math.min(1, y));
  if (t <= shoulder) return base + (1 - base) * (t / shoulder);
  return 1 + (tip - 1) * ((t - shoulder) / (1 - shoulder));
}

function heroObelisk(d: Draft, spec: TowerSpec, H: number): void {
  const steps = 24;
  const slice = H / steps;
  let shoulderY = H * 0.26;
  for (let i = 0; i < steps; i++) {
    const y0 = i / steps;
    const y1 = (i + 1) / steps;
    const rising = y1 <= 0.26 + 1 / steps;
    const f = i === steps - 1 ? kiteProfile(1) : i === 0 ? kiteProfile(0) : rising ? kiteProfile(y1) : kiteProfile(y0);
    const bw = Math.max(2.8, spec.w * f);
    const bd = Math.max(2.8, spec.d * f);
    const base = slice * i;
    if (f > 0.96) shoulderY = base;
    if (i === 0) {
      skin(d, {
        s: 0, t: 0, lb: bw, la: bd, h: slice, base,
        style: Style.Monolith, lit: 0.1, tint: spec.tint * 0.9, door: true,
      });
    } else {
      addBox(d, {
        s: 0, t: 0, lb: bw, la: bd, h: slice, base,
        style: Style.Monolith, lit: 0.1, tint: spec.tint * 0.9,
        detail: 0, role: 'mass',
      });
    }
    // A light course at the width of this step. The lengths draw the kite at the
    // distance that keeps the tip in frame. A full-height glow face tiles into windows.
    if (i > 0 && i < steps - 1) {
      const lip = 1.55;
      addBox(d, {
        s: -(bd / 2 + 0.22), t: 0, lb: Math.max(2.2, bw * 0.9), la: 0.4, h: lip,
        base: base + slice - lip,
        style: Style.Glow, lit: 0.76, tint: 1.14, detail: 0, role: 'band',
      });
      if (i % 2 === 0) {
        addBox(d, {
          s: 0, t: bw / 2 + 0.22, lb: 0.4, la: Math.max(2.2, bd * 0.82), h: lip,
          base: base + slice - lip,
          style: Style.Glow, lit: 0.66, tint: 1.1, detail: 0, role: 'band',
        });
      }
    }
  }
  const sw = spec.w * kiteProfile(0.26);
  const sd = spec.d * kiteProfile(0.26);
  addBox(d, {
    s: -(sd / 2 - 0.15), t: 0, lb: sw * 0.94, la: 0.46, h: 1.55, base: shoulderY,
    style: Style.Glow, lit: 0.76, tint: 1.16, detail: 0, role: 'band',
  });
  addBox(d, {
    s: 0, t: sw / 2 - 0.35, lb: 0.46, la: sd * 0.88, h: 1.55, base: shoulderY,
    style: Style.Glow, lit: 0.7, tint: 1.12, detail: 0, role: 'band',
  });
  const tipW = Math.max(1.8, spec.w * kiteProfile(1));
  addBox(d, {
    s: 0, t: 0, lb: tipW * 0.72, la: tipW * 0.72, h: 2.4, base: H - 2.4,
    style: Style.Glow, lit: 0.92, tint: 1.22, detail: 0, role: 'mass',
  });
  for (let k = -1; k <= 1; k++) {
    addBox(d, {
      s: -(sd / 2 - 0.4), t: k * sw * 0.22,
      lb: 1.3, la: 1.4, h: 0.4, base: shoulderY - 0.4,
      style: Style.Solid, lit: 0.05, tint: spec.tint * 0.7,
      detail: 1, ornament: 1, role: 'band',
    });
  }
  addBox(d, {
    s: spec.d * 0.06, t: spec.w * 0.05, lb: 1.6, la: 1.1, h: 2.2, base: slice * 0.35,
    style: Style.Industrial, lit: 0.04, tint: spec.tint * 0.55,
    detail: 2, ornament: 2, role: 'mass',
  });
}

/** A glow bar starts 0.63 m above its base. Drop that sill so the authored height is the lit height. */
function buriedGlow(base: number, h: number): { base: number; h: number } {
  return { base: base - 0.63, h: h + 0.63 };
}

/**
 * Two-storey jambs beside the opening, clear of the flight.
 * A 10 m sidewalk frame can see them. Solid, so the street is not a window chart.
 */
function sidewalkPiers(d: Draft, faceS: number, halfW: number, storey: number, y0: number): void {
  const flight = planFlight(storey);
  const la = 1.2;
  // The harness stands a figure at about 2.5 m off the opening. Keep that slot empty.
  const places = [-(2.5 + 1.8), DOOR_W / 2 + 0.4 + flight.run + 1.5];
  for (const t of places) {
    if (Math.abs(t) > halfW - 1.2) continue;
    addBox(d, {
      s: faceS - la / 2, t, lb: 1.4, la, h: storey * 2, base: y0,
      style: Style.Solid, lit: 0.14, tint: 1.05, detail: 0, role: 'mass',
    });
  }
}

function screenWall(d: Draft, spec: TowerSpec, H: number, y0: number, door: boolean, variant: number): void {
  const front = -spec.d / 2;
  // The piers stand in front of the plate. A shallow pier glues the three into one slab.
  const pierD = Math.min(8, Math.max(5.2, spec.d * 0.34));
  const pierS = front + pierD / 2 + 0.15;
  const plateD = Math.max(3.6, spec.d - pierD - 1.1);
  const plateS = pierS + pierD / 2 + plateD / 2;
  const pierFrac = variant === 2 ? [0.22, 0.15] : [0.18, 0.18];
  const leftW = Math.max(4.2, spec.w * pierFrac[0]);
  const rightW = Math.max(4.2, spec.w * pierFrac[1]);
  const leftT = -spec.w / 2 + leftW / 2 + 0.25;
  const rightT = spec.w / 2 - rightW / 2 - 0.25;
  const wellL = leftT + leftW / 2;
  const wellR = rightT - rightW / 2;
  const wellW = Math.max(DOOR_W + 2.4, wellR - wellL);
  const wellT = (wellL + wellR) / 2;
  // The plate stops below the pier heads, so the fly shows two masses and sky between them.
  const plateH = H * 0.56;
  skin(d, {
    s: plateS, t: wellT, lb: Math.min(wellW, spec.w - leftW - rightW), la: plateD, h: plateH, base: y0,
    style: Style.Monolith, lit: 0.04, tint: spec.tint * 0.55, door,
  });
  const pier: Array<[number, number, number]> = [[leftT, leftW, 1], [rightT, rightW, -1]];
  for (const [t, w, inward] of pier) {
    addBox(d, {
      s: pierS, t, lb: w, la: pierD, h: H, base: y0,
      style: Style.Solid, lit: 0.1, tint: spec.tint * 0.96, detail: 0, role: 'mass',
    });
    // A few short slots, the first one inside a sidewalk frame. A panel grid would be a window chart.
    for (let y = y0 + 4.2; y < y0 + H - STOREY * 3; y += STOREY * 5) {
      const slot = buriedGlow(y, 1.15);
      addBox(d, {
        s: pierS - pierD / 2 - 0.08, t, lb: Math.min(2.2, w * 0.42), la: 0.26,
        h: slot.h, base: slot.base,
        style: Style.Glow, lit: 0.72, tint: 1.08, detail: 0, role: 'band',
      });
    }
    const canyon = buriedGlow(y0 + 3.6, 1.35);
    addBox(d, {
      s: pierS, t: t + inward * (w / 2 + 0.1), lb: 0.22, la: Math.min(2.4, pierD * 0.4),
      h: canyon.h, base: canyon.base,
      style: Style.Glow, lit: 0.55, tint: 1.06, detail: 0, role: 'band',
    });
    addBox(d, {
      s: pierS, t, lb: w * 0.92, la: pierD * 0.9, h: 4.6, base: y0 + H,
      style: Style.Solid, lit: 0.16, tint: 1.02, detail: 0, role: 'mass',
    });
  }
  // One gutter, narrower than the slot, so it is not a light course across the face.
  const gutterW = Math.min(7.2, wellW * 0.36);
  const gutter = buriedGlow(y0 + plateH - 2.6, 1.35);
  addBox(d, {
    s: plateS - plateD / 2 - 0.12, t: wellT, lb: gutterW, la: 0.32, h: gutter.h, base: gutter.base,
    style: Style.Glow, lit: 0.92, tint: 1.22, detail: 0, role: 'band',
  });
  addBox(d, {
    s: plateS - plateD / 2 - 0.2, t: wellT, lb: wellW * 0.92, la: 0.55, h: 3.8, base: y0 + plateH,
    style: Style.Solid, lit: 0.14, tint: 0.98, detail: 0, role: 'mass',
  });
}

function flueBank(d: Draft, spec: TowerSpec, H: number, y0: number, door: boolean, variant: number): void {
  // Just over the door. A level sidewalk frame is only about eight metres tall.
  const plinthH = STOREY + 1.4;
  skin(d, {
    s: 0, t: 0, lb: spec.w * 0.96, la: spec.d * 0.9, h: plinthH, base: y0,
    style: Style.Industrial, lit: 0.1, tint: spec.tint * 0.7, door,
  });
  const order = variant === 1 ? [0.78, 1, 0.58] : variant === 2 ? [0.62, 0.8, 1] : [0.74, 1, 0.56];
  const widths = [0.22, 0.28, 0.2];
  const gaps = spec.w * 0.06;
  const usable = spec.w * 0.9 - gaps * 2;
  const ws = widths.map((f) => usable * (f / (0.22 + 0.28 + 0.2)));
  let cursor = -spec.w * 0.45;
  const shafts: Array<{ t: number; w: number; h: number; s: number }> = [];
  for (let i = 0; i < 3; i++) {
    const w = Math.max(2.4, ws[i]!);
    const t = cursor + w / 2;
    cursor += w + gaps;
    const h = plinthH + (H - plinthH) * order[i]!;
    const depth = spec.d * (0.42 + (i === 1 ? 0.12 : 0));
    // Stagger the stacks in depth so a three-quarter view does not collapse them into one slab.
    // The middle stack steps toward the street so the sidewalk frame catches a shaft.
    const ss = (i === 1 ? -1.4 : (i - 1)) * Math.min(1.8, spec.d * 0.14);
    shafts.push({ t, w, h, s: ss });
    addBox(d, {
      s: ss, t, lb: w, la: Math.min(spec.d * 0.78, depth), h: h - plinthH, base: y0 + plinthH,
      style: Style.Solid, lit: 0.07, tint: 0.86,
      detail: 0, role: 'mass',
    });
    addBox(d, {
      s: ss, t, lb: w + 0.4, la: Math.min(spec.d * 0.82, depth + 0.4), h: 3.2, base: y0 + h - 3.2,
      style: Style.Solid, lit: 0.06, tint: spec.tint * 0.58, detail: 0, role: 'band',
    });
    const cap = buriedGlow(y0 + h - 3.2 - 1.45, 1.45);
    addBox(d, {
      s: ss - (depth / 2 + 0.15), t, lb: Math.min(2.2, w * 0.72), la: 0.4, h: cap.h,
      base: cap.base,
      style: Style.Glow, lit: 0.8, tint: 1.16, detail: 0, role: 'band',
    });
    // Short courses, not a full-height glow face. A tall glow cell tiles into windows.
    const courseTop = y0 + h - 4.8;
    for (let y = y0 + plinthH + 1.2; y < courseTop; y += STOREY * 4) {
      const course = buriedGlow(y, 1.35);
      addBox(d, {
        s: ss - (depth / 2 + 0.22), t, lb: Math.max(1.4, w * 0.42), la: 0.32, h: course.h,
        base: course.base,
        style: Style.Glow, lit: 0.72, tint: 1.12, detail: 0, role: 'band',
      });
    }
  }
  // No full-width tie and no shared cage. Different shaft heights are the silhouette.
  const tall = Math.max(...shafts.map((s) => s.h));
  for (const shaft of shafts) {
    const cowl = shaft.h >= tall - 0.01 ? 3.2 : 2.2;
    addBox(d, {
      s: shaft.s, t: shaft.t, lb: Math.min(3.4, shaft.w * 0.62), la: Math.min(3.2, spec.d * 0.24),
      h: cowl, base: y0 + shaft.h,
      style: Style.Solid, lit: 0.05, tint: spec.tint * 0.55, detail: 0, role: 'mass',
    });
    if (shaft.h >= tall - 0.01) continue;
    addBox(d, {
      s: spec.d * 0.12, t: shaft.t, lb: 0.7, la: 0.7, h: 1.6, base: y0 + shaft.h - 4.8,
      style: Style.Industrial, lit: 0.04, tint: spec.tint * 0.5,
      detail: 2, ornament: 2, role: 'mass',
    });
  }
}

/** East LA housing. A wide bar and a roof room, on 3.4 m floors. Not a downtown slit. */
function shelfRow(d: Draft, spec: TowerSpec, H: number, y0: number, door: boolean, variant: number): void {
  const barH = H * 0.7;
  const bw = spec.w * 0.98;
  const bd = spec.d * 0.9;
  skin(d, {
    s: 0, t: 0, lb: bw, la: bd, h: barH, base: y0,
    style: Style.Panel, lit: spec.lit * 0.55, tint: spec.tint, door,
  });
  // Wider than the downtown stack's shelf rhythm, and a deeper gallery, so East LA is not a second copy.
  const every = (variant === 1 ? 4 : 5) * RES_STOREY;
  const face = -bd / 2;
  const plateD = Math.min(2.4, Math.max(1.7, spec.d * 0.14));
  let firstShelf = true;
  for (let y = y0 + every; y < y0 + barH - RES_STOREY; y += every) {
    addBox(d, {
      s: face - plateD / 2, t: 0, lb: bw * 0.9, la: plateD, h: 0.85, base: y,
      style: Style.Solid, lit: 0.06, tint: spec.tint * 0.74, detail: 0, role: 'balcony',
    });
    const lip = buriedGlow(y + 0.7, 1.15);
    const seg = Math.min(4.2, bw * 0.18);
    for (const side of [-1, 0, 1]) {
      addBox(d, {
        s: face - plateD - 0.12, t: side * seg * 1.7, lb: seg, la: 0.26, h: lip.h, base: lip.base,
        style: Style.Glow, lit: 0.62, tint: 1.08, detail: 0, role: 'band',
      });
    }
    if (firstShelf) {
      rail(d, face - plateD / 2, 0, bw * 0.82, Math.max(0.4, plateD - 0.2), y + 0.85, spec.tint);
      firstShelf = false;
    }
  }
  if (variant === 2) {
    addBox(d, {
      s: 0, t: 0, lb: bw, la: bd * 1.02, h: 1.6, base: y0 + barH * 0.46,
      style: Style.Solid, lit: 0.05, tint: spec.tint * 0.7, detail: 0, role: 'band',
    });
  }
  addBox(d, {
    s: face - 0.2, t: 0, lb: bw * 0.98, la: 0.55, h: 3.2, base: y0 + barH - 3.2,
    style: Style.Solid, lit: 0.05, tint: spec.tint * 0.7, detail: 0, role: 'band',
  });
  const crownH = H - barH;
  const tankH = Math.min(2.6, crownH * 0.28);
  const houseH = Math.max(RES_STOREY, crownH - tankH);
  const houseW = spec.w * (variant === 1 ? 0.36 : 0.32);
  const houseD = spec.d * 0.42;
  const houseT = variant === 1 ? spec.w * 0.16 : variant === 2 ? -spec.w * 0.14 : 0;
  const houseS = spec.d * 0.06;
  addBox(d, {
    s: houseS, t: houseT, lb: houseW, la: houseD, h: houseH, base: y0 + barH,
    style: Style.Panel, lit: spec.lit * 0.45, tint: spec.tint * 0.92, detail: 0, role: 'mass',
  });
  const houseLip = buriedGlow(y0 + barH + houseH - 1.25, 1.25);
  addBox(d, {
    s: houseS - houseD / 2 - 0.14, t: houseT, lb: houseW * 0.86, la: 0.32, h: houseLip.h,
    base: houseLip.base,
    style: Style.Glow, lit: 0.64, tint: 1.08, detail: 0, role: 'band',
  });
  const roof = y0 + barH + houseH;
  const postH = Math.min(2.4, Math.max(1.6, tankH - 0.2));
  const insetT = houseW / 2 - 0.5;
  const insetS = houseD / 2 - 0.5;
  for (const [as, bt] of [[1, 1], [1, -1], [-1, 1], [-1, -1]] as const) {
    addBox(d, {
      s: houseS + as * insetS, t: houseT + bt * insetT, lb: 0.65, la: 0.65, h: postH, base: roof,
      style: Style.Solid, lit: 0.05, tint: spec.tint * 0.55, detail: 0, role: 'mass',
    });
  }
  addBox(d, {
    s: houseS, t: houseT, lb: houseW * 0.9, la: 0.4, h: 0.8, base: roof + postH - 0.8,
    style: Style.Solid, lit: 0.05, tint: spec.tint * 0.58, detail: 0, role: 'mass',
  });
  addBox(d, {
    s: houseS, t: houseT + houseW * 0.18,
    lb: Math.min(3.6, houseW * 0.34), la: Math.min(3.4, houseD * 0.4), h: tankH,
    base: roof,
    style: Style.Solid, lit: 0.05, tint: spec.tint * 0.58, detail: 0, role: 'mass',
  });
  addBox(d, {
    s: houseS + houseD * 0.1, t: houseT - houseW * 0.16, lb: 1.6, la: 1.3, h: 1.2,
    base: roof,
    style: Style.Industrial, lit: 0.03, tint: spec.tint * 0.48,
    detail: 2, ornament: 2, role: 'mass',
  });
  sidewalkPiers(d, face, spec.w / 2, RES_STOREY, y0);
}

/**
 * South Bay cracking yard. A broad plinth and three fat drums inside the 50–60 m band.
 * The flare is a short lip on the tallest drum, not a downtown shaft.
 */
function flareBed(d: Draft, spec: TowerSpec, H: number, y0: number, door: boolean, variant: number): void {
  // Just over the door, so the drums rise inside a level sidewalk frame.
  const plinthH = STOREY + 1.4;
  skin(d, {
    s: 0, t: 0, lb: spec.w * 0.98, la: spec.d * 0.92, h: plinthH, base: y0,
    style: Style.Solid, lit: 0.05, tint: 0.62, door,
  });
  const drums = variant === 1
    ? [
      { t: -0.32, w: 0.24, dep: 0.46, k: 0.78, s: -0.02 },
      { t: 0.02, w: 0.28, dep: 0.52, k: 0.48, s: -0.14 },
      { t: 0.32, w: 0.22, dep: 0.4, k: 1, s: -0.1 },
    ]
    : variant === 2
      ? [
        { t: -0.22, w: 0.32, dep: 0.56, k: 0.7, s: -0.12 },
        { t: 0.2, w: 0.3, dep: 0.5, k: 1, s: -0.14 },
      ]
      : [
        { t: -0.34, w: 0.24, dep: 0.48, k: 0.55, s: -0.02 },
        { t: 0, w: 0.3, dep: 0.58, k: 1, s: -0.16 },
        { t: 0.34, w: 0.22, dep: 0.4, k: 0.42, s: 0.02 },
      ];
  let tallest: { t: number; w: number; depth: number; top: number; s: number } | null = null;
  for (const drum of drums) {
    const w = spec.w * drum.w;
    const depth = spec.d * drum.dep;
    const t = spec.w * drum.t;
    const s = spec.d * drum.s;
    const h = (H - plinthH) * drum.k;
    const top = y0 + plinthH + h;
    // One dark mass. A lit industrial face paints a window grid, and that grid reads as stacked cubes.
    addBox(d, {
      s, t, lb: w, la: depth, h, base: y0 + plinthH,
      style: Style.Solid, lit: 0.06, tint: 0.88,
      detail: 0, role: 'mass',
    });
    if (!tallest || top > tallest.top) tallest = { t, w, depth, top, s };
  }
  if (tallest) {
    const lip = buriedGlow(tallest.top - 1.35, 0.7);
    addBox(d, {
      s: tallest.s - tallest.depth / 2 - 0.12, t: tallest.t,
      lb: Math.min(tallest.w * 0.28, 1.8), la: 0.28, h: lip.h, base: lip.base,
      style: Style.Glow, lit: 0.7, tint: 1.18, detail: 0, role: 'band',
    });
    addBox(d, {
      s: tallest.s, t: tallest.t,
      lb: Math.min(tallest.w * 0.36, 3.6), la: Math.min(tallest.depth * 0.32, 3.2),
      h: 1.8, base: tallest.top,
      style: Style.Solid, lit: 0.04, tint: 0.7, detail: 0, role: 'mass',
    });
  }
  addBox(d, {
    s: spec.d * 0.2, t: -spec.w * 0.28, lb: 1.8, la: 1.4, h: 1.5, base: y0 + plinthH,
    style: Style.Industrial, lit: 0.03, tint: spec.tint * 0.48,
    detail: 2, ornament: 2, role: 'mass',
  });
}

interface RoofCrown {
  s: number;
  t: number;
  lb: number;
  la: number;
  h: number;
  style: StyleId;
}

/** A detail-0 roof mass. The shape is the family. The far mesh keeps it. */
function crownFor(kind: TowerSpec['kind'], w: number, depth: number): RoofCrown {
  switch (kind) {
    case 'band-slab':
      return { s: 0, t: 0, lb: w * 0.7, la: depth * 0.26, h: 6.4, style: Style.Solid };
    case 'ziggurat':
      return { s: depth * 0.04, t: w * 0.1, lb: w * 0.2, la: depth * 0.2, h: 6.4, style: Style.Megablock };
    case 'monolith':
      return { s: 0, t: 0, lb: w * 0.14, la: depth * 0.14, h: 4.2, style: Style.Solid };
    case 'res-stack':
      return { s: -depth * 0.08, t: w * 0.24, lb: w * 0.26, la: depth * 0.34, h: 10.2, style: Style.Panel };
    case 'holo-shaft':
      return { s: 0, t: 0, lb: w * 0.22, la: depth * 0.18, h: 5.4, style: Style.Solid };
    case 'cantilever':
      return { s: depth * 0.04, t: -w * 0.1, lb: w * 0.4, la: depth * 0.32, h: 6.4, style: Style.Solid };
    case 'hero-gate':
      return { s: 0, t: w * 0.28, lb: w * 0.16, la: depth * 0.26, h: 8.2, style: Style.Solid };
    case 'hero-step':
      return { s: 0, t: 0, lb: w * 0.12, la: depth * 0.12, h: 5.4, style: Style.Megablock };
    default:
      return { s: 0, t: 0, lb: Math.min(8, w * 0.18), la: Math.min(6, depth * 0.16), h: 3.6, style: Style.Solid };
  }
}

function roofY(d: Draft): number {
  let y = 0;
  for (const b of d.boxes) {
    if (b.detail !== 0) continue;
    if (b.ornament !== undefined && b.ornament > 0) continue;
    const top = b.base + b.h;
    if (top > y) y = top;
  }
  return y;
}

function dressRoof(d: Draft, spec: TowerSpec, r: Rng): void {
  if (
    spec.kind === 'hero-obelisk' || spec.kind === 'lantern' || spec.kind === 'buttress'
    || spec.kind === 'screen-wall' || spec.kind === 'flue-bank'
    || spec.kind === 'shelf-row' || spec.kind === 'flare-bed'
  ) return;
  const y = roofY(d);
  const crown = crownFor(spec.kind, spec.w, spec.d);
  addBox(d, {
    s: crown.s, t: crown.t, lb: crown.lb, la: crown.la, h: crown.h, base: y,
    style: crown.style, lit: 0.07, tint: spec.tint * 0.66, detail: 0, role: 'mass',
  });
  addBox(d, {
    s: crown.s, t: crown.t, lb: Math.max(0.9, crown.lb * 0.55), la: 0.22, h: 0.8,
    base: y + crown.h,
    style: Style.Solid, lit: 0.04, tint: spec.tint * 0.55,
    detail: 1, ornament: 1, role: 'band',
  });
  for (let k = 0; k < 2; k++) {
    const lb = r.range(1.4, Math.min(3.2, Math.max(1.5, crown.lb * 0.35)));
    const la = r.range(1.2, Math.min(2.8, Math.max(1.3, crown.la * 0.4)));
    const rawS = crown.s + (k === 0 ? -1 : 1) * crown.la * 0.16;
    const rawT = crown.t + (k === 0 ? 1 : -1) * crown.lb * 0.14;
    const maxS = d.halfD + 1.6 - la / 2;
    const maxT = d.halfW + 1.6 - lb / 2;
    addBox(d, {
      s: Math.max(-maxS, Math.min(maxS, rawS)),
      t: Math.max(-maxT, Math.min(maxT, rawT)),
      lb, la, h: r.range(1.2, 2.2), base: y + crown.h,
      style: Style.Industrial, lit: 0.03, tint: spec.tint * 0.5,
      detail: 2, ornament: 2, role: 'mass',
    });
  }
}

function dressSigns(d: Draft, spec: TowerSpec): void {
  if (!spec.phrases.length) return;
  d.signs.push({
    s: 0, t: 0, hb: spec.w / 2, ha: spec.d / 2, face: 'a-', along: 0,
    y: 5.2, w: 4.2, h: 1.15, color: AD_COLORS[0]!, kind: 0,
  });
  d.signs.push({
    s: 0, t: 0, hb: spec.w / 2, ha: spec.d / 2, face: 'b+', along: spec.w * 0.15,
    y: 8, w: 1.15, h: 5.6, color: AD_COLORS[1]!, kind: 1,
  });
  if (spec.kind === 'holo-shaft') {
    d.signs.push({
      s: 0, t: 0, hb: spec.w / 2, ha: spec.d / 2, face: 'a-', along: spec.w * 0.16,
      y: Math.max(40, d.height * 0.4), w: 16, h: 22, color: AD_COLORS[2]!, kind: 2,
    });
  } else if (spec.holo) {
    d.signs.push({
      s: 0, t: 0, hb: spec.w / 2, ha: spec.d / 2, face: 'a+', along: 0,
      y: Math.max(28, d.height * 0.42), w: 18, h: 9, color: AD_COLORS[2]!, kind: 2,
    });
  }
}
