import type { SchemaResponse } from '../types/common';
import { apiUrl, buildQuery, unwrapJson, type ClientConfig } from './core';

export interface ListSchemasParams {
  /** When set, returns schemas bound to that entity OR unbound (tenant-wide). */
  entityName?: string;
}

export interface CreateSchemaInput {
  /** Human-readable name. Versioning is keyed on (tenant, project, name). */
  name: string;
  /** Parsed JSON for the FSM graph — conforms to SchemaDefinition. */
  schemaJson: unknown;
  /**
   * Entity kind this schema operates on. Null/undefined = tenant-wide.
   * Used by the WorkflowPanel to decide which schemas to surface on
   * which entity pages.
   */
  entityName?: string;
}

export class SchemasClient {
  constructor(private readonly cfg: ClientConfig) {}

  async list(params: ListSchemasParams = {}): Promise<SchemaResponse[]> {
    const qs = buildQuery(this.cfg, { entity_name: params.entityName });
    const res = await this.cfg.fetcher(
      apiUrl(this.cfg, `/api/v1/tenant/schemas?${qs}`),
    );
    return unwrapJson<SchemaResponse[]>(res);
  }

  async get(id: string): Promise<SchemaResponse> {
    const qs = buildQuery(this.cfg);
    const res = await this.cfg.fetcher(
      apiUrl(this.cfg, `/api/v1/tenant/schemas/${encodeURIComponent(id)}?${qs}`),
    );
    return unwrapJson<SchemaResponse>(res);
  }

  /**
   * Create a new schema version. The backend auto-increments the version
   * number for (tenant, project, name) and deactivates the prior active
   * version in the same transaction — there is no separate "update"
   * endpoint. Throws 409 on a rare version-number race; the caller can
   * retry and the next attempt will succeed.
   */
  async create(input: CreateSchemaInput): Promise<SchemaResponse> {
    const res = await this.cfg.fetcher(
      apiUrl(this.cfg, `/api/v1/tenant/schemas`),
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenant_id: this.cfg.tenantId,
          ...(this.cfg.projectId ? { project_id: this.cfg.projectId } : {}),
          name: input.name,
          schema_json: input.schemaJson,
          ...(input.entityName ? { entity_name: input.entityName } : {}),
        }),
      },
    );
    return unwrapJson<SchemaResponse>(res);
  }
}
