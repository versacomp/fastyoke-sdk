/**
 * Transport primitives used by every SDK client.
 *
 * The SDK does not own the auth strategy — the host app injects a `Fetcher`
 * that knows how to attach credentials and handle 401s. This keeps the SDK
 * portable (tomorrow's iframe-isolated extensions can inject a postMessage-
 * based fetcher without changing client code).
 */

export type Fetcher = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

export interface ClientConfig {
  /** Current tenant UUID. Every request is scoped by this — Mandate §4.1. */
  tenantId: string;
  /** Optional project UUID. When set, narrows list queries. */
  projectId?: string | null;
  /** Credential-aware fetch. Host app typically wires its `apiFetch`. */
  fetcher: Fetcher;
  /** Base URL for all requests. Defaults to the current origin. */
  baseUrl?: string;
}

/**
 * Thrown by client methods when the backend returns a non-2xx status.
 * The message reflects the server's `error` field when present.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly body: unknown;
  constructor(status: number, message: string, body: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

export async function unwrapJson<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new ApiError(res.status, body.error ?? `HTTP ${res.status}`, body);
  }
  return (await res.json()) as T;
}

export function buildQuery(
  base: ClientConfig,
  extra?: Record<string, string | number | undefined | null>,
): string {
  const params = new URLSearchParams({ tenant_id: base.tenantId });
  if (base.projectId) params.set('project_id', base.projectId);
  if (extra) {
    for (const [k, v] of Object.entries(extra)) {
      if (v !== undefined && v !== null && v !== '') params.set(k, String(v));
    }
  }
  return params.toString();
}

export function apiUrl(cfg: ClientConfig, path: string): string {
  const base = cfg.baseUrl ?? '';
  return `${base}${path}`;
}
