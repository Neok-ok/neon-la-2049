# Model harness

Reusable path for a vehicle: gather comparison stills, model it in headless Blender, export a meshopt glTF with PBR maps, and judge it from a contact sheet, an overlap score, a blind critic, and a scale rig. The pilot is the player's spinner. Traffic cars and police variants should reuse these steps rather than inventing a second review path.

Traffic does not use these files. NPC spinners stay on the merged shell in `src/vehicles/spinnerModel.ts` (`spinnerGeometries` / `spinnerMaterials`). Only the craft the player flies loads `public/models/spinner/spinner-{high,medium,low}.glb`.

## 1. Reference board

`refs/manifest.json` lists the stills and what not to copy (wordmarks, drum graphics, plates). The pixels stay out of git:

```bash
python3 tools/model-harness/scripts/fetch_refs.py
```

That writes `tools/model-harness/.refs/`, which is gitignored and is not part of the production build. `npm run dev` serves them at `/harness-refs/` for the contact sheet only.

The top outline in `silhouettes/k-spinner.json` is traced from the published top orthographic (`top-plan`), including the open nose channel. Two film frames sit beside it: `top-flight` (opening, near-overhead) and `top-roof` (LAPD roof, the parked spinner is only its lamps). Neither film frame resolves a plan, so they are on the sheet and not the traced polygon. The old top number was a reconstruction and is not comparable.

## 2. Build

Blender 4.0 or newer, and [gltfpack 1.1](https://github.com/zeux/meshoptimizer/releases/tag/v1.1) on `PATH` (the same meshopt version three.js decodes). Apt Blender has no Draco library, so the export is meshopt, not Draco.

```bash
blender --background --python tools/model-harness/blender/build_spinner.py -- \
  --round 12 --lod all --out public/models/spinner
```

`--lod high` (or `medium` / `low`) with `--out` a file path writes one glTF. `--round` is the critic cut:

| Round | What the script builds |
|---|---|
| 1 | Wedge hull, raked canopy, enclosed drums, raised skirt, nose and tail strips, amber, low light bar |
| 2 | Louvers, gullwing cuts, POLICE decal, underglow, satin nose panel. Low keeps the round-1 shell plus the decal and a small underglow |
| 3 | Bevel normal, AO, roughness and metal maps. High adds one subdivision. Maps are 1024 / 512 / 256 |
| 4 | Same mesh as 3. The first tuned grade used a one-pixel wear test that sparkled under the rim light |
| 5 | Drums set into the slab, shoulder flared toward the drum, diagonal door cut, deeper louvers, clean grade |
| 6 | Door cut and louver field thick enough to read on the sheet, pressed drum ring, larger tail and amber lamps, lighter charcoal grade |
| 7 | Flat covered drum faces (no ring, no slots) and a split nose with an open center channel |
| 8 | Front-only nose slot with a filled roof, door grooves, a louver deck, worn gunmetal |
| 9 | Wider gullwing gap, louver field, recessed nose slot, flat gunmetal roughness, clearcoat |
| 10 | Smoked glass, inset louver fins, panel seams on the nose and drums, worn paint, flat normal. Canopy outline stays the filled round-9 profile. Kept as `fixtures/spinner-round10-high.glb` because the cabin fins, roof rod, and rear slab fail the stray gate |
| 11 | Same body as round 10, with those parts either seated on the skin or removed. Gullwing, belt, and louvers are short pieces on the surface. The open nose channel stays |
| 12 | Front drums housed inside the nose prongs. Every drum is a flat-faced cylinder with a tire lip, not a ball. The open channel stays between the prongs and does not cut the roof. This is the shipping cut |

The script is the source of truth. Blender is Z-up with the nose on +Y; the glTF is Y-up with the nose on -Z, origin on the ground-contact centre. The M2 box is 5.45 × 2.32 × 1.36 m. The bar is `spinner-look-target.md`.

Textures are trim-sheet friendly: unique paint on the body islands, and any face smaller than a bolt is packed into an 8% corner cell. Roughness is stored in every channel so the glTF G slot and the metalness B slot both read the right value. The POLICE card is an original block word, authored on the decal, not a film logo.

The grade normalises ambient occlusion to the open panels, darkens crevices, and lifts exposed edges with a blurred difference so a single texel cannot become a spark. Rain streaks are a world-space shader on the flanks, not a hash in the albedo. Medium and low run the same bake at 512 and 256.

Scratch glbs for a round that is not shipping go in `tools/model-harness/.rounds/` (gitignored). The dev server exposes that folder at `/harness-models/`.

## 3. Contact sheet

With `npm run dev` already serving the repo:

```bash
BASE_URL=http://127.0.0.1:5173/ \
  SRC=/harness-models/r2/spinner-high.glb TITLE="round 2" \
  OUT=tools/model-harness/reviews/m2/round2.png \
  npm run turntable
```

`SRC` is `legacy`, a `/models/...` path under `public/`, or a `/harness-models/...` path. `MODE` is `sheet` (the default), `silhouette`, `scale`, or `closeups`.

`MODE=closeups` renders every sheet view on its own, at 1280×1024, and the capture script writes one PNG per view. The canvas is at least 1024 px on a side so a fin is large enough to judge. `__harnessShow(i)` steps the view.

The sheet is eight orbit angles, a nose close-up, a rear-drum close-up, and a top-down row (plan, three-quarter, channel, flight overhead, roof overhead). Three lighting passes: night rain, a low-key cool rim (shape has to read in the dark), and a grey studio. The matching still sits to the right of each angle. The capture script writes a `.json` sidecar of the tile list next to the PNG. The page is `tools/model-harness/turntable/` and the capture script is `scripts/model-turntable.mjs` (leave `scripts/screenshots.mjs` alone).

## 4. Silhouette score

```bash
BASE_URL=http://127.0.0.1:5173/ MODE=silhouette \
  SRC=/harness-models/r2/spinner-high.glb TITLE="round 2" \
  OUT=tools/model-harness/reviews/m2/round2-mask.png \
  npm run turntable

python3 tools/model-harness/scripts/iou.py \
  --render tools/model-harness/reviews/m2/round2-mask.png \
  --meta tools/model-harness/reviews/m2/round2-mask.json \
  --out tools/model-harness/reviews/m2/round2-iou.json \
  --overlay tools/model-harness/reviews/m2/round2-iou.png
```

The mask is three orthographic views (side, front, top) in the metre window in `silhouettes/frustum.json`. The model is not stretched to the reference box. Side and top put the nose on the right and the ground or the centreline on the shared origin. Front puts the ground and the centre on the shared origin. White in the overlay is overlap, red is reference only, cyan is model only.

Targets: side IoU ≥ 0.85, front and top ≥ 0.80. Side and front traces are perspective estimates from three-quarter photographs, so a miss of a few centimetres at the nose or the drums gets explained, not silently rescaled. Top IoU is against the traced top orthographic, notch included. The film overheads are the comparison on the sheet.

Run the current shipping mesh through this once before trusting a high score. A dart with a roof spine should land well under the side target.

## 5. Scale rig

```bash
BASE_URL=http://127.0.0.1:5173/ MODE=scale \
  SRC=/harness-models/r2/spinner-high.glb TITLE="round 2" \
  OUT=tools/model-harness/reviews/m2/round2-scale.png \
  npm run turntable
```

The same scene holds the model, a 1.75 m figure, a 3.70 m lane (two lines), a 2.00 m doorway, and a 3.40 m wall (one city storey). The ground grid is 1 m. The header is the measured bounding box and the ratios. The `.json` sidecar repeats those numbers. This replaces a distance-only check.

In the game, park the craft beside the crowd, in a street, and next to a doorway, and write the same ratios down. A real car of this length is about 5.5 m against 1.75 m people, lanes about 3.5–3.7 m, and storeys about 3–4 m.

## 6. Blind critic

`critic/RUBRIC.md` is the only brief the scorer gets. The scorer is a fresh pass: the contact sheet, the stills (side, front, rear, the top plan, the flight overhead, and the roof overhead), and the rubric. No build notes, no earlier scores, no IoU. Official numbers live in `reviews/m2/roundN-critic.md`. Whatever the person who edited the mesh thought goes in `reviews/m2/roundN-notes.md` and does not replace the critic.

M1 sheets stay in `reviews/` as the baseline (silhouette 7, surface 6, lighting 6, material 5, film 6). M2 sheets live in `reviews/m2/`. M3 scores live in `reviews/m3/`. Stop when "reads as K's spinner" is at least 7 and no rubric column has fallen below that M1 row. From M3 on, every column has to be at least 7, and a yes on stray parts fails the mesh. From M4 on, the scorer also answers whether the front wheels are housed inside the front prongs. A no fails the mesh.

The critic also gets the close-ups, not only the contact sheet, and has to answer whether any part looks like it doesn't belong, sticks out, or floats. A yes fails the mesh.

## 7. Stray parts

IoU is an area. A fin, a rod, or a loose panel can miss it and still be obvious in a still. The stray gate is the check for that.

```bash
node tools/model-harness/scripts/stray.mjs public/models/spinner/spinner-high.glb
npm run stray
```

`stray.mjs` exits 0 when the mesh passes and 1 when it does not. `npm run stray` is what CI runs. It loads the meshopt glTF in Node, so the check does not need Blender or Python.

The limit is the smaller of 3 cm and 1% of the length. The gate reports the furthest protrusion and a count of stray regions. IoU is printed beside those and is not the pass test.

1. **Protrusion.** Silhouettes from the side, the front, the rear, the top, and four three-quarter views. Lamps are left out of the outline. A connected region of the model that sticks out past the reference by more than the limit fails, unless `stray-whitelist.json` justifies that region and gives a reason. The orthographic boxes are there for the skirt filling the perspective wheel arch, the covered drums, and the nose and tail being wider than the plan. They stop short of the cabin roof and the rear deck, so a fin or a hanging slab still fails. The three-quarter views use a higher limit because the visual hull of those perspective traces sits inside the drums; the orthographic views keep 3 cm.
2. **Loose parts.** Welded vertices split the mesh into islands. An island that does not come within 2 cm of the assembly, measured to the surface rather than to the nearest vertex, is loose. A whitelist entry does not excuse a floating island.
3. **Thin plates and spikes.** Thickness under 2 cm, or an aspect ratio over 20:1. A whitelist entry can excuse one when it is on the car and the reason says why (a louver fin in the deck, the POLICE card, a drum face). The gap to the main body has to be within that entry's allowance.

`fixtures/spinner-round10-high.glb` is the mesh that shipped with the fins, the roof rod, and the rear slab. `npm run stray` asserts that this file fails, and that the three shipping tiers pass.

The shipping spinner also has to house its drums. The check finds the four rubber treads and requires each one to be a short cylinder rather than a ball, with a fender over it and the centre inboard of the pod skin. The front pair has to sit in the nose prongs, the prong has to continue ahead of each front drum, and the channel between the prongs has to stay open.

The same gate runs on the ground car and the hauler. Their outline is the envelope in `build_traffic.py`, not K's trace. Lamps are still left out of the silhouette, and the side and front views include the tyres. `stray-traffic.json` justifies the places that envelope is a simplified plan: the car's nose and rocker, the hauler's cab roof and the fifth-wheel step. A plate on the trailer roof is not in those boxes. Pass `--kind car` or `--kind hauler` to check one file.

## LODs and the quality menu

| Tier | File | What you get |
|---|---|---|
| Ultra, High | `spinner-high.glb` | Full mesh, subdivision, bolts, 1024 maps |
| Medium | `spinner-medium.glb` | Bevel and kit, fewer greebles, 512 maps, no subdivision |
| Low | `spinner-low.glb` | Hull, canopy, drums, skirt, lights, decal, 256 maps |

`FlyController.setSpinnerTier` runs from `App.applyTier`, so the quality menu and the automatic drop both swap the player mesh. The lighter tiers carry the smaller textures. Do not strip the high mesh to make Ultra on a phone cheap.

## Kit of parts

`tools/model-harness/kit/parts.py`. Metres, Z up. Every part's local +Z is the outward face and local +X is the long axis, so the geometry sits proud of the host. `place()` aims +Z along a world normal. A later pass can dress a building with the same calls.

```python
from kit.parts import Kit
kit = Kit()
part = kit.vent('wall-vent', width=0.4, height=0.18, depth=0.02, slats=5)
kit.place(part, location=(1, 2, 3), normal=(0, 1, 0), lift=0.002)
```

| Call | What it builds |
|---|---|
| `vent(name, width, height, depth=0.02, slats=5)` | Recess, rim, slats |
| `panel_inset(name, width, height, rim=0.012, bolts=False)` | Inset plate, raised rim, optional corner bolts |
| `seam(name, length, width=0.01, depth=0.006)` | A dark gap |
| `light_strip(name, length, height=0.03, depth=0.012, kind='white')` | Bezel plus an emissive lamp. `kind` is `white`, `red`, `blue`, `amber`, `strobe-red`, `strobe-blue` |
| `intake(name, width, height, depth=0.06, vanes=3)` | Dark cavity, lip, vanes |
| `thruster_nozzle(name, radius=0.16, depth=0.07, vanes=8, segments=16)` | Tube, ring, vanes, dim core. The bore stays open. The spinner does not use this |
| `antenna(name, height=0.28, kind='blade')` | `blade` or `whip` |
| `cable(name, points, radius=0.008, segments=5)` | Tube through local-space points |
| `pipe(name, points, radius=0.016, segments=6)` | A thicker cable |
| `bolt_cluster(name, width, height, count=6, seed=1)` | A small bolt field |
| `greeble_cluster(name, width, height, depth=0.04, count=8, seed=1)` | Boxes and stumps |
| `side_pod(name, length, width, height, nose, tail)` | Flat skirt. Local +X toward the nose, +Y up, +Z out |
| `fan_grille(name, width, height, depth, slats, glow=False)` | Rectangular recess. Not a disc |
| `wheel_housing(name, radius, width, segments, slots, covered=False)` | Enclosed drum. `covered` is a flat body-coloured face. Local +Z out of the cover |
| `light_bar(name, length, width, height)` | Low red/blue bar. Not a fin |
| `gullwing_lines(name, length, height, gap)` | Rectangular door cut, shut |
| `panel_slash(name, length, rise, thick)` | Diagonal door cut: dark gap plus a satin lip |
| `fender_cheek(name, length, depth, height)` | Upper arm from the slab onto an enclosed drum |
| `satin_plate(name, width, height, depth=0.01)` | Lighter panel that sits on a host |
| `livery_decal(name, width, height)` | Flat card for original lettering |
| `place(part, location, normal=None, rotation=None, scale=None, lift=0.0)` | Parents the part to an empty and aims it |

Materials the game keys off: `body`, `satin`, `drum`, `recess`, `glass`, `livery`, `light-white`, `light-red`, `light-blue`, `light-amber`, `light-strobe-red`, `light-strobe-blue`, `light-underglow`, `light-nozzle`. Body, satin, drum, recess, and livery keep base color, normal, roughness, and metalness maps when the glTF has them.

## Ground traffic

`tools/model-harness/blender/build_traffic.py` is the source for `public/models/traffic/{car,hauler}-{high,medium,low}.glb`. Ultra and high share the high file. Medium is the lighter dress. Low is the shell. The game bakes each glTF to one geometry on the shared wet material, so traffic is still one instanced draw per class. K's spinner is a different file and this script does not write it.

Reference silhouettes (side, top, front) are written under `tools/model-harness/reference/` and stay out of git. The bar is `traffic-look-target.md`.

```bash
PAGE=tools/model-harness/turntable/vehicle.html \
  SRC=/models/traffic/car-high.glb TITLE="ground car" \
  OUT=tools/model-harness/reviews/car-high.png \
  npm run turntable
```

The vehicle sheet is a front three-quarter, a side, a rear three-quarter and a top view, in rim-lit night and in studio. A 1.80 m figure, a 3.60 m lane and a 2.20 × 1.00 m door stand next to the mesh.
