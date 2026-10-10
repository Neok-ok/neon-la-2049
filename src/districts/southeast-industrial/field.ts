// One flame mesh for the whole belt. Built once, not per chunk.
import type { Object3D } from 'three/webgpu';
import type { CityLayout } from '../../world/layout';
import { mountRefineryFlames } from '../_shared/refinery/flames';
import type { RefineryFlame } from '../_shared/refinery/plan';
import { planSoutheast } from './plan';
import { LATTICE, southeastBlock } from './spec';

export function mountSoutheastFlares(parent: Object3D, layout: CityLayout): void {
  const flames: RefineryFlame[] = [];
  for (let i = LATTICE.i0; i <= LATTICE.i1; i++) {
    for (let j = LATTICE.j0; j <= LATTICE.j1; j++) {
      const block = southeastBlock(layout, i, j);
      if (!block) continue;
      if (layout.districtAt(block.cx, block.cz).id !== 'southeast-industrial') continue;
      if (block.ground > 45 || layout.isOcean(block.cx, block.cz)) continue;
      for (const f of planSoutheast(block, layout).flames) flames.push(f);
    }
  }
  mountRefineryFlames(parent, flames, 'southeast-flares');
}
