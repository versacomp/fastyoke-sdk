import { describe, expect, it } from 'vitest';

import { ApiError, apiUrl, buildQuery, unwrapJson } from '../client/core';
import { makeConfig } from './helpers';

describe('core helpers', () => {
  describe('buildQuery', () => {
    it('includes tenant_id by default', () => {
      const qs = buildQuery(makeConfig(async () => new Response()));
      expect(qs).toBe('tenant_id=tenant-1');
    });

    it('adds project_id when present', () => {
      const qs = buildQuery(
        makeConfig(async () => new Response(), { projectId: 'proj-7' }),
      );
      expect(qs).toBe('tenant_id=tenant-1&project_id=proj-7');
    });

    it('drops undefined / null / empty extras', () => {
      const qs = buildQuery(makeConfig(async () => new Response()), {
        keep: 'v',
        drop_null: null,
        drop_undef: undefined,
        drop_empty: '',
      });
      const params = new URLSearchParams(qs);
      expect(params.has('keep')).toBe(true);
      expect(params.has('drop_null')).toBe(false);
      expect(params.has('drop_undef')).toBe(false);
      expect(params.has('drop_empty')).toBe(false);
    });
  });

  describe('apiUrl', () => {
    it('prefixes baseUrl when provided', () => {
      const cfg = makeConfig(async () => new Response(), {
        baseUrl: 'https://api.example.com',
      });
      expect(apiUrl(cfg, '/api/v1/jobs')).toBe(
        'https://api.example.com/api/v1/jobs',
      );
    });

    it('defaults to relative paths', () => {
      const cfg = makeConfig(async () => new Response());
      expect(apiUrl(cfg, '/api/v1/jobs')).toBe('/api/v1/jobs');
    });
  });

  describe('unwrapJson', () => {
    it('parses JSON on 2xx', async () => {
      const r = new Response(JSON.stringify({ hello: 'world' }), {
        status: 200,
      });
      await expect(unwrapJson<{ hello: string }>(r)).resolves.toEqual({
        hello: 'world',
      });
    });

    it('throws ApiError with server message on 4xx', async () => {
      const r = new Response(JSON.stringify({ error: 'bad input' }), {
        status: 400,
      });
      await expect(unwrapJson(r)).rejects.toMatchObject({
        name: 'ApiError',
        status: 400,
        message: 'bad input',
      });
    });

    it('falls back to generic message when body is not JSON', async () => {
      const r = new Response('not json', { status: 502 });
      await expect(unwrapJson(r)).rejects.toMatchObject({
        status: 502,
        message: 'HTTP 502',
      });
    });
  });

  describe('ApiError', () => {
    it('carries status and body for programmatic inspection', () => {
      const err = new ApiError(409, 'conflict', { conflicting_id: 'x' });
      expect(err).toBeInstanceOf(Error);
      expect(err.status).toBe(409);
      expect(err.body).toEqual({ conflicting_id: 'x' });
    });
  });
});
