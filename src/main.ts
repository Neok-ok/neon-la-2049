import './ui/styles.css';
import { App } from './app/App';

declare global {
  interface Window {
    __nla?: ReturnType<App['debugApi']>;
  }
}

function fail(msg: string): void {
  document.getElementById('loading')?.remove();
  const el = document.createElement('div');
  el.className = 'error';
  el.innerHTML = `<div><h2>Neon LA 2049 can't start</h2><p>${msg}</p><p>Try a recent Safari (iOS 17+), Chrome, Edge or Firefox.</p></div>`;
  document.body.appendChild(el);
}

async function main(): Promise<void> {
  const canvas = document.getElementById('view') as HTMLCanvasElement;
  if (!('gpu' in navigator) && !document.createElement('canvas').getContext('webgl2')) {
    fail('This browser supports neither WebGPU nor WebGL2.');
    return;
  }
  const app = new App(canvas);
  try {
    await app.init();
  } catch (e) {
    console.error(e);
    fail(`Renderer failed to initialise: ${(e as Error).message ?? e}`);
    return;
  }
  window.__nla = app.debugApi();
}

void main();
