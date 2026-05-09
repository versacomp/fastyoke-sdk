/**
 * @vitest-environment jsdom
 *
 * Phase 45.4 — every editable LCAP catalog component binds
 * `aria-invalid` to the `invalid` prop and `aria-required` to
 * `annotation.required`. The matrix below is exhaustive: one row
 * per component, asserting both states (invalid → 'true' /
 * absent on valid; required → 'true' / absent on optional).
 */
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { ComponentType } from 'react';

import { TextInput } from '../react/lcap/components/TextInput';
import { TextArea } from '../react/lcap/components/TextArea';
import { NumberInput } from '../react/lcap/components/NumberInput';
import { DatePicker } from '../react/lcap/components/DatePicker';
import { Checkbox } from '../react/lcap/components/Checkbox';
import { Select } from '../react/lcap/components/Select';
import { FsmStatePicker } from '../react/lcap/components/FsmStatePicker';
import type {
  CatalogComponentProps,
  CatalogComponent,
} from '../react/lcap/components/types';
import type { EntityFieldAnnotation } from '../types/entityAnnotation';

interface RowSpec {
  name: string;
  Component: CatalogComponent;
  annotation: EntityFieldAnnotation;
  uiConfig?: Record<string, unknown>;
  value?: unknown;
}

// One row per editable catalog surface. FsmStatePicker has two
// branches (input vs select); both are covered.
const ROWS: RowSpec[] = [
  {
    name: 'TextInput',
    Component: TextInput as unknown as CatalogComponent,
    annotation: { field_key: 'f', field_type: 'string' },
  },
  {
    name: 'TextArea',
    Component: TextArea as unknown as CatalogComponent,
    annotation: { field_key: 'f', field_type: 'longtext' },
  },
  {
    name: 'NumberInput',
    Component: NumberInput as unknown as CatalogComponent,
    annotation: { field_key: 'f', field_type: 'number' },
  },
  {
    name: 'DatePicker',
    Component: DatePicker as unknown as CatalogComponent,
    annotation: { field_key: 'f', field_type: 'timestamp' },
  },
  {
    name: 'Checkbox',
    Component: Checkbox as unknown as CatalogComponent,
    annotation: { field_key: 'f', field_type: 'boolean' },
    value: false,
  },
  {
    name: 'Select',
    Component: Select as unknown as CatalogComponent,
    annotation: {
      field_key: 'f',
      field_type: 'enum',
      options_json: [{ value: 'a', label: 'A' }],
    },
  },
  {
    name: 'FsmStatePicker (input branch — no options)',
    Component: FsmStatePicker as unknown as CatalogComponent,
    annotation: { field_key: 'f', field_type: 'fsm_state_ref' },
  },
  {
    name: 'FsmStatePicker (select branch — has options)',
    Component: FsmStatePicker as unknown as CatalogComponent,
    annotation: {
      field_key: 'f',
      field_type: 'fsm_state_ref',
      options_json: [{ value: 's1', label: 'S1' }],
    },
  },
];

function renderRow(row: RowSpec, overrides: Partial<CatalogComponentProps>): void {
  const Component = row.Component as ComponentType<CatalogComponentProps>;
  render(
    <Component
      id="el"
      annotation={row.annotation}
      uiConfig={row.uiConfig ?? {}}
      value={row.value ?? ''}
      onChange={() => undefined}
      {...overrides}
    />,
  );
}

describe.each(ROWS)('45.4 aria attributes — $name', (row) => {
  it('omits aria-invalid when invalid prop is undefined or false', () => {
    renderRow(row, { invalid: false });
    expect(screen.getByTestId('smartfield-f')).not.toHaveAttribute('aria-invalid');
  });

  it('sets aria-invalid="true" when invalid prop is true', () => {
    renderRow(row, { invalid: true });
    expect(screen.getByTestId('smartfield-f')).toHaveAttribute('aria-invalid', 'true');
  });

  it('forwards describedBy to aria-describedby only when invalid', () => {
    renderRow(row, { invalid: true, describedBy: 'el-error' });
    expect(screen.getByTestId('smartfield-f')).toHaveAttribute(
      'aria-describedby',
      'el-error',
    );
  });

  it('does not stamp aria-describedby when valid (avoids dangling reference)', () => {
    renderRow(row, { invalid: false, describedBy: 'el-error' });
    expect(screen.getByTestId('smartfield-f')).not.toHaveAttribute(
      'aria-describedby',
    );
  });

  it('omits aria-required when annotation.required is unset', () => {
    renderRow(row, {});
    expect(screen.getByTestId('smartfield-f')).not.toHaveAttribute('aria-required');
  });

  it('sets aria-required="true" when annotation.required is true', () => {
    const required: RowSpec = {
      ...row,
      annotation: { ...row.annotation, required: true },
    };
    renderRow(required, {});
    expect(screen.getByTestId('smartfield-f')).toHaveAttribute(
      'aria-required',
      'true',
    );
  });
});
