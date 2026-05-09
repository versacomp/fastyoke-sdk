/**
 * Phase 41.2 (LCAP) — heavy-editor lazy boundary.
 *
 * Three peer packages ship the rich editors that `<SmartField />`
 * resolves for `longtext` field-type with the `richtext` /
 * `markdown` / `code` `@ui/component` slugs (locked decision #3 in
 * `LCAP-Phases.md`):
 *
 *   - `@fastyoke/lcap-richtext`      → `<RichtextEditor />`
 *   - `@fastyoke/lcap-codeeditor`    → `<CodeEditor />`
 *   - `@fastyoke/lcap-markdowneditor`→ `<MarkdownEditor />`
 *
 * `@fastyoke/sdk` does NOT depend on any of them. The resolver
 * uses `React.lazy(() => import('@fastyoke/lcap-…'))` so a host
 * app that doesn't install the peer pays no bundle cost.
 *
 * The `lazyLoad…` helpers below return the lazy module wrapper.
 * If the import fails (peer not installed), they resolve to a
 * shape compatible with the catalog so SmartField falls back to
 * `<TextArea />` and emits a one-time `console.warn`. The
 * fallback is the v0 path; Phase 41.5 ships the actual peer
 * packages.
 */
import { lazy, type ComponentType } from 'react';
import type { CatalogComponentProps } from './types';
import { TextArea } from './TextArea';

/** A peer package's expected shape: a default React component
 *  matching the catalog signature. We accept `default` *or* the
 *  named export `RichtextEditor` / `CodeEditor` / `MarkdownEditor`
 *  for forward-compat with both export styles. */
type HeavyModule = {
  default?: ComponentType<CatalogComponentProps>;
  RichtextEditor?: ComponentType<CatalogComponentProps>;
  CodeEditor?: ComponentType<CatalogComponentProps>;
  MarkdownEditor?: ComponentType<CatalogComponentProps>;
};

let warnedRichtext = false;
let warnedMarkdown = false;
let warnedCode = false;

function pickExport(
  mod: HeavyModule,
  named: 'RichtextEditor' | 'CodeEditor' | 'MarkdownEditor',
): ComponentType<CatalogComponentProps> {
  return mod[named] ?? mod.default ?? TextArea;
}

/** Hide the specifier behind an indirection so vite/rolldown's
 *  static import-analysis cannot see a literal at parse time.
 *  Bundlers that scan `import('...')` for tree-shaking would
 *  otherwise try to resolve the missing peer package and fail
 *  the build. The runtime cost of the indirection is one extra
 *  function call per lazy-load — negligible. */
function dynamicImport<T>(specifier: string): Promise<T> {

  return Function('s', 'return import(s)')(specifier) as Promise<T>;
}

/** React.lazy wrapper for the richtext peer package. Falls back to
 *  TextArea + console.warn when the import fails (peer not
 *  installed). */
export const LazyRichtext = lazy<ComponentType<CatalogComponentProps>>(async () => {
  try {
    const mod = await dynamicImport<HeavyModule>('@fastyoke/lcap-richtext');
    return { default: pickExport(mod, 'RichtextEditor') };
  } catch {
    if (!warnedRichtext) {

      console.warn(
        '[fastyoke-sdk] @fastyoke/lcap-richtext is not installed; ' +
          'falling back to <TextArea /> for richtext fields. ' +
          'Install the peer package to enable rich editing.',
      );
      warnedRichtext = true;
    }
    return { default: TextArea };
  }
});

/** React.lazy wrapper for the markdown peer package. */
export const LazyMarkdown = lazy<ComponentType<CatalogComponentProps>>(async () => {
  try {
    const mod = await dynamicImport<HeavyModule>('@fastyoke/lcap-markdowneditor');
    return { default: pickExport(mod, 'MarkdownEditor') };
  } catch {
    if (!warnedMarkdown) {

      console.warn(
        '[fastyoke-sdk] @fastyoke/lcap-markdowneditor is not installed; ' +
          'falling back to <TextArea /> for markdown fields. ' +
          'Install the peer package to enable rich editing.',
      );
      warnedMarkdown = true;
    }
    return { default: TextArea };
  }
});

/** React.lazy wrapper for the code peer package. */
export const LazyCode = lazy<ComponentType<CatalogComponentProps>>(async () => {
  try {
    const mod = await dynamicImport<HeavyModule>('@fastyoke/lcap-codeeditor');
    return { default: pickExport(mod, 'CodeEditor') };
  } catch {
    if (!warnedCode) {

      console.warn(
        '[fastyoke-sdk] @fastyoke/lcap-codeeditor is not installed; ' +
          'falling back to <TextArea /> for code fields. ' +
          'Install the peer package to enable rich editing.',
      );
      warnedCode = true;
    }
    return { default: TextArea };
  }
});

/** Test-only reset of the warn-once flags so vitest cases can
 *  assert the warning fires per-test. Keep `__test` suffix so it
 *  doesn't show up in the public surface intent. */
export function __resetHeavyWarnings(): void {
  warnedRichtext = false;
  warnedMarkdown = false;
  warnedCode = false;
}
