// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { EntitiesClient } from '../client/entities';
import type { EntityResponse } from '../types/common';
import { makeConfig, makeMockFetcher, parseQs } from './helpers';

const RECORD: EntityResponse = {
  id: 'entity-42',
  tenant_id: 'tenant-1',
  entity_name: 'shipment',
  data_payload: { tracking_number: 'Z12345', destination: 'Denver' },
  created_at: '2026-04-01T00:00:00Z',
  updated_at: '2026-04-05T00:00:00Z',
};

describe('EntitiesClient', () => {
  it('list() wraps the paginated envelope', async () => {
    const paged = { records: [RECORD], total: 1, page: 1, page_size: 50 };
    const { fetcher, requests } = makeMockFetcher([{ json: paged }]);
    const client = new EntitiesClient(makeConfig(fetcher));

    const result = await client.list('shipment');

    expect(requests[0].url.startsWith('/api/v1/tenant/entities/shipment?')).toBe(true);
    expect(result).toEqual(paged);
  });

  it('list() forwards search, sort, and filter params', async () => {
    const { fetcher, requests } = makeMockFetcher([
      { json: { records: [], total: 0, page: 1, page_size: 25 } },
    ]);
    const client = new EntitiesClient(makeConfig(fetcher));

    await client.list('shipment', {
      page: 2,
      pageSize: 25,
      search: 'Denver',
      sortField: 'created_at',
      sortDir: 'desc',
      filterField: 'status',
      filterValue: 'active',
    });

    expect(parseQs(requests[0].url)).toEqual({
      tenant_id: 'tenant-1',
      page: '2',
      page_size: '25',
      search: 'Denver',
      sort_field: 'created_at',
      sort_dir: 'desc',
      filter_field: 'status',
      filter_value: 'active',
    });
  });

  it('get() fetches a single record', async () => {
    const { fetcher, requests } = makeMockFetcher([{ json: RECORD }]);
    const client = new EntitiesClient(makeConfig(fetcher));

    const result = await client.get('shipment', 'entity-42');

    expect(requests[0].url.startsWith('/api/v1/tenant/entities/shipment/entity-42?')).toBe(true);
    expect(result).toEqual(RECORD);
  });

  it('patch() PATCHes data_payload wrapped with tenant_id', async () => {
    const { fetcher, requests } = makeMockFetcher([{ json: RECORD }]);
    const client = new EntitiesClient(makeConfig(fetcher));

    await client.patch('shipment', 'entity-42', { destination: 'Boulder' });

    expect(requests[0].method).toBe('PATCH');
    expect(requests[0].url).toBe('/api/v1/tenant/entities/shipment/entity-42');
    expect(requests[0].body).toEqual({
      tenant_id: 'tenant-1',
      data_payload: { destination: 'Boulder' },
    });
  });

  it('exportPdf() returns a Blob', async () => {
    const pdf = new Blob(['%PDF-1.4 …'], { type: 'application/pdf' });
    const { fetcher, requests } = makeMockFetcher([{ blob: pdf }]);
    const client = new EntitiesClient(makeConfig(fetcher));

    const result = await client.exportPdf('shipment', 'entity-42');

    expect(requests[0].url.startsWith('/api/v1/tenant/entities/shipment/entity-42/pdf?')).toBe(true);
    // Duck-typed Blob check: `toBeInstanceOf(Blob)` is flaky because
    // Response.blob() may return a class from a different realm than
    // the test-file's globalThis.Blob (undici internals vs
    // node:buffer). What consumers care about is the interface.
    expect(result.constructor.name).toBe('Blob');
    expect(typeof result.arrayBuffer).toBe('function');
    expect(await result.text()).toBe('%PDF-1.4 …');
  });

  it('exportPdf() surfaces server errors as ApiError', async () => {
    const { fetcher } = makeMockFetcher([
      { status: 500, json: { error: 'pdf renderer crashed' } },
    ]);
    const client = new EntitiesClient(makeConfig(fetcher));

    await expect(client.exportPdf('shipment', 'x')).rejects.toMatchObject({
      status: 500,
      message: 'pdf renderer crashed',
    });
  });

  // -------------------------------------------------------------------------
  // Phase 21.8.2
  // -------------------------------------------------------------------------

  it('create() POSTs data_payload wrapped with tenant_id', async () => {
    const { fetcher, requests } = makeMockFetcher([{ json: RECORD }]);
    const client = new EntitiesClient(makeConfig(fetcher));

    const result = await client.create('shipment', { tracking_number: 'Z12345' });

    expect(requests[0].method).toBe('POST');
    expect(requests[0].url).toBe('/api/v1/tenant/entities/shipment');
    expect(requests[0].body).toEqual({
      tenant_id: 'tenant-1',
      data_payload: { tracking_number: 'Z12345' },
    });
    expect(result).toEqual(RECORD);
  });

  it('create() forwards project_id when the client config sets it', async () => {
    const { fetcher, requests } = makeMockFetcher([{ json: RECORD }]);
    const client = new EntitiesClient(
      makeConfig(fetcher, { projectId: 'proj-7' }),
    );

    await client.create('shipment', { origin: 'SFO' });

    expect(requests[0].body).toEqual({
      tenant_id: 'tenant-1',
      project_id: 'proj-7',
      data_payload: { origin: 'SFO' },
    });
  });

  it('delete() issues DELETE with tenant_id query and resolves void on 204', async () => {
    const { fetcher, requests } = makeMockFetcher([{ status: 204, json: null }]);
    const client = new EntitiesClient(makeConfig(fetcher));

    const result = await client.delete('shipment', 'entity-42');

    expect(requests[0].method).toBe('DELETE');
    expect(
      requests[0].url.startsWith('/api/v1/tenant/entities/shipment/entity-42?'),
    ).toBe(true);
    expect(parseQs(requests[0].url)).toEqual({ tenant_id: 'tenant-1' });
    expect(result).toBeUndefined();
  });

  it('delete() surfaces 404 as ApiError without attempting body parse', async () => {
    // Cross-tenant / unknown id → 404 from the 21.8.1 handler. The
    // body here carries the canonical { error } envelope.
    const { fetcher } = makeMockFetcher([
      { status: 404, json: { error: 'not found' } },
    ]);
    const client = new EntitiesClient(makeConfig(fetcher));

    await expect(client.delete('shipment', 'ghost')).rejects.toMatchObject({
      status: 404,
      message: 'not found',
    });
  });
});
