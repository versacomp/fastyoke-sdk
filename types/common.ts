/**
 * Shared TypeScript types + Zod schemas for the FastYoke public API.
 *
 * These mirror the Rust DTOs in `backend/src/api/*.rs`. Any wire-format
 * change on the server MUST be reflected here; CI should pin these against
 * a snapshot of the Rust structs once Phase 2 lands.
 */
import { z } from 'zod';

// ---------------------------------------------------------------------------
// FSM
// ---------------------------------------------------------------------------

export const SchemaDefinitionZ = z.object({
  initial_state: z.string(),
  states: z.union([
    z.record(z.string(), z.unknown()),
    z.array(z.string()),
  ]).optional(),
  transitions: z
    .array(
      z.object({
        from: z.string(),
        to: z.string(),
        event_type: z.string(),
        guard: z.unknown().optional().nullable(),
        actions: z.array(z.unknown()).optional(),
      }),
    )
    .optional(),
  ui_aliases: z.record(z.string(), z.string()).optional(),
});
export type SchemaDefinition = z.infer<typeof SchemaDefinitionZ>;

export const SchemaResponseZ = z.object({
  id: z.string(),
  tenant_id: z.string(),
  name: z.string(),
  version: z.number(),
  schema_json: SchemaDefinitionZ,
  is_active: z.boolean(),
  created_at: z.string(),
  entity_name: z.string().optional().nullable(),
});
export type SchemaResponse = z.infer<typeof SchemaResponseZ>;

export const JobResponseZ = z.object({
  id: z.string(),
  tenant_id: z.string(),
  schema_id: z.string(),
  schema_name: z.string().optional(),
  current_state: z.string(),
  context_record_id: z.string().optional().nullable(),
  updated_at: z.string(),
  generated_tokens: z.array(z.string()).optional(),
});
export type JobResponse = z.infer<typeof JobResponseZ>;

export const EventLogEntryZ = z.object({
  id: z.string(),
  job_id: z.string(),
  event_type: z.string(),
  from_state: z.string().nullable(),
  to_state: z.string(),
  timestamp: z.string(),
  actor: z.string().optional().nullable(),
  reason: z.string().optional().nullable(),
});
export type EventLogEntry = z.infer<typeof EventLogEntryZ>;

// ---------------------------------------------------------------------------
// Entities
// ---------------------------------------------------------------------------

export const EntityResponseZ = z.object({
  id: z.string(),
  tenant_id: z.string(),
  entity_name: z.string(),
  data_payload: z.record(z.string(), z.unknown()),
  created_at: z.string(),
  updated_at: z.string(),
});
export type EntityResponse = z.infer<typeof EntityResponseZ>;

// ---------------------------------------------------------------------------
// Pages (UI templates)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Extensions (Phase 2 public SDK)
// ---------------------------------------------------------------------------

export const ExtensionManifestComponentZ = z.object({
  name: z.string(),
  block_type: z.string(),
});
export type ExtensionManifestComponent = z.infer<typeof ExtensionManifestComponentZ>;

export const ExtensionManifestPageZ = z.object({
  name: z.string(),
  path: z.string(),
});
export type ExtensionManifestPage = z.infer<typeof ExtensionManifestPageZ>;

export const ExtensionManifestZ = z.object({
  id: z.string(),
  version: z.string(),
  components: z.array(ExtensionManifestComponentZ).optional().default([]),
  pages: z.array(ExtensionManifestPageZ).optional().default([]),
  required_scopes: z.array(z.string()),
  fastyoke_sdk: z.string().optional().nullable(),
});
export type ExtensionManifest = z.infer<typeof ExtensionManifestZ>;

export const ExtensionResponseZ = z.object({
  id: z.string(),
  tenant_id: z.string(),
  extension_id: z.string(),
  version: z.string(),
  manifest: ExtensionManifestZ,
  bundle_sha256: z.string(),
  bundle_size: z.number(),
  is_active: z.boolean(),
  uploaded_by: z.string(),
  created_at: z.string(),
});
export type ExtensionResponse = z.infer<typeof ExtensionResponseZ>;

export const MintTokenResponseZ = z.object({
  token: z.string(),
  expires_at: z.number(),
  scopes: z.array(z.string()),
  ext_id: z.string(),
});
export type MintTokenResponse = z.infer<typeof MintTokenResponseZ>;

export const PageResponseZ = z.object({
  id: z.string(),
  tenant_id: z.string(),
  name: z.string(),
  slug: z.string(),
  is_public: z.boolean(),
  layout_json: z.unknown(),
  created_at: z.string(),
  updated_at: z.string(),
  has_password: z.boolean(),
  link_expires_at: z.string().optional().nullable(),
  entity_name: z.string().optional().nullable(),
  title_field: z.string().optional().nullable(),
});
export type PageResponse = z.infer<typeof PageResponseZ>;
