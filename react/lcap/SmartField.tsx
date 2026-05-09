/**
 * Phase 41.2 (LCAP) — `<SmartField />` resolver.
 *
 * The single React component every later sub-phase consumes.
 * Public API per `LCAP-Spec.md` § 4.1; resolution pipeline per
 * § 4.2. Framework-agnostic React-DOM — Next.js consumers wrap
 * this with `@fastyoke/next/SmartField` for SSR + RSC integration
 * (Phase 41.5).
 *
 * Tier gating per `LCAP-Spec.md` § 8: the resolver itself is free
 * for all tenants (annotated fields render correctly on Hobby +
 * Pro). Expression-bearing annotations under tier short-circuit
 * to the static rendering with a console warn. The Page Designer
 * cascade gate lives in the inspector surface, not here.
 */
import { Suspense, useMemo, useRef, type ReactNode } from 'react';
import type { EntityFieldAnnotation } from '../../types/entityAnnotation';
import { Checkbox } from './components/Checkbox';
import { DatePicker } from './components/DatePicker';
import { FileRefAdapter } from './components/FileRefAdapter';
import { FsmStatePicker } from './components/FsmStatePicker';
import { LazyCode, LazyMarkdown, LazyRichtext } from './components/heavy';
import { NumberInput } from './components/NumberInput';
import { RelationshipDisplay } from './components/RelationshipDisplay';
import { Select } from './components/Select';
import { TextArea } from './components/TextArea';
import { TextInput } from './components/TextInput';
import type { CatalogComponent, SmartFieldDensity } from './components/types';
import { formatNumber, formatTimestamp } from './format';
import { useExpressionResults } from './quickjs/useExpressionResults';
import { resolveSmartField, type ResolvedFieldType } from './resolver';

export type SmartFieldMode = 'edit' | 'display';

export interface SmartFieldProps {
  /** The annotation row from
   *  `/tenant/entities/:name/annotations`. Drives every
   *  resolution decision. */
  annotation: EntityFieldAnnotation;
  /** Current field value. Caller owns the source of truth. */
  value: unknown;
  /** Called on every change. Caller debounces / batches as
   *  desired. */
  onChange: (next: unknown) => void;
  /** Optional context for expression evaluation. Phase 41.6
   *  forwards this verbatim into the QuickJS sandbox; v0 stores
   *  it on the resolved object but does not yet evaluate. */
  exprContext?: Record<string, unknown>;
  /** Page-level overrides merged AFTER `annotation.ui_config_json`.
   *  Used by Page Designer blocks that need to specialize one
   *  rendering surface (e.g. summary card showing year only). */
  uiConfigOverride?: Record<string, unknown>;
  /** Render mode. Defaults to `'edit'`. `'display'` short-circuits
   *  to a formatted span; no input mounts, no QuickJS load, no
   *  zod schema. */
  mode?: SmartFieldMode;
  /** Density passes through to the underlying component (matches
   *  `FilePayloadView`'s precedent). */
  density?: SmartFieldDensity;
  /** Tenant tier — when below `'team'`, the resolver short-
   *  circuits expression evaluation. Phase 33.6 plumbs the
   *  current tier into the React tree via the existing
   *  `useFastYoke().tenantTier` value (planned). v0 accepts the
   *  tier as a prop so callers without that plumbing yet can
   *  pass it explicitly. Defaults to `'team'` so callers who
   *  haven't wired tier gating yet don't get false 402s. */
  currentTier?: 'hobby' | 'pro' | 'team' | 'enterprise' | 'fleet';
  /** Optional className forwarded to the catalog component. */
  className?: string;
  /** Stable HTML id (defaults to the annotation's `field_key`). */
  id?: string;
}

const TIER_ORDER: Record<NonNullable<SmartFieldProps['currentTier']>, number> = {
  hobby: 0,
  pro: 1,
  team: 2,
  enterprise: 3,
  fleet: 4,
};

const CATALOG: Record<ResolvedFieldType, CatalogComponent> = {
  string: TextInput,
  longtext: TextArea, // overridden per-slug below
  number: NumberInput,
  boolean: Checkbox,
  timestamp: DatePicker,
  enum: Select,
  fsm_state_ref: FsmStatePicker,
  file_ref: FileRefAdapter,
  relationship: RelationshipDisplay,
};

let warnedSlug = new WeakMap<EntityFieldAnnotation, Set<string>>();
let warnedTierExpression = new WeakSet<EntityFieldAnnotation>();

/** Test-only: clear the warn-once memoization between cases. */
export function __resetSmartFieldWarnings(): void {
  warnedSlug = new WeakMap();
  warnedTierExpression = new WeakSet();
}

export function SmartField(props: SmartFieldProps): JSX.Element | null {
  const {
    annotation,
    value,
    onChange,
    exprContext,
    uiConfigOverride,
    mode = 'edit',
    density,
    currentTier = 'team',
    className,
    id,
  } = props;

  const resolved = useMemo(
    () => resolveSmartField(annotation, uiConfigOverride),
    [annotation, uiConfigOverride],
  );

  const elementId = id ?? annotation.field_key;
  const componentSlug = resolved.componentSlug;
  const tierWarnRef = useRef(false);

  // Tier short-circuit: expression-bearing annotation under Team
  // → console warn once, render the static fallback below.
  const tierAllowsExpressions = TIER_ORDER[currentTier] >= TIER_ORDER.team;
  if (resolved.hasExpression && !tierAllowsExpressions) {
    if (!warnedTierExpression.has(annotation) && !tierWarnRef.current) {

      console.warn(
        '[fastyoke-sdk] SmartField: @ui/visible_when / @ui/compute / @ui/validate_when ' +
          `requires the Team tier or higher (current: ${currentTier}). ` +
          'The expression will not be evaluated; the field renders as if it were always-true.',
      );
      warnedTierExpression.add(annotation);
      tierWarnRef.current = true;
    }
  }

  // Phase 41.6: evaluate visible_when / compute / validate_when
  // when expressions are present + tier allows. The hook's
  // dynamic-import + caching keeps the QuickJS chunk out of the
  // SDK base bundle. The catalog component below uses
  // `effectiveValue` so a `compute` result overrides the user's
  // value; `effectiveOnChange` is a no-op when computed (the
  // field is locked read-only).
  const expr = useExpressionResults({
    uiConfig: resolved.uiConfig,
    enabled: resolved.hasExpression && tierAllowsExpressions && mode !== 'display',
    contextSource: {
      value,
      record:
        exprContext && typeof exprContext.record === 'object'
          ? (exprContext.record as Record<string, unknown> | null)
          : null,
      form:
        exprContext && typeof exprContext.form === 'object'
          ? (exprContext.form as Record<string, unknown> | null)
          : null,
      tenant_id:
        exprContext && typeof exprContext.tenant_id === 'string'
          ? (exprContext.tenant_id as string)
          : '',
      user_role:
        exprContext && typeof exprContext.user_role === 'string'
          ? (exprContext.user_role as string)
          : '',
    },
  });

  // visible_when=false → render nothing.
  if (!expr.visible) return null;

  const effectiveValue =
    expr.computedValue !== undefined ? expr.computedValue : value;
  const effectiveOnChange =
    expr.computedValue !== undefined
      ? () => {
          /* compute mode locks the field; user input is ignored */
        }
      : onChange;

  // Slug-fell-back warning. Once per (annotation, slug) tuple so a
  // stable bad annotation doesn't spam the console.
  if (resolved.slugFellBack && resolved.rejectedSlug) {
    let bag = warnedSlug.get(annotation);
    if (!bag) {
      bag = new Set();
      warnedSlug.set(annotation, bag);
    }
    if (!bag.has(resolved.rejectedSlug)) {

      console.warn(
        `[fastyoke-sdk] SmartField: @ui/component '${resolved.rejectedSlug}' ` +
          `is not valid for field_type '${resolved.fieldType}'; ` +
          `falling back to the default component for that type.`,
      );
      bag.add(resolved.rejectedSlug);
    }
  }

  // Mode = 'display' fast-path. No input mounts; no QuickJS load;
  // no zod refinement. Caller-provided density is preserved so
  // table cells stay compact.
  if (mode === 'display') {
    return (
      <span
        id={elementId}
        data-testid={`smartfield-${annotation.field_key}`}
        data-display-mode="true"
        data-component-slug={componentSlug}
        className={className}
      >
        {formatDisplay(effectiveValue, resolved.fieldType, resolved.uiConfig)}
      </span>
    );
  }

  // Heavy-editor lazy mount when slug requests one of the peer
  // packages. The Suspense boundary lets the resolved fallback
  // (TextArea) flash as a placeholder while the dynamic import
  // resolves; warn-then-fallback to TextArea when the peer isn't
  // installed lives inside the LazyXxx wrappers.
  // Phase 45.4 — thread the validation outcome into every catalog
  // component so the rendered input can stamp aria-invalid /
  // aria-describedby. The error span below uses errorId so AT
  // reads the failure message when the input gains focus.
  const isInvalid = expr.validateError !== null;
  const errorId = `${elementId}-error`;

  if (resolved.fieldType === 'longtext' && componentSlug === 'richtext') {
    return (
      <Suspense fallback={renderFallbackTextArea(props, resolved.uiConfig, elementId)}>
        <LazyRichtext
          id={elementId}
          annotation={annotation}
          uiConfig={resolved.uiConfig}
          value={effectiveValue}
          onChange={effectiveOnChange}
          density={density}
          className={className}
          readOnly={expr.computedValue !== undefined}
          invalid={isInvalid}
          describedBy={isInvalid ? errorId : undefined}
        />
      </Suspense>
    );
  }
  if (resolved.fieldType === 'longtext' && componentSlug === 'markdown') {
    return (
      <Suspense fallback={renderFallbackTextArea(props, resolved.uiConfig, elementId)}>
        <LazyMarkdown
          id={elementId}
          annotation={annotation}
          uiConfig={resolved.uiConfig}
          value={effectiveValue}
          onChange={effectiveOnChange}
          density={density}
          className={className}
          readOnly={expr.computedValue !== undefined}
          invalid={isInvalid}
          describedBy={isInvalid ? errorId : undefined}
        />
      </Suspense>
    );
  }
  if (resolved.fieldType === 'longtext' && componentSlug === 'code') {
    return (
      <Suspense fallback={renderFallbackTextArea(props, resolved.uiConfig, elementId)}>
        <LazyCode
          id={elementId}
          annotation={annotation}
          uiConfig={resolved.uiConfig}
          value={effectiveValue}
          onChange={effectiveOnChange}
          density={density}
          className={className}
          readOnly={expr.computedValue !== undefined}
          invalid={isInvalid}
          describedBy={isInvalid ? errorId : undefined}
        />
      </Suspense>
    );
  }

  // Normal edit-mode dispatch — the catalog map indexed by
  // resolved field_type. Slug variants within a type (e.g.
  // `currency` for `number`, `switch` for `boolean`) are read
  // off the merged ui_config inside the component itself.
  const Component = CATALOG[resolved.fieldType];
  const componentEl = (
    <Component
      id={elementId}
      annotation={annotation}
      uiConfig={resolved.uiConfig}
      value={effectiveValue}
      onChange={effectiveOnChange}
      density={density}
      className={className}
      readOnly={expr.computedValue !== undefined}
      invalid={isInvalid}
      describedBy={isInvalid ? errorId : undefined}
    />
  ) as JSX.Element;

  // Phase 41.6 inline validation error — surfaced when
  // `@ui/validate_when` evaluated to false. Caller forms can
  // also pull from a parent zod schema; this is the inline
  // companion for expression-driven validation.
  if (isInvalid) {
    return (
      <span
        id={elementId}
        data-testid={`smartfield-${annotation.field_key}`}
        data-validate-error="true"
      >
        {componentEl}
        <span
          id={errorId}
          data-testid={`smartfield-${annotation.field_key}-error`}
          role="alert"
          style={{
            display: 'block',
            marginTop: '0.25rem',
            fontSize: '0.75rem',
            color: '#b91c1c',
          }}
        >
          {expr.validateError}
        </span>
      </span>
    );
  }

  return componentEl;
}

function renderFallbackTextArea(
  props: SmartFieldProps,
  uiConfig: Record<string, unknown>,
  elementId: string,
): ReactNode {
  return (
    <TextArea
      id={elementId}
      annotation={props.annotation}
      uiConfig={uiConfig}
      value={props.value}
      onChange={props.onChange}
      density={props.density}
      className={props.className}
    />
  );
}

function formatDisplay(
  value: unknown,
  fieldType: ResolvedFieldType,
  uiConfig: Record<string, unknown>,
): string {
  if (value === null || value === undefined || value === '') return '—';
  // Phase 41.4: locale-driven Intl + token-based date formatting
  // applied here. The formatters degrade to '' on bad input; the
  // outer fallback then catches the empty string.
  if (fieldType === 'boolean') return value === true ? 'Yes' : 'No';
  if (fieldType === 'number') {
    const formatted = formatNumber(value, uiConfig);
    if (formatted !== '') return formatted;
  }
  if (fieldType === 'timestamp') {
    const formatted = formatTimestamp(value, uiConfig);
    if (formatted !== '') return formatted;
  }
  if (fieldType === 'file_ref' && typeof value === 'object') {
    const v = value as Record<string, unknown>;
    if (typeof v.filename === 'string') return v.filename;
  }
  return String(value);
}
