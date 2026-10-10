// Mute and volume, remembered across reloads. The toolbar and the M key share this.
const KEY = 'nla.audio';

export interface AudioPrefs {
  muted: boolean;
  /** 0..1 master gain. 0.8 matches the bed from before the slider existed. */
  volume: number;
}

export const audioPrefs: AudioPrefs = { muted: false, volume: 0.8 };

const listeners = new Set<() => void>();

function load(): void {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return;
    const p = JSON.parse(raw) as Partial<AudioPrefs>;
    if (typeof p.muted === 'boolean') audioPrefs.muted = p.muted;
    if (typeof p.volume === 'number' && Number.isFinite(p.volume)) {
      audioPrefs.volume = Math.max(0, Math.min(1, p.volume));
    }
  } catch {
    /* private mode, or a broken value */
  }
}

load();

export function writeAudioPrefs(): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ muted: audioPrefs.muted, volume: audioPrefs.volume }));
  } catch {
    /* ignore */
  }
  for (const fn of listeners) fn();
}

export function onAudioPrefs(fn: () => void): void {
  listeners.add(fn);
}
