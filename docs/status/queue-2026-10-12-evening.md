# Neon LA queue — evening, Monday 12 October 2026

About 6:40 PM ET. `main` is `95bfc32`, the B3 film critique (#74). Times below are America/New_York and approximate.

The readable copy is [queue-2026-10-12-evening.html](queue-2026-10-12-evening.html).

Leave the four open visual drafts alone. This note does not merge them, push to their branches, or edit `src/`, `public/`, or `tests/visual`.

## Open visual drafts

Four agents are still running. A green build on one of them is a snapshot of that push, and the draft is still being written.

| PR | Pass | Branch | Last push | Checks on that push |
| --- | --- | --- | --- | --- |
| [#63](https://github.com/Neok-ok/neon-la-2049/pull/63) | K1 smoke and steam | `cursor/k1-smoke-steam-e19e` | 4:21 PM, `1d719f0` | build passed |
| [#53](https://github.com/Neok-ok/neon-la-2049/pull/53) | H1 humans | `cursor/h1-human-models-4a3e` | 6:21 PM, `414b380` | none reported |
| [#62](https://github.com/Neok-ok/neon-la-2049/pull/62) | G1 landmarks | `cursor/g1-neon-landmarks-3d8a` | 6:48 AM, `0754bcf` | none reported |
| [#45](https://github.com/Neok-ok/neon-la-2049/pull/45) | S3 visual regression | `cursor/visual-regression-tests-795e` | Sun 1:46 PM, `e786f26` | build passed; visual job cancelled after 6 hours |

- **K1** is wind-driven smoke and steam: `src/fx/smoke`, vehicle exhaust, a slice of `src/app` and `src/atmosphere`, plus `docs/fx`. The 4/10 film read is of `8246411` (thicken the launch sheath). The open tip is `1d719f0`. The histories have diverged, and the tip is seven commits past a rewritten copy of that message, through lamp-tinted smoke and a write-up. The 4/10 is not a grade of the current tip.
- **H1** is rigged pedestrians, the crowd, and the Veil House dancer: `tools/human-harness`, `public/models`, `docs/humans`, and the crowd wiring. The 5/10 film read is of `91e6c91`. The latest push shows the dancer's skirt gaps from the street.
- **G1** rebuilds the LAPD block, City Hall, and the Wallace pyramid: `tools/model-harness`, `public/models/landmarks`, the civic and Wallace districts. The 5/10 film read is of the current tip, `0754bcf`. The run is still open.
- **S3** is night-rain visual regression for the deep links: `tests/visual`, a visual workflow, and a slice of atmosphere and `src/core`. The visual job on `e786f26` ran six hours and was cancelled. A long baseline on this draft is expected. Leave it running.

`src/app` is on more than one of these branches. Smoke, humans, the three landmarks, and `tests/visual` each belong to the draft that already has them.

## Held under rule 8

Rule 8: while more than one overlapping visual draft is open, do not launch another visual pass. The cluster above is that condition. Docs that stay off those trees can still merge. The next code passes wait until the cluster clears.

Launch briefs for the six passes below are on the operator box. This repo holds the film scores those briefs follow.

| Pass | Waits on | Score that drives it |
| --- | --- | --- |
| R5 | Pyramid face, sea-wall crest, and three interiors. The [D7 film check](../critique/roads-polish-2026-10-12.md) says the remaining wet-asphalt work does not block R5. The open visual cluster does. Wallace is inside #62. | [R5 brief in the 10 October critique](../critique/critique-2026-10-10.md) |
| L2 | Neon bleed into the air and the wet lane: short neon air, pool color and height, wet ribbons that keep the sign's hue. Named by the [L1 critique](../critique/lighting-l1-2026-10-12.md) and assigned to L2 by the D7 film check. | L1 overall 6/10; neon bleed 4 |
| K1b | The ranked smoke follow-up, on the K1 branch, after #63 is finished. | [K1 film 4/10](../critique/k1-smoke-film-2026-10-12.md) |
| H1b | The ranked human follow-up, on the H1 branch, after #53 is finished. | [H1 film 5/10](../critique/h1-humans-film-2026-10-12.md) |
| G1b | The ranked landmark follow-up, on the G1 branch, after #62 is finished. Top-down honesty on that read is 2. | [G1 film 5/10](../critique/g1-landmarks-film-2026-10-12.md) |
| B3b | Shelf Row's sprawl skin, the floating roof crates, a rail on every gallery, and the Arts and South Bay columns the hold replaced with crates. Screen Wall, Flue Bank, and Flare Bed stay unplaced. The kite reserve stays empty. | [B3 4/10](../critique/b3-kite-towers-film-2026-10-12.md) as mega-towers or a kite obelisk. Shelf Row as a low housing bar: 6/10 |

## Merged Monday 12 October

Afternoon, in merge order:

| When | PR | What landed |
| --- | --- | --- |
| 11:49 AM | [#68](https://github.com/Neok-ok/neon-la-2049/pull/68) | B2 lantern cross and buttress core |
| 12:36 PM | [#69](https://github.com/Neok-ok/neon-la-2049/pull/69) | B2 film critique, 7/10 |
| 2:03 PM | [#70](https://github.com/Neok-ok/neon-la-2049/pull/70) | D7 roads-polish film check. Crosswalks and hero grounds clear 7. Wet asphalt stays at 5. |
| 2:44 PM | [#71](https://github.com/Neok-ok/neon-la-2049/pull/71) | K1 film critique, 4/10 |
| 2:56 PM | [#66](https://github.com/Neok-ok/neon-la-2049/pull/66) | B3 Shelf Row in the field. Kite, screen, flue, and flare held |
| 3:14 PM | [#72](https://github.com/Neok-ok/neon-la-2049/pull/72) | H1 film critique, 5/10 |
| 3:41 PM | [#73](https://github.com/Neok-ok/neon-la-2049/pull/73) | G1 film critique, 5/10 |
| 4:44 PM | [#74](https://github.com/Neok-ok/neon-la-2049/pull/74) | B3 film critique, 4/10; Shelf Row 6/10 |

Earlier the same day:

| When | PR | What landed |
| --- | --- | --- |
| 2:20 AM | [#61](https://github.com/Neok-ok/neon-la-2049/pull/61) | Roads and spinner critique. Spinner approved |
| 5:57 AM | [#49](https://github.com/Neok-ok/neon-la-2049/pull/49) | L1 physical night lighting, registry, and guard |
| 7:45 AM | [#64](https://github.com/Neok-ok/neon-la-2049/pull/64) | D7 polish: crosswalk ladders, wet streaks, hero carriageways |
| 9:32 AM | [#51](https://github.com/Neok-ok/neon-la-2049/pull/51) | B1 tower families |
| 10:00 AM | [#65](https://github.com/Neok-ok/neon-la-2049/pull/65) | L1 film critique, 6/10 |
| 11:13 AM | [#67](https://github.com/Neok-ok/neon-la-2049/pull/67) | B1 film critique, 6/10 |

## Standing rules

- **Merge, then launch, when CI is green.** A finished pass merges on a green build, and the next brief starts. Tonight the four visual agents are still in their drafts, so a green build on #63 or #45 is not a merge.
- **Rule 8.** A new visual pass waits while more than one overlapping visual draft is open. The held list is R5, L2, K1b, H1b, G1b, and B3b.
- **Critics, then the follow-up.** A pass lands, a critic reads the city or the draft sheets against the film, and the ranked list is the next brief. The harness grade on its own sheets is a separate number from that film score.
- **Model harness.** Real top-down references sit beside the plan. The stray-parts gate fails a mesh that grows a fin, a rod, or a floating piece. A blind critic scores the sheet. Envelope overlap against the boxes the mesh was built from does not count as that top-down test.
- **Detail follows the graphics tier.** Low, medium, high, and ultra change the picture. The memory budget is how much stays resident. Ultra stays selectable on a phone, and the street in front of the camera stays. The horizon is what shrinks.
- **The spinner is approved.** The [12 October roads note](../critique/roads-spinner-2026-10-12.md) (#61): every spinner column is at least 7, stray parts are no, and the front wheels sit in the prongs. LAPD, City Hall, and Wallace were the redo that approval unlocked. They are #62, already open.
