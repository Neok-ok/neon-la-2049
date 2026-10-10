// One market figure and one glyph board, south of the counter door. Existing designs only.
// The rings are the market mark. The glyphs are noise. No tenant name.
import { SignColor } from '../../world/fabric/types';
import type { CityLayout } from '../../world/layout';
import { registerHologram } from '../../world/holograms/api';
import { counterOrigin } from './locate';

export function installEastLaHolos(layout: CityLayout): void {
  const door = counterOrigin(layout);
  if (!door) return;
  const c = Math.cos(door.yaw);
  const s = Math.sin(door.yaw);
  const y = door.y;
  // Both boards sit south of the door, in the yard. Local +Z is outward.
  registerHologram({
    id: 'east-la-coil',
    x: door.x + c * 6.4 + s * 7.2, y: y + 7.2, z: door.z - s * 6.4 + c * 7.2,
    yaw: door.yaw,
    w: 8, h: 12,
    design: 'coil-vendor',
    color: SignColor.Amber,
    seed: 0.37,
    rank: 0,
    band: 'street',
    spill: 12,
  });
  registerHologram({
    id: 'east-la-glyph',
    x: door.x - c * 6.4 + s * 7.2, y: y + 6.4, z: door.z + s * 6.4 + c * 7.2,
    yaw: door.yaw,
    w: 9, h: 11,
    design: 'glyph-loop',
    color: SignColor.Amber,
    seed: 0.62,
    rank: 1,
    band: 'street',
    spill: 10,
  });
}
