// Worker-safe registry entry point. Near archetypes (the opening downtown view, plus the
// basin fallback) are static. Far district modules load in parallel and must win the race
// against chunk jobs — see archetypeGate.ts. Import order: shared blockouts first, then
// the district modules that replace them.
import './_shared/archetypes';
import './little-tokyo-market/archetype';
import './financial-megatowers/archetype';
import './dtla/archetype';
import './civic-center/archetype';
import './historic-core/archetype';
import './k-megablock/archetype';
import './wallace-vernon/archetype';
import './arts-district/archetype';
import './basin-sprawl/archetype';

let settled = false;

/** True once every far archetype module has been evaluated (or the import failed open). */
export function farFabricSettled(): boolean {
  return settled;
}

export const farFabricReady: Promise<void> = Promise.all([
  import('./lakewood-megablocks/archetype'),
  import('./south-la-megablocks/archetype'),
  import('./westside/archetype'),
  import('./southeast-industrial/archetype'),
  import('./hollywood/archetype'),
  import('./lax-spaceport/archetype'),
  import('./south-bay-refineries/archetype'),
  import('./harbor/archetype'),
  import('./long-beach/archetype'),
  import('./east-la/archetype'),
  import('./coastal-strip/archetype'),
]).then(
  () => {
    settled = true;
  },
  (err) => {
    console.error('far fabric failed to load', err);
    settled = true;
  },
);
