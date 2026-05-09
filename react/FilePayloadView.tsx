import { useEffect, useState } from 'react';
import { isFileRef, type FileRef } from '../client/files';
import { useFastYoke } from './context';

/**
 * FRONTEND_BUGS #2 — renders an entity `data_payload` field as an
 * inline `<img>` when the value is a `FileRef` whose `mime_type`
 * starts with `image/`, a download link when the ref points at a
 * non-image file, and the stringified value when it's not a ref
 * at all (so the component is drop-in safe for any cell).
 *
 * Auth: the file bytes are fetched through `FilesClient.downloadBlob`
 * which uses the host's authenticated fetcher. The resulting blob
 * URL is local to the browser tab — it does NOT leak to crawlers or
 * unauthenticated viewers. Blob URLs are revoked on unmount so the
 * memory stays bounded.
 *
 * Exported from `@fastyoke/sdk` so ISV-built Next.js extensions can
 * render payload fields with the same behaviour as the built-in
 * CRUD scaffold and Page Designer blocks.
 */
export interface FilePayloadViewProps {
  /** Any value from `entity_records.data_payload[field_key]`. Can be
   *  a `FileRef`, a legacy `file://<uuid>` string, or any other
   *  scalar — the component narrows at render time. */
  value: unknown;
  /** Rendered when the value is null / undefined / empty. Defaults
   *  to an em-dash. */
  fallback?: string;
  /** Max dimension on the rendered image. Defaults to 200px. Pass
   *  e.g. "400px" for a larger inline preview or "80px" for a
   *  compact row thumbnail. */
  maxSize?: string;
  /** Optional className forwarded to the outer wrapper element. */
  className?: string;
  /** FRONTEND_BUGS #6 — `'compact'` prepends a leading file icon to
   *  non-image download links so dense table cells read as
   *  "attachment" at a glance. `'default'` keeps the pre-existing
   *  filename-only link (used by detail views). Does not affect
   *  image rendering. */
  density?: 'default' | 'compact';
}

export function FilePayloadView({
  value,
  fallback = '—',
  maxSize = '200px',
  className,
  density = 'default',
}: FilePayloadViewProps): JSX.Element {
  const { files } = useFastYoke();

  const fileRef: FileRef | null = isFileRef(value) ? value : null;

  // FRONTEND_BUGS #3 guardrail — warn once per offender when a value
  // looks like a file (has file_id or attachment_id) but lacks the
  // `__type: 'file_ref'` discriminator. Catches future schema drift
  // from paths like PROMOTE_FORM_TO_ENTITY (fixed) or a new ingest
  // path that forgets to stamp the marker. Silent fallback to
  // String(value) still applies so the admin sees *something*; the
  // warning is the dev-time signal.
  if (
    !fileRef &&
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    (('file_id' in value) || ('attachment_id' in value))
  ) {

    console.warn(
      '[fastyoke-sdk] FilePayloadView: value looks file-shaped but lacks ' +
        "`__type: 'file_ref'`. Rendering as stringified JSON. If this came from " +
        'a form submission, make sure the promote / ingest path rewrites ' +
        '`form_attachment_ref` into `file_ref` (see FRONTEND_BUGS #3).',
      value,
    );
  }

  const [state, setState] = useState<{
    loading: boolean;
    blobUrl: string | null;
    error: string | null;
  }>({ loading: Boolean(fileRef), blobUrl: null, error: null });

  useEffect(() => {
    if (!fileRef) {
      setState({ loading: false, blobUrl: null, error: null });
      return;
    }
    let cancelled = false;
    let createdUrl: string | null = null;
    setState({ loading: true, blobUrl: null, error: null });
    void files
      .downloadBlob(fileRef.file_id)
      .then((blob) => {
        if (cancelled) return;
        createdUrl = URL.createObjectURL(blob);
        setState({ loading: false, blobUrl: createdUrl, error: null });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setState({
          loading: false,
          blobUrl: null,
          error: err instanceof Error ? err.message : 'download failed',
        });
      });
    return () => {
      cancelled = true;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [files, fileRef]);

  // ---- Not a file ref: coerce scalar to text -------------------------------
  if (!fileRef) {
    if (value === null || value === undefined || value === '') {
      return <span className={className}>{fallback}</span>;
    }
    return <span className={className}>{String(value)}</span>;
  }

  // ---- File ref: image / link / loading ------------------------------------
  if (state.loading) {
    return (
      <span className={className} style={{ color: '#9ca3af' }}>
        Loading…
      </span>
    );
  }
  if (state.error || !state.blobUrl) {
    return (
      <span className={className} style={{ color: '#b91c1c' }}>
        ⚠ {fileRef.filename}
      </span>
    );
  }

  const isImage = fileRef.mime_type.startsWith('image/');
  if (isImage) {
    return (
      <img
        className={className}
        src={state.blobUrl}
        alt={fileRef.filename}
        style={{
          maxWidth: maxSize,
          maxHeight: maxSize,
          objectFit: 'contain',
          borderRadius: 3,
          border: '1px solid #e5e7eb',
        }}
      />
    );
  }

  // Non-image: clickable download link. Default density shows the
  // full filename + size (detail views). Compact density prepends a
  // paperclip icon and drops the size — suitable for dense EntityList
  // cells where horizontal space is scarce (FRONTEND_BUGS #6).
  if (density === 'compact') {
    return (
      <a
        className={className}
        href={state.blobUrl}
        download={fileRef.filename}
        title={`${fileRef.filename} (${formatBytes(fileRef.size_bytes)})`}
        style={{
          color: '#4f46e5',
          textDecoration: 'none',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          maxWidth: '12rem',
        }}
      >
        <span aria-hidden="true" style={{ fontSize: 14, lineHeight: 1 }}>
          📎
        </span>
        <span
          style={{
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {fileRef.filename}
        </span>
      </a>
    );
  }
  return (
    <a
      className={className}
      href={state.blobUrl}
      download={fileRef.filename}
      style={{ color: '#4f46e5', textDecoration: 'underline' }}
    >
      {fileRef.filename} ({formatBytes(fileRef.size_bytes)})
    </a>
  );
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
