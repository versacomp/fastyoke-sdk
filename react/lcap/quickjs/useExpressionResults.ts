/**
 * Phase 41.6 (LCAP) — React hook that evaluates expression
 * annotations via the QuickJS sandbox and returns the cooked
 * results SmartField uses to alter rendering.
 *
 *   • visible_when=false → `visible = false` → SmartField
 *     returns null (field hidden).
 *   • compute returns a value → `computedValue = <value>` →
 *     SmartField shows that value with the field locked
 *     read-only.
 *   • validate_when=false → `validateError = "<message>"` →
 *     SmartField renders an inline error span below the field.
 *
 * The QuickJS module is lazy-loaded once per page-load and
 * cached. The hook fires evaluation in a useEffect so the
 * component renders synchronously first (with no expression
 * applied) and updates once the async chain resolves. Any
 * cap breach / missing peer / non-JSON-encodable result
 * resolves to `null` from `evaluate()` and is treated as
 * "no result" — visible_when becomes always-true, compute
 * leaves the field at the user's value, validate_when
 * becomes always-pass.
 */
import { useEffect, useState } from 'react';
import type { ExprContext } from './evaluate';

export interface ExpressionResults {
  /** When false, SmartField returns null (field hidden). */
  visible: boolean;
  /** When defined, overrides the user's value AND locks the
   *  field read-only. `undefined` means no override. */
  computedValue: unknown | undefined;
  /** When non-null, SmartField renders this as an inline
   *  validation error span below the field. */
  validateError: string | null;
}

const INITIAL: ExpressionResults = {
  visible: true,
  computedValue: undefined,
  validateError: null,
};

interface ExprKeys {
  visibleWhen: string | null;
  compute: string | null;
  validateWhen: string | null;
}

function readExprKeys(uiConfig: Record<string, unknown>): ExprKeys {
  return {
    visibleWhen:
      typeof uiConfig['@ui/visible_when'] === 'string'
        ? (uiConfig['@ui/visible_when'] as string)
        : null,
    compute:
      typeof uiConfig['@ui/compute'] === 'string'
        ? (uiConfig['@ui/compute'] as string)
        : null,
    validateWhen:
      typeof uiConfig['@ui/validate_when'] === 'string'
        ? (uiConfig['@ui/validate_when'] as string)
        : null,
  };
}

export interface UseExpressionResultsArgs {
  /** Resolved ui_config (already merged across annotation +
   *  override) — read by `readExprKeys`. */
  uiConfig: Record<string, unknown>;
  /** Whether evaluation should fire. Caller passes
   *  `hasExpression && tier >= team` so this hook stays
   *  side-effect-free in the gated-out case. */
  enabled: boolean;
  /** The Border Control context — value, record, form,
   *  tenant_id, user_role. `now` is stamped per-evaluation
   *  by the hook. */
  contextSource: {
    value: unknown;
    record?: Record<string, unknown> | null;
    form?: Record<string, unknown> | null;
    tenant_id?: string;
    user_role?: string;
  };
}

/**
 * Lazy-load the evaluator on first use and cache the resolved
 * function so subsequent evaluations don't re-pay the dynamic
 * import. The QuickJS module itself caches inside the
 * evaluator (`loadQuickJS`).
 */
let cachedEvaluate:
  | ((expr: string, ctx: ExprContext) => Promise<unknown>)
  | null = null;

async function loadEvaluate(): Promise<
  ((expr: string, ctx: ExprContext) => Promise<unknown>) | null
> {
  if (cachedEvaluate !== null) return cachedEvaluate;
  try {
    const mod = await import('./evaluate');
    cachedEvaluate = mod.evaluate;
    return cachedEvaluate;
  } catch {
    return null;
  }
}

/**
 * Test-only: clear the cached evaluate handle.
 */
export function __resetExpressionCache(): void {
  cachedEvaluate = null;
}

export function useExpressionResults(
  args: UseExpressionResultsArgs,
): ExpressionResults {
  const { uiConfig, enabled, contextSource } = args;
  const [results, setResults] = useState<ExpressionResults>(INITIAL);

  // Stable JSON of the keys + relevant context — lets the
  // useEffect dependency array stay primitive without
  // re-firing every render due to object identity churn.
  const keysJson = JSON.stringify(readExprKeys(uiConfig));
  const ctxJson = JSON.stringify({
    value: contextSource.value ?? null,
    record: contextSource.record ?? null,
    form: contextSource.form ?? null,
    tenant_id: contextSource.tenant_id ?? '',
    user_role: contextSource.user_role ?? '',
  });

  useEffect(() => {
    if (!enabled) {
      setResults(INITIAL);
      return;
    }
    const keys = readExprKeys(uiConfig);
    const noKeys =
      keys.visibleWhen === null &&
      keys.compute === null &&
      keys.validateWhen === null;
    if (noKeys) {
      setResults(INITIAL);
      return;
    }
    let cancelled = false;
    void (async () => {
      const evaluate = await loadEvaluate();
      if (cancelled) return;
      if (evaluate === null) {
        setResults(INITIAL);
        return;
      }
      const ctx: ExprContext = {
        value: contextSource.value === undefined ? null : contextSource.value,
        record: contextSource.record ?? null,
        form: contextSource.form ?? null,
        now: new Date().toISOString(),
        tenant_id: contextSource.tenant_id ?? '',
        user_role: contextSource.user_role ?? '',
      };

      const next: ExpressionResults = { ...INITIAL };

      if (keys.visibleWhen !== null) {
        const r = await evaluate(keys.visibleWhen, ctx);
        // Treat any null / undefined / falsey-non-boolean as
        // "no result → render visible". Only an explicit
        // `false` hides the field.
        next.visible = r === false ? false : true;
      }

      if (keys.compute !== null) {
        const r = await evaluate(keys.compute, ctx);
        // null result from evaluate() means cap breach or
        // missing peer; leave the field at the user's value.
        if (r !== null) {
          next.computedValue = r;
        }
      }

      if (keys.validateWhen !== null) {
        const r = await evaluate(keys.validateWhen, ctx);
        if (r === false) {
          next.validateError = 'Validation expression rejected this value.';
        }
      }

      if (!cancelled) setResults(next);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, keysJson, ctxJson]);

  return results;
}
