import { renderHook, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { useEntityJobs } from '../react/workflow/useEntityJobs';

describe('useEntityJobs', () => {
  it('lists jobs filtered by entityId', async () => {
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ([{ id: 'j1', current_state: 'submitted' }]),
    });
    const { result } = renderHook(() =>
      useEntityJobs({ tenantId: 't1', entityId: 'rec-42', fetcher }),
    );
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.jobs).toHaveLength(1);
    expect(fetcher).toHaveBeenCalledWith(
      expect.stringContaining('/api/v1/tenant/jobs?tenant_id=t1&entity_id=rec-42'),
    );
  });

  it('reports error status on non-ok response', async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) });
    const { result } = renderHook(() =>
      useEntityJobs({ tenantId: 't1', entityId: 'rec-42', fetcher }),
    );
    await waitFor(() => expect(result.current.status).toBe('error'));
  });
});
