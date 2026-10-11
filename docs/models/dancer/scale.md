# Veil Dancer scale

Metres. The placed panels are already canon in `docs/BIBLE.md` and the hologram README. This pack does not move them. A future mesh is authored in city metres so a camera at 30 m matches the street.

## Placements

| | Broadway `joi-bridge-dancer` | Hollywood `hollywood-dancer` |
|---|---|---|
| Design | `veil-dancer` (shader index 6) | same design |
| Panel | 15 × 68 m | 24 × 68 m |
| Colour | pink `(1.00, 0.18, 0.55)` | same pink |
| Seed | 0.37 | 0.17 |
| Rank | 0 | 0 |
| Band | tower | skyline |
| Spill | 36 m | 48 m |
| Yaw | `atan2(AX, AZ)` on the Broadway grid, normal toward +A (north) | 0, normal toward +Z (south) |
| Where | grid s = −770, t = −210, the Broadway intersection west of the footbridge | north curb of the boulevard, `j = −120` |

Broadway plants the quad so uv `0.02` sits 0.12 m above the street:

`y = ground + 0.12 + 68 × (0.5 − 0.02)` → centre at street + 32.76 m.

The quad's own bottom is 1.24 m below the street. That strip is empty. The hem lives at uv 0.02, not at the quad edge.

Hollywood sets the quad centre at `ground + 34`, so the quad bottom is on the street. The same uv layout then holds the lowest shapes about 1.4 m off the ground. The mesh pass plants the hem on the street there too, and letterboxes the 15 m figure in the 24 m width. Empty panel at the sides is veil room and glow, not a wider torso.

The footbridge deck stays at 11.2 m and stays empty of the figure. The dancer is the intersection projector, not a statue on the deck.

## Figure envelope

Bind pose, Broadway metres, origin at the hem contact (street + 0.12 m, panel centre).

| | Target |
|---|---|
| Crown above the hem | 59.5 m |
| Raised hand above the hem | 64.4 m |
| Widest chevron | 13.2 m |
| Shoulder width | 8.4 m |
| Head | 4.2 m wide, 6.8 m tall |
| Max depth | 1.8 m |
| Quad used | 15 × 68 m, figure inset from the top by about 3 m |

Hollywood, uniform scale, same heights. Width stays 13.2 m inside a 24 m quad.

The film's giant pink advertisement was lit from a screen on the order of 30 ft (about 9 m), described in the DNEG write-ups linked from [references.md](references.md). That number is a lighting note. It is not a reason to shrink this panel. The bible height is 68 m.

## What the shader builds today

`veilDancer` draws nine shapes and a glow ellipse. Uv y grows up the quad. `thick` widens some radii when the camera is close and the tier is above low.

`thick = smoothstep(160, 24, distance) × mix(0.18, 1, smoothstep(0.04, 0.28, detail))`

Low forces `detail` to 0, so the mix stays at 0.18, and distance still multiplies it. Inside 24 m a low figure sits 0.18 of the way from the thin radii to the thick ones. At 160 m and beyond `thick` is 0 on every tier, and the radii are the thin column. Inside 24 m, medium and above climb from that floor toward 1 once `detail` passes about 0.28.

| Shape | Centre uv | Thin rx | Thick rx | ry |
|---|---|---:|---:|---:|
| Head diamond | (0.50, 0.847) | 0.050 | 0.050 | 0.093 |
| Neck | (0.50, 0.726) | 0.016 | 0.030 | 0.040 |
| Torso | (0.50, 0.562) | 0.055 | 0.145 | 0.128 |
| Chevron 1 | (0.50, 0.334) | 0.150 | 0.220 | 0.057 |
| Chevron 2 | (0.50, 0.220) | 0.190 | 0.260 | 0.050 |
| Chevron 3 | (0.50, 0.106) | 0.120 | 0.180 | 0.043 |
| Arm up | (0.64, 0.733) | 0.100 | 0.100 | 0.022–0.055 |
| Arm out | (0.32, 0.505) | 0.110 | 0.110 | 0.020–0.050 |
| Veil | (0.56, 0.391) | 0.035 | 0.075 | 0.371 |
| Glow | (0.50, 0.434) | 0.260 | 0.340 | 0.400 |

Sway and hip offsets are in the look-target. On the 15 m quad the thick middle chevron is about 7.8 m wide and the head is about 1.5 m wide and 12 m tall. They merge into one pink column. That column is the current silhouette, and it is the fail the overlap plate replaces.

Triangles today: one quad per instance (2), plus ghost slices on the same draw. High adds one slice and ultra a second, each 0.85 m behind the plane. Slices go to the first five panels in the field's score order (`distance / range + rank × 0.42 + view angle × 0.1`), not a pure nearest-five. The dancer is not guaranteed a ghost if five other panels score better.

## Authoring frame

Same habit as the spinner harness.

- Blender: Z up, the figure faces +Y, origin on the hem contact at the ground.
- glTF: Y up, the figure faces −Z, origin on that same point. Metres.
- The game quad is centred. The mesh is not. Integration offsets the hem to uv 0.02. Centring the mesh on the quad plants the feet in the air.

## People at her feet

Walk-mode eye height is 1.70 m, body 1.80 m (`HUMAN` in `src/camera/WalkController.ts`). A pedestrian under the hem is about 1/33 of the crown height. At 5 m the crowd reads as dark ticks against the spill. The dancer mesh does not include a person.
