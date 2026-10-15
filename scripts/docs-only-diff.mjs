// Exit 0 when every changed path is under docs/ or is a Markdown file.
// An empty list is not docs-only: the load budget still runs.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export function pathsFromDiff(text) {
  return text.split('\n').map((line) => line.trim()).filter(Boolean);
}

export function isDocsOnly(files) {
  if (files.length === 0) return false;
  return files.every((file) => file.startsWith('docs/') || file.endsWith('.md'));
}

function isDirectRun() {
  const entry = process.argv[1];
  if (!entry) return false;
  return import.meta.url === pathToFileURL(resolve(entry)).href;
}

if (isDirectRun()) {
  const files = pathsFromDiff(readFileSync(0, 'utf8'));
  const docsOnly = isDocsOnly(files);
  console.log(docsOnly ? `docs-only (${files.length} paths)` : `load-budget required (${files.length} paths)`);
  process.exit(docsOnly ? 0 : 1);
}
