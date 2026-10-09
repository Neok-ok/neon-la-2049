# Residential megablock library

Stage 11 (Lakewood / Downey) and Stage 12 (South LA) share this. It is not a new megablock builder and it is not a façade shader. Every mass goes through `buildMegablock`.

## What Stage 12 calls

Register a **new** archetype id and point only the South LA polygon at it. Leave `megablock-residential` registered for anything still on the Stage 1 blockout.

```ts
import { fillResidentialBlock } from '../_shared/residential/plan';

registerArchetype('south-la-megablocks', (ctx) => {
  fillResidentialBlock(ctx, SOUTH_LA_PARAMS);
});
```

`ResidentialParams` is the whole dial: `module` (3.1–3.6 m), `height`, `residential` (about 0.7–1), `lit`, `tint`, `weights`, `marketEvery`. `hub` and `seam` are optional. Omit them and no block becomes a covered yard or a seam mix.

These are also optional. Omit them and the planner uses the Lakewood numbers:

| Param | When omitted | What it does |
|---|---|---|
| `heightBias` | 1.25 | Skew of the main slab. Above 1 leans short. Below 1 leans tall. |
| `courtReach` | 0.72 | Courtyard roof as a fraction of `height[1]`, before the cap. |
| `courtCap` | 0.78 | Courtyard roof cap as a fraction of `height[1]`. |
| `courtBias` | 1.15 | Courtyard skew. Above 1 leans short. |
| `spines` | no extra markets | Street-line indices (`a` across axis A, `b` across axis B). A block on either side of a listed line gets a corner market even when `marketEvery` misses. With `spines` omitted, the `hash2i` short-circuit is the Stage 11 one. |
| `face` | no band | A segment. Blocks on `side`, within `band` metres, and already at least `height[0]`, step down toward `height[0]`. Within `wall` metres (default 190) they become a blank bar, the east clutter is dropped, and a fence closes the back. Hubs and corridor edges are left alone. |

LOD0 kit, from the detail module (main thread, not the worker):

```ts
const plan = planResidential(block, SOUTH_LA_PARAMS, layout);
const dress = dressResidential(block, plan, layout, opts);
```

`opts` is optional. Omit it and the bin, steam and cable chances, and the single sidewalk loop, stay the Lakewood kit. `opts.busy` raises those chances and adds a second sidewalk loop. `opts.lamps: 'cold'` plants civic pylons on the north and east edges after those rng calls, so an omitted `opts` does not move Lakewood's draws. A district that wants only the cold pylons also has to turn the shared sodium module off for its archetype, or the two rows double.

`dress` returns `props`, `pools`, `steam` and `loops`. Feed `props` to `buildKitMeshes`, and pass `loops` to `registerCrowdSource`. Copy Lakewood's `details.ts` only as far as the caps and the rank test. Do not copy `plan.ts`.

`planResidential` and `dressResidential` are pure: `ctx.rng` is not required because the block seed drives an `Rng`. No `Math.random`, no DOM, no three.js.

## What the planner already does

One family per block, on that block's own grid:

| Family | Form |
|---|---|
| `bar` | one long `bar` |
| `podium` | `slab-podium` |
| `courtyard` | four wings as separate `bar` calls, with an 8 m gap on the south wing and a 7.5 m gap on the east wing |
| `stepped` | `cantilever` plus two lower terraces |
| `walkup` | two short bars, 4–8 storeys, which may sit under `height[0]` |

The kit courtyard is a closed ring, so this library does not use that form. Heights snap to `module` inside `height`. A block whose sidewalk probe hits a reserved corridor becomes an edge bar: a lower slab, a segmented wall, fence posts and a lamp. Boxes whose centres fall in another district, the ocean, or a reserve are dropped.

Façade clutter (stair core, AC stack, laundry lines, drain) is fabric, so it collides. The cloth and the AC vents are a dim warm `Style.Glow` practical, because night albedo is black. Roof tanks and the mast come from the kit when `residential` is high. Balcony rows come from the kit when `residential` is above about 0.4.

Signs are atlas phrases, kind 0, kept between 2.8 m and 6.6 m. The kit's own signs are not forwarded.

## Traffic caveat

This folder does not register a lattice. The district does, with `registerStreetLattice`, its own node prefix, and a `lane` that fits its street. `lane` below 5 m turns the ground mix into rickshaws. `lane` of 5 m or more is a normal car street, and the low spinner layer will try to park on it at 74 m or 112 m. Those parks sit inside a 45–130 m slab, so `SpinnerTraffic` skips `lakewood-megablocks` and `south-la-megablocks`: a spawn there is 158–210 m or 240–420 m, and a free flier under ground + 155 m is lifted. Another lattice with `lane` ≥ 5 and roofs in that band needs the same skip. Do not share nodes with the avenues, the Broadway canyon, Lakewood, South LA, or a freeway, and do not add a ramp.

Street streaks: a route id other than `downtown-avenues` and `broadway-canyon` gets its own cap. Reusing either of those ids would spend the downtown pool.
