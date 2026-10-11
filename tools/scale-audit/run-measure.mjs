// Loads the measure module through Vite so it can import the worker-safe city
// (fabric, towers, layout) without adding a tsx dependency or touching the game.
import { createServer } from 'vite';
import { writeReports } from './report.mjs';

const server = await createServer({
  server: { middlewareMode: true },
  appType: 'custom',
  logLevel: 'error',
});

const mod = await server.ssrLoadModule('/tools/scale-audit/measure.ts');
await mod.main();
await server.close();
writeReports();
