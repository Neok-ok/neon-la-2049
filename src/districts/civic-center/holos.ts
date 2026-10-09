// One civic notice on the LAPD shaft, facing the steps. Glyph blocks, not a badge and not an ad dancer.
import { SignColor } from '../../world/fabric/types';
import type { CityLayout } from '../../world/layout';
import { registerHologram } from '../../world/holograms/api';
import { HQ, localToWorld, yawOf } from './spec';

export function installCivicHolos(layout: CityLayout): void {
  const lapd = layout.landmarkById('lapd-hq');
  if (!lapd) return;
  const yaw = yawOf(lapd.bearingDeg);
  const [x, z] = localToWorld(lapd.x, lapd.z, yaw, 0, -HQ.shaftD / 2 - 1.2);
  registerHologram({
    id: 'lapd-shaft-notice',
    x, y: layout.heightAt(lapd.x, lapd.z) + 42, z,
    yaw: yaw + Math.PI,
    w: 10, h: 16,
    design: 'glyph-loop',
    color: SignColor.White,
    seed: 0.27,
    rank: 0,
    band: 'street',
    spill: 10,
  });
}
