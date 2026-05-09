import type { CatalogComponentProps } from './types';
import { isFileRef } from '../../../client/files';

/** Phase 41.2 catalog default for `field_type = 'file_ref'`.
 *
 *  v0 renders a self-contained read-only summary (`filename (size)`)
 *  with no host-context dependency. Page Designer's Card block in
 *  Phase 41.5 will compose this with the existing
 *  `<FilePayloadView />` (which downloads + previews via the
 *  authenticated files client) — that path needs a
 *  `<FastYokeProvider>` and isn't appropriate for the framework-
 *  agnostic `<SmartField />` base. */

/* Phase 45.4 — `aria-invalid` is intentionally NOT wired here.
 * `FileRefAdapter` renders a `<span>` (filename + size summary),
 * not an interactive form widget. WAI-ARIA defines `aria-invalid`
 * for textbox / combobox / listbox / gridcell / etc.; on a generic
 * span the attribute has no AT-defined effect. Phase 41.7 / 21.8
 * may revisit if an editable inline file widget ships, at which
 * point this component should consume `invalid` + `describedBy`
 * the same way the other catalog inputs do (see TextInput.tsx).
 */

export function FileRefAdapter({
  id,
  annotation,
  value,
  className,
}: CatalogComponentProps): JSX.Element {
  if (isFileRef(value)) {
    const sizeKb = Math.max(1, Math.round(value.size_bytes / 1024));
    return (
      <span
        id={id}
        data-testid={`smartfield-${annotation.field_key}`}
        data-component-slug="file_payload"
        className={className}
      >
        {value.filename} ({sizeKb} KB)
      </span>
    );
  }
  return (
    <span
      id={id}
      data-testid={`smartfield-${annotation.field_key}`}
      data-component-slug="file_payload"
      className={className}
      style={{ color: '#9ca3af' }}
    >
      —
    </span>
  );
}
