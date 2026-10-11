// One glyph board on the terminal face. DEPART / CALDERA and the colony line are kind-0 signs.
// The glyphs are noise. Neither is a carrier mark.
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
}
