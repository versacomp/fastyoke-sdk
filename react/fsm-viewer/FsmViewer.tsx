/**
 * Phase 39.4 (FsmViewer SDK) — `<FsmViewer />` shell.
 *
 * Composes the `FsmTimeline` (always present) with a `React.lazy`-
 * imported `FsmViewerCanvas`. Two physically-separate exports —
 * tree-shaking via dynamic import is bundler-heuristic-dependent
 * (locked decision #6); ISVs who only want the timeline import
 * `FsmTimeline` directly and never reach this file.
 *
 * Smart-default mode selection (locked decision #4):
 *   • When `entity` is supplied → operator (timeline) mode by
 *     default. The operator wants the linear "what happened, what's
 *     next" view; canvas is opt-in via `mode='engineer'` or
 *     `mode='dual'`.
 *   • When `entity` is omitted → engineer (canvas) mode by default.
 *     Schema-only view is for designers; timeline alone with no
 *     history is visually thin.
 *
 * Hosts that want to lock the surface explicitly pass `mode`. The
 * smart default only applies when `mode` is omitted.
 */

import { Suspense, lazy, useState, type CSSProperties } from 'react';

import { FsmTimeline, type FsmTimelineProps } from './FsmTimeline';
import type {
  EntityState,
  TransitionRequestHandler,
  ViewerSchema,
} from './types';

const FsmViewerCanvas = lazy(() =>
  import('./FsmViewerCanvas').then((m) => ({ default: m.FsmViewerCanvas })),
);

export type FsmViewerMode = 'operator' | 'engineer' | 'dual';

export interface FsmViewerProps {
  schema: ViewerSchema;
  entity?: EntityState;
  /** Override the smart default. */
  mode?: FsmViewerMode;
  /** Forwarded to the timeline. */
  onTransitionRequest?: TransitionRequestHandler;
  /** Forwarded to the timeline. */
  formatTimestamp?: FsmTimelineProps['formatTimestamp'];
  /** Forwarded to the canvas. */
  direction?: 'LR' | 'RL' | 'TB' | 'BT';
  /** Canvas height. Defaults to 360px. */
  canvasHeight?: number | string;
  className?: string;
  style?: CSSProperties;
  /** When true, the user can flip between operator/engineer/dual via
   *  the built-in mode switcher. Defaults to true. Hosts that want a
   *  locked surface pass `false`. */
  showModeSwitcher?: boolean;
}

const FALLBACK_STYLE: CSSProperties = {
  height: 360,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: '0.8125rem',
  color: 'rgb(107 114 128)',
};

function defaultMode(entity: EntityState | undefined): FsmViewerMode {
  return entity ? 'operator' : 'engineer';
}

export function FsmViewer({
  schema,
  entity,
  mode: explicitMode,
  onTransitionRequest,
  formatTimestamp,
  direction,
  canvasHeight,
  className,
  style,
  showModeSwitcher = true,
}: FsmViewerProps): JSX.Element {
  const initialMode = explicitMode ?? defaultMode(entity);
  const [mode, setMode] = useState<FsmViewerMode>(initialMode);
  // When the host changes `explicitMode` mid-mount, follow it; the
  // local state still allows the switcher to override per session.
  // (Keep this simple — no useEffect; explicit mode wins on render.)
  const effective: FsmViewerMode = explicitMode ?? mode;

  const showTimeline = effective === 'operator' || effective === 'dual';
  const showCanvas = effective === 'engineer' || effective === 'dual';

  return (
    <div
      data-testid="fsm-viewer"
      data-mode={effective}
      className={className}
      style={style}
    >
      {showModeSwitcher && !explicitMode && (
        <div
          data-testid="fsm-viewer-modeswitcher"
          style={{
            display: 'flex',
            gap: 4,
            marginBottom: 8,
            fontSize: '0.75rem',
          }}
        >
          {(['operator', 'engineer', 'dual'] as FsmViewerMode[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              data-testid={`fsm-viewer-mode-${m}`}
              data-active={effective === m ? 'true' : undefined}
              style={{
                padding: '2px 8px',
                borderRadius: 3,
                border: '1px solid rgb(209 213 219)',
                background: effective === m ? 'rgb(239 246 255)' : 'white',
                color: effective === m ? 'rgb(30 64 175)' : 'rgb(75 85 99)',
                fontWeight: effective === m ? 600 : 400,
                cursor: 'pointer',
              }}
            >
              {m}
            </button>
          ))}
        </div>
      )}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns:
            effective === 'dual' ? 'minmax(0, 1fr) minmax(0, 1fr)' : '1fr',
          gap: 12,
        }}
      >
        {showCanvas && (
          <Suspense
            fallback={
              <div data-testid="fsm-viewer-canvas-loading" style={FALLBACK_STYLE}>
                Loading canvas…
              </div>
            }
          >
            <FsmViewerCanvas
              schema={schema}
              entity={entity}
              direction={direction}
              height={canvasHeight}
            />
          </Suspense>
        )}

        {showTimeline && (
          <FsmTimeline
            schema={schema}
            entity={entity}
            onTransitionRequest={onTransitionRequest}
            formatTimestamp={formatTimestamp}
          />
        )}
      </div>
    </div>
  );
}
