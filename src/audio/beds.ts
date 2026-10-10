// Every district's street mix. Procedural levels only: no samples, no music, no film audio.
// confidence: invented — the bible rows ask for rain, markets, canyons, industry and quiet
// belts; these are levels on one bus, not new geometry.
import { registerDistrictAudio, type DistrictBed } from './registry';

function bed(p: DistrictBed): DistrictBed {
  return p;
}

registerDistrictAudio('little-tokyo-market', bed({
  drone: 0.55, murmur: 1, pa: 0.9, industrial: 0.06, canyon: 0.38,
  stalls: 1, neon: 0.92, steam: 0.85, foghorn: 0, tongue: 0,
}));
registerDistrictAudio('historic-core', bed({
  drone: 0.72, murmur: 0.82, pa: 1, industrial: 0.08, canyon: 0.95,
  stalls: 0.42, neon: 1, steam: 0.3, foghorn: 0, tongue: 1,
}));
registerDistrictAudio('dtla', bed({
  drone: 0.78, murmur: 0.55, pa: 0.72, industrial: 0.16, canyon: 0.7,
  stalls: 0.34, neon: 0.74, steam: 0.22, foghorn: 0, tongue: 2,
}));
registerDistrictAudio('financial-megatowers', bed({
  drone: 0.84, murmur: 0.4, pa: 0.58, industrial: 0.12, canyon: 0.88,
  stalls: 0.12, neon: 0.55, steam: 0.08, foghorn: 0, tongue: 2,
}));
registerDistrictAudio('civic-center', bed({
  drone: 0.42, murmur: 0.32, pa: 0.22, industrial: 0.08, canyon: 0.18,
  stalls: 0.08, neon: 0.16, steam: 0.05, foghorn: 0, tongue: 3,
}));
registerDistrictAudio('k-megablock', bed({
  drone: 0.48, murmur: 0.7, pa: 0.4, industrial: 0.1, canyon: 0.16,
  stalls: 0.82, neon: 0.42, steam: 0.55, foghorn: 0, tongue: 0,
}));
registerDistrictAudio('hollywood', bed({
  drone: 0.62, murmur: 0.5, pa: 0.92, industrial: 0.05, canyon: 0.42,
  stalls: 0.28, neon: 0.96, steam: 0.1, foghorn: 0, tongue: 1,
}));
registerDistrictAudio('long-beach', bed({
  drone: 0.5, murmur: 0.38, pa: 0.46, industrial: 0.22, canyon: 0.34,
  stalls: 0.24, neon: 0.48, steam: 0.14, foghorn: 0.12, tongue: 2,
}));
registerDistrictAudio('east-la', bed({
  drone: 0.5, murmur: 0.66, pa: 0.5, industrial: 0.36, canyon: 0.2,
  stalls: 0.72, neon: 0.52, steam: 0.4, foghorn: 0, tongue: 0,
}));
registerDistrictAudio('lakewood-megablocks', bed({
  drone: 0.26, murmur: 0.28, pa: 0.06, industrial: 0.08, canyon: 0.05,
  stalls: 0.32, neon: 0.1, steam: 0.1, foghorn: 0, tongue: 3,
}));
registerDistrictAudio('south-la-megablocks', bed({
  drone: 0.3, murmur: 0.38, pa: 0.1, industrial: 0.12, canyon: 0.08,
  stalls: 0.36, neon: 0.16, steam: 0.14, foghorn: 0, tongue: 3,
}));
registerDistrictAudio('westside', bed({
  drone: 0.32, murmur: 0.34, pa: 0.14, industrial: 0.06, canyon: 0.1,
  stalls: 0.38, neon: 0.22, steam: 0.12, foghorn: 0, tongue: 3,
}));
registerDistrictAudio('basin-sprawl', bed({
  drone: 0.24, murmur: 0.18, pa: 0.05, industrial: 0.1, canyon: 0.05,
  stalls: 0.16, neon: 0.08, steam: 0.08, foghorn: 0, tongue: 3,
}));
registerDistrictAudio('arts-district', bed({
  drone: 0.36, murmur: 0.14, pa: 0.08, industrial: 0.7, canyon: 0.14,
  stalls: 0.08, neon: 0.18, steam: 0.42, foghorn: 0, tongue: 2,
}));
registerDistrictAudio('southeast-industrial', bed({
  drone: 0.32, murmur: 0.08, pa: 0, industrial: 0.86, canyon: 0.06,
  stalls: 0.02, neon: 0.04, steam: 0.62, foghorn: 0, tongue: 2,
}));
registerDistrictAudio('south-bay-refineries', bed({
  drone: 0.3, murmur: 0.05, pa: 0, industrial: 0.9, canyon: 0.05,
  stalls: 0, neon: 0.04, steam: 0.7, foghorn: 0.18, tongue: 2,
}));
registerDistrictAudio('harbor', bed({
  drone: 0.34, murmur: 0.08, pa: 0.12, industrial: 0.78, canyon: 0.12,
  stalls: 0.04, neon: 0.08, steam: 0.32, foghorn: 1, tongue: 2,
}));
registerDistrictAudio('lax-spaceport', bed({
  drone: 0.4, murmur: 0.06, pa: 0.36, industrial: 0.55, canyon: 0.16,
  stalls: 0.04, neon: 0.28, steam: 0.1, foghorn: 0, tongue: 1,
}));
registerDistrictAudio('coastal-strip', bed({
  drone: 0.22, murmur: 0.04, pa: 0, industrial: 0.14, canyon: 0.02,
  stalls: 0, neon: 0.02, steam: 0.04, foghorn: 0.28, tongue: 3,
}));
registerDistrictAudio('wallace-vernon', bed({
  drone: 0.46, murmur: 0.02, pa: 0.04, industrial: 0.8, canyon: 0.22,
  stalls: 0, neon: 0.04, steam: 0.16, foghorn: 0, tongue: 2,
}));
