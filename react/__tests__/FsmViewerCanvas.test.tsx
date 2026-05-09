/**
 * Phase 39.3 — `<ViewerStateNode />` + `<FsmViewerCanvas />` tests.
 *
 * The canvas is hard to assert against fully in jsdom (reactflow
 * needs measurement APIs that jsdom doesn't supply), so the canvas
 * cases focus on the contract surface: node count, the read-only
 * trio prop wiring, and the active/initial state markers on the
 * Viewer node primitive itself. Layout-correctness is asserted at
 * the helper level by 39.2's equivalence test.
 */

// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ViewerStateNode } from '../fsm-viewer/ViewerStateNode';

describe('<ViewerStateNode />', () => {
  it('renders the label', () => {
    render(<ViewerStateNode data={{ label: 'pending' }} />);
    expect(screen.getByTestId('viewer-state-node-pending')).toHaveTextContent(
      'pending',
    );
  });

  it('marks the node as active when isActive is true', () => {
    render(<ViewerStateNode data={{ label: 'approved', isActive: true }} />);
    expect(
      screen.getByTestId('viewer-state-node-approved'),
    ).toHaveAttribute('data-active', 'true');
  });

  it('renders the start ribbon when isInitial is true', () => {
    render(<ViewerStateNode data={{ label: 'pending', isInitial: true }} />);
    expect(
      screen.getByTestId('viewer-state-node-pending'),
    ).toHaveAttribute('data-initial', 'true');
    expect(screen.getByText('start')).toBeInTheDocument();
  });

  it('does NOT mark non-active / non-initial nodes', () => {
    render(<ViewerStateNode data={{ label: 'archived' }} />);
    const node = screen.getByTestId('viewer-state-node-archived');
    expect(node).not.toHaveAttribute('data-active');
    expect(node).not.toHaveAttribute('data-initial');
  });
});
