// Two small street-band ads over the Lakewood Center yard. Existing designs only.
import { SignColor } from '../../world/fabric/types';
import type { CityLayout } from '../../world/layout';
import { registerHologram } from '../../world/holograms/api';
import { findHub, worldAt } from './locate';

export function installLakewoodHolos(layout: CityLayout): void {
  const hub = findHub(layout);
  if (!hub) return;
  const g = hub.block.ground;
  const a = worldAt(hub.block, 8, -7, 0);
  const b = worldAt(hub.block, 8, 7, 0);
  registerHologram({
    id: 'lakewood-hub-ad-a',
    x: a.x, y: g + 6.2, z: a.z,
    yaw: 0,
    w: 6, h: 3.2,
    design: 'glyph-loop',
    color: SignColor.Amber,
    seed: 0.21,
    rank: 2,
    band: 'street',
    spill: 8,
  });
  registerHologram({
    id: 'lakewood-hub-ad-b',
    x: b.x, y: g + 6.4, z: b.z,
    yaw: Math.PI,
    w: 6, h: 3.2,
    design: 'lease-loop',
    color: SignColor.White,
    seed: 0.64,
    rank: 2,
    band: 'street',
    spill: 8,
  });
}
