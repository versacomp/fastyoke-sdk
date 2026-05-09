/**
 * @vitest-environment node
 *
 * Phase 41.4 — formatNumber + formatTimestamp + zod refinement
 * tests. Pure helpers; no React.
 */
import { describe, expect, it } from 'vitest';

import {
  formatNumber,
  formatTimestamp,
  resolveLocale,
  tokenizeFormat,
} from '../react/lcap/format';
import { entityAnnotationToZod } from '../types/entityAnnotation';

describe('formatNumber — currency', () => {
  it('USD with default decimals → $1,234.56', () => {
    const out = formatNumber(1234.56, { '@ui/component': 'currency' }, 'en-US');
    // Intl uses U+00A0 between symbol and digits in some locales;
    // 'en-US' attaches the $ tightly. Allow either.
    expect(out).toMatch(/^\$1,234\.56$/);
  });

  it('JPY zero-decimal currency renders without fraction digits', () => {
    const out = formatNumber(
      1234,
      { '@ui/component': 'currency', '@ui/currency_code': 'JPY' },
      'en-US',
    );
    // JPY's intrinsic minimum/maximum fraction digits are 0 in the
    // CLDR; Intl honors that without explicit decimal_places.
    expect(out).toMatch(/¥1,234$/);
  });

  it('separators=false removes the thousands separator', () => {
    const out = formatNumber(
      1234.5,
      { '@ui/component': 'currency', '@ui/currency_code': 'USD', '@ui/use_separators': false },
      'en-US',
    );
    expect(out).toMatch(/^\$1234\.50$/);
  });

  it('decimal_places=4 expands USD to 4 fraction digits', () => {
    const out = formatNumber(
      1.07,
      {
        '@ui/component': 'currency',
        '@ui/currency_code': 'USD',
        '@ui/decimal_places': 4,
      },
      'en-US',
    );
    expect(out).toMatch(/^\$1\.0700$/);
  });

  it('missing currency_code falls back to USD', () => {
    const out = formatNumber(1.5, { '@ui/component': 'currency' }, 'en-US');
    expect(out.startsWith('$')).toBe(true);
  });
});

describe('formatNumber — percent', () => {
  it('0.07 → 7%', () => {
    expect(formatNumber(0.07, { '@ui/component': 'percent' }, 'en-US')).toBe('7%');
  });

  it('decimal_places=2 → 7.00%', () => {
    expect(
      formatNumber(
        0.07,
        { '@ui/component': 'percent', '@ui/decimal_places': 2 },
        'en-US',
      ),
    ).toBe('7.00%');
  });
});

describe('formatTimestamp', () => {
  it('"MMM dd, yyyy" template renders short month + day + year', () => {
    const out = formatTimestamp(
      '2026-04-25T12:00:00Z',
      { '@ui/date_format': 'MMM dd, yyyy', '@ui/timezone': 'UTC' },
      'en-US',
    );
    expect(out).toBe('Apr 25, 2026');
  });

  it('honors @ui/timezone for cross-day boundary cases', () => {
    // 02:30 UTC on the 26th is 19:30 PT on the 25th.
    const out = formatTimestamp(
      '2026-04-26T02:30:00Z',
      {
        '@ui/date_format': 'yyyy-MM-dd HH:mm',
        '@ui/timezone': 'America/Los_Angeles',
      },
      'en-US',
    );
    expect(out).toBe('2026-04-25 19:30');
  });

  it('include_time + no template falls back to locale short date+time', () => {
    const out = formatTimestamp(
      '2026-04-25T12:00:00Z',
      { '@ui/include_time': true, '@ui/timezone': 'UTC' },
      'en-US',
    );
    // 'en-US' Intl short: 04/25/2026, 12:00 PM
    expect(out).toMatch(/04\/25\/2026/);
    expect(out).toMatch(/12:00/);
  });

  it('returns empty string for malformed input', () => {
    expect(formatTimestamp('not-a-date', {}, 'en-US')).toBe('');
    expect(formatTimestamp(null, {}, 'en-US')).toBe('');
  });

  it('tokenizes mixed literal + token segments', () => {
    expect(tokenizeFormat('yyyy-MM-dd')).toEqual([
      { type: 'token', value: 'yyyy' },
      { type: 'literal', value: '-' },
      { type: 'token', value: 'MM' },
      { type: 'literal', value: '-' },
      { type: 'token', value: 'dd' },
    ]);
  });
});

describe('resolveLocale', () => {
  it('prefers explicit caller-supplied locale', () => {
    expect(resolveLocale('fr-FR')).toBe('fr-FR');
  });

  it('falls back to en-US when no preference and no navigator', () => {
    // Node test env doesn't ship `navigator` for this @vitest-
    // environment node case, so the en-US fallback path runs.
    expect(resolveLocale()).toBe('en-US');
  });
});

// ---------------------------------------------------------------------------
// Phase 41.4 zod-refinement extensions.
// ---------------------------------------------------------------------------

describe('entityAnnotationToZod — Phase 41.4 refinements', () => {
  it('percent leaf rejects values outside [0, 1] by default', () => {
    const schema = entityAnnotationToZod([
      {
        field_key: 'rate',
        required: true,
        field_type: 'number',
        ui_config_json: { '@ui/component': 'percent' },
      },
    ]);
    expect(schema.safeParse({ rate: 0.07 }).success).toBe(true);
    expect(schema.safeParse({ rate: 7 }).success).toBe(false);
    expect(schema.safeParse({ rate: -0.1 }).success).toBe(false);
  });

  it('explicit min/max on percent annotation overrides defaults', () => {
    const schema = entityAnnotationToZod([
      {
        field_key: 'growth',
        required: true,
        field_type: 'number',
        min: 0,
        max: 5,
        ui_config_json: { '@ui/component': 'percent' },
      },
    ]);
    // Up to 500% is legal for explicit-bounded percent annotation.
    expect(schema.safeParse({ growth: 3 }).success).toBe(true);
  });

  it('decimal_places=2 rejects extra precision', () => {
    const schema = entityAnnotationToZod([
      {
        field_key: 'amount',
        required: true,
        field_type: 'number',
        ui_config_json: { '@ui/component': 'currency', '@ui/decimal_places': 2 },
      },
    ]);
    expect(schema.safeParse({ amount: 1.23 }).success).toBe(true);
    expect(schema.safeParse({ amount: 1.234 }).success).toBe(false);
  });
});
