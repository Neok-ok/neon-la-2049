// A few authored projectors for the downtown canyons. Large kind-2 billboards on the megablocks
// are promoted by the field on their own (area ≥ 140 m²). Do not reuse the flyover ids dtla-hero-0/1.
import { bearingToYaw } from '../../world/geo';
import { SignColor } from '../../world/fabric/types';
import type { CityLayout } from '../../world/layout';
import { registerHologram } from '../../world/holograms/api';
import { HERO_SPECS } from '../financial-megatowers/specs';
import { blockCenter, gridAxes } from '../_shared/megablock/grid';

const STREET = 34;
const LB = 125 - STREET;

export function installDtlaHolos(layout: CityLayout): void {
  const { ax, az, bx, bz } = gridAxes();
  const c = blockCenter(0, -10);
  const off = -(LB / 2 + STREET / 2);
  // On the near curb, a short way down the avenue, facing back at the street camera.
  const sx = c.x + bx * (off + 10) + ax * 26;
  const sz = c.z + bz * (off + 10) + az * 26;
  const ground = layout.heightAt(sx, sz);
  const yawBack = Math.atan2(-ax, -az);
  registerHologram({
    id: 'dtla-canyon-ribbon',
    x: sx, y: ground + 22, z: sz, yaw: yawBack,
    w: 14, h: 28, design: 'ribbon-column', color: SignColor.Violet,
    seed: 0.31, rank: 0, band: 'street', spill: 18,
  });
  registerHologram({
    id: 'dtla-canyon-lantern',
    x: sx + ax * 14, y: ground + 7, z: sz + az * 14, yaw: yawBack,
    w: 6, h: 10, design: 'lantern-loop', color: SignColor.Pink,
    seed: 0.62, rank: 1, band: 'street', spill: 12,
  });

  const mt1 = layout.landmarkById('megatower-1');
  const spec = HERO_SPECS['megatower-1'];
  if (mt1 && spec) {
    const yaw = bearingToYaw(mt1.bearingDeg) + ((spec.turn ?? 0) * Math.PI) / 2;
    const nx = Math.sin(yaw), nz = Math.cos(yaw);
    const out = spec.podium.d / 2 + 12;
    const x = mt1.x + nx * out + Math.cos(yaw) * 16;
    const z = mt1.z + nz * out - Math.sin(yaw) * 16;
    registerHologram({
      id: 'dtla-mt1-lease',
      x, y: layout.heightAt(x, z) + 14, z, yaw,
      w: 11, h: 18, design: 'lease-loop', color: SignColor.Amber,
      seed: 0.18, rank: 0, band: 'street', spill: 22,
    });
  }

  const mt5 = layout.landmarkById('megatower-5');
  if (mt5) {
    let x = mt5.x, z = mt5.z - 240;
    for (let k = 0; k < 24; k++) {
      const a = (k / 24) * Math.PI * 2;
      const px = mt5.x + Math.cos(a) * 230;
      const pz = mt5.z + Math.sin(a) * 230;
      if (layout.districtAt(px, pz).id === 'dtla' && !layout.isReserved(px, pz, 6)) {
        x = px; z = pz; break;
      }
    }
    const yaw = Math.atan2(mt5.x - x, mt5.z - z);
    registerHologram({
      id: 'dtla-mt5-glyph',
      x, y: layout.heightAt(x, z) + 52, z, yaw,
      w: 18, h: 30, design: 'glyph-loop', color: SignColor.Cyan,
      seed: 0.44, rank: 1, band: 'tower', spill: 16,
    });
  }
}
