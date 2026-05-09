/**
 * Zod schemas for Phase 20.2 Forms Builder shapes. Mirrors the TS
 * interfaces in `frontend/src/features/forms/FormRenderer.tsx` and
 * `FormsBuilder.tsx` so SDK consumers (Phase 21.8 enterprise SPA,
 * external integrators) can validate form payloads without
 * reaching into the admin app's internals.
 *
 * The Rust backend stores `fields_schema_json` as free-form TEXT
 * (Claude.md §4.1 — SQLite has no JSONB), so these schemas are the
 * developer-ergonomics source of truth rather than a strict wire
 * contract. A missing optional field never rejects; only structural
 * surprises do.
 */
import { z } from 'zod';

// ---------------------------------------------------------------------------
// Phase 20.2.4: file attachments
// ---------------------------------------------------------------------------

/// Value carried by a `file`-typed field. Mirrors the backend's
/// `form_attachment_ref` walker — only `__type` + `attachment_id` are
/// load-bearing; the rest is metadata the renderer uses for display.
/// `_scan_status` is transient client-side state (stripped before
/// POST by `stripScanStatus`) but parsing permissively keeps the
/// schema usable on in-flight values too.
export const FormAttachmentRefZ = z.object({
  __type: z.literal('form_attachment_ref'),
  attachment_id: z.string().min(1),
  filename: z.string(),
  mime_type: z.string(),
  size_bytes: z.number(),
  _scan_status: z.string().optional(),
});
export type FormAttachmentRef = z.infer<typeof FormAttachmentRefZ>;

// ---------------------------------------------------------------------------
// Phase 20.2.1: field provenance
// ---------------------------------------------------------------------------

/// Phase 20.2.3 stamp: when a field is added via the entity-field
/// picker, this records which entity attribute it came from so a
/// future submission-to-entity promoter knows the mapping.
export const FormFieldSourceZ = z.object({
  kind: z.literal('entity_field'),
  entity_name: z.string(),
  entity_field_key: z.string(),
  inferred_type: z.enum(['string', 'number', 'boolean', 'file', 'json']),
  snapshotted_at: z.string(),
});
export type FormFieldSource = z.infer<typeof FormFieldSourceZ>;

// ---------------------------------------------------------------------------
// FormField
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Phase forms-signature: signature capture
// ---------------------------------------------------------------------------

/// Value carried by a `signature`-typed field. The client sends
/// `__type`, `signed_name`, and `signature_image`; the server
/// overwrites `signed_at` (UTC ISO-8601) and `signer_ip` before
/// validation/persistence runs. Both fields are optional here so
/// this schema validates both pre-submit (client) shapes and
/// fully-stamped (persisted) shapes.
export const FormSignatureZ = z.object({
  __type: z.literal('form_signature'),
  signed_name: z.string().min(1),
  signature_image: z.string().min(1),
  // Server-stamped — optional on the client side because the
  // submit POST omits them. Persisted submissions always carry
  // both.
  signed_at: z.string().optional(),
  signer_ip: z.string().optional(),
});
export type FormSignature = z.infer<typeof FormSignatureZ>;

export const FieldTypeZ = z.enum([
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
  // Layout-only field carrying sanitized HTML for legal text /
  // disclaimers / longer-form prose. Display-only by construction
  // — the public renderer never mounts an input for it, so
  // submitters cannot change the content. Authors edit the HTML
  // through the FormsBuilder inspector's contenteditable toolbar.
  'richtext',
]);
export type FieldType = z.infer<typeof FieldTypeZ>;

/// A single field definition. All type-specific config is optional
/// at the schema level — the renderer and validator each ignore
/// fields that don't apply to the field's `type`. Matches the
/// Rust `FieldDef` in `forms_validation.rs` 1:1.
export const FormFieldZ = z.object({
  /// Present only on designer-side in-memory shapes where keys may
  /// temporarily collide during edits. Public schemas never carry it.
  uiId: z.string().optional(),
  key: z.string(),
  type: FieldTypeZ,
  label: z.string().optional(),
  required: z.boolean().optional(),
  max_length: z.number().optional(),
  min: z.number().optional(),
  max: z.number().optional(),
  options: z.array(z.string()).optional(),
  /// heading / static layout text.
  text: z.string().optional(),
  level: z.number().optional(),
  source: FormFieldSourceZ.optional(),
  /// Phase 20.2.4b — `file` field config.
  accepted_mime: z.string().optional(),
  max_size_bytes: z.number().optional(),
  multiple: z.boolean().optional(),
  /// Per-field cap on the inline image height in the auto-typeset
  /// PDF (`pdf_render_mode = "typst"`). Centimeters, positive,
  /// `<=` 22cm; values outside that range fall back to the
  /// backend default of 6cm. No effect on the overlay PDF path
  /// — overlay regions are sized by the per-region rectangle.
  pdf_image_height_cm: z.number().positive().optional(),
  /// Input-mask field config — applies to `text` and `email`.
  /// Vocabulary: '0' / '9' = digit, 'a' / 'A' = letter, '*' =
  /// alphanumeric; everything else is a literal. Example masks:
  /// '000-00-0000' (US SSN), '(000) 000-0000' (phone),
  /// '00000-0000' (US ZIP+4). Silently ignored on field types
  /// that don't honor it.
  mask: z.string().optional(),
  /// When true, transforms typed letters to uppercase as the
  /// user types. Stacks cleanly with `mask` — uppercase runs
  /// AFTER masking so literals are unaffected.
  uppercase: z.boolean().optional(),
});
export type FormField = z.infer<typeof FormFieldZ>;

// ---------------------------------------------------------------------------
// Phase 20.2.2: pages + sections
// ---------------------------------------------------------------------------

export const FormSectionZ = z.object({
  id: z.string(),
  title: z.string().nullable().optional(),
  field_keys: z.array(z.string()),
});
export type FormSection = z.infer<typeof FormSectionZ>;

export const FormPageV2Z = z.object({
  id: z.string(),
  name: z.string(),
  sections: z.array(FormSectionZ),
});
export type FormPageV2 = z.infer<typeof FormPageV2Z>;

// ---------------------------------------------------------------------------
// Phase 20.2.6: routing
// ---------------------------------------------------------------------------

/// Sugar predicate shapes that compile down to raw JSONLogic at
/// evaluation time. Stored verbatim under `RoutingRule.when` so
/// the wire shape stays permissive (`z.unknown()` below); the
/// `compileRoutingWhen` helper renders each sugar predicate to
/// raw JSONLogic against the submitter's clock before the
/// JSONLogic evaluator sees it. Raw JSONLogic stored under `when`
/// (the historical shape) is treated as `{kind: "expression"}`
/// implicitly — perfect backwards-compat.

const NumericSumPredicateZ = z.object({
  kind: z.literal('numeric_sum'),
  fields: z.array(z.string()).min(1),
  op: z.enum(['==', '!=', '<', '<=', '>', '>=']),
  value: z.number(),
});
export type NumericSumPredicate = z.infer<typeof NumericSumPredicateZ>;

const DateWithinDaysPredicateZ = z.object({
  kind: z.literal('date_within_days'),
  field: z.string(),
  days: z.number().int(),
  direction: z.enum(['future_within', 'future_after', 'past_within', 'past_after']),
});
export type DateWithinDaysPredicate = z.infer<typeof DateWithinDaysPredicateZ>;

const DateAgeAtLeastPredicateZ = z.object({
  kind: z.literal('date_age_at_least'),
  field: z.string(),
  years: z.number().int().positive(),
});
export type DateAgeAtLeastPredicate = z.infer<typeof DateAgeAtLeastPredicateZ>;

const ExpressionPredicateZ = z.object({
  kind: z.literal('expression'),
  expr: z.unknown(),
});
export type ExpressionPredicate = z.infer<typeof ExpressionPredicateZ>;

export const RoutingSugarPredicateZ = z.discriminatedUnion('kind', [
  ExpressionPredicateZ,
  NumericSumPredicateZ,
  DateWithinDaysPredicateZ,
  DateAgeAtLeastPredicateZ,
]);
export type RoutingSugarPredicate = z.infer<typeof RoutingSugarPredicateZ>;

/// A single routing rule: when `when` (JSONLogic OR a sugar
/// predicate) evaluates truthy, advance to `goto_page_id`.
/// `goto_page_id = "__end__"` short-circuits to the submit state;
/// empty string means "stop" (no further navigation). The `when`
/// blob is left opaque on the wire (`z.unknown()`) so historical
/// raw-JSONLogic rules round-trip unchanged alongside the new
/// sugar shapes.
export const RoutingRuleZ = z.object({
  when: z.unknown(),
  goto_page_id: z.string(),
});
export type RoutingRule = z.infer<typeof RoutingRuleZ>;

export const RoutingEntryZ = z.object({
  from_page_id: z.string(),
  rules: z.array(RoutingRuleZ).optional(),
  default_goto_page_id: z.string(),
});
export type RoutingEntry = z.infer<typeof RoutingEntryZ>;

// ---------------------------------------------------------------------------
// Phase 20.2.5 / 20.2.7: theme + custom CSS
// ---------------------------------------------------------------------------

export const FormThemeHeaderZ = z.object({
  logo_attachment_id: z.string().nullable().optional(),
  hero_image_attachment_id: z.string().nullable().optional(),
  title_override: z.string().nullable().optional(),
  subtitle: z.string().nullable().optional(),
});
export type FormThemeHeader = z.infer<typeof FormThemeHeaderZ>;

export const FormThemeZ = z.object({
  theme_id: z.string().nullable().optional(),
  header: FormThemeHeaderZ.optional(),
  /// Phase 20.2.7: per-tenant flagged custom CSS. Server sanitizes
  /// on save AND on serve; admins who lack the feature flag see
  /// this field silently stripped by `get_public_form`.
  custom_css: z.string().nullable().optional(),
});
export type FormTheme = z.infer<typeof FormThemeZ>;

// ---------------------------------------------------------------------------
// Phase 20.2.1: top-level schema
// ---------------------------------------------------------------------------

/// v2 envelope produced by the admin designer and accepted by the
/// backend. v1 (`{fields: FormField[]}`) is read-shimmed server-
/// side into this shape — SDK consumers should always emit v2.
export const FieldsSchemaV2Z = z.object({
  schema_version: z.literal(2),
  fields: z.array(FormFieldZ),
  pages: z.array(FormPageV2Z),
  routing: z.array(RoutingEntryZ).optional(),
  theme: FormThemeZ.nullable().optional(),
});
export type FieldsSchemaV2 = z.infer<typeof FieldsSchemaV2Z>;

// ---------------------------------------------------------------------------
// PublicFormResponse — shape returned by GET /api/v1/public/forms/:token
// ---------------------------------------------------------------------------

/// Zod schema for the public form endpoint response. Use this in
/// external consumers (e.g. a Next.js app) to validate the payload
/// from `GET /api/v1/public/forms/:token` without reaching into
/// internal admin-app types. `fields_schema_json` is validated as a
/// v2 fields envelope (server normalises v1→v2 before serving).
///
/// Convenience accessor: `schema.title` returns the form's display
/// name (`name` on the wire); `schema.fields` flattens through
/// `fields_schema_json.fields` so callers don't need to drill in.
export const FormSchemaZ = z
  .object({
    form_definition_id: z.string(),
    name: z.string(),
    slug: z.string(),
    version: z.number(),
    fields_schema_json: FieldsSchemaV2Z,
    layout_json: z.unknown(),
    submissions_remaining: z.number().nullable().optional(),
    expires_at: z.string(),
    resolved_theme_tokens: z.unknown().optional(),
    resolved_custom_css: z.string().nullable().optional(),
  })
  .transform((v) => ({
    ...v,
    /// `title` alias for `name` — convenience for renderer code.
    title: v.name,
    /// `fields` shorthand into `fields_schema_json.fields`.
    fields: v.fields_schema_json.fields,
  }));
export type FormSchema = z.infer<typeof FormSchemaZ>;
