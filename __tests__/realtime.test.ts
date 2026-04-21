/**
 * Phase 21.8.7b — RealtimeClient tests.
 *
 * These tests drive the client via an injected `socketFactory` so the
 * WebSocket itself is mockable without a jsdom DOM. Each test creates
 * a FakeSocket, passes the factory to `new RealtimeClient`, and pokes
 * it via helpers on the fake to simulate server pushes + drops.
 */
// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  RealtimeClient,
  type RealtimeEvent,
  type WebSocketLike,
} from '../client/realtime';

// ---------------------------------------------------------------------------
// Fake WebSocket
// ---------------------------------------------------------------------------

class FakeSocket implements WebSocketLike {
  url: string;
  onmessage: ((ev: { data: unknown }) => void) | null = null;
  onopen: ((ev: unknown) => void) | null = null;
  onclose: ((ev: unknown) => void) | null = null;
  onerror: ((ev: unknown) => void) | null = null;
  closed = false;

  constructor(url: string) {
    this.url = url;
  }
  close(): void {
    this.closed = true;
  }
  /** Simulate a server push. */
  push(data: unknown): void {
    this.onmessage?.({ data });
  }
  /** Simulate a server/transport-initiated disconnect. */
  serverClose(): void {
    this.onclose?.({});
  }
  open(): void {
    this.onopen?.({});
  }
}

interface FactoryHandle {
  sockets: FakeSocket[];
  factory: (url: string) => WebSocketLike;
}

function makeFactory(): FactoryHandle {
  const sockets: FakeSocket[] = [];
  const factory = (url: string) => {
    const s = new FakeSocket(url);
    sockets.push(s);
    return s;
  };
  return { sockets, factory };
}

afterEach(() => {
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------

describe('RealtimeClient', () => {
  it('constructs a socket with tenant_id query param', () => {
    const { sockets, factory } = makeFactory();
    const client = new RealtimeClient({
      tenantId: 't-1',
      baseUrl: 'https://api.fastyoke.io',
      socketFactory: factory,
    });
    expect(sockets).toHaveLength(1);
    expect(sockets[0].url).toBe(
      'wss://api.fastyoke.io/api/v1/ws?tenant_id=t-1',
    );
    client.close();
  });

  it('rewrites http baseUrl to ws and https to wss', () => {
    const { sockets, factory } = makeFactory();
    new RealtimeClient({
      tenantId: 't-1',
      baseUrl: 'http://localhost:3000',
      socketFactory: factory,
    }).close();
    expect(sockets[0].url.startsWith('ws://localhost:3000/')).toBe(true);
  });

  it('dispatches entity_mutation envelopes to every listener', () => {
    const { sockets, factory } = makeFactory();
    const client = new RealtimeClient({ tenantId: 't-1', socketFactory: factory });

    const a: RealtimeEvent[] = [];
    const b: RealtimeEvent[] = [];
    client.subscribe((e) => a.push(e));
    client.subscribe((e) => b.push(e));

    sockets[0].push(
      JSON.stringify({
        kind: 'entity_mutation',
        tenant_id: 't-1',
        entity_name: 'widget',
        record_id: 'w-1',
        op: 'update',
      }),
    );

    expect(a).toHaveLength(1);
    expect(b).toHaveLength(1);
    if (a[0].kind === 'entity_mutation') {
      expect(a[0].entity_name).toBe('widget');
      expect(a[0].record_id).toBe('w-1');
      expect(a[0].op).toBe('update');
    } else {
      throw new Error('expected entity_mutation kind');
    }
    client.close();
  });

  it('dispatches transition envelopes with typed fields', () => {
    const { sockets, factory } = makeFactory();
    const client = new RealtimeClient({ tenantId: 't-1', socketFactory: factory });

    const seen: RealtimeEvent[] = [];
    client.subscribe((e) => seen.push(e));

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
    expect(seen).toHaveLength(1);
    if (seen[0].kind === 'transition') {
      expect(seen[0].job_id).toBe('j-1');
      expect(seen[0].from_state).toBe('pending');
    } else {
      throw new Error('expected transition kind');
    }
    client.close();
  });

  it('drops malformed JSON silently', () => {
    const { sockets, factory } = makeFactory();
    const client = new RealtimeClient({ tenantId: 't-1', socketFactory: factory });
    const seen: RealtimeEvent[] = [];
    client.subscribe((e) => seen.push(e));

    sockets[0].push('{not json');
    expect(seen).toHaveLength(0);
    client.close();
  });

  it('drops envelopes with unknown kind', () => {
    const { sockets, factory } = makeFactory();
    const client = new RealtimeClient({ tenantId: 't-1', socketFactory: factory });
    const seen: RealtimeEvent[] = [];
    client.subscribe((e) => seen.push(e));

    sockets[0].push(JSON.stringify({ kind: 'something_else', foo: 1 }));
    expect(seen).toHaveLength(0);
    client.close();
  });

  it('unsubscribe stops delivery', () => {
    const { sockets, factory } = makeFactory();
    const client = new RealtimeClient({ tenantId: 't-1', socketFactory: factory });

    const seen: RealtimeEvent[] = [];
    const unsubscribe = client.subscribe((e) => seen.push(e));
    unsubscribe();

    sockets[0].push(
      JSON.stringify({
        kind: 'entity_mutation',
        tenant_id: 't-1',
        entity_name: 'w',
        record_id: 'r-1',
        op: 'create',
      }),
    );
    expect(seen).toHaveLength(0);
    client.close();
  });

  it('a throwing listener does not block other listeners', () => {
    const { sockets, factory } = makeFactory();
    const client = new RealtimeClient({ tenantId: 't-1', socketFactory: factory });
    const seen: RealtimeEvent[] = [];
    client.subscribe(() => {
      throw new Error('boom');
    });
    client.subscribe((e) => seen.push(e));

    sockets[0].push(
      JSON.stringify({
        kind: 'entity_mutation',
        tenant_id: 't-1',
        entity_name: 'w',
        record_id: 'r-1',
        op: 'delete',
      }),
    );
    expect(seen).toHaveLength(1);
    client.close();
  });

  it('reconnects after server close with exponential backoff', () => {
    vi.useFakeTimers();
    const { sockets, factory } = makeFactory();
    const client = new RealtimeClient({ tenantId: 't-1', socketFactory: factory });
    expect(sockets).toHaveLength(1);

    // Simulate connection drop.
    sockets[0].serverClose();

    // Nothing reconnects immediately.
    expect(sockets).toHaveLength(1);

    // Initial backoff is 1s.
    vi.advanceTimersByTime(999);
    expect(sockets).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(sockets).toHaveLength(2);

    // Second drop → next delay should be 2s (exponential).
    sockets[1].serverClose();
    vi.advanceTimersByTime(1999);
    expect(sockets).toHaveLength(2);
    vi.advanceTimersByTime(1);
    expect(sockets).toHaveLength(3);

    client.close();
  });

  it('successful open resets the reconnect backoff window', () => {
    vi.useFakeTimers();
    const { sockets, factory } = makeFactory();
    const client = new RealtimeClient({ tenantId: 't-1', socketFactory: factory });

    sockets[0].serverClose();
    vi.advanceTimersByTime(1000); // 1s initial → reconnect #2 live

    expect(sockets).toHaveLength(2);
    sockets[1].open();            // open resets backoff
    sockets[1].serverClose();     // drop again

    // Should be 1s again, not 2s.
    vi.advanceTimersByTime(999);
    expect(sockets).toHaveLength(2);
    vi.advanceTimersByTime(1);
    expect(sockets).toHaveLength(3);
    client.close();
  });

  it('close() clears the pending reconnect timer', () => {
    vi.useFakeTimers();
    const { sockets, factory } = makeFactory();
    const client = new RealtimeClient({ tenantId: 't-1', socketFactory: factory });

    sockets[0].serverClose();
    client.close();

    // No new socket should ever be constructed.
    vi.advanceTimersByTime(60_000);
    expect(sockets).toHaveLength(1);
  });

  it('factory that throws schedules a retry instead of crashing', () => {
    vi.useFakeTimers();
    let calls = 0;
    const made: FakeSocket[] = [];
    const factory = (url: string) => {
      calls++;
      if (calls === 1) throw new Error('network down');
      const s = new FakeSocket(url);
      made.push(s);
      return s;
    };
    const client = new RealtimeClient({ tenantId: 't-1', socketFactory: factory });

    expect(calls).toBe(1);
    expect(made).toHaveLength(0);

    vi.advanceTimersByTime(1000);
    expect(calls).toBe(2);
    expect(made).toHaveLength(1);
    client.close();
  });
});
