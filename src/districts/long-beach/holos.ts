// One glyph board and one share ad. Existing designs, registerHologram only.
// The glyphs are noise. The wedge is the existing lease loop, not a carrier mark.
import { SignColor } from '../../world/fabric/types';
import type { CityLayout } from '../../world/layout';
import { registerHologram } from '../../world/holograms/api';
import { concourseDoor } from './spec';

export function installLongBeachHolos(layout: CityLayout): void {
  const door = concourseDoor(layout);
  const c = Math.cos(door.yaw);
  const s = Math.sin(door.yaw);
  const y = door.y;
  const x = door.x + s * 0.8;
  const z = door.z + c * 0.8;
  registerHologram({
    id: 'long-beach-glyph',
    x: x - c * 7.5, y: y + 9.5, z: z + s * 7.5,
    yaw: door.yaw,
    w: 12, h: 16,
    design: 'glyph-loop',
    color: SignColor.Amber,
    seed: 0.41,
    rank: 0,
    band: 'street',
    spill: 14,
  });
  registerHologram({
    id: 'long-beach-lease',
    x: x + c * 8.5, y: y + 24, z: z - s * 8.5,
    yaw: door.yaw,
    w: 16, h: 12,
    design: 'lease-loop',
    color: SignColor.Cyan,
    seed: 0.73,
    rank: 1,
    band: 'tower',
    spill: 16,
  });
}
