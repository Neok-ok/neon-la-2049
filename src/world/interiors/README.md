# Interiors (X3)

Door volumes, a baked light rig, and a hidden city. Stage 8 (K's apartment) calls this. It does not grow a second streaming path, and it does not put a `PointLight` in the scene.

The noodle bar and the LAPD lobby stay soffits in the street mesh. A new room that should occlude the city uses `registerInterior`.

## Register one

Call this once at startup from a district module imported by `src/districts/interior-index.ts`. The same `id` replaces an older spec. Do not call it from a chunk worker.

```ts
import { registerInterior, placeVolume, placeInterior, buildCorridorRoom } from '../../world/interiors';

registerInterior({
  id: 'example-room',
  volume: placeVolume(frame, 0, -4, 3, 6, -0.2, 3),
  doors: [{
    id: 'street',
    exterior: true,
    box: placeVolume(frame, 0, 0.4, 1.2, 1.1, -0.2, 2.6),
  }],
  links: [],
  keepLandmarks: ['example-building'],
  showFromOutside: true,
  streamRadius: 48,
  muffle: 1,
  colliders: [],
  build: (detail) => placeInterior(frame, buildCorridorRoom({
    warmth: 0.15,
    corridor: { length: 6, width: 1.8, height: 2.5 },
    room: { length: 4, width: 4, height: 2.5 },
    detail,
  })),
});
```

`frame` is `{ x, y, z, yaw }` in city metres. Yaw matches a building: local +X is `(cos yaw, −sin yaw)`, local +Z is `(sin yaw, cos yaw)`.

`buildCorridorRoom` is the test plan (a corridor and a room). `warmth` 0 is a pale tube, 1 is tungsten. Pass `extras` to add boxes in the same local frame (door at the origin, corridor toward −Z). Colliders come back on the plan; place them with `placeCollider` and put them on the spec. They are registered once and do not change with the tier.

The shell can be opened without rebuilding it:

| Option | Effect |
|---|---|
| `sideDoors` | Gaps in the corridor side walls. `side: -1` is local −X. `at` is metres from the front door toward −Z. |
| `backDoor` | A gap in the room's far wall. `at` omitted means the middle. |
| `window: false` | Drops the +X window and its portal card. Default is on, so the Bradbury service room is unchanged. |

An empty gap list is the old solid wall.

## What the system already does

`InteriorSystem` (owned by `App`) mounts a spec when the camera is inside `streamRadius` (default 72 m) and drops it past 1.35× that, unless it is linked to the interior the walker is in.

| | |
|---|---|
| Walk, feet in the volume | That interior is active. The smallest volume wins if several overlap, and the current one sticks until the feet leave it. |
| Walk, feet in an `exterior` door | The city stays drawn, so the threshold does not swap mid-step. Muffle eases toward 0.36. |
| Walk, past the door | Fabric, holograms, crowds, traffic, rain, haze and every landmark not named in `keepLandmarks` hide. Muffle eases toward the spec (default 0.85). |
| Fly or cinematic | No interior is active. Volumes are solid to the spinner, including an open roof, so fly mode cannot clip inside. |

Lighting is vertex colour on an unlit mesh, plus an emissive attribute that flickers from the clock. It does not follow night, wetness or the sign uniform. Open-sky rain is a local streak mesh (16 / 28 / 42 on medium / high / ultra, none on low) and only while the city rain is hidden.

The doorway shows a procedural card (one draw) while the city is hidden. It is not a second render of the street. While the walker is still in the exterior door, the card is off and the real street is what they see.

`onShown(true)` means this interior's mesh is in the frame. Use it to hide a landmark court that would z-fight the baked mesh.

`links` keeps the named interiors visible while this one is active, so two rooms share a door without a portal chain. `showFromOutside: false` keeps a back room out of the street view until the walker is inside a linked volume.

## Tiers

`interiorDetail` is 0 / 1 / 2 / 3 for low / medium / high / ultra. `build` may omit trim. Colliders stay at the full plan, so a low-tier room is the same shape. A tier change rebuilds the mounted meshes.

## Rides and the roof door

`rides` on a spec is a fade, not a moving mesh and not a portal chain. Stand in the named door (feet inside the box, so the box has to include y = 0) for `dwell` seconds (default 0.8). The bed muffles for 0.4 s, then `consumeRide()` returns a pose just inside `to`, facing that car's `out` door. The app moves the walker. Each stop is its own interior.

`hum` (0..1) is one shared 74 Hz sine under the muffled bed while that interior is occluded. Specs that omit it stay silent. The oscillator lives on the ambience bus.

Fly mode still cannot enter a volume. `walkHandoff` is the exception for an exterior door whose sill is above 12 m: if the flyer is within 28 m horizontally and 16 m vertically, walk mode starts on that threshold instead of the street. Street doors do not use it.

## Stage 8

K's lobby, corridor, apartment, roof head-house and three lift cars call `registerInterior` and start from `buildCorridorRoom`. The apartment keeps the window. The halls pass `window: false` and use `backDoor` or `sideDoors`. The lift cars are `buildLift` plus `rides`. Do not copy the Bradbury stair, and do not add scene lights. The Bradbury back wing (`bradbury-service`) is still the template instance, not the apartment.

## Stage 19

`harbor-control` calls `registerInterior` and starts from `buildCorridorRoom` with `window: false`. The door faces north (yaw π). No rides and no scene lights.

## Stage 20

`long-beach-concourse` calls `registerInterior` and starts from `buildCorridorRoom` with `window: false`. The door faces south (yaw 0). No rides and no scene lights.

## Stage 21

`east-la-counter` calls `registerInterior` and starts from `buildCorridorRoom` with `window: false`. The door faces south (yaw 0) into the market yard. Corridor 2.6 × 1.7 × 2.55 m, room 5.6 × 4.4 × 2.6 m, warmth 0.96, hum 0, muffle 0.8, stream radius 42 m. Extras are a tile counter, a steel top, an amber pot and four stools. No rides and no scene lights. The name stays off the signs.
