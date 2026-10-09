# K's Megablock (stage 8)

Residential slab district. Grid bearing 0°, blocks 150 × 90 m, streets 12 m. The hero is `k-megablock-tower` (185 × 230 × 85 m). The apartment is an X3 interior, not a second streaming path.

| File | Thread | What it does |
|---|---|---|
| `spec.ts` | both | Slab, shaft, lobby, corridor, apartment, head-house, lift and pad, in landmark-local metres. |
| `mass.ts` | main | `GeoWriter` in the landmark frame. `solid` records a collider; the builder keeps the detail-2 set. |
| `slab.ts` | main | `registerLandmarkType('megablock-slab')`. Three LODs, signs, beacons. |
| `lanes.ts` | main | Two pad polylines. `skyLanes.ts` appends them. No `three` import. |
| `archetype.ts` | both | `k-megablock`. One compact residential megablock per block. Street signs only. |
| `dress.ts` | both | Sidewalk kit, and the covered market along the south face (inside the reserve). |
| `details.ts` | main | Street kit. Shared steam and pool materials. |
| `crowd.ts` | main | `registerCrowdSource`. The mesh stays in the market module. Share is 0.32. |
| `rooms.ts` | main | Furniture and the lift car. Plain boxes. No figure. |
| `interior.ts` | main | `registerInterior` for the lobby, three cars, the corridor, the apartment and the head-house. |
| `view.ts` | main | `__nla.kView('street' \| 'market' \| 'lobby' \| 'corridor' \| 'apartment' \| 'roof' \| 'aerial')`. |

## What was built

* **Slab.** Stained residential concrete, a band every 13.6 m, three slit cores, laundry and short ledges on the lower south face. The lobby mouth, the shaft and K's floor are holes in the collider. The roof cap is solid, so the shaft does not swallow a walker. The head-house is a shell with no collider. Switch distances 480 / 1,600 m before `landmarkLod`.
* **Pad.** 16 m, amber outline and a chevron, no insignia. Local (−84, 27.2). Hover 191 m (roof + 6). `k-pad-ew` runs south of the head-house. `k-pad-ns` crosses the same point. `altBias` 0, fade 60 m. Open lanes: one polyline is both arrival and departure.
* **Market.** Stalls, awnings, a walk-up noodle counter (the kit, not an interior), five vending machines, a kiosk, a pipe, a cable pair, sodium poles and pools. Atlas words only: NIGHT MARKET, HOT BROTH, NOODLES, VENDING.
* **Inside.** Lobby on the south face. Three static lift cars (lobby, floor 40, roof). A fade moves the walker; the car mesh does not. Corridor on floor 40, apartment in the south-west corner so the template window faces west. Warm lamp against a cool shell. Rain streaks on that window. No projector and no figure.
* **Fly.** Volumes stay solid. Walking from the pad uses the head-house door (`walkHandoff`), because the sill is above 12 m.

`confidence: invented` for the floor module, the shaft, the market plan, the pad, the head-house and every room. The place and the 185 × 230 × 85 m envelope are the bible row (BIBLE §5.3, §7.7).

## Budgets

Street-prop caps: low 280 / 10 / 20, medium 720 / 22 / 48, high 1,600 / 40 / 90, ultra 2,600 / 64 / 140 (props / steam / pools). Rank 0 always, rank 1 from detail scale 0.45, rank 2 from 0.75. Shared sodium lamps still dress the 12 m streets outside the reserve.

Slab triangles, from the builder (detail 2 / 1 / 0):

| Mesh | LOD0 | LOD1 | Proxy | Colliders |
|---|---|---|---|---|
| `k-megablock-tower` | 1,180 | 740 | 70 | 41 |

LOD0 is the mesh plus one sign batch. The market kit is the same extra draws the other dressed districts already take (opaque kit, steam, pools).
