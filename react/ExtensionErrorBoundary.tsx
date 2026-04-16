import { Component, type ErrorInfo, type ReactNode } from 'react';

/**
 * Per-extension error boundary. Isolates a single extension's runtime
 * crash so one misbehaving bundle doesn't unmount the host shell or
 * sibling extensions. Mounted by `<ExtensionProvider>` around every
 * registered component before it enters the React tree.
 *
 * Rendered fallback is intentionally muted — an extension that crashes
 * should not draw attention from end users. Admins can inspect the
 * browser console for the captured stack.
 */
interface Props {
  extensionId: string;
  children: ReactNode;
}

interface State {
  err: Error | null;
}

export class ExtensionErrorBoundary extends Component<Props, State> {
  state: State = { err: null };

  static getDerivedStateFromError(err: Error): State {
    return { err };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    // eslint-disable-next-line no-console
    console.error(
      `[fastyoke-sdk] extension "${this.props.extensionId}" crashed:`,
      error,
      info,
    );
  }

  override render(): ReactNode {
    if (this.state.err) {
      return (
        <div
          role="alert"
          style={{
            padding: '0.5rem 0.75rem',
            fontSize: '0.75rem',
            color: '#b91c1c',
            background: '#fef2f2',
            border: '1px solid #fecaca',
            borderRadius: '0.25rem',
          }}
        >
          Extension <code>{this.props.extensionId}</code> failed to render.
        </div>
      );
    }
    return this.props.children;
  }
}
