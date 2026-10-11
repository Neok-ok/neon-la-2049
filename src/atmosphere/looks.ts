// Street fog, rain-neon and air weights. Districts register here. App.ts only samples.
import { registerDistrictLook } from './districtLook';

// Magenta and cyan stay on the three streets that sell them. Everywhere else is
// sodium or black, and the weight is low enough that asphalt stays black.
// Air tints are hue multiplies (luminance near 1). They shift the haze, not the street.
registerDistrictLook('little-tokyo-market', {
  neonWet: 0.42, neonAlt: 140, streetFog: 0.45, fogAlt: 70, sheen: 0,
  air: { ground: 0.88, mid: 1, deck: 0.72, tint: [1.28, 0.9, 0.78], mix: 0.42, breath: 0.9 },
});
registerDistrictLook('historic-core', {
  neonWet: 0.36, neonAlt: 120, streetFog: 0.42, fogAlt: 90, sheen: 0,
  air: { ground: 0.82, mid: 1.04, deck: 0.78, tint: [1.22, 0.78, 1.12], mix: 0.4, breath: 0.55 },
});
registerDistrictLook('hollywood', {
  neonWet: 0.4, neonAlt: 42, streetFog: 0, fogAlt: 1, sheen: 0,
  air: { ground: 0.58, mid: 0.96, deck: 0.82, tint: [1.12, 0.82, 1.22], mix: 0.38, breath: 0.36 },
});

registerDistrictLook('dtla', {
  neonWet: 0.14, neonAlt: 80, streetFog: 0.28, fogAlt: 80, sheen: 1,
  air: { ground: 0.52, mid: 1, deck: 0.96, tint: [1.08, 0.92, 0.82], mix: 0.22, breath: 0.22 },
});
registerDistrictLook('financial-megatowers', {
  neonWet: 0.12, neonAlt: 40, streetFog: 0, fogAlt: 1, sheen: 1,
  air: { ground: 0.3, mid: 0.96, deck: 1, tint: [0.86, 0.96, 1.18], mix: 0.18, breath: 0.08 },
});
registerDistrictLook('civic-center', {
  neonWet: 0.05, neonAlt: 40, streetFog: 0, fogAlt: 1, sheen: 1,
  air: { ground: 0.24, mid: 0.92, deck: 0.86, tint: [0.94, 1, 1.06], mix: 0.12, breath: 0.06 },
});
registerDistrictLook('k-megablock', {
  neonWet: 0.08, neonAlt: 48, streetFog: 0.36, fogAlt: 40, sheen: 1,
  air: { ground: 0.64, mid: 1, deck: 0.8, tint: [1.16, 0.94, 0.78], mix: 0.2, breath: 0.42 },
});
registerDistrictLook('lakewood-megablocks', {
  neonWet: 0.06, neonAlt: 46, streetFog: 0.3, fogAlt: 40, sheen: 1,
  air: { ground: 0.42, mid: 0.96, deck: 0.7, tint: [1.06, 0.96, 0.88], mix: 0.14, breath: 0.12 },
});
registerDistrictLook('south-la-megablocks', {
  neonWet: 0.08, neonAlt: 46, streetFog: 0.34, fogAlt: 40, sheen: 1,
  air: { ground: 0.5, mid: 1, deck: 0.76, tint: [1.08, 0.94, 0.86], mix: 0.16, breath: 0.16 },
});
registerDistrictLook('east-la', {
  neonWet: 0.06, neonAlt: 40, streetFog: 0, fogAlt: 1, sheen: 1,
  air: { ground: 0.36, mid: 0.96, deck: 0.66, tint: [1.08, 0.96, 0.84], mix: 0.12, breath: 0.14 },
});
registerDistrictLook('westside', {
  neonWet: 0.04, neonAlt: 40, streetFog: 0, fogAlt: 1, sheen: 1,
  air: { ground: 0.26, mid: 0.92, deck: 0.6, tint: [1.04, 0.98, 0.9], mix: 0.1, breath: 0.08 },
});
registerDistrictLook('basin-sprawl', {
  neonWet: 0.04, neonAlt: 40, streetFog: 0, fogAlt: 1, sheen: 1,
  air: { ground: 0.22, mid: 0.92, deck: 0.55, tint: [1.02, 0.98, 0.94], mix: 0.08, breath: 0.06 },
});
registerDistrictLook('long-beach', {
  neonWet: 0.08, neonAlt: 72, streetFog: 0.22, fogAlt: 70, sheen: 1, fogTier: 'belt',
  air: { ground: 0.42, mid: 1, deck: 0.86, tint: [1.06, 0.94, 0.86], mix: 0.16, breath: 0.12 },
});
registerDistrictLook('arts-district', {
  neonWet: 0.02, neonAlt: 50, streetFog: 0.46, fogAlt: 42, sheen: 1, fogTier: 'arts',
  air: { ground: 0.9, mid: 1.08, deck: 0.7, tint: [1.24, 0.88, 0.72], mix: 0.28, breath: 0.7 },
});
registerDistrictLook('southeast-industrial', {
  neonWet: 0.02, neonAlt: 60, streetFog: 0, fogAlt: 1, sheen: 1,
  air: { ground: 0.46, mid: 1.04, deck: 0.6, tint: [1.26, 0.84, 0.68], mix: 0.2, breath: 0.2 },
});
registerDistrictLook('south-bay-refineries', {
  neonWet: 0.02, neonAlt: 60, streetFog: 0.4, fogAlt: 80, sheen: 1, fogTier: 'belt',
  air: { ground: 0.56, mid: 1.04, deck: 0.55, tint: [1.22, 0.86, 0.7], mix: 0.22, breath: 0.18 },
});
registerDistrictLook('harbor', {
  neonWet: 0.02, neonAlt: 55, streetFog: 0.46, fogAlt: 90, sheen: 1, fogTier: 'belt',
  air: { ground: 0.72, mid: 1.08, deck: 0.5, tint: [1.02, 0.96, 0.9], mix: 0.18, breath: 0.15 },
});
registerDistrictLook('lax-spaceport', {
  neonWet: 0.02, neonAlt: 40, streetFog: 0, fogAlt: 1, sheen: 1,
  air: { ground: 0.2, mid: 0.88, deck: 0.46, tint: [0.94, 0.98, 1.08], mix: 0.1, breath: 0.05 },
});
registerDistrictLook('coastal-strip', {
  neonWet: 0.02, neonAlt: 30, streetFog: 0, fogAlt: 1, sheen: 1,
  air: { ground: 0.66, mid: 1.12, deck: 0.4, tint: [0.82, 0.96, 1.16], mix: 0.16, breath: 0.04 },
});
registerDistrictLook('wallace-vernon', {
  neonWet: 0.02, neonAlt: 110, streetFog: 0.78, fogAlt: 110, sheen: 1,
  air: { ground: 0.76, mid: 1.04, deck: 0.9, tint: [1.18, 0.9, 0.72], mix: 0.2, breath: 0.1 },
});
