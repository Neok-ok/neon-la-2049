// Showcase placements the blockout already asked for: market lane, financial megatower gap,
// and the downtown billboards that face the Stage-1 flyover. Stage 3 adds more through registerHologram.
import { hashString } from '../../core/rng';
import { SignColor } from '../fabric/types';
import { generateFabric } from '../fabric/generator';
import type { Box } from '../fabric/types';
import type { CityLayout } from '../layout';
import { marketSpots } from '../../districts/little-tokyo-market/spots';
import { registerHologram } from './registry';
import type { HoloDesignId, HologramSpec } from './types';

let installed = false;

export function installShowcase(layout: CityLayout): void {
  if (installed) return;
  installed = true;
  placeMarket(layout);
  placeCanyon(layout);
  placeDowntownFlyover(layout);
}

function placeMarket(layout: CityLayout): void {
  const spots = marketSpots(layout);
  const noodle = spots.noodle;
  const poi = layout.poiById('noodle-bar');
  const anchor = noodle?.street ?? (poi ? { x: poi.x, y: layout.heightAt(poi.x, poi.z), z: poi.z, heading: 0.55, yaw: -0.55 } : null);
  if (!anchor) return;
  const hx = Math.sin(anchor.heading);
  const hz = -Math.cos(anchor.heading);
  const yaw = -anchor.heading;
  const ground = anchor.y;
  const coil = {
    x: anchor.x + hx * 10,
    z: anchor.z + hz * 10,
  };
  registerHologram({
    id: 'market-coil',
    x: coil.x,
    y: ground + 4.6,
    z: coil.z,
    yaw,
    w: 2.8,
    h: 6.2,
    design: 'coil-vendor',
    color: SignColor.Amber,
    seed: 0.17,
    rank: 0,
    band: 'street',
    spill: 11,
  });
  // Further into the lane, beside the coil, so a walker sees figure and ad together.
  let ox = hx;
  let oz = hz;
  if (noodle) {
    const dx = noodle.street.x - noodle.entrance.x;
    const dz = noodle.street.z - noodle.entrance.z;
    const len = Math.hypot(dx, dz) || 1;
    ox = dx / len;
    oz = dz / len;
  }
  registerHologram({
    id: 'market-glyph',
    x: coil.x + ox * 3.5,
    y: ground + 5.1,
    z: coil.z + oz * 3.5,
    yaw,
    w: 3.3,
    h: 2.35,
    design: 'glyph-loop',
    color: SignColor.Cyan,
    seed: 0.41,
    rank: 0,
    band: 'street',
    spill: 9,
  });
  const bibi = spots.bibi;
  if (bibi) {
    const bx = Math.sin(bibi.street.heading);
    const bz = -Math.cos(bibi.street.heading);
    registerHologram({
      id: 'market-lantern',
      x: bibi.street.x + bx * 8,
      y: bibi.street.y + 5.2,
      z: bibi.street.z + bz * 8,
      yaw: -bibi.street.heading,
      w: 2.6,
      h: 4.4,
      design: 'lantern-loop',
      color: SignColor.Pink,
      seed: 0.63,
      rank: 1,
      band: 'street',
      spill: 10,
    });
  }
}

function gapAt(layout: CityLayout, boxes: Box[], x: number, z: number): number {
  let nearest = 999;
  for (const b of boxes) {
    if (b.detail > 1 || b.h < 22) continue;
    const dx = x - b.x;
    const dz = z - b.z;
    const c = Math.cos(b.yaw);
    const s = Math.sin(b.yaw);
    const lx = dx * c - dz * s;
    const lz = dx * s + dz * c;
    const ox = Math.max(0, Math.abs(lx) - b.w * 0.5);
    const oz = Math.max(0, Math.abs(lz) - b.d * 0.5);
    nearest = Math.min(nearest, Math.hypot(ox, oz));
  }
  for (const l of layout.landmarks) {
    if (l.type !== 'megatower') continue;
    const reach = Math.max(l.baseWidth, l.baseDepth ?? l.baseWidth) * 0.55;
    nearest = Math.min(nearest, Math.hypot(l.x - x, l.z - z) - reach);
  }
  return nearest;
}

/**
 * Ash Crane in a real gap beside megatower 1, facing away from the tower so a
 * camera on that normal sees the figure with the tower behind it.
 */
function placeCanyon(layout: CityLayout): void {
  const tower = layout.landmarkById('megatower-1');
  if (!tower) return;
  const x0 = Math.floor((tower.x - 200) / 500) * 500;
  const z0 = Math.floor((tower.z - 200) / 500) * 500;
  const boxes: Box[] = [];
  for (const dx of [0, 500]) {
    for (const dz of [0, 500]) boxes.push(...generateFabric(layout, x0 + dx, z0 + dz, 500).boxes);
  }
  let best: { x: number; z: number; score: number } | null = null;
  for (let x = tower.x - 280; x <= tower.x + 280; x += 20) {
    for (let z = tower.z - 280; z <= tower.z + 280; z += 20) {
      if (layout.districtAt(x, z).id !== 'financial-megatowers') continue;
      if (layout.isReserved(x, z, 8)) continue;
      const gap = gapAt(layout, boxes, x, z);
      const dist = Math.hypot(x - tower.x, z - tower.z);
      if (gap < 28 || dist < 100 || dist > 240) continue;
      // Prefer a wide gap about 150 m from the tower, so the shaft reads behind the figure.
      const score = gap - Math.abs(dist - 150) * 0.2;
      if (!best || score > best.score) best = { x, z, score };
    }
  }
  const px = best?.x ?? tower.x + 140;
  const pz = best?.z ?? tower.z + 40;
  const ground = layout.heightAt(px, pz);
  const tx = tower.x - px;
  const tz = tower.z - pz;
  const len = Math.hypot(tx, tz) || 1;
  // Normal points away from the tower, toward the camera.
  const nx = -tx / len;
  const nz = -tz / len;
  registerHologram({
    id: 'financial-canyon-crane',
    x: px,
    y: ground + 36,
    z: pz,
    yaw: Math.atan2(nx, nz),
    w: 18,
    h: 40,
    design: 'ash-crane',
    color: SignColor.Cyan,
    seed: 0.08,
    rank: 0,
    band: 'tower',
    spill: 36,
  });
}

/** Two figures on the downtown billboards that face the Stage-1 northwest flyover. */
function placeDowntownFlyover(layout: CityLayout): void {
  const camX = -900;
  const camZ = -900;
  const dx = Math.sin((140 * Math.PI) / 180);
  const dz = -Math.cos((140 * Math.PI) / 180);
  let hit: [number, number] | null = null;
  for (let t = 500; t <= 2400; t += 70) {
    const x = camX + dx * t;
    const z = camZ + dz * t;
    if (layout.districtAt(x, z).id === 'dtla') { hit = [x, z]; break; }
  }
  if (!hit) {
    const d = layout.districts.find((dd) => dd.id === 'dtla');
    if (!d) return;
    hit = [(d.bbox[0] + d.bbox[2]) * 0.5, (d.bbox[1] + d.bbox[3]) * 0.5];
  }
  const x0 = Math.floor(hit[0] / 500) * 500;
  const z0 = Math.floor(hit[1] / 500) * 500;
  const fab = generateFabric(layout, x0, z0, 500);
  const facing = fab.signs.filter((s) => {
    if (s.kind !== 2 || s.w * s.h < 140) return false;
    const nx = Math.sin(s.yaw);
    const nz = Math.cos(s.yaw);
    return nx * (camX - s.x) + nz * (camZ - s.z) > 0;
  });
  facing.sort((a, b) => b.w * b.h - a.w * a.h);
  const designs: HoloDesignId[] = ['ribbon-column', 'ash-crane'];
  facing.slice(0, 2).forEach((s, i) => {
    const nx = Math.sin(s.yaw);
    const nz = Math.cos(s.yaw);
    const gap = Math.max(2, Math.min(3.5, s.h * 0.05));
    const spec: HologramSpec = {
      id: `dtla-hero-${i}`,
      x: s.x + nx * gap,
      y: s.y,
      z: s.z + nz * gap,
      yaw: s.yaw,
      w: s.w * 0.7,
      h: s.h * 0.78,
      design: designs[i] ?? 'ribbon-column',
      color: i === 0 ? SignColor.Violet : SignColor.Cyan,
      seed: 0.2 + i * 0.3,
      rank: 1,
      band: 'tower',
      spill: Math.min(24, s.h * 0.35),
    };
    registerHologram(spec);
  });
  // No facing billboard in that cell: a free-standing column so the flyover still has a mark.
  if (facing.length === 0) {
    const seed = (hashString('dtla-hero') % 1000) / 1000;
    registerHologram({
      id: 'dtla-hero-0',
      x: hit[0],
      y: layout.heightAt(hit[0], hit[1]) + 80,
      z: hit[1],
      yaw: Math.atan2(camX - hit[0], camZ - hit[1]),
      w: 28,
      h: 46,
      design: 'ribbon-column',
      color: SignColor.Violet,
      seed,
      rank: 1,
      band: 'tower',
      spill: 22,
    });
  }
}
