# Changelog

All notable changes to `@fastyoke/sdk` land here.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

While the package is pre-1.0 **no minor version is guaranteed stable** — any release may change wire shapes, rename types, or move exports. Pin an exact version in your `package.json` and bump deliberately.

## [Unreleased]

<!-- Accumulate entries here while working on the next release. Move them to a dated, versioned section on publish. -->

## [0.2.0] — 2026-04-21

Phase 21.8 real-data extensions. The SDK graduates from "typed clients + extension primitives" to a full React hook surface that reads, writes, and subscribes to a tenant's live data — so LLM-authored extensions can stop shipping seed-data stubs and start rendering the real workflow state. Minor bump: surface grows, no existing method signatures break; external extensions pinned to `^0.1.x` keep working against 0.1.3 and opt into the new hooks by bumping their pin.

### Added

- **Entity CRUD completion.** `EntitiesClient.create(kind, dataPayload, options?)` and `EntitiesClient.delete(kind, id)` round out the client; `patch` and `list` / `get` were already present. `delete` is a hard delete — no tombstone, no `deleted_at`. Audit history comes from FSM-owned entities via `event_log`.
- **React data hooks.** Eight read hooks (`useEntities`, `useEntity`, `useJobs`, `useJob`, `useJobHistory`, `useSchemas`, `useSchema`, `useActiveSchemas`) returning `{ data, loading, error, refetch }`, and six action hooks (`useCreateEntity`, `useUpdateEntity`, `useDeleteEntity`, `useSpawnJob`, `useTransitionJob`, `useCancelJob`) returning `{ <verb>, loading, error, result }`. Reads cancel cleanly on dep change + unmount via AbortSignal; actions are mount-ref guarded so post-unmount resolves don't set state. No optimistic updates — `loading=true` holds until the round-trip completes, keeping the SDK free of host-store coupling.
- **`<WorkflowHistory jobId={...} />`** drop-in component over `useJobHistory`. Humanizes `__created__` / `__admin_cancel__` event-type sentinels, renders em-dash placeholders for null actor/reason, and ships with inline styling so iframe-isolated extensions render without the host stylesheet. `formatTimestamp`, `className`, and `style` props for theming.
- **`RealtimeClient`.** One multiplexed WebSocket per `FastYokeProvider` mount, routing `kind`-tagged envelopes (`transition` / `entity_mutation`) to subscribers. Exponential reconnect (1s → 30s cap, reset on open). Consumes the backend's Phase 21.8.7 broadcaster — the same socket carries both FSM transitions and entity CRUD events. `RealtimeEvent`, `TransitionRealtimeEvent`, `EntityMutationRealtimeEvent`, `WebSocketLike`, `SocketFactory`, and `RealtimeClientOptions` are exported for consumers that want to wire the client up outside the provider.
- **Realtime-aware hooks.** `useEntities` / `useEntity` / `useJobs` / `useJob` / `useJobHistory` all accept an optional `RealtimeOptions = { realtime?: boolean }` (default `true`). When enabled, the hook subscribes to the provider's shared socket and refetches on matching events — `useEntity(kind, id)` filters by `entity_name` + `record_id`; `useJob(id)` by `job_id`; `useEntities(kind)` by `entity_name`; `useJobs()` fires on any transition. Pass `{ realtime: false }` to opt out per call site.
- **`unwrapNoContent(res)`** helper in `client/core.ts` for endpoints that return 204 — the existing `unwrapJson` chokes on empty bodies.

### Changed

- **`FastYokeProvider` props:** two new optional knobs. `realtime?: boolean` (default `true`) disables the shared WebSocket for SSR / test hosts that don't want a live connection. `socketFactory?: (url: string) => WebSocket` overrides the WebSocket constructor — tests inject a controllable fake; production leaves it unset.
- **Context value:** `FastYokeContextValue` gains `realtime: RealtimeClient | null`. `null` when the provider is in opt-out mode; otherwise the shared client. Existing consumers that only destructure `{ schemas, jobs, entities, ... }` are unaffected.

### Notes

- `useUpdateEntity` delegates to the existing `EntitiesClient.patch` method (the underlying client method name did not change, to avoid a breaking rename for `^0.1.x` pinned extensions). `useJobHistory` delegates to `JobsClient.history`. Hook names favor readability; client method names favor stability.
- Schemas have no backend broadcast today, so `useSchemas` / `useSchema` / `useActiveSchemas` have no realtime behavior and no `RealtimeOptions` argument. Admin-authored schema edits are rare and one-way; polling via `refetch()` is sufficient.
- One WebSocket per `FastYokeProvider` instance means N sockets across tabs/devices per session. Scale concern materializes around 1k concurrent users per tenant; today's deployments handle that fine.

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
