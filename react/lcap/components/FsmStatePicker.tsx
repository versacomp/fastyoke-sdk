import type { CatalogComponentProps } from './types';

/** Default catalog component for `field_type = 'fsm_state_ref'`.
 *  v0 renders a free-text input — the resolver doesn't yet wire a
 *  schema-aware picker (that lands in Phase 41.5 alongside the
 *  Page Designer block). `options_json` MAY carry a hand-curated
 *  list of state names; when present, we render a `<select>` so
 *  admins who annotate carefully get a picker today. */
export function FsmStatePicker({
  id,
  annotation,
  value,
  onChange,
  readOnly,
  className,
  invalid,
  describedBy,
}: CatalogComponentProps): JSX.Element {
  const options = Array.isArray(annotation.options_json) ? annotation.options_json : [];
  if (options.length > 0) {
    return (
      <select
        id={id}
        data-testid={`smartfield-${annotation.field_key}`}
        data-component-slug="fsm_state_picker"
        className={className}
        value={typeof value === 'string' ? value : ''}
        onChange={(e) => onChange(e.target.value)}
        required={annotation.required === true}
        aria-required={annotation.required === true ? 'true' : undefined}
        aria-invalid={invalid ? 'true' : undefined}
        aria-describedby={invalid && describedBy ? describedBy : undefined}
        disabled={readOnly === true}
      >
        <option value="" disabled={annotation.required === true}>
          select state
        </option>
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    );
  }
  return (
    <input
      id={id}
      data-testid={`smartfield-${annotation.field_key}`}
      data-component-slug="fsm_state_picker"
      type="text"
      className={className}
      value={typeof value === 'string' ? value : ''}
      onChange={(e) => onChange(e.target.value)}
      required={annotation.required === true}
      aria-required={annotation.required === true ? 'true' : undefined}
      aria-invalid={invalid ? 'true' : undefined}
      aria-describedby={invalid && describedBy ? describedBy : undefined}
      readOnly={readOnly === true}
    />
  );
}
