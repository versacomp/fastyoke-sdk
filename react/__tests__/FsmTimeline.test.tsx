/**
 * Phase 39.1 — `<FsmTimeline />` rendering tests.
 *
 * Focused on the public contract:
 *   • current-state badge tracks `entity.current_state`, falls back
 *     to `schema.initial_state` when `entity` is omitted
 *   • history newest-first; sentinel event_types humanized
 *   • action buttons: one per outgoing transition; click invokes
 *     `onTransitionRequest(targetState)`; rejected promise leaves
 *     the button reachable for retry
 *   • terminal state (no outgoing transitions) renders the "No
 *     further actions" affordance
 *   • `hideActions` suppresses the action region entirely
 *
 * Bundle independence (no reactflow, no elkjs imports) is verified
 * structurally by 39.6.
 */

// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { FsmTimeline } from '../fsm-viewer/FsmTimeline';
import type { EntityState, ViewerSchema } from '../fsm-viewer/types';

const SCHEMA: ViewerSchema = {
  initial_state: 'pending',
  states: { pending: {}, approved: {}, rejected: {}, archived: {} },
  transitions: [
    { from: 'pending', to: 'approved', event_type: 'approve' },
    { from: 'pending', to: 'rejected', event_type: 'reject' },
    { from: 'approved', to: 'archived', event_type: 'archive' },
  ],
};

const ENTITY: EntityState = {
  current_state: 'approved',
  history: [
    {
      from_state: null,
      to_state: 'pending',
      event_type: '__created__',
      timestamp: '2026-04-21T00:00:00Z',
      actor: null,
      reason: null,
    },
    {
      from_state: 'pending',
      to_state: 'approved',
      event_type: 'approve',
      timestamp: '2026-04-22T12:30:00Z',
      actor: 'admin@test.com',
      reason: null,
    },
  ],
};

describe('<FsmTimeline />', () => {
  it('shows the current state from entity when provided', () => {
    render(<FsmTimeline schema={SCHEMA} entity={ENTITY} />);
    expect(screen.getByTestId('fsm-timeline-current')).toHaveTextContent('approved');
  });

  it('falls back to schema.initial_state when entity is omitted', () => {
    render(<FsmTimeline schema={SCHEMA} />);
    expect(screen.getByTestId('fsm-timeline-current')).toHaveTextContent('pending');
  });

  it('renders history newest-first with humanized sentinel events', () => {
    render(<FsmTimeline schema={SCHEMA} entity={ENTITY} />);
    const rows = screen.getAllByTestId('fsm-timeline-row');
    expect(rows).toHaveLength(2);
    // Newest first: the "approve" row is index 0.
    expect(within(rows[0]!).getByText('approve')).toBeInTheDocument();
    expect(within(rows[1]!).getByText('Created')).toBeInTheDocument();
  });

  it('renders one action button per outgoing transition from current_state', () => {
    const onTransitionRequest = vi.fn().mockResolvedValue(undefined);
    render(
      <FsmTimeline
        schema={SCHEMA}
        entity={ENTITY}
        onTransitionRequest={onTransitionRequest}
      />,
    );
    expect(screen.getByTestId('fsm-timeline-action-archived')).toBeInTheDocument();
    // 'approved' has only one outgoing transition (to 'archived').
    expect(screen.queryByTestId('fsm-timeline-action-approved')).not.toBeInTheDocument();
    expect(screen.queryByTestId('fsm-timeline-action-rejected')).not.toBeInTheDocument();
  });

  it('invokes onTransitionRequest with the target state on click', async () => {
    const onTransitionRequest = vi.fn().mockResolvedValue(undefined);
    render(
      <FsmTimeline
        schema={SCHEMA}
        entity={ENTITY}
        onTransitionRequest={onTransitionRequest}
      />,
    );
    fireEvent.click(screen.getByTestId('fsm-timeline-action-archived'));
    await waitFor(() => {
      expect(onTransitionRequest).toHaveBeenCalled();
    });
    expect(onTransitionRequest.mock.calls[0]?.[0]).toBe('archived');
  });

  it('keeps the button reachable when onTransitionRequest rejects', async () => {
    const onTransitionRequest = vi.fn().mockRejectedValue(new Error('boom'));
    render(
      <FsmTimeline
        schema={SCHEMA}
        entity={ENTITY}
        onTransitionRequest={onTransitionRequest}
      />,
    );
    const btn = screen.getByTestId('fsm-timeline-action-archived');
    fireEvent.click(btn);
    await waitFor(() => {
      expect(onTransitionRequest).toHaveBeenCalled();
    });
    // Title surfaces the error message in the brief error window.
    await waitFor(() => {
      expect(btn).toHaveAttribute('title', 'boom');
    });
  });

  it('renders the terminal-state notice when no outgoing transitions exist', () => {
    const onTransitionRequest = vi.fn();
    render(
      <FsmTimeline
        schema={SCHEMA}
        entity={{ current_state: 'archived' }}
        onTransitionRequest={onTransitionRequest}
      />,
    );
    expect(screen.getByTestId('fsm-timeline-terminal')).toHaveTextContent(
      /no further actions available from archived/i,
    );
  });

  it('hides the action region entirely when hideActions is true', () => {
    const onTransitionRequest = vi.fn();
    render(
      <FsmTimeline
        schema={SCHEMA}
        entity={ENTITY}
        onTransitionRequest={onTransitionRequest}
        hideActions
      />,
    );
    expect(screen.queryByTestId('fsm-timeline-actions')).not.toBeInTheDocument();
    expect(screen.queryByTestId('fsm-timeline-terminal')).not.toBeInTheDocument();
  });

  it('renders the bootstrap (from_state=null) row with a dash', () => {
    render(<FsmTimeline schema={SCHEMA} entity={ENTITY} />);
    const rows = screen.getAllByTestId('fsm-timeline-row');
    expect(within(rows[1]!).getByText('— → pending')).toBeInTheDocument();
  });

  it('does not render disclosures when renderHistoryDetail is omitted', () => {
    render(<FsmTimeline schema={SCHEMA} entity={ENTITY} />);
    expect(
      screen.queryAllByTestId('fsm-timeline-row-disclosure'),
    ).toHaveLength(0);
  });

  it('renders a per-row disclosure when renderHistoryDetail returns a node', () => {
    render(
      <FsmTimeline
        schema={SCHEMA}
        entity={ENTITY}
        renderHistoryDetail={(entry) => (
          <span data-testid={`detail-${entry.event_type}`}>
            detail-for-{entry.to_state}
          </span>
        )}
      />,
    );
    const disclosures = screen.getAllByTestId('fsm-timeline-row-disclosure');
    expect(disclosures).toHaveLength(2);
    expect(screen.getByTestId('detail-approve')).toHaveTextContent(
      'detail-for-approved',
    );
    expect(screen.getByTestId('detail-__created__')).toHaveTextContent(
      'detail-for-pending',
    );
  });

  it('suppresses the disclosure for rows whose render-prop returns null', () => {
    render(
      <FsmTimeline
        schema={SCHEMA}
        entity={ENTITY}
        renderHistoryDetail={(entry) =>
          entry.event_type === '__created__' ? null : (
            <span data-testid="d">x</span>
          )
        }
      />,
    );
    expect(screen.getAllByTestId('fsm-timeline-row-disclosure')).toHaveLength(1);
  });
});
