// Tiled shutter. The picture is drawn through the existing canvas, one tile at a time,
// so a phone never allocates a framebuffer the size of the file. The 2D canvas that
// holds the JPEG is CPU memory and stays under the tier's pixel cap.
import { FramebufferTexture, type PerspectiveCamera, type WebGPURenderer } from 'three/webgpu';
import { CAPTURE_CAPS, frameSize, visibleFraction } from './limits';
import type { PhotoPipeline } from './pipeline';
import type { CaptureRequest, CaptureResult, LetterboxId, SaveMethod } from './types';
import type { Tier } from '../core/quality';

interface Shot {
  renderer: WebGPURenderer;
  camera: PerspectiveCamera;
  pipeline: PhotoPipeline;
  tier: Tier;
  letterbox: LetterboxId;
  focal: number;
  backend: string;
  lock: (on: boolean) => void;
}

interface Tile {
  tx: number;
  ty: number;
  colW: number;
  rowH: number;
  vw: number;
  vh: number;
  vx: number;
  vy: number;
  ovL: number;
  ovT: number;
  fullW: number;
  fullH: number;
}

export interface ShotFile {
  result: CaptureResult;
  blob: Blob | null;
}

export async function captureShot(shot: Shot, req: CaptureRequest, stem: string): Promise<ShotFile> {
  const kind = req.kind ?? 'screen';
  const box: LetterboxId = kind === 'wallpaper' ? '9:19.5' : shot.letterbox;
  const viewW = Math.max(1, innerWidth);
  const viewH = Math.max(1, innerHeight);
  const frame = frameSize(kind, box, shot.tier, viewW, viewH);
  const heapBefore = heap();
  let heapPeak = heapBefore;
  const t0 = performance.now();
  const filename = `neon-la-${stem}-${req.exact ? req.exact.w : frame.w}x${req.exact ? req.exact.h : frame.h}.jpg`;
  const fail = (error: string): ShotFile => ({
    blob: null,
    result: {
      ok: false, width: 0, height: 0, kind, ms: performance.now() - t0, renderMs: 0, tiles: 0,
      bytes: 0, heapBefore, heapPeak, method: 'none', readback: false, capped: frame.capped,
      filename, center: [0, 0, 0, 0], error,
    },
  });

  const picture = document.createElement('canvas');
  picture.width = frame.w;
  picture.height = frame.h;
  const ctx = picture.getContext('2d', { willReadFrequently: true });
  if (!ctx) return fail('no 2d canvas');
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, frame.w, frame.h);

  const tiles = planTiles(shot, frame.w, frame.h, viewW, viewH, box);
  const saved = saveGl(shot);
  let renderMs = 0;
  let readback = false;
  shot.lock(true);
  try {
    renderMs += drawTiles(shot, ctx, tiles, false);
    heapPeak = Math.max(heapPeak ?? 0, heap() ?? 0);
    if (dead(ctx, frame.w, frame.h)) {
      readback = true;
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, frame.w, frame.h);
      renderMs += await drawTilesAsync(shot, ctx, tiles);
      heapPeak = Math.max(heapPeak ?? 0, heap() ?? 0);
    }
  } catch (err) {
    restoreGl(shot, saved);
    shot.lock(false);
    return fail(err instanceof Error ? err.message : 'capture failed');
  }
  restoreGl(shot, saved);
  shot.lock(false);

  let out = picture;
  let width = frame.w;
  let height = frame.h;
  if (req.exact) {
    out = matte(picture, req.exact.w, req.exact.h);
    width = req.exact.w;
    height = req.exact.h;
  }
  const center = sampleCenter(out);
  let blob: Blob;
  try {
    blob = await blobOf(out);
  } catch (err) {
    return fail(err instanceof Error ? err.message : 'encode failed');
  }
  heapPeak = Math.max(heapPeak ?? 0, heap() ?? 0);
  const present = req.present !== false;
  const method: SaveMethod | 'none' = present ? await presentImage(blob, filename) : 'none';
  return {
    blob,
    result: {
      ok: center[0] + center[1] + center[2] > 0,
      width, height, kind, ms: performance.now() - t0, renderMs, tiles: tiles.length,
      bytes: blob.size, heapBefore, heapPeak, method, readback, capped: frame.capped,
      filename, center,
    },
  };
}

function planTiles(shot: Shot, cropW: number, cropH: number, viewW: number, viewH: number, box: LetterboxId): Tile[] {
  const cap = CAPTURE_CAPS[shot.tier];
  let overlap = shot.pipeline.heavyBloom ? 48 : 24;
  let core = cap.tile - overlap * 2;
  if (core < 64) {
    overlap = Math.floor(cap.tile / 8);
    core = Math.max(32, cap.tile - overlap * 2);
  }
  const frac = visibleFraction(viewW, viewH, box);
  const fullW = Math.max(cropW, Math.round(cropW / frac.w));
  const fullH = Math.max(cropH, Math.round(cropH / frac.h));
  const cropX = Math.round(frac.x * fullW);
  const cropY = Math.round(frac.y * fullH);
  const tiles: Tile[] = [];
  for (let ty = 0; ty < cropH;) {
    const rowH = Math.min(core, cropH - ty);
    for (let tx = 0; tx < cropW;) {
      const colW = Math.min(core, cropW - tx);
      const ovL = Math.min(overlap, tx);
      const ovT = Math.min(overlap, ty);
      const ovR = Math.min(overlap, cropW - (tx + colW));
      const ovB = Math.min(overlap, cropH - (ty + rowH));
      tiles.push({
        tx, ty, colW, rowH,
        vw: colW + ovL + ovR,
        vh: rowH + ovT + ovB,
        vx: cropX + tx - ovL,
        vy: cropY + ty - ovT,
        ovL, ovT, fullW, fullH,
      });
      tx += colW;
    }
    ty += rowH;
  }
  return tiles;
}

function aimTile(shot: Shot, tile: Tile): void {
  const cam = shot.camera;
  shot.renderer.setPixelRatio(1);
  shot.renderer.setSize(tile.vw, tile.vh, false);
  cam.aspect = tile.fullW / tile.fullH;
  cam.setFocalLength(shot.focal);
  cam.setViewOffset(tile.fullW, tile.fullH, tile.vx, tile.vy, tile.vw, tile.vh);
}

function drawTiles(shot: Shot, ctx: CanvasRenderingContext2D, tiles: Tile[], _flip: boolean): number {
  let renderMs = 0;
  for (const tile of tiles) {
    aimTile(shot, tile);
    shot.pipeline.setTile(tile);
    const t = performance.now();
    shot.pipeline.renderTile();
    blitCanvas(ctx, shot.renderer.domElement, tile, _flip);
    renderMs += performance.now() - t;
  }
  return renderMs;
}

async function drawTilesAsync(shot: Shot, ctx: CanvasRenderingContext2D, tiles: Tile[]): Promise<number> {
  const webgl = shot.backend === 'WebGL2';
  let renderMs = 0;
  for (const tile of tiles) {
    aimTile(shot, tile);
    shot.pipeline.setTile(tile);
    const t = performance.now();
    shot.pipeline.renderTile();
    const tex = new FramebufferTexture(tile.vw, tile.vh);
    shot.renderer.copyFramebufferToTexture(tex);
    const buf = await (shot.renderer.backend as unknown as {
      copyTextureToBuffer(texture: FramebufferTexture, x: number, y: number, w: number, h: number, face: number): Promise<ArrayBufferView>;
    }).copyTextureToBuffer(tex, 0, 0, tile.vw, tile.vh, 0);
    tex.dispose();
    blitBuffer(ctx, buf, tile, webgl);
    renderMs += performance.now() - t;
  }
  return renderMs;
}

function blitCanvas(ctx: CanvasRenderingContext2D, source: HTMLCanvasElement, tile: Tile, _flip: boolean): void {
  ctx.drawImage(source, tile.ovL, tile.ovT, tile.colW, tile.rowH, tile.tx, tile.ty, tile.colW, tile.rowH);
}

function blitBuffer(ctx: CanvasRenderingContext2D, buf: ArrayBufferView, tile: Tile, webgl: boolean): void {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
  const bpp = 4;
  const tight = tile.vw * bpp;
  const stride = Math.max(tight, Math.floor(bytes.byteLength / tile.vh));
  const image = ctx.createImageData(tile.colW, tile.rowH);
  for (let row = 0; row < tile.rowH; row++) {
    const srcRow = webgl ? tile.vh - (tile.ovT + row) - 1 : tile.ovT + row;
    const src = srcRow * stride + tile.ovL * bpp;
    image.data.set(bytes.subarray(src, src + tile.colW * bpp), row * tile.colW * bpp);
  }
  ctx.putImageData(image, tile.tx, tile.ty);
}

function dead(ctx: CanvasRenderingContext2D, w: number, h: number): boolean {
  const spots: Array<[number, number]> = [
    [w * 0.5, h * 0.5],
    [w * 0.25, h * 0.35],
    [w * 0.75, h * 0.65],
  ];
  for (const [x, y] of spots) {
    const d = ctx.getImageData(Math.max(0, Math.floor(x)), Math.max(0, Math.floor(y)), 1, 1).data;
    if ((d[0] ?? 0) + (d[1] ?? 0) + (d[2] ?? 0) > 0) return false;
  }
  return true;
}

function matte(picture: HTMLCanvasElement, w: number, h: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const g = canvas.getContext('2d')!;
  g.fillStyle = '#000';
  g.fillRect(0, 0, w, h);
  const scale = Math.min(w / picture.width, h / picture.height);
  const dw = Math.round(picture.width * scale);
  const dh = Math.round(picture.height * scale);
  g.drawImage(picture, Math.round((w - dw) / 2), Math.round((h - dh) / 2), dw, dh);
  return canvas;
}

function sampleCenter(canvas: HTMLCanvasElement): [number, number, number, number] {
  const g = canvas.getContext('2d', { willReadFrequently: true });
  if (!g) return [0, 0, 0, 0];
  const d = g.getImageData(Math.floor(canvas.width / 2), Math.floor(canvas.height / 2), 1, 1).data;
  return [d[0] ?? 0, d[1] ?? 0, d[2] ?? 0, d[3] ?? 0];
}

function blobOf(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('jpeg encode failed'))), 'image/jpeg', 0.92);
  });
}

function heap(): number | null {
  return (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize ?? null;
}

interface GlState {
  pr: number;
  fov: number;
  near: number;
  aspect: number;
}

function saveGl(shot: Shot): GlState {
  return {
    pr: shot.renderer.getPixelRatio(),
    fov: shot.camera.fov,
    near: shot.camera.near,
    aspect: shot.camera.aspect,
  };
}

function restoreGl(shot: Shot, saved: GlState): void {
  shot.camera.clearViewOffset();
  shot.camera.aspect = innerWidth / Math.max(1, innerHeight);
  shot.camera.fov = saved.fov;
  shot.camera.near = saved.near;
  shot.camera.updateProjectionMatrix();
  shot.renderer.setPixelRatio(saved.pr);
  shot.renderer.setSize(innerWidth, innerHeight, false);
}

async function presentImage(blob: Blob, filename: string): Promise<SaveMethod> {
  const file = new File([blob], filename, { type: 'image/jpeg' });
  const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean };
  if (ios() && nav.canShare?.({ files: [file] }) && typeof nav.share === 'function') {
    try {
      await nav.share({ files: [file], title: 'Neon LA 2049' });
      return 'share';
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return 'share';
    }
  }
  const url = URL.createObjectURL(blob);
  if (!ios()) {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 4000);
    return 'download';
  }
  const tab = window.open(url, '_blank');
  if (tab) return 'tab';
  showOverlay(url);
  return 'overlay';
}

function ios(): boolean {
  const ua = navigator.userAgent;
  return /iPhone|iPad|iPod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

function showOverlay(url: string): void {
  const old = document.querySelector('.photo-save');
  old?.remove();
  const root = document.createElement('div');
  root.className = 'photo-save';
  root.innerHTML = '<p>Long-press the picture, then Save Image.</p>';
  const img = document.createElement('img');
  img.src = url;
  img.alt = 'Neon LA still';
  const close = document.createElement('button');
  close.textContent = 'Close';
  close.addEventListener('click', () => {
    URL.revokeObjectURL(url);
    root.remove();
  });
  root.append(img, close);
  document.body.appendChild(root);
}

/** Data URL of a JPEG, for the bench. Not used by the shutter itself. */
export function imageDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}
