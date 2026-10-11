// A chunk that overlaps a far district must wait until that district's module has
// replaced the shared blockout. Otherwise the mesh is baked from the fallback and kept.
import { FAR_ARCHETYPES } from '../../districts/farIds';
import { farFabricReady, farFabricSettled } from '../../districts/fabric-index';
import { getLayout } from '../layout';
import { hasArchetype } from './registry';

export { farFabricReady };

const layout = getLayout();

/** True when `generateFabric` would see the detailed archetype for every sample in the square. */
export function areaArchetypesReady(x0: number, z0: number, size: number): boolean {
  if (farFabricSettled()) return true;
  const step = size > 800 ? 400 : 160;
  for (let x = x0 + step * 0.5; x < x0 + size; x += step) {
    for (let z = z0 + step * 0.5; z < z0 + size; z += step) {
      if (!layout.inBounds(x, z)) continue;
      const id = layout.districtAt(x, z).archetype;
      if (FAR_ARCHETYPES.has(id)) return false;
      if (!hasArchetype(id)) return false;
    }
  }
  return true;
}
