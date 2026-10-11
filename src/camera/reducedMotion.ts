// OS reduced-motion, plus a calm switch the photo sheet can set. Shake and motion blur read this.

const KEY = 'nla.camera.calm';

let osReduce = false;
let calm = false;

function readStored(): boolean {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

if (typeof matchMedia === 'function') {
  const mq = matchMedia('(prefers-reduced-motion: reduce)');
  osReduce = mq.matches;
  mq.addEventListener?.('change', () => { osReduce = mq.matches; });
}
calm = readStored();

export function reducedMotion(): boolean {
  return osReduce || calm;
}

export function calmCamera(): boolean {
  return calm;
}

export function setCalmCamera(on: boolean): void {
  calm = on;
  try {
    localStorage.setItem(KEY, on ? '1' : '0');
  } catch {
    /* private mode */
  }
}
