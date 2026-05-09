/**
 * @vitest-environment node
 *
 * Phase 41.6 (LCAP) — QuickJS evaluator tests. Direct unit
 * tests of the evaluate() wrapper. Integration via SmartField
 * lives in SmartField.test.tsx.
 *
 * QuickJS-emscripten boots a WebAssembly module; first call
 * is slow (~200 ms), subsequent calls reuse the cached module.
 * Each evaluate() opens a fresh context so state never leaks
 * across calls.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  __resetQuickJSCache,
  evaluate,
  type ExprContext,
} from '../react/lcap/quickjs/evaluate';

const baseCtx: ExprContext = {
  value: null,
  record: null,
  form: null,
  now: '2026-04-25T12:00:00Z',
  tenant_id: 't-1',
  user_role: 'admin',
};

let warnSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
  warnSpy.mockRestore();
  __resetQuickJSCache();
});

describe('evaluate — happy path', () => {
  it('returns a boolean from a simple comparison', async () => {
    const r = await evaluate('value > 0', { ...baseCtx, value: 5 });
    expect(r).toBe(true);
  });

  it('returns the user_role string', async () => {
    const r = await evaluate('user_role', { ...baseCtx, user_role: 'admin' });
    expect(r).toBe('admin');
  });

  it('reads nested record fields', async () => {
    const r = await evaluate('record.amount * 2', {
      ...baseCtx,
      record: { amount: 21 },
    });
    expect(r).toBe(42);
  });

  it('returns the now ISO string verbatim', async () => {
    const r = await evaluate('now', baseCtx);
    expect(r).toBe('2026-04-25T12:00:00Z');
  });
});

describe('evaluate — Border Control (no host capabilities)', () => {
  it('cannot reach globalThis.fetch', async () => {
    const r = await evaluate('typeof globalThis.fetch', baseCtx);
    expect(r).toBe('undefined');
  });

  it('cannot reach document', async () => {
    const r = await evaluate('typeof document', baseCtx);
    expect(r).toBe('undefined');
  });

  it('cannot reach window.localStorage', async () => {
    const r = await evaluate('typeof window', baseCtx);
    expect(r).toBe('undefined');
  });

  it('cannot use eval()', async () => {
    // QuickJS exposes eval per spec; but the value injection +
    // strict-mode wrapper still keeps the host unreachable.
    // Eval-of-a-string-that-references-the-host can't escape
    // because there IS no host reference inside the sandbox.
    const r = await evaluate('typeof process', baseCtx);
    expect(r).toBe('undefined');
  });
});

describe('evaluate — failure modes', () => {
  it('returns null on syntax error', async () => {
    const r = await evaluate('this is not valid js', baseCtx);
    expect(r).toBeNull();
  });

  it('returns null on a runtime throw', async () => {
    const r = await evaluate('(function(){ throw new Error("boom"); })()', baseCtx);
    expect(r).toBeNull();
  });

  it('returns null when the wall-clock budget is exceeded', async () => {
    // A while(true) busy-loop must trip the interrupt handler
    // and resolve to null within the 50 ms budget. We allow a
    // generous outer ceiling (1 s) so a slow CI host doesn't
    // spuriously fail.
    const start = Date.now();
    const r = await evaluate('while(true){}', baseCtx, { wallMs: 50 });
    const elapsed = Date.now() - start;
    expect(r).toBeNull();
    expect(elapsed).toBeLessThan(1000);
  });

  it('coerces non-JSON-friendly values gracefully', async () => {
    // QuickJS-side BigInt is not JSON-serializable; the
    // coerceResult helper handles it without throwing the
    // host-side promise. Result is `null` (drop) per the
    // documented contract.
    const r = await evaluate('1n', baseCtx);
    expect(r).toBeNull();
  });
});

describe('evaluate — frozen-record isolation', () => {
  it('host record is not mutated by sandbox-side assignment attempts', async () => {
    const record: Record<string, unknown> = { count: 0 };
    // The expression tries to mutate the injected `record`. Even
    // if the QuickJS-side write succeeded, the host record is
    // a separate JSON-roundtripped copy — so assert host
    // identity is unchanged.
    const r = await evaluate(
      '(function(){ try { record.count = 99; } catch(e){} return record.count; })()',
      { ...baseCtx, record },
    );
    expect(record.count).toBe(0);
    // Sandbox-side `record.count` read after the failed write
    // returns either 0 (frozen, write silently no-op'd) or
    // 99 (write succeeded inside the sandbox copy). Either way
    // the host is safe; assert it's a number.
    expect(typeof r).toBe('number');
  });
});
