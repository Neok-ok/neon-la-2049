// Giant figures and ad loops on the boulevard. Existing designs, registerHologram only.
// Kind-2 panels under 140 m² stay signs. These quads are all well above that.
import { SignColor } from '../../world/fabric/types';
import type { CityLayout } from '../../world/layout';
import { registerHologram } from '../../world/holograms/api';
import type { HoloBand, HoloDesignId } from '../../world/holograms/types';
import { holoAnchor, HOLO_J } from './spec';

interface Placement {
  id: string;
  j: number;
  design: HoloDesignId;
  color: number;
  w: number;
  h: number;
  seed: number;
  rank: 0 | 1 | 2;
  band: HoloBand;
  spill: number;
}

const PLACED: Placement[] = [
  { id: 'hollywood-lantern', j: HOLO_J[0], design: 'lantern-loop', color: SignColor.Red, w: 16, h: 44, seed: 0.08, rank: 0, band: 'tower', spill: 26 },
  { id: 'hollywood-dancer', j: HOLO_J[1], design: 'veil-dancer', color: SignColor.Pink, w: 24, h: 68, seed: 0.17, rank: 0, band: 'skyline', spill: 48 },
  { id: 'hollywood-crane', j: HOLO_J[2], design: 'ash-crane', color: SignColor.Cyan, w: 22, h: 56, seed: 0.41, rank: 0, band: 'skyline', spill: 40 },
  { id: 'hollywood-ribbon', j: HOLO_J[3], design: 'ribbon-column', color: SignColor.Violet, w: 18, h: 50, seed: 0.63, rank: 0, band: 'tower', spill: 32 },
  { id: 'hollywood-glyph', j: HOLO_J[4], design: 'glyph-loop', color: SignColor.Yellow, w: 36, h: 16, seed: 0.22, rank: 0, band: 'tower', spill: 24 },
  { id: 'hollywood-lease', j: HOLO_J[5], design: 'lease-loop', color: SignColor.Amber, w: 32, h: 14, seed: 0.55, rank: 1, band: 'tower', spill: 20 },
];

export function installHollywoodHolos(layout: CityLayout): void {
  for (const p of PLACED) {
    const a = holoAnchor(p.j);
    const y = layout.heightAt(a.x, a.z) + p.h / 2;
    registerHologram({
      id: p.id,
      x: a.x, y, z: a.z,
      yaw: 0,
      w: p.w, h: p.h,
      design: p.design,
      color: p.color,
      seed: p.seed,
      rank: p.rank,
      band: p.band,
      spill: p.spill,
    });
  }
}
