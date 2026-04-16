// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { ExtensionsClient } from '../client/extensions';
import type { ExtensionResponse, MintTokenResponse } from '../types/common';
import { makeConfig, makeMockFetcher, parseQs } from './helpers';

const EXT: ExtensionResponse = {
  id: 'ext-1',
  tenant_id: 'tenant-1',
  extension_id: 'acme.heatmap',
  version: '1.0.0',
  manifest: {
    id: 'acme.heatmap',
    version: '1.0.0',
    components: [{ name: 'HeatMap', block_type: 'custom:heatmap' }],
    pages: [],
    required_scopes: ['data:read', 'workflow:read'],
    fastyoke_sdk: null,
  },
  bundle_sha256: 'deadbeef',
  bundle_size: 1234,
  is_active: true,
  uploaded_by: 'admin-1',
  created_at: '2026-04-01T00:00:00Z',
};

describe('ExtensionsClient', () => {
  it('list() returns the array scoped by tenant', async () => {
    const { fetcher, requests } = makeMockFetcher([{ json: [EXT] }]);
    const client = new ExtensionsClient(makeConfig(fetcher));

    const result = await client.list();

    expect(parseQs(requests[0].url)).toEqual({ tenant_id: 'tenant-1' });
    expect(result).toEqual([EXT]);
  });

  it('get() fetches a single extension by id', async () => {
    const { fetcher, requests } = makeMockFetcher([{ json: EXT }]);
    const client = new ExtensionsClient(makeConfig(fetcher));

    const result = await client.get('ext-1');

    expect(requests[0].url.startsWith('/api/v1/tenant/extensions/ext-1?')).toBe(true);
    expect(result).toEqual(EXT);
  });

  it('mintToken() POSTs and returns the token response', async () => {
    const resp: MintTokenResponse = {
      token: 'jwt-token-here',
      expires_at: 9999999999,
      scopes: ['data:read'],
      ext_id: 'acme.heatmap',
    };
    const { fetcher, requests } = makeMockFetcher([{ json: resp }]);
    const client = new ExtensionsClient(makeConfig(fetcher));

    const result = await client.mintToken('ext-1');

    expect(requests[0].method).toBe('POST');
    expect(requests[0].url).toBe('/api/v1/tenant/extensions/ext-1/token?tenant_id=tenant-1');
    expect(result).toEqual(resp);
  });

  it('bundleUrl() is content-addressed via ?sha256=', () => {
    const fetcher = () =>
      Promise.resolve(new Response(null, { status: 200 }));
    const client = new ExtensionsClient(makeConfig(fetcher));

    const url = client.bundleUrl('ext-1', 'abc123');
    expect(url).toBe(
      '/api/v1/tenant/extensions/ext-1/bundle?tenant_id=tenant-1&sha256=abc123',
    );
  });

  it('deactivate() DELETEs and returns on 204', async () => {
    const { fetcher, requests } = makeMockFetcher([{ status: 204, text: '' }]);
    const client = new ExtensionsClient(makeConfig(fetcher));

    await client.deactivate('ext-1');

    expect(requests[0].method).toBe('DELETE');
    expect(requests[0].url).toBe('/api/v1/tenant/extensions/ext-1?tenant_id=tenant-1');
  });

  it('deactivate() surfaces ApiError on 404', async () => {
    const { fetcher } = makeMockFetcher([
      { status: 404, json: { error: 'not found' } },
    ]);
    const client = new ExtensionsClient(makeConfig(fetcher));

    await expect(client.deactivate('missing')).rejects.toMatchObject({
      status: 404,
      message: 'not found',
    });
  });
});
