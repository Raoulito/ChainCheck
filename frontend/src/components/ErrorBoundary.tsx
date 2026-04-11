import { Component, type ReactNode, type ErrorInfo } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('React render crash:', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen flex items-center justify-center p-8" style={{ background: 'var(--cs-bg-deep)', color: 'var(--cs-text-primary)' }}>
          <div className="max-w-xl rounded-xl p-6" style={{ background: 'var(--cs-red-dim)', border: '1px solid var(--cs-red)' }}>
            <h2 className="text-lg font-bold font-display mb-2" style={{ color: 'var(--cs-red)' }}>Render Error</h2>
            <pre className="text-sm font-mono whitespace-pre-wrap break-words" style={{ color: 'var(--cs-red)', opacity: 0.8 }}>
              {this.state.error.message}
            </pre>
            <pre className="text-xs font-mono mt-2 whitespace-pre-wrap break-words max-h-40 overflow-auto" style={{ color: 'var(--cs-red)', opacity: 0.5 }}>
              {this.state.error.stack}
            </pre>
            <button
              onClick={() => this.setState({ error: null })}
              className="cs-btn-danger mt-4"
            >
              Try Again
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
