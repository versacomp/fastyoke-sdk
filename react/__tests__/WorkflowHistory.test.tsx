/**
 * Phase 21.8.4 — `<WorkflowHistory jobId={...} />` rendering tests.
 *
 * Focused on the visible contract:
 *
 *   * loading state → shows "Loading history…" (role=status for a11y)
 *   * error state   → role=alert + the surfaced message
 *   * empty state   → shows "No history yet."
 *   * data state    → table with one row per entry, special event
 *                     types humanized, null actor/reason rendered
 *                     as em-dashes (not empty strings — preserves
 *                     table row alignment)
 *   * from_state = null (bootstrap row) → renders just the target
 *     state, prefixed with an em-dash
 *
 * The URL the underlying `useJobHistory` hits is pinned by the
 * hook tests (21.8.3); we don't re-pin it here.
 */

// @vitest-environment jsdom
import { render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { makeMockFetcher } from '../../__tests__/helpers';
import type { EventLogEntry } from '../../types/common';
import { FastYokeProvider } from '../context';
import { WorkflowHistory } from '../WorkflowHistory';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const BOOTSTRAP: EventLogEntry = {
  id: 'ev-0',
  job_id: 'j-1',
  event_type: '__created__',
  from_state: null,
  to_state: 'pending',
  timestamp: '2026-04-21T00:00:00Z',
  actor: null,
  reason: null,
};

const APPROVE: EventLogEntry = {
  id: 'ev-1',
  job_id: 'j-1',
  event_type: 'approve',
  from_state: 'pending',
  to_state: 'approved',
  timestamp: '2026-04-21T01:00:00Z',
  actor: 'alice@example.com',
  reason: null,
};

const ADMIN_CANCEL: EventLogEntry = {
  id: 'ev-2',
  job_id: 'j-1',
  event_type: '__admin_cancel__',
  from_state: 'approved',
  to_state: 'rejected',
  timestamp: '2026-04-21T02:00:00Z',
  actor: 'operator@example.com',
  reason: 'customer requested reversal',
};

function mount(script: Parameters<typeof makeMockFetcher>[0]) {
  const { fetcher, requests } = makeMockFetcher(script);
  const ui = render(
    <FastYokeProvider tenantId="t-1" fetcher={fetcher}>
      <WorkflowHistory jobId="j-1" />
    </FastYokeProvider>,
  );
  return { ui, requests };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('WorkflowHistory', () => {
  it('shows a loading status on first render', () => {
    // Non-resolving fetcher so the loading branch sticks.
    const fetcher = vi.fn(() => new Promise<Response>(() => {}));
    render(
      <FastYokeProvider tenantId="t-1" fetcher={fetcher}>
        <WorkflowHistory jobId="j-1" />
      </FastYokeProvider>,
    );
    expect(screen.getByRole('status')).toHaveTextContent(/loading history/i);
  });

  it('surfaces API errors into an alert region', async () => {
    mount([{ status: 500, json: { error: 'db exploded' } }]);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/db exploded/);
  });

  it('shows a friendly empty state when the log is empty', async () => {
    mount([{ json: [] as EventLogEntry[] }]);

    await waitFor(() =>
      expect(screen.getByText(/no history yet/i)).toBeInTheDocument(),
    );
  });

  it('renders a table row per entry with humanized event types', async () => {
    mount([{ json: [BOOTSTRAP, APPROVE, ADMIN_CANCEL] }]);

    const table = await screen.findByRole('table');
    const rows = within(table).getAllByRole('row');
    // 1 header row + 3 data rows.
    expect(rows).toHaveLength(4);

    // Row 1 — bootstrap: "Created", no from_state.
    const bootstrapRow = rows[1];
    const bootstrapCells = within(bootstrapRow).getAllByRole('cell');
    expect(bootstrapCells[1]).toHaveTextContent('Created');
    // State change cell renders the target only, with an em-dash
    // prefix marking "no prior state".
    expect(bootstrapCells[2]).toHaveTextContent('pending');
    expect(bootstrapCells[2]).not.toHaveTextContent(/→/);

    // Row 2 — FSM transition: raw event_type, from → to arrow.
    const approveRow = rows[2];
    const approveCells = within(approveRow).getAllByRole('cell');
    expect(approveCells[1]).toHaveTextContent('approve');
    expect(approveCells[2]).toHaveTextContent('pending');
    expect(approveCells[2]).toHaveTextContent('approved');
    expect(approveCells[2]).toHaveTextContent('→');
    expect(approveCells[3]).toHaveTextContent('alice@example.com');

    // Row 3 — admin cancel: humanized, reason populated (the audit
    // invariant pinned by Phase 9 + admin_cancel tests).
    const cancelRow = rows[3];
    const cancelCells = within(cancelRow).getAllByRole('cell');
    expect(cancelCells[1]).toHaveTextContent('Admin cancelled');
    expect(cancelCells[3]).toHaveTextContent('operator@example.com');
    expect(cancelCells[4]).toHaveTextContent('customer requested reversal');
  });

  it('renders a placeholder dash for missing actor / reason', async () => {
    // BOOTSTRAP has null actor + null reason; both cells should
    // carry the em-dash placeholder rather than empty text.
    mount([{ json: [BOOTSTRAP] }]);

    const row = (await screen.findAllByRole('row'))[1];
    const cells = within(row).getAllByRole('cell');
    expect(cells[3]).toHaveTextContent('—');
    expect(cells[4]).toHaveTextContent('—');
    // a11y label so screen readers say "no actor recorded" instead
    // of just reading the dash glyph.
    expect(within(cells[3]).getByLabelText(/no actor/i)).toBeInTheDocument();
  });

  it('accepts a custom formatTimestamp prop', async () => {
    mount([{ json: [BOOTSTRAP] }]);

    // Default format is locale-dependent; re-render with the
    // override to pin a deterministic output.
    const stallingFetcher: () => Promise<Response> = () =>
      new Promise<Response>(() => {});
    const { rerender } = render(
      <FastYokeProvider tenantId="t-1" fetcher={stallingFetcher}>
        <WorkflowHistory
          jobId="j-1"
          formatTimestamp={(iso) => `FIXED:${iso}`}
        />
      </FastYokeProvider>,
    );
    // Above render is just to assert the prop type compiles —
    // functional coverage below uses the mount helper and a
    // synchronous expectation on the rendered cell.
    rerender(<></>);

    // Ensure the override actually runs by wiring a second mount
    // that returns data immediately through the mock fetcher.
    const { fetcher } = makeMockFetcher([{ json: [BOOTSTRAP] }]);
    render(
      <FastYokeProvider tenantId="t-1" fetcher={fetcher}>
        <WorkflowHistory
          jobId="j-1"
          formatTimestamp={(iso) => `FIXED:${iso}`}
        />
      </FastYokeProvider>,
    );
    await waitFor(() =>
      expect(
        screen.getByText(`FIXED:${BOOTSTRAP.timestamp}`),
      ).toBeInTheDocument(),
    );
  });
});
