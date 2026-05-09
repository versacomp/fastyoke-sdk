/**
 * @fastyoke/sdk — public entry point.
 *
 * This file defines the full public surface. Anything not re-exported here
 * is internal and may change without notice. Host app code and (eventually)
 * extension code should only import from `@fastyoke/sdk`, never from
 * relative paths inside the SDK tree.
 */

export { ApiError, type Fetcher, type ClientConfig } from './client/core';
export {
  SchemasClient,
  type ListSchemasParams,
  type CreateSchemaInput,
} from './client/schemas';
export {
  JobsClient,
  type ListJobsParams,
  type CreateJobInput,
  type TransitionInput,
  type CancelInput,
} from './client/jobs';
export {
  EntitiesClient,
  type ListEntitiesParams,
  type PagedEntityResponse,
} from './client/entities';
export { PagesClient } from './client/pages';
export {
  FilesClient,
  type FileRef,
  isFileRef,
  extractFileId,
} from './client/files';
export { ExtensionsClient } from './client/extensions';
export {
  RealtimeClient,
  type RealtimeEvent,
  type RealtimeListener,
  type TransitionRealtimeEvent,
  type EntityMutationRealtimeEvent,
  type WebSocketLike,
  type SocketFactory,
  type RealtimeClientOptions,
} from './client/realtime';

export {
  FastYokeProvider,
  useFastYoke,
  type FastYokeContextValue,
  type FastYokeProviderProps,
} from './react/context';

export {
  ExtensionProvider,
  useExtensionRegistry,
  type ExtensionProviderProps,
  type ExtensionRegistryValue,
  type LoadedExtension,
  type ExtensionBlockProps,
  type ExtensionPageProps,
  type CustomBlockDescriptor,
} from './react/ExtensionRegistry';
export { ExtensionErrorBoundary } from './react/ExtensionErrorBoundary';

// Phase 21.8.3 — React data hooks
export {
  // Read hooks: { data, loading, error, refetch }
  useEntities,
  useEntity,
  useJobs,
  useJob,
  useJobHistory,
  useJobAudit,
  useSchemas,
  useSchema,
  useActiveSchemas,
  // Write hooks: { <verb>, loading, error, result }
  useCreateEntity,
  useUpdateEntity,
  useDeleteEntity,
  useSpawnJob,
  useTransitionJob,
  useCancelJob,
  // Shared shapes
  type ReadHookResult,
  type RealtimeOptions,
  type CreateEntityArgs,
  type UpdateEntityArgs,
  type DeleteEntityArgs,
  type TransitionJobArgs,
  type CancelJobArgs,
} from './react/hooks';

// Phase 21.8.4 — Drop-in workflow history viewer
export {
  WorkflowHistory,
  type WorkflowHistoryProps,
} from './react/WorkflowHistory';

export {
  type SchemaDefinition,
  type SchemaResponse,
  type JobResponse,
  type EventLogEntry,
  type FsmAuditLogEntry,
  type EntityResponse,
  type PageResponse,
  type ExtensionManifest,
  type ExtensionManifestComponent,
  type ExtensionManifestPage,
  type ExtensionResponse,
  type MintTokenResponse,
  SchemaDefinitionZ,
  SchemaResponseZ,
  JobResponseZ,
  EventLogEntryZ,
  FsmAuditLogEntryZ,
  EntityResponseZ,
  PageResponseZ,
  ExtensionManifestZ,
  ExtensionResponseZ,
  MintTokenResponseZ,
} from './types/common';

// Phase 20.2.4e — Forms Builder zod schemas.
export {
  type FieldType,
  type FormAttachmentRef,
  type FormField,
  type FormFieldSource,
  type FormPageV2,
  type FormSection,
  type FormSignature,
  type FormTheme,
  type FormThemeHeader,
  type RoutingEntry,
  type RoutingRule,
  type FieldsSchemaV2,
  type FormSchema,
  FieldTypeZ,
  FormAttachmentRefZ,
  FormFieldZ,
  FormFieldSourceZ,
  FormPageV2Z,
  FormSectionZ,
  FormSignatureZ,
  FormThemeZ,
  FormThemeHeaderZ,
  RoutingEntryZ,
  RoutingRuleZ,
  FieldsSchemaV2Z,
  FormSchemaZ,
} from './types/forms';

// Phase 40.4 — entity-annotation → zod adapter for the CRUD
// Scaffold Builder's emitted bundles.
// Phase 41.1 (LCAP) widens FieldType to the closed 9-type
// vocabulary — exported under an LCAP-namespaced alias so it
// doesn't collide with `FieldType` from `./types/forms`.
export {
  type EntityFieldAnnotation,
  type FieldType as LcapFieldType,
  entityAnnotationToZod,
} from './types/entityAnnotation';

// FRONTEND_BUGS #2 — drop-in renderer for `data_payload` fields that
// may carry a FileRef. Inline image for image/* mime types, download
// link for other files, stringified scalar otherwise. Auth via the
// host's authenticated files client; revokes blob URLs on unmount.
export {
  FilePayloadView,
  type FilePayloadViewProps,
} from './react/FilePayloadView';

// Phase 39 — FsmViewer SDK surface. Two physically-separate
// exports per locked decision #6: ISVs that only want the timeline
// import `FsmTimeline` directly and pay no reactflow/elkjs cost.
// `FsmViewer` composes the timeline with a `React.lazy`-imported
// canvas; 39.6 asserts the canvas is excluded from the
// timeline-only bundle structurally.
export {
  FsmTimeline,
  type FsmTimelineProps,
} from './react/fsm-viewer/FsmTimeline';
export {
  FsmViewer,
  type FsmViewerProps,
  type FsmViewerMode,
} from './react/fsm-viewer/FsmViewer';
// Phase 25.4.5.3 + 39 dogfood — convenience renderer for the audit
// ledger's payload-before/after snapshots, designed to be passed
// into FsmTimeline's renderHistoryDetail render-prop.
export {
  FsmAuditDiff,
  type FsmAuditDiffProps,
  matchAuditEntry,
} from './react/fsm-viewer/FsmAuditDiff';
export type {
  EntityHistoryEntry,
  EntityState,
  TransitionRequestHandler,
  ViewerSchema,
  ViewerTransition,
} from './react/fsm-viewer/types';

// Phase 41.2 (LCAP) — `<SmartField />` resolver. Single React
// component every entity-rendering surface (Forms v2, Page
// Designer, CRUD scaffold, @fastyoke/next pages) consumes.
// Framework-agnostic React-DOM; Next.js wrapper lives in
// `@fastyoke/next` (Phase 41.5).
export {
  SmartField,
  type SmartFieldProps,
  type SmartFieldMode,
} from './react/lcap/SmartField';
export type { SmartFieldDensity } from './react/lcap/components/types';
export {
  resolveSmartField,
  resolveFieldType,
  type ResolvedSmartField,
  type ResolvedFieldType,
} from './react/lcap/resolver';
// Input-mask helpers — vocabulary: '0'/'9' digit, 'a'/'A' letter,
// '*' alphanumeric, anything else literal. `applyMaskWithCaret`
// preserves the cursor position through the format pass.
export {
  applyMask,
  applyMaskWithCaret,
  type MaskOptions,
} from './utils/inputMask';

// Studio Wizard — workflow section + entity-scoped hooks for generated
// detail pages. WorkflowSection composes a state badge, advance bar (with
// optimistic update + 409/422 revert), and merged event-log history.
export { WorkflowSection } from './react/workflow/WorkflowSection';
export type { WorkflowSectionProps } from './react/workflow/WorkflowSection';
export { useEntityJobs } from './react/workflow/useEntityJobs';
export { useEntityEventLog } from './react/workflow/useEntityEventLog';

// Studio Wizard — generated app shell components + theme injector.
// Generated bundles wrap their pages in one of three shells; each
// renders nav chrome, scopes `data-theme={themeId}`, and embeds
// `<ThemeStyle />` to fetch + inject the tenant's CSS variables.
export { LeftNavShell } from './react/shells/LeftNavShell';
export { TopNavShell } from './react/shells/TopNavShell';
export { TopBarSideRailShell } from './react/shells/TopBarSideRailShell';
export { ThemeStyle } from './react/shells/ThemeStyle';
export type { ShellProps } from './react/shells/LeftNavShell';
export type { ThemeStyleProps } from './react/shells/ThemeStyle';
