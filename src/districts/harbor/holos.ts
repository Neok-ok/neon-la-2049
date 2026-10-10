// One glyph board and one courier figure. Existing designs, registerHologram only.
// The glyphs are noise. The crane is the Ash Line mark already in the field, not a carrier logo.
import { SignColor } from '../../world/fabric/types';
import type { CityLayout } from '../../world/layout';
import { registerHologram } from '../../world/holograms/api';
import { harborSites } from './sites';

export function installHarborHolos(layout: CityLayout): void {
  const door = harborSites(layout).control;
  if (!door) return;
  const c = Math.cos(door.yaw);
  const s = Math.sin(door.yaw);
  const y = door.y;
  // Just outside the door, local +Z.
  const x = door.x + s * 1.2;
  const z = door.z + c * 1.2;
  registerHologram({
    id: 'harbor-glyph',
    x: x - c * 6.5, y: y + 8.2, z: z + s * 6.5,
    yaw: door.yaw,
    w: 12, h: 16,
    design: 'glyph-loop',
    color: SignColor.Amber,
    seed: 0.27,
    rank: 0,
    band: 'street',
    spill: 16,
  });
  registerHologram({
    id: 'harbor-courier',
    x: x + c * 7.5, y: y + 11, z: z - s * 7.5,
    yaw: door.yaw,
    w: 14, h: 20,
    design: 'ash-crane',
    color: SignColor.Cyan,
    seed: 0.63,
    rank: 1,
    band: 'tower',
    spill: 18,
  });
}
