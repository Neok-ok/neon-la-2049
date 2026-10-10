// Pure module (worker-safe). Stage-1 blockout archetypes. Every district in city-layout.json names one of
// these; later district stages register a more detailed archetype under a new id (see docs/ADDING_A_DISTRICT.md).
import { registerArchetype } from '../../world/fabric/registry';
import { Style, SignColor, type FabricCtx, type StyleId, type LotRect, type FaceDir } from '../../world/fabric/types';

const FACES: FaceDir[] = ['a+', 'a-', 'b+', 'b-'];

const PAL_DOWNTOWN = [SignColor.Cyan, SignColor.Pink, SignColor.White, SignColor.Violet, SignColor.Amber];
const PAL_MARKET = [SignColor.Red, SignColor.Amber, SignColor.Pink, SignColor.Yellow, SignColor.Cyan, SignColor.Teal];
const PAL_SPRAWL = [SignColor.Amber, SignColor.Red, SignColor.Teal, SignColor.White];
const PAL_ENT = [SignColor.Pink, SignColor.Violet, SignColor.Cyan, SignColor.Red, SignColor.Yellow];

/** Lower podium inset, upper mass cantilevered: the film's "top heavy" brutalism. */
function topHeavy(ctx: FabricCtx, s: number, t: number, lb: number, la: number, H: number, style: StyleId, lit: number, tint: number): void {
  const r = ctx.rng;
  const split = r.range(0.22, 0.5);
  const inset = r.range(0.72, 0.9);
  ctx.box(s, t, lb * inset, la * inset, H * split, { style, lit, tint });
  ctx.box(s, t, lb, la, H * (1 - split), { style, lit, tint, base: H * split });
}

function stepped(ctx: FabricCtx, s: number, t: number, lb: number, la: number, H: number, style: StyleId, lit: number, tint: number, steps: number, base0 = 0): void {
  let y = 0;
  for (let k = 0; k < steps; k++) {
    const f = 1 - k * (0.45 / steps);
    const h = (H / steps) * (k === steps - 1 ? 1 : ctx.rng.range(0.8, 1.2));
    ctx.box(s, t, lb * f, la * f, Math.min(h, H - y), { style, lit, tint, base: base0 + y });
    y += h;
    if (y >= H) break;
  }
}

function roofClutter(ctx: FabricCtx, s: number, t: number, lb: number, la: number, top: number, n: number, style: StyleId): void {
  const r = ctx.rng;
  for (let k = 0; k < n; k++) {
    const w = r.range(3, Math.min(14, lb * 0.4));
    const d = r.range(3, Math.min(14, la * 0.4));
    const ps = s + r.range(-la / 2 + d / 2, la / 2 - d / 2);
    const pt = t + r.range(-lb / 2 + w / 2, lb / 2 - w / 2);
    ctx.box(ps, pt, w, d, r.range(2, 7), { style, detail: 2, base: top, lit: 0.1 });
  }
  if (r.chance(0.35)) {
    ctx.box(s + r.range(-la / 4, la / 4), t + r.range(-lb / 4, lb / 4), 0.8, 0.8, r.range(10, 35), { style: Style.Industrial, detail: 2, base: top, lit: 0 });
  }
}

function signsOn(
  ctx: FabricCtx, s: number, t: number, lb: number, la: number, H: number,
  density: number, palette: readonly number[], billboards: number,
): void {
  const r = ctx.rng;
  for (const f of FACES) {
    const faceLen = f[0] === 'a' ? lb : la;
    const ha = la / 2, hb = lb / 2;
    const n = Math.floor(density * faceLen * r.range(0.04, 0.09));
    for (let k = 0; k < n; k++) {
      const along = r.range(-faceLen / 2 + 2, faceLen / 2 - 2);
      if (r.chance(0.45)) {
        const h = r.range(4, Math.min(16, H * 0.6));
        ctx.sign(s, t, hb, ha, f, along, r.range(4, Math.max(5, Math.min(H - h, 26))) , r.range(1, 1.8), h, r.pick(palette), 1);
      } else {
        const w = r.range(2, 8);
        const h = r.range(0.8, 3.5);
        ctx.sign(s, t, hb, ha, f, along, r.range(3, Math.max(4, Math.min(H - 2, 30))), w, h, r.pick(palette), 0);
      }
    }
    if (H > 50 && r.chance(billboards)) {
      const w = Math.min(faceLen * 0.8, r.range(14, 42));
      const h = r.range(8, 26);
      ctx.sign(s, t, hb, ha, f, r.range(-faceLen / 4, faceLen / 4), r.range(H * 0.45, H * 0.85 - h / 2), w, h, r.pick(palette), 2);
    }
  }
}

function stallsAlongEdges(ctx: FabricCtx, density: number, palette: readonly number[]): void {
  const b = ctx.block, r = ctx.rng;
  const edges: Array<[FaceDir, number]> = [['a+', b.lb], ['a-', b.lb], ['b+', b.la], ['b-', b.la]];
  for (const [f, len] of edges) {
    let p = -len / 2 + 2;
    while (p < len / 2 - 3) {
      const w = r.range(2.4, 4.2);
      if (r.chance(density)) {
        const h = r.range(2.4, 3.4);
        const off = 1.2; // stalls stand on the sidewalk just outside the building line (2 m deep)
        let s = 0, t = 0;
        if (f === 'a+') { s = b.la / 2 + off; t = p + w / 2; }
        else if (f === 'a-') { s = -b.la / 2 - off; t = p + w / 2; }
        else if (f === 'b+') { t = b.lb / 2 + off; s = p + w / 2; }
        else { t = -b.lb / 2 - off; s = p + w / 2; }
        const along = f[0] === 'a';
        ctx.box(s, t, along ? w : 2.0, along ? 2.0 : w, h, { style: Style.Market, detail: 1, lit: 0.9, tint: r.range(0.7, 1.2) });
        if (r.chance(0.6)) ctx.sign(s, t, along ? w / 2 : 1.0, along ? 1.0 : w / 2, f, 0, h + 0.5, w * 0.9, r.range(0.5, 0.9), r.pick(palette), 0);
      }
      p += w + r.range(0.2, 1.5);
    }
  }
}

function lotLoop(ctx: FabricCtx, lots: LotRect[], fn: (l: LotRect) => void): void {
  for (const l of lots) fn(l);
}

// ---------------------------------------------------------------------------------------------

// `megablock-downtown` is Stage 4 (`src/districts/dtla/archetype.ts`), built from the shared megablock kit.

registerArchetype('megatower-core', (ctx) => {
  const r = ctx.rng;
  lotLoop(ctx, ctx.lots(45, 120, r.range(2, 6)), (l) => {
    const tower = r.chance(0.42);
    const tint = r.range(0.7, 1.1);
    if (tower) {
      const podium = r.range(35, 60);
      ctx.box(l.s, l.t, l.lb, l.la, podium, { style: Style.Megablock, lit: 0.4, tint });
      const H = r.range(160, 290);
      stepped(ctx, l.s, l.t, l.lb * 0.7, l.la * 0.7, H - podium, Style.Office, r.range(0.3, 0.6), tint, r.int(2, 5), podium);
      signsOn(ctx, l.s, l.t, l.lb, l.la, podium, 1.2, PAL_DOWNTOWN, 0.5);
      roofClutter(ctx, l.s, l.t, l.lb * 0.5, l.la * 0.5, H, r.int(1, 3), Style.Office);
    } else {
      const H = r.range(100, 160);
      topHeavy(ctx, l.s, l.t, l.lb, l.la, H, Style.Megablock, r.range(0.25, 0.5), tint);
      signsOn(ctx, l.s, l.t, l.lb, l.la, H, 1.0, PAL_DOWNTOWN, 0.45);
      roofClutter(ctx, l.s, l.t, l.lb, l.la, H, r.int(1, 4), Style.Megablock);
    }
  });
});

registerArchetype('civic', (ctx) => {
  const r = ctx.rng;
  lotLoop(ctx, ctx.lots(50, 130, 6), (l) => {
    if (r.chance(0.2)) return; // plazas
    const H = r.range(55, 125);
    topHeavy(ctx, l.s, l.t, l.lb, l.la, H, Style.Civic, r.range(0.05, 0.2), r.range(0.8, 1.05));
    if (r.chance(0.3)) signsOn(ctx, l.s, l.t, l.lb, l.la, H, 0.2, [SignColor.White, SignColor.Cyan], 0.1);
  });
});

registerArchetype('street-market', (ctx) => {
  const r = ctx.rng;
  lotLoop(ctx, ctx.lots(7, 22, 0), (l) => {
    const tall = r.chance(0.08);
    const H = tall ? r.range(55, 95) : r.skew(7, 38, 1.6);
    ctx.box(l.s, l.t, l.lb, l.la, H, { style: tall ? Style.Megablock : Style.Market, lit: r.range(0.4, 0.8), tint: r.range(0.7, 1.25) });
    if (!tall && r.chance(0.4)) {
      // stacked add-on boxes / shanty extensions on roofs
      ctx.box(l.s + r.range(-1, 1), l.t + r.range(-1, 1), l.lb * r.range(0.4, 0.8), l.la * r.range(0.4, 0.8), r.range(3, 8), { style: Style.Market, detail: 1, base: H, lit: 0.6 });
    }
    signsOn(ctx, l.s, l.t, l.lb, l.la, Math.min(H, 30), 3.2, PAL_MARKET, tall ? 0.4 : 0);
  });
  stallsAlongEdges(ctx, 0.75, PAL_MARKET);
});

// historic-core (Broadway) is registered by src/districts/historic-core/archetype.ts.
// The Stage 1 neon-canyon blockout lived here. Do not put it back.

// Hollywood moved to `hollywood-strip`. This body is unused. Do not point the polygon back here.
registerArchetype('entertainment', (ctx) => {
  const r = ctx.rng;
  lotLoop(ctx, ctx.lots(14, 45, 1), (l) => {
    const H = r.chance(0.12) ? r.range(70, 130) : r.skew(10, 45, 1.4);
    ctx.box(l.s, l.t, l.lb, l.la, H, { style: Style.Neon, lit: r.range(0.3, 0.7), tint: r.range(0.8, 1.2) });
    signsOn(ctx, l.s, l.t, l.lb, l.la, H, 1.8, PAL_ENT, 0.3);
  });
});

// Stage 9 replaces this body. The id stays so the JSON entry does not move.
registerArchetype('industrial-dense', (ctx) => {
  const r = ctx.rng;
  lotLoop(ctx, ctx.lots(20, 60, 2), (l) => {
    const H = r.chance(0.15) ? r.range(45, 85) : r.range(10, 28);
    ctx.box(l.s, l.t, l.lb, l.la, H, { style: Style.Industrial, lit: r.range(0.05, 0.25), tint: r.range(0.7, 1.1) });
    if (r.chance(0.3)) roofClutter(ctx, l.s, l.t, l.lb, l.la, H, r.int(1, 3), Style.Industrial);
    if (r.chance(0.3)) signsOn(ctx, l.s, l.t, l.lb, l.la, H, 0.4, PAL_SPRAWL, 0);
  });
});

// Unused. Southeast moved to `southeast-refinery` in Stage 15. South Bay moved to `south-bay-refinery` in Stage 18.
registerArchetype('industrial', (ctx) => {
  const r = ctx.rng;
  lotLoop(ctx, ctx.lots(40, 120, 8), (l) => {
    if (r.chance(0.12)) return;
    const kind = r.next();
    if (kind < 0.55) {
      const H = r.range(12, 34);
      ctx.box(l.s, l.t, l.lb, l.la, H, { style: Style.Industrial, lit: r.range(0.02, 0.15), tint: r.range(0.6, 1.0) });
      roofClutter(ctx, l.s, l.t, l.lb, l.la, H, r.int(0, 3), Style.Industrial);
    } else if (kind < 0.8) {
      // tank farm: squat cylinders approximated as boxes
      const n = r.int(2, 6);
      for (let k = 0; k < n; k++) {
        const d = r.range(12, 26);
        ctx.box(l.s + r.range(-l.la / 3, l.la / 3), l.t + r.range(-l.lb / 3, l.lb / 3), d, d, r.range(10, 22), { style: Style.Industrial, lit: 0.02, tint: r.range(0.5, 0.9) });
      }
    } else {
      // processing tower + stacks
      const H = r.range(40, 90);
      ctx.box(l.s, l.t, l.lb * 0.5, l.la * 0.5, H, { style: Style.Industrial, lit: 0.1 });
      const st = r.int(1, 3);
      for (let k = 0; k < st; k++) {
        ctx.box(l.s + r.range(-l.la / 3, l.la / 3), l.t + r.range(-l.lb / 3, l.lb / 3), 4, 4, r.range(70, 140), { style: Style.Industrial, detail: 1, lit: 0 });
      }
    }
  });
});

registerArchetype('megablock-residential', (ctx) => {
  const r = ctx.rng;
  const slabs = r.chance(0.55);
  lotLoop(ctx, ctx.lots(slabs ? 40 : 14, slabs ? 110 : 40, slabs ? 6 : 1), (l) => {
    if (slabs && r.chance(0.7)) {
      const H = r.range(60, 165);
      topHeavy(ctx, l.s, l.t, l.lb, l.la, H, Style.Residential, r.range(0.3, 0.6), r.range(0.7, 1.1));
      roofClutter(ctx, l.s, l.t, l.lb, l.la, H, r.int(1, 3), Style.Residential);
      signsOn(ctx, l.s, l.t, l.lb, l.la, Math.min(H, 24), 0.6, PAL_SPRAWL, 0.12);
    } else {
      const H = r.skew(5, 22, 1.5);
      ctx.box(l.s, l.t, l.lb, l.la, H, { style: Style.Sprawl, lit: r.range(0.2, 0.55), tint: r.range(0.7, 1.2) });
      if (r.chance(0.15)) signsOn(ctx, l.s, l.t, l.lb, l.la, H, 0.5, PAL_SPRAWL, 0);
    }
  });
});

registerArchetype('megablock-market', (ctx) => {
  const r = ctx.rng;
  lotLoop(ctx, ctx.lots(25, 80, 3), (l) => {
    const H = r.chance(0.6) ? r.range(80, 170) : r.range(10, 30);
    topHeavy(ctx, l.s, l.t, l.lb, l.la, H, Style.Residential, r.range(0.35, 0.65), r.range(0.7, 1.1));
    signsOn(ctx, l.s, l.t, l.lb, l.la, Math.min(H, 26), 2.0, PAL_MARKET, 0.2);
  });
  stallsAlongEdges(ctx, 0.6, PAL_MARKET);
});

registerArchetype('sprawl-dense', (ctx) => {
  const r = ctx.rng;
  lotLoop(ctx, ctx.lots(10, 32, 0.5), (l) => {
    const roll = r.next();
    const H = roll < 0.04 ? r.range(90, 150) : roll < 0.16 ? r.range(30, 70) : r.skew(5, 24, 1.5);
    ctx.box(l.s, l.t, l.lb, l.la, H, { style: H > 60 ? Style.Megablock : Style.Sprawl, lit: r.range(0.2, 0.5), tint: r.range(0.7, 1.2) });
    if (r.chance(0.12)) signsOn(ctx, l.s, l.t, l.lb, l.la, Math.min(H, 20), 0.6, PAL_SPRAWL, 0.05);
  });
});

registerArchetype('coastal-grey', (ctx) => {
  const r = ctx.rng;
  lotLoop(ctx, ctx.lots(18, 60, 4), (l) => {
    if (r.chance(0.35)) return;
    const H = r.chance(0.08) ? r.range(35, 70) : r.range(5, 18);
    ctx.box(l.s, l.t, l.lb, l.la, H, { style: Style.Coastal, lit: r.range(0.02, 0.15), tint: r.range(0.8, 1.15) });
  });
});

// Stage 17 moved lax-spaceport onto `lax-apron`. This body stays registered and unused.
registerArchetype('spaceport', (ctx) => {
  const r = ctx.rng;
  lotLoop(ctx, ctx.lots(80, 220, 30), (l) => {
    if (r.chance(0.6)) return;
    const H = r.range(25, 60);
    ctx.box(l.s, l.t, l.lb * 0.8, l.la * 0.8, H, { style: Style.Industrial, lit: 0.1, tint: 0.8 });
  });
});

// Unused. Harbor moved to `harbor-port` in Stage 19. This body stays registered.
registerArchetype('port', (ctx) => {
  const r = ctx.rng;
  lotLoop(ctx, ctx.lots(40, 100, 10), (l) => {
    if (r.chance(0.2)) return;
    if (r.chance(0.7)) {
      // container stacks in rows
      const rows = Math.max(1, Math.floor(l.lb / 6));
      for (let k = 0; k < rows; k++) {
        const t = l.t - l.lb / 2 + 3 + k * 6;
        ctx.box(l.s, t, 2.6, l.la * r.range(0.6, 0.95), 2.6 * r.int(1, 5), { style: Style.Industrial, detail: 1, lit: 0, tint: r.range(0.5, 1.4) });
      }
    } else {
      const H = r.range(12, 30);
      ctx.box(l.s, l.t, l.lb, l.la, H, { style: Style.Industrial, lit: 0.08, tint: 0.8 });
    }
  });
});

registerArchetype('hills-sparse', (ctx) => {
  const r = ctx.rng;
  lotLoop(ctx, ctx.lots(18, 50, 6), (l) => {
    if (r.chance(0.72)) return;
    ctx.box(l.s, l.t, Math.min(l.lb, 18), Math.min(l.la, 18), r.range(5, 11), { style: Style.Sprawl, lit: r.range(0.1, 0.4), tint: r.range(0.8, 1.2) });
  });
});
