# Wallace Precinct (stage 7)

Vernon industrial polygon. Grid bearing 0°, blocks 240 × 160 m, streets 30 m. The hero is `wallace-pyramid` (3,500 m). Satellites A/B/C and the two old pyramids keep their Stage 1 placements.

| File | Thread | What it does |
|---|---|---|
| `spec.ts` | both | Pyramid profile (lockstep with the kit), court, causeway, door, factory-street snaps. |
| `pyramid.ts` | main | Stage 3 `wallace-pyramid` and `old-pyramid` builders. Stage 7 attaches the plaza and the face stream to the Wallace LOD0 mesh. |
| `faceDetail.ts` | main | Near-range skin. One sector in or out per frame, only inside ~1.5 km. |
| `plaza.ts` | main | North court, stair, causeway, door, puddles. Colliders returned to the landmark. |
| `haulers.ts` | main | Four trucks on the causeway. Two instanced draws. Not sky-lane traffic. |
| `satellite.ts` | main | `registerLandmarkType('wallace-tower')`. Three LODs. Mast stays inside the published height. |
| `plan.ts` | both | One block: hall, tanks, pipes, or stacks, plus a perimeter wall. Digits are geometry. |
| `archetype.ts` | both | `wallace-vernon`. Replaces `industrial` on this polygon only. |
| `details.ts` | main | Steam on those stacks, bronze bars on the owned edge. |
| `lanes.ts` | main | Three freight polylines. `skyLanes.ts` appends them. No `three` import. |
| `oldSurround.ts` | main | Tank and pipe ring outside `old-pyramid-north` / `south`. Southeast industrial only. |
| `interior.ts` | main | `wallace-atrium` through `registerInterior`. |
| `view.ts` | main | `__nla.wallaceView('approach' \| 'plaza' \| 'face' \| 'satellite' \| 'factories' \| 'convoy' \| 'oldpyramids' \| 'atrium')`. |
| `live.ts` | main | Face stream and hauler matrices, called from `App`. |

## What was built

* **Pyramid.** The Stage 3 terraces, portal glow, pylons and far LODs are untouched. The close skin is a second mesh, streamed by face sector (reach 150 / 230 / 300 / 340 m and a cap of 3 / 6 / 9 / 12 on low / medium / high / ultra). Joints, drains and slits are sized in metres (a slit is about 0.55 × 2.2 m), not as a fraction of the 3.2 km face. The central slot and the portal mouth are skipped. Slits stay off the top two tiers.
* **Plaza.** Causeway from kit z −2,360 to −2,100, half-width 15 m, walls 8.6 m. Eight risers of 0.375 m onto the 3 m plinth. Security barriers with a centre gap. A bridge at y = 3 to a human door at z = −1,606. The portal behind the door stays a glow. The district edge at this longitude cuts the plinth, so the road is a landmark, not fabric.
* **Satellites.** Six battered tiers, a slot per face (warm on the top two), a crown lantern, a 36 m mast whose tip is the published height, corner lights. LOD distances 2,400 and 8,000 m before `landmarkLod`.
* **Fabric.** Halls 18–42 m with a sawtooth ridge, tanks, pipe bents, a conveyor, a dock, stacks 28–58 m, walls with a 9 m gate. No food-atlas signs. Sodium lamps are off for this district.
* **Freight.** `wallace-freight-in` (north apron, then the factory street), `wallace-dock-ns`, `wallace-dock-ew`. Transport only, platoon 2–5, `altBias` 0. The hauler is the Stage 3 transport. Ground trucks are `haulers.ts`.
* **Haze and sound.** Street fog 0.78 below 110 m in the polygon and inside the pyramid reserve. Wet-street neon for this archetype is 0.06 in `mesher.ts` (industrial is 0.1). A noise bed and a 41 Hz tone on the ambience bus. The atrium uses the existing 74 Hz hum.
* **Atrium.** Dark stone, shallow water either side of one walkway, caustic patches via the interior `flick` attribute. `showFromOutside: false`. No open sky, no stair, no figure. The volume sits in the gap in front of the stone collider so walk mode is not stopped by the first terrace.
* **Old pyramids.** Unchanged models. A ring of tanks, pipes, a low wall and a few steaming stacks from 18 m to 168 m outside each reserve, skipped where the reserves overlap or the point is not `southeast-industrial`.

`confidence: invented` for the court, the causeway, the factory plans, the freight lines, the atrium and the old-pyramid ring. Heights, the polygon and the satellite placements are the existing JSON. Reasons are in BIBLE §5.1, §5.3 and §7.8.

## Budgets

Face sectors are one city-material draw each, capped, and one is built or dropped per frame. A plaza adds one city mesh, one puddle mesh and two hauler draws, and only while pyramid LOD0 is visible (inside 6 km). A factory chunk is one fabric mesh plus, at LOD0, one steam mesh and one post mesh. The atrium is one interior mesh.

No holograms. No street graph. No new shader.
