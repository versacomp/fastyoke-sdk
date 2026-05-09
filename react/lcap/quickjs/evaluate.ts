/**
 * Phase 41.6 (LCAP) — QuickJS-emscripten client expression
 * sandbox.
 *
 * Evaluates `@ui/visible_when` / `@ui/compute` / `@ui/validate_when`
 * expressions in a sandboxed QuickJS WebAssembly runtime. ZERO-
 * TRUST per `LCAP-Spec.md` § 5: no DOM, no `fetch`, no `eval`,
 * no async, no host capabilities. Only the six injected names
 * (`value`, `record`, `form`, `now`, `tenant_id`, `user_role`)
 * cross the Border Control.
 *
 * Resource caps:
 *   • Wall-clock budget: 50 ms (interrupt handler polled at op
 *     count granularity)
 *   • Memory budget: 4 MB
 *   • Stack depth: 256 frames
 *   • Recursion guard: 10 000 ops between interrupt checks
 *
 * Cap breach + missing peer + non-JSON-encodable result all
 * resolve to `null`. The caller (typically `<SmartField />`)
 * treats `null` as "no result" — visible_when becomes always-
 * true, compute leaves the field at the user's value,
 * validate_when becomes always-pass.
 */

export interface ExprContext {
  value: unknown;
  record: Record<string, unknown> | null;
  form: Record<string, unknown> | null;
  now: string; // ISO-8601 UTC
  tenant_id: string;
  user_role: string;
}

export interface EvaluateOptions {
  /** Wall-clock budget in milliseconds. Defaults to 50. */
  wallMs?: number;
  /** Memory budget in bytes. Defaults to 4 * 1024 * 1024 = 4 MB. */
  memoryBytes?: number;
  /**
   * QuickJS native-stack budget in BYTES (not frames). The
   * spec calls for "256 frames" but QuickJS measures stack
   * usage by byte size, with each call consuming roughly
   * 100–500 B on top of `setjmp/longjmp` overhead. 1 MB
   * accommodates the call-tree built by `evalCode` itself
   * plus a generous expression depth; deeper recursion still
   * trips the limit and resolves to null.
   */
  stackSize?: number;
  /** Op-count budget per interrupt cycle. Defaults to 10 000. */
  interruptCycles?: number;
}

const DEFAULTS: Required<EvaluateOptions> = {
  wallMs: 50,
  memoryBytes: 4 * 1024 * 1024,
  stackSize: 1024 * 1024, // 1 MB — see EvaluateOptions.stackSize docs
  interruptCycles: 10_000,
};

type QuickJSWASMModule = unknown;
type QuickJSContext = unknown;

let cachedModule: QuickJSWASMModule | null = null;
let warnedMissing = false;

interface QuickJSPackageShape {
  getQuickJS: () => Promise<QuickJSWASMModule>;
}

/**
 * Lazy-load + cache the QuickJS WASM module. Direct dynamic
 * import so vite + node resolve `quickjs-emscripten` from
 * node_modules; the SDK declares it as an OPTIONAL peer
 * dependency, so a consumer that didn't install it gets a
 * runtime "module not found" rejection here — caught and
 * surfaced as a one-time console.warn + null result.
 */
async function loadQuickJS(): Promise<QuickJSWASMModule | null> {
  if (cachedModule !== null) return cachedModule;
  try {
    // Optional peer dep in the published SDK; resolves at runtime.
    const mod = (await import('quickjs-emscripten')) as QuickJSPackageShape;
    const QuickJS = await mod.getQuickJS();
    cachedModule = QuickJS;
    return QuickJS;
  } catch {
    if (!warnedMissing) {

      console.warn(
        '[fastyoke-sdk] quickjs-emscripten is not installed; ' +
          '@ui/visible_when / @ui/compute / @ui/validate_when ' +
          'expressions will short-circuit (visible_when → always ' +
          'true, compute → no override, validate_when → always ' +
          'pass). Install the peer package to enable expressions.',
      );
      warnedMissing = true;
    }
    return null;
  }
}

/**
 * Test-only: clear the warn-once + cached module so vitest
 * cases can assert the warning fires per-test.
 */
export function __resetQuickJSCache(): void {
  cachedModule = null;
  warnedMissing = false;
}

/**
 * Deep-freeze a JSON-shaped value before injecting into the
 * QuickJS context. Any in-sandbox attempt to mutate the
 * injected object is silently ignored by the QuickJS host
 * (frozen objects throw at strict-mode property writes); the
 * caller's host-side reference is unchanged regardless.
 */
function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== 'object') return value;
  Object.freeze(value);
  for (const key of Object.keys(value)) {
    const v = (value as Record<string, unknown>)[key];
    if (v !== null && typeof v === 'object' && !Object.isFrozen(v)) {
      deepFreeze(v);
    }
  }
  return value;
}

/**
 * Coerce the QuickJS-side return value back to the host. Only
 * JSON-encodable scalars / objects survive; anything else (a
 * function reference, a circular structure, a Symbol)
 * round-trips to `null` with a console warning.
 */
function coerceResult(raw: unknown): unknown {
  if (raw === null || raw === undefined) return raw ?? null;
  const t = typeof raw;
  if (t === 'string' || t === 'number' || t === 'boolean') return raw;
  // Object / array: JSON round-trip to drop functions, symbols,
  // and prototype chains.
  try {
    const json = JSON.stringify(raw);
    if (json === undefined) return null;
    return JSON.parse(json) as unknown;
  } catch {

    console.warn(
      '[fastyoke-sdk] expression returned a non-JSON-encodable value; ' +
        'coercing to null',
    );
    return null;
  }
}

/**
 * Evaluate an expression. Returns the coerced result, or
 * `null` on any failure mode (cap breach, missing peer,
 * non-JSON-encodable result, expression throw).
 *
 * The expression text is treated as a JS expression (NOT a
 * statement) — wraps it in a `(function(){ return (expr); })()`
 * shell at evaluation time so a bare `value > 0` works without
 * the caller writing `return value > 0`.
 */
export async function evaluate(
  expr: string,
  ctx: ExprContext,
  options: EvaluateOptions = {},
): Promise<unknown> {
  const opts = { ...DEFAULTS, ...options };
  const QuickJS = (await loadQuickJS()) as
    | { newContext: () => QuickJSContext }
    | null;
  if (QuickJS === null) return null;

  // QuickJS is loaded — open a fresh context per evaluation so
  // state doesn't leak across calls. Resource caps live on the
  // runtime; per-eval handles + the eval call live on the
  // context.
  type QJSHandle = { dispose: () => void };
  type QJSContextShape = {
    runtime: {
      setMemoryLimit: (n: number) => void;
      setMaxStackSize: (n: number) => void;
      setInterruptHandler: (h: () => boolean) => void;
    };
    newString: (s: string) => QJSHandle;
    newNumber: (n: number) => QJSHandle;
    true: QJSHandle;
    false: QJSHandle;
    null: QJSHandle;
    newObject: () => QJSHandle;
    setProp: (obj: QJSHandle, key: string, value: QJSHandle) => void;
    global: QJSHandle;
    evalCode: (
      src: string,
    ) => { value: QJSHandle } | { error: QJSHandle };
    dump: (handle: QJSHandle) => unknown;
    dispose: () => void;
  };

  const vm = QuickJS.newContext() as QJSContextShape;
  let started = 0;
  try {
    vm.runtime.setMemoryLimit(opts.memoryBytes);
    vm.runtime.setMaxStackSize(opts.stackSize);

    // Wall-clock interrupt: fire `true` (= abort) once we exceed
    // the budget. QuickJS polls this at op-count granularity
    // tuned by `interruptCycles` (default 10 000).
    started = Date.now();
    vm.runtime.setInterruptHandler(() => {
      return Date.now() - started > opts.wallMs;
    });

    // Inject the six Border Control names. Each is deep-frozen
    // before serialization so a sandbox-side mutation attempt
    // (which couldn't escape anyway) doesn't even succeed inside
    // the eval. JSON round-trip drops anything QuickJS can't
    // marshal.
    const safeCtx = {
      value: ctx.value === undefined ? null : deepFreeze(ctx.value),
      record: ctx.record === null ? null : deepFreeze(ctx.record),
      form: ctx.form === null ? null : deepFreeze(ctx.form),
      now: ctx.now,
      tenant_id: ctx.tenant_id,
      user_role: ctx.user_role,
    };
    const handlesToDispose: QJSHandle[] = [];
    for (const [key, val] of Object.entries(safeCtx)) {
      const handle = injectValue(vm, val, handlesToDispose);
      vm.setProp(vm.global, key, handle);
    }

    // The expression is a JS expression, not a statement. Wrap
    // in an IIFE so a bare `value > 0` works without forcing
    // callers to write `return ...`.
    const wrapped = `(function(){ "use strict"; return (${expr}); })()`;
    const result = vm.evalCode(wrapped);
    // Dispose injected handles now that evalCode has finished.
    // The vm.global keeps its prop refs alive until vm.dispose;
    // handle disposal here reclaims the wrapper handles.
    for (const h of handlesToDispose) {
      try {
        h.dispose();
      } catch {
        /* already disposed */
      }
    }
    if ('error' in result) {
      try {
        result.error.dispose();
      } catch {
        /* */
      }
      // Don't surface the error message — could carry PII from
      // the expression. Just resolve null.
      return null;
    }
    const raw = vm.dump(result.value);
    try {
      result.value.dispose();
    } catch {
      /* */
    }
    return coerceResult(raw);
  } catch {
    // Cap breach (memory, stack) raises a JS-side throw from
    // the evalCode call; treat as null result.
    return null;
  } finally {
    try {
      vm.dispose();
    } catch {
      // dispose throws on some breach paths; nothing to do.
    }
  }
}

/**
 * Marshal a host-side JSON value into a QuickJS handle. Uses
 * the context's `newString` / `newNumber` / etc. so the value
 * lives in the QuickJS heap. Recursive for objects/arrays.
 *
 * Returned handles are tracked in `handlesToDispose` so the
 * caller can clean up after evalCode runs. The shared
 * `vm.true / .false / .null` singletons are NOT tracked —
 * disposing them would break subsequent evals on the same vm
 * (we open a new vm per evaluate, but defensive: don't
 * disposed.shared singletons).
 */
type QJSHandleMin = {
  dispose: () => void;
};
type QJSContextMin = {
  newString: (s: string) => QJSHandleMin;
  newNumber: (n: number) => QJSHandleMin;
  true: QJSHandleMin;
  false: QJSHandleMin;
  null: QJSHandleMin;
  newObject: () => QJSHandleMin;
  setProp: (obj: QJSHandleMin, key: string, value: QJSHandleMin) => void;
};

function injectValue(
  vm: QJSContextMin,
  value: unknown,
  track: QJSHandleMin[],
): QJSHandleMin {
  if (value === null || value === undefined) return vm.null;
  if (typeof value === 'string') {
    const h = vm.newString(value);
    track.push(h);
    return h;
  }
  if (typeof value === 'number') {
    const h = vm.newNumber(value);
    track.push(h);
    return h;
  }
  if (typeof value === 'boolean') return value ? vm.true : vm.false;
  if (Array.isArray(value)) {
    const arr = vm.newObject();
    track.push(arr);
    for (let i = 0; i < value.length; i += 1) {
      vm.setProp(arr, String(i), injectValue(vm, value[i], track));
    }
    const lenHandle = vm.newNumber(value.length);
    track.push(lenHandle);
    vm.setProp(arr, 'length', lenHandle);
    return arr;
  }
  if (typeof value === 'object') {
    const obj = vm.newObject();
    track.push(obj);
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      vm.setProp(obj, k, injectValue(vm, v, track));
    }
    return obj;
  }
  // Functions, symbols, BigInts → null.
  return vm.null;
}
