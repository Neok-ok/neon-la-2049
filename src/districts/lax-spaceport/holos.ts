// Two off-world ads on the terminal face. Existing designs, registerHologram only.
// The glyphs are noise. The wedge is the lease loop. Neither is a carrier mark.
import { SignColor } from '../../world/fabric/types';
import type { CityLayout } from '../../world/layout';
import { registerHologram } from '../../world/holograms/api';
import { doorSite } from './spec';

export function installLaxHolos(layout: CityLayout): void {
  const door = doorSite();
  const y = layout.heightAt(door.x, door.z);
  const z = door.z - 1.6;
  registerHologram({
    id: 'lax-glyph',
    x: door.x - 46, y: y + 36, z,
    yaw: Math.PI,
    w: 18, h: 44,
    design: 'glyph-loop',
    color: SignColor.White,
    seed: 0.23,
    rank: 0,
    band: 'tower',
    spill: 22,
  });
  registerHologram({
    id: 'lax-lease',
    x: door.x + 52, y: y + 56, z,
    yaw: Math.PI,
    w: 36, h: 12,
    design: 'lease-loop',
    color: SignColor.Cyan,
    seed: 0.61,
    rank: 1,
    band: 'tower',
    spill: 16,
  });
}
