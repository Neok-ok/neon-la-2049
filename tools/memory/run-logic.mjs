// Loads the TypeScript logic test through Vite so path-less imports resolve.
import { createServer } from 'vite';

const server = await createServer({
  server: { middlewareMode: true },
  appType: 'custom',
  logLevel: 'error',
});
try {
  await server.ssrLoadModule('/tools/memory/logic.test.ts');
} finally {
  await server.close();
}
