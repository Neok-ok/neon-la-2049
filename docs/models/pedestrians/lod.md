# Pedestrian LOD

Ultra and High share the full person. Medium is lighter. Low is a simple figure that still reads as a coated pedestrian with a roof when it rains. Low does not drop the crowd to empty the sidewalk, and it does not swing the limbs (animation reach 0). There is no hard triangle gate. Report triangles, glTF bytes, and `crowdTris` at a full market for that tier.

The mesh stays one `InstancedMesh` named `crowd`. Hood, hat, bag, short coat, and umbrella already collapse to a point through instance attributes. A LOD swap replaces the geometry on that same mesh. It does not add a draw.

## Ceiling

| Tier | People (market) | Radius | Animation | Figure |
|---|---:|---:|---|---|
| Low | 56 | 48 m | Frozen pose, they still move along the loop | Tapered coat, head, legs, pyramid canopy. Hem still clears the knee. |
| Medium | 160 | 64 m | Inside 28 m | Long and short hems differ. Hood, hat, bag. Dome canopy. |
| High | 340 | 78 m | Inside 48 m | Lapel, hem break, ribbed dome, a darker shoe. |
| Ultra | 680 | 88 m | Inside 72 m | The high mesh. |

Past the animation reach the pose is the bind (or the idle they were placed in) and the translation continues. A 200 m view is outside every radius, so the game shows nobody. The harness still shoots 200 m, for a cinematic that pulls them into frame.

## Triangle bands to report

| File | Band | Market triangles at that tier's count, if every instance used this file |
|---|---|---|
| `crowd-high.glb` (Ultra and High) | 700–1,100 | High 238k–374k. Ultra 476k–748k. |
| `crowd-medium.glb` | 280–450 | 45k–72k at 160 people |
| `crowd-low.glb` | 120–180 | 7k–10k at 56 people |

The current mesh is 162 at every tier, and a medium market is 25,920 triangles. The low band sits on that number. High is a real jump: write the `crowdTris` figure in the review so the cost is visible. Crossing a band is a note. A silhouette miss is a reject.

Prefer morphs or the part-collapse the shader already does over a skinned crowd. Skinning 680 people is a measurement to report if a round tries it, not the default.

## What each distance uses

| Distance | In the game | On the turntable |
|---|---|---|
| 5 m | Ceiling mesh, animated on medium and above | `#stand`, `#short`, `#rain`, and a hood on one instance |
| 30 m | Ceiling mesh. Animated on medium only if 30 m is inside 28 m, so medium at 30 m is already the frozen pose. High and ultra still swing. | The group: colours, hems, canopies |
| 200 m | Not drawn | One tick. Canopy is a fleck with vertical size, not a flat bar |

Medium's animation reach is 28 m, so a 30 m test on medium is a standing crowd that still translates. That is the current rule, and the sheet should show it rather than forcing the swing.
