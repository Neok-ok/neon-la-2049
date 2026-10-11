// Layer weights sampled from the district look table, written onto the shared fog uniforms.
// Low keeps today's exponential fog and inversion. The street band and the deck stay at density 0.
import { Color } from 'three/webgpu';
import type { Tier } from '../core/quality';
import { U } from './uniforms';

export const airFlags = {
  ground: true,
  mid: true,
  deck: true,
  halos: true,
  shafts: true,
  rain: true,
  breath: true,
  /** Below 0 means "use the tier cap". */
  shaftCap: -1,
  groundY: -1,
  groundW: -1,
  deckY: -1,
  deckW: -1,
  layerY: -1,
};

export interface AirSample {
  ground: number;
  mid: number;
  deck: number;
  tintR: number;
  tintG: number;
  tintB: number;
  tintMix: number;
  breath: number;
}

let sample: AirSample = {
  ground: 0.35, mid: 1, deck: 0.7,
  tintR: 1, tintG: 1, tintB: 1, tintMix: 0.08, breath: 0.05,
};
let tier: Tier = 'medium';

const ORANGE = new Color(0.55, 0.28, 0.12);
const deckScratch = new Color();

export function setAirSample(s: AirSample): void {
  sample = s;
}

export function setAirTier(t: Tier): void {
  tier = t;
}

export function airSample(): AirSample {
  return sample;
}

export function airTier(): Tier {
  return tier;
}

/**
 * Street band, inversion and high deck. `fog` is the weather ground density (1/m),
 * already what `U.fogDensity` was scaled from, before the street-fog multiplier.
 * Call again after photo mode overwrites the fog density.
 */
export function applyAirLayers(
  fog: number, layer: number, layerY: number, smogTint: number, night: number, daylight: number,
): void {
  const low = tier === 'low';
  const on = low ? 0 : 1;
  const gOn = airFlags.ground;
  const mOn = airFlags.mid;
  const dOn = airFlags.deck;
  U.groundY.value = airFlags.groundY >= 0 ? airFlags.groundY : 12;
  U.groundW.value = airFlags.groundW >= 0 ? airFlags.groundW : 15;
  U.deckY.value = airFlags.deckY >= 0 ? airFlags.deckY : 1320;
  U.deckW.value = airFlags.deckW >= 0 ? airFlags.deckW : 240;
  U.layerY.value = airFlags.layerY >= 0 ? airFlags.layerY : layerY;

  // A 40 m street ray in rain picks up about 0.08–0.16 of extra depth. Clear stays thin.
  U.groundBand.value = (gOn ? 1 : 0) * on * Math.min(0.0026, fog * 1.45) * sample.ground;
  const midScale = !mOn ? 0 : low ? 1 : sample.mid;
  U.layerDensity.value = layer * midScale;
  // Vertical crossing of the deck is a soft veil (optical depth ~0.2 in rain), not a wall.
  // The opening ray at 540 m, aimed at 1,100 m, only clips the lower tail.
  U.deckDensity.value = (dOn ? 1 : 0) * on * (0.00032 + fog * 0.055) * sample.deck;

  const tintMix = sample.tintMix * (low ? 0.4 : 1) * (0.2 + 0.8 * night) * (1 - daylight * 0.65) * (gOn ? 1 : 0);
  U.airTintMix.value = tintMix;
  (U.airTint.value as Color).setRGB(sample.tintR, sample.tintG, sample.tintB);

  const fogC = U.fogColor.value as Color;
  deckScratch.copy(fogC).lerp(ORANGE, smogTint * 0.4).multiplyScalar(0.82 + smogTint * 0.2);
  (U.deckColor.value as Color).copy(deckScratch);
  U.deckTint.value = (dOn ? 1 : 0) * on * (0.14 + 0.42 * smogTint) * (1 - daylight * 0.85);

  const react = !airFlags.rain || low ? 0 : tier === 'medium' ? 0.62 : 1;
  U.rainReact.value = react;
  U.rainSlots.value = react === 0 ? 0 : tier === 'medium' ? 2 : 4;
  U.shaftSlots.value = react === 0 ? 0 : tier === 'medium' ? 2 : 4;
}
