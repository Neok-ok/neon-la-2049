# B1 building harness

Original tower families for Neon LA 2049. The live city builds them through `src/world/buildings/`. This folder renders turntables, a night rim pass, and a street-scale check. It does not import `tools/model-harness/` or `tools/human-harness/`.

## Run

```bash
npm run dev
node tools/building-harness/audit.mjs
```

Open `http://localhost:5173/tools/building-harness/turntable.html` for the contact sheets. `audit.mjs` checks storeys, doors, rails, fabric tops, street centrelines, the Long Beach concourse, and silhouette IoU.

## What is original

The masses are split by storey, the way a shape grammar would cut a footprint into podium, shaft, setback and crown. The cuts are hand-written for eight families. They are not a copy of a CGA runtime.

- Parish and Müller, *Procedural Modeling of Cities*, SIGGRAPH 2001. Street grids already exist in the city layout. This pass only fills lots.
- Wonka, Wimmer, Sillion, Ribarsky, *Instant Architecture*, SIGGRAPH 2003. Facade split into floors and bays. Here a floor is 3.6 m (3.4 m on the residential stack) and the window style is one of the existing atlas ids.
- Müller, Wonka, Haegler, Ulmer, Van Gool, *Procedural Modeling of Buildings*, SIGGRAPH 2006. Mass model then facade. `recipes.ts` is that split.
- van Dongen, *Interior Mapping*, 2008. Already in `src/world/windows/`. These towers set `lit` on inhabited styles so the same shader lights the rooms. No second window shader.
- Chunk meshes stay merged. Ornament is a filter on the existing chunk, not a new instanced draw. Far LOD is the existing LOD2 mass, which is the impostor.
- Rain streaks and grime in the harness are a procedural canvas roughness map. In the city, grime is the stain already in `cityMaterial`. Tint on these towers stays in 0.55–0.85.

## Reference board

`refs/` is gitignored. It is for a local board of CC brutalist photographs (Barbican, Boston City Hall, Habitat 67, Trellick, Geisel). Do not put Blade Runner frames here. Silhouette scores in the audit compare the detail-0 mesh to original envelope diagrams, not to a film still.

## Tiers

`ornament` 1 is balconies, fins and decks. `ornament` 2 is pipes, AC units and antennas. Low drops both. Medium keeps 1. High and ultra keep 2. Metres do not change. Lights are listed in `src/world/buildings/lights.ts` until the lighting registry lands.
