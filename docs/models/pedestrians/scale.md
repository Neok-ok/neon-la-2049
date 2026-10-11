# Pedestrian scale

Metres. Median person 1.80 m to the crown, soles on the ground. The player capsule is the same height (`HUMAN` in `src/camera/WalkController.ts`: eye 1.70 m, radius 0.32 m, height 1.80 m, walk 1.5 m/s).

## Body, from a public anthropometry table

NASA-STD-3000 (Man-Systems Integration Standards), section 3.3, year-2000 crew estimates, 1 g, lightly clothed. [The table](https://msis.jsc.nasa.gov/sections/section03.htm) is the source. 50th percentile:

| Measure | American male | Japanese female |
|---|---:|---:|
| Stature | 179.9 cm | 157.0 cm |
| Acromial height | 147.6 cm | 127.1 cm |
| Trochanteric height | 95.8 cm | 76.7 cm |
| Tibiale height | — | 39.3 cm |
| Bideltoid breadth | 48.9 cm | 38.9 cm |
| Hip breadth | 35.8 cm | 32.9 cm |
| Head breadth | 15.7 cm | 15.6 cm |

The male stature is the median. The female stature is why instance height goes down to 1.55 m (5th-percentile female stature on that table is 148.9 cm; 1.55 m sits just above it so the sidewalk is not a crowd of children). The male 95th is 190 cm (74.8 in), so 1.91 m is the top of the range. Scale is uniform.

Knee height uses the female tibiale ratio, 39.3 / 157.0 = 0.250 of stature, which is 0.45 m on the median. The male tibiale cells in that figure are empty, so the pack does not invent a second knee number.

Applied to the 1.80 m median:

| Mark | Metres |
|---|---:|
| Eye (player) | 1.70 |
| Shoulder | 1.48 |
| Hip | 0.96 |
| Knee | 0.45 |
| Long hem | 0.74 |
| Short hem | 0.96 |
| Step length | 0.71 |
| Cycle (two steps) | 1.42 |

Speed is `1.5 × (0.88 + u × 0.24)` with `u` in 0..1, so 1.32–1.68 m/s. When the person ahead on the same loop is inside 0.9 m, speed drops to 0.28 of that. The arm pivot that ships is y = 1.46 m, which already matches the shoulder. The leg pivot that ships is y = 0.90 m; the target hip pivot is 0.96 m.

## What the boxes are today

`personGeometry`. Part index, then a box `(cx, cy, cz, w, h, d)` in metres. The canopy is a pyramid (a wedge), not a box. Top of the head box is 1.80 m. Hat crown reaches 1.92 m. Canopy apex is 1.93 m, so a hat and an umbrella intersect.

| Part | Index | Centre and size | Notes |
|---|---:|---|---|
| Torso | 0 | (0, 1.20, 0) 0.34 × 0.52 × 0.20 | Shoulders 0.34 m, narrow of the 0.49 m target |
| Head | 1 | (0, 1.69, 0) 0.17 × 0.22 × 0.17 | Blank, and almost as wide as the torso |
| Leg L / R | 2, 3 | (±0.10, 0.46, 0) 0.12 × 0.88 × 0.14 | Soles at 0.02 m |
| Arm L / R | 4, 5 | (±0.32, 1.14, 0.02) 0.09 × 0.64 × 0.09 | Hands at 0.82 m |
| Long coat | 6 | (0, 1.12, 0) 0.46 × 0.78 × 0.26 | Hem at 0.73 m |
| Canopy | 7 | wedge (0.34, 1.78, 0.08) 0.92 × 0.30 × 0.92 | Apex 1.93 m |
| Shaft | 8 | (0.34, 1.33, 0.08) 0.026 × 1.02 × 0.026 | Warm emissive |
| Hood | 9 | (0, 1.70, −0.02) 0.30 × 0.32 × 0.28 | |
| Hat brim | 10 | (0, 1.78, 0) 0.34 × 0.028 × 0.34 | Same part index as the crown |
| Hat crown | 10 | (0, 1.86, 0) 0.16 × 0.12 × 0.16 | Top 1.92 m |
| Bag | 11 | (−0.34, 0.98, 0.05) 0.16 × 0.30 × 0.13 | |
| Short coat | 12 | (0, 1.14, 0) 0.48 × 0.70 × 0.28 | Hem at 0.79 m |

162 triangles: 13 boxes × 12, plus the canopy's 6. One material, one `InstancedMesh`, `MAX` 720. The two cook slots are inside that count.

Pivots the vertex shader already uses, and the future poses should keep: legs at y = 0.90 (target 0.96), arms at (±0.32, 1.46, 0), coat and head at y = 1.50, bag at (−0.28, 1.15, 0). The canopy and the shaft use the right-arm pivot, which is why the umbrella stays in the hand.

## Crowds by district

Share is the fraction of the tier count in `quality.ts`: 56 / 160 / 340 / 680 people, inside 48 / 64 / 78 / 88 m. Unregistered districts stay at 0. That includes Wallace, the coast, and LAX. Counts below are `round(tier × share)`.

| District | Share | Low | Medium | High | Ultra |
|---|---:|---:|---:|---:|---:|
| Little Tokyo market | 1.00 | 56 | 160 | 340 | 680 |
| Broadway historic core | 0.72 | 40 | 115 | 245 | 490 |
| DTLA and the financial aprons | 0.40 | 22 | 64 | 136 | 272 |
| K's megablock | 0.32 | 18 | 51 | 109 | 218 |
| Hollywood, Civic Center | 0.22 | 12 | 35 | 75 | 150 |
| South LA | 0.20 | 11 | 32 | 68 | 136 |
| East LA | 0.18 | 10 | 29 | 61 | 122 |
| Long Beach | 0.16 | 9 | 26 | 54 | 109 |
| Westside | 0.14 | 8 | 22 | 48 | 95 |
| Lakewood | 0.12 | 7 | 19 | 41 | 82 |
| Basin | 0.07 | 4 | 11 | 24 | 48 |
| Arts District | 0.06 | 3 | 10 | 20 | 41 |
| Southeast industrial | 0.04 | 2 | 6 | 14 | 27 |
| South Bay | 0.03 | 2 | 5 | 10 | 20 |
| Harbor | 0.02 | 1 | 3 | 7 | 14 |

About 9% cross when a crossing exists, and the next 21% take the extra sidewalk. With no crossing, that first 9% takes the extra sidewalk too. Of a crowd of eight or more, about 12% stand: queues of 2–5, a cluster under an awning when rain is above 0.18, and one figure facing the nearest street-band hologram. The Broadway dancer is tower-band and the Hollywood dancer is skyline-band, so that gaze slot does not look at them today.

A full medium market at the current mesh is 160 × 162 = 25,920 triangles. Ultra at the same mesh is 680 × 162 = 110,160. `stats()` already reports `crowdTris`.
