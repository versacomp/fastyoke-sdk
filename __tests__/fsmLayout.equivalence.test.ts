/**
 * Phase 39.2 — type-equivalence guard for the duplicated elkjs
 * layout helper.
 *
 * The SDK ships its own copy of the layout helper (see
 * `frontend/sdk/components/fsmLayout.ts`) so the published tarball
 * doesn't import admin internals. This test pins both sides to the
 * same shape: any drift on either file forces a deliberate update
 * to the other — a TS error is preferable to silently diverging
 * defaults that surface as a layout regression at runtime.
 *
 * The runtime assertions are intentionally trivial; the meaningful
 * coverage is the type-level assignability checks below — they
 * fail at `tsc` time, not at vitest time, so a lint pass picks
 * them up before the suite even runs.
 */

import { describe, expect, it } from 'vitest';

import * as adminLayout from '../../src/features/workflows/fsmAutoLayout';
import * as sdkLayout from '../components/fsmLayout';

// ---------------------------------------------------------------------------
// Type-level assignability — `_` constants exist only to surface tsc errors.
// ---------------------------------------------------------------------------

// Both LayoutPosition shapes must be mutually assignable.
const _adminToSdk: sdkLayout.LayoutPosition = {} as adminLayout.LayoutPosition;
const _sdkToAdmin: adminLayout.LayoutPosition = {} as sdkLayout.LayoutPosition;

// Both Direction unions must be mutually assignable.
const _dirAdminToSdk: sdkLayout.Direction = 'LR' as adminLayout.Direction;
const _dirSdkToAdmin: adminLayout.Direction = 'LR' as sdkLayout.Direction;

// Both LayoutOptions shapes must be mutually assignable.
const _optAdminToSdk: sdkLayout.LayoutOptions = {} as adminLayout.LayoutOptions;
const _optSdkToAdmin: adminLayout.LayoutOptions = {} as sdkLayout.LayoutOptions;

// Both TransitionLike shapes must be mutually assignable.
const _txAdminToSdk: sdkLayout.TransitionLike = {} as adminLayout.TransitionLike;
const _txSdkToAdmin: adminLayout.TransitionLike = {} as sdkLayout.TransitionLike;

void _adminToSdk;
void _sdkToAdmin;
void _dirAdminToSdk;
void _dirSdkToAdmin;
void _optAdminToSdk;
void _optSdkToAdmin;
void _txAdminToSdk;
void _txSdkToAdmin;

// ---------------------------------------------------------------------------
// Runtime smoke — both helpers expose the same public surface and both
// degrade to an empty map on no input.
// ---------------------------------------------------------------------------

describe('fsmLayout — admin / SDK equivalence', () => {
  it('both modules export layout + layoutFromSchema', () => {
    expect(typeof adminLayout.layout).toBe('function');
    expect(typeof adminLayout.layoutFromSchema).toBe('function');
    expect(typeof sdkLayout.layout).toBe('function');
    expect(typeof sdkLayout.layoutFromSchema).toBe('function');
  });

  it('both layout(empty) resolve to {}', async () => {
    const adminEmpty = await adminLayout.layout({ direction: 'LR' }, [], []);
    const sdkEmpty = await sdkLayout.layout({ direction: 'LR' }, [], []);
    expect(adminEmpty).toEqual({});
    expect(sdkEmpty).toEqual({});
  });

  it('both layoutFromSchema(garbage) resolve to {}', async () => {
    const adminEmpty = await adminLayout.layoutFromSchema(
      { direction: 'LR' },
      null,
    );
    const sdkEmpty = await sdkLayout.layoutFromSchema({ direction: 'LR' }, null);
    expect(adminEmpty).toEqual({});
    expect(sdkEmpty).toEqual({});
  });
});
