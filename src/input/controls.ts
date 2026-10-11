// View and keyboard preferences. Graphics tier stays in nla.quality; this key is only look, field of view, and binds.
const KEY = 'nla.controls';

export const FOV_MIN = 50;
export const FOV_MAX = 110;
export const FOV_DEFAULT = 70;
/** Chase camera at the default field of view. The slider scales this with the walk value. */
const FLY_FOV_AT_DEFAULT = 62;

export const SENS_MIN = 0.25;
export const SENS_MAX = 2.5;
export const SENS_DEFAULT = 1;

export const ACTIONS = [
  'forward', 'back', 'left', 'right',
  'up', 'down', 'boost',
  'lookLeft', 'lookRight', 'lookUp', 'lookDown',
  'interact', 'cockpit',
] as const;

export type Action = (typeof ACTIONS)[number];

export const ACTION_LABELS: Record<Action, string> = {
  forward: 'Forward',
  back: 'Back',
  left: 'Strafe left',
  right: 'Strafe right',
  up: 'Rise',
  down: 'Drop',
  boost: 'Boost / run',
  lookLeft: 'Look left',
  lookRight: 'Look right',
  lookUp: 'Look up',
  lookDown: 'Look down',
  interact: 'Sit / stand',
  cockpit: 'Cockpit',
};

/** One primary code per action. Matches the keys the game shipped with. */
export const DEFAULT_BINDS: Record<Action, string> = {
  forward: 'KeyW',
  back: 'KeyS',
  left: 'KeyA',
  right: 'KeyD',
  up: 'Space',
  down: 'KeyC',
  boost: 'ShiftLeft',
  lookLeft: 'ArrowLeft',
  lookRight: 'ArrowRight',
  lookUp: 'ArrowUp',
  lookDown: 'ArrowDown',
  interact: 'KeyE',
  cockpit: 'KeyV',
};

/** Extra codes that stay active while that action's primary is still the default. */
const LEGACY: Partial<Record<Action, readonly string[]>> = {
  up: ['KeyE'],
  down: ['KeyQ', 'ControlLeft'],
  boost: ['ShiftRight'],
};

/** Menu and mode keys. They are not rebindable. */
const RESERVED = new Set([
  'Digit1', 'Digit2', 'Digit3', 'KeyF', 'KeyN', 'KeyH', 'KeyM', 'KeyP', 'KeyB',
  'BracketLeft', 'BracketRight', 'Escape', 'Tab', 'Enter',
  'MetaLeft', 'MetaRight', 'AltLeft', 'AltRight', 'ContextMenu',
]);

export interface ControlPrefs {
  fov: number;
  lookSensitivity: number;
  invertLook: boolean;
  binds: Record<Action, string>;
}

export const controlPrefs: ControlPrefs = {
  fov: FOV_DEFAULT,
  lookSensitivity: SENS_DEFAULT,
  invertLook: false,
  binds: { ...DEFAULT_BINDS },
};

const listeners = new Set<() => void>();

function storage(): Storage | null {
  try {
    return localStorage;
  } catch {
    return null;
  }
}

function clampFov(n: unknown): number {
  const v = typeof n === 'number' ? n : Number.NaN;
  if (!Number.isFinite(v)) return FOV_DEFAULT;
  return Math.min(FOV_MAX, Math.max(FOV_MIN, Math.round(v)));
}

function clampSens(n: unknown): number {
  const v = typeof n === 'number' ? n : Number.NaN;
  if (!Number.isFinite(v)) return SENS_DEFAULT;
  const stepped = Math.round(v * 100) / 100;
  return Math.min(SENS_MAX, Math.max(SENS_MIN, stepped));
}

const SPARE_KEYS = ['KeyQ', 'KeyR', 'KeyT', 'KeyG', 'KeyZ', 'KeyX', 'KeyY', 'KeyU', 'KeyI', 'KeyO', 'KeyJ', 'KeyK', 'KeyL'];

function validCode(code: unknown): code is string {
  return typeof code === 'string' && /^[A-Za-z0-9]+$/.test(code) && !RESERVED.has(code);
}

/** Accept stored binds, then give any leftover duplicate the next free spare key. */
function uniqueBinds(raw: Partial<Record<Action, string>> | undefined): Record<Action, string> {
  const next: Record<Action, string> = { ...DEFAULT_BINDS };
  const claimed = new Set<string>();
  for (const action of ACTIONS) {
    const code = raw?.[action];
    if (!validCode(code) || claimed.has(code)) continue;
    next[action] = code;
    claimed.add(code);
  }
  const seen = new Set<string>();
  for (const action of ACTIONS) {
    if (seen.has(next[action])) {
      const free = SPARE_KEYS.find((code) => !seen.has(code));
      if (free) next[action] = free;
    }
    seen.add(next[action]);
  }
  return next;
}

function load(): void {
  const raw = storage()?.getItem(KEY);
  if (!raw) return;
  try {
    const p = JSON.parse(raw) as Partial<ControlPrefs> & { binds?: Partial<Record<Action, string>> };
    controlPrefs.fov = clampFov(p.fov);
    controlPrefs.lookSensitivity = clampSens(p.lookSensitivity);
    controlPrefs.invertLook = p.invertLook === true;
    controlPrefs.binds = uniqueBinds(p.binds);
  } catch {
    /* private mode, or a broken value */
  }
}

load();

function write(): void {
  try {
    storage()?.setItem(KEY, JSON.stringify({
      fov: controlPrefs.fov,
      lookSensitivity: controlPrefs.lookSensitivity,
      invertLook: controlPrefs.invertLook,
      binds: controlPrefs.binds,
    }));
  } catch {
    /* ignore */
  }
  for (const fn of listeners) fn();
}

export function onControls(fn: () => void): void {
  listeners.add(fn);
}

export function setFov(fov: number): void {
  controlPrefs.fov = clampFov(fov);
  write();
}

export function setLookSensitivity(sens: number): void {
  controlPrefs.lookSensitivity = clampSens(sens);
  write();
}

export function setInvertLook(on: boolean): void {
  controlPrefs.invertLook = on;
  write();
}

/** Walk uses the slider. Fly keeps a slightly tighter chase view at the default 70°. */
export function applyViewFov(camera: { fov: number; updateProjectionMatrix(): void }, mode: 'walk' | 'fly'): void {
  const fov = mode === 'walk' ? controlPrefs.fov : FLY_FOV_AT_DEFAULT * (controlPrefs.fov / FOV_DEFAULT);
  if (camera.fov === fov) return;
  camera.fov = fov;
  camera.updateProjectionMatrix();
}

/** Yaw multiplier, and the pitch multiplier (negative when look is inverted). */
export function lookScale(): { sens: number; pitch: number } {
  const sens = controlPrefs.lookSensitivity;
  return { sens, pitch: controlPrefs.invertLook ? -sens : sens };
}

function ownerOf(code: string): Action | undefined {
  return ACTIONS.find((action) => controlPrefs.binds[action] === code);
}

/** Codes that currently perform this action, including the old alternate keys when they still apply. */
export function codesFor(action: Action): string[] {
  const primary = controlPrefs.binds[action];
  const codes = [primary];
  if (primary !== DEFAULT_BINDS[action]) return codes;
  for (const extra of LEGACY[action] ?? []) {
    const owner = ownerOf(extra);
    if (!owner) {
      codes.push(extra);
      continue;
    }
    // Fly still climbs with E while E is the sit key. That overlap is the original layout.
    const defaultOverlap = extra === 'KeyE' && action === 'up' && owner === 'interact'
      && controlPrefs.binds.interact === DEFAULT_BINDS.interact
      && controlPrefs.binds.up === DEFAULT_BINDS.up;
    if (defaultOverlap) codes.push(extra);
  }
  return codes;
}

export function tryBind(action: Action, code: string): string | null {
  if (!/^[A-Za-z0-9]+$/.test(code)) return 'That key cannot be bound.';
  if (RESERVED.has(code)) return 'That key is reserved for the menu.';
  const owner = ownerOf(code);
  if (owner && owner !== action) return `${keyLabel(code)} is already ${ACTION_LABELS[owner]}.`;
  if (controlPrefs.binds[action] === code) return null;
  controlPrefs.binds[action] = code;
  write();
  return null;
}

export function resetControls(): void {
  controlPrefs.fov = FOV_DEFAULT;
  controlPrefs.lookSensitivity = SENS_DEFAULT;
  controlPrefs.invertLook = false;
  controlPrefs.binds = { ...DEFAULT_BINDS };
  write();
}

const KEY_NAMES: Record<string, string> = {
  Space: 'Space',
  ShiftLeft: 'Shift',
  ShiftRight: 'R-Shift',
  ControlLeft: 'Ctrl',
  ControlRight: 'R-Ctrl',
  ArrowLeft: '←',
  ArrowRight: '→',
  ArrowUp: '↑',
  ArrowDown: '↓',
  Enter: 'Enter',
  Backspace: 'Bksp',
  Tab: 'Tab',
  Escape: 'Esc',
};

export function keyLabel(code: string): string {
  if (KEY_NAMES[code]) return KEY_NAMES[code];
  if (code.startsWith('Key') && code.length === 4) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return `Num ${code.slice(6)}`;
  return code;
}

let gameplayHold = false;
const holdListeners = new Set<() => void>();

/** Settings is open: gameplay keys and sticks do nothing until it closes. */
export function gameplayHeld(): boolean {
  return gameplayHold;
}

export function setGameplayHeld(on: boolean): void {
  gameplayHold = on;
  if (on) for (const fn of holdListeners) fn();
}

export function onGameplayHeld(fn: () => void): void {
  holdListeners.add(fn);
}
