// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { PagesClient } from '../client/pages';
import type { PageResponse } from '../types/common';
import { makeConfig, makeMockFetcher, parseQs } from './helpers';

const TEMPLATE: PageResponse = {
  id: 'page-1',
  tenant_id: 'tenant-1',
  name: 'Shipment Detail',
  slug: 'shipment_detail',
  is_public: false,
  layout_json: [
    {
      id: 's1',
      type: 'section',
      config: { label: 'Info', children: [] },
    },
  ],
  created_at: '2026-04-01T00:00:00Z',
  updated_at: '2026-04-01T00:00:00Z',
  has_password: false,
  entity_name: 'shipment',
  title_field: 'tracking_number',
};

describe('PagesClient', () => {
  it('getEntityTemplate() returns the template on success', async () => {
    const { fetcher, requests } = makeMockFetcher([{ json: TEMPLATE }]);
    const client = new PagesClient(makeConfig(fetcher));

    const result = await client.getEntityTemplate('shipment');

    expect(requests[0].url.startsWith('/api/v1/tenant/pages/entity/shipment?')).toBe(true);
    expect(parseQs(requests[0].url)).toEqual({ tenant_id: 'tenant-1' });
    expect(result).toEqual(TEMPLATE);
  });

  it('getEntityTemplate() returns null on 404 (template not configured)', async () => {
    const { fetcher } = makeMockFetcher([
      { status: 404, json: { error: 'not found' } },
    ]);
    const client = new PagesClient(makeConfig(fetcher));

    const result = await client.getEntityTemplate('no_such_entity');

    expect(result).toBeNull();
  });

  it('getEntityTemplate() throws ApiError on non-404 errors', async () => {
    const { fetcher } = makeMockFetcher([
      { status: 500, json: { error: 'db unavailable' } },
    ]);
    const client = new PagesClient(makeConfig(fetcher));

    await expect(
      client.getEntityTemplate('shipment'),
    ).rejects.toMatchObject({ status: 500, message: 'db unavailable' });
  });

  it('URL-encodes the entity name', async () => {
    const { fetcher, requests } = makeMockFetcher([{ status: 404, json: {} }]);
    const client = new PagesClient(makeConfig(fetcher));

    await client.getEntityTemplate('weird name/slash');

    expect(requests[0].url).toContain('weird%20name%2Fslash');
  });
});
