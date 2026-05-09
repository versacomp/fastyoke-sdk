/**
 * Phase 39.4 — `<FsmViewer />` shell tests.
 *
 * Asserts the smart-default contract:
 *   • entity supplied, no explicit mode → operator (timeline)
 *   • no entity, no explicit mode       → engineer (canvas, lazy)
 *   • explicit mode wins over the default
 *   • `dual` renders both surfaces
 *   • the built-in mode switcher hides when `mode` is explicit
 *     (locked surface) and when `showModeSwitcher` is false
 */

// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

// Stub the lazy-loaded canvas so jsdom doesn't try to mount reactflow.
vi.mock('../fsm-viewer/FsmViewerCanvas', () => ({
  FsmViewerCanvas: ({ schema }: { schema: { initial_state: string } }) => (
    <div data-testid="fsm-viewer-canvas-stub">canvas:{schema.initial_state}</div>
  ),
}));

import { FsmViewer } from '../fsm-viewer/FsmViewer';
import type { EntityState, ViewerSchema } from '../fsm-viewer/types';

const SCHEMA: ViewerSchema = {
  initial_state: 'pending',
  states: { pending: {}, approved: {} },
  transitions: [{ from: 'pending', to: 'approved', event_type: 'approve' }],
};

const ENTITY: EntityState = {
  current_state: 'pending',
  history: [
    {
      from_state: null,
      to_state: 'pending',
      event_type: '__created__',
      timestamp: '2026-04-21T00:00:00Z',
    },
  ],
};

describe('<FsmViewer /> — smart defaults', () => {
  it('defaults to operator mode when entity is supplied', async () => {
    render(<FsmViewer schema={SCHEMA} entity={ENTITY} />);
    expect(screen.getByTestId('fsm-viewer')).toHaveAttribute(
      'data-mode',
      'operator',
    );
    expect(screen.getByTestId('fsm-timeline')).toBeInTheDocument();
    expect(screen.queryByTestId('fsm-viewer-canvas-stub')).not.toBeInTheDocument();
  });

  it('defaults to engineer mode when entity is omitted', async () => {
    render(<FsmViewer schema={SCHEMA} />);
    expect(screen.getByTestId('fsm-viewer')).toHaveAttribute(
      'data-mode',
      'engineer',
    );
    await waitFor(() => {
      expect(screen.getByTestId('fsm-viewer-canvas-stub')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('fsm-timeline')).not.toBeInTheDocument();
  });

  it('renders both surfaces in dual mode', async () => {
    render(<FsmViewer schema={SCHEMA} entity={ENTITY} mode="dual" />);
    expect(screen.getByTestId('fsm-timeline')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByTestId('fsm-viewer-canvas-stub')).toBeInTheDocument();
    });
  });

  it('explicit mode wins over the smart default', async () => {
    render(<FsmViewer schema={SCHEMA} entity={ENTITY} mode="engineer" />);
    expect(screen.getByTestId('fsm-viewer')).toHaveAttribute(
      'data-mode',
      'engineer',
    );
    expect(screen.queryByTestId('fsm-timeline')).not.toBeInTheDocument();
  });

  it('hides the mode switcher when mode is explicit (locked surface)', () => {
    render(<FsmViewer schema={SCHEMA} entity={ENTITY} mode="operator" />);
    expect(
      screen.queryByTestId('fsm-viewer-modeswitcher'),
    ).not.toBeInTheDocument();
  });

  it('hides the mode switcher when showModeSwitcher is false', () => {
    render(<FsmViewer schema={SCHEMA} entity={ENTITY} showModeSwitcher={false} />);
    expect(
      screen.queryByTestId('fsm-viewer-modeswitcher'),
    ).not.toBeInTheDocument();
  });

  it('lets the user flip between modes via the built-in switcher', async () => {
    render(<FsmViewer schema={SCHEMA} entity={ENTITY} />);
    fireEvent.click(screen.getByTestId('fsm-viewer-mode-engineer'));
    await waitFor(() => {
      expect(screen.getByTestId('fsm-viewer')).toHaveAttribute(
        'data-mode',
        'engineer',
      );
    });
  });
});
