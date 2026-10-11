// Main-thread interior registry. Near rooms register during the entry chunk.
// Far rooms register when their modules finish; InteriorSystem.adoptNew mounts whatever arrived late.
import { installBradburyInteriors } from './historic-core/interior';
import { installKInteriors } from './k-megablock/interior';
import { installWallaceInterior } from './wallace-vernon/interior';
import { installArtsInterior } from './arts-district/interior';

export function installInteriors(): void {
  installBradburyInteriors();
  installKInteriors();
  installWallaceInterior();
  installArtsInterior();
}

export const farInteriorsReady: Promise<void> = Promise.all([
  import('./lakewood-megablocks/interior').then((m) => m.installLakewoodInterior()),
  import('./south-la-megablocks/interior').then((m) => m.installSouthLaInterior()),
  import('./westside/interior').then((m) => m.installWestsideInterior()),
  import('./southeast-industrial/interior').then((m) => m.installSoutheastInterior()),
  import('./hollywood/interior').then((m) => m.installHollywoodInterior()),
  import('./lax-spaceport/interior').then((m) => m.installLaxInterior()),
  import('./south-bay-refineries/interior').then((m) => m.installSouthBayInterior()),
  import('./harbor/interior').then((m) => m.installHarborInterior()),
  import('./long-beach/interior').then((m) => m.installLongBeachInterior()),
  import('./east-la/interior').then((m) => m.installEastLaInterior()),
]).then(
  () => undefined,
  (err) => {
    console.error('far interiors failed to load', err);
  },
);
