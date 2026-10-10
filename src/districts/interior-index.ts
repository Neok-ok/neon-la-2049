// Main-thread interior registry. District stages import a module that calls registerInterior.
import { installBradburyInteriors } from './historic-core/interior';
import { installKInteriors } from './k-megablock/interior';
import { installWallaceInterior } from './wallace-vernon/interior';
import { installLakewoodInterior } from './lakewood-megablocks/interior';
import { installSouthLaInterior } from './south-la-megablocks/interior';
import { installArtsInterior } from './arts-district/interior';
import { installWestsideInterior } from './westside/interior';
import { installSoutheastInterior } from './southeast-industrial/interior';
import { installHollywoodInterior } from './hollywood/interior';
import { installLaxInterior } from './lax-spaceport/interior';
import { installSouthBayInterior } from './south-bay-refineries/interior';
import { installHarborInterior } from './harbor/interior';
import { installLongBeachInterior } from './long-beach/interior';

export function installInteriors(): void {
  installBradburyInteriors();
  installKInteriors();
  installWallaceInterior();
  installLakewoodInterior();
  installSouthLaInterior();
  installArtsInterior();
  installWestsideInterior();
  installSoutheastInterior();
  installHollywoodInterior();
  installLaxInterior();
  installSouthBayInterior();
  installHarborInterior();
  installLongBeachInterior();
}
