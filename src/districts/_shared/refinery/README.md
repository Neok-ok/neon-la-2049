# Refinery kit

Shared by Stage 15 (`southeast-industrial`) and, later, Stage 18 (`south-bay-refineries`). Nothing in here runs until a district passes params. The omitted object is all off.

```ts
import { planRefinery } from '../_shared/refinery/plan';

planRefinery(block, layout, {
  tanks: true,
  racks: true,
  towers: true,
  flares: true,
  stack: [84, 140],
  tower: [32, 58],
});
```

`planRefinery` is pure. The archetype emits `boxes` and `signs`. A detail module emits `props` through the street kit. `flames` are world points. Mount them once with `mountRefineryFlames` so they survive far LOD. Do not also draw a second flame in the chunk.

## Defaults

| Field | When omitted |
|---|---|
| `tanks`, `racks`, `towers`, `flares`, `pump` | off |
| `tankShare` | 0.40, and only if `tanks` |
| `towerShare` | 0.22, and only if `towers` |
| `pipeShare` | 0.20, and only if `racks` |
| `rackOnEdge` | 0.62, and only if `racks` |
| `flareOnYard` | 0.22, and only if `flares` |
| `stack` | 84–140 m |
| `tower` | 32–58 m |
| `doorS` | −58 (pump house south face) |

Ground above 45 m returns empty. That is the global `hills-sparse` swap.

## What a block is

Tank farms are instanced cylinders (the kit cylinder has no caps), a 1.5 m berm, and a catwalk ring. Cracking yards are three columns on an 8.4 m skirt. Pipe racks sit on the owned north edge at 7.4 m, the same deck as the Arts District works, with a second tier the works do not have. The works keep their own racks. Do not point this kit at `arts-district`.

Flare stacks are fabric columns so the far mesh still has the needle. The flame is the mounted sprite: flicker, wind shear, brighter on high and ultra (`setRefineryFlame`). A rank-0 additive quad under the stack is the spill. It is not a scene light.

`pump: true` builds one 10.2 m control room (three storeys at 3.4 m) with a south door. Set it on one block, not on the whole district.

Signage is an occasional atlas stencil (`BLACK OIL`, `STEAM`, `2049`). No company names.
