# Model harness

Reusable path for a vehicle or a building prop: model it in headless Blender, dress it from a kit of parts, export a meshopt glTF, and judge it from a turntable contact sheet. The pilot is the player's spinner.

Traffic does not use these files. NPC spinners stay on the merged shell in `src/vehicles/spinnerModel.ts` (`spinnerGeometries` / `spinnerMaterials`), one instanced draw. Only the craft the player flies loads `public/models/spinner/spinner-{high,medium,low}.glb`.

## Regenerating the spinner

Blender 4.0 or newer, and [gltfpack 1.1](https://github.com/zeux/meshoptimizer/releases/tag/v1.1) on `PATH` (the same meshopt version three.js decodes). Apt Blender has no Draco library, so the export is meshopt, not Draco.

```bash
blender --background --python tools/model-harness/blender/build_spinner.py -- \
  --round 3 --lod all --out public/models/spinner
```

`--lod high` (or `medium` / `low`) with `--out` a file path writes one glTF. `--round` is the critic cut:

| Round | What the script builds |
|---|---|
| 1 | Lofted hull, faceted canopy, plain pods, skids, light strips |
| 2 | Bevel, panels, vents, intakes, nozzles, canopy frame, spine. Low stays the round-1 shell |
| 3 | High: one subdivision level, bolts, cables, greebles, 1024 AO bake. Medium: greebles and a 512 bake, no subdivision. Low: the simple shell |

The script is the source of truth. Blender is Z-up with the nose on +Y; the glTF is Y-up with the nose on -Z, origin on the ground-contact centre. The target box is 5.0 × 2.3 × 1.45 m.

## LODs and the quality menu

| Tier | File | What you get |
|---|---|---|
| Ultra, High | `spinner-high.glb` | Full mesh, subdivision, bolts, cables, 1024 albedo |
| Medium | `spinner-medium.glb` | Bevel and kit, fewer greebles, 512 albedo, no subdivision |
| Low | `spinner-low.glb` | Hull, canopy, pods, skids, lights |

`FlyController.setSpinnerTier` runs from `App.applyTier`, so the quality menu and the automatic drop both swap the player mesh. Ultra on a phone (pixel ratio 3, the full glTF, a 1024 albedo) is the heavy combination. The menu already steps the craft down. Do not strip the high mesh to make that combination cheap.

## Turntable

With `npm run dev` already serving the repo:

```bash
BASE_URL=http://127.0.0.1:5173/ \
  SRC=legacy TITLE="legacy shell" \
  OUT=tools/model-harness/reviews/legacy.png \
  npm run turntable

BASE_URL=http://127.0.0.1:5173/ \
  SRC=/models/spinner/spinner-high.glb TITLE="round 3 high" \
  OUT=tools/model-harness/reviews/round3.png \
  npm run turntable
```

`SRC` is `legacy` or a URL path to a glTF under `public/`. The sheet is eight orbit angles plus a nose close-up and a thruster close-up, once in night rain (neon, wet ground, fog) and once in a grey studio. Open the PNG before changing the model. The page is `tools/model-harness/turntable/` and the capture script is `scripts/model-turntable.mjs` (leave `scripts/screenshots.mjs` alone).

## Critic loop

`spinner-look-target.md` is the bar. After each meaningful change, render a sheet, score it 1–10 on silhouette, surface detail, lighting, material, and film feel, and write the fix list next to that sheet before editing the script. "Boxy primitive" is a fail. Scores live in `tools/model-harness/reviews/` with the PNGs.

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
| `thruster_nozzle(name, radius=0.16, depth=0.07, vanes=8, segments=16)` | Tube, ring, vanes, dim core. The bore stays open |
| `antenna(name, height=0.28, kind='blade')` | `blade` or `whip` |
| `cable(name, points, radius=0.008, segments=5)` | Tube through local-space points |
| `pipe(name, points, radius=0.016, segments=6)` | A thicker cable |
| `bolt_cluster(name, width, height, count=6, seed=1)` | A small bolt field |
| `greeble_cluster(name, width, height, depth=0.04, count=8, seed=1)` | Boxes and stumps |
| `place(part, location, normal=None, rotation=None, scale=None, lift=0.0)` | Parents the part to an empty and aims it |

Materials the game keys off: `body`, `recess`, `glass`, `light-white`, `light-red`, `light-blue`, `light-amber`, `light-strobe-red`, `light-strobe-blue`, `light-nozzle`.
