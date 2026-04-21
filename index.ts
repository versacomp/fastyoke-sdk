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
  EntityResponseZ,
  PageResponseZ,
  ExtensionManifestZ,
  ExtensionResponseZ,
  MintTokenResponseZ,
} from './types/common';
