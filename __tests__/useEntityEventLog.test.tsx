import { renderHook, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { useEntityEventLog } from '../react/workflow/useEntityEventLog';

describe('useEntityEventLog', () => {
  it('merges histories from multiple jobs sorted newest-first', async () => {
    const fetcher = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/j1/history')) {
        return Promise.resolve({
          ok: true,
          json: async () => ([
            { id: 'e1', job_id: 'j1', event_type: 'submitted', from_state: null, to_state: 'submitted', timestamp: '2026-04-30T10:00:00Z' },
          ]),
        });
      }
      if (url.includes('/j2/history')) {
        return Promise.resolve({
          ok: true,
          json: async () => ([
            { id: 'e2', job_id: 'j2', event_type: 'approved', from_state: 'submitted', to_state: 'approved', timestamp: '2026-05-01T10:00:00Z' },
          ]),
        });
      }
      return Promise.reject(new Error('unexpected url'));
    });
    const { result } = renderHook(() =>
      useEntityEventLog({ tenantId: 't1', jobIds: ['j1', 'j2'], fetcher }),
    );
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.entries.map((e) => e.id)).toEqual(['e2', 'e1']);
  });

  it('caps at 50 entries', async () => {
    const many = Array.from({ length: 80 }, (_, i) => ({
      id: `e${i}`, job_id: 'j1', event_type: 'x', from_state: null, to_state: 'x',
      timestamp: new Date(2026, 0, 1, 0, i).toISOString(),
    }));
    const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => many });
    const { result } = renderHook(() =>
      useEntityEventLog({ tenantId: 't1', jobIds: ['j1'], fetcher }),
    );
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.entries).toHaveLength(50);
  });

  it('returns empty entries immediately when jobIds is empty', async () => {
    const fetcher = vi.fn();
    const { result } = renderHook(() =>
      useEntityEventLog({ tenantId: 't1', jobIds: [], fetcher }),
    );
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.entries).toEqual([]);
    expect(fetcher).not.toHaveBeenCalled();
  });
});
