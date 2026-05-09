/**
 * Phase 41.2 (LCAP) — pure resolution helpers extracted out of the
 * <SmartField /> component so they can be unit-tested without a
 * React render. The component's job is to take the result of
 * `resolveSmartField` and mount the matching catalog component.
 *
 * No I/O, no React. Idempotent — given the same inputs, returns
 * the same component slug + merged ui_config.
 */
import type { EntityFieldAnnotation } from '../../types/entityAnnotation';

/** The canonical 9-type vocabulary as seen by the resolver. The
 *  annotation row may carry `'text'` (legacy alias for
 *  `'longtext'`) or NULL/undefined (pre-LCAP rows degrade to
 *  `'string'`). */
export type ResolvedFieldType =
  | 'string'
  | 'longtext'
  | 'number'
  | 'boolean'
  | 'timestamp'
  | 'enum'
  | 'fsm_state_ref'
  | 'file_ref'
  | 'relationship';

/** Allowed `@ui/component` slugs per `field_type`, mirroring the
 *  backend `slug_allowed_for_field_type` matrix in
 *  `backend/src/api/entity_annotations.rs`. Both sides MUST stay
 *  in sync; the backend rejects writes outside the allowlist, the
 *  resolver gracefully falls back to the default + warns. */
const ALLOWED_SLUGS: Record<ResolvedFieldType, ReadonlyArray<string>> = {
  string: ['text', 'password', 'email', 'url', 'phone', 'slug'],
  longtext: ['textarea', 'richtext', 'markdown', 'code'],
  number: ['number', 'currency', 'percent', 'slider', 'rating'],
  boolean: ['checkbox', 'switch', 'radio'],
  timestamp: ['date', 'datetime', 'time', 'daterange'],
  enum: ['select', 'radio', 'tags'],
  fsm_state_ref: ['fsm_state_picker'],
  file_ref: ['file_payload'],
  relationship: ['display', 'id_only'],
};

/** Default component slug per `field_type`. Matches `LCAP-Spec.md`
 *  § 3.1. */
const DEFAULT_SLUG: Record<ResolvedFieldType, string> = {
  string: 'text',
  longtext: 'textarea',
  number: 'number',
  boolean: 'checkbox',
  timestamp: 'date',
  enum: 'select',
  fsm_state_ref: 'fsm_state_picker',
  file_ref: 'file_payload',
  relationship: 'display',
};

export function resolveFieldType(
  annotation: EntityFieldAnnotation,
): ResolvedFieldType {
  const ft = annotation.field_type;
  if (ft == null) return 'string';
  if (ft === 'text') return 'longtext'; // legacy alias
  return ft;
}

/** Resolution pipeline:
 *   1. Resolve `field_type` (NULL → 'string', 'text' → 'longtext').
 *   2. Merge ui_config — annotation.ui_config_json then
 *      uiConfigOverride wins on conflict.
 *   3. Read `@ui/component` from merged config; validate against
 *      the allow-list. Mismatched → fall back to default + warn.
 *
 *  Returns the resolved `field_type`, the merged ui_config object,
 *  and the final component slug. The caller maps the slug to a
 *  React component. */
export interface ResolvedSmartField {
  fieldType: ResolvedFieldType;
  uiConfig: Record<string, unknown>;
  componentSlug: string;
  /** True when the requested slug was rejected and we fell back
   *  to the default. The component layer surfaces a one-time
   *  console.warn when this is true. */
  slugFellBack: boolean;
  /** Echo of the rejected slug so the warn message can name it. */
  rejectedSlug: string | null;
  /** True when the annotation declares an expression key
   *  (`@ui/visible_when`, `@ui/compute`, `@ui/validate_when`).
   *  Phase 41.6 wires this to the QuickJS lazy load. v0 short-
   *  circuits to the static rendering with no expression
   *  evaluation. */
  hasExpression: boolean;
}

const EXPR_KEYS = ['@ui/visible_when', '@ui/compute', '@ui/validate_when'] as const;

export function resolveSmartField(
  annotation: EntityFieldAnnotation,
  uiConfigOverride?: Record<string, unknown>,
): ResolvedSmartField {
  const fieldType = resolveFieldType(annotation);

  // Step 2: merge — override wins on conflict, undefined keys
  // preserved from the annotation.
  const merged: Record<string, unknown> = {
    ...(annotation.ui_config_json ?? {}),
    ...(uiConfigOverride ?? {}),
  };

  // Step 3: resolve component slug.
  const requested =
    typeof merged['@ui/component'] === 'string' ? (merged['@ui/component'] as string) : null;
  const fallback = DEFAULT_SLUG[fieldType];
  let componentSlug = fallback;
  let slugFellBack = false;
  let rejectedSlug: string | null = null;
  if (requested) {
    if (ALLOWED_SLUGS[fieldType].includes(requested)) {
      componentSlug = requested;
    } else {
      rejectedSlug = requested;
      slugFellBack = true;
    }
  }
  // Normalize `@ui/component` in the merged config to the resolved
  // slug so catalog components reading `uiConfig['@ui/component']`
  // see the post-fallback value rather than the originally
  // requested (possibly rejected) slug.
  merged['@ui/component'] = componentSlug;

  const hasExpression = EXPR_KEYS.some(
    (k) => Object.prototype.hasOwnProperty.call(merged, k),
  );

  return {
    fieldType,
    uiConfig: merged,
    componentSlug,
    slugFellBack,
    rejectedSlug,
    hasExpression,
  };
}
