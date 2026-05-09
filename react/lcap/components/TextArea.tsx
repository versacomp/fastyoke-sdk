import type { CatalogComponentProps } from './types';

/** Default catalog component for `field_type = 'longtext'`. Plain
 *  `<textarea>`; richtext / markdown / code variants resolve to
 *  separate peer packages via `@ui/component`. Also serves as the
 *  fallback when a heavy-editor peer package isn't installed. */
export function TextArea({
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
      : 'textarea';
  const max =
    typeof annotation.max_length === 'number' ? annotation.max_length : undefined;
  return (
    <textarea
      id={id}
      data-testid={`smartfield-${annotation.field_key}`}
      data-component-slug={slug}
      className={className}
      value={typeof value === 'string' ? value : ''}
      onChange={(e) => onChange(e.target.value)}
      maxLength={max}
      required={annotation.required === true}
      aria-required={annotation.required === true ? 'true' : undefined}
      aria-invalid={invalid ? 'true' : undefined}
      aria-describedby={invalid && describedBy ? describedBy : undefined}
      readOnly={readOnly === true}
      rows={4}
    />
  );
}
