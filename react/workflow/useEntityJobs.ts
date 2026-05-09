import { useEffect, useState } from 'react';
import type { JobResponse } from '../../types/common';

type State =
  | { status: 'loading'; jobs: [] }
  | { status: 'ready'; jobs: JobResponse[] }
  | { status: 'error'; jobs: []; error: string };

export interface UseEntityJobsArgs {
  tenantId: string;
  entityId: string;
  fetcher?: typeof fetch;
  baseUrl?: string;
}

export function useEntityJobs({
  tenantId,
  entityId,
  fetcher = fetch,
  baseUrl = '',
}: UseEntityJobsArgs): State {
  const [state, setState] = useState<State>({ status: 'loading', jobs: [] });

  useEffect(() => {
    let cancelled = false;
    const url = `${baseUrl}/api/v1/tenant/jobs?tenant_id=${encodeURIComponent(tenantId)}&entity_id=${encodeURIComponent(entityId)}`;
    fetcher(url)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`jobs fetch ${r.status}`))))
      .then((jobs: JobResponse[]) => {
        if (!cancelled) setState({ status: 'ready', jobs });
      })
      .catch((e: Error) => {
        if (!cancelled) setState({ status: 'error', jobs: [], error: e.message });
      });
    return () => { cancelled = true; };
  }, [tenantId, entityId, fetcher, baseUrl]);

  return state;
}
