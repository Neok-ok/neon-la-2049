# Neon LA queue — late night, Monday 12 October 2026

About 11:10 PM ET. `main` is `b9eff00`, the evening queue note (#75). Times below are America/New_York. A later snapshot, about 11:35 PM, is [queue-2026-10-12-1135.md](queue-2026-10-12-1135.md). #45 merged at 11:19 PM, after the paragraphs below were written.

The readable copy is [queue-2026-10-12-late-night.html](queue-2026-10-12-late-night.html). The 6:40 PM picture is [queue-2026-10-12-evening.md](queue-2026-10-12-evening.md).

Leave the four open visual drafts alone. This note does not merge them, undraft them, push to their branches, or edit `src/`, `public/`, or `tests/visual`.

## Open visual drafts

Two agents have finished. Two are still running. A green build is a snapshot of that push. The merge waits until the critics have cleared and the draft is stable.

| PR | Pass | Branch | Agent | Last push | Merge state | Checks on that push |
| --- | --- | --- | --- | --- | --- | --- |
| [#63](https://github.com/Neok-ok/neon-la-2049/pull/63) | K1 smoke and steam | `cursor/k1-smoke-steam-e19e` | finished | 10:41 PM, `0656fe5` | clean | build passed |
| [#53](https://github.com/Neok-ok/neon-la-2049/pull/53) | H1 humans | `cursor/h1-human-models-4a3e` | running | 10:47 PM, `46469cb` | dirty | none reported |
| [#62](https://github.com/Neok-ok/neon-la-2049/pull/62) | G1 landmarks | `cursor/g1-neon-landmarks-3d8a` | running | 10:57 PM, `a241556` | dirty | none reported |
| [#45](https://github.com/Neok-ok/neon-la-2049/pull/45) | S3 visual regression | `cursor/visual-regression-tests-795e` | finished | 10:26 PM, `9f1d2be` | unstable | build and mode passed; visual shards 3 and 4 passed; shards 1 and 2 in progress |

- **K1 stays a draft.** The agent is finished, `mergeable_state` is clean, and the build on `0656fe5` passed in about 30 seconds (run [38338091748](https://github.com/Neok-ok/neon-la-2049/actions/runs/38338091748)). Keep the draft. Undrafting and merging wait on a K1b pass that clears 7. The PR body scores the lit shells and the volume prototypes and leaves both out of the city: billboard cards never cleared 7 (last card round 3 / 4 / 3), and the body states that nothing cleared 7 with all three readers. Volume launch ultra is 2 / 8 / 4 and low is 1 / 7 / 1, so a technical cell reached 7 and 8 while realism and film stayed under. Shell overall is 2 / 3 / 2. The merged film note is [K1 film 4/10](../critique/k1-smoke-film-2026-10-12.md) (#71), a read of `8246411`. Since 6:40 PM the branch was force-updated off `1d719f0`; the tip is `0656fe5` ("score the lit shells and leave them out of the city").
- **H1 is still being written, and it does not apply cleanly.** The agent is running. `mergeable_state` is dirty (`CONFLICTING`) on `46469cb`. No checks are reported. Leave it unmerged while it is dirty and while the agent is running. The PR body, after the hem, leg, and dancer fixes, self-reports Blind 8, Scale 8, Motion 8, and Film 7. The film line is heads 8, legs and shafts 8, dancer 9, doorway 7, pedestrians 7, placement 7. Coats and hems were 6 on the first pass. The same film table still prints 5 for K, Hollywood, the basin, and the arts district, and 6 for DTLA, the southeast, and the harbor. The body says the Hollywood rear slot was recaptured after the coat back was pinned to the coat bone. The merged external critique is [H1 film 5/10](../critique/h1-humans-film-2026-10-12.md) (#72), a read of `91e6c91`. Later commits on this branch are the hem, the legs, the skirt, the parked car, and the dancer reframe. Those 8 / 8 / 8 / 7 numbers are the branch's own sheet.
- **G1 is still being written, and it does not apply cleanly.** The agent is running. `mergeable_state` is dirty on `a241556`. No checks are reported. Leave it unmerged. The tip keeps the Wallace mouth darker than the wall, after a street-level read and a refresh of the City Hall and Wallace sheets (`195ea34`, `dbff956`). The merged film note is [G1 film 5/10](../critique/g1-landmarks-film-2026-10-12.md) (#73), a read of `0754bcf`. Top-down honesty on that read is 2. There is no newer external film score on `a241556`.
- **S3 has finished writing, and the visual job is still in its long baseline.** The agent is finished. The draft remains a draft. `mergeable_state` is unstable: GitHub still calls the branch mergeable, and the check suite is open. Build and mode passed on `9f1d2be`. Visual shard 4 passed in 18m49s and shard 3 in 25m12s. Shards 1 and 2 have been in progress since 10:30 PM (run [38337149938](https://github.com/Neok-ok/neon-la-2049/actions/runs/38337149938)). At this snapshot that is about forty minutes, inside the shard budget of 360 minutes. The evening note's single visual job, on `e786f26`, ran six hours and was cancelled. This tip rewrote that history, split the job into four shards, and checked in baselines through the coast. A long baseline is the expected shape of this draft. Treat the open shards as a live run.

`src/app` is still on more than one of these branches. Smoke, humans, the three landmarks, and `tests/visual` each belong to the draft that already has them.

## When a draft is ready

Preferred order, once a draft is actually ready. Ready means the agent has stopped, the branch applies, CI is green, and the critics that govern that pass have cleared.

1. **H1 (#53) first**, if Blind, Scale, Motion, and Film still hold at 7 or above. Resolve the conflicts before that merge. At 11:10 PM the branch is dirty and the agent is running, so it is not ready. The headline 8 / 8 / 8 / 7 is the agent's own sheet. The district film rows in that sheet still include 5s and 6s.
2. **G1 (#62) next**, after its conflicts are gone and the run has stopped. The external film grade on the earlier tip is 5/10.
3. **K1 (#63) after a K1b fix pass.** The current draft stays a draft. Clean merge state and a green build leave the critic result where the PR body put it: nothing cleared 7 with all three readers. Reconsider the merge after that fix pass.
4. **S3 (#45) when CI is stable.** The open visual shards are a long baseline, and the suite is not green yet.

## Held under rule 8

Rule 8: while more than one overlapping visual draft is open, do not launch another visual pass. The cluster above is that condition. Docs that stay off those trees can still merge. The next code passes wait until the cluster clears.

Launch briefs for the six passes below are on the operator box. This repo holds the film scores those briefs follow.

| Pass | Waits on | Score that drives it |
| --- | --- | --- |
| R5 | Pyramid face, sea-wall crest, and three interiors. The [D7 film check](../critique/roads-polish-2026-10-12.md) says the remaining wet-asphalt work does not block R5. The open visual cluster does. Wallace is inside #62. | [R5 brief in the 10 October critique](../critique/critique-2026-10-10.md) |
| L2 | Neon bleed into the air and the wet lane: short neon air, pool color and height, wet ribbons that keep the sign's hue. Named by the [L1 critique](../critique/lighting-l1-2026-10-12.md) and assigned to L2 by the D7 film check. | L1 overall 6/10; neon bleed 4 |
| K1b | The ranked smoke follow-up, on the K1 branch, after #63 is finished. #63's agent is finished, and the draft stays open because the critics are under 7. K1b is the fix pass that has to land before that draft is reconsidered. | [K1 film 4/10](../critique/k1-smoke-film-2026-10-12.md), plus the branch's own shell and volume sheet on `0656fe5` |
| H1b | The ranked human follow-up, on the H1 branch, after #53 is finished. | [H1 film 5/10](../critique/h1-humans-film-2026-10-12.md) of `91e6c91`. The open branch now self-reports Film 7 on a later tip. |
| G1b | The ranked landmark follow-up, on the G1 branch, after #62 is finished. Top-down honesty on that read is 2. | [G1 film 5/10](../critique/g1-landmarks-film-2026-10-12.md) |
| B3b | Shelf Row's sprawl skin, the floating roof crates, a rail on every gallery, and the Arts and South Bay columns the hold replaced with crates. Screen Wall, Flue Bank, and Flare Bed stay unplaced. The kite reserve stays empty. | [B3 4/10](../critique/b3-kite-towers-film-2026-10-12.md) as mega-towers or a kite obelisk. Shelf Row as a low housing bar: 6/10 |

## Merged Monday 12 October

Evening, after the 6:40 PM note:

| When | PR | What landed |
| --- | --- | --- |
| 6:43 PM | [#75](https://github.com/Neok-ok/neon-la-2049/pull/75) | Evening queue note. `main` is this commit, `b9eff00`. |

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

- **Merge, then launch, when CI is green and the critics have cleared.** A finished pass merges on a green build once the critics that govern it are at 7 or above, and the next brief starts. Tonight #63 is green and clean, and its own sheet is under 7, so it stays a draft. #53 and #62 are dirty with agents still running. #45 is unstable while two visual shards are still in the baseline.
- **Rule 8.** A new visual pass waits while more than one overlapping visual draft is open. The held list is R5, L2, K1b, H1b, G1b, and B3b. The briefs are on the operator box.
- **Critics, then the follow-up.** A pass lands, a critic reads the city or the draft sheets against the film, and the ranked list is the next brief. The harness grade, and a branch's own blind / scale / motion / film table, are separate numbers from that film score. H1's 8 / 8 / 8 / 7 is the first kind. #71, #72, and #73 are the second.
- **Model harness.** Real top-down references sit beside the plan. The stray-parts gate fails a mesh that grows a fin, a rod, or a floating piece. A blind critic scores the sheet. Envelope overlap against the boxes the mesh was built from does not count as that top-down test.
- **Detail follows the graphics tier.** Low, medium, high, and ultra change the picture. The phone is not a separate detail gate. The memory budget is how much stays resident. Ultra stays selectable on a phone, and the street in front of the camera stays. The horizon is what shrinks.
- **The spinner is approved.** The [12 October roads note](../critique/roads-spinner-2026-10-12.md) (#61): every spinner column is at least 7, stray parts are no, and the front wheels sit in the prongs. LAPD, City Hall, and Wallace were the redo that approval unlocked. They are #62, still open.
