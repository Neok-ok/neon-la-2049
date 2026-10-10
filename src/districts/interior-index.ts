// Main-thread interior registry. District stages import a module that calls registerInterior.
import { installBradburyInteriors } from './historic-core/interior';
import { installKInteriors } from './k-megablock/interior';
import { installWallaceInterior } from './wallace-vernon/interior';
import { installLakewoodInterior } from './lakewood-megablocks/interior';
import { installSouthLaInterior } from './south-la-megablocks/interior';
import { installArtsInterior } from './arts-district/interior';
import { installWestsideInterior } from './westside/interior';

export function installInteriors(): void {
  installBradburyInteriors();
  installKInteriors();
  installWallaceInterior();
  installLakewoodInterior();
  installSouthLaInterior();
  installArtsInterior();
  installWestsideInterior();
}
