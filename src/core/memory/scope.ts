// Depth counter for the resource guard. Pure: no three.js, so tests can flip strict mode
// without booting a renderer. The three.js hooks in resources.ts call noteCreation.

let depth = 0;
let strict = false;
let outside = 0;
let inside = 0;

export function inScope(): boolean {
  return depth > 0;
}

export function setStrict(on: boolean): void {
  strict = on;
}

export function isStrict(): boolean {
  return strict;
}

export function scopeCounts(): { outside: number; inside: number } {
  return { outside, inside };
}

export function resetScopeCounts(): void {
  outside = 0;
  inside = 0;
}

export function runTracked<T>(fn: () => T): T {
  depth += 1;
  try {
    return fn();
  } finally {
    depth -= 1;
  }
}

/**
 * A GPU resource was constructed. Inside `runTracked` it belongs to the manager.
 * Outside, strict mode throws (dev `?memguard=1` and the unit test).
 */
export function noteCreation(kind: string): void {
  if (depth > 0) {
    inside += 1;
    return;
  }
  outside += 1;
  if (strict) throw new Error(`${kind} created outside ResourceManager`);
}
