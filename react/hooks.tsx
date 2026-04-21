/**
 * Phase 21.8.3 — React data hooks for the FastYoke SDK.
 *
 * Thin async wrappers over the clients exposed by `FastYokeProvider`.
 * Two shapes:
 *
 *   * **Read hooks**: `{ data, loading, error, refetch }`.
 *     Fire on mount and whenever their dependencies change. Use an
 *     AbortController-based cancellation flag so results from a
 *     superseded or post-unmount fetch never update component state.
 *     The network request itself is not aborted (the clients don't
 *     forward `AbortSignal` yet — tracked as follow-up) but its
 *     result is discarded, which is what matters for React
 *     correctness.
 *
 *   * **Action hooks**: `{ <verb>, loading, error, result }`.
 *     `<verb>` is a stable callback the component invokes with the
 *     action's arguments. `result` holds the last successful response
 *     (typed per hook); `error` holds the last thrown `ApiError` or
 *     other `Error`. `loading` flips `true` while the promise is
 *     in-flight. A mount guard prevents post-unmount state updates.
 *
 * Locked design decisions these hooks enforce (see
 * memory/phase_21_8_real_data_plan.md):
 *
 *   * **No optimistic updates.** Callers always see `loading = true`
 *     until the round-trip completes. Zustand couplings would leak
 *     host-store choices into extensions.
 *   * **FSM-only action triggering.** There is no `useRunAction` or
 *     similar — actions fire exclusively through FSM transitions so
 *     Phase 16 metering attribution stays clean.
 *   * **Hard-delete.** `useDeleteEntity` returns `void` on success;
 *     no soft-tombstone. Audit history comes from an FSM-owned
 *     entity kind's `event_log`.
 *
 * Ship-log note from 21.8.2: the client calls the method `patch`
 * (not `update`) and `history` (not `getHistory`). External hook
 * names stay readable (`useUpdateEntity`, `useJobHistory`) while
 * delegating to the real method names internally.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import type { ListEntitiesParams, PagedEntityResponse } from '../client/entities';
import type { CancelInput, CreateJobInput, ListJobsParams, TransitionInput } from '../client/jobs';
import type { ListSchemasParams } from '../client/schemas';
import type { RealtimeEvent } from '../client/realtime';
import type {
  EntityResponse,
  EventLogEntry,
  JobResponse,
  SchemaResponse,
} from '../types/common';

import { useFastYoke } from './context';

// ---------------------------------------------------------------------------
// Realtime plumbing (Phase 21.8.7b)
// ---------------------------------------------------------------------------

/**
 * Optional third argument on every realtime-aware read hook. When
 * `realtime` is not specified or is `true`, the hook subscribes to
 * the provider's shared WebSocket and refetches on matching events.
 * Pass `{ realtime: false }` to opt out per-hook (e.g. a debugging
 * panel that wants a manual `refetch()` only).
 */
export interface RealtimeOptions {
  realtime?: boolean;
}

/**
 * Subscribe to the provider's realtime client and call `refetch`
 * whenever `match` returns true. No-op when the provider has opted
 * out (`realtime: null`) or the caller passed `enabled=false`.
 *
 * `match` is held in a ref so callers can define it inline without
 * the subscription churning every render.
 */
function useRealtimeRefetch(
  match: (ev: RealtimeEvent) => boolean,
  refetch: () => void,
  enabled: boolean,
): void {
  const { realtime } = useFastYoke();
  const matchRef = useRef(match);
  matchRef.current = match;
  const refetchRef = useRef(refetch);
  refetchRef.current = refetch;

  useEffect(() => {
    if (!enabled || !realtime) return undefined;
    return realtime.subscribe((ev) => {
      if (matchRef.current(ev)) {
        refetchRef.current();
      }
    });
  }, [enabled, realtime]);
}

// ---------------------------------------------------------------------------
// Internal base patterns
// ---------------------------------------------------------------------------

export interface ReadHookResult<T> {
  /** The last successfully loaded value, or `null` before the first load. */
  data: T | null;
  /** `true` while a fetch is in-flight. Starts `true` on first mount. */
  loading: boolean;
  /** The most recent failure, or `null` if the last attempt succeeded. */
  error: Error | null;
  /** Re-run the fetch with the same inputs. Useful after a mutation. */
  refetch: () => void;
}

type ReadFn<T> = (signal: AbortSignal) => Promise<T>;

/**
 * Low-level building block for the 8 read hooks. Exposed only for
 * possible future reuse; callers should prefer the public hooks
 * (`useEntities`, `useJob`, etc.).
 *
 * `deps` is the dependency list that controls re-fetching. Changing
 * any dep triggers a fresh fetch, cancelling the previous one via
 * the `cancelled` flag on its AbortSignal.
 */
function useReadHook<T>(fn: ReadFn<T>, deps: unknown[]): ReadHookResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);
  const [refetchTick, setRefetchTick] = useState(0);

  // Hold the current fn in a ref so the effect depends only on
  // `deps` (and the refetch tick). Callers pass fresh closures
  // every render; without the ref the effect would fire on every
  // render regardless of its dep list.
  const fnRef = useRef(fn);
  fnRef.current = fn;

  useEffect(() => {
    const ac = new AbortController();
    setLoading(true);
    setError(null);

    fnRef.current(ac.signal)
      .then((result) => {
        if (ac.signal.aborted) return;
        setData(result);
        setLoading(false);
      })
      .catch((e: unknown) => {
        if (ac.signal.aborted) return;
        setError(e instanceof Error ? e : new Error(String(e)));
        setLoading(false);
      });

    return () => {
      ac.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, refetchTick]);

  const refetch = useCallback(() => {
    setRefetchTick((n) => n + 1);
  }, []);

  return { data, loading, error, refetch };
}

/**
 * Low-level building block for action hooks. Each write hook
 * customizes the public verb name (`createEntity`, `transitionJob`,
 * etc.) and return type by wrapping this.
 */
function useActionBase<TArgs extends unknown[], TResult>(
  fn: (...args: TArgs) => Promise<TResult>,
): {
  run: (...args: TArgs) => Promise<TResult>;
  loading: boolean;
  error: Error | null;
  result: TResult | null;
} {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [result, setResult] = useState<TResult | null>(null);

  // Guard against state updates after unmount.
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // `fn` closure captures the latest clients from `useFastYoke`;
  // store it in a ref so `run` stays stable across renders even as
  // the surrounding closures rotate.
  const fnRef = useRef(fn);
  fnRef.current = fn;

  const run = useCallback(async (...args: TArgs) => {
    setLoading(true);
    setError(null);
    try {
      const r = await fnRef.current(...args);
      if (mounted.current) {
        setResult(r);
        setLoading(false);
      }
      return r;
    } catch (e) {
      if (mounted.current) {
        setError(e instanceof Error ? e : new Error(String(e)));
        setLoading(false);
      }
      throw e;
    }
  }, []);

  return { run, loading, error, result };
}

// ---------------------------------------------------------------------------
// Read hooks
// ---------------------------------------------------------------------------

/**
 * List entity records of a given kind, scoped to the provider's tenant.
 *
 * Phase 21.8.7b: when realtime is enabled (default), the hook
 * auto-refetches on any `entity_mutation` event whose `entity_name`
 * equals `kind` — including inserts from other sessions. Pass
 * `{ realtime: false }` to disable.
 */
export function useEntities(
  kind: string,
  filters?: ListEntitiesParams,
  options?: RealtimeOptions,
): ReadHookResult<PagedEntityResponse> {
  const { entities } = useFastYoke();
  const result = useReadHook(
    () => entities.list(kind, filters),
    [kind, JSON.stringify(filters ?? {})],
  );
  useRealtimeRefetch(
    (ev) => ev.kind === 'entity_mutation' && ev.entity_name === kind,
    result.refetch,
    options?.realtime !== false,
  );
  return result;
}

/**
 * Fetch a single entity record. Realtime-aware: refetches when the
 * target record is updated (and returns a 404 on `op=delete`, which
 * the caller can surface as a "record was deleted" banner).
 */
export function useEntity(
  kind: string,
  id: string,
  options?: RealtimeOptions,
): ReadHookResult<EntityResponse> {
  const { entities } = useFastYoke();
  const result = useReadHook(() => entities.get(kind, id), [kind, id]);
  useRealtimeRefetch(
    (ev) =>
      ev.kind === 'entity_mutation' &&
      ev.entity_name === kind &&
      ev.record_id === id,
    result.refetch,
    options?.realtime !== false,
  );
  return result;
}

/**
 * List jobs. Realtime-aware: refetches on any FSM transition across
 * the tenant (list filters are re-applied server-side). No
 * narrowing — a new job created by another session shows up too.
 */
export function useJobs(
  params?: ListJobsParams,
  options?: RealtimeOptions,
): ReadHookResult<JobResponse[]> {
  const { jobs } = useFastYoke();
  const result = useReadHook(
    () => jobs.list(params),
    [JSON.stringify(params ?? {})],
  );
  useRealtimeRefetch(
    (ev) => ev.kind === 'transition',
    result.refetch,
    options?.realtime !== false,
  );
  return result;
}

/** Fetch a single job. Realtime-aware (refetch on matching `job_id`). */
export function useJob(
  id: string,
  options?: RealtimeOptions,
): ReadHookResult<JobResponse> {
  const { jobs } = useFastYoke();
  const result = useReadHook(() => jobs.get(id), [id]);
  useRealtimeRefetch(
    (ev) => ev.kind === 'transition' && ev.job_id === id,
    result.refetch,
    options?.realtime !== false,
  );
  return result;
}

/**
 * Fetch a job's transition history (`event_log` rows). Realtime-aware
 * — refetches on every new transition for `id` so a `<WorkflowHistory>`
 * component stays live as the job moves through its FSM.
 */
export function useJobHistory(
  id: string,
  options?: RealtimeOptions,
): ReadHookResult<EventLogEntry[]> {
  const { jobs } = useFastYoke();
  const result = useReadHook(() => jobs.history(id), [id]);
  useRealtimeRefetch(
    (ev) => ev.kind === 'transition' && ev.job_id === id,
    result.refetch,
    options?.realtime !== false,
  );
  return result;
}

/** List FSM schemas for the provider's tenant. */
export function useSchemas(
  params?: ListSchemasParams,
): ReadHookResult<SchemaResponse[]> {
  const { schemas } = useFastYoke();
  return useReadHook(
    () => schemas.list(params),
    [JSON.stringify(params ?? {})],
  );
}

/** Fetch a single schema. */
export function useSchema(id: string): ReadHookResult<SchemaResponse> {
  const { schemas } = useFastYoke();
  return useReadHook(() => schemas.get(id), [id]);
}

/**
 * Convenience over `useSchemas` — returns only schemas where
 * `is_active = true`. The backend doesn't expose a server-side
 * filter for this so the restriction lives in the hook.
 */
export function useActiveSchemas(
  params?: ListSchemasParams,
): ReadHookResult<SchemaResponse[]> {
  const inner = useSchemas(params);
  return {
    ...inner,
    data: inner.data ? inner.data.filter((s) => s.is_active) : null,
  };
}

// ---------------------------------------------------------------------------
// Action hooks
// ---------------------------------------------------------------------------

export interface CreateEntityArgs {
  kind: string;
  dataPayload: Record<string, unknown>;
}

/** Create an entity record. */
export function useCreateEntity(): {
  createEntity: (args: CreateEntityArgs) => Promise<EntityResponse>;
  loading: boolean;
  error: Error | null;
  result: EntityResponse | null;
} {
  const { entities } = useFastYoke();
  const { run, loading, error, result } = useActionBase(
    (args: CreateEntityArgs) => entities.create(args.kind, args.dataPayload),
  );
  return { createEntity: run, loading, error, result };
}

export interface UpdateEntityArgs {
  kind: string;
  id: string;
  dataPayload: Record<string, unknown>;
}

/**
 * PATCH an entity record's `data_payload`. Named `useUpdateEntity`
 * for readability even though the underlying client method is
 * `patch` — renaming the client would break 0.1.x-pinned extensions.
 */
export function useUpdateEntity(): {
  updateEntity: (args: UpdateEntityArgs) => Promise<EntityResponse>;
  loading: boolean;
  error: Error | null;
  result: EntityResponse | null;
} {
  const { entities } = useFastYoke();
  const { run, loading, error, result } = useActionBase(
    (args: UpdateEntityArgs) =>
      entities.patch(args.kind, args.id, args.dataPayload),
  );
  return { updateEntity: run, loading, error, result };
}

export interface DeleteEntityArgs {
  kind: string;
  id: string;
}

/**
 * Hard-delete an entity record. `result` resolves to `true` after a
 * successful delete (no body to return per the 21.8.1 handler
 * contract — `true`/`null` is easier to check in JSX than
 * `undefined`/`null`).
 */
export function useDeleteEntity(): {
  deleteEntity: (args: DeleteEntityArgs) => Promise<boolean>;
  loading: boolean;
  error: Error | null;
  /** `true` after the most recent delete completed successfully. */
  result: boolean | null;
} {
  const { entities } = useFastYoke();
  const { run, loading, error, result } = useActionBase(
    async (args: DeleteEntityArgs): Promise<boolean> => {
      await entities.delete(args.kind, args.id);
      return true;
    },
  );
  return { deleteEntity: run, loading, error, result };
}

/** Spawn a new job from a schema. */
export function useSpawnJob(): {
  spawnJob: (input: CreateJobInput) => Promise<JobResponse>;
  loading: boolean;
  error: Error | null;
  result: JobResponse | null;
} {
  const { jobs } = useFastYoke();
  const { run, loading, error, result } = useActionBase(
    (input: CreateJobInput) => jobs.create(input),
  );
  return { spawnJob: run, loading, error, result };
}

export interface TransitionJobArgs {
  id: string;
  input: TransitionInput;
}

/** Transition a job through its FSM. */
export function useTransitionJob(): {
  transitionJob: (args: TransitionJobArgs) => Promise<JobResponse>;
  loading: boolean;
  error: Error | null;
  result: JobResponse | null;
} {
  const { jobs } = useFastYoke();
  const { run, loading, error, result } = useActionBase(
    (args: TransitionJobArgs) => jobs.transition(args.id, args.input),
  );
  return { transitionJob: run, loading, error, result };
}

export interface CancelJobArgs {
  id: string;
  input: CancelInput;
}

/** Admin-cancel a job. See `backend/tests/admin_cancel.rs` for scope. */
export function useCancelJob(): {
  cancelJob: (args: CancelJobArgs) => Promise<JobResponse>;
  loading: boolean;
  error: Error | null;
  result: JobResponse | null;
} {
  const { jobs } = useFastYoke();
  const { run, loading, error, result } = useActionBase(
    (args: CancelJobArgs) => jobs.cancel(args.id, args.input),
  );
  return { cancelJob: run, loading, error, result };
}
