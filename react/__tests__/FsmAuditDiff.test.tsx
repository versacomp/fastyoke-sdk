/**
 * Phase 25.4.5.3 dogfood — `<FsmAuditDiff />` + `matchAuditEntry`
 * tests.
 *
 * Covers the visible contract:
 *   • added / removed / changed / unchanged rows render with the
 *     expected sentinels (+ / − / ~ / ·)
 *   • `changesOnly` hides unchanged rows
 *   • empty-payload audits surface a friendly placeholder
 *   • no-change audits surface the "unchanged" placeholder when
 *     every key is equal
 *   • matchAuditEntry pairs by (from, to, event_type, timestamp)
 *     and returns undefined on miss
 */

// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { FsmAuditDiff, matchAuditEntry } from '../fsm-viewer/FsmAuditDiff';
import type { FsmAuditLogEntry } from '../../types/common';
import type { EntityHistoryEntry } from '../fsm-viewer/types';

function audit(
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null,
  overrides: Partial<FsmAuditLogEntry> = {},
): FsmAuditLogEntry {
  return {
    id: 'a-1',
    job_id: 'j-1',
    event_log_id: 'e-1',
    from_state: 'pending',
    to_state: 'approved',
    event_type: 'approve',
    payload_before: before === null ? null : JSON.stringify(before),
    payload_after: after === null ? null : JSON.stringify(after),
    timestamp: '2026-04-25T00:00:00Z',
    ...overrides,
  };
}

describe('<FsmAuditDiff />', () => {
  it('renders added / removed / changed / unchanged rows', () => {
    render(
      <FsmAuditDiff
        audit={audit(
          { weight: 12, carrier: 'ups', notes: 'a' },
          { weight: 14, carrier: 'ups', priority: 'high' },
        )}
      />,
    );
    expect(screen.getByTestId('fsm-audit-diff-changed-weight')).toBeInTheDocument();
    expect(screen.getByTestId('fsm-audit-diff-removed-notes')).toBeInTheDocument();
    expect(screen.getByTestId('fsm-audit-diff-added-priority')).toBeInTheDocument();
    // Unchanged rows render but have no per-row testid (intentional —
    // the "·" prefix + dimmed style is the visual signal).
    expect(screen.getByText('carrier')).toBeInTheDocument();
  });

  it('hides unchanged rows when changesOnly is true', () => {
    render(
      <FsmAuditDiff
        changesOnly
        audit={audit(
          { weight: 12, carrier: 'ups' },
          { weight: 14, carrier: 'ups' },
        )}
      />,
    );
    expect(screen.queryByText('carrier')).not.toBeInTheDocument();
    expect(screen.getByTestId('fsm-audit-diff-changed-weight')).toBeInTheDocument();
  });

  it('surfaces the no-change placeholder when payloads are equal', () => {
    render(
      <FsmAuditDiff
        changesOnly
        audit={audit({ weight: 12 }, { weight: 12 })}
      />,
    );
    expect(screen.getByTestId('fsm-audit-diff-nochange')).toBeInTheDocument();
  });

  it('surfaces the empty placeholder when both payloads are null', () => {
    render(<FsmAuditDiff audit={audit(null, null)} />);
    expect(screen.getByTestId('fsm-audit-diff-empty')).toBeInTheDocument();
  });

  it('handles unparseable payload strings as null', () => {
    const broken: FsmAuditLogEntry = {
      ...audit(null, null),
      payload_before: 'not json',
      payload_after: 'not json',
    };
    render(<FsmAuditDiff audit={broken} />);
    expect(screen.getByTestId('fsm-audit-diff-empty')).toBeInTheDocument();
  });
});

describe('matchAuditEntry', () => {
  const ROWS: FsmAuditLogEntry[] = [
    audit({ x: 1 }, { x: 2 }, {
      from_state: 'pending',
      to_state: 'approved',
      event_type: 'approve',
      timestamp: '2026-04-25T00:00:00Z',
    }),
    audit({ x: 2 }, { x: 3 }, {
      from_state: 'approved',
      to_state: 'shipped',
      event_type: 'ship',
      timestamp: '2026-04-25T01:00:00Z',
    }),
  ];

  it('pairs by (from, to, event_type, timestamp)', () => {
    const entry: EntityHistoryEntry = {
      from_state: 'approved',
      to_state: 'shipped',
      event_type: 'ship',
      timestamp: '2026-04-25T01:00:00Z',
    };
    const matched = matchAuditEntry(ROWS, entry);
    expect(matched?.id).toBe('a-1');
    expect(matched?.from_state).toBe('approved');
  });

  it('returns undefined when nothing matches', () => {
    const entry: EntityHistoryEntry = {
      from_state: 'pending',
      to_state: 'rejected',
      event_type: 'reject',
      timestamp: '2026-04-25T00:00:00Z',
    };
    expect(matchAuditEntry(ROWS, entry)).toBeUndefined();
  });
});
