// One flame mesh for the whole coast. Built once, not per chunk, so a stack
// still reads after the block has dropped to far LOD. Shared material with the belt.
import type { Object3D } from 'three/webgpu';
import type { CityLayout } from '../../world/layout';
import { mountRefineryFlames } from '../_shared/refinery/flames';
import type { RefineryFlame } from '../_shared/refinery/plan';
import { planSouthBay } from './plan';
import { LATTICE, southBayBlock } from './spec';

export function mountSouthBayFlares(parent: Object3D, layout: CityLayout): void {
  const flames: RefineryFlame[] = [];
  for (let i = LATTICE.i0; i <= LATTICE.i1; i++) {
    for (let j = LATTICE.j0; j <= LATTICE.j1; j++) {
      const block = southBayBlock(layout, i, j);
      if (!block) continue;
      if (layout.districtAt(block.cx, block.cz).id !== 'south-bay-refineries') continue;
      if (block.ground > 45 || layout.isOcean(block.cx, block.cz)) continue;
      for (const f of planSouthBay(block, layout).flames) flames.push(f);
    }
  }
  mountRefineryFlames(parent, flames, 'south-bay-flares');
}

/**
 * Low industrial hum on the existing machinery bed.
 * Inside the polygon it falls off with height. Outside it falls off with
 * distance from the flare-field pin, so LAX hears a tail and downtown does not.
 */
export function southBayHum(x: number, y: number, z: number, layout: CityLayout): number {
  const alt = Math.max(0, y - layout.heightAt(x, z));
  if (layout.districtAt(x, z).id === 'south-bay-refineries') {
    return Math.max(0, 1 - alt / 120) * 0.44;
  }
  const lm = layout.landmarkById('el-segundo-refinery');
  if (!lm) return 0;
  const horiz = Math.hypot(x - lm.x, z - lm.z);
  return 0.3 * Math.exp(-horiz / 3800) * Math.max(0, 1 - alt / 160);
}
