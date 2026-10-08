// Pure module (worker-safe). Neon sign colours shared by the sign shader, light pools and the market kit.
// Indices match SignColor in src/world/fabric/types.ts.

export const SIGN_RGB: readonly [number, number, number][] = [
  [1.0, 0.18, 0.55], // pink
  [0.15, 0.85, 1.0], // cyan
  [1.0, 0.55, 0.12], // amber
  [1.0, 0.12, 0.1], // red
  [0.1, 1.0, 0.65], // teal
  [0.62, 0.25, 1.0], // violet
  [0.85, 0.92, 1.0], // white
  [1.0, 0.9, 0.2], // yellow
];
