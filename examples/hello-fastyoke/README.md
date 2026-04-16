# hello-fastyoke — reference extension

Tiny reference extension for the FastYoke public SDK (Phase 2). Exists
to prove the runtime load path end-to-end: upload → virus scan → SHA
integrity check → dynamic `import()` → registry registration →
`custom:*` block rendering inside an `ExtensionErrorBoundary`.

It renders a single block: a coloured card that shows a greeting from
its `config` and, when embedded on an entity detail page, the record
ID below it.

## What it demonstrates

- **Manifest format** (`manifest.json`) — id, version, components with
  `block_type`, `required_scopes` from the locked vocabulary.
- **Component export convention** — the bundle exports a function
  named exactly as the manifest's `components[].name`. The host's
  `<ExtensionProvider>` looks it up by name.
- **Props contract** — `{ config, record? }` matching the SDK's
  `ExtensionBlockProps`. `config` is copied verbatim from the
  `layout_json` block's `config` field; `record` is the entity the
  block is embedded on (when relevant).

## SDK hook usage

As of Phase 3 Step 1a, the host ships a `<script type="importmap">`
that points `@fastyoke/sdk` at a pre-built shared bundle
(`/shared/fastyoke-sdk.mjs`). The host is externalized against the
same specifier in the production build, so the extension and host
resolve to the **same module instance** at runtime — React contexts
created in the SDK (notably `FastYokeContext`) cross the boundary
cleanly.

This extension demonstrates that by calling `useFastYoke()` and
rendering the tenant/project IDs pulled from the host's provider.

Dev and production behave the same way here — a vite plugin
(`sharedImports` in `frontend/vite.config.ts`) rewrites the
externalized specifiers to the same `/shared/*.mjs` URLs extensions
resolve to, so hook-based integrations work identically in
`npm run dev` and `npm run build && npm run preview`.

As of Phase 3 Step 1b, `react` and `react/jsx-runtime` are also on the
import map. The extension uses plain `import { useState } from 'react'`
with JSX, and the host + extension share one React module instance —
hooks and context work across the boundary exactly like they would in
a single-bundle app.

## Build

```sh
cd examples/hello-fastyoke
npm install
npm run build
```

Output lands at `dist/bundle.mjs`. The build script uses `esbuild`
directly (no Vite / webpack) to keep the dependency surface tiny;
`react` and `@fastyoke/sdk` are marked external so they're not
bundled into the output.

## Install

1. Sign in as an admin.
2. Navigate to **Admin → Extensions**.
3. Click **Install extension**.
4. Pick `manifest.json` and `dist/bundle.mjs`.
5. Review the requested scopes (`data:read` for this demo), tick the
   approval checkbox, click **Install**.

To see it render, add a `custom:hello_card` block to any entity's
detail template page, e.g.:

```json
{ "id": "hi", "type": "custom:hello_card",
  "config": { "greeting": "Hello from the extension!", "accent": "#10b981" } }
```

Open a record of that entity kind and the card renders below the
body (or wherever the block appears in the template tree).

## Uninstall

Click **Deactivate** on the row in **Admin → Extensions**. The bundle
stops loading immediately on the next page load. The row stays in
version history so a re-upload can restore it.

## Layout

```
examples/hello-fastyoke/
├── manifest.json   ← uploaded alongside the bundle
├── package.json    ← build-time deps only (esbuild, typescript)
├── tsconfig.json
├── .gitignore
├── src/
│   └── index.tsx   ← the extension source
└── dist/
    └── bundle.mjs  ← produced by `npm run build`; uploaded verbatim
```
