/**
 * Phase 21.8.7b — SDK realtime client.
 *
 * `RealtimeClient` owns a single multiplexed WebSocket per
 * `(tenantId, baseUrl)` pair. The backend (Phase 21.8.7a) fans two
 * event streams out across the same socket with a `kind`-tagged
 * envelope — `"transition"` for FSM state changes, `"entity_mutation"`
 * for entity CRUD. Consumers subscribe once per provider and route
 * their own cache invalidation by inspecting the `kind` field.
 *
 * Locked design decisions (see memory/phase_21_8_real_data_plan.md #4):
 *
 *  * **One socket per `FastYokeProvider`**, not per hook. A single
 *    provider instance mounts a single RealtimeClient; N hooks
 *    multiplex through the same listener registry.
 *  * **Opt-out at the hook site** (`useEntities(kind, filters, { realtime: false })`).
 *    The client itself doesn't know about hooks — it just broadcasts.
 *  * **Reconnect matches the host app's Phase 5 shape** — exponential
 *    backoff (1s → 2s → 4s → …, capped at 30s), reset on successful
 *    open. The hook-side cache invalidation is idempotent so a
 *    re-connect after a network blip triggers at worst a refetch
 *    storm, never stale data.
 *  * **No buffering across reconnects.** The SDK doesn't attempt to
 *    replay missed events from the disconnect window — hooks refetch
 *    on reconnect via their own dependency arrays, and any consumer
 *    that needs stricter guarantees can call `refetch()` on
 *    component-visibility change.
 *
 * Multi-tenancy (Claude.md §4.1): the `tenant_id` query parameter is
 * stamped on the socket URL and the backend filters per-message. No
 * client-side tenant gating is required.
 */

export interface TransitionRealtimeEvent {
  kind: 'transition';
  tenant_id: string;
  job_id: string;
  schema_id: string;
  event_type: string;
  from_state: string | null;
  to_state: string;
}

export interface EntityMutationRealtimeEvent {
  kind: 'entity_mutation';
  tenant_id: string;
  entity_name: string;
  record_id: string;
  op: string;
}

export type RealtimeEvent =
  | TransitionRealtimeEvent
  | EntityMutationRealtimeEvent;

export type RealtimeListener = (event: RealtimeEvent) => void;

/**
 * Minimal slice of the browser `WebSocket` interface that
 * `RealtimeClient` actually uses. Exposed so tests (and future
 * non-browser transports — RN, Deno, iframe postMessage shim) can
 * inject a conforming object without bringing the DOM along.
 */
export interface WebSocketLike {
  close(): void;
  onmessage: ((ev: { data: unknown }) => void) | null;
  onopen: ((ev: unknown) => void) | null;
  onclose: ((ev: unknown) => void) | null;
  onerror: ((ev: unknown) => void) | null;
}

export type SocketFactory = (url: string) => WebSocketLike;

export interface RealtimeClientOptions {
  tenantId: string;
  /** Same meaning as `ClientConfig.baseUrl`. Empty → same-origin. */
  baseUrl?: string;
  /**
   * Override the WebSocket constructor. Defaults to the global
   * `WebSocket`. Tests inject a controllable fake here.
   */
  socketFactory?: SocketFactory;
}

const RECONNECT_INITIAL_MS = 1000;
const RECONNECT_MAX_MS = 30_000;

/**
 * Multiplexed realtime connection. Call `subscribe` once per
 * listener and retain the returned unsubscribe fn. Call `close`
 * when the owning provider unmounts.
 */
export class RealtimeClient {
  private readonly tenantId: string;
  private readonly baseUrl: string;
  private readonly factory: SocketFactory;

  private socket: WebSocketLike | null = null;
  private closed = false;
  private reconnectDelay = RECONNECT_INITIAL_MS;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  private readonly listeners = new Set<RealtimeListener>();

  constructor(opts: RealtimeClientOptions) {
    this.tenantId = opts.tenantId;
    this.baseUrl = opts.baseUrl ?? '';
    const defaultFactory: SocketFactory | null =
      typeof WebSocket !== 'undefined'
        ? (url) => new WebSocket(url) as unknown as WebSocketLike
        : null;
    const factory = opts.socketFactory ?? defaultFactory;
    if (!factory) {
      // No WebSocket available (SSR, no-jsdom test env without
      // the flag, exotic runtime). Silently disable — the client
      // becomes a no-op dispatcher so hooks still work.
      this.factory = () => {
        throw new Error('WebSocket unavailable in this environment');
      };
      this.closed = true;
      return;
    }
    this.factory = factory;
    this.connect();
  }

  /**
   * Register a listener for every envelope the backend pushes.
   * Listeners are responsible for routing by `kind`. Returns an
   * unsubscribe fn; call it in the consumer's cleanup path.
   */
  subscribe(listener: RealtimeListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Tear down the socket + any pending reconnect. Idempotent.
   * After close, subsequent `subscribe` calls still register
   * listeners but no events will fire — callers should not
   * subscribe post-close.
   */
  close(): void {
    this.closed = true;
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.socket?.close();
    this.socket = null;
  }

  private buildUrl(): string {
    // Absolute baseUrl wins. Otherwise fall back to window.location.
    const params = new URLSearchParams({ tenant_id: this.tenantId });
    if (this.baseUrl) {
      // Match http→ws / https→wss; anything else (e.g. user already
      // passed a ws:// URL) is left as-is.
      const origin = this.baseUrl.replace(/^https:/i, 'wss:').replace(/^http:/i, 'ws:');
      return `${origin}/api/v1/ws?${params.toString()}`;
    }
    if (typeof window !== 'undefined' && window.location) {
      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      return `${proto}//${window.location.host}/api/v1/ws?${params.toString()}`;
    }
    // Fallback that tests can still parse.
    return `/api/v1/ws?${params.toString()}`;
  }

  private connect(): void {
    if (this.closed) return;
    let socket: WebSocketLike;
    try {
      socket = this.factory(this.buildUrl());
    } catch {
      // Factory failure: schedule retry. Don't tear the client down
      // — transient env issues (e.g. network just came up) should
      // resolve themselves on the next tick.
      this.scheduleReconnect();
      return;
    }
    this.socket = socket;

    socket.onopen = () => {
      this.reconnectDelay = RECONNECT_INITIAL_MS;
    };

    socket.onmessage = (ev) => {
      if (typeof ev.data !== 'string') return;
      let parsed: unknown;
      try {
        parsed = JSON.parse(ev.data);
      } catch {
        return; // malformed payload — drop silently
      }
      if (!isRealtimeEvent(parsed)) return;
      for (const listener of this.listeners) {
        try {
          listener(parsed);
        } catch {
          // One listener throwing must not block the others.
        }
      }
    };

    socket.onclose = () => {
      if (this.closed) return;
      this.socket = null;
      this.scheduleReconnect();
    };

    socket.onerror = () => {
      // onclose always follows — reconnect is scheduled there.
    };
  }

  private scheduleReconnect(): void {
    if (this.closed) return;
    const delay = this.reconnectDelay;
    this.reconnectDelay = Math.min(delay * 2, RECONNECT_MAX_MS);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }
}

function isRealtimeEvent(v: unknown): v is RealtimeEvent {
  if (typeof v !== 'object' || v === null) return false;
  const kind = (v as { kind?: unknown }).kind;
  return kind === 'transition' || kind === 'entity_mutation';
}
