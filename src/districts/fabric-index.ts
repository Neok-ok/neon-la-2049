// Worker-safe registry entry point. Import every district's *fabric* module here (pure code only:
// no DOM, no three.js) so both the chunk worker and the main-thread CityQuery see the same archetypes.
import './_shared/archetypes';
import './little-tokyo-market/archetype';
import './financial-megatowers/archetype';
import './dtla/archetype';
import './civic-center/archetype';
import './historic-core/archetype';
import './k-megablock/archetype';
import './lakewood-megablocks/archetype';
import './south-la-megablocks/archetype';
import './wallace-vernon/archetype';
import './coastal-strip/archetype';
import './arts-district/archetype';
