// Broadway canyon fabric. Heritage bays on the street faces, named theatres where the real
// houses stand, a hole where the Bradbury landmark owns the lot. Boxes only.
import { registerArchetype } from '../../world/fabric/registry';
import { Style, type FaceDir, type StyleId } from '../../world/fabric/types';
import type { FabricCtx } from '../../world/fabric/types';
import { phraseSeed } from '../../world/materials/signPhrases';
import {
  buildHeritage, faceSize, projectFace,
  type HeritageCrown, type HeritageFamily, type HeritagePlan,
} from '../_shared/heritage/build';
import { BLOCK_A, BRADBURY_HOLE, BRADBURY_I, BRADBURY_J, BROADWAY_J } from './spec';
import { SITES, type TheatreSite } from './sites';

const FAMILIES: HeritageFamily[] = ['beaux', 'deco', 'baroque', 'gothic', 'roman', 'marquee'];
const CROWNS: HeritageCrown[] = ['none', 'pediment', 'steps', 'none', 'pediment'];

function hitsHole(i: number, j: number, s: number, t: number, lb: number, la: number): boolean {
  if (i !== BRADBURY_I || j !== BRADBURY_J) return false;
  const s0 = s - la / 2, s1 = s + la / 2, t0 = t - lb / 2, t1 = t + lb / 2;
  const h = BRADBURY_HOLE;
  return s1 > h.s0 && s0 < h.s1 && t1 > h.t0 && t0 < h.t1;
}

function emitPlan(ctx: FabricCtx, face: FaceDir, centerS: number, centerT: number, plane: number, plan: HeritagePlan): void {
  const built = buildHeritage(plan);
  const b = ctx.block;
  for (const p of built.pieces) {
    const size = faceSize(face, p.w, p.d);
    const pos = projectFace(face, centerS, centerT, plane, p.x, p.z);
    if (hitsHole(b.i, b.j, pos.s, pos.t, size.lb, size.la)) continue;
    ctx.box(pos.s, pos.t, size.lb, size.la, p.h, {
      style: p.style as StyleId,
      lit: p.lit,
      tint: p.tint,
      detail: p.detail,
      base: p.y - p.h / 2,
    });
  }
  for (const s of built.signs) {
    const anchor = projectFace(face, centerS, centerT, plane, s.x, 0);
    const ss = face === 'a+' || face === 'a-' ? plane : anchor.s;
    const tt = face === 'a+' || face === 'a-' ? anchor.t : plane;
    ctx.sign(ss, tt, 0, 0, face, 0, s.y, s.w, s.h, s.color, s.kind, phraseSeed(s.phrase));
  }
}

function sitePlan(site: TheatreSite, seed: number): HeritagePlan {
  return {
    seed,
    width: site.width,
    depth: site.depth,
    frontH: site.frontH,
    height: site.height,
    family: site.family,
    wrap: site.wrap,
    marquee: site.marquee,
    door: site.door,
    crown: site.crown,
    blades: site.blades,
    billboard: site.billboard,
    lit: 0.42,
    tint: site.family === 'gothic' ? 0.82 : 0.96,
    compact: site.width < 20,
  };
}

interface FaceGeom {
  face: FaceDir;
  plane: number;
  /** 's' means the street runs along A, so a bay's centre is a local s. */
  along: 's' | 't';
  span: number;
}

function facesOf(la: number, lb: number): FaceGeom[] {
  return [
    { face: 'b-', plane: -lb / 2, along: 's', span: la },
    { face: 'b+', plane: lb / 2, along: 's', span: la },
    { face: 'a+', plane: la / 2, along: 't', span: lb },
    { face: 'a-', plane: -la / 2, along: 't', span: lb },
  ];
}

function placeCenter(along: 's' | 't', center: number): { centerS: number; centerT: number } {
  return along === 's' ? { centerS: center, centerT: 0 } : { centerS: 0, centerT: center };
}

function freeRuns(span: number, occ: Array<[number, number]>, minW: number): Array<[number, number]> {
  const span0 = -span / 2 + 1.2;
  const span1 = span / 2 - 1.2;
  const cuts = occ.filter(([a, b]) => b > span0 && a < span1).sort((p, q) => p[0] - q[0]);
  const out: Array<[number, number]> = [];
  let cursor = span0;
  for (const [a, b] of cuts) {
    if (a - cursor >= minW) out.push([cursor, a]);
    cursor = Math.max(cursor, b);
  }
  if (span1 - cursor >= minW) out.push([cursor, span1]);
  return out;
}

registerArchetype('historic-core', (ctx) => {
  const r = ctx.rng;
  const b = ctx.block;
  const hero: FaceDir | null = b.j === BROADWAY_J ? 'b-' : b.j === BROADWAY_J - 1 ? 'b+' : null;
  let billed = false;

  for (const geom of facesOf(b.la, b.lb)) {
    const long = geom.along === 's';
    const onHero = geom.face === hero;

    if (!long) {
      // Cross-street ends are a single masonry bay. The canyon read belongs to the long faces.
      const w = Math.min(18, b.lb * 0.55);
      const depth = 8;
      const h = Math.max(28, Math.min(46, r.range(30, 46)));
      const { centerS, centerT } = placeCenter(geom.along, 0);
      const pos = projectFace(geom.face, centerS, centerT, geom.plane, 0, -depth / 2);
      const size = faceSize(geom.face, w, depth);
      if (!hitsHole(b.i, b.j, pos.s, pos.t, size.lb, size.la)) {
        ctx.box(pos.s, pos.t, size.lb, size.la, h, {
          style: r.chance(0.5) ? Style.Masonry : Style.Panel,
          lit: r.range(0.2, 0.4),
          tint: r.range(0.75, 1),
          base: 0,
        });
      }
      if (r.chance(0.7)) {
        const signS = geom.along === 's' ? r.range(-w * 0.2, w * 0.2) : geom.plane;
        const signT = geom.along === 't' ? r.range(-w * 0.2, w * 0.2) : geom.plane;
        ctx.sign(signS, signT, 0, 0, geom.face, 0, r.range(8, 16), 1.6, r.range(6, 9), r.int(0, 5), 1, phraseSeed(r.int(0, 63)));
      }
      continue;
    }

    const sites = onHero
      ? SITES.filter((site) => {
        const side = geom.face === 'b-' ? 'east' : 'west';
        if (site.side !== side) return false;
        const s0 = b.i * BLOCK_A + 3;
        const s1 = (b.i + 1) * BLOCK_A - 3;
        return site.s > s0 && site.s < s1;
      })
      : [];
    const occupied: Array<[number, number]> = [];
    for (const site of sites) {
      const local = site.s - (b.i + 0.5) * BLOCK_A;
      const { centerS, centerT } = placeCenter(geom.along, local);
      emitPlan(ctx, geom.face, centerS, centerT, geom.plane, sitePlan(site, r.next()));
      occupied.push([local - site.width / 2 - 0.8, local + site.width / 2 + 0.8]);
      if (site.billboard) billed = true;
    }
    // The Bradbury landmark owns this interval. Side bays still fill the rest of the face.
    if (b.i === BRADBURY_I && b.j === BRADBURY_J && geom.face === 'b-') {
      occupied.push([BRADBURY_HOLE.s0 - 0.4, BRADBURY_HOLE.s1 + 0.4]);
    }

    const runs = freeRuns(geom.span, occupied, 12);
    // An empty Broadway face is one long run. Split it into two bays instead of one wall.
    const slots: Array<{ center: number; room: number }> = [];
    if (onHero && !occupied.length && runs.length) {
      const run = runs[0]!;
      const room = run[1] - run[0];
      const width = Math.min(38, (room - 6) / 2);
      slots.push({ center: -width / 2 - 3, room: width + 2 }, { center: width / 2 + 3, room: width + 2 });
    } else {
      const limit = onHero ? 3 : 1;
      const extra = Math.max(0, Math.min(limit, runs.length) - sites.length);
      const ordered = [...runs].sort((a, c) => (c[1] - c[0]) - (a[1] - a[0]));
      for (let n = 0; n < extra && n < ordered.length; n++) {
        const run = ordered[n]!;
        slots.push({ center: (run[0] + run[1]) / 2, room: run[1] - run[0] });
      }
    }
    for (const slot of slots) {
      const room = slot.room;
      const width = Math.min(room - 1.2, Math.max(12, onHero && !sites.length ? room - 2 : room * 0.74));
      const center = slot.center;
      const wrap = onHero ? r.range(0.18, 0.7) : r.range(0.12, 0.4);
      const height = Math.max(40, Math.min(110, onHero ? r.skew(52, 108, 1.1) : r.skew(40, 82, 1.2)));
      const frontH = Math.max(14, Math.min(height - 8, height * (0.48 + (1 - wrap) * 0.28)));
      const family = r.pick(FAMILIES);
      const marquee = onHero ? r.chance(0.8) : r.chance(0.28);
      const billboard = onHero && !billed && height > 64 && width > 18 && r.chance(0.35);
      if (billboard) billed = true;
      const { centerS, centerT } = placeCenter(geom.along, center);
      emitPlan(ctx, geom.face, centerS, centerT, geom.plane, {
        seed: r.next(),
        width,
        depth: Math.min(16, b.lb * 0.3),
        frontH,
        height,
        family,
        wrap,
        marquee,
        door: marquee ? r.range(3.4, 5.6) : 0,
        crown: family === 'deco' ? 'steps' : r.pick(CROWNS),
        blades: onHero ? r.int(3, 5) : r.int(1, 3),
        billboard,
        lit: r.range(0.32, 0.55),
        tint: r.range(0.82, 1.08),
        compact: true,
      });
    }
  }
});
