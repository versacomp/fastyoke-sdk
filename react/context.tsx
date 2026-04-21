import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { EntitiesClient } from '../client/entities';
import { ExtensionsClient } from '../client/extensions';
import { FilesClient } from '../client/files';
import { JobsClient } from '../client/jobs';
import { PagesClient } from '../client/pages';
import { SchemasClient } from '../client/schemas';
import { RealtimeClient, type SocketFactory } from '../client/realtime';
import type { ClientConfig, Fetcher } from '../client/core';

/**
 * Everything an extension or host feature needs to interact with the
 * FastYoke API. Clients are memoized against the transport inputs so
 * consumers can safely destructure them as dependencies.
 */
export interface FastYokeContextValue {
  tenantId: string;
  projectId: string | null;
  /** The raw auth-aware fetch function injected by the host. */
  fetcher: Fetcher;
  schemas: SchemasClient;
  jobs: JobsClient;
  entities: EntitiesClient;
  pages: PagesClient;
  files: FilesClient;
  extensions: ExtensionsClient;
  /**
   * Phase 21.8.7b — shared multiplexed WebSocket. `null` when the
   * provider was constructed with `realtime={false}` (explicit opt-out
   * for tests or SSR-only consumers). Hooks that accept a `realtime`
   * option subscribe to this client; see `hooks.tsx`.
   */
  realtime: RealtimeClient | null;
}

const FastYokeContext = createContext<FastYokeContextValue | null>(null);

export interface FastYokeProviderProps {
  tenantId: string;
  projectId?: string | null;
  fetcher: Fetcher;
  baseUrl?: string;
  /**
   * Opt-out of realtime entirely for this provider. Default `true`.
   * When `false`, `realtime` on the context value is `null` and every
   * hook behaves as if `{ realtime: false }` were passed individually.
   */
  realtime?: boolean;
  /**
   * Optional override for `new WebSocket(url)`. Tests pass a
   * controllable fake here; production code leaves it unset.
   */
  socketFactory?: SocketFactory;
  children: ReactNode;
}

/**
 * Top-level provider. The host app mounts one of these near the root with
 * its auth-aware fetcher and the currently selected tenant/project.
 * Extensions mounted below the provider see the same API surface without
 * needing access to the host's zustand stores.
 */
export function FastYokeProvider({
  tenantId,
  projectId,
  fetcher,
  baseUrl,
  realtime = true,
  socketFactory,
  children,
}: FastYokeProviderProps) {
  // Keep the RealtimeClient in component state so consumers re-render
  // once the socket is live. First render yields `null` (client not
  // constructed yet); `useEffect` below constructs, calls `setState`,
  // and the next render publishes it through the context value.
  // Downstream hooks gate their subscribe effect on the client being
  // non-null, so the momentary gap is harmless.
  const [realtimeClient, setRealtimeClient] =
    useState<RealtimeClient | null>(null);

  useEffect(() => {
    if (!realtime) {
      setRealtimeClient(null);
      return undefined;
    }
    const client = new RealtimeClient({ tenantId, baseUrl, socketFactory });
    setRealtimeClient(client);
    return () => {
      client.close();
    };
  }, [tenantId, baseUrl, realtime, socketFactory]);

  // Client instances are memoized independently of the realtime
  // client so that a `null → instance` transition on `realtimeClient`
  // (normal provider boot) does not rotate every client's identity.
  // Host code keyed off client identity (e.g. `useEffect(..., [schemasClient])`)
  // would otherwise double-fetch on every mount.
  const clients = useMemo(() => {
    const cfg: ClientConfig = {
      tenantId,
      projectId: projectId ?? null,
      fetcher,
      baseUrl,
    };
    return {
      schemas: new SchemasClient(cfg),
      jobs: new JobsClient(cfg),
      entities: new EntitiesClient(cfg),
      pages: new PagesClient(cfg),
      files: new FilesClient(cfg),
      extensions: new ExtensionsClient(cfg),
    };
  }, [tenantId, projectId, fetcher, baseUrl]);

  const value = useMemo<FastYokeContextValue>(
    () => ({
      tenantId,
      projectId: projectId ?? null,
      fetcher,
      ...clients,
      realtime: realtimeClient,
    }),
    [tenantId, projectId, fetcher, clients, realtimeClient],
  );

  return (
    <FastYokeContext.Provider value={value}>
      {children}
    </FastYokeContext.Provider>
  );
}

export function useFastYoke(): FastYokeContextValue {
  const v = useContext(FastYokeContext);
  if (!v) {
    throw new Error(
      '@fastyoke/sdk: useFastYoke() must be used inside <FastYokeProvider>.',
    );
  }
  return v;
}
