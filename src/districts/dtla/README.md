# Downtown megablocks (stage 4)

Sector 5 / 9 fringe. Blocks of 205 × 125 m on the 38° grid, 34 m streets. Masses are 90–250 m so the 0.5–1 km financial slabs still own the skyline. About one wide lot in eight is a compact megatower-kit shaft at 200–300 m, mast included, under the 320 m fabric ceiling.

| File | Thread | What it does |
|---|---|---|
| `block.ts` | both | `dressBlock`. Lot split, megablock or tower, street crossings, kiosks, steam, curb vans, a sidewalk loop. |
| `archetype.ts` | both | Replays the boxes and signs into the fabric. Registered as `megablock-downtown`. |
| `details.ts` | main | Street kit for `dtla`, and the plaza kit for `dtla` + `financial-megatowers`. Shared steam and pool materials. |
| `plaza.ts` | main (pure) | MT-1 and MT-5 aprons, and the ground line under skybridges 1 and 3. The financial polygon has priority, so this is not fabric. |
| `crowd.ts` | main | `registerCrowdSource` for sidewalks and, near the two towers, the apron loops. |
| `holos.ts` | main | Four `registerHologram` placements. Kind-2 billboards on the shafts are promoted by the field. |
| `view.ts` | main | `__nla.dtlaView('street' \| 'walkway' \| 'roof' \| 'lanes' \| 'plaza')`. |

Crossings are emitted only by the block on the +A and +B side of a street, at `lineWalkY`, so the two ends meet. Deck slab is 5.6 m wide and 1.35 m thick, with glow lips. There is no stair; a walker stands on a deck only if the camera (or a later stage) sets their feet there.

Traffic lives in `src/vehicles/`:

* `streetGraph.ts` — intersections of the shared grid whose midpoint is in DTLA, the Financial District or Civic Center, and not in a reserve or a freeway. Measured **465 nodes, 757 edges**.
* Low spinners follow it at 74 m and 112 m, ±11 m, clear of the bridges.
* Ground cars and vans follow it at ±7.2 m. Counts 10 / 22 / 40 / 64.
* `dtla-avenue-*` sky lanes sit on the street centre lines at 188, 222 and 250 m (six runs in the un-clipped sample, 1.9–4.5 km). Hero colliders split a run instead of deleting it.

Street-prop caps: low 700 / 24 / 40, medium 1,600 / 80 / 140, high 4,200 / 160 / 280, ultra 7,000 / 280 / 480 (props / steam / pools). Rank 0 always, rank 1 from detail scale 0.45, rank 2 from 0.75. The plaza group is capped at about a third of that.

Budgets measured with a Vite SSR pass over `generateFabric` (SwiftShader not involved; this is CPU geometry):

| Chunk | Boxes | Triangles (×10) | Signs |
|---|---|---|---|
| Canyon, origin (−1000, −1000), 10 DTLA blocks | 1,039 | ~10.4 k | 182 |
| Heaviest sampled chunk containing DTLA (origin 0, 500; 9 DTLA blocks plus neighbours) | 1,966 | ~19.7 k | 836 |

Generation of that heavy chunk was about 5 ms. Props are on top of this and are capped. The medium-tier acceptance test is still the city-wide 250 draws / 1.5 M triangles, read from `stats()` in the district.
