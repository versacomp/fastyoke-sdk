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
} from './react/ExtensionRegistry';
export { ExtensionErrorBoundary } from './react/ExtensionErrorBoundary';

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
