// Three hero windows. Original rooms, placed on glass that already exists.
// K: south face of the residential slab, between the solid bands.
// Little Tokyo: upper market floor above the noodle bar.
// Broadway: masonry lintel on the Bradbury street wall.
import type { CityLayout } from '../layout';
import { bearingToYaw } from '../geo';
import { HD, SLAB_W, localToWorld as kLocal } from '../../districts/k-megablock/spec';
import { BRADBURY_FRONT, FACE_YAW, localToWorld as broadwayLocal } from '../../districts/historic-core/spec';
import { marketSpots } from '../../districts/little-tokyo-market/spots';
import { W } from './state';

export interface WindowHero {
  id: 'k' | 'little-tokyo' | 'broadway';
  x: number;
  y: number;
  z: number;
}

let placed: WindowHero[] = [];

export function windowHeroes(): readonly WindowHero[] {
  return placed;
}

/** Snap a facade coordinate onto the centre of the window cell that contains `target`. */
function snapCell(u0: number, target: number, cell: number): number {
  const cellX = Math.floor(target / cell);
  return (cellX + 0.5) * cell;
}

function kHero(layout: CityLayout): WindowHero | null {
  const l = layout.landmarkById('k-megablock-tower');
  if (!l) return null;
  const g = layout.heightAt(l.x, l.z);
  const yaw = bearingToYaw(l.bearingDeg);
  const seed = Math.fround(0.37);
  const u0 = 100 + seed * 1000;
  const cellW = 3.2;
  const cellH = 3.1;
  const y0 = 3.6;
  const u = snapCell(u0, u0 + (-22 + SLAB_W / 2), cellW);
  const localX = u - u0 - SLAB_W / 2;
  const cellY = Math.floor((46 - y0) / cellH);
  const localY = y0 + (cellY + 0.55) * cellH;
  const [x, z] = kLocal(l.x, l.z, yaw, localX, HD);
  return { id: 'k', x, y: g + localY, z };
}

function tokyoHero(layout: CityLayout): WindowHero | null {
  const entrance = marketSpots(layout).noodle?.entrance;
  if (entrance) {
    return {
      id: 'little-tokyo',
      x: entrance.x + Math.sin(entrance.heading) * 0.4,
      y: entrance.y + 7.2,
      z: entrance.z - Math.cos(entrance.heading) * 0.4,
    };
  }
  const poi = layout.poiById('noodle-bar');
  if (!poi) return null;
  return { id: 'little-tokyo', x: poi.x, y: layout.heightAt(poi.x, poi.z) + 7.2, z: poi.z };
}

function broadwayHero(layout: CityLayout): WindowHero | null {
  const l = layout.landmarkById('bradbury-building');
  if (!l) return null;
  const g = layout.heightAt(l.x, l.z);
  const seed = Math.fround(0.44);
  const u0 = 100 + seed * 1000;
  const width = 14;
  const cellW = 3.2;
  const cellH = 4.8;
  const y0 = 7.2;
  let bestX = 0;
  let bestAbs = Infinity;
  const target = u0 + width / 2;
  const cellX = Math.floor(target / cellW);
  for (const c of [cellX - 1, cellX, cellX + 1, cellX + 2]) {
    const u = (c + 0.5) * cellW;
    const localX = u - u0 - width / 2;
    if (Math.abs(localX) < bestAbs) {
      bestAbs = Math.abs(localX);
      bestX = localX;
    }
  }
  const cellY = Math.floor((14 - y0) / cellH);
  const localY = y0 + (cellY + 0.55) * cellH;
  const [x, z] = broadwayLocal(l.x, l.z, FACE_YAW, bestX, BRADBURY_FRONT);
  return { id: 'broadway', x, y: g + localY, z };
}

export function placeWindowHeroes(layout: CityLayout): WindowHero[] {
  const heroes = [kHero(layout), tokyoHero(layout), broadwayHero(layout)].filter((h): h is WindowHero => !!h);
  const slots = [W.hero0, W.hero1, W.hero2];
  for (let i = 0; i < slots.length; i++) {
    const h = heroes[i];
    const v = slots[i]!.value;
    if (h) v.set(h.x, h.y, h.z);
    else v.set(1e9, 1e9, 1e9);
  }
  placed = heroes;
  return heroes;
}
