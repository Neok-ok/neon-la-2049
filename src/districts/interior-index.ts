// Main-thread interior registry. District stages import a module that calls registerInterior.
import { installBradburyInteriors } from './historic-core/interior';

export function installInteriors(): void {
  installBradburyInteriors();
}
