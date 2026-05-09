/**
 * Phase 39 (FsmViewer SDK) — public types for the FsmTimeline /
 * FsmViewer surface.
 *
 * The viewer is transition-agnostic by design: hosts pass in a
 * pre-shaped `EntityState` (composed from `/tenant/jobs/:id` +
 * `event_log` on their side) and an `onTransitionRequest` callback
 * that maps the chosen target state to the host's wire vocabulary.
 * The viewer never fetches; never writes.
 */

/** Chronological entry in an entity's history. Mirrors the subset
 *  of `EventLogEntry` the viewer displays — declared locally so the
 *  Timeline export doesn't drag the full common.ts surface. */
export interface EntityHistoryEntry {
  from_state: string | null;
  to_state: string;
  event_type: string;
  timestamp: string;
  actor?: string | null;
  reason?: string | null;
}

/** Composed by the host app from `/tenant/jobs/:id` + the event_log
 *  endpoint before being handed to the viewer. */
export interface EntityState {
  current_state: string;
  history?: ReadonlyArray<EntityHistoryEntry>;
}

/** Structural subset of `SchemaDefinition` (from `@fastyoke/sdk`'s
 *  common.ts) that the viewer reads. Declared locally so the timeline
 *  export stays decoupled from the larger zod-schema surface — keeps
 *  the standalone bundle small for ISVs who only want the timeline. */
export interface ViewerTransition {
  from: string;
  to: string;
  event_type: string;
}

export interface ViewerSchema {
  initial_state: string;
  /** Tolerant of both `Record<state, unknown>` and `string[]` shapes —
   *  matches admin's `loadFromSchema` posture for AI-generated schemas. */
  states?: Record<string, unknown> | ReadonlyArray<string>;
  transitions?: ReadonlyArray<ViewerTransition>;
}

/** Operator action callback. Called with the target *state* (not the
 *  event_type) — the host's responsibility to translate via the
 *  schema's transitions list and fire the `POST /tenant/jobs/:id/
 *  transition` request. A rejected promise surfaces as a brief
 *  error highlight on the originating button.
 *
 *  Generic `Record<string, unknown>` payload for now — structured
 *  operator forms ("enter weight before advancing") are deferred per
 *  the Phase 39 plan. */
export type TransitionRequestHandler = (
  targetState: string,
  payload?: Record<string, unknown>,
) => Promise<void>;

/** Extracts the canonical state-name list from a `ViewerSchema`,
 *  tolerant of the two possible `states` shapes. The initial state
 *  is always included even when the `states` member is missing. */
export function viewerStateNames(schema: ViewerSchema): string[] {
  const set = new Set<string>();
  if (schema.initial_state) set.add(schema.initial_state);
  const s = schema.states;
  if (Array.isArray(s)) {
    for (const name of s) {
      if (typeof name === 'string') set.add(name);
    }
  } else if (s && typeof s === 'object') {
    for (const name of Object.keys(s)) set.add(name);
  }
  for (const t of schema.transitions ?? []) {
    set.add(t.from);
    set.add(t.to);
  }
  return Array.from(set);
}

/** Outgoing transitions from a given state. Deterministic order
 *  (input order preserved). */
export function viewerOutgoingTransitions(
  schema: ViewerSchema,
  fromState: string,
): ViewerTransition[] {
  return (schema.transitions ?? []).filter((t) => t.from === fromState);
}
