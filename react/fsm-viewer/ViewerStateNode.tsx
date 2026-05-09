/**
 * Phase 39.3 (FsmViewer SDK) — read-only `<ViewerStateNode />`.
 *
 * Intentionally NOT a reuse of the admin `StateNode.tsx`. The admin
 * node ships 8 directional handles, a delete button, and a "set
 * initial" button — authoring affordances that are confusing (and
 * partially destructive) when surfaced to operators.
 *
 * This node is deliberately tiny: a label, an optional active-state
 * pulse, and an optional initial-state ribbon. Zero handles. New
 * affordances should NOT grow on this primitive — wrap it in a
 * host-supplied render prop instead. (Locked decision #3 in the
 * Phase 39 plan.)
 */

import type { CSSProperties } from 'react';

export interface ViewerStateNodeData {
  label: string;
  isInitial?: boolean;
  isActive?: boolean;
}

interface ViewerStateNodeProps {
  data: ViewerStateNodeData;
}

const BASE_STYLE: CSSProperties = {
  padding: '0.5rem 0.875rem',
  borderRadius: 6,
  fontSize: '0.8125rem',
  fontWeight: 500,
  background: 'white',
  border: '1px solid rgb(209 213 219)',
  color: 'rgb(17 24 39)',
  minWidth: 120,
  textAlign: 'center',
  position: 'relative',
};

const ACTIVE_STYLE: CSSProperties = {
  borderColor: 'rgb(59 130 246)',
  boxShadow: '0 0 0 3px rgba(59, 130, 246, 0.18)',
  background: 'rgb(239 246 255)',
};

const INITIAL_RIBBON: CSSProperties = {
  position: 'absolute',
  top: -8,
  left: 8,
  background: 'rgb(59 130 246)',
  color: 'white',
  fontSize: '0.6rem',
  fontWeight: 600,
  letterSpacing: '0.05em',
  padding: '1px 6px',
  borderRadius: 3,
  textTransform: 'uppercase',
};

export function ViewerStateNode({ data }: ViewerStateNodeProps): JSX.Element {
  const style: CSSProperties = {
    ...BASE_STYLE,
    ...(data.isActive ? ACTIVE_STYLE : null),
  };
  return (
    <div
      data-testid={`viewer-state-node-${data.label}`}
      data-active={data.isActive ? 'true' : undefined}
      data-initial={data.isInitial ? 'true' : undefined}
      style={style}
    >
      {data.isInitial && <span style={INITIAL_RIBBON}>start</span>}
      {data.label}
    </div>
  );
}
