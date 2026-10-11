# Scale audit tools

Read-only. These scripts measure the city and write `docs/audit/`. They do not change game code or assets.

```bash
node tools/scale-audit/run-measure.mjs
```

That boots Vite in middleware mode, imports the same `generateFabric` the chunk worker uses, and writes:

- `tools/scale-audit/out/measurements.json`
- `docs/audit/scale-2026-10-11.md`
- `docs/audit/scale-2026-10-11.html`

Screenshots (dev server already running):

```bash
BASE_URL=http://127.0.0.1:5173/ node tools/scale-audit/shoot.mjs
```

Each shot places a 1.75 m reference figure in front of the camera. `shoot.mjs` rewrites the markdown and HTML so the figures are embedded.
