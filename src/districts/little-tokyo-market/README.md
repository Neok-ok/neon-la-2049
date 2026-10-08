# Little Tokyo night market

The reference district. Read [docs/BIBLE.md](../../../docs/BIBLE.md) §7.1 before changing the sizes.

## What is in here

| File | Runs where | Job |
|---|---|---|
| `dress.ts` | worker and main thread | One block: collision boxes, signs, kit props, steam points, neon pools, the noodle bar and Bibi's. Pure. No `three`, no DOM, no `Math.random`. |
| `archetype.ts` | worker and `CityQuery` | Registers `little-tokyo-market` and emits `dressBlock().boxes/signs`. |
| `details.ts` | main thread, LOD0 | Merges props, instances steam and pools. Caps by tier. |
| `crowd.ts` | main thread, one mesh for the whole city | Sidewalk loops from `pedestrianLoops`, avoidance, umbrellas. |
| `spots.ts` | main thread, once | Finds the noodle bar and Bibi's by dressing the blocks that own those POIs. |
| `view.ts` | debug / screenshots | `marketCamera()` → `__nla.marketView`. |

`street-market` in `_shared/archetypes.ts` is the Stage 1 blockout. Nothing in `city-layout.json` points at it anymore.

## Scale (the numbers that matter)

* Block 62 × 44 m, street 7 m, grid 38°. Usable floor is 55 × 37 m.
* Soffit **2.62 m**. The walk capsule is 1.8 m, so you pass under the awning. Awnings are props, not collision.
* Stall counter 1.12 m tall, 1.5 m deep, starting 0.22 m outside the facade. Lanes at 2.45 m and 3.15 m so they clear the stall.
* Noodle recess is 3.35 m deep; Bibi's is 2.5 m. Counter 1.06 m. Stools have no collision. `E` sits (eye 1.15 m) when you are within 1.15 m of a stool.
* Corner tower, when the block rolls one (about 20%), is 12.4 × 11.2 m and 72–112 m tall. Neighbouring shops inset to 13.2 m so they do not occupy the same corner.
* Catwalk deck at 4.05 m, stairs in 12 rises of 0.34 m (the step-up is 0.45 m, so you can climb).

Owned streets are the `a+` and `b+` edges only. The neighbour owns the other two. That is why cables, curbs and lamps are not on every side.

## Collision

`CityQuery` keeps a box when `detail ≤ 1`, the short side is at least 0.38 m and the long side is at least 0.9 m. Counters, stall bodies, side walls and stairs qualify. Awnings, lanterns and stools do not. The frame loop reads worker-packed cells. `dress.ts` is what both sides call, so a prop and its collision box cannot drift apart.

## Budgets

A 500 m cell that is almost all market is about **3,000 fabric boxes (~30 k triangles)**, **~2,000 signs (one instanced draw)** and, before the cap, **~8,000 props (~98 k triangles)**. `details.ts` strides that down:

| Tier | Prop cap | Steam | Pools | Ranks |
|---|---|---|---|---|
| low | 1,400 | 48 | 90 | 0 |
| medium | 4,200 | 140 | 280 | 0–1 |
| high | 8,000 | 300 | 520 | 0–2 |
| ultra | 14,000 | 520 | 900 | all |

Detail draws per LOD0 chunk: kit opaque, kit fade (only if a translucent sheet survived the rank filter), steam, pools. That is more than the two-batch guide in ADDING_A_DISTRICT. It is allowed because the global medium budget (≤ 250 draws, ≤ 1.5 M triangles) still holds, and because the alternative was to drop the street. Crowd is one extra draw for the whole city, not per chunk.

Low tier keeps `streetDetail` on so a phone still sees awnings, lanterns and the noodle counter. Density, not a missing district, is what the tier changes.

## Invented

Frontage rhythm, the corner towers, the catwalk, Bibi's as a walk-up rather than a full room, and every word on a sign. Recorded in BIBLE §7.1. The POI coordinates and the 7 m lanes are the film-and-map placement from Stage 1.

## Left for a polish pass

Sign atlas contrast and the flip of tall blades, pipe and cable silhouettes, the crowd cycle, the planar mirror on a real GPU (SwiftShader screenshots do not show it), bowls and a moving cook, how the stair feels under the capsule, and the plastic sheets.
