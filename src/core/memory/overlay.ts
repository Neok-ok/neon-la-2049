// In-game memory overlay. Off unless `?mem=1`, so screenshot baselines stay put.
import type { MemoryBudget } from './budget';
import type { Pressure } from './governor';
import type { MemoryReport } from './resources';

export interface OverlaySample {
  budget: MemoryBudget;
  report: MemoryReport;
  pressure: Pressure;
  jsHeap: number;
  jsLimit: number;
  rendererBytes: number;
  rendererTextures: number;
  renderTargets: number;
  residentChunks: { far: number; near: number; lod0: number };
  residentBytes: number;
  hlod: number;
  resolutionScale: number;
}

function mb(n: number): string {
  return (n / (1024 * 1024)).toFixed(1);
}

export function mountMemoryOverlay(read: () => OverlaySample | null): () => void {
  const el = document.createElement('div');
  el.className = 'mem-overlay';
  document.body.appendChild(el);
  let acc = 0;
  let last = performance.now();
  const tick = () => {
    const now = performance.now();
    acc += now - last;
    last = now;
    if (acc < 400) return;
    acc = 0;
    const s = read();
    if (!s) return;
    const r = s.report;
    const lines = [
      `<b>mem</b> ${s.budget.deviceClass} · tab ${mb(s.budget.totalBytes)} MB · ${s.pressure.level === 0 ? 'steady' : `pressure ${s.pressure.level}`}`,
      `<b>heap</b> ${mb(s.jsHeap)} / ${mb(s.budget.jsHeapBytes)} MB · limit ${mb(s.jsLimit)}`,
      `<b>gpu</b> three ${mb(s.rendererBytes)} · tex ${s.rendererTextures} · rt ${s.renderTargets} · scale ${s.resolutionScale.toFixed(2)} · mip ${r.mipBias}`,
      `<b>res</b> geo ${r.counts.geometry} (${mb(r.bytes.geometry)} MB) · tex ${r.counts.texture} (${mb(r.bytes.texture)}) · mat ${r.counts.material} · rt ${r.counts.target}`,
      `<b>city</b> far ${s.residentChunks.far} · near ${s.residentChunks.near} · lod0 ${s.residentChunks.lod0} · ${mb(s.residentBytes)} MB · hlod ${s.hlod}`,
      `<b>guard</b> outside ${r.outside} · tracked ${r.inside} · live ${r.live} · disposed ${r.disposed} · programs ${r.programs}`,
    ];
    if (r.duplicates.length) {
      const d = r.duplicates[0];
      if (d) lines.push(`<b>dup</b> ${d.label} ×${d.count}`);
    }
    if (r.outsideLive.length) {
      const top = r.outsideLive[0];
      if (top) lines.push(`<b>leak</b> ${top.kind} ${top.label} ${mb(top.bytes)} MB outside`);
    }
    el.innerHTML = lines.map((line) => `<div>${line}</div>`).join('');
  };
  const id = window.setInterval(tick, 200);
  tick();
  return () => {
    window.clearInterval(id);
    el.remove();
  };
}
