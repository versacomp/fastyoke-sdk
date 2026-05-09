/**
 * Phase 39.3 (FsmViewer SDK) — read-only reactflow canvas.
 *
 * Hosts the `<ViewerStateNode />` primitive on a reactflow surface
 * with the full read-only trio: `nodesDraggable`,
 * `nodesConnectable`, `elementsSelectable` all `false`. Missing any
 * one lets the user click into an unexpected state — keep all three.
 *
 * Layout is computed via the duplicated SDK elkjs helper
 * (`frontend/sdk/components/fsmLayout.ts`). The first paint shows
 * the schema with grid placement; once elkjs finishes asynchronously
 * the nodes snap to the layered layout. Layout failures (offline,
 * ancient browser) leave the grid placement — the canvas still
 * renders, just less prettily.
 *
 * `<FsmViewer />` (39.4) lazy-imports this module via React.lazy so
 * ISVs who only want the timeline never pull reactflow + elkjs into
 * their bundle. 39.6 asserts this structurally.
 */

import { useEffect, useMemo, useState } from 'react';
import ReactFlow, {
  Background,
  Controls,
  ReactFlowProvider,
  type Edge,
  type Node,
  type NodeTypes,
} from 'reactflow';
import 'reactflow/dist/style.css';

import { layout, type LayoutPosition } from '../../components/fsmLayout';
import {
  viewerStateNames,
  type EntityState,
  type ViewerSchema,
} from './types';
import { ViewerStateNode, type ViewerStateNodeData } from './ViewerStateNode';

export interface FsmViewerCanvasProps {
  schema: ViewerSchema;
  entity?: EntityState;
  /** elkjs flow direction. Defaults to 'LR'. */
  direction?: 'LR' | 'RL' | 'TB' | 'BT';
  /** Optional fixed height. Defaults to 360px so the canvas works
   *  without the host providing a sized parent. */
  height?: number | string;
  className?: string;
}

const NODE_TYPES: NodeTypes = { state: ViewerStateNode };

const GRID_COLS = 4;
const GRID_DX = 200;
const GRID_DY = 90;

function gridPosition(index: number): LayoutPosition {
  const col = index % GRID_COLS;
  const row = Math.floor(index / GRID_COLS);
  return { x: col * GRID_DX, y: row * GRID_DY };
}

export function FsmViewerCanvas({
  schema,
  entity,
  direction = 'LR',
  height = 360,
  className,
}: FsmViewerCanvasProps): JSX.Element {
  const stateNames = useMemo(() => viewerStateNames(schema), [schema]);
  const [positions, setPositions] = useState<Record<string, LayoutPosition>>(
    () => {
      const initial: Record<string, LayoutPosition> = {};
      stateNames.forEach((name, i) => {
        initial[name] = gridPosition(i);
      });
      return initial;
    },
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const next = await layout(
        { direction },
        stateNames,
        schema.transitions ?? [],
      );
      if (!cancelled && Object.keys(next).length > 0) {
        setPositions((prev) => ({ ...prev, ...next }));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [direction, stateNames, schema.transitions]);

  const currentState = entity?.current_state ?? schema.initial_state;

  const nodes: Node<ViewerStateNodeData>[] = useMemo(
    () =>
      stateNames.map((name) => ({
        id: name,
        type: 'state',
        position: positions[name] ?? { x: 0, y: 0 },
        data: {
          label: name,
          isInitial: name === schema.initial_state,
          isActive: name === currentState,
        },
        // Read-only canvas — explicitly disable per-node drag too,
        // beyond the canvas-level flag below.
        draggable: false,
        selectable: false,
      })),
    [stateNames, positions, schema.initial_state, currentState],
  );

  const edges: Edge[] = useMemo(
    () =>
      (schema.transitions ?? []).map((t, i) => ({
        id: `e${i}-${t.from}-${t.to}`,
        source: t.from,
        target: t.to,
        label: t.event_type,
        labelStyle: { fontSize: 10, fill: 'rgb(75 85 99)' },
        labelBgStyle: { fill: 'rgba(255,255,255,0.85)' },
      })),
    [schema.transitions],
  );

  return (
    <div
      data-testid="fsm-viewer-canvas"
      className={className}
      style={{ height, width: '100%' }}
    >
      <ReactFlowProvider>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={NODE_TYPES}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable={false}
          panOnDrag
          fitView
          proOptions={{ hideAttribution: true }}
        >
          <Background />
          <Controls showInteractive={false} />
        </ReactFlow>
      </ReactFlowProvider>
    </div>
  );
}

export default FsmViewerCanvas;
