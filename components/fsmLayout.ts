/**
 * Phase 39.2 (FsmViewer SDK) — duplicated elkjs layout helper.
 *
 * This is a deliberate duplicate of the admin's
 * `frontend/src/features/workflows/fsmAutoLayout.ts`. Importing the
 * admin module across the SDK boundary would leak admin-only
 * surfaces into the published `@fastyoke/sdk` tarball; the cost of
 * duplication (~100 LOC) is far smaller than the cost of leaking.
 *
 * The two files are kept structurally aligned by
 * `frontend/sdk/__tests__/fsmLayout.equivalence.test.ts`, which
 * imports both `LayoutPosition` types and asserts assignability in
 * both directions at type-check time.
 *
 * elkjs is dynamic-imported so the ~500 KiB bundle only loads on
 * routes that actually invoke layout. The Timeline-only export
 * never reaches this file (asserted structurally by 39.6).
 */

const NODE_WIDTH = 180;
const NODE_HEIGHT = 60;

export interface LayoutPosition {
  x: number;
  y: number;
}

export interface TransitionLike {
  from: string;
  to: string;
}

/** All four hierarchical flow directions. The viewer canvas defaults
 *  to 'LR' per locked decision #1; non-LR is exposed for callers
 *  that need vertical workflows. */
export type Direction = 'LR' | 'RL' | 'TB' | 'BT';

export interface LayoutOptions {
  direction: Direction;
}

function directionToElk(d: Direction): 'RIGHT' | 'LEFT' | 'DOWN' | 'UP' {
  switch (d) {
    case 'LR':
      return 'RIGHT';
    case 'RL':
      return 'LEFT';
    case 'TB':
      return 'DOWN';
    case 'BT':
      return 'UP';
  }
}

interface ElkInstance {
  layout(graph: unknown): Promise<{
    children?: Array<{ id: string; x?: number; y?: number }>;
  }>;
}

/**
 * Async elkjs-backed layout. Returns a `Record<stateLabel, {x, y}>`
 * map suitable for feeding into reactflow node `position`. Edges
 * referencing unknown states are skipped so elkjs doesn't add
 * phantom nodes. Any import or layout failure surfaces as an empty
 * map — callers fall back to grid placement.
 */
export async function layout(
  options: LayoutOptions,
  stateNames: readonly string[],
  transitions: readonly TransitionLike[],
): Promise<Record<string, LayoutPosition>> {
  if (stateNames.length === 0) return {};

  try {
    const mod = (await import('elkjs/lib/elk.bundled.js')) as unknown as {
      default: new () => ElkInstance;
    };
    const elk = new mod.default();

    const validNames = new Set(stateNames);
    const validTxs = transitions.filter(
      (t) => validNames.has(t.from) && validNames.has(t.to),
    );

    const graph = {
      id: 'root',
      layoutOptions: {
        'elk.algorithm': 'layered',
        'elk.direction': directionToElk(options.direction),
        'elk.spacing.nodeNode': '60',
        'elk.layered.spacing.nodeNodeBetweenLayers': '120',
      },
      children: stateNames.map((name) => ({
        id: name,
        width: NODE_WIDTH,
        height: NODE_HEIGHT,
      })),
      edges: validTxs.map((t, i) => ({
        id: `e${i}`,
        sources: [t.from],
        targets: [t.to],
      })),
    };

    const result = await elk.layout(graph);
    const out: Record<string, LayoutPosition> = {};
    for (const child of result.children ?? []) {
      out[child.id] = {
        x: Math.round(child.x ?? 0),
        y: Math.round(child.y ?? 0),
      };
    }
    return out;
  } catch {
    return {};
  }
}

/**
 * Convenience wrapper that pulls states + transitions out of a raw
 * schema_json. Tolerant of both the FsmBuilder-native
 * `states: Record<>` shape and the AI-generated `states: string[]`
 * shape — matches the admin layout helper's posture.
 */
export async function layoutFromSchema(
  options: LayoutOptions,
  rawSchemaJson: unknown,
): Promise<Record<string, LayoutPosition>> {
  const raw = rawSchemaJson as Record<string, unknown> | null | undefined;
  if (!raw || typeof raw !== 'object') return {};
  const rawStates = (raw as Record<string, unknown>).states;
  const states: string[] = Array.isArray(rawStates)
    ? rawStates.filter((s): s is string => typeof s === 'string')
    : rawStates && typeof rawStates === 'object'
      ? Object.keys(rawStates as Record<string, unknown>)
      : [];
  const rawTxs =
    ((raw as Record<string, unknown>).transitions as unknown[] | undefined) ??
    [];
  const transitions: TransitionLike[] = rawTxs
    .map((t) => t as Record<string, unknown>)
    .map((t) => ({
      from: typeof t.from === 'string' ? t.from : '',
      to: typeof t.to === 'string' ? t.to : '',
    }))
    .filter((t) => t.from !== '' && t.to !== '');
  return layout(options, states, transitions);
}
