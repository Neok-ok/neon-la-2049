# Agent notes

Passes that add meshes, textures, render targets, or materials follow [docs/perf/MEMORY-RULES.md](docs/perf/MEMORY-RULES.md) (HTML: [docs/perf/MEMORY-RULES.html](docs/perf/MEMORY-RULES.html)).

The graphics tier is how good the picture looks. The memory budget is how much stays resident. Ultra remains selectable on a phone and keeps less of the distance loaded.

Create GPU resources through `resources` in `src/core/memory`. Unload with `release` or `dispose`. Do not keep an uncompressed texture next to its KTX2 copy. `npm run memory:check` must pass.

The 2026-10-11 memory pass is summarised in [docs/perf/p1-2026-10-11.html](docs/perf/p1-2026-10-11.html).

City lighting goes through `src/lighting`. Read [docs/lighting/rules.html](docs/lighting/rules.html) before adding a light, a glowing material, or a change to exposure. Do not construct a three.js light outside that module. Candela, nits, and kelvin have to pass the registry guard (`npm run lighting:check`).

The governor's resolution scale (0.75 at pressure level 3) shrinks the drawing buffer. Lighting bloom, the one sun shadow, and the wet-street probe are sized from that buffer, so they follow it without a second multiply. `setLightingResolutionScale` (1 down to 0.25) is a further cut of those targets only. Dropping a tier disposes the targets that tier does not use. There is no cluster texture and no per-light shadow map.
