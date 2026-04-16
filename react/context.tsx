import { createContext, useContext, useMemo, type ReactNode } from 'react';

import { EntitiesClient } from '../client/entities';
import { ExtensionsClient } from '../client/extensions';
import { FilesClient } from '../client/files';
import { JobsClient } from '../client/jobs';
import { PagesClient } from '../client/pages';
import { SchemasClient } from '../client/schemas';
import type { ClientConfig, Fetcher } from '../client/core';

/**
 * Everything an extension or host feature needs to interact with the
 * FastYoke API. Clients are memoized against the transport inputs so
 * consumers can safely destructure them as dependencies.
 */
export interface FastYokeContextValue {
  tenantId: string;
  projectId: string | null;
  schemas: SchemasClient;
  jobs: JobsClient;
  entities: EntitiesClient;
  pages: PagesClient;
  files: FilesClient;
  extensions: ExtensionsClient;
}

const FastYokeContext = createContext<FastYokeContextValue | null>(null);

export interface FastYokeProviderProps {
  tenantId: string;
  projectId?: string | null;
  fetcher: Fetcher;
  baseUrl?: string;
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
  children,
}: FastYokeProviderProps) {
  const value = useMemo<FastYokeContextValue>(() => {
    const cfg: ClientConfig = {
      tenantId,
      projectId: projectId ?? null,
      fetcher,
      baseUrl,
    };
    return {
      tenantId,
      projectId: projectId ?? null,
      schemas: new SchemasClient(cfg),
      jobs: new JobsClient(cfg),
      entities: new EntitiesClient(cfg),
      pages: new PagesClient(cfg),
      files: new FilesClient(cfg),
      extensions: new ExtensionsClient(cfg),
    };
  }, [tenantId, projectId, fetcher, baseUrl]);

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
