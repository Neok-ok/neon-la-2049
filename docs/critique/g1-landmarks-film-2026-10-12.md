# G1 landmarks — film critique

12 October 2026. Draft PR #62, branch `cursor/g1-neon-landmarks-3d8a` at `0754bcf`. Shared lighting, roads, and the spinner are `main` at `2a10c95`. Docs only. No game code, no film frames, no logos, no stills in this commit.

The spinner gate that held these three back is the one in [roads-spinner-2026-10-12.md](roads-spinner-2026-10-12.md): approve the craft, then redo LAPD, City Hall, and Wallace on the same harness. That craft is 5.45 × 2.32 × 1.36 m. This note scores the buildings against that size, a 1.80 m person, and the film read. It does not re-score the spinner.

#62 scored every blind, film, and scale column at 7 or higher, and answered stray parts with no. Those numbers are the harness rubric grading its own sheets. The numbers below are a fresh read of the same sheets, the glTF the city loads, and the three in-city frames in `artifacts/g1/ingame/`.

**Overall: 5/10.** The three diagrams are the right buildings: a 216 m block with a wide crown, the 138 m hall with a dark jacket, and the 3,500 m pyramid with a warm mouth. At city scale they still read as a neon-barred block, a cool window tower, and a flat portal in fog. The top-down test the spinner harness uses is not met.

## Scores

| Check | Score | Read |
| --- | ---: | --- |
| Reads as the LAPD block | 5 | Podium, shaft, flared crown, four pads. The entrance is a 42 m white bar, a badge, and a small dark slot. |
| Reads as City Hall | 5 | 138 m, pale shaft, nine-step crown, dark base. The crown is a stack of squares and a gold box. The street frame is a cool window chart under two lamps. |
| Reads as the Wallace pyramid | 4 | Dark steps and a warm mouth. The mouth is a flat slab between two pylons. Kilometre-long amber bars cross the faces. |
| Scale against a 1.80 m person | 7 | Cuts are 2.2 m. Flights match the civic rises. Pads are 22 m. The pyramid stays 3,500 m. The scale sheets do not put the figure in those openings. |
| Top-down honesty | 2 | Model tops are on the sheet. The overlap score is the mesh against the boxes it was built from. No plan photograph sits beside those tops. |
| Stray gate versus a blind close-up | 4 | Protrusion is 0 m because the outline is those same boxes. The entrance bar, the badge, and the flat portal are the parts that do not belong. |
| Night rain, practicals versus bloom | 4 | Mesh lamps are raw emissive, floored at intensity 3.5, outside the nits registry. District strobes and police lamps still fire on the same roofs. |
| Low / medium / high / ultra | 4 | Ultra and high share the full file. Low drops the dress that identifies LAPD and the hall. Wallace low keeps the portal and the crown cube at full emission. |

## How this was looked at

Sheets and close-ups are `artifacts/g1/` on #62. Close-ups are 1280×1025. In-city frames are `civic-approach-night.png`, `civic-city-hall.png`, and `wallace-approach-dusk.png`. This pass did not re-render. It counted the nine shipping glBs and read `tools/model-harness/blender/build_landmarks.py`, `paint_landmark_maps.py`, `tools/model-harness/critic/LANDMARKS.md`, `src/world/landmarks/authoredModel.ts`, `src/districts/civic-center/hq.ts`, `hall.ts`, and `src/districts/wallace-vernon/pyramid.ts`.

Triangle counts in `public/models/landmarks/scale.json`, and in the #62 description, are Blender polygon totals from `count_tris()`, taken before `bake_meshes()` and the glTF export. The files the city loads are larger:

| Building | scale.json high / medium / low | glTF triangles | glTF meshes, high |
| --- | ---: | ---: | ---: |
| LAPD | 787 / 583 / 195 | 2,704 / 2,268 / 700 | 59 |
| City Hall | 2,270 / 1,196 / 206 | 5,216 / 2,660 / 672 | 306 |
| Wallace | 2,704 / 318 / 234 | 7,536 / 788 / 620 | 61 |

Turntable sidecars match the glTF column (`lapd-after.json` 2,704, `hall-scale.json` 5,216, `wallace-after.json` 7,536). A follow-up should quote the glTF numbers.

`landmarkChain` in `authoredModel.ts`: low is the low file at every distance; medium is medium, then low; high and ultra are high, medium, low. There is no separate ultra mesh and no phone draw cap. That split matches the graphics-setting rule.

Reference pixels are already baked into the right-hand column of `artifacts/g1/*-after.png` on #62. This file does not copy them.

## What the film is asking these three to do

Published accounts already used in the tower and lighting critiques. No frames are in this commit.

- Dennis Gassner, one word from Denis Villeneuve: brutality. The pattern language starts with the angular spinner and carries into the buildings. Scale is the power. Wallace's headquarters is described as a 300-storey mass, and the sunlight in the film belongs to that building. ([IndieWire, 23 Oct 2017](https://www.indiewire.com/awards/industry/blade-runner-2049-dystopia-production-design-denis-villeneuve-1201891427/); [Deadline, 15 Feb 2018](https://deadline.com/2018/02/blade-runner-2049-dennis-gassner-oscars-production-design-interview-1202280798/))
- John Nelson: the LAPD approach miniature is 1/48 and about 15 ft tall. At 4.5 m that is 216 m, the height this repo already uses. ([vfxblog, 26 Oct 2017](https://vfxblog.com/2017/10/26/lets-move-to-la-in-2049/))
- Wētā Workshop: the LAPD piece was the largest model. Pyramids were built at scales down to 1:600. The miniature read is dark stone and long vertical joints, shot in smoke, with most of the interior lamps taped off. ([Wētā Workshop](https://www.wetaworkshop.com/projects/bladerunner-2049))

City Hall in this project is the 1928 tower, 138 m to the lamp, with a dark jacket the film does not owe. The shaft, the setbacks, and the stepped crown are the part a viewer has to recognise. The real crown is a ziggurat with a round top and a small beacon. The jacket is this repo's 2049 layer (`src/districts/civic-center/README.md`).

This repo already locked the leap of scale. Fabric stays under 320 m. LAPD is the 216 m miniature. City Hall is 138 m. Wallace is 3,500 m (`docs/BIBLE.md`). Three hundred storeys at 3.6 m would be about 1,080 m. The picture of Wallace is a mass that eats the sky. 3,500 m is that picture, and it is already the city figure. A follow-up should leave the height alone.

The harness brief (`tools/model-harness/critic/LANDMARKS.md`) asks for the same three reads: brutalist podium, shaft, wide crown, pads, and no department wordmark; the 1928 shaft in a dark jacket, without a traced seal; dark stone, vertical joints, a slope or a step, a warm portal, and a lantern at the apex.

## What works

Keep these. A later pass that shrinks Wallace toward a street building, flattens the LAPD crown back into a box, or lights the hall like a hotel will leave the film.

- **The before column is the picture this replaced.** LAPD before is a grey stack of slabs. City Hall before is a box and a plain shaft. Wallace before is a grey stair with one cream rectangle. The after masses are a flared crown, a jacketed tower, and coursed steps. That was the assignment.
- **The heights match the city.** Roof 216 m and tip 222.9 m at LAPD (`HQ` in `build_landmarks.py`, `spec.ts`). Hall roof 132 m, tip 138 m. Wallace roof 3,500 m, tip 3,610 m. A 1.80 m person is a speck on all three whole-building panels. None of them is a toy, and Wallace is the megastructure it already was.
- **Human openings are the civic leaf.** `build_lapd` cuts `doorHalf * 2` by `doorHead` (2.2 × 2.2 m) at the 5.2 m lobby floor. `build_hall` cuts 2.2 × 2.2 m at 3.6 m. Headroom over 1.80 m is 0.40 m. LAPD's flight is 30 risers, rise 0.167 m, tread 0.30 m, run 9 m, width 30 m. The hall's flight is 20 risers, rise 0.172 m, tread 0.29 m, width 22 m. Both match `planFlight` in the civic spec. The 30 m width is a plaza stair on an 86 m podium. It is the right kind of stair for this block.
- **Pads can hold the approved spinner.** Each pad is 22 m (`HQ.pad`). The spinner is 5.45 m long and 2.32 m wide. Four pads sit on the 132 × 165 m crown. The Wallace causeway is 30 m clear (`plaza.ts`), with a human door 2.1 × 2.2 m (`COURT.doorHalfW`, `COURT.doorH`) in front of the 288 × 196 m portal. Those metres were already on main. The glTF does not replace them.
- **Marks are original geometry.** `lapd_mark` is an open chevron and a numeral 5. `hall_mark` is three nested squares and a small diamond. `wallace_mark` is three nested diamonds. No department word, no city seal, no corporate name. Keep that rule.
- **Tiers follow the graphics setting.** Ultra and high load `*-high.glb` up close (1024 maps). Medium loads the 512 file, then the low file. Low stays on the 256 file even beside the door, and does not fetch the 1024 maps. Dropping a tier swaps the child of a stable host (`createLandmarkLevels`). Colliders stay on the published boxes (`Mass` with `draw: false`).

## Per landmark

### LAPD HQ block

Silhouette, from the harness: podium 86 × 118 × 18 m, shaft 72 × 100 m, crown flaring to 132 × 165 × 62 m, roof 216 m, four 22 m pads, a 4.2 m beacon housing to 222.9 m. That is the brutalist diagram the brief asked for, and it is a different object from the box stack in the before sheet.

The entrance close-up (`lapd-close/01-night-entrance.png`) is where it stops reading as the film block. A white bar 42 m long and 1.6 m tall (`place_lamp` `band-door`) crosses the podium. Above it, the chevron-and-5 card reads as a house over a digit, on a dark plaque about 7 m wide. Under the bar, the 2.2 m door is a dark slot in the middle of the 30 m stair. The slot is the right size. The bar is a fixture. A second white bar, 52 × 2.4 m, sits on the shaft at 30 m (`band-shaft`).

Sixteen glass plates, each 3.4 m wide and 108 m tall, run the shaft (`slits_z`, `slits_x`, from y = 32). `tune_glass` emits cool blue `(0.55, 0.72, 0.92)`. The miniature's lamps are taped. These are light columns.

The top close-up is a square deck, four thin pad outlines, and four amber dashes that sit off the pad centres (`place_lamp` `pad-*` is shifted 10.2 m on Z, 18 × 0.45 m). A spinner pilot does not get a 22 m square to land on. The in-city approach (`civic-approach-night.png`) is the roof camera: a black deck, a blown white shaft, red corner lamps, and yellow pad lights. The flared crown and the vertical slots are below that camera, so the published city frame never shows the new silhouette. Those roof lights are still `beacons()` in `hq.ts`: `LightKind.Strobe` at `HQ.height + 7.2`, `LightKind.Police` on the crown corners, `LightKind.Pad` on each pad.

Apron scale is the 30 m stair and the 2.2 m leaf, plus the forecourt mesh that still paves the mall. A 5.45 m spinner on a 22 m pad is the missing scale pair. The sheet's right-hand panel is the whole block, and the figure is a speck at the base, which is the correct proportion and is not a measurement of the door.

### City Hall

Silhouette: jacket 92 × 62 × 28 m in a dark tint, shaft 34 m square to 100 m, neck to 114 m, nine square courses to 132 m, a 3.2 m shaft to 138 m. The height is the 1928 tower. The jacket is the project's layer, and the pale shaft against that jacket is visible on the harness three-quarter.

The crown close-up (`hall-close/06-rim-crown.png`) is nine coarse steps, a gold box, and one amber line (`hall-neck`, 22 × 0.7 m). The 1928 crown is a tighter ziggurat and a round top with a small lamp. This crown reads as a stepped box. High adds 1.15 m piers (`rank >= 2`). They are the right rhythm. Medium and low omit them.

Glass on high is a real storey, not a sword: four gaps per face, slot 2.85 m, pitch 3.6 m, from y = 32 to 96, plus a 0.35 m mullion. That is 288 separate glass meshes (3,456 triangles). Every pane is on, and the emission is the same cool blue as LAPD. A street sample in `civic-city-hall.png` at the shaft centre is about `(150, 161, 174)`. The real night tower is floodlit stone with dark windows. This shaft is a lit chart. The same frame's crown is two bright lamps. Those are `beacons()` in `hall.ts`: `LightKind.Warm` size 8 and `LightKind.Red` size 3.2 at `HALL.height + 1.4`, plus four warm lamps at the neck. The nine steps lose to those sprites.

The entrance is a 22 m stair, a 2.2 m door, a 16 × 0.7 m amber lintel (`hall-door`), and the concentric-square fret. People with umbrellas in the street frame are the right size against the 28 m base. The fret is quiet enough. The lintel is another bar, smaller than LAPD's.

The top close-up is a rectangle, a centered square shaft, the nine rings, a gold square, and the stair tab on one side. That tab is the flight. It belongs. There is no round drum in plan.

### Wallace Corp pyramid

Silhouette: 21 battered steps, base 3,200 m, roof 3,500 m, apex 210 m, mast to 3,610 m. `BATTER` is 0.42, so each step is a real setback, which is the gain over a smooth cone and over the flat slabs in the before sheet. The studio facade crop shows coursed blue-grey stone. At arm's length that reads as masonry.

The approach does not. `wallace-approach-dusk.png` is rain, a cream rectangle, and two dark piers. The piers are the Stage 3 pylons kept on purpose: 60 × 80 × 304 m, centered 40 m in front of the stone (`build_wallace`, "match `buildPyramid` so the beacons still sit on them"). The portal box is 0.92 of 288 × 196 m, 18 m deep, material `light-amber`. The film mouth is a cut in the slope. This one is a gate of two towers and a flat lamp.

Tier lamps (`rank >= 1`) are 6 m tall and `half_w * 0.55` long. On the north face that is about 793, 683, 574, 465, 356, 247, and 137 m from the first lit step to the last. High repeats them on all four faces. They read on the top close-up as short gold scratches in the rings. They are still hundreds of metres of emissive.

The lantern is a 210 × 210 × 76 m amber box (`PY_TOP * 0.5` by `APEX * 0.36`). The beacon on the mast is 8 × 8 × 16 m. Sunlight in the film belongs inside Wallace. An exterior lantern can be a point at the apex. A cube the size of a city block, at the same intensity as the portal, is a second sun.

Vertical joints exist only at `rank >= 2` (`wallace_joints`). Each channel is at least 42 m wide and 16 m deep, and near the base about 136 m wide. The Wētā joints are panel seams. These are slots. Medium and low skip them. Medium's body is 584 triangles, the same count as the low body. The ashlar a medium player sees is the 512 map on the coarse shell.

The human door, the eight 0.375 m risers, and the 30 m causeway stay in `plaza.ts`. They are the right apron. The scale sheet does not show them. The dusk frame's bright patches on the ground sample as warm white, about `(249, 241, 226)` and `(206, 176, 137)`, in the portal's spill. They are not a second neon carpet.

## Scale

Person 1.80 m. Civic leaf 2.2 × 2.2 m. Storey 3.6 m. Spinner 5.45 × 2.32 × 1.36 m. Lane on the turntable header is 3.5 m. The spinner critique's lane is 3.70 m. The landmark sheets do not draw either lane on a street.

| Place | What is built | Against 1.80 m and the spinner |
| --- | --- | --- |
| LAPD door cut | 2.2 × 2.2 m at y = 5.2, `build_lapd` | Headroom 0.40 m. The leaf in `hq.ts` is the same 2.2 × 2.2 (`openDoorLeaf`). |
| LAPD flight | 30 × 0.167 m, tread 0.30 m, width 30 m | A plaza stair. Risers sit in the 0.15–0.18 m band. |
| LAPD pads | 22 m square, crown 132 × 165 m | A 5.45 m spinner fits. The top view draws an 18 m dash, offset 10.2 m, instead of the square. |
| Hall door cut | 2.2 × 2.2 m at y = 3.6 | Same headroom. Street figures in the city frame fit the base. |
| Hall flight | 20 × 0.172 m, tread 0.29 m, width 22 m | Same band. |
| Wallace portal | 288 × 196 m | Monumental. About 109 person-heights. |
| Wallace human door | 2.1 × 2.2 m in `plaza.ts`, unchanged by the glTF | This is the door a person walks through. It is absent from `scale.json` (`door: null`). |
| Wallace height | 3,500 m roof, 3,610 m tip | The locked city figure. A person at the apron is invisible, which is the approach. |

`doorClearM` is the distance from one sample point to the nearest stone (`gap_at`): 0.89 m at LAPD, 1.10 m at the hall. It is the air around that point. It is not the width of the leaf. The `door` boxes in `scale.json` are literals, 2.0 × 1.90 m, and they are smaller than the cuts. The #62 table that scores every door and every stair at 9, including Wallace, is the left-hand gauge of the turntable (`person 1.8, door 2.2×1, storey 3.6, lane 3.5`). Wallace's panel prints a stair rise of 0.17 m for a mesh with `stair: null`.

No toy error. No new skyscraper error. The evidence error is that the figure, the leaf, the pad, and the spinner are never in one frame.

## Top-down honesty

The spinner rule is a real overhead beside the model's top view. A reconstruction does not count. The film overheads that do not resolve a plan stay on the sheet and out of the score. That is how [roads-spinner-2026-10-12.md](roads-spinner-2026-10-12.md) treated K's top.

#62 does the other thing.

- `artifacts/g1/lapd-iou.json`, `hall-iou.json`, and `wallace-iou.json` set `photo: false` and `topIsReconstructed: true`. The note on every view is the same: the trace is the structural envelope, the boxes the mesh is booleaned from. Side / front / top IoU lands at 0.995–1.000. A mesh compared with its own boxes will.
- `write_silhouette` in `build_landmarks.py` stores that sentence in `silhouettes/{lapd,hall,wallace}.json`. `stray.mjs` paints the protrusion mask from those parts. Protrusion 0 m is the same loop.
- The sheet's right-hand column is a perspective still, not a plan. LAPD's overhead is a dark aerial in which the block cannot be outlined. City Hall's still is a night view of the 1928 tower from the street. Wallace's still is a crop of two sloping faces and a joint. The model tops next to them are orthographic and square. Nothing in that pair is a plan against a plan.

The LAPD top that can be judged is `lapd-close/03-night-top.png`: deck wells, offset amber dashes, a nub for the mast. The hall top is `hall-close/03-night-top.png`: rectangle, nine rings, gold square. The Wallace top is `wallace-close/03-night-top.png`: concentric squares, gold scratches, a small porch tab where the pylons pass the base. Those are model views. They are not a film comparison.

## Stray, protrusion, and the blind close-up

`npm run stray` on this branch uses the construction envelope, dilated 0.55 m. Civic touch stays 2 cm. Wallace touch is 8 cm, for 16-bit snap on a 3.6 km mesh. The orthographic cell on Wallace is 4.03 m, and the justified fringe is 8.06 m (`silhouettes/wallace.json`). A plate inside that fringe passes. Lamps are left out of the outline, so the portal, the tier bars, and the crown cube are invisible to the protrusion test.

The gate can pass and the close-up can still fail. Standing in the entrance crop, the parts that do not belong:

- The 42 m white bar and the 52 m shaft bar on LAPD. They are on the wall, so they are not loose islands. They are the wrong object.
- The chevron-and-5 plaque. It is seated (`place_decal` lift −0.03, card thickness 0.004 scaled on Z). It reads as a badge. The brief forbids a department wordmark. This is not that wordmark. It still reads as a sign on a bunker that should be bare concrete.
- The hall's gold box and the amber neck line. The box is the lamp housing (3.2 m). The line is a second fixture across the crown.
- Wallace's flat portal, the two pylons, and the 210 m lantern cube. The pylons are in the silhouette, so protrusion stays 0. A blind critic sees a gate, not a mouth cut in stone.
- Thin amber dashes on the LAPD roof, off the pad squares. Thickness is the lamp strip (0.45 m tall in the kit call). They read as scratches on the deck.

Rails are booleaned into the stair shell (15 cm into the treads) so they are not a second mesh. That part of the stray work holds. Fins and vents exist only at `rank >= 2` and sit on the entrance face. They are small against the bars.

## Lighting

Night rain in the city frames is the L1 night: grey rain, dark ground, a few sources. The landmark materials do not join that exposure.

`dressMaterial` in `authoredModel.ts` builds a `MeshStandardNodeMaterial` per glTF material. Anything named `light-*` gets `emissiveIntensity` at least 3.5, and `light-white` is pushed to `(1.55, 1.48, 1.32)`. Glass gets a cool emissive `(0.42, 0.58, 0.78)` at intensity 0.55, on top of the Blender emission in `tune_glass`. These values are not candela, nits, or kelvin, and they do not pass `checkPunctual`. L1's bloom starts at 32 nits, with windows at 18 nits and lamp heads at 16 ([lighting-l1-2026-10-12.md](lighting-l1-2026-10-12.md)). A 42 m bar at intensity 3.5 is a different sun. The entrance close-up shows that bar clipped white. The roof approach shows the district strobe clipped white on top of it.

Practicals that would match the film, and that this pass should keep small:

- Pad edges on the 22 m squares, dim amber, one strip per edge, inside the pad, under the 32-nit bloom.
- A housed beacon on the LAPD crown, the 4.2 m box that is already in the shell, with a lamp that does not blow the deck.
- A few warm slits on the hall shaft, most bays dark. Stone stays the brighter read.
- The Wallace mouth, warm, recessed, and the only large source. Apex light as a point on the mast, not a 210 m cube.
- The plaza lamp heads already use `NITS.lampHead` (`lampHeads` in `plaza.ts`). Leave that path. Do not add a second emissive for the same practical.

`beacons()` in `hq.ts` and `hall.ts` still runs after the glTF is parented. The city frames are those calls plus the mesh bars. One of the two has to go. The mesh is the picture #62 promised. The strobe, the police corners, and the hall's pair of crown sprites are the picture the cameras still take.

## Tier honesty

| Tier | What is in the file | What breaks the film read |
| --- | --- | --- |
| Ultra, high | Full shell, 1024 maps. LAPD slits, both white bars, vents, decal. Hall piers, 288 panes, fret. Wallace joints, four-sided tier bars, diamond. | The neon and the cool chart are fully present. This is the tier the sheets judge. |
| Medium | 512 maps. LAPD keeps the slits and both bars, drops vents, seams, and the decal (`rank >= 2`). Hall keeps glass at pitch 7.2 m and both amber bars, drops piers, courses, and the fret. Wallace keeps the north bars only (seven of them), the portal, and the lantern. Body triangle count matches low. | LAPD without the badge is closer to bare concrete, and it still has the 42 m bar. The hall loses the piers, so the panes sit on a flat shaft. Wallace loses the joints that were the miniature. |
| Low | 256 maps, one body mesh for LAPD (700 tris) and the hall (672 tris). Stairs, door cuts, the flared crown, and the nine hall courses stay, because they are in the shell at `rank` 0. No glass, no bars, no decals. Wallace low keeps the shell, the portal, the lantern, and the mast beacon (620 tris). | LAPD becomes a dark flared block with no slots and no pads drawn in light. The hall keeps the jacket-versus-shaft tint in vertex colour, and loses the bays. Wallace low still presents the flat mouth and the crown cube at intensity ≥ 3.5. The identifying dress is gone. The bloom is not. |

Low is allowed to be lighter. It is not allowed to keep only the mistake. A low Wallace that is the stepped shell, with the mouth dimmed to one practical and the lantern reduced to the mast point, still reads as the pyramid. A low LAPD that is the flared crown and the pads, with the bars omitted, still reads as the block.

City Hall high is 306 meshes because each pane, mullion, and lamp is its own primitive. Merging the glass into one mesh per face is a draw-call fix. It does not change the cool-chart read until the emission does.

## Ranked fix list

One follow-up, G1b or an R-pass, on the landmark branch after it rebases onto current `main`. Stay inside the files named here. Leave `src/lighting/**`, the tower recipes, the spinner glBs, the human rigs, the smoke field, and `tests/visual` alone. Rebake the existing trim sheets in `paint_landmark_maps.py`. Do not add a second uncompressed texture beside the KTX2 or JPEG already in the glB. Do not commit a film still.

### 1. Remove the neon bars and the cool full-height glass

`build_lapd`: delete the `place_lamp` calls `band-door` (42 × 1.6 m, white) and `band-shaft` (52 × 2.4 m, white). Replace `slits_z` / `slits_x` (3.4 × 108 m) with short recesses in the reveals `lapd_reveals` already cuts, most of them unlit. A lit slit, if one stays, is a few storeys of warm glass, not a 108 m column.

`tune_glass`: drop the cool emission `(0.55, 0.72, 0.92)`. A dark pane with a warm tint on the few that are on matches the taped miniature. `dressMaterial` should stop adding a second cool emissive on `glass`.

`build_wallace`: delete the `tier-*` lamps, or cut `length = half_w * 0.55` down to a human-scale practical (a few metres) on the upper steps only. Shrink the `lantern` box from 210 × 76 m to the mast bay that already exists (`beacon`, 8 × 8 × 16 m). Keep one warm source at the mouth.

### 2. One light rig on the roof

`beacons()` in `src/districts/civic-center/hq.ts` still adds `LightKind.Strobe`, `LightKind.Police`, `LightKind.Pad`, `LightKind.Steady`, and `LightKind.Warm`. `beacons()` in `hall.ts` still adds the warm/red pair at `HALL.height + 1.4` and four warm lamps at the neck. The in-city frames are these sprites. After the mesh owns the pads and the housed beacon, stop calling the duplicates. Any lamp that remains goes through the lighting registry as nits, under the 32-nit bloom, the way `lampHeads` in `plaza.ts` already uses `NITS.lampHead`.

In `authoredModel.ts`, remove the `Math.max(..., 3.5)` floor and the `LAMP` colours above 1. `light-white` at `(1.55, 1.48, 1.32)` is the clipped bar in the entrance close-up.

### 3. Put the Wallace mouth in the stone

`build_wallace`: the pylons at `-(half + 40)`, 60 × 80 × 304 m, and the lintel, are the two towers in `wallace-approach-dusk.png`. Inset the portal in the battered face. Keep a frame deep enough to read (the current box is 18 m deep). Drop the emissive to a mouth that does not clip. The diamond decal (`place_decal` `diamond`, high only) can stay if it sits on that frame.

The human door in `plaza.ts` (`COURT.doorHalfW` 1.05, `COURT.doorH` 2.2, eight risers of 0.375 m) stays the walk-in scale. Do not scale it to the portal.

### 4. Make the hall crown the 1928 crown

`build_hall`: the nine boxes from `neckTop` (114 m) to `pyramidTop` (132 m), then a 5.5 m block and a 3.2 m shaft, read as a voxel. Tighten the courses and add a drum under the lamp, still original geometry, no copied sculpture. Keep the dark jacket (`tint_hall` below y ≈ 27) and the pale shaft.

`curtain_z` / `curtain_x`: keep the four bays. Light a small fraction of the panes, warm, and leave the rest dark so the limestone is the read. Medium currently omits the piers (`rank >= 2`) and doubles the pitch. If medium is a setting people use, the piers have to exist there too, or the bays have no stone between them.

### 5. Replace the circular top score with a real overhead, or stop quoting it

`write_silhouette` and `artifacts/g1/*-iou.json` document `topIsReconstructed: true`. Leave that flag. Do not cite 0.99 as film overlap.

The next contact sheet needs a plan-capable overhead beside `night · top` / `rim · top` for each building. If no published ortho exists, say so in the sheet and do not invent one. Perspective stills can sit on a side column the way the spinner film overheads do. They do not enter `iou.py`. The stills stay gitignored under `tools/model-harness/.refs/`. The copies baked into `artifacts/g1/*-after.png` on #62 should not be duplicated into `docs/`.

### 6. Photograph the scale that is already built

Retake `MODE=scale` with the 1.80 m figure standing in the LAPD cut and the hall cut, and on the Wallace plinth beside the `plaza.ts` door. Park the shipping spinner (5.45 m) on one 22 m pad and on the 30 m causeway. Delete the Wallace stair from the gauge. The left panel printing rise 0.17 m for a mesh with no flight is what produced the 9s.

Fix the `door` literal in `build_lapd` / `build_hall` so `scale.json` matches the 2.2 × 2.2 cut. Count triangles after export, not in `count_tris()` before `bake_meshes`. The resident counts are 2,704 / 2,268 / 700, 5,216 / 2,660 / 672, and 7,536 / 788 / 620.

### 7. Low keeps the silhouette and drops the bloom

`RANK['low']` is 0, and `landmarkChain('low')` never loads another file. That can stay.

Low LAPD should still show the flare, the pads, and the door cut, with no white bars (those are already `rank >= 1`). Low hall should still show jacket, shaft, and the stepped crown. Low Wallace should keep the steps and a dim mouth, and should drop the 210 m lantern cube that `build_wallace` currently emits at every rank. Medium Wallace needs a joint read that is cheaper than `wallace_joints` (the high boolean). The 584-triangle body is the coarse stair from the before sheet, plus a texture.

### 8. Seat the LAPD mark, or leave the concrete bare

`lapd_mark` in `paint_landmark_maps.py` is a chevron over a block 5. In `lapd-close/01-night-entrance.png` it reads as a house over a digit, on a plaque at y = 14.5. Either redraw the 5 so the entrance camera cannot call it an S, and sink the card into the podium, or omit the decal on the hero face and keep the atlas phrases already placed in `hq.ts` (`phraseSeed(39)`, `BASELINE`, `PAPER ONLY`). Do not add a department wordmark.

## What this pass did not do

No new capture, no Blender run, no `npm run stray` re-execution. Protrusion 0 m is taken from the #62 description and from the silhouette source that makes that result inevitable. In-city frames were read as published; the roof camera, the hall street camera, and the dusk portal camera are the three views #62 calls the district proof. A G1b that moves a lamp should reshoot those three, plus an eye-height shot on the LAPD stair and a top orthographic next to a real overhead.
