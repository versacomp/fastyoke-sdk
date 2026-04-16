// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { SchemasClient } from '../client/schemas';
import type { SchemaResponse } from '../types/common';
import { makeConfig, makeMockFetcher, parseQs } from './helpers';

const SAMPLE: SchemaResponse = {
  id: 'schema-1',
  tenant_id: 'tenant-1',
  name: 'shift_schedule',
  version: 3,
  schema_json: {
    initial_state: 'draft',
    states: { draft: {}, scheduled: {}, rejected: {} },
    transitions: [
      { from: 'draft', to: 'scheduled', event_type: 'publish' },
      { from: 'draft', to: 'rejected', event_type: 'reject' },
    ],
  },
  is_active: true,
  created_at: '2026-04-01T12:00:00Z',
  entity_name: 'schedule_run',
};

describe('SchemasClient', () => {
  it('list() builds a tenant-scoped URL and returns the array', async () => {
    const { fetcher, requests } = makeMockFetcher([{ json: [SAMPLE] }]);
    const client = new SchemasClient(makeConfig(fetcher));

    const result = await client.list();

    expect(requests).toHaveLength(1);
    expect(requests[0].method).toBe('GET');
    expect(requests[0].url.startsWith('/api/v1/tenant/schemas?')).toBe(true);
    expect(parseQs(requests[0].url)).toEqual({ tenant_id: 'tenant-1' });
    expect(result).toEqual([SAMPLE]);
  });

  it('list({ entityName }) forwards the entity filter', async () => {
    const { fetcher, requests } = makeMockFetcher([{ json: [SAMPLE] }]);
    const client = new SchemasClient(makeConfig(fetcher));

    await client.list({ entityName: 'schedule_run' });

    expect(parseQs(requests[0].url)).toEqual({
      tenant_id: 'tenant-1',
      entity_name: 'schedule_run',
    });
  });

  it('list() includes project_id when provided in config', async () => {
    const { fetcher, requests } = makeMockFetcher([{ json: [] }]);
    const client = new SchemasClient(
      makeConfig(fetcher, { projectId: 'proj-7' }),
    );

    await client.list({ entityName: 'shipment' });

    expect(parseQs(requests[0].url)).toEqual({
      tenant_id: 'tenant-1',
      project_id: 'proj-7',
      entity_name: 'shipment',
    });
  });

  it('get() fetches a single schema by id', async () => {
    const { fetcher, requests } = makeMockFetcher([{ json: SAMPLE }]);
    const client = new SchemasClient(makeConfig(fetcher));

    const result = await client.get('schema-1');

    expect(requests[0].url.startsWith('/api/v1/tenant/schemas/schema-1?')).toBe(true);
    expect(result).toEqual(SAMPLE);
  });

  it('escapes the schema id in the URL', async () => {
    const { fetcher, requests } = makeMockFetcher([{ json: SAMPLE }]);
    const client = new SchemasClient(makeConfig(fetcher));

    await client.get('has spaces/and-slash');

    expect(requests[0].url).toContain('has%20spaces%2Fand-slash');
  });

  it('throws ApiError with server error message on non-2xx', async () => {
    const { fetcher } = makeMockFetcher([
      { status: 404, json: { error: 'not found' } },
    ]);
    const client = new SchemasClient(makeConfig(fetcher));

    await expect(client.get('missing')).rejects.toMatchObject({
      name: 'ApiError',
      status: 404,
      message: 'not found',
    });
  });

  it('create() POSTs the expected body and returns the parsed schema', async () => {
    const { fetcher, requests } = makeMockFetcher([{ json: SAMPLE }]);
    const client = new SchemasClient(
      makeConfig(fetcher, { projectId: 'proj-7' }),
    );

    const graph = {
      initial_state: 'draft',
      states: { draft: {}, active: {} },
      transitions: [{ from: 'draft', to: 'active', event_type: 'start' }],
    };
    const result = await client.create({
      name: 'shift_schedule',
      schemaJson: graph,
      entityName: 'schedule_run',
    });

    expect(requests[0].method).toBe('POST');
    expect(requests[0].url).toBe('/api/v1/tenant/schemas');
    expect(requests[0].headers['content-type']).toBe('application/json');
    expect(requests[0].body).toEqual({
      tenant_id: 'tenant-1',
      project_id: 'proj-7',
      name: 'shift_schedule',
      schema_json: graph,
      entity_name: 'schedule_run',
    });
    expect(result).toEqual(SAMPLE);
  });

  it('create() omits project_id and entity_name when not configured', async () => {
    const { fetcher, requests } = makeMockFetcher([{ json: SAMPLE }]);
    const client = new SchemasClient(makeConfig(fetcher));

    await client.create({ name: 'workflow_a', schemaJson: {} });

    expect(requests[0].body).toEqual({
      tenant_id: 'tenant-1',
      name: 'workflow_a',
      schema_json: {},
    });
  });

  it('create() surfaces 409 version races as ApiError so callers can retry', async () => {
    const { fetcher } = makeMockFetcher([
      { status: 409, json: { error: "schema 'x' version 3 already exists" } },
    ]);
    const client = new SchemasClient(makeConfig(fetcher));

    await expect(
      client.create({ name: 'x', schemaJson: {} }),
    ).rejects.toMatchObject({
      status: 409,
      message: "schema 'x' version 3 already exists",
    });
  });
});
