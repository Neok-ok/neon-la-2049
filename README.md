# Neon LA 2049

A fan-made browser recreation of the Los Angeles of *Blade Runner 2049*: rain, smog, brutalist megablocks, neon markets, spinners,
the Wallace pyramid on the horizon and the Sepulveda Sea Wall holding back the Pacific, built at lore-accurate scale on real LA geography.

**Play:** https://neok-ok.github.io/neon-la-2049/ (desktop and iPhone Safari)

* **Fly** a spinner, **walk** the streets (switch any time with `F`), or **watch**: a cinematic camera that never repeats a shot.
* Day/night cycle and self-changing weather: drizzle, rain, downpours with lightning, fog, toxic smog, dry haze, snow.
* Rain-and-city ambience (procedural, no music).
* Quality auto-detects (low/medium/high/ultra) and can be overridden in the toolbar. WebGPU with automatic WebGL2 fallback.

> Fan project, not affiliated with or endorsed by Alcon Entertainment, Warner Bros., Sony Pictures or the filmmakers. All models,
> textures, signage and sound here are original or procedural. No film assets, logos or trademarked brand art.

## Controls

| | Desktop | iPhone |
|---|---|---|
| Move | `WASD` | left stick |
| Look / steer | mouse (click to capture) or arrow keys | right stick |
| Up / down (fly) | `Space`/`E`, `C`/`Q` | ▲ ▼ |
| Boost / run | `Shift` | » |
| Fly ↔ walk | `F` (or `1`/`2`; `3` = cinematic) | toolbar |
| Cockpit view | `V` | — |
| Next cinematic shot | `N` | toolbar |
| HUD / mute / time / weather | `H` / `M` / `[` `]` / `B` | toolbar `⋯` |

## Develop

```bash
npm install
npm run dev          # http://localhost:5173  (add ?hud=1 for the perf HUD)
npm run typecheck
npm run build        # static site in dist/
npm run map          # regenerate docs/map*.svg from src/data/city-layout.json
npm run screenshots  # headless captures (needs the dev server running)
```

Handy URLs: `?mode=fly&at=wallace-pyramid`, `?mode=walk&at=noodle-bar`, `?mode=cine&weather=snow&time=6`, `?quality=low`, `?webgl=1`.

## Docs

* [docs/BIBLE.md](docs/BIBLE.md): lore, scale, landmark positions, district visual language, weather looks, rules for invention, sources.
* [docs/map.svg](docs/map.svg) and [docs/map-downtown.svg](docs/map-downtown.svg): the city plan, generated from the layout JSON.
* [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): how the engine works, plus performance budgets.
* [docs/ROADMAP.md](docs/ROADMAP.md): the staged build plan (one district per stage).
* [docs/ADDING_A_DISTRICT.md](docs/ADDING_A_DISTRICT.md): the plug-in pattern for district stages.

## Deploy

Every push to `main` builds and deploys to GitHub Pages via `.github/workflows/deploy.yml`.
One-time setup: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
