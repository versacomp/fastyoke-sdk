import type { PageResponse } from '../types/common';
import { ApiError, apiUrl, buildQuery, type ClientConfig } from './core';

export class PagesClient {
  constructor(private readonly cfg: ClientConfig) {}

  /**
   * Fetch the entity-detail template for a given entity kind.
   * Returns `null` on 404 (no template configured yet) — the common case
   * consumers want to render against, not treat as an error.
   */
  async getEntityTemplate(entityName: string): Promise<PageResponse | null> {
    const qs = buildQuery(this.cfg);
    const res = await this.cfg.fetcher(
      apiUrl(
        this.cfg,
        `/api/v1/tenant/pages/entity/${encodeURIComponent(entityName)}?${qs}`,
      ),
    );
    if (res.status === 404) return null;
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      throw new ApiError(res.status, body.error ?? `HTTP ${res.status}`, body);
    }
    return (await res.json()) as PageResponse;
  }
}
