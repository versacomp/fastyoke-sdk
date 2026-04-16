/**
 * Test helpers for the SDK suite.
 *
 * `makeMockFetcher` returns a Fetcher that records every request and
 * responds from a caller-supplied script. Used to pin wire shapes: tests
 * assert the exact URL + method + body the client emits, and the response
 * the client produces from a known server payload.
 *
 * We deliberately avoid msw / node-fetch polyfills — the SDK's Fetcher
 * abstraction already gives us a clean seam, and keeping the test deps to
 * zero makes the suite trivial to run under any Node version.
 */
import type { ClientConfig, Fetcher } from '../client/core';

export interface CapturedRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: unknown;
}

export interface MockFetcherHandle {
  fetcher: Fetcher;
  requests: CapturedRequest[];
}

/**
 * Build a Fetcher that records each request and responds by consuming
 * entries from `script` in FIFO order. Each script entry returns either
 * a canned JSON body, a Blob, or a bare Response for maximum flexibility.
 */
type ScriptEntry =
  | { status?: number; json: unknown; blob?: never; text?: never }
  | { status?: number; blob: Blob; json?: never; text?: never }
  | { status?: number; text: string; json?: never; blob?: never };

export function makeMockFetcher(script: ScriptEntry[]): MockFetcherHandle {
  const requests: CapturedRequest[] = [];
  let cursor = 0;

  const fetcher: Fetcher = async (input, init) => {
    const url = typeof input === 'string' ? input : input.toString();
    const rawBody = init?.body;
    let parsedBody: unknown = undefined;
    if (typeof rawBody === 'string' && rawBody.length > 0) {
      try {
        parsedBody = JSON.parse(rawBody);
      } catch {
        parsedBody = rawBody;
      }
    }
    const headers: Record<string, string> = {};
    if (init?.headers) {
      new Headers(init.headers).forEach((v, k) => {
        headers[k] = v;
      });
    }
    requests.push({
      url,
      method: init?.method ?? 'GET',
      headers,
      body: parsedBody,
    });

    const entry = script[cursor++];
    if (!entry) {
      throw new Error(
        `mock fetcher exhausted: ${requests.length} requests made but only ${script.length} scripted`,
      );
    }
    const status = entry.status ?? 200;
    // Per the Fetch spec, these statuses MUST have a null body.
    // The native Response constructor in Node 20+ throws on any
    // non-null body with these codes.
    const nullBody = status === 204 || status === 205 || status === 304;

    if (entry.blob !== undefined) {
      // jsdom's Blob and Node's Response are different classes in
      // vitest's default environment: handing a jsdom Blob straight
      // to Response trips `object.stream is not a function` because
      // Response expects its own Blob/stream shape. Reading the
      // Blob into an ArrayBuffer first sidesteps the mismatch;
      // Response.blob() / .text() on the resulting body behave
      // identically for consumer assertions.
      const buf = await entry.blob.arrayBuffer();
      return new Response(nullBody ? null : buf, {
        status,
        headers: {
          'content-type': entry.blob.type || 'application/octet-stream',
        },
      });
    }
    if (entry.text !== undefined) {
      return new Response(nullBody ? null : entry.text, { status });
    }
    return new Response(nullBody ? null : JSON.stringify(entry.json), {
      status,
      headers: { 'content-type': 'application/json' },
    });
  };

  return { fetcher, requests };
}

export function makeConfig(
  fetcher: Fetcher,
  overrides: Partial<ClientConfig> = {},
): ClientConfig {
  return {
    tenantId: 'tenant-1',
    projectId: null,
    fetcher,
    ...overrides,
  };
}

/**
 * Extract and sort query-string params for stable assertion regardless
 * of insertion order (URLSearchParams iteration order is insertion order
 * in practice, but asserting on a sorted list is more robust).
 */
export function parseQs(url: string): Record<string, string> {
  const qIdx = url.indexOf('?');
  if (qIdx < 0) return {};
  const out: Record<string, string> = {};
  new URLSearchParams(url.slice(qIdx + 1)).forEach((v, k) => {
    out[k] = v;
  });
  return out;
}
