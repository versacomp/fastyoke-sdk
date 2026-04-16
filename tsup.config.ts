/**
 * tsup — produces the publishable artifacts for `@fastyoke/sdk`.
 *
 * Inputs  : `index.ts` (the single public entry point).
 * Outputs : `dist/index.js` (ESM), `dist/index.cjs` (CJS),
 *           `dist/index.d.ts` (types), linked source maps.
 *
 * Externals: React family. Peer deps — consumers bring their own,
 * and at runtime extensions resolve them via the host's import map.
 * zod is NOT external: it's an internal validation dep and we
 * prefer one self-contained tarball over asking every consumer to
 * install it.
 *
 * Paths are resolved relative to THIS CONFIG FILE, not
 * `process.cwd()`. That way the same config works whether you run
 * tsup from `frontend/` (via `npm run build:sdk`) or from
 * `frontend/sdk/` (via `npm run build`).
 */
import { defineConfig } from 'tsup';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  entry: [resolve(here, 'index.ts')],
  outDir: resolve(here, 'dist'),
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  treeshake: true,
  sourcemap: true,
  target: 'es2020',
  external: ['react', 'react-dom', 'react-dom/client', 'react/jsx-runtime'],
  splitting: false,
});
