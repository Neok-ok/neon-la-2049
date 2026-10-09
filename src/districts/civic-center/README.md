# Civic Center (stage 5)

Sector 5 central. The real LAPD block and the real City Hall, on the downtown 38° grid (blocks 205 × 125 m, streets 40 m). The park between them is paved. Nothing green.

| File | Thread | What it does |
|---|---|---|
| `spec.ts` | both | Metres for the tower, the hall, the stairs, the pads, and the mall clear. Worker-safe. |
| `mass.ts` | main | `GeoWriter` in the landmark's local frame. `solid` records a collider; the builder keeps the detail-2 set. |
| `hq.ts` | main | `registerLandmarkType('lapd-hq')`. Three LODs, signs, beacons. |
| `hall.ts` | main | `registerLandmarkType('heritage-tower')`. Replaces the Stage-1 silhouette. Only `city-hall` uses that type. |
| `lanes.ts` | main | Pad polylines. `skyLanes.ts` appends them after `hold-lapd`. No `three` import. |
| `archetype.ts` | both | `civic-center`. Compact megablocks, colonnade wings, mall left empty. |
| `dress.ts` | both | Cold pylons, bollards, benches, rare steam, cold pools, sidewalk and forecourt loops. |
| `details.ts` | main | Street kit for `civic-center`. Shared steam and pool materials. |
| `crowd.ts` | main | `registerCrowdSource`. The mesh stays in the market module. |
| `holos.ts` | main | One `registerHologram`: `lapd-shaft-notice`, glyph-loop, on the shaft toward the steps. |
| `view.ts` | main | `__nla.civicView('approach' \| 'steps' \| 'hall' \| 'lobby' \| 'plaza')`. |

## What was built

* **LAPD.** Podium 86 × 118 × 18 m, shaft 72 × 100 m, crown 132 × 165 × 62 m, roof at 216 m. Stair 30 m wide, 32 risers, on local −Z (toward City Hall). Lobby is a 17 m recess: floor 5.2 m, ceiling 12.4 m, desk, six columns, two barriers, a directory. Four 22 m pads. Hover altitude 222.5 m. Switch distances 520 / 1,900 m before `landmarkLod`.
* **City Hall.** Jacketed base 92 × 62 × 28 m, pale shaft 34 m to 100 m, neck to 114 m, pyramid to 132 m, lamp to 138 m. Stair on local +Z. Switch distances 420 / 1,500 m.
* **Mall.** Fabric suppressed from 100 m past LAPD to 52 m short of City Hall, 40 m off the axis. A landmark slab paves the gap.
* **Pads.** `lapd-pad-a` and `b` are the plaza-side approaches (the hero shot uses `a`). `c` and `d` use the far side. `lapd-pad-circuit` is a slow loop over the deck. Open lanes: `altBias` 0, fade 70 m, police 1. Avenues keep `altBias` 7 and fade 220 m. `hold-lapd` is untouched.
* **Words.** Atlas cells only: SECTOR 5 (`phraseSeed(39)`) and 2049 (`phraseSeed(62)`). No seal, no department wordmark.

`confidence: invented` for the stair, the lobby plan, the pad positions, the jacket, the lamp and the light bands. The sites and the two heights are the real buildings (BIBLE §5.2, §5.3).

## Budgets

Street-prop caps: low 320 / 8 / 24, medium 800 / 24 / 56, high 1,800 / 48 / 110, ultra 3,000 / 80 / 180 (props / steam / pools). Rank 0 always, rank 1 from detail scale 0.45, rank 2 from 0.75. The district opts out of the shared sodium lamps.

Measured with a Vite SSR pass over `generateFabric` and the two builders (CPU geometry; SwiftShader is not involved):

| Mesh | LOD0 | LOD1 | LOD2 | Colliders |
|---|---|---|---|---|
| LAPD HQ | 2,472 | 662 | 42 | 58 |
| City Hall | 730 | 240 | 60 | 36 |

| Chunk | Civic blocks | Boxes | Triangles (×10) | Signs |
|---|---|---|---|---|
| Origin (0, −500), 9 of 10 blocks civic | 9 | 499 | ~5.0 k | 24 |
| (−500, −500), 5 civic blocks | 5 | 524 | ~5.2 k | 60 |

A chunk that only contains the district stays near 5 k triangles of fabric. The origin chunk is heavier because neighbouring districts share it. Pad runs clear the crown with no altitude lift: plaza approaches are about 860–880 m, the far-side pair about 1.0 km, the circuit 265 m, hover 222.5 m (circuit 223.7 m). The medium-tier acceptance test is the city-wide 250 draws / 1.5 M triangles. On the steps in rain, SwiftShader reported about 130 draws and 0.35 M triangles at medium (HUD in the same frame read 117 calls and 0.31 M; that shot still had a ready queue), 195 draws and 0.43 M at high, and 213 draws and 0.52 M at ultra. Crowd count on that spot was 35 / 75 / 150 at medium / high / ultra, which is the 0.22 share of the market budget.

## Left for later

The lobby is a soffit, not an X3 interior: no separate light, and the exterior is not occluded. The back wall is dim concrete; the sign carries the room. Crowds stay on the ground. Pad hover is a flare, not gear-down. No stair handrail. No second pylon row down the mall.
