# Sprawl helper

Stage 13 (Westside) and Stage 14 (Basin) plan ordinary blocks here. Stage 21 (East LA) should call the same functions with its own params. This is not the residential megablock library and it does not call `buildMegablock`.

```ts
import { fillSprawlBlock } from '../_shared/sprawl/plan';

registerArchetype('basin-sprawl', (ctx) => {
  fillSprawlBlock(ctx, BASIN_PARAMS);
});
```

`planSprawl` and `dressSprawl` are pure. The archetype emits `plan.boxes` / `plan.signs`. The detail module emits `dressSprawl(...).props` through the street kit. No `Math.random`, no DOM, no three.js.

## Defaults

Omitted fields are the quiet Westside-sized band, not a second copy of the Stage 1 `sprawl-dense` blockout:

| Field | When omitted |
|---|---|
| `module` | 3.4 m (inside 3.1–3.6) |
| `storeys` | 3–10, which lands at 10.2–34.0 m |
| `cap` | 60 m |
| `lots` | 18–46 m, gap 1.2 m |
| `lit` / `tint` | dim amber windows, grey albedo |
| `strips` | no markets, no stall awnings |
| `towers` | no lot breaks the storey band |
| `hub` | no covered yard |
| `rise` | no edge steps up |
| `walls` | no reserved-corridor wall |

Pass `storeys` to match the district row. Basin passes 2–10 at 3.4 m with cap 35 (6.8–34 m) rather than the omitted 3–10. East LA should pass its own strips when it leaves `sprawl-dense`.

`walls: true` grows the same segmented solid wall, posts and amber lamps the residential library uses on a freeway probe, plus a 10.2 m step. It does not import that library. The probe is `street * 0.42 + 6` metres outside the building line, and `ctx.box` still drops anything whose centre is reserved.

Ground above 45 m returns an empty plan. That is the global `hills-sparse` swap. Do not retune it here.

## What a block is

Lots are plain `Style.Sprawl` boxes snapped to `module`. A strip face, when `strips` lists that street line, gets a one-storey `Style.Market` plinth, atlas signs whose tops stay under 6.7 m, and sidewalk counters. Towers, when `towers` is set, are one per line block at `lineChance` (default 0.16) and one or two per cluster block. Heights still snap under `cap`. Rooftop stairs, AC, tanks, dishes and masts are fabric (they collide). Masts stop so the roof stays under 66 m.

`dressSprawl` adds awnings and an amber lip on stalls (rank 0), a wet amber pool (rank 1) and a roof cable (rank 2). Side streets get one sidewalk loop. A strip adds the stall line. A hub adds the yard. Shared sodium lamps are not placed here; the district leaves `_shared/streetLamps.ts` on or adds its id to `NO_LAMPS`.

## Traffic

This folder does not register a lattice. The district does, with its own prefix and a `lane` that fits its street. `lane` below 5 m is rickshaws. Westside's roofs stay under 66 m, so a 74 m graph park does not enter a tower and this district does not need a `SpinnerTraffic` skip. A later stage that grows past about 70 m does.
