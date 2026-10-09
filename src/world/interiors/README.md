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

## Stage 8

Start from `buildCorridorRoom` and a new `registerInterior`. Do not copy the Bradbury stair, and do not add scene lights. The Bradbury back wing (`bradbury-service`) is the template instance, not K's apartment.
