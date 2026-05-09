import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { WorkflowSection } from '../react/workflow/WorkflowSection';

const sampleJob = {
  id: 'j1',
  tenant_id: 't1',
  schema_id: 's1',
  schema_name: 'Order Workflow',
  current_state: 'submitted',
  context_record_id: 'rec-1',
  updated_at: '2026-04-30T10:00:00Z',
};

const sampleSchemaResponse = {
  id: 's1',
  tenant_id: 't1',
  name: 'Order Workflow',
  version: 1,
  is_active: true,
  created_at: '2026-04-01T00:00:00Z',
  entity_name: 'order',
  schema_json: {
    initial_state: 'draft',
    states: ['draft', 'submitted', 'approved', 'rejected'],
    transitions: [
      { from: 'draft', to: 'submitted', event_type: 'submit' },
      { from: 'submitted', to: 'approved', event_type: 'approve' },
      { from: 'submitted', to: 'rejected', event_type: 'reject' },
    ],
  },
};

function makeFetcher(
  transitionStatus: { calls: number; mode: 'success' | 'fail-then-success' | 'always-fail' } = {
    calls: 0,
    mode: 'success',
  },
) {
  const fetcher = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
    if (url.includes('/transition') && init?.method === 'POST') {
      transitionStatus.calls += 1;
      if (transitionStatus.mode === 'always-fail') {
        return Promise.resolve({
          ok: false,
          status: 409,
          json: async () => ({ error: 'guard failed' }),
        });
      }
      if (transitionStatus.mode === 'fail-then-success' && transitionStatus.calls === 1) {
        return Promise.resolve({
          ok: false,
          status: 409,
          json: async () => ({ error: 'guard failed' }),
        });
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({ ...sampleJob, current_state: 'approved' }),
      });
    }
    if (url.includes('/jobs?')) {
      return Promise.resolve({ ok: true, json: async () => [sampleJob] });
    }
    if (url.includes('/schemas/s1')) {
      return Promise.resolve({ ok: true, json: async () => sampleSchemaResponse });
    }
    if (url.includes('/schemas?')) {
      return Promise.resolve({ ok: true, json: async () => [sampleSchemaResponse] });
    }
    if (url.includes('/history')) {
      return Promise.resolve({
        ok: true,
        json: async () => [
          {
            id: 'e1',
            job_id: 'j1',
            event_type: 'submitted',
            from_state: 'draft',
            to_state: 'submitted',
            actor: 'a@b.c',
            timestamp: '2026-04-30T10:00:00Z',
          },
          {
            id: 'e2',
            job_id: 'j1',
            event_type: '__admin_cancel__',
            from_state: 'submitted',
            to_state: 'cancelled',
            reason: 'forced cancel',
            actor: 'op@x.y',
            timestamp: '2026-04-29T10:00:00Z',
          },
        ],
      });
    }
    return Promise.reject(new Error(`unexpected url: ${url}`));
  });
  return fetcher;
}

describe('WorkflowSection', () => {
  it('renders the current state badge from the active job', async () => {
    const fetcher = makeFetcher();
    render(
      <WorkflowSection
        tenantId="t1"
        entityName="order"
        entityId="rec-1"
        fetcher={fetcher as unknown as typeof fetch}
      />,
    );
    await waitFor(() => expect(screen.getByText('submitted')).toBeInTheDocument());
  });

  it('renders one button per legal outgoing transition', async () => {
    const fetcher = makeFetcher();
    render(
      <WorkflowSection
        tenantId="t1"
        entityName="order"
        entityId="rec-1"
        fetcher={fetcher as unknown as typeof fetch}
      />,
    );
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'approve' })).toBeInTheDocument(),
    );
    expect(screen.getByRole('button', { name: 'reject' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'submit' })).not.toBeInTheDocument();
  });

  it('reverts optimistic update on 409 and shows the error', async () => {
    const status = { calls: 0, mode: 'always-fail' as const };
    const fetcher = makeFetcher(status);
    render(
      <WorkflowSection
        tenantId="t1"
        entityName="order"
        entityId="rec-1"
        fetcher={fetcher as unknown as typeof fetch}
      />,
    );
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'approve' })).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole('button', { name: 'approve' }));
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(/guard failed/i),
    );
    // Badge reverted to "submitted" — assert via the section header span that
    // wears the badge styling. There are also history rows mentioning
    // "submitted" so a plain getByText would be ambiguous.
    const badge = screen
      .getAllByText('submitted')
      .find((n) => n.className.includes('rounded-full'));
    expect(badge).toBeTruthy();
    // And no "approved" badge (the optimistic update was reverted).
    const approvedBadge = screen
      .queryAllByText('approved')
      .find((n) => n.className.includes('rounded-full'));
    expect(approvedBadge).toBeUndefined();
  });

  it('renders admin-cancel reason in history', async () => {
    const fetcher = makeFetcher();
    render(
      <WorkflowSection
        tenantId="t1"
        entityName="order"
        entityId="rec-1"
        fetcher={fetcher as unknown as typeof fetch}
      />,
    );
    await waitFor(() => expect(screen.getByText(/forced cancel/i)).toBeInTheDocument());
  });

  it('shows "Start workflow" empty state when schema exists but no active jobs', async () => {
    const fetcher = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/jobs?')) return Promise.resolve({ ok: true, json: async () => [] });
      if (url.includes('/schemas?'))
        return Promise.resolve({ ok: true, json: async () => [sampleSchemaResponse] });
      return Promise.reject(new Error(`unexpected ${url}`));
    });
    render(
      <WorkflowSection
        tenantId="t1"
        entityName="order"
        entityId="rec-1"
        fetcher={fetcher as unknown as typeof fetch}
      />,
    );
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /start workflow/i })).toBeInTheDocument(),
    );
  });
});
