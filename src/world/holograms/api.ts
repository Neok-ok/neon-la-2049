// Public surface for district stages. Read README.md before adding a placement.
export { registerHologram, unregisterHologram, hologramById, allHolograms } from './registry';
export { HOLO_DESIGNS, holoIndex } from './types';
export type { HologramSpec, HoloDesignId, HoloBand, HoloRank } from './types';
export { HologramField } from './field';
export { installShowcase } from './showcase';
