import { ApiError, apiUrl, buildQuery, type ClientConfig } from './core';

/**
 * Shape of an entity `data_payload` field that stores a file reference.
 * The backend inserts these objects on upload; the UI detects them via
 * {@link isFileRef}.
 */
export interface FileRef {
  __type: 'file_ref';
  file_id: string;
  filename: string;
  mime_type: string;
  size_bytes: number;
}

/**
 * Runtime check — narrows to FileRef without a Zod parse. Relies on the
 * `__type: 'file_ref'` discriminator the backend injects on upload so that
 * an arbitrary data_payload field with a stray `file_id` property isn't
 * mistaken for a file reference.
 */
export function isFileRef(v: unknown): v is FileRef {
  return (
    typeof v === 'object' &&
    v !== null &&
    (v as { __type?: unknown }).__type === 'file_ref' &&
    typeof (v as FileRef).file_id === 'string'
  );
}

/**
 * Extract a file UUID from any of the shapes the platform has used to store
 * file references over time:
 *   - Structured FileRef object (current)
 *   - Legacy `file://<uuid>` string prefix
 * Returns null for anything else.
 */
export function extractFileId(v: unknown): string | null {
  if (isFileRef(v)) return v.file_id;
  if (typeof v === 'string') {
    if (v.startsWith('file://')) return v.slice('file://'.length);
    if (v.startsWith('file:')) return v.slice('file:'.length);
  }
  return null;
}

export class FilesClient {
  constructor(private readonly cfg: ClientConfig) {}

  /**
   * Download a file as a Blob. Consumers own the blob-URL lifecycle —
   * typical pattern is `URL.createObjectURL(blob)` on success followed by
   * `URL.revokeObjectURL` on unmount.
   */
  async downloadBlob(fileId: string): Promise<Blob> {
    const qs = buildQuery(this.cfg);
    const res = await this.cfg.fetcher(
      apiUrl(this.cfg, `/api/v1/tenant/files/${encodeURIComponent(fileId)}?${qs}`),
    );
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      throw new ApiError(res.status, body.error ?? `HTTP ${res.status}`, body);
    }
    return res.blob();
  }
}
