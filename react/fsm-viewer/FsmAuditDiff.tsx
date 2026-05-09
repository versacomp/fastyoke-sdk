/**
 * Phase 25.4.5.3 + 39 dogfood — `<FsmAuditDiff />`.
 *
 * Convenience renderer for the `payload_before` / `payload_after`
 * snapshots returned by `useJobAudit()`. Designed to be passed into
 * `<FsmTimeline />`'s `renderHistoryDetail` prop:
 *
 *   const { data: audit } = useJobAudit(jobId);
 *
 *   <FsmTimeline
 *     schema={schema}
 *     entity={entity}
 *     renderHistoryDetail={(entry) => {
 *       const row = matchAuditEntry(audit ?? [], entry);
 *       return row ? <FsmAuditDiff audit={row} /> : null;
 *     }}
 *   />
 *
 * Surface intentionally narrow — the audit row carries JSON-encoded
 * payload strings; this component parses them and renders a flat
 * key-by-key diff. Nested objects render as their JSON.stringify
 * representation; deep / structural diff is out of scope.
 *
 * Why a separate component instead of growing FsmTimeline:
 * locked decision #3 of Phase 39 — keep the primitive small. New
 * affordances grow as siblings, not on the existing one.
 */

import { useMemo, type CSSProperties } from 'react';

import type { FsmAuditLogEntry } from '../../types/common';
import type { EntityHistoryEntry } from './types';

export interface FsmAuditDiffProps {
  audit: FsmAuditLogEntry;
  /** Override or extend the visual language. */
  className?: string;
  style?: CSSProperties;
  /** Hide unchanged keys. Defaults to false — operators usually want
   *  the full snapshot for context, not just the changes. */
  changesOnly?: boolean;
}

type DiffRow =
  | { kind: 'added'; key: string; after: unknown }
  | { kind: 'removed'; key: string; before: unknown }
  | { kind: 'changed'; key: string; before: unknown; after: unknown }
  | { kind: 'unchanged'; key: string; value: unknown };

function safeParse(s: string | null | undefined): Record<string, unknown> | null {
  if (s === null || s === undefined || s === '') return null;
  try {
    const parsed = JSON.parse(s);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return null;
  } catch {
    return null;
  }
}

function shallowDiff(
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null,
): DiffRow[] {
  const keys = new Set<string>();
  if (before) Object.keys(before).forEach((k) => keys.add(k));
  if (after) Object.keys(after).forEach((k) => keys.add(k));
  const rows: DiffRow[] = [];
  for (const key of [...keys].sort()) {
    const inBefore = before !== null && key in before;
    const inAfter = after !== null && key in after;
    if (inBefore && inAfter) {
      const b = (before as Record<string, unknown>)[key];
      const a = (after as Record<string, unknown>)[key];
      if (JSON.stringify(b) === JSON.stringify(a)) {
        rows.push({ kind: 'unchanged', key, value: a });
      } else {
        rows.push({ kind: 'changed', key, before: b, after: a });
      }
    } else if (inAfter) {
      rows.push({ kind: 'added', key, after: (after as Record<string, unknown>)[key] });
    } else if (inBefore) {
      rows.push({ kind: 'removed', key, before: (before as Record<string, unknown>)[key] });
    }
  }
  return rows;
}

function fmt(v: unknown): string {
  if (v === null) return 'null';
  if (v === undefined) return 'undefined';
  if (typeof v === 'string') return v;
  return JSON.stringify(v);
}

export function FsmAuditDiff({
  audit,
  className,
  style,
  changesOnly = false,
}: FsmAuditDiffProps): JSX.Element {
  const before = useMemo(() => safeParse(audit.payload_before), [audit.payload_before]);
  const after = useMemo(() => safeParse(audit.payload_after), [audit.payload_after]);

  if (before === null && after === null) {
    return (
      <div
        data-testid="fsm-audit-diff-empty"
        className={`text-xs italic text-gray-500 dark:text-gray-400 ${className ?? ''}`.trim()}
        style={style}
      >
        No payload snapshot recorded.
      </div>
    );
  }

  const rows = shallowDiff(before, after);
  const visible = changesOnly ? rows.filter((r) => r.kind !== 'unchanged') : rows;

  if (visible.length === 0) {
    return (
      <div
        data-testid="fsm-audit-diff-nochange"
        className={`text-xs italic text-gray-500 dark:text-gray-400 ${className ?? ''}`.trim()}
        style={style}
      >
        Payload unchanged at this transition.
      </div>
    );
  }

  return (
    <div
      data-testid="fsm-audit-diff"
      className={`flex flex-col gap-1 rounded border border-gray-200 bg-gray-50 p-2 text-xs dark:border-gray-700 dark:bg-gray-900/40 ${className ?? ''}`.trim()}
      style={style}
    >
      {visible.map((row) => (
        <DiffRow key={row.key} row={row} />
      ))}
    </div>
  );
}

function DiffRow({ row }: { row: DiffRow }): JSX.Element {
  switch (row.kind) {
    case 'added':
      return (
        <div data-testid={`fsm-audit-diff-added-${row.key}`} className="flex gap-2">
          <span className="font-mono text-green-700 dark:text-green-300">+</span>
          <span className="font-medium text-gray-700 dark:text-gray-200">{row.key}</span>
          <span className="text-gray-700 dark:text-gray-200">{fmt(row.after)}</span>
        </div>
      );
    case 'removed':
      return (
        <div data-testid={`fsm-audit-diff-removed-${row.key}`} className="flex gap-2">
          <span className="font-mono text-red-700 dark:text-red-300">−</span>
          <span className="font-medium text-gray-500 line-through dark:text-gray-400">
            {row.key}
          </span>
          <span className="text-gray-500 line-through dark:text-gray-400">
            {fmt(row.before)}
          </span>
        </div>
      );
    case 'changed':
      return (
        <div data-testid={`fsm-audit-diff-changed-${row.key}`} className="flex flex-col">
          <div className="flex gap-2">
            <span className="font-mono text-amber-700 dark:text-amber-300">~</span>
            <span className="font-medium text-gray-700 dark:text-gray-200">{row.key}</span>
          </div>
          <div className="ml-4 flex flex-col text-[11px]">
            <span className="text-red-700 dark:text-red-300">− {fmt(row.before)}</span>
            <span className="text-green-700 dark:text-green-300">+ {fmt(row.after)}</span>
          </div>
        </div>
      );
    case 'unchanged':
      return (
        <div className="flex gap-2 text-gray-400 dark:text-gray-500">
          <span className="font-mono">·</span>
          <span>{row.key}</span>
          <span>{fmt(row.value)}</span>
        </div>
      );
  }
}

/**
 * Best-effort match of an audit row to a history entry. The two
 * collections share `from_state` / `to_state` / `event_type` /
 * `timestamp` — that triple is unique per transition in practice
 * (event_log timestamps go to the second; concurrent transitions
 * on the same job are serialized by SQLite's row lock). Returns
 * `undefined` when no match is found, so the caller can render
 * "Details" disclosure off only when audit data is present.
 */
export function matchAuditEntry(
  audit: ReadonlyArray<FsmAuditLogEntry>,
  entry: EntityHistoryEntry,
): FsmAuditLogEntry | undefined {
  return audit.find(
    (a) =>
      a.from_state === entry.from_state &&
      a.to_state === entry.to_state &&
      a.event_type === entry.event_type &&
      a.timestamp === entry.timestamp,
  );
}
