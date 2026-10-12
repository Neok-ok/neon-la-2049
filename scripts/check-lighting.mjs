// Static half of the lighting guard. Fails the build when a light or an emissive
// is introduced outside the registry. Run: node scripts/check-lighting.mjs
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const src = join(root, 'src');

/** Excluded passes keep their own materials until they adopt the registry. */
const ALLOW_PREFIX = [
  'src/lighting/',
  'src/vehicles/',
  'src/districts/harbor/',
  'src/districts/coastal-strip/',
  'src/world/materials/oceanMaterial.ts',
  'src/atmosphere/Weather.ts',
  'src/atmosphere/Precipitation.ts',
  'src/atmosphere/WetReflector.ts',
];

/**
 * Pre-L1 palette data. These files store a dress colour, not a light.
 * A new file is not on this list and has to import src/lighting.
 */
const GRANDFATHER = new Set([
  'src/world/interiors/types.ts',
  'src/world/interiors/template.ts',
  'src/districts/south-bay-refineries/details.ts',
  'src/districts/south-bay-refineries/interior.ts',
  'src/districts/hollywood/details.ts',
  'src/districts/hollywood/plan.ts',
  'src/districts/hollywood/interior.ts',
  'src/districts/dtla/block.ts',
  'src/districts/dtla/plaza.ts',
  'src/districts/historic-core/dress.ts',
  'src/districts/historic-core/courtPlan.ts',
  'src/districts/east-la/interior.ts',
  'src/districts/_shared/kit/batch.ts',
  'src/districts/_shared/sprawl/dress.ts',
  'src/districts/westside/interior.ts',
  'src/districts/arts-district/details.ts',
  'src/districts/arts-district/plan.ts',
  'src/districts/arts-district/interior.ts',
  'src/districts/_shared/residential/dress.ts',
  'src/districts/k-megablock/dress.ts',
  'src/districts/k-megablock/rooms.ts',
  'src/districts/_shared/refinery/plan.ts',
  'src/districts/little-tokyo-market/dress.ts',
  'src/districts/southeast-industrial/details.ts',
  'src/districts/southeast-industrial/interior.ts',
  'src/districts/lax-spaceport/details.ts',
  'src/districts/lax-spaceport/plan.ts',
  'src/districts/lax-spaceport/interior.ts',
  'src/districts/civic-center/dress.ts',
  'src/districts/wallace-vernon/interior.ts',
  'src/districts/south-la-megablocks/interior.ts',
  'src/districts/long-beach/details.ts',
  'src/districts/long-beach/interior.ts',
]);

const LIGHT_CTOR = /new\s+(?:Point|Spot|Directional|Hemisphere|RectArea|Ambient)Light\b/;
const EMISSIVE = /emissiveNode\b|emissiveIntensity\b|emissive\s*:|\.emissive\s*=/;
const USES_REGISTRY = /from\s+['"][^'"]*lighting(?:\/[^'"]*)?['"]/;

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (name.endsWith('.ts') || name.endsWith('.tsx')) out.push(p);
  }
  return out;
}

const errors = [];
for (const file of walk(src)) {
  const rel = relative(root, file).split('\\').join('/');
  const text = readFileSync(file, 'utf8');
  const allowed = ALLOW_PREFIX.some((p) => rel === p || rel.startsWith(p));
  if (LIGHT_CTOR.test(text) && !rel.startsWith('src/lighting/')) {
    errors.push(`${rel}: three.js light constructed outside src/lighting`);
  }
  if (!EMISSIVE.test(text) || allowed || GRANDFATHER.has(rel) || USES_REGISTRY.test(text)) continue;
  errors.push(`${rel}: emissive outside the lighting registry (import src/lighting or add a preset)`);
}

if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log('lighting guard ok');
