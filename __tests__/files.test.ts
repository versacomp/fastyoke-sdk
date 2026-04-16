// @vitest-environment node
import { describe, expect, it } from 'vitest';

import {
  extractFileId,
  FilesClient,
  isFileRef,
  type FileRef,
} from '../client/files';
import { makeConfig, makeMockFetcher, parseQs } from './helpers';

describe('FilesClient', () => {
  it('downloadBlob() returns a Blob and escapes the id', async () => {
    const payload = new Blob(['binary-data'], { type: 'image/png' });
    const { fetcher, requests } = makeMockFetcher([{ blob: payload }]);
    const client = new FilesClient(makeConfig(fetcher));

    const result = await client.downloadBlob('file abc/123');

    expect(requests[0].url).toContain('/api/v1/tenant/files/file%20abc%2F123?');
    expect(parseQs(requests[0].url)).toEqual({ tenant_id: 'tenant-1' });
    // Duck-typed Blob check — see entities.test.ts for reasoning.
    expect(result.constructor.name).toBe('Blob');
    expect(typeof result.arrayBuffer).toBe('function');
    expect(await result.text()).toBe('binary-data');
  });

  it('downloadBlob() raises ApiError on server error', async () => {
    const { fetcher } = makeMockFetcher([
      { status: 403, json: { error: 'forbidden' } },
    ]);
    const client = new FilesClient(makeConfig(fetcher));

    await expect(client.downloadBlob('file-1')).rejects.toMatchObject({
      status: 403,
      message: 'forbidden',
    });
  });
});

describe('FileRef helpers', () => {
  const REF: FileRef = {
    __type: 'file_ref',
    file_id: 'abc-123',
    filename: 'invoice.pdf',
    mime_type: 'application/pdf',
    size_bytes: 2048,
  };

  it('isFileRef() accepts a well-formed ref', () => {
    expect(isFileRef(REF)).toBe(true);
  });

  it('isFileRef() rejects objects without the discriminator', () => {
    // Three file-shaped fields but missing __type — must not match.
    expect(
      isFileRef({ file_id: 'x', filename: 'y', mime_type: 'z' }),
    ).toBe(false);
  });

  it('isFileRef() rejects primitives and null', () => {
    expect(isFileRef(null)).toBe(false);
    expect(isFileRef('file://abc-123')).toBe(false);
    expect(isFileRef(42)).toBe(false);
    expect(isFileRef(undefined)).toBe(false);
  });

  it('extractFileId() pulls the id from a FileRef', () => {
    expect(extractFileId(REF)).toBe('abc-123');
  });

  it('extractFileId() supports legacy file:// and file: prefixes', () => {
    expect(extractFileId('file://legacy-id')).toBe('legacy-id');
    expect(extractFileId('file:bare-id')).toBe('bare-id');
  });

  it('extractFileId() returns null for non-file values', () => {
    expect(extractFileId({ some: 'object' })).toBeNull();
    expect(extractFileId('plain string')).toBeNull();
    expect(extractFileId(null)).toBeNull();
  });
});
