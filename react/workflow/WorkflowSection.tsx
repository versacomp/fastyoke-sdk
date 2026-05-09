/**
 * WorkflowSection — Studio detail-page workflow chrome.
 *
 * Composes:
 *   - useEntityJobs        → adopts the first active job for the entity record.
 *   - schema fetch         → /api/v1/tenant/schemas/:id?tenant_id=… returns the
 *                            SchemaResponse wrapper; transitions live under
 *                            `.schema_json.transitions`.
 *   - useEntityEventLog    → merged history newest-first across the entity's
 *                            jobs (cap 50).
 *   - transition POST      → /api/v1/tenant/jobs/:id/transition with optimistic
 *                            update. On non-OK we revert the badge and surface
 *                            the server's error message via a role=alert.
 *
 * Empty-state branch: when the entity has zero active jobs but at least one
 * schema is bound to the entity name, render a "Start workflow" CTA. The
 * spawn flow itself is owned by the studio host page; we just expose the seam.
 */
import { useEffect, useMemo, useState } from 'react';
import type {
  EventLogEntry,
  JobResponse,
  SchemaResponse,
} from '../../types/common';
import { useEntityJobs } from './useEntityJobs';
import { useEntityEventLog } from './useEntityEventLog';

export interface WorkflowSectionProps {
  tenantId: string;
  entityName: string;
  entityId: string;
  fetcher?: typeof fetch;
  baseUrl?: string;
  /**
   * Optional callback fired when the user clicks "Start workflow" in the
   * empty-state. The host owns spawn UX (schema picker, payload prompts).
   */
  onStartWorkflow?: (schemas: SchemaResponse[]) => void;
}

export function WorkflowSection({
  tenantId,
  entityName,
  entityId,
  fetcher = fetch,
  baseUrl = '',
  onStartWorkflow,
}: WorkflowSectionProps) {
  const jobsState = useEntityJobs({ tenantId, entityId, fetcher, baseUrl });

  const [activeJob, setActiveJob] = useState<JobResponse | null>(null);
  const [pendingState, setPendingState] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [schema, setSchema] = useState<SchemaResponse | null>(null);
  const [emptyStateSchemas, setEmptyStateSchemas] = useState<
    SchemaResponse[] | null
  >(null);

  // Adopt first job once jobs settle. We re-bind whenever the underlying
  // jobs list changes; the optimistic update path also re-sets activeJob
  // directly with the server's transition response.
  useEffect(() => {
    if (jobsState.status === 'ready') {
      setActiveJob((prev) => {
        const first = jobsState.jobs[0] ?? null;
        // Preserve a more recent server-confirmed activeJob over a stale
        // re-emit of the jobs hook.
        if (prev && first && prev.id === first.id) return prev;
        return first;
      });
    }
  }, [jobsState]);

  // Schema fetch for the active job.
  useEffect(() => {
    if (!activeJob) {
      setSchema(null);
      return;
    }
    let cancelled = false;
    fetcher(
      `${baseUrl}/api/v1/tenant/schemas/${encodeURIComponent(activeJob.schema_id)}?tenant_id=${encodeURIComponent(tenantId)}`,
    )
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`schema ${r.status}`))))
      .then((s: SchemaResponse) => {
        if (!cancelled) setSchema(s);
      })
      .catch(() => {
        if (!cancelled) setSchema(null);
      });
    return () => {
      cancelled = true;
    };
  }, [activeJob, tenantId, fetcher, baseUrl]);

  // Empty-state schema discovery — only fires when jobs are ready+empty.
  useEffect(() => {
    if (jobsState.status !== 'ready' || jobsState.jobs.length > 0) {
      setEmptyStateSchemas(null);
      return;
    }
    let cancelled = false;
    fetcher(
      `${baseUrl}/api/v1/tenant/schemas?tenant_id=${encodeURIComponent(tenantId)}&entity_name=${encodeURIComponent(entityName)}`,
    )
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('schemas'))))
      .then((list: SchemaResponse[]) => {
        if (cancelled) return;
        // Server filter returns schemas bound to this entity OR unbound
        // (entity_name IS NULL). Narrow client-side to schemas explicitly
        // bound to this entity so the CTA only appears when meaningful.
        const bound = list.filter((s) => s.entity_name === entityName);
        setEmptyStateSchemas(bound);
      })
      .catch(() => {
        if (!cancelled) setEmptyStateSchemas([]);
      });
    return () => {
      cancelled = true;
    };
  }, [jobsState, tenantId, entityName, fetcher, baseUrl]);

  const jobIds = useMemo(
    () => (jobsState.status === 'ready' ? jobsState.jobs.map((j) => j.id) : []),
    [jobsState],
  );
  const eventLog = useEntityEventLog({ tenantId, jobIds, fetcher, baseUrl });

  const currentState = pendingState ?? activeJob?.current_state ?? '—';
  const legalTransitions = useMemo(() => {
    if (!schema || !activeJob) return [];
    const txs = schema.schema_json.transitions ?? [];
    return txs.filter((t) => t.from === activeJob.current_state);
  }, [schema, activeJob]);

  async function advance(eventType: string, toState: string) {
    if (!activeJob) return;
    setPendingState(toState);
    setError(null);
    try {
      const res = await fetcher(
        `${baseUrl}/api/v1/tenant/jobs/${encodeURIComponent(activeJob.id)}/transition`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tenant_id: tenantId, event_type: eventType }),
        },
      );
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body?.error ?? `transition ${res.status}`);
      }
      const updated = (await res.json()) as JobResponse;
      setActiveJob(updated);
      setPendingState(null);
    } catch (e) {
      // Revert: clear the pending optimistic state and surface error.
      setPendingState(null);
      setError((e as Error).message);
    }
  }

  // Empty-state branch.
  if (jobsState.status === 'ready' && jobsState.jobs.length === 0) {
    if (emptyStateSchemas && emptyStateSchemas.length > 0) {
      return (
        <section className="rounded border border-slate-200 bg-white p-4">
          <button
            type="button"
            onClick={() => onStartWorkflow?.(emptyStateSchemas)}
            className="rounded bg-indigo-600 px-3 py-1.5 text-sm text-white hover:bg-indigo-700"
          >
            Start workflow
          </button>
        </section>
      );
    }
    return null;
  }

  return (
    <section className="rounded border border-slate-200 bg-white p-4 space-y-3">
      {error && (
        <div
          role="alert"
          className="rounded bg-red-50 px-3 py-2 text-sm text-red-700"
        >
          {error}
        </div>
      )}

      <header className="flex items-center gap-3">
        <span className="rounded-full bg-indigo-100 px-3 py-0.5 text-xs font-medium text-indigo-700">
          {currentState}
        </span>
        {schema && <span className="text-sm text-slate-600">{schema.name}</span>}
      </header>

      {legalTransitions.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {legalTransitions.map((t) => (
            <button
              key={t.event_type}
              type="button"
              disabled={pendingState !== null}
              onClick={() => advance(t.event_type, t.to)}
              className="rounded border border-indigo-300 bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-800 hover:bg-indigo-100 disabled:opacity-50"
            >
              {t.event_type}
            </button>
          ))}
        </div>
      )}

      {eventLog.status === 'ready' && eventLog.entries.length > 0 && (
        <ul className="divide-y divide-slate-100 text-xs">
          {eventLog.entries.map((e: EventLogEntry) => (
            <li key={e.id} className="py-1.5 flex justify-between gap-3">
              <span>
                <span className="font-mono">{e.event_type}</span>
                {e.event_type === '__admin_cancel__' && e.reason && (
                  <span className="ml-2 italic text-slate-500">— {e.reason}</span>
                )}
              </span>
              <span className="text-slate-400">
                {new Date(e.timestamp).toLocaleString()}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
