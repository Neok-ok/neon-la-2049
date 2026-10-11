// Debug hook `__nla.windows`. The lit census is on demand; stats() must not call it.
import type { CityLayout } from '../layout';
import { U } from '../../atmosphere/uniforms';
import { setCityWindowDetail } from '../materials/cityMaterial';
import { measureLit, measureLitByDistrict, type LitDistrict } from './lit';
import { setWindowCutoff, windowDetailCompiled, windowState, W } from './state';
import { windowHeroes, type WindowHero } from './heroes';

export function windowsApi(layout: CityLayout) {
  return {
    /** Turn the living branch on or off. Low → on compiles the parallax graph; the cutoff stays 0 until setCutoff. */
    toggle(on?: boolean): boolean {
      const next = on ?? !(Number(W.on.value) > 0.5);
      if (next && !windowDetailCompiled()) setCityWindowDetail(true);
      W.on.value = next ? 1 : 0;
      return next;
    },
    /** Fabric lit fraction for one district, or every district when `id` is omitted. Not a per-frame call. */
    litFraction(id?: string): LitDistrict | LitDistrict[] | null {
      const windowLit = Number(U.windowLit.value);
      const timeSec = Number(U.time.value);
      if (!id) return measureLitByDistrict(layout, windowLit, timeSec);
      return measureLit(layout, id, windowLit, timeSec);
    },
    byDistrict(): LitDistrict[] {
      return measureLitByDistrict(layout, Number(U.windowLit.value), Number(U.time.value));
    },
    setCutoff(metres: number): number {
      return setWindowCutoff(metres);
    },
    get cutoff(): number {
      return Number(W.range.value);
    },
    state: () => windowState(),
    heroes(): readonly WindowHero[] {
      return windowHeroes();
    },
  };
}
