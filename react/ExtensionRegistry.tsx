/**
 * ExtensionProvider — loads tenant-uploaded runtime extensions and
 * exposes their components/pages via React context.
 *
 * Lifecycle:
 *   1. On mount, fetch the list of active extensions for the tenant
 *      via `ExtensionsClient.list()`.
 *   2. For each active row, dynamic-import the content-addressed bundle
 *      URL. The server short-circuits to 404 on SHA-256 mismatch, so
 *      the browser's `import()` naturally rejects tampered bundles.
 *   3. Look up each manifest-declared component/page by name in the
 *      loaded module's exports and register it into the registry,
 *      keyed by `block_type` (components) and `path` (pages).
 *   4. Host features (EntityDetailRenderer, router) consume the
 *      registry via `useExtensionRegistry()`.
 *
 * Deferred (documented gap):
 *   Extension components today run with the HOST's fetcher, i.e. the
 *   user's session JWT — not a minted extension-scoped JWT. Because
 *   `require_scope()` is a no-op in this phase, the behavior is
 *   identical. When scope enforcement flips on, wrap rendered extension
 *   components in a child `<FastYokeProvider>` whose fetcher attaches
 *   the minted `extensions.mintToken()` result. The mint/refresh
 *   machinery is already in place on the backend side.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type ReactNode,
} from 'react';

import type { Fetcher } from '../client/core';
import type {
  ExtensionManifest,
  ExtensionResponse,
} from '../types/common';
import { ExtensionErrorBoundary } from './ExtensionErrorBoundary';
import { FastYokeProvider, useFastYoke } from './context';

// ---------------------------------------------------------------------------
// Public API — types
// ---------------------------------------------------------------------------

/**
 * A loaded extension as seen by the registry consumer. The resolved
 * component/page maps are keyed by the manifest's `block_type` and
 * `path` fields respectively (what host code uses to look them up).
 */
export interface LoadedExtension {
  row: ExtensionResponse;
  manifest: ExtensionManifest;
  /** Rendered components keyed by `block_type` (e.g. "custom:heatmap"). */
  components: Record<string, ComponentType<ExtensionBlockProps>>;
  /** Page components keyed by `path`. */
  pages: Record<string, ComponentType<ExtensionPageProps>>;
}

/**
 * Props handed to any custom block rendered inside a host page
 * template. The host is responsible for computing these from the
 * `layout_json` block config; extensions consume them as a plain
 * prop bag.
 */
export interface ExtensionBlockProps {
  /** The block's `config` object from `layout_json`. */
  config: Record<string, unknown>;
  /** The entity record the block is embedded in, when relevant. */
  record?: Record<string, unknown>;
}

/**
 * Props handed to a standalone extension-registered page when the
 * router mounts it.
 */
export interface ExtensionPageProps {
  /** The matched route path. */
  path: string;
}

export interface ExtensionRegistryValue {
  /** All loaded extensions, in list order. */
  loaded: LoadedExtension[];
  /** Reverse lookup: block_type → component. */
  componentsByBlockType: Map<string, ComponentType<ExtensionBlockProps>>;
  /** Reverse lookup: path → page component. */
  pagesByPath: Map<string, ComponentType<ExtensionPageProps>>;
  /** True while the initial fetch + dynamic imports are in flight. */
  loading: boolean;
}

const EMPTY_REGISTRY: ExtensionRegistryValue = {
  loaded: [],
  componentsByBlockType: new Map(),
  pagesByPath: new Map(),
  loading: false,
};

const ExtensionRegistryContext =
  createContext<ExtensionRegistryValue>(EMPTY_REGISTRY);

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export interface ExtensionProviderProps {
  children: ReactNode;
  /**
   * Opt-out hatch. When false, the provider renders `children` with an
   * empty registry and performs no network work — useful for test
   * harnesses or pages that must not run third-party code (login,
   * invite accept).
   */
  enabled?: boolean;
}

export function ExtensionProvider({
  children,
  enabled = true,
}: ExtensionProviderProps) {
  const { extensions: client } = useFastYoke();
  const [loaded, setLoaded] = useState<LoadedExtension[]>([]);
  const [loading, setLoading] = useState<boolean>(enabled);

  useEffect(() => {
    if (!enabled) {
      setLoaded([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);

    void (async () => {
      let rows: ExtensionResponse[];
      try {
        rows = await client.list();
      } catch (err) {
        if (!cancelled) {
          // eslint-disable-next-line no-console
          console.warn('[fastyoke-sdk] failed to list extensions:', err);
          setLoaded([]);
          setLoading(false);
        }
        return;
      }

      const active = rows.filter((r) => r.is_active);
      const results = await Promise.all(
        active.map((row) => loadOne(row, client.bundleUrl(row.id, row.bundle_sha256))),
      );

      if (!cancelled) {
        setLoaded(results.filter((r): r is LoadedExtension => r !== null));
        setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [client, enabled]);

  const value = useMemo<ExtensionRegistryValue>(() => {
    const components = new Map<string, ComponentType<ExtensionBlockProps>>();
    const pages = new Map<string, ComponentType<ExtensionPageProps>>();
    for (const ext of loaded) {
      for (const [blockType, Comp] of Object.entries(ext.components)) {
        // Wrap every registered component in: (1) an error boundary,
        // so a crash in one extension doesn't take down the host,
        // and (2) a nested FastYokeProvider whose fetcher attaches
        // THIS extension's minted JWT on every SDK call. Without the
        // nested provider, extension API calls would carry the user's
        // session JWT and scope enforcement couldn't distinguish them
        // from ordinary user requests.
        const Wrapped = wrapComponent(ext.manifest.id, ext.row.id, Comp);
        components.set(blockType, Wrapped);
      }
      for (const [path, Page] of Object.entries(ext.pages)) {
        const Wrapped = wrapComponent(ext.manifest.id, ext.row.id, Page);
        pages.set(path, Wrapped);
      }
    }
    return {
      loaded,
      componentsByBlockType: components,
      pagesByPath: pages,
      loading,
    };
  }, [loaded, loading]);

  return (
    <ExtensionRegistryContext.Provider value={value}>
      {children}
    </ExtensionRegistryContext.Provider>
  );
}

export function useExtensionRegistry(): ExtensionRegistryValue {
  return useContext(ExtensionRegistryContext);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Dynamic-import a single bundle and resolve its manifest-declared
 * exports. A load failure logs and returns null — one broken
 * extension does not prevent sibling extensions from loading.
 */
async function loadOne(
  row: ExtensionResponse,
  bundleUrl: string,
): Promise<LoadedExtension | null> {
  let mod: Record<string, unknown>;
  try {
    // @vite-ignore — this URL is computed at runtime. Vite's warning
    // about non-analyzable imports is expected and intentional here.
    mod = (await import(/* @vite-ignore */ bundleUrl)) as Record<string, unknown>;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(
      `[fastyoke-sdk] failed to import extension "${row.extension_id}" (${row.id}):`,
      err,
    );
    return null;
  }

  const components: Record<string, ComponentType<ExtensionBlockProps>> = {};
  for (const c of row.manifest.components ?? []) {
    const exportValue = mod[c.name];
    if (typeof exportValue === 'function') {
      components[c.block_type] = exportValue as ComponentType<ExtensionBlockProps>;
    } else {
      // eslint-disable-next-line no-console
      console.warn(
        `[fastyoke-sdk] extension "${row.extension_id}" manifest declares component ` +
          `"${c.name}" but the bundle does not export a function by that name.`,
      );
    }
  }

  const pages: Record<string, ComponentType<ExtensionPageProps>> = {};
  for (const p of row.manifest.pages ?? []) {
    const exportValue = mod[p.name];
    if (typeof exportValue === 'function') {
      pages[p.path] = exportValue as ComponentType<ExtensionPageProps>;
    } else {
      // eslint-disable-next-line no-console
      console.warn(
        `[fastyoke-sdk] extension "${row.extension_id}" manifest declares page ` +
          `"${p.name}" but the bundle does not export a function by that name.`,
      );
    }
  }

  return { row, manifest: row.manifest, components, pages };
}

/**
 * Wrap a component in the per-extension render shell:
 *   ExtensionErrorBoundary → ExtensionScopedProvider → Comp
 *
 * The boundary is keyed on the manifest id so sibling extensions'
 * error isolation stays independent. The scoped provider is keyed on
 * the database row id (which is also the mint-endpoint path segment).
 */
function wrapComponent<P extends object>(
  extensionId: string,
  rowId: string,
  Comp: ComponentType<P>,
): ComponentType<P> {
  const Wrapped: ComponentType<P> = (props: P) => (
    <ExtensionErrorBoundary extensionId={extensionId}>
      <ExtensionScopedProvider rowId={rowId}>
        <Comp {...props} />
      </ExtensionScopedProvider>
    </ExtensionErrorBoundary>
  );
  Wrapped.displayName = `ExtensionBoundary(${extensionId})`;
  return Wrapped;
}

// ---------------------------------------------------------------------------
// Extension-scoped fetcher
// ---------------------------------------------------------------------------

// Seconds before `expires_at` at which we proactively re-mint. The
// backend issues 15-minute tokens; refreshing ~3 min early keeps the
// extension well inside its valid window without flogging the mint
// endpoint. A very early refresh would also be fine — the refresh
// path is idempotent.
const REFRESH_LEAD_SECS = 3 * 60;
// If a refresh fires within this safety margin of expiry, it's
// already close enough to "now" that we short-circuit to an
// immediate re-mint instead of scheduling a timer.
const IMMEDIATE_REFRESH_WINDOW_SECS = 60;
// Mint-retry backoff. Starts at the base interval and doubles on
// each consecutive failure, capped so a deactivated extension
// doesn't pound the mint endpoint forever. Reset to 0 attempts on
// any successful mint.
const RETRY_BASE_MS = 60 * 1000;
const RETRY_MAX_MS = 10 * 60 * 1000;

function retryDelayMs(attempts: number): number {
  return Math.min(RETRY_BASE_MS * 2 ** attempts, RETRY_MAX_MS);
}

/**
 * Renders `children` inside a nested FastYokeProvider whose fetcher
 * attaches the extension's minted 15-minute JWT. The outer host
 * fetcher is still used once per mint cycle to authenticate the user
 * to the mint endpoint — extensions ride on the user's session for
 * their initial credential without ever seeing the session token
 * themselves.
 *
 * Behaviours:
 *   - First SDK call triggers a lazy mint. Subsequent calls use the
 *     cached token until it's within REFRESH_LEAD_SECS of expiry.
 *   - A background timer refreshes proactively so an extension's
 *     long-running rendering (e.g. a dashboard) never pauses.
 *   - A 401 on any request invalidates the cache and triggers one
 *     re-mint retry. A second 401 is returned as-is.
 *   - Concurrent mint calls dedupe through a single in-flight promise
 *     so a render burst doesn't fan out into N parallel mint requests.
 */
function ExtensionScopedProvider({
  rowId,
  children,
}: {
  rowId: string;
  children: ReactNode;
}) {
  const outer = useFastYoke();
  // Token in a ref so the fetcher closure always sees the latest
  // value without re-creating (and re-issuing clients) on every
  // refresh tick.
  const tokenRef = useRef<{ token: string; expiresAtMs: number } | null>(null);
  const inFlightRef = useRef<Promise<string> | null>(null);
  // Consecutive mint failures; drives the exponential backoff on
  // the proactive refresh loop. Reset to 0 on any success.
  const retryAttemptsRef = useRef(0);

  const mint = useCallback(async (): Promise<string> => {
    if (inFlightRef.current) return inFlightRef.current;
    const p = outer.extensions
      .mintToken(rowId)
      .then((r) => {
        tokenRef.current = {
          token: r.token,
          expiresAtMs: r.expires_at * 1000,
        };
        retryAttemptsRef.current = 0;
        inFlightRef.current = null;
        return r.token;
      })
      .catch((err: unknown) => {
        inFlightRef.current = null;
        throw err;
      });
    inFlightRef.current = p;
    return p;
  }, [outer.extensions, rowId]);

  const getToken = useCallback(async (): Promise<string> => {
    const cached = tokenRef.current;
    const nowMs = Date.now();
    if (
      cached &&
      cached.expiresAtMs - nowMs > IMMEDIATE_REFRESH_WINDOW_SECS * 1000
    ) {
      return cached.token;
    }
    return mint();
  }, [mint]);

  const scopedFetcher = useMemo<Fetcher>(
    () =>
      async (input, init) => {
        const token = await getToken();
        const headers = new Headers(init?.headers);
        headers.set('authorization', `Bearer ${token}`);
        const res = await fetch(input, { ...init, headers });
        if (res.status !== 401) return res;

        // Token might have expired between cache check and server
        // processing, or the extension was just deactivated. Clear
        // and try once more — a second 401 is terminal (bubble up
        // with whatever body the backend returned).
        tokenRef.current = null;
        try {
          const fresh = await mint();
          const retryHeaders = new Headers(init?.headers);
          retryHeaders.set('authorization', `Bearer ${fresh}`);
          return fetch(input, { ...init, headers: retryHeaders });
        } catch {
          return res;
        }
      },
    [getToken, mint],
  );

  // Proactive refresh loop. Kept out of scopedFetcher's dependency
  // closure so timer scheduling doesn't recreate on every render.
  //
  // Failure mode: a deactivated extension returns 403 on every mint,
  // and so would an extension the admin accidentally left pointed at
  // a broken manifest. Without a cap, we'd pound the mint endpoint
  // once a minute forever while the host page stays open. An
  // exponential backoff starting at 60s and capping at 10 min keeps
  // the retry rate low without stopping entirely — if the admin
  // re-activates the extension, the next scheduled attempt picks up
  // within 10 minutes.
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const scheduleRetry = () => {
      if (cancelled) return;
      const attempts = retryAttemptsRef.current;
      const delay = retryDelayMs(attempts);
      retryAttemptsRef.current = attempts + 1;
      timer = setTimeout(() => tick(), delay);
    };

    const scheduleRefresh = (expiresAtMs: number) => {
      if (cancelled) return;
      const leadMs = REFRESH_LEAD_SECS * 1000;
      const waitMs = Math.max(
        IMMEDIATE_REFRESH_WINDOW_SECS * 1000,
        expiresAtMs - Date.now() - leadMs,
      );
      timer = setTimeout(() => tick(), waitMs);
    };

    const tick = () => {
      if (cancelled) return;
      void mint()
        .then(() => {
          // mint() resets retryAttemptsRef on success.
          const cached = tokenRef.current;
          if (cached) scheduleRefresh(cached.expiresAtMs);
        })
        .catch(() => scheduleRetry());
    };

    // Kick the loop. If the initial getToken fails we go straight
    // into retry-backoff instead of burning the first "immediate"
    // attempt before starting to wait.
    void getToken()
      .then(() => {
        const cached = tokenRef.current;
        if (cached) scheduleRefresh(cached.expiresAtMs);
      })
      .catch(() => scheduleRetry());

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [getToken, mint]);

  return (
    <FastYokeProvider
      tenantId={outer.tenantId}
      projectId={outer.projectId}
      fetcher={scopedFetcher}
    >
      {children}
    </FastYokeProvider>
  );
}
