import type { CatalogComponentProps } from './types';

/** Default catalog component for `field_type = 'enum'`. Renders a
 *  native `<select>` populated from `annotation.options_json`.
 *  `@ui/component = "radio"` swaps to a radio group; `tags` is
 *  reserved for a multi-select Phase 41.4 follow-on (renders the
 *  current-value list with read-only chips for now). */
export function Select({
  id,
  annotation,
  uiConfig,
  value,
  onChange,
  readOnly,
  className,
  invalid,
  describedBy,
}: CatalogComponentProps): JSX.Element {
  const slug =
    typeof uiConfig['@ui/component'] === 'string'
      ? uiConfig['@ui/component']
      : 'select';
  const options = Array.isArray(annotation.options_json) ? annotation.options_json : [];
  return (
    <select
      id={id}
      data-testid={`smartfield-${annotation.field_key}`}
      data-component-slug={slug}
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
        {annotation.label ?? annotation.field_key}
      </option>
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}
