// Stools the walk camera can sit on. Filled once the market spots are known.
export interface Seat {
  x: number;
  y: number;
  z: number;
  heading: number;
}

let seats: Seat[] = [];

export function setSeats(list: readonly Seat[]): void {
  seats = list.map((s) => ({ x: s.x, y: s.y, z: s.z, heading: s.heading }));
}

export function nearestSeat(x: number, z: number, max = 1.15): Seat | null {
  let best: Seat | null = null;
  let bd = max * max;
  for (const s of seats) {
    const dx = s.x - x, dz = s.z - z;
    const d = dx * dx + dz * dz;
    if (d < bd) { bd = d; best = s; }
  }
  return best;
}
