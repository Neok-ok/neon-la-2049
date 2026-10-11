# Veil Dancer harness plan

The path is the spinner harness (`tools/model-harness/README.md`): Blender, a meshopt glTF, a contact sheet, a score, then another pass. This document is the plan. It does not add the script, the turntable mode, or the files under `public/models/`.

`spinner-look-target.md` is the voice of the bar. [look-target.md](look-target.md) is the bar for this figure. [silhouette.svg](silhouette.svg) is the plate the overlap views use.

## Before any mesh

1. Read the look-target, the scale sheet, and the LOD sheet.
2. Open the reference URLs in a browser for rain, pink spill, and scan. Do not drop a still into the blend file.
3. Block to the Broadway metres in the authoring frame from the scale sheet. Origin at the hem. Face +Y in Blender.

## Rounds

| Round | What the script builds | Low | Medium | High |
|---|---|---|---|---|
| 1 | Volumes only: diamond, ribcage, pelvis, three chevron shells, two arms, one veil ribbon. No facets. | The round-1 shell, which is also `#outer` | Same shell | Same shell |
| 2 | Skirt steps, pinched waist, veil sheet, mitten hand. | Stays round 1 | Round 2 | Round 2 |
| 3 | Faceted head, chevron hems, veil split into two ribbons and a notch. | Stays round 1 | Round 2, no facets | Round 3 |

Low does not gain detail in later rounds. That is the low ceiling.

Proposed invocation, once the future script exists:

```bash
blender --background --python tools/model-harness/blender/build_dancer.py -- \
  --round 1 --lod all --out public/models/dancer
```

`--lod high|medium|low` with `--out` as a file writes one glTF. Export meshopt, not Draco, same as the spinner. No albedo bake. If a texture is useful it is a pink emission mask, small, and the low file can skip it.

## Sheets

Leave `scripts/screenshots.mjs` alone. Add a dancer sheet beside `scripts/model-turntable.mjs` rather than bending the spinner's eight-orbit page. Each round writes:

- `tools/model-harness/reviews/dancer/roundN-overlap.png` — orthographic, studio, no fog
- `tools/model-harness/reviews/dancer/roundN-street.png` — night rain, wet ground, Broadway fog
- `tools/model-harness/reviews/dancer/roundN.md` — scores and the fix list, written before the next edit

### Silhouette overlap

Rasterize only the named group. Hide `#guide`.

| View | Plate | Frame | Pass |
|---|---|---|---|
| Front bind | `#bind` | 15 × 68 m, orthographic, camera on the panel normal | IoU ≥ 0.82 |
| Front low shell | `#outer` | same frame, the low glTF | IoU ≥ 0.82 |
| Side | `#side` | 3.6 × 68 m, the 1.8 m blade centred | IoU ≥ 0.75 |
| Hollywood width | `#bind` centred in a 24 × 68 m frame | same mesh, uniform scale | The torso width matches the 15 m plate. Extra width is empty. |

IoU is the area of the intersection of the two binary masks (alpha above 0.5) divided by the area of the union. Measure it on these orthographic views, not through fog. A 200 m shot is judged by eye.

| IoU | What the review says |
|---|---|
| ≥ 0.82 front, ≥ 0.75 side | Pass that view |
| 0.70–0.82 front, or 0.62–0.75 side | Revise. List the regions that fell out (head, hand, waist, veil). |
| Below that | Fail the round. Do not add facets on a failed silhouette. |

Sway, hip, veil, and glitch poses are judged by eye against the pose table. They do not have their own IoU gate. The raised arm is up in every pose on the sheet.

### Street views

Night rain, wet ground, the scan treatment on (line count for the tier under test), pink spill.

| Camera | Where | What has to be true |
|---|---|---|
| 5 m | Eye 1.70 m, 5 m from the hem, pitched up | Hem point, lowest skirt step, scan bars, spill on the ground |
| 30 m | Eye 1.70 m, 30 m back, as on an 18 m street | Head, arm, waist, three skirts, veil |
| 200 m | Eye 8 m, 200 m down the canyon, fog 0.42 | Pink vertical, wider middle, nick of the raised hand, head cap |
| 1 km | Hollywood placement, fog on | A pink mark with a flare and a cap |

Run the 30 m and 200 m views on the low shell as well. Low has to survive the canyon.

## Critic rubric

Score 1–10 after each round, in the review file, in this order. "A stack of diamonds" is a fail on silhouette no matter what the other scores do.

| | 10 | 1 |
|---|---|---|
| Silhouette | Overlap passes, and the outline is a dancer | A column, a totem of diamonds, a box |
| Pose | Arm up, waist pinched, veil on one side, idle readable at 30 m | A symmetrical logo, or an arm that drops |
| Costume | Three skirts, hems, facet, veil notch, at the tier that should have them | One blob, or detail that only exists in the file |
| Material | Pink body, white core, waist still a pinch | Grey cloth, black paint, a filled tube |
| Hologram | Scan, tear, flicker, ghost, spill, and the figure still reads | A clean statue, or a glitch that deletes the head |
| Distance | 5 / 30 / 200 m notes, each with what you actually see | A close-up only |
| Film feel | Night rain, pink on the street, a person would look small | A product render on a grey sweep |

## Baseline, the figure that ships

Scored from the current SDF and from the Broadway street capture: a narrow pink column, diamond on diamond, a hot core, rain, blade signs around it.

| | Score | Why |
|---|---:|---|
| Silhouette | 3 | One glowing column. Head, skirts, and veil do not separate. |
| Pose | 2 | The shader sways, and the shapes do not read as a body. |
| Costume | 2 | Three chevrons, one diamond repeated. |
| Material | 4 | Pink and the white core are right. The glow ellipse fills the gaps. |
| Hologram | 6 | Scan, tear, flicker, and spill are already the right tools. |
| Distance | 3 | A lamp down the street. A stack up close. |
| Film feel | 4 | The colour in the rain is the idea. The body is not. |

A later round has to beat this line by line. The hologram score is the one that can stay still while the silhouette moves.

## Integration, after a round passes

Still a later change, not part of building the docs.

1. Keep `getHoloMaterial` as the only hologram material.
2. Replace the `veil-dancer` branch's ellipses with a mask from the approved low mesh for the far and low cases.
3. The nearest dancer, medium and above, inside the 24 m band, may load `dancer-high.glb` or `dancer-medium.glb` as one extra draw. Same split as the player spinner.
4. Do not change `joi-bridge-dancer` or `hollywood-dancer` panel size, rank, band, colour, seed, or spill.
5. Plant the hem at uv 0.02 on both placements. Letterbox on the 24 m quad.
6. Report triangles, bytes, and the three distance reads in the review. The counts are not a gate.

## Kit

The spinner kit (`tools/model-harness/kit/parts.py`) is for hull parts. A dancer can reuse `place`. New calls belong to the future script if the round needs them: `chevron_shell`, `veil_ribbon`, `diamond_head`. Metres, Z up, local +Z outward, same rule as the kit README.
