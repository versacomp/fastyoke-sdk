/**
 * Phase 21.8.4 — `<WorkflowHistory jobId={...} />`.
 *
 * Drop-in table that renders a job's `event_log` — the same timeline
 * every generated extension's workflow surface ends up wanting. Ships
 * as part of the SDK (not the host app) so an extension that imports
 * `@fastyoke/sdk` gets the visual language for free — admins recognize
 * the component regardless of which app surfaces it.
 *
 * Composes on `useJobHistory(jobId)` from 21.8.3: loading, error, and
 * empty branches are all handled internally so the consumer just
 * mounts `<WorkflowHistory jobId={job.id} />` and moves on.
 *
 * Special event types rendered with friendlier copy:
 *
 *   * `__created__` → "Created" (bootstrap row; `from_state` null)
 *   * `__admin_cancel__` → "Admin cancelled" + highlights the
 *     `reason` cell (audit-critical per the Phase 9 spec)
 *
 * Styling is inline so the component works inside an iframe-isolated
 * extension that doesn't have access to the host's CSS. Consumers
 * can override via the `className` + `style` props — the root
 * wrapper spreads them last so callers can paint the scroll surface
 * to match their shell.
 */

import type { CSSProperties } from 'react';

import type { EventLogEntry } from '../types/common';
import { useJobHistory } from './hooks';

export interface WorkflowHistoryProps {
  jobId: string;
  /** Optional extra class on the wrapping `<div>`. */
  className?: string;
  /** Optional extra style on the wrapping `<div>`. Merged last. */
  style?: CSSProperties;
  /**
   * Override for the timestamp format. Defaults to
   * `new Date(ts).toLocaleString()` which respects the browser's
   * locale. Pass a custom function for a specific format (e.g. the
   * host app's i18n shim).
   */
  formatTimestamp?: (iso: string) => string;
}

/**
 * Humanize the internal event_type sentinels for display. Non-sentinel
 * types (ordinary FSM events like `approve`) render verbatim.
 */
function renderEventType(raw: string): string {
  switch (raw) {
    case '__created__':
      return 'Created';
    case '__admin_cancel__':
      return 'Admin cancelled';
    default:
      return raw;
  }
}

function defaultFormatTimestamp(iso: string): string {
  // `new Date("")` / invalid input returns Invalid Date; show the
  // raw string rather than "Invalid Date" so operators can still
  // copy-paste the backend value.
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}

// ---------------------------------------------------------------------------
// Styles (inline so the component ships without a CSS dep)
// ---------------------------------------------------------------------------

const WRAPPER_STYLE: CSSProperties = {
  fontFamily:
    '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  fontSize: '0.875rem',
};

const TABLE_STYLE: CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
};

const TH_STYLE: CSSProperties = {
  textAlign: 'left',
  padding: '0.5rem 0.75rem',
  borderBottom: '1px solid #e5e7eb',
  fontWeight: 600,
  color: '#374151',
  background: '#f9fafb',
};

const TD_STYLE: CSSProperties = {
  padding: '0.5rem 0.75rem',
  borderBottom: '1px solid #f3f4f6',
  color: '#111827',
  verticalAlign: 'top',
};

const MUTED_STYLE: CSSProperties = {
  color: '#6b7280',
};

const STATE_STYLE: CSSProperties = {
  fontFamily:
    'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
  fontSize: '0.8125rem',
};

const STATUS_STYLE: CSSProperties = {
  padding: '0.75rem 1rem',
  color: '#6b7280',
};

const ERROR_STYLE: CSSProperties = {
  padding: '0.75rem 1rem',
  color: '#b91c1c',
  background: '#fef2f2',
  border: '1px solid #fecaca',
  borderRadius: '0.25rem',
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function WorkflowHistory({
  jobId,
  className,
  style,
  formatTimestamp = defaultFormatTimestamp,
}: WorkflowHistoryProps) {
  const { data, loading, error } = useJobHistory(jobId);

  // The three non-data states get their own early returns so the
  // table markup isn't repeated with conditional rows inside.
  if (loading && !data) {
    return (
      <div className={className} style={{ ...WRAPPER_STYLE, ...style }}>
        <div style={STATUS_STYLE} role="status" aria-live="polite">
          Loading history…
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={className} style={{ ...WRAPPER_STYLE, ...style }}>
        <div style={ERROR_STYLE} role="alert">
          Couldn&apos;t load history: {error.message}
        </div>
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className={className} style={{ ...WRAPPER_STYLE, ...style }}>
        <div style={STATUS_STYLE}>No history yet.</div>
      </div>
    );
  }

  return (
    <div className={className} style={{ ...WRAPPER_STYLE, ...style }}>
      <table style={TABLE_STYLE}>
        <thead>
          <tr>
            <th style={TH_STYLE}>Timestamp</th>
            <th style={TH_STYLE}>Event</th>
            <th style={TH_STYLE}>State change</th>
            <th style={TH_STYLE}>Actor</th>
            <th style={TH_STYLE}>Reason</th>
          </tr>
        </thead>
        <tbody>
          {data.map((row) => (
            <HistoryRow
              key={row.id}
              row={row}
              formatTimestamp={formatTimestamp}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function HistoryRow({
  row,
  formatTimestamp,
}: {
  row: EventLogEntry;
  formatTimestamp: (iso: string) => string;
}) {
  return (
    <tr>
      <td style={TD_STYLE}>{formatTimestamp(row.timestamp)}</td>
      <td style={TD_STYLE}>{renderEventType(row.event_type)}</td>
      <td style={{ ...TD_STYLE, ...STATE_STYLE }}>
        {row.from_state ? (
          <>
            <span>{row.from_state}</span>
            <span style={MUTED_STYLE}> → </span>
            <span>{row.to_state}</span>
          </>
        ) : (
          // Bootstrap row or any row with null from_state — render
          // as just the target state, prefixed with an en dash so
          // operators can scan for "first row".
          <>
            <span style={MUTED_STYLE}>— </span>
            <span>{row.to_state}</span>
          </>
        )}
      </td>
      <td style={TD_STYLE}>
        {row.actor ? (
          row.actor
        ) : (
          <span style={MUTED_STYLE} aria-label="no actor recorded">
            —
          </span>
        )}
      </td>
      <td style={TD_STYLE}>
        {row.reason ? (
          row.reason
        ) : (
          <span style={MUTED_STYLE} aria-label="no reason recorded">
            —
          </span>
        )}
      </td>
    </tr>
  );
}
