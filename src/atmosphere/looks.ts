// Street fog and wet-neon weights. Districts register here. App.ts only samples.
import { registerDistrictLook } from './districtLook';

// Magenta and cyan stay on the three streets that sell them. Everywhere else is
// sodium or black, and the weight is low enough that asphalt stays black.
registerDistrictLook('little-tokyo-market', {
  neonWet: 0.42, neonAlt: 140, streetFog: 0.45, fogAlt: 70, sheen: 0,
});
registerDistrictLook('historic-core', {
  neonWet: 0.36, neonAlt: 120, streetFog: 0.42, fogAlt: 90, sheen: 0,
});
registerDistrictLook('hollywood', {
  neonWet: 0.4, neonAlt: 42, streetFog: 0, fogAlt: 1, sheen: 0,
});

registerDistrictLook('dtla', {
  neonWet: 0.14, neonAlt: 80, streetFog: 0.28, fogAlt: 80, sheen: 1,
});
registerDistrictLook('financial-megatowers', {
  neonWet: 0.12, neonAlt: 40, streetFog: 0, fogAlt: 1, sheen: 1,
});
registerDistrictLook('civic-center', {
  neonWet: 0.05, neonAlt: 40, streetFog: 0, fogAlt: 1, sheen: 1,
});
registerDistrictLook('k-megablock', {
  neonWet: 0.08, neonAlt: 48, streetFog: 0.36, fogAlt: 40, sheen: 1,
});
registerDistrictLook('lakewood-megablocks', {
  neonWet: 0.06, neonAlt: 46, streetFog: 0.3, fogAlt: 40, sheen: 1,
});
registerDistrictLook('south-la-megablocks', {
  neonWet: 0.08, neonAlt: 46, streetFog: 0.34, fogAlt: 40, sheen: 1,
});
registerDistrictLook('east-la', {
  neonWet: 0.06, neonAlt: 40, streetFog: 0, fogAlt: 1, sheen: 1,
});
registerDistrictLook('westside', {
  neonWet: 0.04, neonAlt: 40, streetFog: 0, fogAlt: 1, sheen: 1,
});
registerDistrictLook('basin-sprawl', {
  neonWet: 0.04, neonAlt: 40, streetFog: 0, fogAlt: 1, sheen: 1,
});
registerDistrictLook('long-beach', {
  neonWet: 0.08, neonAlt: 72, streetFog: 0.22, fogAlt: 70, sheen: 1, fogTier: 'belt',
});
registerDistrictLook('arts-district', {
  neonWet: 0.02, neonAlt: 50, streetFog: 0.46, fogAlt: 42, sheen: 1, fogTier: 'arts',
});
registerDistrictLook('southeast-industrial', {
  neonWet: 0.02, neonAlt: 60, streetFog: 0, fogAlt: 1, sheen: 1,
});
registerDistrictLook('south-bay-refineries', {
  neonWet: 0.02, neonAlt: 60, streetFog: 0.4, fogAlt: 80, sheen: 1, fogTier: 'belt',
});
registerDistrictLook('harbor', {
  neonWet: 0.02, neonAlt: 55, streetFog: 0.46, fogAlt: 90, sheen: 1, fogTier: 'belt',
});
registerDistrictLook('lax-spaceport', {
  neonWet: 0.02, neonAlt: 40, streetFog: 0, fogAlt: 1, sheen: 1,
});
registerDistrictLook('coastal-strip', {
  neonWet: 0.02, neonAlt: 30, streetFog: 0, fogAlt: 1, sheen: 1,
});
registerDistrictLook('wallace-vernon', {
  neonWet: 0.02, neonAlt: 110, streetFog: 0.78, fogAlt: 110, sheen: 1,
});
