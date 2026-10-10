// One hazard board and one share ad. Existing designs, registerHologram only.
// The glyphs are noise. The wedge is not a carrier. No refinery name.
import { SignColor } from '../../world/fabric/types';
import type { CityLayout } from '../../world/layout';
import { registerHologram } from '../../world/holograms/api';
import { controlBlock, doorWorld } from './spec';

export function installSouthBayHolos(layout: CityLayout): void {
  const block = controlBlock(layout);
  if (!block) return;
  const door = doorWorld(block);
  const y = door.y;
  const z = door.z + 0.8;
  registerHologram({
    id: 'south-bay-hazard',
    x: door.x - 7.5, y: y + 7.4, z,
    yaw: 0,
    w: 12, h: 16,
    design: 'glyph-loop',
    color: SignColor.Amber,
    seed: 0.31,
    rank: 0,
    band: 'street',
    spill: 14,
  });
  registerHologram({
    id: 'south-bay-share',
    x: door.x + 9.5, y: y + 8.6, z,
    yaw: 0,
    w: 16, h: 10,
    design: 'lease-loop',
    color: SignColor.Cyan,
    seed: 0.74,
    rank: 1,
    band: 'street',
    spill: 12,
  });
}
