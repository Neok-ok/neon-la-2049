// Pure module (worker-safe). Hand-tuned kit plans for the Financial District heroes. Position, height and
// shaft footprint come from city-layout.json (the source of truth for the map); everything about the shape
// lives here. See docs/BIBLE.md §7.3 for the reasoning behind each silhouette.
import { hashString } from '../../core/rng';
import { SignColor } from '../../world/fabric/types';
import type { HoloDesignId } from '../../world/holograms/types';
import type { CrownKind, TowerForm, TowerPlan } from '../_shared/megatower/tower';

export interface HeroSpec {
  form: TowerForm;
  crown: CrownKind;
  podium: { w: number; d: number; h: number };
  /** Quarter turns added to the grid yaw (which face is the entrance / carries the crown panel). */
  turn?: number;
  crownH?: number;
  mast?: number;
  fins?: number;
  buttress?: boolean;
  pads?: boolean;
  lit?: number;
  tint?: number;
  holo?: number;
  mechEvery?: number;
  flames?: boolean;
  /** Hologram content, in slot order (crown, shaft, gap/second, podium). */
  designs?: HoloDesignId[];
  colors?: number[];
}

export const HERO_SPECS: Record<string, HeroSpec> = {
  // The tallest: a sheer brutalist slab with raking buttresses and a cantilevered hammer crown.
  'megatower-1': {
    form: 'slab', crown: 'hammer', podium: { w: 200, d: 150, h: 52 }, turn: 1, mast: 85, fins: 7, buttress: true, pads: true,
    lit: 0.4, tint: 0.85, holo: 4, mechEvery: 136, designs: ['lease-loop', 'ash-crane', 'glyph-loop', 'coil-vendor'],
    colors: [SignColor.Cyan, SignColor.Pink, SignColor.Amber, SignColor.Violet],
  },
  // Twin shafts joined by skybridges and a gate lintel, a figure projected in the gap.
  'megatower-5': {
    form: 'twin', crown: 'blade', podium: { w: 220, d: 130, h: 46 }, turn: 0, mast: 60, fins: 6,
    lit: 0.46, tint: 0.92, holo: 4, mechEvery: 150, designs: ['glyph-loop', 'ribbon-column', 'ash-crane', 'lantern-loop'],
    colors: [SignColor.Violet, SignColor.Cyan, SignColor.Pink, SignColor.Amber],
  },
  // Heavy base, slit-window neck, then the whole upper third flares out (top-heavy, like the film's slabs).
  'megatower-2': {
    form: 'stack', crown: 'flare', podium: { w: 170, d: 170, h: 48 }, turn: 1, mast: 45, fins: 8, pads: true,
    lit: 0.42, tint: 0.8, holo: 3, designs: ['lease-loop', 'coil-vendor', 'glyph-loop'],
    colors: [SignColor.Amber, SignColor.Teal, SignColor.Pink],
  },
  // Terraced ziggurat-like steps with landing pads on the terraces.
  'megatower-3': {
    form: 'stepped', crown: 'stepped', podium: { w: 180, d: 160, h: 40 }, turn: 1, mast: 50, fins: 6, pads: true,
    lit: 0.5, tint: 1.0, holo: 3, designs: ['glyph-loop', 'ribbon-column', 'lease-loop'],
    colors: [SignColor.Pink, SignColor.Cyan, SignColor.White],
  },
  // Cruciform plan, warm glass lantern crown.
  'megatower-4': {
    form: 'cross', crown: 'lantern', podium: { w: 170, d: 170, h: 40 }, turn: 1, mast: 40, fins: 5, buttress: false,
    lit: 0.45, tint: 0.88, holo: 3, designs: ['lantern-loop', 'ash-crane', 'glyph-loop'],
    colors: [SignColor.Amber, SignColor.Violet, SignColor.Cyan],
  },
  // A tapering blade, narrow end to the street.
  'megatower-6': {
    form: 'blade', crown: 'stepped', podium: { w: 150, d: 120, h: 36 }, turn: 0, mast: 32,
    lit: 0.38, tint: 0.95, holo: 3, designs: ['glyph-loop', 'ribbon-column', 'lease-loop'],
    colors: [SignColor.Cyan, SignColor.Pink, SignColor.Amber],
  },
  // Slab with an open structural cage crown around a lit core.
  'megatower-7': {
    form: 'slab', crown: 'cage', podium: { w: 160, d: 120, h: 38 }, turn: 0, mast: 40, fins: 5, buttress: true,
    lit: 0.36, tint: 0.82, holo: 3, designs: ['lease-loop', 'coil-vendor', 'glyph-loop'],
    colors: [SignColor.Teal, SignColor.Pink, SignColor.Violet],
  },
  // 2019-era stepped towers from the first film's skyline: ziggurat crowns, flame stacks, older and dimmer.
  'legacy-tower-1': {
    form: 'stepped', crown: 'ziggurat', podium: { w: 96, d: 90, h: 24 }, turn: 0, mast: 0, fins: 4, flames: true,
    lit: 0.3, tint: 0.7, holo: 2, crownH: 70, designs: ['glyph-loop', 'lantern-loop'], colors: [SignColor.Red, SignColor.Amber],
  },
  'legacy-tower-2': {
    form: 'stepped', crown: 'ziggurat', podium: { w: 90, d: 84, h: 22 }, turn: 1, mast: 0, fins: 4, flames: true,
    lit: 0.28, tint: 0.72, holo: 2, crownH: 62, designs: ['lease-loop', 'glyph-loop'], colors: [SignColor.Amber, SignColor.Red],
  },
  'legacy-tower-3': {
    form: 'stepped', crown: 'ziggurat', podium: { w: 84, d: 84, h: 20 }, turn: 0, mast: 0, fins: 0, flames: true,
    lit: 0.26, tint: 0.68, holo: 1, crownH: 56, designs: ['glyph-loop'], colors: [SignColor.Red],
  },
};

/** Plan for a landmark id; unknown ids get a deterministic generic megatower so new JSON entries still build. */
export function heroPlan(id: string, height: number, w: number, d: number): { plan: TowerPlan; spec: HeroSpec } {
  const seed = (hashString(id) % 100000) / 100000;
  const spec: HeroSpec = HERO_SPECS[id] ?? {
    form: (['slab', 'stepped', 'stack', 'blade'] as const)[hashString(id + ':f') % 4]!,
    crown: (['hammer', 'stepped', 'lantern', 'flare'] as const)[hashString(id + ':c') % 4]!,
    podium: { w: w * 1.4, d: d * 1.4, h: Math.min(50, height * 0.07) },
    mast: 30, fins: 6, holo: 3,
  };
  const plan: TowerPlan = {
    seed, height, w, d,
    podium: spec.podium, form: spec.form, crown: spec.crown, crownH: spec.crownH, mast: spec.mast, fins: spec.fins,
    buttress: spec.buttress, lit: spec.lit, tint: spec.tint, holo: spec.holo, pads: spec.pads, mechEvery: spec.mechEvery, flames: spec.flames,
  };
  return { plan, spec };
}
