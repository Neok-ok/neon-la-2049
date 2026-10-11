// Last frame's wind and rain, so flight and street cameras can shiver in a storm
// without the camera module importing the weather system.

let wind = 0;
let rain = 0;

export function setDisturbance(nextWind: number, nextRain: number): void {
  wind = nextWind;
  rain = nextRain;
}

/** 0 in clear air, 1 in a hard storm. */
export function stormEnergy(): number {
  return Math.max(0, Math.min(1, rain * 0.72 + wind * 0.4));
}
