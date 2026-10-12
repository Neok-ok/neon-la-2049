# H1 humans — film critique

12 October 2026. Draft PR #53, `cursor/h1-human-models-4a3e` at `91e6c91`. The 1.80 m person is the standard in [docs/audit/scale-2026-10-11.md](../audit/scale-2026-10-11.md) on `main` at `2a10c95`. The night those people stand in is L1 (bloom opens at 32 nits). Docs only. No game code, no film frames, no logos.

**Overall: 5/10.** The crowd is a 1.80 m coat on the sidewalk in the rain, with a colored umbrella, and that replaces the box people. In the night frames the body is a mannequin: a banded can for a head, a light-gray tube for each leg, and one dark coat repeated down the block. The Veil House figure is a giant pink crystal in the canyon, scanlines and rain included, and the diamond head, the raised hand, and the three skirts do not separate.

## Scores

| Check | Score | Read |
| --- | ---: | --- |
| Reads as rainy neon street people | 5 | Umbrellas and dark coats at city scale. The head, the legs, and the repeated row are a mannequin. |
| Base pedestrian mesh and rig | 5 | Crown, shoulders, and hems match the plate. The volume is still a block head, a tube coat, and stick limbs. |
| Crowd LODs | 4 | Medium and ultra are the same mannequin. Low has a score and no night frame. |
| Veil House dancer | 5 | Pink, huge, scanned, in the rain. One crystal. The pose the plate asked for does not survive the street. |
| District placement | 6 | The framed walkers stand on the building side of the lane paint. A row of four is one person copied. |
| Scale against a 1.80 m person | 7 | Authored crown 1.80 m, sidewalk lift matches the curb, the canyon figure is the 60 m class. The scale frame has no car. |
| Motion and pose | 5 | A side view is a stride. A back view is a column with a hole at the hem. Arms are stubs. |
| Materials and night readability | 4 | Flat emissive cloth. Legs and the umbrella shaft are the brightest parts of the person. |
| Harness honesty | 4 | Plate IoU is real and narrow. Protrusion, loose parts, and a blind critic were not run. |

## How this was looked at

Night-rain stills on the H1 branch, `docs/humans/after/`, desktop 1280×720, time 22.5, frozen rain, UI hidden. Ultra and medium. The capture script (`scripts/capture-human-frames.mjs`) boots `?mode=walk&weather=rain&freeze=1` and refuses the page unless the loaded crowd mesh is between 1.5 m and 3 m tall. Before cells are `docs/humans/before/`. Harness sheets are `tools/human-harness/sheets/`.

Street frames read for this note: the market, historic core, DTLA, civic steps, K, the financial street, the basin, the doorway scale shot, Broadway dancer, Hollywood dancer. The other district frames in that folder are the same night and the same body.

Code read on `91e6c91`: `tools/human-harness/lib/crowd.py`, `dancer.py`, `gait.py`, `score.py`, `src/world/humans/crowdRig.ts`, `dancerHero.ts`, `src/districts/little-tokyo-market/crowd.ts` (`placeOnWalk`, `styleOf`, `coatOf`), `src/world/holograms/material.ts` (`veilDancer`), `src/roads/profile.ts`, `src/roads/buildChunk.ts`.

Published accounts, used as the street. No frames from the film are in this commit. Dennis Gassner’s brief for the city was brutality and scale. The street crowd in the film is dark, wet, and small against the signs; umbrellas carry the color; faces disappear into weather and backlight. The giant pink canyon advertisement is described by DNEG and by the vfxblog piece already linked from [docs/models/dancer/references.md](../models/dancer/references.md): rain through the figure, pink on the street, a person at the feet. This repo’s own plate refuses a likeness and asks for a geometric dancer (diamond head, three skirt steps, one arm up, a veil). Both tests apply. A crystal spire can be huge and pink and still miss the dancer.

## What works

Keep these.

- **The box crowd is gone in the after frames.** `docs/humans/before/market-crowd.png` is a pale box torso and a cube head. The after market is a coat, a walk, and umbrellas. That is the pass doing its job.
- **The metres match the person standard.** High-mesh crown 1.80 m, soles at 0, head 0.23 m (1/7.83), shoulders 0.48 m at 1.48 m, long hem 0.74 m, short hem 0.96 m. Instance crowns are `1.55 + u * 0.36` (1.55–1.91 m) with uniform scale `height / 1.80` in `CrowdField`. Hats add 0.12 m on the 1.80 m mesh and then scale with the body. A hatted tall instance is about 2.04 m. That still fits a 2.0–2.4 m door. The frames show person-sized figures.
- **Feet use the sidewalk height.** `WALK_LIFT` is `ROAD_LIFT + CURB_H` (0.012 + 0.15 = 0.162 m). The walk ribbon in `buildChunk.ts` is at the same `yW`. `groundHeight` is terrain (`heightAt`), so the lift puts the sole on the slab. Close frames show shoes on the walk.
- **The dancer envelope is the canyon figure.** The high mesh bounds are y 0–64.4 m, width 13.5 m, depth 1.8 m. The plate asked for a raised hand at 64.4 m, a middle skirt of 13.2 m, and depth at most 1.8 m. Hollywood’s 24 m quad letterboxes that 15 m figure in `veilDancer` (`uFig` divides by 15). The plate crown is 59.5 m, about 33 times a 1.80 m person, and the mesh’s highest vertex is the raised hand at 64.4 m, about 36 times. That is the billboard. The scale audit’s 68 m hologram row stays the right category: a canyon advertisement, measured against a person at the hem.
- **Umbrella canopies are the color in the rain.** Eight canopy colors, and the street frames use them (cyan, amber, magenta). The roof has height, so it reads at eye level. A flat disc would have vanished. This is the part a stranger would call 2049.
- **The walk is a stride when the camera is beside them.** Civic, historic core, the basin, and the doorway shot all show one leg forward. Bind is a stand. There is no T-pose in the frames.

## Per subject

### Base pedestrian

The high body is one lofted plate: head, neck, arms, legs, a long coat, and the outfit parts that the shader collapses (`hood`, `hat`, `bag`, `shortCoat`, umbrella, respirator). Triangle count on the shipping file is 1,664 (`crowd-high.glb`, `docs/humans/after/memory-ultra.json`, `sheets/scores.json`). Medium is 1,424. Low is 852.

The front plate match is tight. On the high overlap sheet the stand view is 0.7% plate-only and 0.8% mesh-only. The silhouette a stranger sees is still the plate itself: a rectangular head, a trapezoid coat, and two sticks. Matching that outline at 0.983 means the mesh is that block.

The head loft is a few stations of a square tube. In the market, on K, and on the civic steps it reads as a can, often with horizontal bands, like louvers. Hats are 22% and hoods are 32% (`styleOf`). The bare can is the common head. The respirator is a 9 cm box on the chin (`crowd.py`, part 16). It does not break the can into a face, and the plate forbids a face. The follow-up is a smoother volume or a hood, with the face still blank.

The back of a near figure in the market ultra frame is a coat tube with a dark vertical slot and an open hem. Pale legs come out of the hole. `crowdRig.ts` already blends the hem from the coat bone onto the thigh (`smoothstep(0.74, 1.08, y)`) because a hard cut was opening a gap. The gap is still the read from behind.

Arms hang as short separate tubes. From above, the high mesh is 0.64 m across once the arms are included and 0.48 m across the coat. Those side lumps are the sleeves. They are small. They are the top-view “fins,” and they belong to the body.

### Crowd LODs

Ultra uses the high file. Medium uses 1,424 triangles. The street difference between those two frames is noise and bloom (medium sets `bloom: false` in `src/core/quality.ts`). The person is the same mannequin.

Low is 852 triangles, stand IoU 0.983, and the pose reach is 0, so low freezes the stand and slides it. There is no low night frame in `docs/humans/after/`. The low score is a plate match, and the street read is unverified.

Legs are 744 of the 1,664 high triangles (372 a leg). `_leg_wafers` drops a disk every 5 cm so a shin pointed at the camera still has a surface. On the harness walk strip those disks read as gray bands on one shin and a large flat foot, while the other leg stays a dark stick. The night frames hide the bands under the pale-leg emissive. The triangles are paying for a fix the shader then paints over.

People past the crowd radius are not drawn (88 m ultra, 64 m medium, 48 m low). The 200 m card in `sheets/crowd-impostor-200m.png` stays a harness sheet. That limit is correct.

### Veil House dancer

High is 4,384 triangles, medium 1,656, low 320. The low file is the mask source for the far quad. The hero mesh is one extra draw, hidden past 82 m (`DancerHero.update`), and its color fades in from 80 m to 24 m. The quad hands its near slice to that mesh (`veilDancer` multiplies the quad body by `1 - close`) and keeps the ghost slices.

The harness front is the plate: diamond head, one arm up, a pinched waist, a diamond skirt, and a separate vertical bar on the figure’s left. That bar is the veil loft (`DANCER_BIND['veil']`). On the orthographic sheet it stands off the body like a pole. The side sheet is a 13 px blade on a 579 px height, which is the 1.8 m depth on a 64 m figure. The plate asked for that blade. A street three-quarter has to carry the pose, because the pure side is a line.

The street does not carry it.

- Broadway ultra, camera 42 m out looking at `hem + 0.28 * height` (`frameDancer`). The frame is one pink faceted spire, scanlines sliding, rain in front. The pointed end is the hem. The diamond head and the raised hand are not a separate read. A person at the feet is not in the shot.
- Hollywood ultra, same distance, 24 m panel. A waist pinch shows, and the crown has a notch that can be read as head plus raised arm. The skirt is still one diamond. The three chevron steps from the look-target have merged. Scanlines and the pink canyon are the part that matches the advertisement. The body matches a crystal.

`build_dancer` lofts `DANCER_BIND['body']` as one shell, then the arms and the veil. The skirt steps are changes in that shell’s width. Under additive scan they close into one gem. The look-target says gaps are holes in the shell. The mesh does not leave those holes.

Authored sway (`sway_offsets`) moves the head ±5.1 m and the hip ±3.2 m. The plate asked for ±1.1 m and ±0.55 m. Neighboring skirt bones differ by up to 0.90 m (`skirtL` against `skirtM`). Rain streaks cover the whole dancer frame, so this review cannot measure that sway in pixels. The number is in the code. The picture does not prove a dance.

### District placement

`placeOnWalk` pulls a point on the asphalt or the curb onto the walk on the same side, past the lamp line (`curbOuter + lamp + 0.28`). Points past the building line stay put. Vendors skip the snap. Crossing loops stay in the graph and are not assigned.

| Place | Ultra night frame | What a stranger gets |
| --- | --- | --- |
| Little Tokyo market | Close back, then a loose crowd and umbrellas | A person. The hem is a hole. Heads are cans. |
| Historic core | Four walkers on the building side of the white lane line | The same coat, the same can, the same stride. Umbrella color is the only difference. |
| DTLA | Three umbrella figures on a dark street | The right size against the wall. Legs are the bright part. |
| Civic steps | One stride in the foreground, a small crowd behind | The walk reads. A pink rim outlines the coat. |
| K | Two coats, one pale and one dark, under canopies | The rare pale coat shows. Heads are louvered blocks. |
| Financial | One small figure under the lease signs | Small against the signs, which is the right relationship. The ground is a bright plane. |
| Basin | One umbrella on a dark block | A single extra. The scale is human next to a lit window. |
| Doorway scale shot | One umbrella beside a lit opening | Human next to that opening. No car in the frame. The shaft is a lamp. |

Wallace, the coastal strip, LAX, and the hills still have no `registerCrowdSource`. The scale audit already marked that empty. This pass did not claim them. The nineteen districts in `docs/humans/after/` are the ones that already had people.

The historic row is the placement failure that matters. The rates in `styleOf` exist (hood 32%, hat 22%, bag 22%, short coat about 19% when there is no hood). On that sidewalk they do not show. Four people read as one mold.

## Scale

| Mark | Measured on the branch | Standard |
| --- | --- | --- |
| Crown, median mesh | 1.80 m | `HUMAN.height` / scale audit 1.80 m |
| Instance crown | 1.55–1.91 m, uniform scale | Same band the pedestrian plate asked for |
| Hat on the median | +0.12 m, crown 1.92 m | Scale audit already watches 1.92 m as “a hat may add a little” |
| Shoulders | 0.48 m coat, 0.64 m with arms | Plate 0.48 m, cloth to 0.52 m on the short coat |
| Head | 0.16 m wide, 0.23 m tall | Plate, 1/7.83 |
| Long hem / short hem | 0.74 m / 0.96 m | Plate. Calves stay clear of the long hem |
| Sidewalk sole | terrain + 0.162 m | Walk surface is terrain + 0.162 m |
| Lane | 3.6 m painted module on `main`’s roads | A 0.48 m shoulder is a fraction of a lane. The historic frames agree |
| Dancer | 64.4 m to the hand, 13.5 m wide, 1.8 m deep | Plate 64.4 / 13.2 / 1.8. Crown about 33× a person; the hand about 36× |
| Door in the scale shot | A lit market opening beside the figure | The figure’s head sits with that opening. It is a person-sized extra |

No frame shows a toy crowd or a giant pedestrian. The doorway file is named `scale-door-car-ultra.png`. The capture hunts a ground car within 2.4–14 m of a person and then aims the lens. The picture that landed has the person and the opening. The car is not in it. Car-to-person scale is not demonstrated. The compact car on `main` is still the short roof from the scale audit; this pass did not retake that comparison.

A 1.55 m instance beside a 1.91 m instance would be visible in a queue. The historic row does not show that spread. The scale code is right. The row hides it.

## Motion and pose

Clips in the palette: `stand`, `walk`, `walkNarrow`, `walkWide`, `umbrellaIdle`, `umbrellaWalk`, `queue`, `gaze`, `vendor`. Sixteen frames. Reach is 0 / 28 / 48 / 72 m from low to ultra. Past that, and on low, the pose is the bind.

The harness plant, 64 samples, reports sole error 0, penetration 0, float 0, bob 0.0176 m, stance knee about 11–35°, swing knee about 73°, elbow about 39°. The street agrees with the part of that which is a stride: the back foot is down, the front foot is out, the body bobs too little to see.

What the street adds:

- From the side the coat stays a rigid trapezoid. The hem does not swing. The legs do.
- From behind, the hem opens and one pale leg reads as a separate object under the coat.
- Arms barely leave the coat. The umbrella hand is a pose. The dry arm swing is a stub.
- `queue`, `gaze`, and `vendor` are in the palette. The district frames used here are walkers. Those three idles are not shown.

The walk strip’s banded shin is the wafer stack under single-bone harness skinning. The game blends the knee across both bones (`paletteSkinWeighted` in `crowdRig.ts`). That blend is why the night shin is one tube. It is also why the tube can open a hole at the hem while the frames mix. The hole is the motion bug to fix. The stride can stay.

## Materials and lighting

The crowd material is `MeshStandardNodeMaterial` (`CrowdRig`): fog on, double-sided, an atlas weave multiply, wet roughness, a wrap term on skin, and an emissive form light `albedo * (0.34 + 0.28 * night)`. At night that factor is 0.62. The nine `COATS` values run from 0.045 to 0.16. After the night multiply they sit in a tight black. The two rare pales (4% off-white, 3% pale) are the coats that separate, and K’s light coat is one of them. The historic row is the black.

Three lights on the person are doing the wrong job.

- **Legs.** Pants albedo is `(0.74, 0.72, 0.76)`, plus an emissive add of `(0.5, 0.48, 0.52)` on `isLeg`, with a comment that a darker thigh was disappearing into the pavement. The cure is brighter than the coat. Every close frame shows light-gray legs under a black coat. That is the mannequin.
- **Shaft.** Shaft color `(1.00, 0.74, 0.38)` is multiplied by `1.4 + night * 0.55`. On ultra, where bloom is on, the doorway shot and the historic row draw that shaft as a white line through the body. The dancer path already treats 1.0 as the bloom threshold and stays under it. The shaft does not.
- **Rim.** `vec3(0.95, 0.22, 0.55)` times a night rim of 0.2. The civic foreground has a pink contour on the coat. Sign spill in this city dies on the sign face (the L1 critique). A magenta outline painted on every extra is a different light, and it reads as a sticker.

Skin is three scaled versions of `(0.55, 0.42, 0.34)`, plus a constant scatter. There is no face map. That limit is right. The head still fails, because the can’s rings catch the rim before any skin tone can matter.

Wetness darkens cloth to about 0.62 and drops roughness. In the frames the coat stays a flat dark shape. The rain reads in the streaks and on the umbrellas. It does not read as wet wool.

The dancer is additive pink `(1, 0.18, 0.55)`, scan lines, flicker, and `authoredLiftU`. The hero comment says an earlier gain clipped the 68 m figure to a white diamond, and the current multiply (0.8, and the quad’s 0.4) is there to stay under bloom. The street figure is pink, and it is still one gem. Scanlines are working. They are also what welds the skirt steps together.

## Harness honesty

Quoted from `tools/human-harness/sheets/scores.json` on `91e6c91`. These are the file’s numbers.

Crowd IoU (gate in the pedestrian plan: front 0.82, side 0.75):

| LOD | Triangles | Stand | Short | Rain | Side |
| --- | ---: | ---: | ---: | ---: | ---: |
| Low | 852 | 0.9826 | 0.8513 | 0.9811 | 0.9556 |
| Medium | 1,424 | 0.9832 | 0.8522 | 0.9783 | 0.9576 |
| High | 1,664 | 0.9832 | 0.8522 | 0.9696 | 0.9568 |

Dancer IoU:

| LOD | Triangles | Front | Side |
| --- | ---: | ---: | ---: |
| Low | 320 | 0.9665 | 0.9342 |
| Medium | 1,656 | 0.9779 | 0.9115 |
| High | 4,384 | 0.9771 | 0.9170 |

High-mesh plant, same file: sole error 0, penetration 0, float 0, bob 0.01764 m, pelvis y 0.938–0.956 m, stance knee 10.93–34.54°, swing knee 72.69°, elbow 39.26°.

`docs/humans/after/memory-ultra.json` and `memory-medium.json` repeat the triangle counts (ultra crowd 1,664 and dancer 4,384; medium crowd 1,424 and dancer 1,656) and the byte totals (ultra 1,874,968, medium 1,815,216) on the PNG path. The glTF index counts match those triangle numbers. The PR description’s medium-856 and high-1,096 triangle table does not match these files. Quote the JSON.

What the score does well: the stand, rain, and side plates are actually filled. Short is the miss, and it still clears 0.82. On the high short overlap, about 12% of the union is plate-only red, sitting on the hip band, and about 3% is mesh-only green at the shoulders. The short coat is narrower through the hip than its own plate.

What the score cannot say:

- `anthropometry()` in `score.py` writes `hip_pivot_m: 0.96` and `knee_pivot_m: 0.45` as literals. Stature, head, shoulders, and hems are measured off the vertices. Hip and knee in `scores.json` are the constants the solver was given.
- `measure_plant` scores the contact sample inside the same gait solver that plants the foot. It is a self-check of that sample. It does not look at the skinned hem hole in the street frame.
- IoU is the mesh against `docs/models/pedestrians/silhouette.svg` and `docs/models/dancer/silhouette.svg`, the plates this harness drew. A 0.983 stand score is agreement with that block. It is silent on the can head and the pale legs.
- `tools/model-harness/scripts/stray.mjs` and the blind critic under `tools/model-harness/reviews/` cover the spinner, the car, and the hauler. A search of that tree finds no human glb, no human whitelist entry, and no `roundN-critic.md` for this pass. `render_views.py` says the sheets are for the critic rounds. The rounds were not written down. Protrusion, loose islands, and thin spikes were not reported, so they cannot be quoted.

This review’s own look at the sheets, labeled as such and separate from the JSON: the dancer veil reads as a detached bar on the harness front; the walk strip’s forward shin is a stack of bright bands; the top view’s side lumps measure as the arms (body width 0.64 m including them). Those are the stray-part questions a later critic round should answer on `crowd-high.glb` and `dancer-high.glb`.

## What does not belong

A stranger’s list, from the frames and the sheets.

- A tin-can head with horizontal rings, on the market, on K, and on the civic steps.
- Light-gray legs under a black coat, on every close street frame.
- A white line where the umbrella shaft should be, on ultra (the doorway shot, the historic row).
- A pink contour stuck to the coat edge (civic foreground, and the neon turntable).
- An open hem and a dark slot in the back of the coat (market, close).
- Four copies of one person on the historic sidewalk. Umbrella color changes. The body does not.
- A pole standing off the dancer’s left side on the harness front (the veil).
- One pink crystal filling Broadway, where the plate has a head, an arm, and three skirt steps.
- The short-coat hip, red on its own overlap sheet: cloth the plate asked for and the mesh does not cover.

Sleeves account for the width past the coat. Street frames keep the limbs on the body. The pose in those frames is a stand or a stride. The crowd stays one instanced draw, plus the single dancer hero.

## Ranked fixes for H1b

In order. Each one is a file that is already on `91e6c91`.

1. **Darken the legs until they belong to the coat.** `crowdRig.ts`, the pants albedo `(0.74, 0.72, 0.76)` and the `isLeg` emissive add `(0.5, 0.48, 0.52)`. Keep them lighter than the night pavement, which is why the add exists, and keep them darker than the coat highlight. The close market, historic, civic, and doorway frames are the test. The leg should disappear into the coat at 30 m.

2. **Put the umbrella shaft under the bloom threshold.** Same file, `shaftCol.mul(1.4 + night * 0.55)` with `(1.00, 0.74, 0.38)`. The dancer hero already clamps itself so a 68 m figure stays pink. The shaft should stay an amber rod. Ultra doorway and historic core are the test. Medium can stay as it is: `quality.ts` has bloom off there.

3. **Replace the can head with one blank volume.** `tools/human-harness/lib/crowd.py`, the head loft in `_body`, and the hat crown loft. The rings are the stations. A hood on more than the current 32% (`styleOf` in `little-tokyo-market/crowd.ts`) will hide a bare head, and the bare head still has to be one mass when the hood is off. Keep that mass blank. K and the market close-up are the test.

4. **Close the hem, and fill the short-coat hip.** The blend in `crowdRig.ts` (`hem`, `hemThigh`, `paletteSkinWeighted`) still leaves a hole from behind. The short plate’s red hip band is the loft of `SHORT['coat']` in `_clothes`. Double-sided drawing is on because that blend flips faces; once the hem is one surface, the interior slot should go with it. Re-score the short view. It is 0.852 today, and the picture is the red band.

5. **Cut the dancer’s skirt into three steps and keep the raised hand.** `tools/human-harness/lib/dancer.py`, `build_dancer`. The body is one loft of `DANCER_BIND['body']`, so additive scan in `veilDancer` and `heroMaterial` welds it into the crystal on Broadway and Hollywood. The look-target’s gaps are holes. Leave the panel size, the pink, the 64.4 m hand, and the letterbox. The next contact sheet needs a 1.80 m person at the hem. `frameDancer` at 42 m looking at `hem + 0.28 * h` crops that test out.

6. **Make four people on one sidewalk four people.** `COATS` in `crowd.ts` is nine colors from 0.045 to 0.16, and the night factor 0.62 turns them into one black. Spread those nine so they separate at 30 m, and let hood, hat, and short coat show in a row the way `styleOf` already rolls them. The historic-core ultra frame is the test. Stride scales 0.92 / 1.00 / 1.08 are already in the instance. The row should show the height spread 1.55–1.91 m as well.

7. **Drop the magenta rim, or feed it from a real sign.** `crowdRig.ts`, the rim term `vec3(0.95, 0.22, 0.55)`. L1 already keeps sign color on the sign. A contour on every coat fights that. The civic foreground is the test.

8. **Retire the leg wafers once the shin is one dark surface.** `_leg_wafers` and `_knee_ball` in `crowd.py` are 744 triangles on the high body and the bands on `sheets/crowd-walk-strip.png`. They were added so an end-on shin would not vanish. Fix 1 is the cheaper way to keep the shin. If a shin still vanishes after that, one disk at the knee is enough.

9. **Run a stray and blind pass, and stop quoting the stale triangle table.** Point `tools/model-harness/scripts/stray.mjs` at `public/models/humans/crowd-high.glb` and `dancer-high.glb`, or write the equivalent report under `tools/human-harness/`. The questions are the veil bar, the hem hole, and the walk-strip shin. Write the critic from the street frames, with the plate IoU beside it. Update the PR memory table to the JSON that is already in `docs/humans/after/`: high crowd 1,664 triangles and 38,656 geometry bytes, medium crowd 1,424 and 33,520.

10. **Reshoot the doorway with the car in frame.** `scaleShot` in `scripts/capture-human-frames.mjs` already searches for a ground car. `scale-door-car-ultra.png` does not contain one. The person-to-opening read can stay. The person-to-car read is the missing scale proof. Lane width is 3.6 m. The figure should be obviously shorter than a car roof is long, and obviously taller than that roof is high, once the car from the scale audit is actually in the picture.
