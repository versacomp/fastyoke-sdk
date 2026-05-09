/**
 * Phase 41.4 (LCAP) — pure number + timestamp formatters.
 *
 * No date library dependency. Currency / percent / decimal use
 * native `Intl.NumberFormat`. Timestamp formatting uses
 * `Intl.DateTimeFormat` per-token, then concatenates literal
 * characters from the format template. The supported token
 * vocabulary is a dayjs/date-fns subset — enough to cover the
 * common cases (`MMM dd, yyyy`, `yyyy-MM-dd HH:mm`,
 * `MMMM d, yyyy h:mm a`) without pulling 7 KB of dayjs into the
 * SDK base bundle.
 *
 * All helpers are pure: same inputs → same string. No I/O, no
 * locale negotiation beyond what the caller passes in. The host
 * (Page Designer / `<SmartField />`) is responsible for resolving
 * the negotiated locale: tenant `BrandingConfig.locale` →
 * `navigator.language` → `'en-US'` fallback.
 */

// ---------------------------------------------------------------------------
// Locale resolution
// ---------------------------------------------------------------------------

/** Resolve the locale the host should use for Intl formatters.
 *  v0 honors a caller-supplied locale (Phase 41.5 wires
 *  BrandingConfig.locale through), then falls back to
 *  `navigator.language`, then `'en-US'`. SSR-safe: when
 *  `navigator` is undefined (Node / `@fastyoke/next` SSR shell),
 *  the navigator branch is skipped. */
export function resolveLocale(prefer?: string | null): string {
  if (typeof prefer === 'string' && prefer.length > 0) return prefer;
  if (typeof navigator !== 'undefined' && typeof navigator.language === 'string') {
    return navigator.language;
  }
  return 'en-US';
}

// ---------------------------------------------------------------------------
// Number formatting
// ---------------------------------------------------------------------------

/** Format a numeric value per the row's ui_config:
 *
 *   - `@ui/component = "currency"` → Intl currency style with
 *     `@ui/currency_code` (default `USD`).
 *   - `@ui/component = "percent"` → Intl percent style; storage
 *     stays decimal (`0.07` → `7%`).
 *   - `@ui/decimal_places` (number) clamps minimum + maximum
 *     fraction digits.
 *   - `@ui/use_separators = false` disables `useGrouping`.
 *
 *  Non-numeric `value` returns the empty string so display
 *  surfaces fall back gracefully to whatever fallback they show
 *  for missing data. */
export function formatNumber(
  value: unknown,
  uiConfig: Record<string, unknown>,
  locale?: string,
): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '';
  const slug =
    typeof uiConfig['@ui/component'] === 'string'
      ? (uiConfig['@ui/component'] as string)
      : 'number';
  const useGrouping = uiConfig['@ui/use_separators'] !== false;
  const decimalPlaces =
    typeof uiConfig['@ui/decimal_places'] === 'number'
      ? (uiConfig['@ui/decimal_places'] as number)
      : null;

  const baseOptions: Intl.NumberFormatOptions = {
    useGrouping,
  };
  if (decimalPlaces !== null) {
    baseOptions.minimumFractionDigits = decimalPlaces;
    baseOptions.maximumFractionDigits = decimalPlaces;
  }

  if (slug === 'currency') {
    const currency =
      typeof uiConfig['@ui/currency_code'] === 'string'
        ? (uiConfig['@ui/currency_code'] as string)
        : 'USD';
    return new Intl.NumberFormat(resolveLocale(locale), {
      ...baseOptions,
      style: 'currency',
      currency,
    }).format(value);
  }
  if (slug === 'percent') {
    return new Intl.NumberFormat(resolveLocale(locale), {
      ...baseOptions,
      style: 'percent',
    }).format(value);
  }
  return new Intl.NumberFormat(resolveLocale(locale), baseOptions).format(value);
}

// ---------------------------------------------------------------------------
// Timestamp formatting
// ---------------------------------------------------------------------------

/** Tokens supported by the formatter. The order in the regex is
 *  longest-first so `MMMM` matches before `MMM` etc. */
const TOKEN_GLOBAL_RE = /YYYY|yyyy|YY|yy|MMMM|MMM|MM|M|DD|dd|D|d|HH|H|hh|h|mm|ss|a|A/g;

interface TokenFormat {
  type: 'token' | 'literal';
  value: string;
}

/** Tokenize a dayjs-style format string into alternating token /
 *  literal segments. Pure; deterministic. */
export function tokenizeFormat(format: string): TokenFormat[] {
  const out: TokenFormat[] = [];
  let lastIdx = 0;
  for (const match of format.matchAll(TOKEN_GLOBAL_RE)) {
    const idx = match.index ?? 0;
    if (idx > lastIdx) {
      out.push({ type: 'literal', value: format.slice(lastIdx, idx) });
    }
    out.push({ type: 'token', value: match[0] });
    lastIdx = idx + match[0].length;
  }
  if (lastIdx < format.length) {
    out.push({ type: 'literal', value: format.slice(lastIdx) });
  }
  return out;
}

/** Map a single token to the Intl.DateTimeFormat options that
 *  produce ONE part for that token. The formatter then reads
 *  `formatToParts` and pulls out the relevant part. Returning
 *  `null` means "the token isn't supported"; the formatter
 *  passes it through verbatim. */
function tokenOptions(
  token: string,
): { options: Intl.DateTimeFormatOptions; partType: Intl.DateTimeFormatPartTypes } | null {
  switch (token) {
    case 'YYYY':
    case 'yyyy':
      return { options: { year: 'numeric' }, partType: 'year' };
    case 'YY':
    case 'yy':
      return { options: { year: '2-digit' }, partType: 'year' };
    case 'MMMM':
      return { options: { month: 'long' }, partType: 'month' };
    case 'MMM':
      return { options: { month: 'short' }, partType: 'month' };
    case 'MM':
      return { options: { month: '2-digit' }, partType: 'month' };
    case 'M':
      return { options: { month: 'numeric' }, partType: 'month' };
    case 'DD':
    case 'dd':
      return { options: { day: '2-digit' }, partType: 'day' };
    case 'D':
    case 'd':
      return { options: { day: 'numeric' }, partType: 'day' };
    case 'HH':
      return {
        options: { hour: '2-digit', hour12: false },
        partType: 'hour',
      };
    case 'H':
      return {
        options: { hour: 'numeric', hour12: false },
        partType: 'hour',
      };
    case 'hh':
      return {
        options: { hour: '2-digit', hour12: true },
        partType: 'hour',
      };
    case 'h':
      return {
        options: { hour: 'numeric', hour12: true },
        partType: 'hour',
      };
    case 'mm':
      return { options: { minute: '2-digit' }, partType: 'minute' };
    case 'ss':
      return { options: { second: '2-digit' }, partType: 'second' };
    case 'a':
    case 'A':
      return {
        options: { hour: 'numeric', hour12: true },
        partType: 'dayPeriod',
      };
    default:
      return null;
  }
}

/** Format a Date with a single token, using `formatToParts` so we
 *  get the locale-correct variant + extract just the relevant
 *  part. Honors timezone when supplied. */
function formatToken(
  date: Date,
  token: string,
  locale: string,
  timezone?: string,
): string {
  const spec = tokenOptions(token);
  if (!spec) return token; // unknown token → pass through literally
  const opts: Intl.DateTimeFormatOptions = { ...spec.options };
  if (typeof timezone === 'string' && timezone.length > 0) {
    opts.timeZone = timezone;
  }
  const fmt = new Intl.DateTimeFormat(locale, opts);
  for (const part of fmt.formatToParts(date)) {
    if (part.type === spec.partType) {
      // Token `A` is upper-case AM/PM; `a` keeps the locale's
      // default rendering (typically lower-case for `en-US`).
      if (token === 'A') return part.value.toUpperCase();
      if (token === 'a') return part.value.toLowerCase();
      return part.value;
    }
  }
  return '';
}

/** Format a timestamp value per the row's ui_config:
 *
 *   - `@ui/date_format` (string) — dayjs-style token template.
 *     When absent, falls back to the locale's short date.
 *   - `@ui/timezone` (string) — IANA tz applied to every token.
 *   - `@ui/include_time` is honored only by the input-component
 *     selection (DatePicker → datetime-local); the *display*
 *     formatter respects whatever tokens the caller specified.
 *
 *  Accepts ISO-8601 strings (storage shape) or numeric epoch ms.
 *  Invalid input returns `''`. */
export function formatTimestamp(
  value: unknown,
  uiConfig: Record<string, unknown>,
  locale?: string,
): string {
  if (value == null || value === '') return '';
  let date: Date;
  if (value instanceof Date) {
    date = value;
  } else if (typeof value === 'string') {
    const parsed = Date.parse(value);
    if (Number.isNaN(parsed)) return '';
    date = new Date(parsed);
  } else if (typeof value === 'number') {
    date = new Date(value);
  } else {
    return '';
  }

  const dateFormat =
    typeof uiConfig['@ui/date_format'] === 'string'
      ? (uiConfig['@ui/date_format'] as string)
      : null;
  const timezone =
    typeof uiConfig['@ui/timezone'] === 'string'
      ? (uiConfig['@ui/timezone'] as string)
      : undefined;
  const resolved = resolveLocale(locale);

  if (!dateFormat) {
    // No template → fall back to the locale's default short
    // date; honor include_time when present.
    const includeTime = uiConfig['@ui/include_time'] === true;
    const opts: Intl.DateTimeFormatOptions = {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    };
    if (includeTime) {
      opts.hour = '2-digit';
      opts.minute = '2-digit';
    }
    if (timezone) opts.timeZone = timezone;
    return new Intl.DateTimeFormat(resolved, opts).format(date);
  }

  // Tokenize, then format each token + concatenate literals.
  const parts = tokenizeFormat(dateFormat);
  let out = '';
  for (const part of parts) {
    if (part.type === 'literal') {
      out += part.value;
    } else {
      out += formatToken(date, part.value, resolved, timezone);
    }
  }
  return out;
}
