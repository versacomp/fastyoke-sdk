/// <reference types="node" />
/**
 * Phase 39.6 — bundle-independence guard for the FsmViewer surface.
 *
 * Locked decision #6: tree-shaking via single-export-with-dynamic-
 * import is bundler-heuristic-dependent and varies across webpack /
 * rollup / turbopack / rolldown. Two physically-separate exports
 * (`FsmTimeline` vs `FsmViewer`) make canvas exclusion structural —
 * but only as long as no one quietly grafts a reactflow / elkjs
 * import into the timeline path.
 *
 * This test is the structural fence: read the actual source files
 * for the timeline-only path and assert they import nothing that
 * would pull reactflow or elkjs into the timeline-only bundle. The
 * canvas counterpart MUST import them (otherwise the canvas isn't
 * actually doing its job). Both directions are asserted.
 *
 * Static-source analysis is a smaller hammer than a real bundler
 * round-trip (which is the right tool but too slow for unit tests).
 * Combined with the build-time tsc + the SDK's tsup.config.ts
 * external/dynamic settings, this gives us a reliable enough
 * regression fence for the lifetime of pre-1.0.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const SDK_ROOT = resolve(__dirname, '..');

function srcOf(rel: string): string {
  return readFileSync(resolve(SDK_ROOT, rel), 'utf8');
}

const HEAVY_MODULES = ['reactflow', 'elkjs'] as const;

const TIMELINE_ONLY_PATH = [
  'react/fsm-viewer/FsmTimeline.tsx',
  'react/fsm-viewer/types.ts',
] as const;

function importsModule(source: string, mod: string): boolean {
  // Match any flavor of static import / re-export.
  const escaped = mod.replace(/[/\\^$*+?.()|[\]{}]/g, '\\$&');
  const re = new RegExp(
    `(import\\s+[^;]*?from\\s+|require\\(\\s*|export\\s+\\*\\s+from\\s+|export\\s+\\{[^}]*\\}\\s+from\\s+)['"]${escaped}(/[^'"]*)?['"]`,
    'm',
  );
  return re.test(source);
}

describe('Phase 39 bundle independence — FsmTimeline path is reactflow/elkjs-free', () => {
  for (const file of TIMELINE_ONLY_PATH) {
    for (const mod of HEAVY_MODULES) {
      it(`${file} does NOT import ${mod}`, () => {
        const src = srcOf(file);
        expect(importsModule(src, mod)).toBe(false);
      });
    }
  }

  it('FsmTimeline.tsx does NOT import the canvas module', () => {
    const src = srcOf('react/fsm-viewer/FsmTimeline.tsx');
    expect(src).not.toMatch(/from\s+['"]\.\/FsmViewerCanvas['"]/);
    expect(src).not.toMatch(/from\s+['"]\.\.\/\.\.\/components\/fsmLayout['"]/);
  });

  it('FsmTimeline.tsx does NOT import the SDK elkjs helper', () => {
    const src = srcOf('react/fsm-viewer/FsmTimeline.tsx');
    expect(src).not.toMatch(/from\s+['"][^'"]*components\/fsmLayout['"]/);
  });
});

describe('Phase 39 bundle independence — Canvas path DOES include the heavy deps', () => {
  it('FsmViewerCanvas.tsx imports reactflow', () => {
    const src = srcOf('react/fsm-viewer/FsmViewerCanvas.tsx');
    expect(importsModule(src, 'reactflow')).toBe(true);
  });

  it('FsmViewerCanvas.tsx imports the SDK elkjs helper', () => {
    const src = srcOf('react/fsm-viewer/FsmViewerCanvas.tsx');
    expect(src).toMatch(/from\s+['"]\.\.\/\.\.\/components\/fsmLayout['"]/);
  });

  it('FsmViewer.tsx loads the canvas via React.lazy (not a static import)', () => {
    const src = srcOf('react/fsm-viewer/FsmViewer.tsx');
    expect(src).toMatch(/lazy\(\s*\(\)\s*=>\s*import\(['"]\.\/FsmViewerCanvas['"]\)/);
    // And NOT statically.
    expect(src).not.toMatch(
      /^\s*import\s+[^;]*from\s+['"]\.\/FsmViewerCanvas['"]/m,
    );
  });

  for (const mod of HEAVY_MODULES) {
    it(`FsmViewer.tsx does NOT statically import ${mod}`, () => {
      const src = srcOf('react/fsm-viewer/FsmViewer.tsx');
      // Static imports only — the lazy `import('./FsmViewerCanvas')`
      // is fine; that's the whole point of locked decision #6.
      expect(importsModule(src, mod)).toBe(false);
    });
  }
});
