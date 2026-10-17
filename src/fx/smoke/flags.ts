// The plume stays out of a normal load until the night stills clear 7.
// `?smoke=live` draws it. `?smoke=off` hides it. Visual capture (`?capture=1`)
// keeps the baseline plates unless live is set.
import { params } from '../../core/params';

/** Set true only after realism, technical, and film each score the night stills at 7 or higher. */
export const SMOKE_DEFAULT = false;

export function smokeActive(): boolean {
  if (params.smoke === 'off') return false;
  if (params.smoke === 'live') return true;
  if (params.capture) return false;
  return SMOKE_DEFAULT;
}
