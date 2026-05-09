import { useEffect, useState } from 'react';
import type { EventLogEntry } from '../../types/common';

type State =
  | { status: 'loading'; entries: [] }
  | { status: 'ready'; entries: EventLogEntry[] }
  | { status: 'error'; entries: []; error: string };

export interface UseEntityEventLogArgs {
  tenantId: string;
  jobIds: string[];
  fetcher?: typeof fetch;
  baseUrl?: string;
  cap?: number;
}

export function useEntityEventLog({
  tenantId,
  jobIds,
  fetcher = fetch,
  baseUrl = '',
  cap = 50,
}: UseEntityEventLogArgs): State {
  const [state, setState] = useState<State>({ status: 'loading', entries: [] });

  useEffect(() => {
    let cancelled = false;
    if (jobIds.length === 0) {
      setState({ status: 'ready', entries: [] });
      return () => { cancelled = true; };
    }
    Promise.all(
      jobIds.map((id) =>
        fetcher(`${baseUrl}/api/v1/tenant/jobs/${encodeURIComponent(id)}/history?tenant_id=${encodeURIComponent(tenantId)}`)
          .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`history fetch ${r.status}`))))
          .then((entries: EventLogEntry[]) => entries),
      ),
    )
      .then((lists) => {
        if (cancelled) return;
        const merged = lists.flat().sort(
          (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
        ).slice(0, cap);
        setState({ status: 'ready', entries: merged });
      })
      .catch((e: Error) => {
        if (!cancelled) setState({ status: 'error', entries: [], error: e.message });
      });
    return () => { cancelled = true; };
  }, [tenantId, jobIds.join(','), fetcher, baseUrl, cap]);

  return state;
}
