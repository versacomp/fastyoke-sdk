/**
 * @vitest-environment node
 */
import { describe, it, expect } from 'vitest';
import { applyMask, applyMaskWithCaret } from '../utils/inputMask';

describe('applyMask — token vocabulary', () => {
  it('digit tokens accept digits, drop non-digits', () => {
    expect(applyMask('abc1d2e3', '000')).toBe('123');
    expect(applyMask('abc1d2e3', '999')).toBe('123');
  });

  it('letter tokens accept letters, drop digits', () => {
    expect(applyMask('1a2b3c', 'aaa')).toBe('abc');
    expect(applyMask('1A2B3C', 'AAA')).toBe('ABC');
    // Letter token is case-insensitive accept; uppercase is a
    // separate option, not driven by mask token case.
    expect(applyMask('1a2B3c', 'aaa')).toBe('aBc');
  });

  it('alphanumeric * accepts letters and digits, drops symbols', () => {
    expect(applyMask('a-1!b@2', '****')).toBe('a1b2');
  });

  it('inserts literals from the mask verbatim', () => {
    expect(applyMask('123456789', '000-00-0000')).toBe('123-45-6789');
  });

  it('consumes user-typed literals when they match the mask literal', () => {
    // If user pastes "123-45-6789" the existing dashes get consumed,
    // not double-stamped.
    expect(applyMask('123-45-6789', '000-00-0000')).toBe('123-45-6789');
  });

  it('truncates input that exceeds mask capacity', () => {
    expect(applyMask('1234567890', '000-00-0000')).toBe('123-45-6789');
  });

  it('partial input does not pad with literals beyond the typed content', () => {
    expect(applyMask('12', '000-00-0000')).toBe('12');
    expect(applyMask('123', '000-00-0000')).toBe('123');
    expect(applyMask('1234', '000-00-0000')).toBe('123-4');
  });

  it('PM-spec digit pattern with hyphens', () => {
    // '#####-##-######-#' translated to the canonical vocab.
    // 13 digits — the trailing dash-and-final-digit stay unrendered
    // because no content follows; literals only appear when content
    // beyond them gets consumed.
    expect(applyMask('1234567890123', '00000-00-000000-0')).toBe('12345-67-890123');
    expect(applyMask('12345678901234', '00000-00-000000-0')).toBe('12345-67-890123-4');
  });

  it('PM-spec alphanumeric pattern with hyphens', () => {
    expect(applyMask('abc123de4567', '*****-**-*****-*')).toBe('abc12-3d-e4567');
  });

  it('uppercase option uppercases letters but leaves literals alone', () => {
    expect(applyMask('a-1!b@2', '*-0-*-0', { uppercase: true })).toBe('A-1-B-2');
    expect(applyMask('abcd', 'aaaa', { uppercase: true })).toBe('ABCD');
  });

  it('empty mask returns input unchanged (modulo uppercase)', () => {
    expect(applyMask('hi', '')).toBe('hi');
    expect(applyMask('hi', '', { uppercase: true })).toBe('HI');
  });

  it('empty raw returns empty', () => {
    expect(applyMask('', '000-00-0000')).toBe('');
  });
});

describe('applyMaskWithCaret — caret preservation', () => {
  it('caret at end of raw lands at end of output', () => {
    const out = applyMaskWithCaret('123', 3, '000-00-0000');
    expect(out.value).toBe('123');
    expect(out.caret).toBe(3);
  });

  it('caret at start of raw stays at start of output', () => {
    const out = applyMaskWithCaret('123', 0, '000-00-0000');
    expect(out.value).toBe('123');
    expect(out.caret).toBe(0);
  });

  it('caret in the middle moves forward across an inserted literal', () => {
    // User types "1234" → masked "123-4". If the caret was AFTER
    // the 3rd char (pos 3 in raw), it should sit AFTER the literal
    // in the output (pos 4 = right after the dash).
    const out = applyMaskWithCaret('1234', 3, '000-00-0000');
    expect(out.value).toBe('123-4');
    expect(out.caret).toBe(4);
  });

  it('caret skipping non-matching chars lands just after the next consumed output position', () => {
    // Raw "1a2" caret=2 (between 'a' and '2') with mask "000".
    // 'a' is rejected. Output is "12". The cursor lands at the
    // position whose post-process rawIdx >= caret — that's
    // position 1 (consumed '1' → rawIdx=1) … nope, 1<2 …
    // continue to position 2 (consumed '2' AFTER skipping 'a',
    // rawIdx=3 >= 2). Caret lands AFTER position 1 in the
    // output = position 2 (end). The user can left-arrow back
    // if they want it before '2'.
    const out = applyMaskWithCaret('1a2', 2, '000');
    expect(out.value).toBe('12');
    expect(out.caret).toBe(2);
  });

  it('caret-after-rejected-char-with-no-replacement clamps to end of consumed output', () => {
    // Raw "1a" caret=2 (after 'a', the rejected char). Output
    // is "1". Caret should clamp to end of output = 1.
    const out = applyMaskWithCaret('1a', 2, '000');
    expect(out.value).toBe('1');
    expect(out.caret).toBe(1);
  });

  it('caret within a run of literals snaps just past them', () => {
    // raw="123-45" caret at 4 (just after the dash) with mask
    // "000-00". Walk: '1','2','3' consumed → out="123"; literal
    // '-' inserted → out="123-", and the user's '-' at raw[3]
    // gets consumed (rawIdx → 4). At rawIdx=4 we hit caret=4 →
    // outCaret = 4.
    const out = applyMaskWithCaret('123-45', 4, '000-00');
    expect(out.value).toBe('123-45');
    expect(out.caret).toBe(4);
  });

  it('uppercase round-trip preserves caret', () => {
    const out = applyMaskWithCaret('abc', 2, 'aaa', { uppercase: true });
    expect(out.value).toBe('ABC');
    expect(out.caret).toBe(2);
  });

  it('empty mask passes raw + caret through unchanged', () => {
    const out = applyMaskWithCaret('hello', 3, '');
    expect(out.value).toBe('hello');
    expect(out.caret).toBe(3);
  });

  it('caret beyond raw length clamps to end of output', () => {
    const out = applyMaskWithCaret('12', 99, '000-00');
    expect(out.value).toBe('12');
    expect(out.caret).toBe(2);
  });
});
