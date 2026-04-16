/**
 * hello-fastyoke — reference FastYoke extension.
 *
 * Demonstrates the end-to-end load path:
 *   upload → virus scan → registry → custom:* block render
 *
 * As of Phase 3 Step 1b, both `react` and `@fastyoke/sdk` resolve
 * through the host's import map to shared module instances, so this
 * extension looks identical to any React component anywhere — plain
 * imports, JSX, hooks. No more window bridges.
 */
import { useState } from 'react';
import { useFastYoke, type ExtensionBlockProps } from '@fastyoke/sdk';

export function HelloCard(props: ExtensionBlockProps) {
  // Live-prove the SDK hook resolves to the same module instance the
  // host mounted. If extensions and the host saw separate instances,
  // useFastYoke would throw ("provider missing") because the context
  // was created on a different React + different SDK.
  const { tenantId, projectId } = useFastYoke();

  // Demonstrate that extension-local state works — same React
  // reconciler, same hook dispatcher, same everything.
  const [clicks, setClicks] = useState(0);

  const greeting =
    (props.config.greeting as string | undefined) ?? 'Hello from an extension!';
  const accent =
    (props.config.accent as string | undefined) ?? '#4f46e5';

  return (
    <div
      style={{
        border: `1px solid ${accent}`,
        borderRadius: '0.5rem',
        padding: '1rem',
        background: '#fff',
        fontFamily: 'system-ui, sans-serif',
      }}
    >
      <div
        style={{
          fontSize: '0.75rem',
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          color: accent,
          marginBottom: '0.25rem',
        }}
      >
        hello-fastyoke extension
      </div>
      <div style={{ fontSize: '1rem', color: '#111827' }}>{greeting}</div>
      <div
        style={{
          marginTop: '0.5rem',
          fontFamily: 'ui-monospace, monospace',
          fontSize: '0.7rem',
          color: '#6b7280',
        }}
      >
        tenant: {tenantId}
        {projectId ? ` · project: ${projectId}` : ''}
      </div>
      {props.record?.id ? (
        <div
          style={{
            fontFamily: 'ui-monospace, monospace',
            fontSize: '0.7rem',
            color: '#6b7280',
          }}
        >
          record: {String(props.record.id)}
        </div>
      ) : null}
      <button
        type="button"
        onClick={() => setClicks((c) => c + 1)}
        style={{
          marginTop: '0.5rem',
          padding: '0.25rem 0.5rem',
          border: `1px solid ${accent}`,
          background: 'transparent',
          color: accent,
          borderRadius: '0.25rem',
          cursor: 'pointer',
          fontSize: '0.75rem',
        }}
      >
        clicked {clicks}×
      </button>
    </div>
  );
}
