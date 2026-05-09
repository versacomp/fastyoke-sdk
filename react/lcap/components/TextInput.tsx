import { useEffect, useRef } from 'react';
import { applyMaskWithCaret } from '../../../utils/inputMask';
import type { CatalogComponentProps } from './types';

/** Default catalog component for `field_type = 'string'`. Renders a
 *  native `<input>` whose `type` attribute follows the
 *  `@ui/component` slug — `text` (default), `password`, `email`,
 *  `url`, `phone` (→ `tel`), `slug` (→ `text` with a hint).
 *
 *  Honors two ui_config keys for input formatting:
 *    `@ui/input_mask` — string mask. Vocabulary: '0'/'9' digit,
 *      'a'/'A' letter, '*' alphanumeric, anything else literal.
 *      Caret position is preserved through the format pass.
 *    `@ui/uppercase`  — boolean. Uppercases letters as the user
 *      types. Stacks cleanly with mask (mask first, uppercase
 *      after — literals unaffected).
 *  Both keys are silently ignored on read-only renders.
 */
export function TextInput({
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
    typeof uiConfig['@ui/component'] === 'string' ? uiConfig['@ui/component'] : 'text';
  const inputType = (() => {
    switch (slug) {
      case 'password':
        return 'password';
      case 'email':
        return 'email';
      case 'url':
        return 'url';
      case 'phone':
        return 'tel';
      default:
        return 'text';
    }
  })();
  const max =
    typeof annotation.max_length === 'number' ? annotation.max_length : undefined;
  const mask =
    typeof uiConfig['@ui/input_mask'] === 'string'
      ? (uiConfig['@ui/input_mask'] as string)
      : undefined;
  const uppercase = uiConfig['@ui/uppercase'] === true;

  const inputRef = useRef<HTMLInputElement | null>(null);
  // Pending caret restored after React commits the controlled value.
  // Without this, the browser snaps the cursor to the end of the
  // newly-set value, which is a usability regression for masked
  // inputs.
  const pendingCaret = useRef<number | null>(null);
  useEffect(() => {
    if (pendingCaret.current !== null && inputRef.current) {
      const pos = pendingCaret.current;
      pendingCaret.current = null;
      try {
        inputRef.current.setSelectionRange(pos, pos);
      } catch {
        // Some <input type> values throw on setSelectionRange in
        // older browsers. The value is still correct; caret falls
        // back to end. Best-effort.
      }
    }
  });

  function handleChange(e: React.ChangeEvent<HTMLInputElement>): void {
    const raw = e.target.value;
    if (readOnly) return;
    if (mask && mask.length > 0) {
      const caret = e.target.selectionStart ?? raw.length;
      const result = applyMaskWithCaret(raw, caret, mask, { uppercase });
      pendingCaret.current = result.caret;
      onChange(result.value);
      return;
    }
    if (uppercase) {
      const caret = e.target.selectionStart ?? raw.length;
      pendingCaret.current = caret;
      onChange(raw.toUpperCase());
      return;
    }
    onChange(raw);
  }

  return (
    <input
      ref={inputRef}
      id={id}
      data-testid={`smartfield-${annotation.field_key}`}
      data-component-slug={slug}
      type={inputType}
      className={className}
      value={typeof value === 'string' ? value : ''}
      onChange={handleChange}
      maxLength={max}
      required={annotation.required === true}
      aria-required={annotation.required === true ? 'true' : undefined}
      aria-invalid={invalid ? 'true' : undefined}
      aria-describedby={invalid && describedBy ? describedBy : undefined}
      readOnly={readOnly === true}
    />
  );
}
