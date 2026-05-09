/**
 * Phase 40.4 — entityAnnotationToZod tests.
 */
import { describe, expect, it } from 'vitest';
import {
  entityAnnotationToZod,
  type EntityFieldAnnotation,
} from '../types/entityAnnotation';

describe('entityAnnotationToZod', () => {
  it('required string absence rejects', () => {
    const schema = entityAnnotationToZod([
      { field_key: 'name', required: true, field_type: 'string' },
    ]);
    const result = schema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('optional string absence passes', () => {
    const schema = entityAnnotationToZod([
      { field_key: 'nickname', required: false, field_type: 'string' },
    ]);
    const result = schema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('enforces max_length on strings', () => {
    const schema = entityAnnotationToZod([
      { field_key: 'name', required: true, max_length: 5, field_type: 'string' },
    ]);
    expect(schema.safeParse({ name: 'Hello' }).success).toBe(true);
    expect(schema.safeParse({ name: 'Hello, world' }).success).toBe(false);
  });

  it('enforces enum options via field_type="enum"', () => {
    const schema = entityAnnotationToZod([
      {
        field_key: 'status',
        required: true,
        field_type: 'enum',
        options_json: [
          { value: 'open', label: 'Open' },
          { value: 'closed', label: 'Closed' },
        ],
      },
    ]);
    expect(schema.safeParse({ status: 'open' }).success).toBe(true);
    expect(schema.safeParse({ status: 'pending' }).success).toBe(false);
  });

  it('enforces numeric min + max bounds', () => {
    const schema = entityAnnotationToZod([
      {
        field_key: 'age',
        required: true,
        field_type: 'number',
        min: 0,
        max: 120,
      },
    ]);
    expect(schema.safeParse({ age: 42 }).success).toBe(true);
    expect(schema.safeParse({ age: -1 }).success).toBe(false);
    expect(schema.safeParse({ age: 121 }).success).toBe(false);
    expect(schema.safeParse({ age: 'oops' }).success).toBe(false);
  });

  it('accepts a boolean leaf via field_type="boolean"', () => {
    const schema = entityAnnotationToZod([
      { field_key: 'active', required: true, field_type: 'boolean' },
    ]);
    expect(schema.safeParse({ active: true }).success).toBe(true);
    expect(schema.safeParse({ active: false }).success).toBe(true);
    expect(schema.safeParse({ active: 'true' }).success).toBe(false);
  });

  it('required string rejects empty after trim via min(1)', () => {
    const schema = entityAnnotationToZod([
      { field_key: 'name', required: true, field_type: 'string' },
    ]);
    expect(schema.safeParse({ name: '' }).success).toBe(false);
  });

  // ---------------------------------------------------------------
  // Phase 41.1 (LCAP) — new type arms.
  // ---------------------------------------------------------------

  it('longtext leaf accepts unbounded strings unless max_length set', () => {
    const schema = entityAnnotationToZod([
      { field_key: 'bio', field_type: 'longtext' },
    ]);
    const long = 'a'.repeat(50_000);
    expect(schema.safeParse({ bio: long }).success).toBe(true);
  });

  it('timestamp leaf rejects non-ISO strings', () => {
    const schema = entityAnnotationToZod([
      { field_key: 'created_at', required: true, field_type: 'timestamp' },
    ]);
    expect(schema.safeParse({ created_at: '2026-04-25T12:00:00Z' }).success).toBe(true);
    expect(schema.safeParse({ created_at: 'not-a-date' }).success).toBe(false);
  });

  it('file_ref leaf accepts shaped object or null', () => {
    const schema = entityAnnotationToZod([
      { field_key: 'avatar', field_type: 'file_ref' },
    ]);
    expect(
      schema.safeParse({ avatar: { ref: 'fy_file_abc', filename: 'a.png' } }).success,
    ).toBe(true);
    expect(schema.safeParse({ avatar: null }).success).toBe(true);
    expect(schema.safeParse({ avatar: 'naked-string' }).success).toBe(false);
  });

  it('fsm_state_ref leaf is a string id', () => {
    const schema = entityAnnotationToZod([
      { field_key: 'state', required: true, field_type: 'fsm_state_ref' },
    ]);
    expect(schema.safeParse({ state: 'in_transit' }).success).toBe(true);
    expect(schema.safeParse({ state: '' }).success).toBe(false);
  });

  it('relationship leaf is a string id', () => {
    const schema = entityAnnotationToZod([
      { field_key: 'customer_id', required: true, field_type: 'relationship' },
    ]);
    expect(schema.safeParse({ customer_id: 'cust-42' }).success).toBe(true);
    expect(schema.safeParse({ customer_id: '' }).success).toBe(false);
  });

  it('round-trips a realistic customer annotation set', () => {
    const annotations: EntityFieldAnnotation[] = [
      { field_key: 'name', required: true, max_length: 120, field_type: 'string' },
      { field_key: 'email', required: true, max_length: 255, field_type: 'string' },
      { field_key: 'phone', required: false, max_length: 32, field_type: 'string' },
      {
        field_key: 'status',
        required: true,
        field_type: 'enum',
        options_json: [
          { value: 'lead', label: 'Lead' },
          { value: 'customer', label: 'Customer' },
          { value: 'churned', label: 'Churned' },
        ],
      },
      { field_key: 'age', required: false, field_type: 'number', min: 18, max: 130 },
    ];
    const schema = entityAnnotationToZod(annotations);
    const happy = schema.safeParse({
      name: 'Acme Ltd',
      email: 'hi@acme.example',
      status: 'customer',
    });
    expect(happy.success).toBe(true);
    const bad_enum = schema.safeParse({
      name: 'A',
      email: 'a@b.c',
      status: 'unknown',
    });
    expect(bad_enum.success).toBe(false);
    const missing_required = schema.safeParse({
      name: 'A',
      status: 'lead',
    });
    expect(missing_required.success).toBe(false);
  });
});
