// Pure module (worker-safe). Sink that turns kit pieces into fabric boxes for an archetype.
// The fabric mesher only knows axis-aligned boxes: frustums become their mid-height box,
// `rot` pieces and hero clutter (detail 3) are dropped. Kit detail 0/1/2 map 1:1 to fabric detail.
//
// Kit frame → block frame: kit +Z (front) = block +A (s), kit +X = block −B (−t).
import type { FabricCtx, FaceDir, StyleId } from '../../../world/fabric/types';
import { phraseSeed } from '../../../world/materials/signPhrases';
import type { Face, KitSign, TowerParts } from './tower';
import type { FaceStyle, KitDetail, MassSink } from './sink';

const FACE_DIR: FaceDir[] = ['a+', 'b-', 'a-', 'b+'];

export class FabricSink implements MassSink {
  readonly full = false;
  readonly maxDetail = 2;
  boxes = 0;

  /** (s0, t0): kit origin in block coordinates; base: height of the kit ground above the block ground. */
  constructor(private ctx: FabricCtx, private s0: number, private t0: number, private base = 0) {}

  frustum(lx: number, lz: number, y0: number, w0: number, d0: number, w1: number, d1: number, h: number, st: FaceStyle, detail: KitDetail, _cap = true, rot = 0): void {
    if (detail > 2 || rot !== 0 || h <= 0.01) return;
    const w = (w0 + w1) / 2, d = (d0 + d1) / 2;
    if (w < 0.6 || d < 0.6) return;
    const b = this.ctx.box(this.s0 + lz, this.t0 - lx, w, d, h, {
      style: st.style as StyleId,
      lit: st.lit,
      tint: st.tint,
      base: this.base + y0,
      detail: detail as 0 | 1 | 2,
    });
    if (b) this.boxes++;
  }

  /** Neon slots from the kit become fabric signs. `phrases` pins the atlas cell so a podium cannot roll food. */
  signs(list: KitSign[], phrases?: readonly number[]): void {
    for (let i = 0; i < list.length; i++) {
      const s = list[i]!;
      const seed = phrases?.length ? phraseSeed(phrases[i % phrases.length]!) : undefined;
      this.sign(s.lx, s.lz, s.face, s.y, s.w, s.h, s.color, s.kind, seed);
    }
  }

  sign(lx: number, lz: number, face: Face, y: number, w: number, h: number, color: number, kind: 0 | 1 | 2, seed?: number): void {
    this.ctx.sign(this.s0 + lz, this.t0 - lx, 0, 0, FACE_DIR[face], 0, this.base + y, w, h, color, kind, seed);
  }

  /** Hologram slots in a fabric tower cannot register holograms (worker); they become big sign panels. */
  holoPanels(parts: TowerParts, palette: readonly number[], seed: number, phrases?: readonly number[]): void {
    let k = 0;
    for (const hp of parts.holos) {
      if (hp.kind === 'podium') continue;
      const cell = phrases?.length ? phrases[k % phrases.length] : undefined;
      const phrase = cell === undefined ? undefined : phraseSeed(cell);
      this.sign(hp.lx, hp.lz, hp.face, hp.y, hp.w, hp.h, palette[(Math.floor(seed * 97) + k) % palette.length]!, 2, phrase);
      k++;
    }
  }
}
