/**
 * Input mask formatter — small, dependency-free, used by Forms v2
 * text/email fields and (in a sister commit) by `<SmartField />`'s
 * TextInput component for entity-annotation-driven masks.
 *
 * Vocabulary (matches the broadly-recognized text-mask / imask
 * convention so admin docs read familiar):
 *
 *   `0` or `9`  → digit            (0–9)
 *   `a` or `A`  → letter           (a–z, A–Z; case-insensitive accept)
 *   `*`         → alphanumeric     (a–z, A–Z, 0–9)
 *   everything else → literal      (rendered verbatim, including '-')
 *
 * Examples from the original PM ask:
 *   '#####-##-######-#'  (using '#') → use '00000-00-000000-0' instead
 *   '?????-??-?????-?'   (using '?') → use '*****-**-*****-*' instead
 *
 * `uppercase: true` applies AFTER masking, so it only uppercases
 * the letter content the user typed (literals like '-' are
 * unaffected case-wise).
 *
 * Caret position is preserved through the formatting pass — the
 * cursor lands at the same logical content position it started
 * at, even when the masking step inserts or removes literals.
 * Implementation walks the mask template once, tracking consumed
 * input chars vs. output chars, and snaps the output caret to
 * the moment we cross the user's pre-format caret position.
 */

/** Token classes — return true if `ch` is acceptable for `tok`. */
function tokenAccepts(tok: string, ch: string): boolean {
  switch (tok) {
    case '0':
    case '9':
      return ch >= '0' && ch <= '9';
    case 'a':
    case 'A':
      return (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z');
    case '*':
      return (
        (ch >= 'a' && ch <= 'z') ||
        (ch >= 'A' && ch <= 'Z') ||
        (ch >= '0' && ch <= '9')
      );
    default:
      return false;
  }
}

/** True iff `tok` is a placeholder (vs. a literal). */
function isPlaceholder(tok: string): boolean {
  return tok === '0' || tok === '9' || tok === 'a' || tok === 'A' || tok === '*';
}

export interface MaskOptions {
  uppercase?: boolean;
}

/**
 * Apply a mask to a raw string, returning the formatted result.
 * Pure — no caret tracking.
 */
export function applyMask(
  raw: string,
  mask: string,
  options?: MaskOptions,
): string {
  if (!mask) return options?.uppercase ? raw.toUpperCase() : raw;
  let out = '';
  let rawIdx = 0;
  for (let m = 0; m < mask.length; m++) {
    if (rawIdx >= raw.length) break;
    const tok = mask[m]!;
    if (isPlaceholder(tok)) {
      // Skip raw chars that don't fit this token until we find one
      // (or run out of input).
      while (rawIdx < raw.length && !tokenAccepts(tok, raw[rawIdx]!)) {
        rawIdx++;
      }
      if (rawIdx < raw.length) {
        out += raw[rawIdx]!;
        rawIdx++;
      }
    } else {
      // Literal — emit it. If the user happened to type this same
      // literal, consume it from raw too so they can paste a
      // pre-formatted value cleanly.
      out += tok;
      if (raw[rawIdx] === tok) rawIdx++;
    }
  }
  return options?.uppercase ? out.toUpperCase() : out;
}

/**
 * Apply a mask AND map a caret position from the raw value to the
 * formatted output. Returns the formatted value plus the caret
 * position that should be set on the controlled input after the
 * change.
 *
 * Used by the controlled-input `onChange` handler: takes the
 * input's current value + selectionStart, produces the masked
 * value + a caret position to set in a follow-up effect.
 *
 * Edge cases handled:
 *   - Caret at end of `raw` → caret at end of output.
 *   - Caret in the middle of a run of skipped chars (chars that
 *     don't fit the next placeholder) → caret snaps forward to
 *     the next valid output position.
 *   - Empty mask → output equals `raw`, caret unchanged.
 */
export function applyMaskWithCaret(
  raw: string,
  caret: number,
  mask: string,
  options?: MaskOptions,
): { value: string; caret: number } {
  if (!mask) {
    return {
      value: options?.uppercase ? raw.toUpperCase() : raw,
      caret: Math.min(Math.max(0, caret), raw.length),
    };
  }
  let out = '';
  let rawIdx = 0;
  // Parallel array: for each output position i, the rawIdx value
  // AFTER processing it. Used post-walk to compute the caret.
  const outRawIdx: number[] = [];

  for (let m = 0; m < mask.length; m++) {
    if (rawIdx >= raw.length) break;
    const tok = mask[m]!;
    if (isPlaceholder(tok)) {
      while (rawIdx < raw.length && !tokenAccepts(tok, raw[rawIdx]!)) {
        rawIdx++;
      }
      if (rawIdx < raw.length) {
        out += raw[rawIdx]!;
        rawIdx++;
        outRawIdx.push(rawIdx);
      }
    } else {
      out += tok;
      if (raw[rawIdx] === tok) rawIdx++;
      outRawIdx.push(rawIdx);
    }
  }

  // Caret algorithm — find the smallest output position whose
  // post-process rawIdx is >= the requested caret, then advance
  // past any subsequent literal-only positions (positions whose
  // rawIdx is unchanged from the prior position) so the cursor
  // lands AFTER auto-inserted dashes / spaces / etc. and naturally
  // sits right where the next typed char will land.
  let outCaret: number;
  if (caret <= 0) {
    outCaret = 0;
  } else {
    let i = 0;
    while (i < outRawIdx.length && outRawIdx[i]! < caret) i++;
    if (i >= outRawIdx.length) {
      outCaret = out.length;
    } else {
      // Advance past trailing literal-only positions.
      while (
        i < outRawIdx.length - 1 &&
        outRawIdx[i + 1] === outRawIdx[i]
      ) {
        i++;
      }
      outCaret = i + 1;
    }
  }

  const finalValue = options?.uppercase ? out.toUpperCase() : out;
  return { value: finalValue, caret: outCaret };
}
