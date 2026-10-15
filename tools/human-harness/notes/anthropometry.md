# Anthropometry

The mesh is the S4 plate: crown 1.80 m, soles at 0. Measured on the high body.
The plate’s head is 0.23 m (chin 1.57, crown 1.80), which is 1/7.83 of stature.
The brief’s 1/7.5 would be a 0.24 m head. The plate wins, so the head was not grown.

Published ranges are ANSUR II, US Army 2012, as tabulated by the OPEN Design Lab
explorer (https://ergoassessment.cam/ansur-2-data-explorer/): female and male
5th–95th, centimetres converted to metres. ANSUR II is a military sample, not
the civilian population. It is the comparison table, not a target that overrides
the plate.

| Measure | Mesh | Plate | ANSUR II female 5–95 | ANSUR II male 5–95 |
| --- | --- | --- | --- | --- |
| Stature | 1.80 m | 1.80 m | 1.525–1.740 | 1.648–1.870 |
| Head length (chin to crown) | 0.23 m | 0.23 m | — | — |
| Head / stature | 1/7.83 | 1/7.83 | — | — |
| Head breadth | 0.16 m | 0.16 m | 0.140–0.156 | 0.146–0.163 |
| Shoulder breadth (coat) | 0.48 m | 0.48 body, 0.52 with cloth | bideltoid 0.406–0.499 | bideltoid 0.459–0.567 |
| Shoulder height | 1.48 m | 1.48 m | — | — |
| Hip pivot | 0.96 m | 0.96 m | — | — |
| Knee pivot | 0.45 m | 0.45 m | — | — |
| Long hem | 0.74 m | 0.74 m | — | — |
| Short hem | 0.96 m | 0.96 m | — | — |
| Sole | 0.00 m | 0.00 m | — | — |

Instance crowns are `1.55 + u * 0.36` metres (1.55–1.91), uniform scale
`height / 1.80`. That span covers roughly the female 10th through the male
98th of ANSUR II stature. Hats add 0.12 m on the 1.80 m mesh and then scale
with the body. They are not an extra scale.

Head breadth 0.16 m sits on the male 95th (0.163) and just past the female
95th (0.156). It is the plate’s 0.16 m head width. Shoulder breadth 0.48 m is
the coat’s front span. ANSUR bideltoid is the outside of the deltoids and runs
wider on men; the plate’s shoulder is 0.48 across, with cloth to 0.52. The
mesh follows the plate.

## Gait

Walk cycle 1.42 m (two 0.71 m steps). Speed stays `1.5 * (0.88 + u * 0.24)` =
1.32–1.68 m/s. On the rig the cycle length is `1.42 * (height / 1.80) * stride`,
and the umbrella clip is authored at stride 1. Stride variants are 0.92, 1.00,
and 1.08 so a crowd does not share one step length. Phase was already per person.

Plant, sampled at 64 keys, sole slide in metres:

| Stride | Sole error | Penetration | Float | Knee stance | Knee swing | Elbow |
| --- | --- | --- | --- | --- | --- | --- |
| 0.92 | ~0 | 0 | 0 | ~11–35° | ~73° | ~39° |
| 1.00 | ~0 | 0 | 0 | ~11–35° | ~73° | ~39° |
| 1.08 | ~0 | 0 | 0 | ~11–36° | ~73° | ~39° |

Bob is 1.76 cm. The plate asks for 2 cm. A 0.90 m leg with the ankle at 0.06 m
cannot rise to a 2 cm bob and still reach a 0.71 m step, so the solver keeps
the plant and reports the shorter bob. The 16-frame palette blends linearly
between keys; the keys themselves are planted.
