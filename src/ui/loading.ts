// Boot progress. The bar stays up until the opening stream is resident.
// `scheduler.yield` (or a timeout) is the only await that splits a long task.
// An early return is a microtask: the caller keeps running in the same task.

export type LoadPhase = 'start' | 'city' | 'streets' | 'light' | 'districts' | 'opening';

const BANDS: Record<LoadPhase, { label: string; from: number; span: number }> = {
  start: { label: 'Start', from: 0, span: 0.08 },
  city: { label: 'City', from: 0.08, span: 0.2 },
  streets: { label: 'Streets', from: 0.28, span: 0.2 },
  light: { label: 'Light', from: 0.48, span: 0.14 },
  districts: { label: 'Districts', from: 0.62, span: 0.16 },
  opening: { label: 'Opening', from: 0.78, span: 0.22 },
};

const SLICE_MS = 48;
let lastYield = 0;

export function bootMark(name: string): void {
  const mark = { n: name, t: Math.round(performance.now()) };
  const w = window as Window & { __boot?: Array<{ n: string; t: number }> };
  const boot = w.__boot ?? (w.__boot = []);
  boot.push(mark);
}

export function loadFraction(phase: LoadPhase, local = 0): number {
  const band = BANDS[phase];
  const t = Math.min(1, Math.max(0, local));
  return Math.min(1, band.from + band.span * t);
}

export function paintLoad(phase: LoadPhase, local = 0): void {
  const root = document.getElementById('loading');
  if (!root) return;
  const band = BANDS[phase];
  const pct = Math.round(loadFraction(phase, local) * 100);
  const bar = root.querySelector<HTMLElement>('[data-load-bar]');
  const label = root.querySelector('[data-load-label]');
  if (bar) bar.style.width = `${pct}%`;
  if (label) label.textContent = band.label;
  root.setAttribute('aria-valuenow', String(pct));
}

/** Paint, then yield once this slice has been on the main thread for ~48 ms. */
export async function paceLoad(phase: LoadPhase, local = 0, force = false): Promise<void> {
  paintLoad(phase, local);
  const now = performance.now();
  if (!force && now - lastYield < SLICE_MS) return;
  const sched = (globalThis as { scheduler?: { yield?: () => Promise<void> } }).scheduler;
  if (sched?.yield) await sched.yield();
  else await new Promise<void>((resolve) => { setTimeout(resolve, 0); });
  lastYield = performance.now();
}
