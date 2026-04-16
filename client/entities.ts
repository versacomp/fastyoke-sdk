import type { EntityResponse } from '../types/common';
import { ApiError, apiUrl, buildQuery, unwrapJson, type ClientConfig } from './core';

export interface ListEntitiesParams {
  page?: number;
  pageSize?: number;
  search?: string;
  sortField?: string;
  sortDir?: 'asc' | 'desc';
  filterField?: string;
  filterValue?: string;
}

export interface PagedEntityResponse {
  records: EntityResponse[];
  total: number;
  page: number;
  page_size: number;
}

export class EntitiesClient {
  constructor(private readonly cfg: ClientConfig) {}

  async list(
    entityName: string,
    params: ListEntitiesParams = {},
  ): Promise<PagedEntityResponse> {
    const qs = buildQuery(this.cfg, {
      page: params.page,
      page_size: params.pageSize,
      search: params.search,
      sort_field: params.sortField,
      sort_dir: params.sortDir,
      filter_field: params.filterField,
      filter_value: params.filterValue,
    });
    const res = await this.cfg.fetcher(
      apiUrl(
        this.cfg,
        `/api/v1/tenant/entities/${encodeURIComponent(entityName)}?${qs}`,
      ),
    );
    return unwrapJson<PagedEntityResponse>(res);
  }

  async get(entityName: string, id: string): Promise<EntityResponse> {
    const qs = buildQuery(this.cfg);
    const res = await this.cfg.fetcher(
      apiUrl(
        this.cfg,
        `/api/v1/tenant/entities/${encodeURIComponent(entityName)}/${encodeURIComponent(id)}?${qs}`,
      ),
    );
    return unwrapJson<EntityResponse>(res);
  }

  /**
   * Render and download the entity's PDF. Returns the raw Blob — callers
   * handle anchor.click() / URL.createObjectURL themselves because blob
   * ownership semantics differ per-consumer (download, inline, preview).
   */
  async exportPdf(entityName: string, id: string): Promise<Blob> {
    const qs = buildQuery(this.cfg);
    const res = await this.cfg.fetcher(
      apiUrl(
        this.cfg,
        `/api/v1/tenant/entities/${encodeURIComponent(entityName)}/${encodeURIComponent(id)}/pdf?${qs}`,
      ),
    );
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      throw new ApiError(res.status, body.error ?? `HTTP ${res.status}`, body);
    }
    return res.blob();
  }

  async patch(
    entityName: string,
    id: string,
    dataPayload: Record<string, unknown>,
  ): Promise<EntityResponse> {
    const res = await this.cfg.fetcher(
      apiUrl(
        this.cfg,
        `/api/v1/tenant/entities/${encodeURIComponent(entityName)}/${encodeURIComponent(id)}`,
      ),
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenant_id: this.cfg.tenantId,
          data_payload: dataPayload,
        }),
      },
    );
    return unwrapJson<EntityResponse>(res);
  }
}
