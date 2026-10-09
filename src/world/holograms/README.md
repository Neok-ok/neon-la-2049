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
  band: 'tower',   // 'street' culls with LOD0, 'tower' with the near radius, 'skyline' out to ~half the far radius
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

- **Street band** drops past `lod0Radius * 0.9`. **Tower band** drops past `nearRadius * 1.35`. **Skyline band** (megatower crowns, anything meant to read across the basin) drops past `max(nearRadius * 1.35, farRadius * 0.55)`. All three use the streaming radii, so a tier drop pulls holograms in with the city.
- Off-screen panels (more than ~77° off the look direction, and not under the camera) do not spend the cap.
- Lower `rank` wins ties. Streamed billboard figures are rank 2. Give a hero `0`.
- Spill is the nearest shown panels with `spill > 0`, uploaded as four wrapped lights into the city fabric and the street kit. Ground cards are the wet-street disc under panels whose centre is within 80 m of the ground. Low tier sets `U.holoSpill` to 0.
- Cost when anything is visible: **2 instanced draws** (panels, cards) and a few hundred triangles. Ghost slices are extra instances on the same draw.

## Stage 3 placements

Megatower and skybridge panels come from the megatower kit's hologram slots and are registered by `placeKit` in `src/districts/_shared/megatower/place.ts`. Ids per landmark:

| Id | Slot | Band |
|---|---|---|
| `${id}-holo-a` | first shaft panel (kept stable for `holoView('aerial')`) | tower |
| `${id}-holo-b` | podium panel | tower |
| `${id}-holo-crown` | crown panel, the biggest (up to ~120 m) | skyline |
| `${id}-holo-gap` | panel in a setback gap | tower |
| `${id}-holo-i` (`i` = slot index) | any further slot, including the two side panels of each skybridge | tower |

Designs and colours per tower are in `src/districts/financial-megatowers/specs.ts` (`designs`, `colors`). Kit towers in the fabric emit their slots as kind-2 billboards (`FabricSink.holoPanels`), so the big ones are promoted by the field like any other billboard.

The avenue crane is `financial-canyon-crane`. `placeCanyon` in `showcase.ts` searches up to 360 m around megatower 1 for a clear gap outside the (larger) Stage 3 reserves, preferring about 210 m out, so it moves by itself if a footprint grows over it.

Do not build a second shader. A new design means a new branch in `material.ts` plus a name in `HOLO_DESIGNS`, and a line in the bible with `confidence: invented`.

## Stage 4 placements

`installDtlaHolos` in `src/districts/dtla/holos.ts` (called from `App` next to the showcase):

| Id | Where | Design | Band |
|---|---|---|---|
| `dtla-canyon-ribbon` | Avenue beside block (0, −10), facing the sidewalk | ribbon-column | street |
| `dtla-canyon-lantern` | A few metres down that avenue | lantern-loop | street |
| `dtla-mt1-lease` | MT-1 podium apron, spill 22 m | lease-loop | street |
| `dtla-mt5-glyph` | First clear DTLA point on a 230 m ring around MT-5 | glyph-loop | tower |

Do not reuse `dtla-hero-0` / `dtla-hero-1` (the flyover billboards in `showcase.ts`). Megablock kind-2 signs at least 16 × 10 m are promoted by the field with everything else.
