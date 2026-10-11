# Pedestrian look-target

People on the sidewalk. Dark coats, a few pale ones, umbrellas when it rains, a walk you can read at arm's length. The mesh that ships is thirteen boxes and a pyramid (`personGeometry` in `src/districts/little-tokyo-market/crowd.ts`). The proportions and the variety below are what that mesh is aiming at and mostly missing.

One draw for the whole city. The mesh stays named `crowd`. Interiors hide that one mesh, so a second mesh would show up inside rooms.

## Silhouette

Median figure, 1.80 m to the crown of the head, origin between the soles. Front plate `#stand` in [silhouette.svg](silhouette.svg): head a plain mass, shoulders wider than the head, long coat to mid-thigh, calves and feet clear of the hem, arms at the sides. No eyes, no mouth, no hair. Hoods and hats cover the head when those attributes are on. A bare head is still a blank volume.

`#short` ends the coat at the hip, so the two lengths separate. `#rain` is the long coat plus a canopy over the head and a shaft in the right hand. `#side` is a slim coat, head over the chest, feet under the hem. The canopy has height, so a side view at eye level still shows a roof, not a line.

## Proportions

Median matches `HUMAN.height` (1.80 m) and the 50th-percentile male stature in the scale sheet (1.799 m). Instance height, crown of the head, runs 1.55–1.91 m, scaled in Y and XZ together. Hats add up to 0.12 m on top of that. Nobody is stretched in width to fake a coat.

| Mark | Median | Where it comes from |
|---|---:|---|
| Crown | 1.80 m | Engine body height |
| Chin | 1.57 m | Head 0.23 m |
| Shoulders | 1.48 m, 0.48 m across | Acromial height and bideltoid breadth |
| Hip | 0.96 m | Trochanteric height |
| Long-coat hem | 0.74 m | Above the knee, calves in the walk |
| Short-coat hem | 0.96 m | At the hip, so it is not a second long coat |
| Knee | 0.45 m | A quarter of stature |
| Soles | 0 | The current boxes start at 0.02 m and float |
| Hand, arm down | 0.82 m | End of the hanging arm |
| Umbrella grip | 1.10 m | Right hand, elbow bent |
| Canopy underside | 1.98 m | Clears a hat crown at 1.92 m |
| Canopy apex | 2.15 m | |
| Canopy width | 1.05 m | |
| Chest depth | 0.24 m | Side plate |

Head width 0.16 m. The current head is 0.17 m on a 0.34 m torso, so the head is half the shoulders. Target shoulders are 0.48 m, and the head stays 0.16 m.

## Pose set

The walk stays a 1.42 m cycle (two steps of 0.71 m) at 1.32–1.68 m/s. The stance half plants the foot: local Z of the foot falls at the walk speed, so the sole holds on the ground. Bob is 2 cm. The right arm swings with the left leg, except when it is holding the umbrella.

| Pose | Use |
|---|---|
| `stand` | Bind. Long coat, arms down. Plate `#stand`. |
| `step-l` / `step-r` | Left or right foot forward 0.35 m, the other back. Planted sole. |
| `pass` | Feet together, the 2 cm bob. |
| `short` | Same stand, hip-length coat. Plate `#short`. |
| `rain` | Right elbow bent, hand on the shaft at 1.10 m. Plate `#rain`. |
| `queue` | Weight on one leg, a small sway. Coat still. |
| `gaze` | Head tilted up about 33° (the current −0.58 rad). Body still. |
| `vendor` | One arm swings about ±0.42 rad. The cook behind a counter. |
| `hold` | `stand`, used when a crossing light holds them at the curb. |

Low tier does not play these. The pose is `stand` or whichever idle they were given, and they still slide along the sidewalk. Medium plays them inside 28 m, high inside 48 m, ultra inside 72 m.

## Coats, hoods, hats, bags

The mix is already in `styleOf` / `coatOf`. Keep the rates. Change the shapes so the rates show up at 30 m.

| Slice of 1000 | What they wear |
|---|---|
| 0–339 | Coat only (34%) |
| 340–559 | Hood (22%) |
| 560–699 | Hat (14%) |
| 700–819 | Bag (12%) |
| 820–919 | Hood and bag (10%) |
| 920–999 | Hat (8%) |

Hoods land on 32%, hats on 22%, bags on 22%. A short coat is chosen only when there is no hood, on about 19% of people (`hood === 0` and a second hash under 28). Short and long are mutually exclusive: the shader already collapses the one that is off.

| Garment | Shape |
|---|---|
| Long coat | Hem 0.74 m, shoulder 0.52 m across including the cloth, a lapel break down the front. |
| Short coat | Hem 0.96 m, slightly wider. The thigh is visible. |
| Hood | Covers the head, 0.30 m across, no face inside it. |
| Hat | Brim 0.34 m, crown to 1.92 m. |
| Bag | Left hip, 0.16 × 0.30 × 0.13 m. |
| Shoes | A darker end to the leg, not a separate hero prop. |

Coat colours, nine darks for 93% of people, then two rares:

| Share | RGB | Read |
|---|---|---|
| 4% | 0.74, 0.75, 0.77 | Off-white |
| 3% | 0.62, 0.80, 0.78 | Pale plastic |
| 93% | the nine `COATS` values | Black, charcoal, grey, olive, rust |

The nine darks stay the list in `crowd.ts`. They have to separate from each other at 30 m under neon. One averaged grey fails.

Skin is three shadowed neutrals, swapped per instance, starting from the current `(0.55, 0.42, 0.34)`. No portraits, no eyes.

## Umbrellas

In the right hand. The shaft stays emissive `(1.00, 0.74, 0.38)`. The canopy is a shallow faceted dome, 1.05 m across and about 0.17 m tall, ribs enough to read at 5 m. At 30 m it collapses to a solid roof. A flat disc is edge-on at eye height and fails. The pyramid that ships is the proof that the roof needs vertical area; the dome keeps that area and stops looking like a spike.

Canopy colours, eight, even mix: pink `(1, 0.20, 0.45)`, cyan `(0.20, 0.78, 1)`, amber `(1, 0.58, 0.16)`, violet `(0.82, 0.28, 1)`, yellow `(1, 0.86, 0.28)`, green `(0.20, 0.88, 0.58)`, red `(1, 0.32, 0.18)`, pale `(0.72, 0.76, 0.80)`.

Who holds one follows `umbrellaFraction`. People under an awning, and the two cooks, never do.

| Rain | Fraction with a canopy |
|---:|---:|
| ≤ 0.02 | 0 |
| < 0.22 | 0.28 |
| < 0.50 | 0.55 |
| < 0.82 | 0.74 |
| else | 0.90 |

## Materials

`MeshBasic`, fog on, no texture of a face. Cloth is the coat colour, darker in the lapel gap and under the hem. Wetness is the city fog and the night, not a specular highlight on a grey shader. The pale plastic coat is the one surface that may look smooth. The shaft and the canopy edge carry the light. Canopy faces are solid. A dithered canopy broke into holes at street distance, and that experiment stays retired.

## How they read

- **5 m.** Hem, the planted foot, the hand on the shaft, the hood edge or the hat brim, the bag. The head is a mass under cloth or a blank volume. A face here fails.
- **30 m.** The canopy reads as a roof. Coat colours separate. Long and short hems separate. A queue of two to five reads as a line of people. The walk reads inside the tier's animation reach, and stays a standing pose past it.
- **200 m.** The field does not draw them. Crowd radius tops out at 88 m on ultra. An empty sidewalk at 200 m is correct. The turntable still frames a 200 m view: a dark vertical tick, and a canopy as a small bright fleck. A rectangle fleck means the roof is still a box.

## Fail

A face or a likeness. A brand on a coat. A flat disc umbrella. A floor-length coat that hides the calves. Every person the same height. A short coat whose hem sits within a hand's width of the long hem (the boxes today are 0.73 m and 0.79 m). A second mesh. Low tier with an empty market sidewalk: low still places people, it only freezes the pose. Feet that skate, or soles that hover.
