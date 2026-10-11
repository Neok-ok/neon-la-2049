import { createHash } from 'node:crypto';
import { createReadStream, existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';

const root = dirname(fileURLToPath(import.meta.url));

function harnessFiles(): Plugin {
  // Dev-only. Film stills and round glbs stay out of the production build.
  const mounts = [
    { url: '/harness-refs', dir: join(root, 'tools/model-harness/.refs') },
    { url: '/harness-models', dir: join(root, 'tools/model-harness/.rounds') },
  ];
  return {
    name: 'harness-files',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const raw = req.url?.split('?')[0] ?? '';
        const mount = mounts.find((item) => raw.startsWith(`${item.url}/`));
        if (!mount) return next();
        const rel = normalize(decodeURIComponent(raw.slice(mount.url.length + 1)));
        if (rel.startsWith('..') || rel.includes('..')) return next();
        const file = join(mount.dir, rel);
        if (!file.startsWith(mount.dir) || !existsSync(file) || !statSync(file).isFile()) return next();
        res.statusCode = 200;
        if (file.endsWith('.jpg') || file.endsWith('.jpeg')) res.setHeader('Content-Type', 'image/jpeg');
        else if (file.endsWith('.png')) res.setHeader('Content-Type', 'image/png');
        else if (file.endsWith('.glb')) res.setHeader('Content-Type', 'model/gltf-binary');
        else if (file.endsWith('.json')) res.setHeader('Content-Type', 'application/json');
        createReadStream(file).pipe(res);
      });
    },
  };
}

// Relative base so the same build works at https://<user>.github.io/<repo>/ and locally.
// GitHub Pages will not honour custom Cache-Control, so repeat visits use a service worker
// plus content-hashed filenames. The worker is emitted unhashed as /sw.js.
export default defineConfig({
  base: './',
  plugins: [serviceWorkerPlugin(), harnessFiles()],
  worker: { format: 'es' },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 2000,
    rollupOptions: {
      output: {
        entryFileNames: 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
        manualChunks(id, { getModuleInfo }) {
          if (!id.includes('node_modules/three')) return null;
          // Worker builds keep their own three subset inside the worker file.
          const stack = [id];
          const seen = new Set<string>();
          while (stack.length) {
            const cur = stack.pop();
            if (!cur || seen.has(cur)) continue;
            seen.add(cur);
            if (cur.includes('.worker')) return null;
            const info = getModuleInfo(cur);
            if (!info) continue;
            for (const importer of info.importers) stack.push(importer);
          }
          return 'three';
        },
      },
    },
  },
});

function serviceWorkerSource(version: string): string {
  return `/* Neon LA 2049 repeat-visit cache. Generated. Version ${version}. */
const CACHE = 'nla-${version}';
const HASHED = /\\/assets\\/[^/]*-[A-Za-z0-9_-]{8,}\\./;

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

async function cacheFirst(req) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) await cache.put(req, res.clone());
  return res;
}

async function networkFirst(req) {
  const cache = await caches.open(CACHE);
  try {
    const res = await fetch(req);
    if (res.ok) await cache.put(req, res.clone());
    return res;
  } catch (err) {
    const hit = (await cache.match(req)) || (await cache.match('./')) || (await cache.match('index.html'));
    if (hit) return hit;
    throw err;
  }
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.endsWith('/sw.js')) return;
  if (HASHED.test(url.pathname)) {
    event.respondWith(cacheFirst(req));
    return;
  }
  if (req.mode === 'navigate') event.respondWith(networkFirst(req));
});
`;
}

function serviceWorkerPlugin(): Plugin {
  let outDir = 'dist';
  let version = 'dev';
  return {
    name: 'nla-sw',
    apply: 'build',
    configResolved(config) {
      outDir = config.build.outDir;
    },
    generateBundle(_options, bundle) {
      const names = Object.keys(bundle).sort().join('\n');
      version = createHash('sha256').update(names).digest('hex').slice(0, 12);
      this.emitFile({ type: 'asset', fileName: 'sw.js', source: serviceWorkerSource(version) });
    },
    // index.html is written by Vite's HTML pipeline after generateBundle, so the
    // build id is stamped here, once the file on disk is final.
    closeBundle() {
      const htmlPath = join(outDir, 'index.html');
      const html = readFileSync(htmlPath, 'utf8');
      if (html.includes('name="nla-build"')) return;
      writeFileSync(htmlPath, html.replace('</head>', `    <meta name="nla-build" content="${version}" />\n  </head>`));
    },
  };
}
