# Refinery kit

Shared by Stage 15 (`southeast-industrial`) and Stage 18 (`south-bay-refineries`). Nothing in here runs until a district passes params. The omitted object is all off.

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
| `spheres` | off. A zero share leaves the block roll on the Stage 15 cuts |
| `sphereShare` | 0.18, and only if `spheres` |
| `sphere` | diameter 16.8–25.2 m |
| `jetty` | off. When on, a pier is emitted only if the walk reaches the sea-wall corridor inside the same district |
| `pumpH` | 10.2 m |
| `module` | 0. Columns and stacks stay the continuous range |
| `keepOut` | none. A reserve of 0 does not drop pieces by itself |

Ground above 45 m returns empty. That is the global `hills-sparse` swap. `jetty` does not draw from the block RNG, so a district that leaves it off keeps the yard-sign roll.

## What a block is

Tank farms are instanced drums (12-side shell plus a roof; the open `cyl` template stays for rings and hatches), a 1.5 m berm, and a catwalk ring. Cracking yards are three columns on an 8.4 m skirt. Pipe racks sit on the owned north edge at 7.4 m, the same deck as the Arts District works, with a second tier the works do not have. The works keep their own racks. Do not point this kit at `arts-district`.

Flare stacks are fabric columns so the far mesh still has the needle. The flame is the mounted sprite: flicker, wind shear, brighter on high and ultra (`setRefineryFlame`). A rank-0 additive quad under the stack is the spill. It is not a scene light.

`pump: true` builds one control room with a south door. The roof is `pumpH` (default 10.2 m, three storeys at 3.4 m). Set it on one block, not on the whole district. Pass `module` to snap cracking columns and flare stacks; omit it and the heights stay continuous.

`spheres: true` adds storage spheres (diameter snapped to 4.2 m) on the same 1.5 m berm. The template id is `sphere`. Southeast never emits it.

`jetty: true` walks toward the nearest sea wall and emits a 7.2 × 12 m deck only when that walk stays in the block's district, stays out of the ocean, and comes within 36 m of the corridor before 220 m. Otherwise it emits nothing.

`keepOut` drops a piece whose world point fails the test. Use it where a landmark reserve is 0 and fabric would otherwise sit on the landmark.

The chunk worker stores `seed` in a Float32Array. Values past 2^24 round, and the detail plan then picks a different yard than the fabric. Rebuild the seed with `hash2i(i + 100000, j + 100000, districtIndex * 7919 + 13)` from the block centre before calling `planRefinery`. Stage 15 and Stage 18 both do that. The archetype runs in the worker and already has the integer.

Signage is an occasional atlas stencil (`BLACK OIL`, `STEAM`, `2049`). No company names.
