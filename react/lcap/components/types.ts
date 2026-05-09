/**
 * Phase 41.2 (LCAP) — shared catalog component prop shape.
 *
 * Every shipped input component in `frontend/sdk/react/lcap/components/`
 * receives the same prop bundle so `<SmartField />`'s pipeline can
 * mount any of them through a single React.createElement call.
 *
 * Heavy-editor peer packages (Phase 41.5: `@fastyoke/lcap-richtext`,
 * `@fastyoke/lcap-codeeditor`, `@fastyoke/lcap-markdowneditor`)
 * implement the same shape so they slot in without an adapter layer.
 */
import type { ReactNode } from 'react';
import type { EntityFieldAnnotation } from '../../../types/entityAnnotation';

export type SmartFieldDensity = 'compact' | 'comfortable' | 'spacious';

export interface CatalogComponentProps {
  /** Stable HTML id for label association. SmartField passes the
   *  annotation's field_key so the label `htmlFor` matches. */
  id: string;
  /** The annotation row that drove the component selection. The
   *  catalog component reads its own type-specific keys
   *  (max_length, min/max, options_json, …) and ignores the rest. */
  annotation: EntityFieldAnnotation;
  /** Merged ui_config_json (annotation row + uiConfigOverride). All
   *  `@ui/*` keys live here. */
  uiConfig: Record<string, unknown>;
  /** Current value. */
  value: unknown;
  /** Caller-owned state mutation. */
  onChange: (next: unknown) => void;
  /** When true, the component renders read-only (no input mounted —
   *  the SmartField fast-path normally renders a `<span>` directly,
   *  but this flag is forwarded so heavy-editor peers can render a
   *  read-only preview without unmounting their editor). */
  readOnly?: boolean;
  /** Density passthrough — matches `FilePayloadView`'s precedent. */
  density?: SmartFieldDensity;
  /** Optional className forwarded to the outer wrapper. */
  className?: string;
  /** Phase 45.4 — when true, the rendered input MUST set
   *  `aria-invalid="true"` so AT announces the failure paired with
   *  the live-region message from `useA11yAnnouncer` (Phase 45.3).
   *  SmartField wires this from `expr.validateError !== null`;
   *  forms outside the SmartField pipeline (FormRenderer) compute
   *  it locally from their own validation state. */
  invalid?: boolean;
  /** Phase 45.4 — DOM id of an element describing the validation
   *  error. Catalog components forward this to `aria-describedby`
   *  so AT reads the error span when the input gains focus. */
  describedBy?: string;
}

export type CatalogComponent = (props: CatalogComponentProps) => ReactNode;
