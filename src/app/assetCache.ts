// Repeat-visit cache shared by the page and the production service worker.
// The build id is injected into index.html; dev builds have no meta, so this stays off.

const HASHED = /\/assets\/[^/]*-[A-Za-z0-9_-]{8,}\./;

export function buildCacheName(): string | null {
  if (!import.meta.env.PROD) return null;
  const id = document.querySelector('meta[name="nla-build"]')?.getAttribute('content');
  return id ? `nla-${id}` : null;
}

export function absUrl(url: string): string {
  return new URL(url, location.href).href;
}

export function isHashedAssetPath(pathname: string): boolean {
  return HASHED.test(pathname);
}

/** Copy hashed responses already in the HTTP cache into the Cache API. */
export async function seedVisitedAssets(): Promise<void> {
  const name = buildCacheName();
  if (!name || !('caches' in window)) return;
  const cache = await caches.open(name);
  const entries = performance.getEntriesByType('resource');
  await Promise.all(entries.map(async (entry) => {
    let url: URL;
    try {
      url = new URL(entry.name);
    } catch {
      return;
    }
    if (url.origin !== location.origin || !isHashedAssetPath(url.pathname)) return;
    if (await cache.match(url.href)) return;
    try {
      const res = await fetch(url.href, { cache: 'force-cache' });
      if (res.ok) await cache.put(url.href, res);
    } catch {
      /* a missed asset just misses the cache */
    }
  }));
}

export async function cacheMatchBuffer(url: string): Promise<ArrayBuffer | null> {
  if (url.startsWith('data:')) return null;
  const name = buildCacheName();
  if (!name || !('caches' in window)) return null;
  try {
    const cache = await caches.open(name);
    const hit = await cache.match(absUrl(url));
    if (!hit) return null;
    return await hit.arrayBuffer();
  } catch {
    return null;
  }
}

export async function cachePutBuffer(url: string, bytes: ArrayBuffer): Promise<void> {
  if (url.startsWith('data:')) return;
  const name = buildCacheName();
  if (!name || !('caches' in window)) return;
  try {
    const cache = await caches.open(name);
    await cache.put(absUrl(url), new Response(bytes.slice(0), { headers: { 'Content-Type': 'application/octet-stream' } }));
  } catch {
    /* ignore */
  }
}
