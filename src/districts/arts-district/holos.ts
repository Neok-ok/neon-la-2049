// Two faded ads on the Little Tokyo edge. Existing designs only.
import { SignColor } from '../../world/fabric/types';
import type { CityLayout } from '../../world/layout';
import { registerHologram } from '../../world/holograms/api';
import { artsBlock } from './spec';

export function installArtsHolos(layout: CityLayout): void {
  // Block just south of the market, and the block just east of it.
  const spots = [
    { i: -5, j: 5, yaw: Math.PI, s: 36, t: 0, id: 'arts-lt-glyph', design: 'glyph-loop' as const, color: SignColor.Amber, seed: 0.21 },
    { i: -4, j: 7, yaw: -Math.PI / 2, s: 0, t: -46, id: 'arts-lt-lease', design: 'lease-loop' as const, color: SignColor.Yellow, seed: 0.58 },
  ];
  for (const spot of spots) {
    const b = artsBlock(layout, spot.i, spot.j);
    if (layout.districtAt(b.cx, b.cz).id !== 'arts-district') continue;
    const x = b.cx + b.ax * spot.s + b.bx * spot.t;
    const z = b.cz + b.az * spot.s + b.bz * spot.t;
    if (layout.districtAt(x, z).id !== 'arts-district') continue;
    registerHologram({
      id: spot.id,
      x, y: b.ground + 7.4, z,
      yaw: spot.yaw,
      w: 5.6,
      h: 3.1,
      design: spot.design,
      color: spot.color,
      seed: spot.seed,
      rank: 2,
      band: 'street',
      spill: 6,
    });
  }
}
