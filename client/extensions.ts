import type { ExtensionResponse, MintTokenResponse } from '../types/common';
import { ApiError, apiUrl, buildQuery, unwrapJson, type ClientConfig } from './core';

export class ExtensionsClient {
  constructor(private readonly cfg: ClientConfig) {}

  /**
   * List every extension row for the tenant, newest first. Includes
   * inactive/historical versions so an admin UI can render version
   * lineage; `<ExtensionProvider>` filters to `is_active === true`.
   */
  async list(): Promise<ExtensionResponse[]> {
    const qs = buildQuery(this.cfg);
    const res = await this.cfg.fetcher(
      apiUrl(this.cfg, `/api/v1/tenant/extensions?${qs}`),
    );
    return unwrapJson<ExtensionResponse[]>(res);
  }

  async get(id: string): Promise<ExtensionResponse> {
    const qs = buildQuery(this.cfg);
    const res = await this.cfg.fetcher(
      apiUrl(
        this.cfg,
        `/api/v1/tenant/extensions/${encodeURIComponent(id)}?${qs}`,
      ),
    );
    return unwrapJson<ExtensionResponse>(res);
  }

  /**
   * Mint a 15-minute extension-scoped JWT. The returned token carries
   * the manifest's `required_scopes` in its `scopes` claim. Callers
   * (typically `<ExtensionProvider>`) schedule a refresh ahead of
   * `expires_at` so the extension never loses access mid-render.
   */
  async mintToken(id: string): Promise<MintTokenResponse> {
    const qs = buildQuery(this.cfg);
    const res = await this.cfg.fetcher(
      apiUrl(
        this.cfg,
        `/api/v1/tenant/extensions/${encodeURIComponent(id)}/token?${qs}`,
      ),
      { method: 'POST' },
    );
    return unwrapJson<MintTokenResponse>(res);
  }

  /**
   * Re-activate a previously-deactivated extension row, flipping
   * `is_active` back to 1. If another row of the same
   * `extension_id` is currently active, it is deactivated in the
   * same transaction so the "at most one active version per
   * tenant" invariant holds.
   *
   * Two workflows use this:
   *   - Revive an extension that was deactivated without a
   *     replacement upload.
   *   - Roll back to an older version — activate any row in the
   *     version history, displacing whatever is currently active.
   *
   * Errors as ApiError:
   *   - 400 if the target row is already active.
   *   - 404 if the row does not exist in this tenant.
   *   - 403 if the caller lacks admin / isn't running under a
   *     user session.
   */
  async activate(id: string): Promise<ExtensionResponse> {
    const qs = buildQuery(this.cfg);
    const res = await this.cfg.fetcher(
      apiUrl(
        this.cfg,
        `/api/v1/tenant/extensions/${encodeURIComponent(id)}/activate?${qs}`,
      ),
      { method: 'POST' },
    );
    return unwrapJson<ExtensionResponse>(res);
  }

  /**
   * Soft-delete (deactivate) the extension row. Flips `is_active` to 0
   * on the server; the table row stays for audit and rollback. A
   * subsequent upload of any version re-activates via the normal
   * deactivate-prior-then-insert transaction.
   *
   * Tokens already minted against this row naturally expire within 15
   * minutes (the mint endpoint refuses inactive rows), so revocation
   * is complete in at most one refresh cycle.
   */
  async deactivate(id: string): Promise<void> {
    const qs = buildQuery(this.cfg);
    const res = await this.cfg.fetcher(
      apiUrl(
        this.cfg,
        `/api/v1/tenant/extensions/${encodeURIComponent(id)}?${qs}`,
      ),
      { method: 'DELETE' },
    );
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      throw new ApiError(res.status, body.error ?? `HTTP ${res.status}`, body);
    }
  }

  /**
   * Build the content-addressed bundle URL. Passing the expected
   * `sha256` lets the backend return 404 on a mismatch — a cheap
   * supply-chain check that prevents `<ExtensionProvider>` from
   * loading a bundle different from the one it just listed.
   */
  bundleUrl(id: string, sha256: string): string {
    const qs = buildQuery(this.cfg, { sha256 });
    return apiUrl(
      this.cfg,
      `/api/v1/tenant/extensions/${encodeURIComponent(id)}/bundle?${qs}`,
    );
  }
}
