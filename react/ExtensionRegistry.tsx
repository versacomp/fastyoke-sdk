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

/**
 * Palette-ready descriptor for a registered `custom:*` block. Built
 * from the owning extension's manifest so the page designer can
 * render a button per custom block without walking `loaded` itself.
 *
 * `block_type` is typed as the `custom:${string}` template literal
 * because the registry only promotes manifest entries whose
 * `block_type` passes a `startsWith('custom:')` filter — hosts can
 * rely on the prefix without re-checking.
 */
export interface CustomBlockDescriptor {
  /** Fully-qualified block type, e.g. "custom:hello_card". */
  block_type: `custom:${string}`;
  /** Palette label — falls back to `block_type` when the manifest omits it. */
  display_name: string;
  /** Seed config inserted into new layout blocks. `{}` when absent. */
  default_config: Record<string, unknown>;
  /** Owning extension's manifest id (for grouping / tooltips). */
  extension_id: string;
}

export interface ExtensionRegistryValue {
  /** All loaded extensions, in list order. */
  loaded: LoadedExtension[];
  /** Reverse lookup: block_type → component. */
  componentsByBlockType: Map<string, ComponentType<ExtensionBlockProps>>;
  /** Reverse lookup: path → page component. */
  pagesByPath: Map<string, ComponentType<ExtensionPageProps>>;
  /** Flat list of installed `custom:*` blocks for palette rendering. */
  customBlocks: CustomBlockDescriptor[];
  /** True while the initial fetch + dynamic imports are in flight. */
  loading: boolean;
  /**
   * Re-fetch the active extension list + re-import every bundle.
   * Call after an admin action that changes the active set — the
   * Extensions admin wires this after Activate / Deactivate / Upload
   * so the Page Designer's "Custom extension page" dropdown reflects
   * the new state without a browser reload. Fire-and-forget; any
   * network failure is console-warned and leaves the prior state
   * intact.
   */
  refresh: () => void;
}

const EMPTY_REGISTRY: ExtensionRegistryValue = {
  loaded: [],
  componentsByBlockType: new Map(),
  pagesByPath: new Map(),
  customBlocks: [],
  loading: false,
  refresh: () => {
    // No-op default for consumers rendered outside the provider —
    // e.g., login, invite accept. Matches the rest of EMPTY_REGISTRY's
    // inert behavior.
  },
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
  const { extensions: client, fetcher: authFetcher } = useFastYoke();
  const [loaded, setLoaded] = useState<LoadedExtension[]>([]);
  const [loading, setLoading] = useState<boolean>(enabled);
  // Monotonic counter the Activate/Deactivate/Upload flows bump via
  // `refresh()`. Including it in the loader useEffect's dep array
  // retriggers the full fetch + import pipeline without requiring a
  // page reload. Starting at 0 means the initial mount loads once,
  // just like before this slice.
  const [refreshTick, setRefreshTick] = useState(0);

  const refresh = useCallback(() => {
    setRefreshTick((n) => n + 1);
  }, []);

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
        active.map((row) =>
          loadOne(row, client.bundleUrl(row.id, row.bundle_sha256), authFetcher),
        ),
      );

      if (!cancelled) {
        setLoaded(results.filter((r): r is LoadedExtension => r !== null));
        setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [client, enabled, authFetcher, refreshTick]);

  const value = useMemo<ExtensionRegistryValue>(() => {
    const components = new Map<string, ComponentType<ExtensionBlockProps>>();
    const pages = new Map<string, ComponentType<ExtensionPageProps>>();
    const customBlocks: CustomBlockDescriptor[] = [];
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
      // Palette descriptors mirror the manifest, not the loaded module
      // map — an extension row whose bundle failed to resolve a
      // declared export still advertises the block_type here, so the
      // designer can render a disabled / warning state later if we
      // want it. For now, the render path's ExtensionErrorBoundary
      // handles the mismatch gracefully.
      for (const c of ext.manifest.components ?? []) {
        if (!c.block_type.startsWith('custom:')) continue;
        customBlocks.push({
          // Safe: guarded by startsWith('custom:') above.
          block_type: c.block_type as `custom:${string}`,
          display_name: c.display_name ?? c.block_type,
          default_config: c.default_config ?? {},
          extension_id: ext.manifest.id,
        });
      }
    }
    return {
      loaded,
      componentsByBlockType: components,
      pagesByPath: pages,
      customBlocks,
      loading,
      refresh,
    };
  }, [loaded, loading, refresh]);

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
  fetcher: Fetcher,
): Promise<LoadedExtension | null> {
  let mod: Record<string, unknown>;
  try {
    // Fetch the bundle as text using the auth-aware fetcher (so the
    // request carries the user's JWT — the endpoint requires auth),
    // then import via a blob URL. The blob approach sidesteps vite's
    // dev middleware, which otherwise intercepts proxied JS responses
    // and rewrites their bare specifiers through its own module
    // graph. A blob URL stays outside vite's transform pipeline, and
    // the browser's import map (in index.html) still applies to bare
    // specifiers inside the blob module because the import map is
    // scoped to the browsing context, not the module URL.
    const res = await fetcher(bundleUrl);
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    const text = await res.text();
    const blob = new Blob([text], { type: 'application/javascript' });
    const blobUrl = URL.createObjectURL(blob);
    try {
      mod = (await import(/* @vite-ignore */ blobUrl)) as Record<string, unknown>;
    } finally {
      URL.revokeObjectURL(blobUrl);
    }
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
    // Prefer the named export; fall back to `default` when the
    // manifest names a page but the bundle only ships a default
    // export (Phase 21.7.11 — the Advanced App Builder's template
    // generator emitted `export default function ...` with a
    // manifest name that didn't match any identifier, and every
    // generated extension silently failed to mount).
    let exportValue = mod[p.name];
    if (typeof exportValue !== 'function' && typeof mod.default === 'function') {
      exportValue = mod.default;
      // eslint-disable-next-line no-console
      console.warn(
        `[fastyoke-sdk] extension "${row.extension_id}" manifest page ` +
          `"${p.name}" doesn't match a named export; falling back to ` +
          `the module's default export. Rename the manifest page or ` +
          `add a named export to silence this warning.`,
      );
    }
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
