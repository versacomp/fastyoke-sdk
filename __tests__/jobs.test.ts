import { describe, expect, it } from 'vitest';

import { JobsClient } from '../client/jobs';
import type { EventLogEntry, JobResponse } from '../types/common';
import { makeConfig, makeMockFetcher, parseQs } from './helpers';

const JOB: JobResponse = {
  id: 'job-1',
  tenant_id: 'tenant-1',
  schema_id: 'schema-1',
  schema_name: 'shift_schedule',
  current_state: 'draft',
  context_record_id: 'entity-42',
  updated_at: '2026-04-10T09:00:00Z',
};

describe('JobsClient', () => {
  it('list() with no params scopes by tenant only', async () => {
    const { fetcher, requests } = makeMockFetcher([{ json: [JOB] }]);
    const client = new JobsClient(makeConfig(fetcher));

    const result = await client.list();

    expect(parseQs(requests[0].url)).toEqual({ tenant_id: 'tenant-1' });
    expect(result).toEqual([JOB]);
  });

  it('list({ entityId, schemaId }) forwards both filters', async () => {
    const { fetcher, requests } = makeMockFetcher([{ json: [] }]);
    const client = new JobsClient(makeConfig(fetcher));

    await client.list({ entityId: 'entity-42', schemaId: 'schema-1' });

    expect(parseQs(requests[0].url)).toEqual({
      tenant_id: 'tenant-1',
      entity_id: 'entity-42',
      schema_id: 'schema-1',
    });
  });

  it('create() POSTs the expected body and returns the parsed job', async () => {
    const { fetcher, requests } = makeMockFetcher([{ json: JOB }]);
    const client = new JobsClient(
      makeConfig(fetcher, { projectId: 'proj-7' }),
    );

    const result = await client.create({
      schemaId: 'schema-1',
      contextRecordId: 'entity-42',
    });

    expect(requests[0].method).toBe('POST');
    expect(requests[0].url).toBe('/api/v1/tenant/jobs');
    expect(requests[0].headers['content-type']).toBe('application/json');
    expect(requests[0].body).toEqual({
      tenant_id: 'tenant-1',
      project_id: 'proj-7',
      schema_id: 'schema-1',
      context_record_id: 'entity-42',
    });
    expect(result).toEqual(JOB);
  });

  it('create() omits context_record_id when not provided', async () => {
    const { fetcher, requests } = makeMockFetcher([{ json: JOB }]);
    const client = new JobsClient(makeConfig(fetcher));

    await client.create({ schemaId: 'schema-1' });

    expect(requests[0].body).toEqual({
      tenant_id: 'tenant-1',
      schema_id: 'schema-1',
    });
  });

  it('transition() targets the right endpoint with event_type', async () => {
    const { fetcher, requests } = makeMockFetcher([{ json: JOB }]);
    const client = new JobsClient(makeConfig(fetcher));

    await client.transition('job-1', { eventType: 'publish' });

    expect(requests[0].method).toBe('POST');
    expect(requests[0].url).toBe('/api/v1/tenant/jobs/job-1/transition');
    expect(requests[0].body).toEqual({
      tenant_id: 'tenant-1',
      event_type: 'publish',
    });
  });

  it('cancel() sends target_state + reason', async () => {
    const { fetcher, requests } = makeMockFetcher([{ json: JOB }]);
    const client = new JobsClient(makeConfig(fetcher));

    await client.cancel('job-1', {
      targetState: 'rejected',
      reason: 'customer withdrew',
    });

    expect(requests[0].url).toBe('/api/v1/tenant/jobs/job-1/cancel');
    expect(requests[0].body).toEqual({
      tenant_id: 'tenant-1',
      target_state: 'rejected',
      reason: 'customer withdrew',
    });
  });

  it('history() returns the event log array', async () => {
    const entries: EventLogEntry[] = [
      {
        id: 'ev-1',
        job_id: 'job-1',
        event_type: '__created__',
        from_state: null,
        to_state: 'draft',
        timestamp: '2026-04-01T00:00:00Z',
      },
    ];
    const { fetcher, requests } = makeMockFetcher([{ json: entries }]);
    const client = new JobsClient(makeConfig(fetcher));

    const result = await client.history('job-1');

    expect(requests[0].url.startsWith('/api/v1/tenant/jobs/job-1/history?')).toBe(true);
    expect(result).toEqual(entries);
  });

  it('surfaces 422 guard failure as ApiError with server message', async () => {
    const { fetcher } = makeMockFetcher([
      { status: 422, json: { error: 'guard condition failed' } },
    ]);
    const client = new JobsClient(makeConfig(fetcher));

    await expect(
      client.transition('job-1', { eventType: 'publish' }),
    ).rejects.toMatchObject({
      status: 422,
      message: 'guard condition failed',
    });
  });
});
