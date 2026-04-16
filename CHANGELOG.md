# Changelog

All notable changes to `@fastyoke/sdk` land here.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

While the package is pre-1.0 **no minor version is guaranteed stable** — any release may change wire shapes, rename types, or move exports. Pin an exact version in your `package.json` and bump deliberately.

## [Unreleased]

<!-- Accumulate entries here while working on the next release. Move them to a dated, versioned section on publish. -->

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
