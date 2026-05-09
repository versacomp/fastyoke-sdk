// @vitest-environment node
import { describe, expect, it } from 'vitest';

import {
  FieldsSchemaV2Z,
  FieldTypeZ,
  FormAttachmentRefZ,
  FormFieldZ,
  FormSignatureZ,
  FormThemeZ,
  RoutingEntryZ,
} from '../types/forms';

describe('FormSignatureZ', () => {
  it('parses a client-shape (no server stamps)', () => {
    const client = {
      __type: 'form_signature' as const,
      signed_name: 'Alice Example',
      signature_image: 'data:image/png;base64,iVBORw0KGgo=',
    };
    expect(FormSignatureZ.parse(client)).toMatchObject(client);
  });

  it('parses a fully-stamped server shape', () => {
    const stamped = {
      __type: 'form_signature' as const,
      signed_name: 'Alice Example',
      signature_image: 'data:image/png;base64,iVBORw0KGgo=',
      signed_at: '2026-04-26T12:34:56Z',
      signer_ip: '203.0.113.7',
    };
    expect(FormSignatureZ.parse(stamped)).toMatchObject(stamped);
  });

  it('rejects an empty signed_name', () => {
    expect(
      FormSignatureZ.safeParse({
        __type: 'form_signature',
        signed_name: '',
        signature_image: 'data:image/png;base64,abc',
      }).success,
    ).toBe(false);
  });

  it('rejects a wrong __type discriminator', () => {
    expect(
      FormSignatureZ.safeParse({
        __type: 'something_else',
        signed_name: 'Alice',
        signature_image: 'data:image/png;base64,abc',
      }).success,
    ).toBe(false);
  });
});

describe('FieldTypeZ', () => {
  it('accepts every documented field type', () => {
    for (const t of [
      'text',
      'textarea',
      'number',
      'email',
      'date',
      'checkbox',
      'select',
      'radio',
      'multi_select',
      'file',
      'signature',
      'heading',
      'section',
      'static',
    ] as const) {
      expect(() => FieldTypeZ.parse(t)).not.toThrow();
    }
  });

  it('rejects unknown field types', () => {
    expect(FieldTypeZ.safeParse('wysiwyg').success).toBe(false);
  });
});

describe('FormFieldZ', () => {
  it('parses a minimal text field', () => {
    const parsed = FormFieldZ.parse({ key: 'name', type: 'text' });
    expect(parsed).toEqual({ key: 'name', type: 'text' });
  });

  it('parses a file field with full 20.2.4 config', () => {
    const field = {
      key: 'resume',
      type: 'file' as const,
      label: 'Resume PDF',
      required: true,
      accepted_mime: 'application/pdf',
      max_size_bytes: 5 * 1024 * 1024,
      multiple: false,
    };
    expect(FormFieldZ.parse(field)).toEqual(field);
  });

  it('ignores config that does not apply to the declared type', () => {
    // The schema does NOT reject cross-config fields — matches the
    // Rust validator which simply never reads fields that don't apply
    // to the type. Makes the admin designer's "switch type without
    // dropping config" flow feasible.
    const field = FormFieldZ.parse({
      key: 'n',
      type: 'number',
      max_length: 12, // text-only, ignored by renderer
      min: 0,
      max: 100,
    });
    expect(field.max_length).toBe(12);
  });

  it('rejects a field without key or type', () => {
    expect(FormFieldZ.safeParse({ type: 'text' }).success).toBe(false);
    expect(FormFieldZ.safeParse({ key: 'x' }).success).toBe(false);
  });
});

describe('FormAttachmentRefZ', () => {
  it('accepts the canonical marker shape', () => {
    const ref = {
      __type: 'form_attachment_ref' as const,
      attachment_id: 'abc-123',
      filename: 'r.pdf',
      mime_type: 'application/pdf',
      size_bytes: 1024,
    };
    expect(FormAttachmentRefZ.parse(ref)).toEqual(ref);
  });

  it('tolerates the transient _scan_status client field', () => {
    const ref = FormAttachmentRefZ.parse({
      __type: 'form_attachment_ref',
      attachment_id: 'id',
      filename: 'f',
      mime_type: 'x',
      size_bytes: 1,
      _scan_status: 'pending',
    });
    expect(ref._scan_status).toBe('pending');
  });

  it('rejects the wrong discriminator', () => {
    const bad = FormAttachmentRefZ.safeParse({
      __type: 'file_ref', // entity_files uses this; forms use form_attachment_ref
      attachment_id: 'id',
      filename: 'f',
      mime_type: 'x',
      size_bytes: 1,
    });
    expect(bad.success).toBe(false);
  });

  it('rejects an empty attachment_id', () => {
    const bad = FormAttachmentRefZ.safeParse({
      __type: 'form_attachment_ref',
      attachment_id: '',
      filename: 'f',
      mime_type: 'x',
      size_bytes: 1,
    });
    expect(bad.success).toBe(false);
  });
});

describe('FieldsSchemaV2Z', () => {
  it('parses a minimal single-page schema', () => {
    const schema = {
      schema_version: 2 as const,
      fields: [{ key: 'name', type: 'text' as const }],
      pages: [
        {
          id: 'p1',
          name: 'Page 1',
          sections: [{ id: 's1', title: null, field_keys: ['name'] }],
        },
      ],
    };
    expect(FieldsSchemaV2Z.parse(schema)).toMatchObject({
      schema_version: 2,
      fields: [{ key: 'name', type: 'text' }],
    });
  });

  it('accepts routing + theme round-trip without dropping them', () => {
    const schema = {
      schema_version: 2 as const,
      fields: [
        { key: 'role', type: 'select' as const, options: ['a', 'b'] },
      ],
      pages: [
        { id: 'p1', name: 'P1', sections: [{ id: 's1', field_keys: ['role'] }] },
        { id: 'p2', name: 'P2', sections: [{ id: 's2', field_keys: [] }] },
      ],
      routing: [
        {
          from_page_id: 'p1',
          rules: [{ when: { '==': [{ var: 'role' }, 'a'] }, goto_page_id: 'p2' }],
          default_goto_page_id: '__end__',
        },
      ],
      theme: {
        theme_id: 't1',
        header: { title_override: 'Intake' },
        custom_css: '.form-public-shell { --brand-accent: #000; }',
      },
    };
    const parsed = FieldsSchemaV2Z.parse(schema);
    expect(parsed.routing).toHaveLength(1);
    expect(parsed.theme?.custom_css).toContain('--brand-accent');
  });

  it('rejects schema_version other than 2', () => {
    const bad = FieldsSchemaV2Z.safeParse({
      schema_version: 1,
      fields: [],
      pages: [],
    });
    expect(bad.success).toBe(false);
  });
});

describe('RoutingEntryZ', () => {
  it('accepts a rule with an opaque JSONLogic `when`', () => {
    // `when` is left `z.unknown()` by design — the SDK doesn't ship
    // a JSONLogic validator. Arbitrary nested blobs must round-trip.
    const entry = RoutingEntryZ.parse({
      from_page_id: 'p1',
      rules: [
        { when: { and: [{ '>': [{ var: 'n' }, 0] }, true] }, goto_page_id: 'p2' },
      ],
      default_goto_page_id: '',
    });
    expect(entry.rules).toHaveLength(1);
  });
});

describe('FormThemeZ', () => {
  it('accepts a fully-empty theme blob', () => {
    // A form with `theme: {}` should parse — the backend writes that
    // out when the admin hasn't touched the theme panel.
    expect(FormThemeZ.parse({})).toEqual({});
  });
});
