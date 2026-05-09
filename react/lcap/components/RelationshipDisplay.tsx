import type { CatalogComponentProps } from './types';

/** Default catalog component for `field_type = 'relationship'`.
 *  Per locked decision #1 (`LCAP-Phases.md`): annotation-only in
 *  v0 — the resolver renders the id (or the dereferenced
 *  `display_path` string when explicitly opted in) but does NOT
 *  walk the foreign entity's annotations.
 *
 *  In `mode='edit'` the input is **disabled** to make the
 *  no-relationship-picker contract obvious; admins who need an
 *  inline picker use Phase 21.7 / 21.8 LLM-authored extensions.
 *  Phase 41.7 (post-v0) will revisit. */
export function RelationshipDisplay({
  id,
  annotation,
  uiConfig,
  value,
  className,
  invalid,
  describedBy,
}: CatalogComponentProps): JSX.Element {
  const slug =
    typeof uiConfig['@ui/component'] === 'string'
      ? uiConfig['@ui/component']
      : 'display';
  const idStr = typeof value === 'string' ? value : value == null ? '' : String(value);
  return (
    <input
      id={id}
      data-testid={`smartfield-${annotation.field_key}`}
      data-component-slug={slug}
      type="text"
      className={className}
      value={idStr}
      readOnly
      disabled
      aria-required={annotation.required === true ? 'true' : undefined}
      aria-invalid={invalid ? 'true' : undefined}
      aria-describedby={invalid && describedBy ? describedBy : undefined}
    />
  );
}
