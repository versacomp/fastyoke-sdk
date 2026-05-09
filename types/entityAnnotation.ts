/**
 * Phase 40.4 — entity-annotation → zod schema adapter.
 *
 * Consumed by the CRUD scaffold builder's emitted bundle to
 * validate form input client-side before `useCreateEntity` /
 * `useUpdateEntity` fires. Maps the `entity_field_annotations`
 * row shape (labels, required, max_length, min/max, enum options)
 * onto the zod primitives the bundle uses for form validation.
 *
 * Phase 41.1 (LCAP) widens `field_type` to the closed 9-type
 * vocabulary the `<SmartField />` resolver consumes (string,
 * longtext, number, boolean, timestamp, enum, fsm_state_ref,
 * file_ref, relationship). The helper grows new arms for each
 * type; the legacy `'text'` value remains accepted as an alias
 * for `'longtext'` so existing callers don't break.
 *
 * This helper is published from the SDK (not the backend) because
 * the emitted bundle needs to run the validation at the browser,
 * right before the write hook fires. Keeping the helper in the SDK
 * also means the emitter imports a small symbol rather than
 * inlining validation logic per field.
 */
import { z } from 'zod';

/** Phase 41.1 (LCAP) closed type vocabulary. Mirrors the backend
 *  `FieldType` enum in `backend/src/api/entity_annotations.rs`. */
export type FieldType =
  | 'string'
  | 'longtext'
  | 'number'
  | 'boolean'
  | 'timestamp'
  | 'enum'
  | 'fsm_state_ref'
  | 'file_ref'
  | 'relationship';

/** Mirrors the backend's `AnnotationRow` shape. */
export interface EntityFieldAnnotation {
  field_key: string;
  label?: string | null;
  required?: boolean;
  max_length?: number | null;
  min?: number | null;
  max?: number | null;
  /** Enum options for select / radio fields. Shape:
   *  `[{ value: 'a', label: 'Option A' }, ...]`. When present, the
   *  emitted zod schema constrains the field to those values. */
  options_json?: Array<{ value: string; label: string }> | null;
  help_text?: string | null;
  /** Phase 41.1 (LCAP). Drives the resolver's component pick +
   *  zod leaf shape. Pre-LCAP rows have `null` / undefined and
   *  fall back to a permissive string schema. The legacy `'text'`
   *  value stays accepted as an alias for `'longtext'`. */
  field_type?: FieldType | 'text' | null;
  /** Phase 41.1 (LCAP). Free-form `@ui/...` keys consumed by the
   *  `<SmartField />` resolver: `@ui/component`, `@ui/format`,
   *  `@ui/currency_code`, `@ui/decimal_places`,
   *  `@ui/use_separators`, `@ui/include_time`, `@ui/date_format`,
   *  `@ui/timezone`, `@ui/visible_when`, `@ui/compute`,
   *  `@ui/validate_when`. The zod helper consumes only the
   *  validation-relevant keys here; the resolver consumes the
   *  rest at render time. */
  ui_config_json?: Record<string, unknown> | null;
  /** Phase 41.1 (LCAP). Sort order for the Card block + admin
   *  editor. NULL = unspecified; consumers fall back to
   *  `field_key` ordering. */
  display_order?: number | null;
}

/**
 * Build a zod object schema from an array of annotation rows.
 * Field keys with `required === true` are required; others accept
 * undefined. Length caps, numeric bounds, and enum options are
 * applied to the appropriate leaf schema.
 *
 * Unknown / missing `field_type` falls back to `z.string()`. The
 * CRUD scaffold emitter (40.3) never ships a row without a
 * sensible type, but guarding against the null case keeps the
 * helper robust when admins hand-edit annotations post-install.
 */
export function entityAnnotationToZod(
  annotations: readonly EntityFieldAnnotation[],
): z.ZodObject<z.ZodRawShape> {
  const shape: z.ZodRawShape = {};
  for (const ann of annotations) {
    const leaf = buildLeaf(ann);
    shape[ann.field_key] = ann.required === true ? leaf : leaf.optional();
  }
  return z.object(shape);
}

function buildLeaf(ann: EntityFieldAnnotation): z.ZodTypeAny {
  const fieldType = ann.field_type ?? 'string';

  if (fieldType === 'number') {
    let n: z.ZodNumber = z.number({
      invalid_type_error: `${ann.label ?? ann.field_key} must be a number`,
    });
    if (ann.min !== null && ann.min !== undefined) n = n.min(ann.min);
    if (ann.max !== null && ann.max !== undefined) n = n.max(ann.max);

    // Phase 41.4: percent storage stays decimal — values must be
    // in [0, 1]. The display layer multiplies by 100 for the user;
    // the zod schema rejects out-of-range storage so a hand-edit
    // bug doesn't write `7` instead of `0.07`.
    const ui = ann.ui_config_json ?? {};
    const componentSlug = typeof ui['@ui/component'] === 'string' ? ui['@ui/component'] : null;
    if (componentSlug === 'percent') {
      // Apply default percent bounds only when the annotation didn't
      // supply explicit ones (admin can override with @ui/min /
      // @ui/max for things like "growth %" that exceed 1.0).
      if (ann.min === null || ann.min === undefined) n = n.min(0);
      if (ann.max === null || ann.max === undefined) n = n.max(1);
    }
    // Phase 41.4: when @ui/decimal_places is set, refine via a
    // toFixed round-trip — `parseFloat(v.toFixed(d)) === v` is
    // true iff `v` has at most `d` decimal places. This handles
    // IEEE-754 quirks correctly (`0.07.toFixed(2) === '0.07'`)
    // and rejects extra precision (`1.234.toFixed(2) → '1.23' →
    // 1.23 !== 1.234`).
    const decimalPlaces =
      typeof ui['@ui/decimal_places'] === 'number' ? (ui['@ui/decimal_places'] as number) : null;
    if (decimalPlaces !== null && decimalPlaces >= 0) {
      const refined = n.refine(
        (v) => parseFloat(v.toFixed(decimalPlaces)) === v,
        {
          message: `${ann.label ?? ann.field_key} must have at most ${decimalPlaces} decimal place${decimalPlaces === 1 ? '' : 's'}`,
        },
      );
      return refined;
    }
    return n;
  }

  if (fieldType === 'boolean') {
    return z.boolean({
      invalid_type_error: `${ann.label ?? ann.field_key} must be true or false`,
    });
  }

  if (fieldType === 'enum') {
    const options = ann.options_json ?? [];
    const values = options.map((o) => o.value);
    if (values.length === 0) {
      // Empty enum annotation → accept any string so the form
      // doesn't reject every input. Admins who haven't filled in
      // options get a permissive fallback rather than an
      // always-invalid field.
      return z.string();
    }
    // z.enum needs a non-empty readonly tuple literal; cast is
    // structurally sound because we just verified length > 0.
    return z.enum(values as [string, ...string[]]);
  }

  // Phase 41.1 (LCAP): timestamp leaf. Storage is ISO-8601 UTC; we
  // refine the string with `Date.parse` so a malformed value
  // surfaces as a zod error before the write hook fires.
  if (fieldType === 'timestamp') {
    return z
      .string({
        invalid_type_error: `${ann.label ?? ann.field_key} must be an ISO-8601 timestamp`,
      })
      .refine((s) => !Number.isNaN(Date.parse(s)), {
        message: `${ann.label ?? ann.field_key} must be a valid ISO-8601 timestamp`,
      });
  }

  // Phase 41.1 (LCAP): file_ref leaf. The shipped file-upload
  // pipeline writes a `{ ref, filename, mime, size_bytes }`
  // object onto the entity payload; admins who don't upload anything
  // get `null` / undefined. We accept either the object shape or
  // null so optional uploads pass validation.
  if (fieldType === 'file_ref') {
    return z
      .object({
        ref: z.string(),
        filename: z.string().optional(),
        mime: z.string().optional(),
        size_bytes: z.number().optional(),
      })
      .nullable();
  }

  // Phase 41.1 (LCAP): fsm_state_ref + relationship both store a
  // string id (state name / record id). No further refinement at
  // validation time — the resolver's display path is the surface
  // that resolves the reference.
  if (fieldType === 'fsm_state_ref' || fieldType === 'relationship') {
    let s: z.ZodString = z.string({
      invalid_type_error: `${ann.label ?? ann.field_key} must be a string id`,
    });
    if (ann.required === true) {
      s = s.min(1, {
        message: `${ann.label ?? ann.field_key} is required`,
      });
    }
    return s;
  }

  // `string`, `longtext`, and the legacy `text` alias all share
  // the same leaf — they render as different components in the
  // resolver but store the same string type. `longtext` skips the
  // implicit max_length the legacy `text` arm used to apply,
  // matching `LCAP-Spec.md` § 3.5 (no length cap unless declared).
  let s: z.ZodString = z.string({
    invalid_type_error: `${ann.label ?? ann.field_key} must be a string`,
  });
  if (
    ann.required === true &&
    (ann.max_length === null || ann.max_length === undefined || ann.max_length > 0)
  ) {
    // Required string: reject empty-after-trim at validation
    // time — matches the backend's "blank rejected" posture for
    // required entity fields.
    s = s.min(1, {
      message: `${ann.label ?? ann.field_key} is required`,
    });
  }
  if (ann.max_length !== null && ann.max_length !== undefined) {
    s = s.max(ann.max_length, {
      message: `${ann.label ?? ann.field_key} must be ${ann.max_length} characters or fewer`,
    });
  }
  return s;
}
