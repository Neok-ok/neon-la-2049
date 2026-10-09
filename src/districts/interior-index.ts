// Main-thread interior registry. District stages import a module that calls registerInterior.
import { installBradburyInteriors } from './historic-core/interior';
import { installKInteriors } from './k-megablock/interior';

export function installInteriors(): void {
  installBradburyInteriors();
  installKInteriors();
}
