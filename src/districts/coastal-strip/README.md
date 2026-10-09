# Grey Coast (`coastal-strip`)

Stage 10. District `coastal-strip`, archetype `coastal-grey`, both sea walls, POI `sea-wall-fight`. The published crest, route and pin are unchanged.

## What is here

| File | Role |
|---|---|
| `profile.ts` | Shared cross-section, 72 m / 128 m pieces, `waveClock`, towers. Pure. |
| `collision.ts` | Stepped walkable slices, parapet, towers. Fixes the Stage 1 `hw`/`hd` swap. |
| `surface.ts` | Near detail. One segment added or removed per frame. |
| `waves.ts` | Swell ribbon, spray cards, wet sheet. Off on the low tier. |
| `apronPlan.ts` | Apron and stair layout. Pure, so the worker archetype can avoid it. |
| `apron.ts` | Apron mesh and colliders. |
| `piers.ts` | Two instanced drowned clusters. Unbranded. |
| `archetype.ts` | 15–60 m salt slabs. Replaces the Stage 1 `coastal-grey` blockout. |
| `details.ts` | Sandbags, rail, puddles, litter. Two kit draws. |
| `hauler.ts` | One truck on the landward strip. Hidden past ~860 m. |
| `lanes.ts` | `coast-patrol`, appended in `skyLanes.ts`. |
| `view.ts` | `__nla.coastView(...)`. |
| `live.ts` | Install, per-frame update, sea-fog amount, surf amount. |

`Landmarks.buildSeaWalls` still extrudes the far wall and the ocean at `y = 6`. It takes its colliders from `collision.ts`. `App.ts` calls `installCoast` and pushes surf through `Ambience.setSurf`. Sea fog is `U.streetFog`. There is no new fog path and no new audio bus.

## Why not the megablock kit

The kit is ribbed, coffered and panelled masses for 90–250 m residential blocks (Stages 11, 12, 20). Grey Coast fabric is `Style.Coastal`, 15–60 m, salt-stained, with almost no windows lit. A second façade family would fight the row in BIBLE §7.

## Invented, and why

- Crest stays **90 m**. No licensed frames to remeasure, and 90 m still clears this fabric and stays far below LAPD. Changing it rescales every terrace.
- Joints every **40 m**, pieces **72 m** (harbor **128 m**), so a segment can stream in one frame. Harbor reach is × 0.62, with fewer drains, ladders and lamps. The port itself is Stage 19.
- Parapet **1.15 m**, above the 0.45 m step-up. Towers every **520 m** (harbor **780 m**) on the landward side of the crest road.
- Apron deck at **7.05 m**, from the first dry terrace to **1 m inside** the ocean polygon. Walk mode refuses ocean cells, so the pad has to be dry. The pin stays at 33.956 N / 118.447 W, about 275 m inland; the pad is the toe nearest that point.
- Stair risers ≤ **0.40 m**, each step offset inland. A stack of floors in one footprint would auto-climb, because `floorBelow` looks 0.45 m up.
- The ladder beside the lowest flight has solid rails and visual rungs. A vertical ladder is not a walkable stair.
- Service ladders follow the steep face, offset about 0.7 m into the air. A vertical run at the upper lip sits inside the slope. Near segments wear a solid concrete skin so the Stage 1 window grid stays a far read.
- Breakers: calm period ~9.2 s, storm ~4.8 s, impact at phase 0.78. Foam and spray emit, because night ambient turns a lit white into black. The shader and the surf bus read the same clock. Low tier: no ribbon, surf gain × 0.4, impact × 0.25. `surf=1` holds that impact for screenshots.
- Service-ladder rails use a cold `Style.Glow` at low intensity so they read at night. The concrete around them stays unlit.
- Pier clusters sit in the water just seaward of the wall stations nearest the real Santa Monica and Venice pins. The wheel is a partial arc of struts. The Venice piece is a sine spine. No name, no gondolas.
- One hauler and one patrol. Weight 0.2 so it does not steal lane traffic from downtown.

## Budgets

Near segments: low 2 / medium 4 / high 7 / ultra 10. Waves and spray: off / 16 / 32 / 48 cards. LOD0 clutter caps 36 / 80 / 140 / 200. The apron is one city-material draw. Piers are two instanced draws, hidden past 2.4 km. The hauler is two draws, hidden past 860 m.

Streaming never builds more than one segment in a frame after the startup warm (the segments already within ~240 m of the apron, up to the tier cap).

## Not in this stage

No `registerHologram`. No interior. No street graph. Shared sodium lamps are off for `coastal-strip` (`NO_LAMPS`).
