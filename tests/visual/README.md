# Visual regression

A fixed set of deep-link camera shots, compared to committed baselines on every pull request.
The suite does not change how the city looks. `?seed=` is the only runtime hook, and it does nothing unless the URL sets it.

## What is captured

22 shots: one street or approach for every district, a second for downtown (the spinner chase) and the historic core (the dancer). LAPD, the Wallace pyramid and LAX are their own shots.

Each shot is rendered twice:

| | |
|---|---|
| Viewports | desktop `1280×720`, phone `390×844` |
| Quality | Medium and Ultra |
| Time | `time=22.5` (night), sim clock held at 48 seconds |
| Weather | `weather=rain`, frozen |
| Seed | `seed=2049` |
| Backend | WebGL2 on SwiftShader (`webgl=1`) |
| Device scale | 1, so the image is the CSS viewport |

Medium and Ultra still diverge at scale 1: LOD radii, rain count, bloom, traffic, crowd, holograms, landmark LOD and antialiasing. The phone frame is the same deep link in a 390×844 viewport. It does not include the touch sticks.

Walk shots load once per quality and then resize, because the feet do not move when the aspect changes. Fly shots (financial, pyramid, sea wall, LAX, spinner chase) load once per viewport so traffic spawns around that camera.

Frame time, draw calls, triangles and LOD0 are written into the report. They are not a pass/fail gate.

The PNG is the WebGL canvas, read in the same turn as the frame that drew it. Headless SwiftShader does not return from a compositor screenshot. While chunks upload, the runner keeps the drawing buffer at the shot size and rasterizes a single pixel, then draws the real frame for the PNG. The HTML shell (loading plate, HUD, touch sticks) is not part of the image.

## Run

Baselines match the Playwright Chromium pinned in `package-lock.json`, headless, SwiftShader.

```bash
npm ci
npx playwright install --with-deps chromium
npm run build
npm run visual            # compare
npm run visual:list       # print the deep links
```

A server that is already running:

```bash
BASE_URL=http://127.0.0.1:5173/ npm run visual
```

Narrow a local run:

```bash
ONLY=pyramid,lapd VIEWS=desktop QUALITIES=medium npm run visual
```

`REPEAT=2` captures every image twice and fails if those two frames disagree. Use it when a shot looks flaky. `GPU=1` uses the machine GPU instead of SwiftShader; it will not match baselines, and `--update` refuses it.

Open a deep link from `npm run visual:list` in a normal browser to look at the same camera. Without SwiftShader the pixels will not match the baseline.

## Tolerance

[`compare.mjs`](compare.mjs) uses pixelmatch. Anti-aliased pixels are ignored. A pixel that still differs counts. A shot fails when more than **2%** of its pixels differ (`MAX_DIFF=0.02` overrides that). The per-pixel threshold is **0.2**.

## Update baselines

Baselines live in [`baselines/`](baselines/) and are not rewritten by a normal pull request.

Locally, after a deliberate visual change:

```bash
npm run build
npm run visual:update
git add tests/visual/baselines
```

`npm run visual:update` is `node tests/visual/run.mjs --update`. That is the explicit script.

On a pull request, add the label **`update-visual-baselines`**. The visual workflow recaptures, commits the new PNGs to the PR branch with `[visual-baselines]` in the message, and pushes. The next run compares and does not commit again. Remove the label once the refresh has landed if later commits on that PR should not keep replacing baselines.

`workflow_dispatch` can run the same job. It only writes baselines when "Update visual baselines" is checked, and that path uploads them as an artifact instead of pushing to `main`.

Diffs and `report.md` are uploaded as the `visual-diff-report` artifact. The job summary and a PR comment carry the same table.

## Seed hook

`?seed=` calls `pinVisualSeed` before the weather, precipitation, traffic and environment map are built. Those RNGs then come from the seed instead of `crypto` / `Math.random`, and the sim clock stays at 48 seconds so rain, signs, beacons and the ocean do not advance. Omit the parameter and play is unchanged. `freeze=1` still freezes the day/night and weather machine on top of that.
