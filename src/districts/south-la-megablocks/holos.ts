// Four small street-band ads: two over the Exposition yard, two on market spines.
import { SignColor } from '../../world/fabric/types';
import type { CityLayout } from '../../world/layout';
import { registerHologram } from '../../world/holograms/api';
import { findHub, searchResidential, worldAt } from './locate';
import { HUB } from './spec';

export function installSouthLaHolos(layout: CityLayout): void {
  const hub = findHub(layout);
  if (hub) {
    const g = hub.block.ground;
    const a = worldAt(hub.block, 8, -7, 0);
    const b = worldAt(hub.block, 8, 7, 0);
    registerHologram({
      id: 'southla-hub-ad-a',
      x: a.x, y: g + 6.2, z: a.z,
      yaw: 0,
      w: 6, h: 3.2,
      design: 'glyph-loop',
      color: SignColor.Amber,
      seed: 0.17,
      rank: 2,
      band: 'street',
      spill: 8,
    });
    registerHologram({
      id: 'southla-hub-ad-b',
      x: b.x, y: g + 6.4, z: b.z,
      yaw: Math.PI,
      w: 5.4, h: 3,
      design: 'lantern-loop',
      color: SignColor.White,
      seed: 0.44,
      rank: 2,
      band: 'street',
      spill: 7,
    });
  }
  const spines = searchResidential(layout, HUB.x, HUB.z, 2200)
    .filter((f) => f.plan.spine && !f.plan.hub && f.plan.stalls.length >= 3);
  const picks = [spines[0], spines[Math.min(spines.length - 1, 6)]].filter((f, i, arr) => f && arr.indexOf(f) === i);
  const designs = ['lease-loop', 'glyph-loop'] as const;
  picks.forEach((f, n) => {
    if (!f) return;
    const stall = f.plan.stalls[0]!;
    const p = worldAt(f.block, stall.s, stall.t, 0);
    registerHologram({
      id: `southla-spine-ad-${n}`,
      x: p.x, y: f.block.ground + 6.3, z: p.z,
      yaw: n === 0 ? Math.PI / 2 : -Math.PI / 2,
      w: 5.2, h: 2.8,
      design: designs[n] ?? 'glyph-loop',
      color: n === 0 ? SignColor.Amber : SignColor.White,
      seed: 0.3 + n * 0.2,
      rank: 2,
      band: 'street',
      spill: 6,
    });
  });
}
