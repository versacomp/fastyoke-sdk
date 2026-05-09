/**
 * Phase 39.1 (FsmViewer SDK) — `<FsmTimeline />`.
 *
 * Standalone vertical timeline export. Pure HTML / Tailwind utility
 * classes — zero reactflow, zero elkjs. ISVs who only want the
 * mobile-friendly L1-support view import this directly and pay
 * none of the canvas bundle cost (asserted by 39.6's bundle-size
 * test).
 *
 * Renders three regions:
 *   1. Header: "Current state" badge.
 *   2. History list: newest-first, mirrors the visual language
 *      `<WorkflowHistory />` already established for tenant pages.
 *   3. Next-actions row: one button per outgoing transition from the
 *      current state. Disabled while a transition is in flight; a
 *      rejected `onTransitionRequest` flashes an error tone briefly
 *      on the originating button before reverting.
 *
 * Tailwind is the dominant choice in the @fastyoke/next host
 * audience, but every visual class is overridable via `className`
 * (root) + per-region overrides — no CSS import required. The
 * component still works in a non-Tailwind host because all classes
 * are utility-only and degrade to plain layout if the consumer
 * doesn't ship Tailwind.
 */

import { useMemo, useState, type CSSProperties, type ReactNode } from 'react';

import {
  viewerOutgoingTransitions,
  type EntityHistoryEntry,
  type EntityState,
  type TransitionRequestHandler,
  type ViewerSchema,
  type ViewerTransition,
} from './types';

export interface FsmTimelineProps {
  schema: ViewerSchema;
  /** When omitted, the timeline renders schema-only (initial state +
   *  the static linear transition list). When supplied, the
   *  current-state badge and history are rendered live. */
  entity?: EntityState;
  /** Operator action — see TransitionRequestHandler docs. When
   *  omitted, action buttons are not rendered. */
  onTransitionRequest?: TransitionRequestHandler;
  /** Optional override for the timestamp format. Defaults to
   *  `new Date(ts).toLocaleString()`. */
  formatTimestamp?: (iso: string) => string;
  /** Override or extend the visual language. */
  className?: string;
  style?: CSSProperties;
  /** Hide the next-actions row entirely (read-only timelines for
   *  audit views). */
  hideActions?: boolean;
  /** Custom label for the next-actions section. Defaults to "Actions". */
  actionsLabel?: string;
  /** Render-prop for an expandable detail region under each history
   *  row. Returning `null` suppresses the disclosure for that row.
   *  Use this to surface payload-diff UI from `<FsmAuditDiff />`
   *  (Phase 25.4.5.3). The Timeline doesn't fetch audit data itself
   *  — the host composes `useJobAudit` + `matchAuditEntry` on its
   *  side and passes a node back. Keeps the primitive lean. */
  renderHistoryDetail?: (
    entry: EntityHistoryEntry,
    index: number,
  ) => ReactNode | null;
}

const DEFAULT_TS = (iso: string): string => {
  const d = new Date(iso);
  return Number.isNaN(d.valueOf()) ? iso : d.toLocaleString();
};

type ButtonState =
  | { kind: 'idle' }
  | { kind: 'pending'; target: string }
  | { kind: 'error'; target: string; message: string };

/**
 * Render a friendly label for an event_type. Keeps the WorkflowHistory
 * sentinel translation in sync (created / admin-cancel) so timelines
 * across the SDK speak the same vocabulary.
 */
function eventTypeLabel(raw: string): string {
  switch (raw) {
    case '__created__':
      return 'Created';
    case '__admin_cancel__':
      return 'Admin cancelled';
    default:
      return raw;
  }
}

export function FsmTimeline({
  schema,
  entity,
  onTransitionRequest,
  formatTimestamp = DEFAULT_TS,
  className,
  style,
  hideActions,
  actionsLabel = 'Actions',
  renderHistoryDetail,
}: FsmTimelineProps): JSX.Element {
  const currentState = entity?.current_state ?? schema.initial_state;
  const outgoing = useMemo<ViewerTransition[]>(
    () => viewerOutgoingTransitions(schema, currentState),
    [schema, currentState],
  );

  // Newest-first; defensive copy because callers may pass a frozen array.
  const historyDesc = useMemo(() => {
    const h = entity?.history ?? [];
    return [...h].sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  }, [entity?.history]);

  const [buttonState, setButtonState] = useState<ButtonState>({ kind: 'idle' });

  async function handleClick(t: ViewerTransition): Promise<void> {
    if (!onTransitionRequest) return;
    setButtonState({ kind: 'pending', target: t.to });
    try {
      await onTransitionRequest(t.to);
      setButtonState({ kind: 'idle' });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'transition failed';
      setButtonState({ kind: 'error', target: t.to, message });
      // Surface the error tone briefly, then revert so the operator
      // can retry without re-mounting.
      window.setTimeout(() => {
        setButtonState((s) =>
          s.kind === 'error' && s.target === t.to ? { kind: 'idle' } : s,
        );
      }, 2400);
    }
  }

  return (
    <div
      data-testid="fsm-timeline"
      className={`flex flex-col gap-3 rounded-md border border-gray-200 p-4 text-sm dark:border-gray-800 ${className ?? ''}`.trim()}
      style={style}
    >
      <header className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
            Current
          </span>
          <span
            data-testid="fsm-timeline-current"
            className="inline-flex items-center rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-800 dark:bg-blue-900/40 dark:text-blue-200"
          >
            {currentState}
          </span>
        </div>
      </header>

      {historyDesc.length > 0 && (
        <ol
          data-testid="fsm-timeline-history"
          className="relative flex flex-col gap-2 border-l border-gray-200 pl-4 dark:border-gray-700"
        >
          {historyDesc.map((entry, i) => {
            const detail = renderHistoryDetail?.(entry, i) ?? null;
            return (
              <li
                key={`${entry.timestamp}-${i}`}
                className="relative"
                data-testid="fsm-timeline-row"
              >
                <span className="absolute -left-[1.0625rem] top-1.5 inline-block h-2 w-2 rounded-full bg-blue-500" />
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                  <span className="font-medium text-gray-900 dark:text-gray-100">
                    {eventTypeLabel(entry.event_type)}
                  </span>
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    {entry.from_state ?? '—'} → {entry.to_state}
                  </span>
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400">
                  {formatTimestamp(entry.timestamp)}
                  {entry.actor && (
                    <>
                      {' · '}
                      <span className="text-gray-700 dark:text-gray-300">
                        {entry.actor}
                      </span>
                    </>
                  )}
                </div>
                {entry.reason && (
                  <div className="mt-0.5 text-xs italic text-amber-700 dark:text-amber-300">
                    {entry.reason}
                  </div>
                )}
                {detail !== null && detail !== undefined && (
                  <details
                    data-testid="fsm-timeline-row-disclosure"
                    className="mt-1"
                  >
                    <summary className="cursor-pointer text-[11px] uppercase tracking-wide text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
                      Details
                    </summary>
                    <div className="mt-1">{detail}</div>
                  </details>
                )}
              </li>
            );
          })}
        </ol>
      )}

      {!hideActions && onTransitionRequest && outgoing.length > 0 && (
        <div data-testid="fsm-timeline-actions" className="flex flex-col gap-2">
          <span className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
            {actionsLabel}
          </span>
          <div className="flex flex-wrap gap-2">
            {outgoing.map((t) => {
              const isPending =
                buttonState.kind === 'pending' && buttonState.target === t.to;
              const isErrored =
                buttonState.kind === 'error' && buttonState.target === t.to;
              const baseClass =
                'rounded border px-3 py-1.5 text-xs font-medium transition disabled:opacity-50';
              const tone = isErrored
                ? 'border-red-400 bg-red-50 text-red-800 dark:border-red-700 dark:bg-red-950/40 dark:text-red-200'
                : 'border-blue-300 bg-blue-50 text-blue-800 hover:bg-blue-100 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-200';
              return (
                <button
                  key={`${t.from}-${t.to}-${t.event_type}`}
                  type="button"
                  onClick={() => void handleClick(t)}
                  disabled={buttonState.kind === 'pending'}
                  data-testid={`fsm-timeline-action-${t.to}`}
                  title={isErrored ? buttonState.message : undefined}
                  className={`${baseClass} ${tone}`}
                >
                  {isPending ? '…' : eventTypeLabel(t.event_type)}
                  <span className="ml-1 text-[10px] text-gray-500 dark:text-gray-400">
                    → {t.to}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {!hideActions && onTransitionRequest && outgoing.length === 0 && (
        <p
          data-testid="fsm-timeline-terminal"
          className="text-xs italic text-gray-500 dark:text-gray-400"
        >
          No further actions available from {currentState}.
        </p>
      )}
    </div>
  );
}
