import type { CatalogComponentProps } from './types';

/** Default catalog component for `field_type = 'timestamp'`.
 *  Native `<input type="date">` (or `datetime-local` when
 *  `@ui/include_time = true` or `@ui/component = "datetime"`).
 *  Storage shape stays ISO-8601 UTC; this v0 implementation
 *  forwards the raw browser-supplied value. Phase 41.4 layers on
 *  the dayjs-driven `@ui/date_format` / `@ui/timezone` plumbing. */
export function DatePicker({
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
    typeof uiConfig['@ui/component'] === 'string' ? uiConfig['@ui/component'] : 'date';
  const includeTime =
    slug === 'datetime' ||
    slug === 'time' ||
    uiConfig['@ui/include_time'] === true;
  const inputType = (() => {
    if (slug === 'time') return 'time';
    if (includeTime) return 'datetime-local';
    return 'date';
  })();
  return (
    <input
      id={id}
      data-testid={`smartfield-${annotation.field_key}`}
      data-component-slug={slug}
      type={inputType}
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
