# Agent notes

Passes that add meshes, textures, render targets, or materials follow [docs/perf/MEMORY-RULES.md](docs/perf/MEMORY-RULES.md) (HTML: [docs/perf/MEMORY-RULES.html](docs/perf/MEMORY-RULES.html)).

The graphics tier is how good the picture looks. The memory budget is how much stays resident. Ultra remains selectable on a phone and keeps less of the distance loaded.

Create GPU resources through `resources` in `src/core/memory`. Unload with `release` or `dispose`. Do not keep an uncompressed texture next to its KTX2 copy. `npm run memory:check` must pass.

The 2026-10-11 memory pass is summarised in [docs/perf/p1-2026-10-11.html](docs/perf/p1-2026-10-11.html).
