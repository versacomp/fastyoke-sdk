# Changelog

All notable changes to `@fastyoke/sdk` land here.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

While the package is pre-1.0 **no minor version is guaranteed stable** — any release may change wire shapes, rename types, or move exports. Pin an exact version in your `package.json` and bump deliberately.

## [Unreleased]

## [0.1.3] — 2026-04-16

### Added

- `ExtensionsClient.activate(id)` — re-enable a previously-deactivated extension row, or roll back to an older version. Any currently-active version of the same extension is deactivated in the same transaction on the server, so the "one active version per tenant" invariant holds.

<!-- Accumulate entries here while working on the next release. Move them to a dated, versioned section on publish. -->

## [0.1.2] — 2026-04-16

### Changed

- Publish pipeline migrated to GitHub Actions. Tag push (`sdk-v*`) triggers build + public-mirror sync + `npm publish`. See `RELEASING.md` in the source repo for the full flow.

### Fixed

- `npm run dev` no longer fails under Node 20 in Docker with "This file is in /public and will be copied as-is during build" / "The entry point 'react' cannot be marked as external". The host-side plugin that rewrote bare `react` / `@fastyoke/sdk` imports to `/shared/*.mjs` now runs only during `vite build`; dev mode falls back to vite's native dep handling. Consumer-facing behaviour unchanged.

### Notes

- The `publishConfig.provenance` flag has been removed. npm requires a public GitHub Actions source repo to attach provenance attestations; this package is currently built from a private monorepo. No functional impact on consumers — install and usage are identical.
- **Dev-mode caveat re-documented:** extensions loaded under `vite serve` see a different React / SDK module instance than the host. Hook-based integration testing of extensions should run against `npm run build && npm run preview`. Production builds are unaffected.

## [0.1.1] — 2026-04-16

### Changed

- `package.json` `repository`, `homepage`, and `bugs` URLs now point at the public mirror [`versacomp/fastyoke-sdk`](https://github.com/versacomp/fastyoke-sdk). The `0.1.0` links pointed at a private repo and 404'd for anyone without access.
- `README.md` reference-extension link is now relative so it works in both the npm page and a GitHub browse.

## [0.1.0] — 2026-04-16

Initial public release.

### Added

- Typed API clients: `SchemasClient`, `JobsClient`, `EntitiesClient`, `PagesClient`, `FilesClient`, `ExtensionsClient`. Each covers the mutating + reading endpoints its resource exposes.
- `ApiError` class carrying status + body so consumers can branch on server errors.
- React context + hook: `<FastYokeProvider>` and `useFastYoke()`. Host mounts the provider; extensions consume.
- Extension primitives: `ExtensionBlockProps`, `ExtensionPageProps`, `ExtensionManifest` types. These are the prop contract any extension component must satisfy.
- `<ExtensionProvider>`, `<ExtensionErrorBoundary>`, `useExtensionRegistry()`. Loader + registry that `import()`s tenant-uploaded bundles and hands them a scoped `FastYokeProvider` whose fetcher carries the extension's minted JWT.
- Zod schemas mirroring every wire DTO: `SchemaResponseZ`, `JobResponseZ`, `EntityResponseZ`, `PageResponseZ`, `ExtensionManifestZ`, etc.
- `FileRef` type with `isFileRef` / `extractFileId` helpers for the discriminator convention FastYoke uses inside `data_payload`.
