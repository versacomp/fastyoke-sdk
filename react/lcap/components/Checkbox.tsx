import type { CatalogComponentProps } from './types';

/** Default catalog component for `field_type = 'boolean'`.
 *  `@ui/component = "switch"` swaps the rendered control to a
 *  switch-styled checkbox; the value shape stays boolean.
 *  `@ui/component = "radio"` is allowed when `options_json` is
 *  present (yes/no radio) — emits two radios sharing the field's
 *  name. */
export function Checkbox({
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
      : 'checkbox';
  return (
    <input
      id={id}
      data-testid={`smartfield-${annotation.field_key}`}
      data-component-slug={slug}
      type="checkbox"
      role={slug === 'switch' ? 'switch' : undefined}
      className={className}
      checked={value === true}
      onChange={(e) => onChange(e.target.checked)}
      aria-required={annotation.required === true ? 'true' : undefined}
      aria-invalid={invalid ? 'true' : undefined}
      aria-describedby={invalid && describedBy ? describedBy : undefined}
      disabled={readOnly === true}
    />
  );
}
