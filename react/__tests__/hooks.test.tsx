/**
 * Phase 21.8.3 — SDK React data hooks.
 *
 * Each public hook is a thin wrapper around one client method plus
 * either `useReadHook` or `useActionBase`. The tests here lock down
 * the shared behavior one level up (the base patterns) so every
 * public hook inherits the contract for free:
 *
 *   * Read hooks: initial load → data populates + loading false;
 *     server error → error populates + loading false; `refetch()`
 *     triggers a fresh fetcher call; unmount while pending doesn't
 *     update state (AbortSignal guard).
 *   * Action hooks: happy path → `result` populates + loading false;
 *     thrown `ApiError` → `error` populates + loading false;
 *     multiple sequential calls overwrite `result`.
 *
 * Per-hook URL + payload shape checks live in the SDK client tests
 * (`frontend/sdk/__tests__/*.test.ts`) — those pin the wire. Here we
 * pin the React state machine.
 */

// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '../../client/core';
import type { SocketFactory } from '../../client/realtime';
import { makeMockFetcher } from '../../__tests__/helpers';
import type {
  EntityResponse,
  EventLogEntry,
  JobResponse,
  SchemaResponse,
} from '../../types/common';
import { FastYokeProvider } from '../context';
import {
  useCancelJob,
  useCreateEntity,
  useDeleteEntity,
  useEntities,
  useEntity,
  useJob,
  useJobHistory,
  useJobs,
  useSchema,
  useSchemas,
  useSpawnJob,
  useTransitionJob,
  useUpdateEntity,
  useActiveSchemas,
} from '../hooks';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const ENTITY_RECORD: EntityResponse = {
  id: 'e-1',
  tenant_id: 't-1',
  entity_name: 'widget',
  data_payload: { color: 'red' },
  created_at: '2026-04-21T00:00:00Z',
  updated_at: '2026-04-21T00:00:00Z',
};

const JOB: JobResponse = {
  id: 'j-1',
  tenant_id: 't-1',
  schema_id: 's-1',
  current_state: 'pending',
  context_record_id: null,
  updated_at: '2026-04-21T00:00:00Z',
};

const EVENT_LOG: EventLogEntry[] = [
  {
    id: 'ev-1',
    job_id: 'j-1',
    event_type: '__created__',
    from_state: null,
    to_state: 'pending',
    timestamp: '2026-04-21T00:00:00Z',
  },
];

const SCHEMA_ACTIVE: SchemaResponse = {
  id: 's-1',
  tenant_id: 't-1',
  name: 'shipment',
  version: 2,
  schema_json: { initial_state: 'pending', transitions: [] },
  is_active: true,
  created_at: '2026-04-21T00:00:00Z',
};

const SCHEMA_INACTIVE: SchemaResponse = {
  ...SCHEMA_ACTIVE,
  id: 's-0',
  version: 1,
  is_active: false,
};

function providerWrapper(script: Parameters<typeof makeMockFetcher>[0]) {
  const { fetcher, requests } = makeMockFetcher(script);
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    // Phase 21.8.7b: existing tests cover the fetch-only path, so
    // we disable realtime to keep them isolated from the WS layer.
    // Realtime behavior has its own dedicated test block below.
    <FastYokeProvider tenantId="t-1" fetcher={fetcher} realtime={false}>
      {children}
    </FastYokeProvider>
  );
  return { wrapper, requests };
}

// ---------------------------------------------------------------------------
// Read-hook base behavior (covered via useEntities as the representative)
// ---------------------------------------------------------------------------

describe('read hooks — shared base behavior', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('starts loading=true, populates data on resolve', async () => {
    const paged = { records: [ENTITY_RECORD], total: 1, page: 1, page_size: 50 };
    const { wrapper } = providerWrapper([{ json: paged }]);

    const { result } = renderHook(() => useEntities('widget'), { wrapper });

    // Synchronous first render: no data, loading=true, no error.
    expect(result.current.data).toBeNull();
    expect(result.current.loading).toBe(true);
    expect(result.current.error).toBeNull();

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.data).toEqual(paged);
    expect(result.current.error).toBeNull();
  });

  it('surfaces fetcher errors into `error` without throwing', async () => {
    const { wrapper } = providerWrapper([
      { status: 500, json: { error: 'db exploded' } },
    ]);

    const { result } = renderHook(() => useEntities('widget'), { wrapper });

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.error?.message).toBe('db exploded');
    expect(result.current.data).toBeNull();
  });

  it('refetch() triggers a second fetcher call', async () => {
    const paged = { records: [], total: 0, page: 1, page_size: 50 };
    const { wrapper, requests } = providerWrapper([
      { json: paged },
      { json: { ...paged, total: 1, records: [ENTITY_RECORD] } },
    ]);

    const { result } = renderHook(() => useEntities('widget'), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(requests).toHaveLength(1);

    act(() => {
      result.current.refetch();
    });

    await waitFor(() => expect(result.current.data?.total).toBe(1));
    expect(requests).toHaveLength(2);
  });

  it('does not update state when unmounted before the fetch resolves', async () => {
    // Script a deferred resolver: the fetcher returns a Response
    // that stalls until we flip the latch. Unmount while the
    // promise is still pending, then resolve — the hook must NOT
    // warn or update state post-unmount.
    let resolver: (value: Response) => void = () => undefined;
    const fetcher = vi.fn(
      () =>
        new Promise<Response>((r) => {
          resolver = r;
        }),
    );
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <FastYokeProvider tenantId="t-1" fetcher={fetcher} realtime={false}>
        {children}
      </FastYokeProvider>
    );

    const warnSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { result, unmount } = renderHook(() => useEntities('widget'), {
      wrapper,
    });
    expect(result.current.loading).toBe(true);
    unmount();

    // Now resolve the pending fetch.
    resolver(
      new Response(JSON.stringify({ records: [], total: 0, page: 1, page_size: 50 }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    await Promise.resolve();
    await Promise.resolve();

    // React's "Can't perform a React state update on an unmounted
    // component" warning would fire via console.error; the AbortSignal
    // guard prevents it.
    expect(warnSpy).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// Per-read-hook URL smoke tests — prove each hook binds the right client
// ---------------------------------------------------------------------------

describe('read hooks — each hook hits the expected endpoint', () => {
  const tenantOnly = (url: string) => url.split('?')[1];

  it('useEntity → GET /tenant/entities/:kind/:id', async () => {
    const { wrapper, requests } = providerWrapper([{ json: ENTITY_RECORD }]);
    const { result } = renderHook(() => useEntity('widget', 'e-1'), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(requests[0].url.startsWith('/api/v1/tenant/entities/widget/e-1?')).toBe(true);
    expect(tenantOnly(requests[0].url)).toContain('tenant_id=t-1');
  });

  it('useJobs → GET /tenant/jobs', async () => {
    const { wrapper, requests } = providerWrapper([{ json: [JOB] }]);
    const { result } = renderHook(() => useJobs(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(requests[0].url.startsWith('/api/v1/tenant/jobs?')).toBe(true);
  });

  it('useJob → GET /tenant/jobs/:id', async () => {
    const { wrapper, requests } = providerWrapper([{ json: JOB }]);
    const { result } = renderHook(() => useJob('j-1'), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(requests[0].url.startsWith('/api/v1/tenant/jobs/j-1?')).toBe(true);
  });

  it('useJobHistory → GET /tenant/jobs/:id/history', async () => {
    const { wrapper, requests } = providerWrapper([{ json: EVENT_LOG }]);
    const { result } = renderHook(() => useJobHistory('j-1'), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(requests[0].url.startsWith('/api/v1/tenant/jobs/j-1/history?')).toBe(true);
  });

  it('useSchemas → GET /tenant/schemas', async () => {
    const { wrapper, requests } = providerWrapper([
      { json: [SCHEMA_ACTIVE, SCHEMA_INACTIVE] },
    ]);
    const { result } = renderHook(() => useSchemas(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(requests[0].url.startsWith('/api/v1/tenant/schemas?')).toBe(true);
    expect(result.current.data).toHaveLength(2);
  });

  it('useSchema → GET /tenant/schemas/:id', async () => {
    const { wrapper, requests } = providerWrapper([{ json: SCHEMA_ACTIVE }]);
    const { result } = renderHook(() => useSchema('s-1'), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(requests[0].url.startsWith('/api/v1/tenant/schemas/s-1?')).toBe(true);
  });

  it('useActiveSchemas filters is_active=false rows client-side', async () => {
    const { wrapper } = providerWrapper([
      { json: [SCHEMA_ACTIVE, SCHEMA_INACTIVE] },
    ]);
    const { result } = renderHook(() => useActiveSchemas(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data).toHaveLength(1);
    expect(result.current.data?.[0].id).toBe('s-1');
  });
});

// ---------------------------------------------------------------------------
// Action-hook base behavior
// ---------------------------------------------------------------------------

describe('action hooks — shared base behavior', () => {
  it('starts idle; run() flips loading→true, then result populates', async () => {
    const { wrapper } = providerWrapper([{ json: ENTITY_RECORD }]);

    const { result } = renderHook(() => useCreateEntity(), { wrapper });

    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.result).toBeNull();

    let returned: typeof ENTITY_RECORD | null = null;
    await act(async () => {
      returned = await result.current.createEntity({
        kind: 'widget',
        dataPayload: { color: 'red' },
      });
    });

    expect(returned).toEqual(ENTITY_RECORD);
    expect(result.current.result).toEqual(ENTITY_RECORD);
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('surfaces ApiError into `error` and re-throws so callers can handle it', async () => {
    const { wrapper } = providerWrapper([
      { status: 422, json: { error: 'already promoted' } },
    ]);

    const { result } = renderHook(() => useCreateEntity(), { wrapper });

    let thrown: unknown = null;
    await act(async () => {
      try {
        await result.current.createEntity({ kind: 'widget', dataPayload: {} });
      } catch (e) {
        thrown = e;
      }
    });

    expect(thrown).toBeInstanceOf(ApiError);
    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.error?.message).toBe('already promoted');
    expect(result.current.loading).toBe(false);
    expect(result.current.result).toBeNull();
  });

  it('a second successful call overwrites `result` and clears `error`', async () => {
    const { wrapper } = providerWrapper([
      { status: 422, json: { error: 'first failed' } },
      { json: ENTITY_RECORD },
    ]);

    const { result } = renderHook(() => useCreateEntity(), { wrapper });

    await act(async () => {
      try {
        await result.current.createEntity({ kind: 'widget', dataPayload: {} });
      } catch {
        /* swallow */
      }
    });
    expect(result.current.error?.message).toBe('first failed');

    await act(async () => {
      await result.current.createEntity({ kind: 'widget', dataPayload: {} });
    });
    expect(result.current.error).toBeNull();
    expect(result.current.result).toEqual(ENTITY_RECORD);
  });

  it('does not update state after unmount', async () => {
    let resolver: (value: Response) => void = () => undefined;
    const fetcher = vi.fn(
      () =>
        new Promise<Response>((r) => {
          resolver = r;
        }),
    );
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <FastYokeProvider tenantId="t-1" fetcher={fetcher} realtime={false}>
        {children}
      </FastYokeProvider>
    );
    const warnSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { result, unmount } = renderHook(() => useCreateEntity(), {
      wrapper,
    });

    // Fire the action inside act() so the synchronous `setLoading(true)`
    // doesn't trip React's "update not wrapped in act" warning —
    // which would hide the real assertion (no post-unmount update).
    let pending: Promise<unknown> = Promise.resolve();
    await act(async () => {
      pending = result.current.createEntity({
        kind: 'widget',
        dataPayload: {},
      });
      // Do NOT await `pending` — leave it in-flight so we can unmount
      // before it resolves, which is the scenario under test.
    });

    unmount();
    resolver(
      new Response(JSON.stringify(ENTITY_RECORD), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    try {
      await pending;
    } catch {
      /* swallow */
    }

    // Any post-unmount setState would surface via React's
    // console.error path; the mounted-ref guard prevents it.
    expect(warnSpy).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// Per-write-hook binding checks
// ---------------------------------------------------------------------------

describe('action hooks — each hook hits the expected endpoint', () => {
  it('useUpdateEntity → PATCH /tenant/entities/:kind/:id', async () => {
    const { wrapper, requests } = providerWrapper([{ json: ENTITY_RECORD }]);
    const { result } = renderHook(() => useUpdateEntity(), { wrapper });

    await act(async () => {
      await result.current.updateEntity({
        kind: 'widget',
        id: 'e-1',
        dataPayload: { color: 'blue' },
      });
    });
    expect(requests[0].method).toBe('PATCH');
    expect(requests[0].url).toBe('/api/v1/tenant/entities/widget/e-1');
    expect(requests[0].body).toMatchObject({
      tenant_id: 't-1',
      data_payload: { color: 'blue' },
    });
  });

  it('useDeleteEntity → DELETE + resolves `result=true` on 204', async () => {
    const { wrapper, requests } = providerWrapper([{ status: 204, json: null }]);
    const { result } = renderHook(() => useDeleteEntity(), { wrapper });

    await act(async () => {
      await result.current.deleteEntity({ kind: 'widget', id: 'e-1' });
    });
    expect(requests[0].method).toBe('DELETE');
    expect(
      requests[0].url.startsWith('/api/v1/tenant/entities/widget/e-1?'),
    ).toBe(true);
    expect(result.current.result).toBe(true);
  });

  it('useSpawnJob → POST /tenant/jobs', async () => {
    const { wrapper, requests } = providerWrapper([{ json: JOB }]);
    const { result } = renderHook(() => useSpawnJob(), { wrapper });

    await act(async () => {
      await result.current.spawnJob({ schemaId: 's-1' });
    });
    expect(requests[0].method).toBe('POST');
    expect(requests[0].url).toBe('/api/v1/tenant/jobs');
    expect(requests[0].body).toMatchObject({ tenant_id: 't-1', schema_id: 's-1' });
  });

  it('useTransitionJob → POST /tenant/jobs/:id/transition', async () => {
    const { wrapper, requests } = providerWrapper([
      { json: { ...JOB, current_state: 'approved' } },
    ]);
    const { result } = renderHook(() => useTransitionJob(), { wrapper });

    await act(async () => {
      await result.current.transitionJob({
        id: 'j-1',
        input: { eventType: 'approve' },
      });
    });
    expect(requests[0].method).toBe('POST');
    expect(requests[0].url).toBe('/api/v1/tenant/jobs/j-1/transition');
    expect(requests[0].body).toMatchObject({
      tenant_id: 't-1',
      event_type: 'approve',
    });
  });

  it('useCancelJob → POST /tenant/jobs/:id/cancel with target_state + reason', async () => {
    const { wrapper, requests } = providerWrapper([
      { json: { ...JOB, current_state: 'rejected' } },
    ]);
    const { result } = renderHook(() => useCancelJob(), { wrapper });

    await act(async () => {
      await result.current.cancelJob({
        id: 'j-1',
        input: { targetState: 'rejected', reason: 'lost in transit' },
      });
    });
    expect(requests[0].method).toBe('POST');
    expect(requests[0].url).toBe('/api/v1/tenant/jobs/j-1/cancel');
    expect(requests[0].body).toMatchObject({
      tenant_id: 't-1',
      target_state: 'rejected',
      reason: 'lost in transit',
    });
  });
});

// ---------------------------------------------------------------------------
// Phase 21.8.7b — realtime auto-refetch integration
// ---------------------------------------------------------------------------

interface FakeSocket {
  url: string;
  onmessage: ((ev: { data: unknown }) => void) | null;
  onopen: ((ev: unknown) => void) | null;
  onclose: ((ev: unknown) => void) | null;
  onerror: ((ev: unknown) => void) | null;
  close(): void;
  push(data: unknown): void;
}

function makeFakeSocketFactory(): {
  factory: (url: string) => FakeSocket;
  sockets: FakeSocket[];
} {
  const sockets: FakeSocket[] = [];
  const factory = (url: string) => {
    const s: FakeSocket = {
      url,
      onmessage: null,
      onopen: null,
      onclose: null,
      onerror: null,
      close() {
        /* noop */
      },
      push(data: unknown) {
        s.onmessage?.({ data });
      },
    };
    sockets.push(s);
    return s;
  };
  return { factory, sockets };
}

function realtimeWrapper(
  script: Parameters<typeof makeMockFetcher>[0],
): {
  wrapper: ({ children }: { children: React.ReactNode }) => React.ReactElement;
  requests: ReturnType<typeof makeMockFetcher>['requests'];
  sockets: FakeSocket[];
} {
  const { fetcher, requests } = makeMockFetcher(script);
  const { factory, sockets } = makeFakeSocketFactory();
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <FastYokeProvider
      tenantId="t-1"
      fetcher={fetcher}
      socketFactory={factory as SocketFactory}
    >
      {children}
    </FastYokeProvider>
  );
  return { wrapper, requests, sockets };
}

describe('realtime auto-refetch', () => {
  it('useEntities refetches when a matching entity_mutation arrives', async () => {
    const paged = { records: [ENTITY_RECORD], total: 1, page: 1, page_size: 50 };
    const { wrapper, requests, sockets } = realtimeWrapper([
      { json: paged },
      { json: { ...paged, total: 2 } },
    ]);

    const { result } = renderHook(() => useEntities('widget'), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(requests).toHaveLength(1);

    // Wait for the provider effect to publish the socket.
    await waitFor(() => expect(sockets.length).toBeGreaterThan(0));

    await act(async () => {
      sockets[0].push(
        JSON.stringify({
          kind: 'entity_mutation',
          tenant_id: 't-1',
          entity_name: 'widget',
          record_id: 'e-99',
          op: 'create',
        }),
      );
    });

    await waitFor(() => expect(requests).toHaveLength(2));
    expect(result.current.data?.total).toBe(2);
  });

  it('useEntities ignores entity_mutation for a different kind', async () => {
    const paged = { records: [], total: 0, page: 1, page_size: 50 };
    const { wrapper, requests, sockets } = realtimeWrapper([{ json: paged }]);

    const { result } = renderHook(() => useEntities('widget'), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    await waitFor(() => expect(sockets.length).toBeGreaterThan(0));

    await act(async () => {
      sockets[0].push(
        JSON.stringify({
          kind: 'entity_mutation',
          tenant_id: 't-1',
          entity_name: 'other_kind',
          record_id: 'r-1',
          op: 'update',
        }),
      );
    });

    // Give any stray async work a chance to land.
    await new Promise((r) => setTimeout(r, 0));
    expect(requests).toHaveLength(1);
  });

  it('useEntity refetches only on matching record_id', async () => {
    const { wrapper, requests, sockets } = realtimeWrapper([
      { json: ENTITY_RECORD },
      { json: ENTITY_RECORD },
    ]);
    const { result } = renderHook(() => useEntity('widget', 'e-1'), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    await waitFor(() => expect(sockets.length).toBeGreaterThan(0));

    // Non-matching record_id → no refetch.
    await act(async () => {
      sockets[0].push(
        JSON.stringify({
          kind: 'entity_mutation',
          tenant_id: 't-1',
          entity_name: 'widget',
          record_id: 'e-99',
          op: 'update',
        }),
      );
    });
    await new Promise((r) => setTimeout(r, 0));
    expect(requests).toHaveLength(1);

    // Matching record_id → refetch.
    await act(async () => {
      sockets[0].push(
        JSON.stringify({
          kind: 'entity_mutation',
          tenant_id: 't-1',
          entity_name: 'widget',
          record_id: 'e-1',
          op: 'update',
        }),
      );
    });
    await waitFor(() => expect(requests).toHaveLength(2));
  });

  it('useJob refetches on transition for the same job_id', async () => {
    const { wrapper, requests, sockets } = realtimeWrapper([
      { json: JOB },
      { json: { ...JOB, current_state: 'approved' } },
    ]);
    const { result } = renderHook(() => useJob('j-1'), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    await waitFor(() => expect(sockets.length).toBeGreaterThan(0));

    await act(async () => {
      sockets[0].push(
        JSON.stringify({
          kind: 'transition',
          tenant_id: 't-1',
          job_id: 'j-1',
          schema_id: 's-1',
          event_type: 'approve',
          from_state: 'pending',
          to_state: 'approved',
        }),
      );
    });
    await waitFor(() => expect(result.current.data?.current_state).toBe('approved'));
    expect(requests).toHaveLength(2);
  });

  it('useJobs refetches on any transition across the tenant', async () => {
    const { wrapper, requests, sockets } = realtimeWrapper([
      { json: [JOB] },
      { json: [JOB, { ...JOB, id: 'j-2' }] },
    ]);
    const { result } = renderHook(() => useJobs(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    await waitFor(() => expect(sockets.length).toBeGreaterThan(0));

    await act(async () => {
      sockets[0].push(
        JSON.stringify({
          kind: 'transition',
          tenant_id: 't-1',
          job_id: 'j-other',
          schema_id: 's-1',
          event_type: 'approve',
          from_state: null,
          to_state: 'pending',
        }),
      );
    });
    await waitFor(() => expect(requests).toHaveLength(2));
    expect(result.current.data).toHaveLength(2);
  });

  it('{ realtime: false } opts out of auto-refetch', async () => {
    const paged = { records: [], total: 0, page: 1, page_size: 50 };
    const { wrapper, requests, sockets } = realtimeWrapper([{ json: paged }]);

    const { result } = renderHook(
      () => useEntities('widget', undefined, { realtime: false }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    await waitFor(() => expect(sockets.length).toBeGreaterThan(0));

    await act(async () => {
      sockets[0].push(
        JSON.stringify({
          kind: 'entity_mutation',
          tenant_id: 't-1',
          entity_name: 'widget',
          record_id: 'e-99',
          op: 'create',
        }),
      );
    });
    await new Promise((r) => setTimeout(r, 0));
    expect(requests).toHaveLength(1);
  });
});
