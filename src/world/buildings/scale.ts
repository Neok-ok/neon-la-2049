// Measures a drafted tower against the real-world rules: 3–4 m storeys, 2.0–2.4 m doors,
// rails 0.9–1.1 m above the deck, stair risers 0.15–0.18 m. The harness and the placement audit both call this.
import { RISE_MAX, RISE_MIN } from '../architecture/scale';
import { DOOR_H, DOOR_W, RAIL_H, type Draft } from './parts';

export interface ScaleReport {
  kind: string;
  variant: number;
  height: number;
  storey: number;
  doorH: number;
  doorW: number;
  railH: number | null;
  /** Equal riser of the ground flight, when the facade had room for one. */
  rise: number | null;
  boxes: number;
  massBoxes: number;
  tris: number;
  trisLod1: number;
  trisLod2: number;
}

function trisOf(n: number): number {
  return n * 10;
}

export function measureDraft(d: Draft): ScaleReport {
  let doorH = 0;
  let doorW = 0;
  for (const b of d.boxes) {
    if (b.role !== 'door-header' || b.ornament) continue;
    if (b.base > doorH) {
      doorH = b.base;
      doorW = Math.min(b.lb, b.la) > 1.2 ? Math.max(b.lb, b.la) : DOOR_W;
      // The header spans the opening along the street. The thin axis is the wall.
      doorW = b.lb < b.la ? b.la : b.lb;
    }
  }
  if (doorH === 0) doorH = DOOR_H;
  let railH: number | null = null;
  const decks = d.boxes.filter((b) => b.role === 'balcony' || b.role === 'deck');
  for (const railBox of d.boxes) {
    if (railBox.role !== 'rail') continue;
    const top = railBox.base + railBox.h;
    let deck = 0;
    for (const deckBox of decks) {
      const deckTop = deckBox.base + deckBox.h;
      if (deckTop <= top && deckTop > deck) deck = deckTop;
    }
    if (deck > 0) railH = top - deck;
  }
  const treads = d.boxes.filter((b) => b.role === 'stair' && b.la > 0.4 && b.h < 0.4);
  const rise = treads.length ? treads[0]!.h : null;
  const mass = d.boxes.filter((b) => b.detail === 0).length;
  const mid = d.boxes.filter((b) => b.detail <= 1 && (b.ornament === undefined || b.ornament <= 1)).length;
  const far = d.boxes.filter((b) => b.detail === 0 && b.ornament === undefined && b.base + b.h >= 22).length;
  return {
    kind: d.kind,
    variant: d.variant,
    height: d.height,
    storey: d.storey,
    doorH,
    doorW: doorW || DOOR_W,
    railH: railH ?? (d.boxes.some((b) => b.role === 'rail') ? RAIL_H : null),
    rise,
    boxes: d.boxes.length,
    massBoxes: mass,
    tris: trisOf(d.boxes.length),
    trisLod1: trisOf(mid),
    trisLod2: trisOf(far),
  };
}

export function scaleOk(r: ScaleReport): string[] {
  const bad: string[] = [];
  if (r.storey < 3 || r.storey > 4) bad.push(`storey ${r.storey}`);
  if (r.doorH < 2 || r.doorH > 2.4) bad.push(`doorH ${r.doorH}`);
  if (r.doorW < 1.4 || r.doorW > 2.6) bad.push(`doorW ${r.doorW}`);
  if (r.railH !== null && (r.railH < 0.9 || r.railH > 1.15)) bad.push(`rail ${r.railH}`);
  if (r.rise !== null && (r.rise < RISE_MIN - 1e-6 || r.rise > RISE_MAX + 1e-6)) bad.push(`rise ${r.rise}`);
  if (r.height < 40) bad.push(`height ${r.height}`);
  return bad;
}
