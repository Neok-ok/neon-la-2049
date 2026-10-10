// DOM UI: title card, mode switcher, quality menu, toggles, letterbox + fade for the cinematic camera.
import type { ModeId } from '../camera/types';
import { TIERS, type Tier } from '../core/quality';
import { WEATHER, type WeatherId } from '../atmosphere/Weather';
import { audioPrefs, onAudioPrefs } from '../audio/prefs';
import { activeAmbience } from '../audio/Ambience';

export interface UICallbacks {
  setMode(m: ModeId): void;
  setQuality(t: Tier | 'auto'): void;
  toggleHUD(): void;
  toggleSound(): boolean;
  setWeather(w: WeatherId): void;
  setTime(h: number): void;
  nextShot(): void;
  start(m: ModeId): void;
}

export class UI {
  private bar: HTMLDivElement;
  private modeBtns = new Map<ModeId, HTMLButtonElement>();
  private letterbox: HTMLDivElement;
  private fadeEl: HTMLDivElement;
  private title: HTMLDivElement | null = null;
  private qualitySel: HTMLSelectElement;
  private soundBtn: HTMLButtonElement;
  private volume: HTMLInputElement;
  private nextBtn: HTMLButtonElement;
  private toast: HTMLDivElement;
  private toastTimer = 0;

  constructor(private cb: UICallbacks, opts: { show: boolean; quality: Tier | 'auto'; autoTier: Tier; showTitle: boolean }) {
    this.letterbox = div('letterbox', '<div class="lb top"></div><div class="lb bottom"></div>');
    this.fadeEl = div('fade');
    this.toast = div('toast');
    this.bar = div('toolbar');
    if (!opts.show) this.bar.style.display = 'none';

    const modes: Array<[ModeId, string, string]> = [['fly', 'Fly', 'Spinner (F)'], ['walk', 'Walk', 'Street level (F)'], ['cine', 'Cinematic', 'Auto camera (3)']];
    for (const [id, label, title] of modes) {
      const b = button(label, () => cb.setMode(id));
      b.title = title;
      this.modeBtns.set(id, b);
      this.bar.appendChild(b);
    }
    this.nextBtn = button('Next shot ▸', () => cb.nextShot());
    this.bar.appendChild(this.nextBtn);
    // secondary controls collapse behind a toggle on phones / narrow screens
    const more = document.createElement('div');
    more.className = 'more';
    const moreBtn = button('⋯', () => this.bar.classList.toggle('open'));
    moreBtn.className = 'more-toggle';
    moreBtn.title = 'More settings';
    this.bar.appendChild(moreBtn);
    this.bar.appendChild(more);
    if (matchMedia('(pointer: coarse)').matches) this.bar.classList.add('touch');

    this.qualitySel = document.createElement('select');
    this.qualitySel.title = 'Quality';
    this.qualitySel.appendChild(new Option(`Auto (${opts.autoTier})`, 'auto'));
    for (const t of TIERS) this.qualitySel.appendChild(new Option(t[0].toUpperCase() + t.slice(1), t));
    this.qualitySel.value = opts.quality;
    this.qualitySel.addEventListener('change', () => cb.setQuality(this.qualitySel.value as Tier | 'auto'));
    more.appendChild(this.qualitySel);

    const weatherSel = document.createElement('select');
    weatherSel.title = 'Weather (changes on its own; pick to force)';
    weatherSel.appendChild(new Option('Weather: auto', ''));
    for (const [id, d] of Object.entries(WEATHER)) weatherSel.appendChild(new Option(d.label, id));
    weatherSel.addEventListener('change', () => {
      if (weatherSel.value) cb.setWeather(weatherSel.value as WeatherId);
      weatherSel.value = '';
    });
    more.appendChild(weatherSel);

    const timeSel = document.createElement('select');
    timeSel.title = 'Jump to time of day';
    timeSel.appendChild(new Option('Time…', ''));
    for (const [label, h] of [['Dawn 06:00', 6], ['Noon 12:00', 12], ['Dusk 18:30', 18.5], ['Night 22:00', 22], ['3 AM', 3]] as const) timeSel.appendChild(new Option(label, String(h)));
    timeSel.addEventListener('change', () => {
      if (timeSel.value) cb.setTime(Number(timeSel.value));
      timeSel.value = '';
    });
    more.appendChild(timeSel);

    this.soundBtn = button(`Sound: ${audioPrefs.muted ? 'off' : 'on'}`, () => {
      cb.toggleSound();
    });
    this.soundBtn.title = 'Mute (M). The choice is remembered.';
    more.appendChild(this.soundBtn);
    const vol = document.createElement('label');
    vol.className = 'vol';
    vol.textContent = 'Vol';
    this.volume = document.createElement('input');
    this.volume.type = 'range';
    this.volume.min = '0';
    this.volume.max = '100';
    this.volume.step = '1';
    this.volume.value = String(Math.round(audioPrefs.volume * 100));
    this.volume.title = 'Volume. Remembered after reload.';
    this.volume.addEventListener('input', () => {
      activeAmbience()?.setVolume(Number(this.volume.value) / 100);
    });
    vol.appendChild(this.volume);
    more.appendChild(vol);
    onAudioPrefs(() => this.syncSound());
    more.appendChild(button('HUD', () => cb.toggleHUD()));
    const help = button('?', () => this.showHelp());
    help.title = 'Controls';
    more.appendChild(help);

    if (opts.showTitle) this.showTitle();
  }

  private showTitle(): void {
    const t = div(
      'title-card',
      `<h1>NEON LA <span>2049</span></h1>
       <p class="sub">A fan-made tribute to the Los Angeles of <i>Blade Runner 2049</i>. Not affiliated with the film's makers.</p>
       <div class="choices"></div>
       <p class="hint">Desktop: WASD + mouse (click to capture), Space/C up/down, Shift boost, F fly/walk, V cockpit, H HUD.<br/>
       iPhone: left stick moves, right stick looks, ▲▼ climb in the spinner.</p>`,
    );
    const ch = t.querySelector('.choices')!;
    for (const [m, label] of [['fly', 'Fly a spinner'], ['walk', 'Walk the streets'], ['cine', 'Watch (cinematic)']] as Array<[ModeId, string]>) {
      ch.appendChild(button(label, () => { this.hideTitle(); this.cb.start(m); }));
    }
    this.title = t;
  }

  hideTitle(): void {
    this.title?.remove();
    this.title = null;
  }

  showHelp(): void {
    this.flash(
      'Fly: WASD thrust · mouse/arrow keys steer · Space/E up · C/Q down · Shift boost · V cockpit<br/>' +
        'Walk: WASD · mouse look · Shift run · E sit at a stall<br/>1 Fly · 2 Walk · 3 Cinematic · F toggle fly/walk · N next shot · H HUD · M mute · volume slider remembers · [ ] time −/+1 h · B next weather',
      7000,
    );
  }

  flash(html: string, ms = 2500): void {
    this.toast.innerHTML = html;
    this.toast.classList.add('show');
    clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => this.toast.classList.remove('show'), ms);
  }

  private syncSound(): void {
    this.soundBtn.textContent = `Sound: ${audioPrefs.muted ? 'off' : 'on'}`;
    const next = String(Math.round(audioPrefs.volume * 100));
    if (this.volume.value !== next) this.volume.value = next;
  }

  setMode(m: ModeId): void {
    for (const [id, b] of this.modeBtns) b.classList.toggle('active', id === m);
    this.letterbox.classList.toggle('on', m === 'cine');
    this.nextBtn.style.display = m === 'cine' ? '' : 'none';
  }

  setQualityValue(v: Tier | 'auto'): void {
    this.qualitySel.value = v;
  }

  fade(v: number): void {
    this.fadeEl.style.opacity = String(v);
  }
}

function div(cls: string, html = ''): HTMLDivElement {
  const d = document.createElement('div');
  d.className = cls;
  d.innerHTML = html;
  document.body.appendChild(d);
  return d;
}

function button(label: string, fn: () => void): HTMLButtonElement {
  const b = document.createElement('button');
  b.textContent = label;
  b.addEventListener('click', (e) => {
    e.stopPropagation();
    fn();
    (b as HTMLButtonElement).blur();
  });
  return b;
}
