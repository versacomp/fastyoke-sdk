# @fastyoke/sdk

Typed clients, React primitives, and the extension loader contract for building FastYoke extensions.

> **Pre-1.0, expect breakage.** This package is still stabilising — every minor version may change the wire shape or API surface. Pin an exact version in your extension's `package.json` and bump deliberately.

## Install

```bash
npm install @fastyoke/sdk
# peer deps — bring your own React
npm install react react-dom
```

## What this package gives you

- **Typed API clients** for schemas, jobs, entities, pages, files, and extensions. Each method is typed end-to-end against the FastYoke REST API.
- **React context** (`<FastYokeProvider>`, `useFastYoke()`) — host-supplied in your extension; you just consume.
- **Extension primitives** (`ExtensionBlockProps`, `ExtensionPageProps`, `ExtensionManifest` types) — the prop contract your component must satisfy.
- **Zod schemas** that mirror the Rust DTOs. Useful when you want to validate data from other sources or build test fixtures.

## Minimum viable extension

```tsx
// src/index.tsx
import { useFastYoke, type ExtensionBlockProps } from '@fastyoke/sdk';
import { useEffect, useState } from 'react';

export function MyWidget({ config, record }: ExtensionBlockProps) {
  const { entities } = useFastYoke();
  const [loaded, setLoaded] = useState<unknown>(null);

  useEffect(() => {
    if (!record?.id) return;
    void entities
      .get('my_entity', String(record.id))
      .then(setLoaded);
  }, [record?.id, entities]);

  return <pre>{JSON.stringify(loaded, null, 2)}</pre>;
}
```

```json
// manifest.json
{
  "id": "example.my-widget",
  "version": "1.0.0",
  "components": [
    { "name": "MyWidget", "block_type": "custom:my_widget" }
  ],
  "pages": [],
  "required_scopes": ["data:read"]
}
```

## Build your extension

The SDK must be marked external in your bundler so the host serves one shared SDK instance across all extensions. React family the same — the host's import map resolves `react`, `react/jsx-runtime`, `react-dom`, and `react-dom/client` to the same URLs every extension loads from.

### esbuild

```bash
esbuild src/index.tsx \
  --bundle --format=esm --target=es2020 \
  --jsx=automatic \
  --outfile=dist/bundle.mjs \
  --external:react --external:react/jsx-runtime --external:@fastyoke/sdk
```

### vite (library mode)

```ts
// vite.config.ts
export default {
  build: {
    lib: {
      entry: 'src/index.tsx',
      formats: ['es'],
      fileName: () => 'bundle.mjs',
    },
    rollupOptions: {
      external: ['react', 'react/jsx-runtime', 'react-dom', '@fastyoke/sdk'],
    },
  },
};
```

### webpack

```js
// webpack.config.js
module.exports = {
  experiments: { outputModule: true },
  output: { module: true, library: { type: 'module' } },
  externalsType: 'module',
  externals: {
    react: 'react',
    'react/jsx-runtime': 'react/jsx-runtime',
    'react-dom': 'react-dom',
    '@fastyoke/sdk': '@fastyoke/sdk',
  },
};
```

## Install the bundle in a tenant

1. Sign in to the FastYoke admin as an admin-role user.
2. Navigate to **Admin → Extensions**.
3. Click **Install extension**.
4. Pick your `manifest.json` and compiled `bundle.mjs`.
5. Review the requested scopes and confirm.

The bundle is virus-scanned, SHA-256'd, and persisted in a single transaction that deactivates any prior active version. It's available to the tenant immediately on the next page load.

## Scope enforcement

Every mutating backend handler calls `require_scope("family:action")`. When your extension's JWT is missing the requested scope, the call returns **403 Forbidden**. Declare every scope your extension needs in `manifest.required_scopes`.

The vocabulary is deliberately small:

| Scope | Covers |
|---|---|
| `data:read` | List/get entity records |
| `data:write` | Create/patch entity records |
| `workflow:read` | List/get schemas and jobs, read job history |
| `workflow:execute` | Create jobs, fire transitions |
| `workflow:admin` | Create schemas, admin-cancel jobs |
| `files:read` | Download file blobs |
| `files:write` | Upload/delete file blobs |
| `admin:*` | Wildcard. Avoid unless you genuinely need admin-level breadth. |

An extension running with `["data:read", "workflow:execute"]` can list entities and fire transitions; uploading a file or editing a schema is refused.

## Versioning and stability

This package follows **SemVer from 1.0 onward**. Anything `0.x.y` is experimental — minor versions may rename types, move exports, or change method signatures. When 1.0 ships, breaking changes require a major bump and a deprecation cycle.

Pin exact versions during the 0.x window:

```json
{
  "devDependencies": {
    "@fastyoke/sdk": "0.1.0"
  }
}
```

## Getting help

- [Issues on GitHub](https://github.com/versacomp/fastyoke-sdk/issues)
- [Reference extension](./examples/hello-fastyoke) — clone the repo and `npm install && npm run build` to produce an installable bundle.

## License

MIT
