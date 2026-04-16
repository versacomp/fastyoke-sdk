import type { EventLogEntry, JobResponse } from '../types/common';
import { apiUrl, buildQuery, unwrapJson, type ClientConfig } from './core';

export interface ListJobsParams {
  entityId?: string;
  schemaId?: string;
}

export interface CreateJobInput {
  schemaId: string;
  contextRecordId?: string;
}

export interface TransitionInput {
  eventType: string;
  contextRecordId?: string;
}

export interface CancelInput {
  targetState: string;
  reason: string;
}

export class JobsClient {
  constructor(private readonly cfg: ClientConfig) {}

  async list(params: ListJobsParams = {}): Promise<JobResponse[]> {
    const qs = buildQuery(this.cfg, {
      entity_id: params.entityId,
      schema_id: params.schemaId,
    });
    const res = await this.cfg.fetcher(
      apiUrl(this.cfg, `/api/v1/tenant/jobs?${qs}`),
    );
    return unwrapJson<JobResponse[]>(res);
  }

  async get(id: string): Promise<JobResponse> {
    const qs = buildQuery(this.cfg);
    const res = await this.cfg.fetcher(
      apiUrl(this.cfg, `/api/v1/tenant/jobs/${encodeURIComponent(id)}?${qs}`),
    );
    return unwrapJson<JobResponse>(res);
  }

  async create(input: CreateJobInput): Promise<JobResponse> {
    const res = await this.cfg.fetcher(apiUrl(this.cfg, `/api/v1/tenant/jobs`), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tenant_id: this.cfg.tenantId,
        ...(this.cfg.projectId ? { project_id: this.cfg.projectId } : {}),
        schema_id: input.schemaId,
        ...(input.contextRecordId
          ? { context_record_id: input.contextRecordId }
          : {}),
      }),
    });
    return unwrapJson<JobResponse>(res);
  }

  async transition(id: string, input: TransitionInput): Promise<JobResponse> {
    const res = await this.cfg.fetcher(
      apiUrl(
        this.cfg,
        `/api/v1/tenant/jobs/${encodeURIComponent(id)}/transition`,
      ),
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenant_id: this.cfg.tenantId,
          event_type: input.eventType,
          ...(input.contextRecordId
            ? { context_record_id: input.contextRecordId }
            : {}),
        }),
      },
    );
    return unwrapJson<JobResponse>(res);
  }

  async cancel(id: string, input: CancelInput): Promise<JobResponse> {
    const res = await this.cfg.fetcher(
      apiUrl(this.cfg, `/api/v1/tenant/jobs/${encodeURIComponent(id)}/cancel`),
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenant_id: this.cfg.tenantId,
          target_state: input.targetState,
          reason: input.reason,
        }),
      },
    );
    return unwrapJson<JobResponse>(res);
  }

  async history(id: string): Promise<EventLogEntry[]> {
    const qs = buildQuery(this.cfg);
    const res = await this.cfg.fetcher(
      apiUrl(
        this.cfg,
        `/api/v1/tenant/jobs/${encodeURIComponent(id)}/history?${qs}`,
      ),
    );
    return unwrapJson<EventLogEntry[]>(res);
  }
}
