# Arts District Works

Sector 4 fringe, east of Little Tokyo, on the LA River. District id `arts-district`. The archetype id stays `industrial-dense`. This module replaces the Stage 1 registration. `southeast-industrial` stays on `industrial`.

The polygon, the bearing 0 grid, the 160 × 110 m blocks and the 20 m streets are the Stage 1 entry. Do not move them without editing the Bible and the JSON in the same change.

## Fabric

`plan.ts` is pure. `archetype.ts` emits it. `details.ts` reads the same plan for the LOD0 kit.

Warehouses sit in the 10–45 m band: a sawtooth or a barrel roof, a brick dado, a loading dock, bricked-up arches, a roof tank, and sometimes a short conveyor. Steel sheds are the lower end of that band. Three foundry halls (pins in `spec.ts`) carry orange clerestories. Only the pour hall is a void the interior can occupy. The other two are solid masses with a spark shower at the door.

Stacks are 74–136 m, with banding, a ladder and a red kit beacon. A shorter cooling stack stands beside each one. About one block in ten that is not a foundry and not on the river grows a pair, plus the three foundries. Pipe racks cross the owned north edge, and half of those blocks also cross the east edge. Yards hold containers, rust tanks, a slag heap, chain-link and razor wire.

The city wall colour is a grey albedo. Rust is the rank-0 brick dado and the rust tanks, not a new façade style. Clerestory glow is `Style.Glow` at an amber tint. The red beacon is a kit emissive, because glow tint does not go red. Signs reuse the existing atlas (`OPEN LATE`, `STEAM`, `SECTOR 5`, `BLACK OIL`, `VENDING`, `2049`). No new phrases.

## Steam and sparks

`particles.ts` is two materials. Plumes (kind 2) stay put. Vents and grates rise. Sparks and the pour flare are a second additive mesh. Low tier keeps plumes only. Medium keeps every plume and about half of the other steam, and the spark cap is 28. Caps are in `details.ts`.

A dressed chunk is more than fabric + signs + two detail draws: one kit mesh, steam cards, spark cards near a foundry, and the shared sodium lamps (this district is not in `NO_LAMPS`). Triangle counts stay under the LOD0 budget. See the Bible for the measured chunk.

## River

The Stage 1 channel is a flat reserved corridor 110 m wide. The ground sheet is not cut for it. Banks, a trickle card, outfalls, a service road, chain-link and one rusted bridge per eastern block are kit props on that corridor. Fabric boxes inside the reserve are dropped. The polyline is not moved.

## Interior

`arts-foundry` calls `registerInterior` and `buildCorridorRoom`. Warmth 0.82, no window, no rides, no scene lights. The door frame sits on the south face of the pour hall (`DOOR_S`). Props are a crucible, a crane beam, a catwalk and two steam columns.

## Traffic

`lanes.ts` registers `arts-streets` (prefix `ad`, lane 6.4 m, no ramps, no shared nodes). The class mix is box trucks, haulers and vans. JSON `traffic` is 0.34. Spinners skip this district the way they skip Lakewood and South LA, because a 6.4 m lane would park them at 74 m and 112 m, inside the stacks. `arts-freight` is one open sky lane at ground + 176 m on the street at grid line 7.

## Cameras

`__nla.artsView('aerial'|'stacks'|'foundry'|'pipes'|'river'|'street'|'interior')`.

Crowd share is 0.06, loops on the owned north sidewalk of blocks that are not on the river. Two existing hologram designs, `glyph-loop` and `lease-loop`, sit on the Little Tokyo edge. Audio reuses `Ambience.setMachinery`. There is no separate clank layer.
