# Holograms (X4)

Shared projectors for the whole city. Stage 3 (financial megatowers), Stage 6 (the footbridge) and Stage 16 (Hollywood) add placements. They do not add shaders.

Figures and ads are original. There is no pink bridge dancer here — that set piece is Stage 6, and it should register a new design or reuse one of these without copying the film.

## Add a placement

Call this from a landmark builder or a main-thread module that runs once at startup (after imports). The same `id` replaces an older placement. Do not call it from the chunk worker.

```ts
import { registerHologram } from '../../world/holograms/api';
import { SignColor } from '../../world/fabric/types';

registerHologram({
  id: 'megatower-1-crown',
  x, y, z,
  yaw,             // same as a neon sign: plane normal is (sin yaw, 0, cos yaw)
  w: 36, h: 64,    // metres
  design: 'ash-crane',
  color: SignColor.Cyan,
  seed: 0.42,      // 0..1, animation phase
  rank: 0,         // 0 kept first when the tier cap binds
  band: 'tower',   // 'street' culls with LOD0, 'tower' with the near radius
  spill: 40,       // metres of coloured wash. 0 disables spill and the ground card
});
```

`unregisterHologram(id)` removes one. `hologramById` / `allHolograms` read the list.

Designs (`HoloDesignId`):

| Id | What it is |
|---|---|
| `ash-crane` | Ash Line courier. A geometric crane, wings beating. Cyan by convention. |
| `coil-vendor` | Sector 5 market mark. Stacked rings, round head, swaying arms. |
| `ribbon-column` | Downtown column saint. A bowing stack of ribbons. |
| `glyph-loop` | Scrolling block-glyph ad. The blocks are noise, not a wordmark. |
| `lease-loop` | "Lease a wedge" — an original flying wedge and two pods over a barcode. |
| `lantern-loop` | Red Lantern house mark. A pulsing lamp and three motes. |

`color` is a `SignColor` index and only tints the design. It does not swap the shape.

## What the field already does

`HologramField` (owned by `App`) draws every registered panel plus the large kind-2 billboards of loaded chunks (`fromSigns.ts`, area ≥ 140 m²). The chunk sign stays; the figure sits a couple of metres in front of it, so the old panel reads as the screen. Small market headers are left as signs.

Each frame, using the **live** quality tier (the FPS governor writes that tier):

| Tier | Panels | Detail | Spill lights | Ground cards |
|---|---|---|---|---|
| low | 6 | silhouette, coarse scan, no spill | 0 | 0 |
| medium | 18 | scan + flicker + motion | 3 | 6 |
| high | 32 | + one ghost slice on the nearest 5 | 4 | 12 |
| ultra | 48 | + a second ghost slice | 4 | 16 |

- **Street band** drops past `lod0Radius * 0.9`. **Tower band** drops past `nearRadius * 1.35`. Both radii are the streaming radii, so a tier drop pulls holograms in with the city.
- Off-screen panels (more than ~77° off the look direction, and not under the camera) do not spend the cap.
- Lower `rank` wins ties. Streamed billboard figures are rank 2. Give a hero `0`.
- Spill is the nearest shown panels with `spill > 0`, uploaded as four wrapped lights into the city fabric and the street kit. Ground cards are the wet-street disc under panels whose centre is within 80 m of the ground. Low tier sets `U.holoSpill` to 0.
- Cost when anything is visible: **2 instanced draws** (panels, cards) and a few hundred triangles. Ghost slices are extra instances on the same draw.

## Stage 3 notes

The six megatowers already register `${id}-holo-a` (figure, rank 0) and `${id}-holo-b` (ad loop, rank 1) on the two faces the blockout used for kind-2 signs. Replace or add ids in `Landmarks.ts` when the real crowns land. A crown panel is just another `registerHologram` with `band: 'tower'`.

The avenue crane is `financial-canyon-crane` (a gap beside megatower 1, facing away from the tower). Move it if a tower footprint grows over it.

Do not build a second shader. A new design means a new branch in `material.ts` plus a name in `HOLO_DESIGNS`, and a line in the bible with `confidence: invented`.
