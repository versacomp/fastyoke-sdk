/**
 * Phase 39.5 — public-exports smoke test for the FsmViewer surface.
 *
 * Imports through the canonical `@fastyoke/sdk` entry path
 * (`../index`) to confirm that `FsmTimeline`, `FsmViewer`, and the
 * composable types are wired into the published surface. Regression
 * fence for "I added the file but forgot to re-export it."
 */

import { describe, expect, it } from 'vitest';

import * as sdk from '../index';

describe('@fastyoke/sdk public surface — Phase 39 exports', () => {
  it('exports FsmTimeline as a function', () => {
    expect(typeof sdk.FsmTimeline).toBe('function');
  });

  it('exports FsmViewer as a function', () => {
    expect(typeof sdk.FsmViewer).toBe('function');
  });

  it('exports the public types via TS-erased interfaces', () => {
    // Interfaces erase at runtime; we assert by smoke-shaping a
    // value that must satisfy the type. tsc will catch a missing
    // export at type-check time before this file even runs.
    const entity: sdk.EntityState = { current_state: 'x' };
    const schema: sdk.ViewerSchema = { initial_state: 'x' };
    const tx: sdk.ViewerTransition = { from: 'a', to: 'b', event_type: 'go' };
    const handler: sdk.TransitionRequestHandler = async () => {};
    const entry: sdk.EntityHistoryEntry = {
      from_state: null,
      to_state: 'x',
      event_type: '__created__',
      timestamp: '2026-04-25T00:00:00Z',
    };
    expect(entity.current_state).toBe('x');
    expect(schema.initial_state).toBe('x');
    expect(tx.event_type).toBe('go');
    expect(typeof handler).toBe('function');
    expect(entry.to_state).toBe('x');
  });
});
