import type { CatalogComponentProps } from './types';

/** Default catalog component for `field_type = 'number'`. Native
 *  `<input type="number">`. Currency / percent / slider / rating
 *  variants live as `@ui/component` overrides — Phase 41.4 wires
 *  the actual locale-driven Intl formatting; v0 ships a uniform
 *  numeric input that respects min/max/step. */
export function NumberInput({
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
      : 'number';
  const min = typeof annotation.min === 'number' ? annotation.min : undefined;
  const max = typeof annotation.max === 'number' ? annotation.max : undefined;
  const step =
    typeof uiConfig['@ui/step'] === 'number'
      ? (uiConfig['@ui/step'] as number)
      : undefined;
  return (
    <input
      id={id}
      data-testid={`smartfield-${annotation.field_key}`}
      data-component-slug={slug}
      type="number"
      className={className}
      value={typeof value === 'number' ? value : value === '' || value == null ? '' : String(value)}
      onChange={(e) => {
        const raw = e.target.value;
        if (raw === '') {
          onChange(null);
          return;
        }
        const n = Number(raw);
        onChange(Number.isNaN(n) ? raw : n);
      }}
      min={min}
      max={max}
      step={step}
      required={annotation.required === true}
      aria-required={annotation.required === true ? 'true' : undefined}
      aria-invalid={invalid ? 'true' : undefined}
      aria-describedby={invalid && describedBy ? describedBy : undefined}
      readOnly={readOnly === true}
    />
  );
}
