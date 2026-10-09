# Megablock kit

Shared plans for the 90–250 m canyon blocks. Stages 11, 12 and 20 should build residential blocks from these plans (`residential` about 0.7–1, a lower height) instead of a new box archetype.

Frame matches the megatower kit: origin at the footprint centre, +Y up, local X = width (block B / −t), local Z = depth (block A / +s). Faces: 0 = +Z, 1 = +X, 2 = −Z, 3 = −X. Every mass stays inside the footprint.

| File | Role |
|---|---|
| `build.ts` | `buildMegablock(plan, sink) → MegablockParts`. Forms: `cantilever`, `slab-podium`, `bar`, `courtyard`. Families: `ribbed`, `coffered`, `panelled` (styles 15–17 plus fins, coffer bands, pilasters). |
| `grid.ts` | Downtown grid (bearing 38°, 205 × 125 m) and the shared walkway heights. `lineWalkY` takes the **grid line**, not the block index. |

`compact: false` adds rails and tighter ribs. DTLA uses that. A pure DTLA chunk at the canyon block (origin −1000, −1000) was **1,039 boxes, about 10.4 k triangles, 182 signs**, generated in a few milliseconds. The heaviest sampled 500 m chunk that contained DTLA blocks was **1,966 boxes, about 19.7 k triangles** (nine DTLA blocks plus neighbours). Both sit under the 40 k LOD0 guide before street props.

Walk decks are 46 or 68 m on every street, and 92 or 118 m on about three streets in five. The caller passes `walkAt` from `lineWalkY` so a deck meets the neighbour's crossing.

The sink is the megatower `MassSink`. Fabric uses `FabricSink` (or DTLA's `MemorySink`, which copies its rules: no rotation, no detail 3, frustums averaged, nothing under 0.6 m). Hero landmarks should keep using the megatower kit.
