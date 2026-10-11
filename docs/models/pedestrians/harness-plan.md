# Pedestrian harness plan

Same loop as the spinner harness and the [dancer plan](../dancer/harness-plan.md): Blender, meshopt glTF, a sheet, a score, then the next round. This file does not add the script or the meshes.

The bar is [look-target.md](look-target.md). The plates are [silhouette.svg](silhouette.svg).

## Before any mesh

1. Read the look-target, the scale sheet, and the LOD sheet.
2. Use the reference URLs for canopy shape, coat length, and night contrast. Do not bring a face into the blend file.
3. Author at 1.80 m, soles on the ground, Blender Z up, facing +Y. glTF Y up, facing −Z. Uniform instance scale only, 1.55–1.91 m at the crown.

## Rounds

| Round | What the script builds | Low | Medium | High |
|---|---|---|---|---|
| 1 | Tapered long coat, head, legs, arms, a pyramid canopy on a shaft. One height. | This shell | This shell | This shell |
| 2 | Short-coat hem at the hip, hood, hat, bag, bent right arm for the shaft, dome canopy. Height range authored as a note, applied as instance scale. | Stays round 1 | Round 2 | Round 2 |
| 3 | Lapel, hem thickness, canopy ribs, shoe darkening. | Stays round 1 | Round 2 | Round 3 |

Low does not pick up ribs or a lapel. The low hem still clears the knee, and the low canopy still has height.

```bash
blender --background --python tools/model-harness/blender/build_crowd.py -- \
  --round 1 --lod all --out public/models/crowd
```

Meshopt, not Draco. No face texture. Vertex colours are enough for the coat, the skin neutrals, and the eight canopies.

Export the poses as morph targets or as named clips in the glTF so the sheet can show them. The city can keep collapsing parts in the vertex shader. A skeleton in the game is optional and has to be costed in `crowdTris` terms if a round wants it.

## Sheets

Leave `scripts/screenshots.mjs` alone. A crowd sheet sits beside the dancer sheet. Each round:

- `tools/model-harness/reviews/pedestrians/roundN-overlap.png`
- `tools/model-harness/reviews/pedestrians/roundN-street.png` — night rain, wet ground, a group of about twelve
- `tools/model-harness/reviews/pedestrians/roundN.md` — scores, then the fix list, before the next edit

### Silhouette overlap

Rasterize one group. Hide `#guide`. Binary mask, alpha above 0.5. Orthographic, no fog.

| View | Plate | Frame | Pass |
|---|---|---|---|
| Long coat, arms down | `#stand` | 1.6 × 1.9 m | IoU ≥ 0.82 |
| Hip-length coat | `#short` | same | IoU ≥ 0.82 |
| Rain | `#rain` | 1.6 × 2.3 m, so the canopy fits | IoU ≥ 0.82 |
| Side, long coat | `#side` | 0.8 × 1.9 m | IoU ≥ 0.75 |

| IoU | Review |
|---|---|
| At or above the pass line | That view passes |
| 0.70–0.82 front, or 0.62–0.75 side | Revise. Name the part: hem, head, canopy, feet. |
| Below | Fail the round. Do not add ribs on a failed hem. |

`step-l`, `step-r`, `queue`, `gaze`, and `vendor` are judged by eye. The planted foot is part of that judgment: a sole that slides through the stance half fails the gait score.

### Street views

Twelve instances. Coat mix and canopy colours from the look-target rates, not twelve copies of one material. Night rain, wet ground.

| Camera | What has to be true |
|---|---|
| 5 m | Hem, foot, shaft in the hand, hood or hat on the instances that have them. No face. |
| 30 m | Roofs, separate coat colours, long hem versus short hem, a queue of four that reads as four people. On a medium-tier sheet the walk is frozen, because 30 m is past 28 m. |
| 200 m | One dark tick and a canopy fleck. The fleck has a little height. |

Include one low-tier 30 m frame so the simple coat is the thing in the canyon, not an empty street.

## Critic rubric

1–10. A box with a cube head fails silhouette even if the walk cycle is right.

| | 10 | 1 |
|---|---|---|
| Silhouette | Plates pass, shoulders wider than the head, calves clear | The current crates |
| Gait | Planted foot, 2 cm bob, no skate, umbrella stays in the hand | A slide, or a canopy that orbits the body |
| Variety | Long/short, hood, hat, bag, nine dark coats, two rares, eight canopies, heights 1.55–1.91 | One stamp |
| Umbrella | Dome, lit shaft, rain fractions, none under the awning | A disc, or a pyramid on every head in dry weather |
| Material | Dark cloth, pale plastic only on the rare coat, fog on | One-tone plastic, or a photo face |
| Distance | 5 / 30 / 200 m, and 200 m is allowed to be empty in-game | A hero portrait only |
| Crowd | A sidewalk, queues, the two cooks | A circle of identical meshes |

## Baseline, the mesh that ships

| | Score | Why |
|---|---:|---|
| Silhouette | 3 | Boxes. The head is half as wide as the torso. |
| Gait | 5 | The cycle plants the foot and the hem clears the knee. The limbs are planks. |
| Variety | 4 | The rates are right. The shapes do not show them past a few metres. |
| Umbrella | 4 | It stays in the hand and the shaft is lit. The roof is a pyramid. |
| Material | 3 | Flat colour, one skin. |
| Distance | 4 | Fine as ticks at 30 m. Boxes at 5 m. Absent at 200 m, which is correct. |
| Crowd | 5 | Loops, queues, awnings, and cooks are already there. |

Beat the line. The distance score at 200 m does not go up by spawning people out to 200 m.

## Integration, after a round passes

1. Keep the single mesh named `crowd` and the single material.
2. Swap geometry on that mesh from `crowd-low.glb` / `crowd-medium.glb` / `crowd-high.glb` when the tier changes. Ultra uses the high file.
3. Keep the instance attributes: coat colour, canopy colour, hood, hat, bag, short coat, umbrella, cycle, amplitude.
4. Keep the rates, the rain fractions, the animation reaches, the shares, and `MAX` 720.
5. Move the leg pivot to 0.96 m and the soles to y = 0. Raise the canopy so the underside is at 1.98 m.
6. Report per-file triangles, bytes, and `crowdTris` for a full market at each tier.

## Kit

`place` from `tools/model-harness/kit/parts.py` still aims a part. A coat is not a hull panel. Likely new calls in the future script: `coat_shell`, `hood_shell`, `umbrella_canopy`. Metres, Z up, local +Z outward.
