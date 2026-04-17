import { Component } from 'react';
import type { ReactNode, ErrorInfo } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Glyph Studio error:', error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100vh',
          gap: '16px',
          background: '#000',
          color: '#fff',
          fontFamily: 'Inter, system-ui, sans-serif',
          fontWeight: 300,
        }}>
          <h1 style={{ fontSize: '14px', letterSpacing: '0.15em', textTransform: 'uppercase' as const }}>
            Something went wrong
          </h1>
          <p style={{ fontSize: '12px', opacity: 0.4, maxWidth: '400px', textAlign: 'center' as const }}>
            {this.state.error?.message}
          </p>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            style={{
              background: 'transparent',
              color: '#fff',
              border: '1px solid rgba(255,255,255,0.25)',
              padding: '8px 16px',
              cursor: 'pointer',
              fontSize: '12px',
              letterSpacing: '0.05em',
              textTransform: 'uppercase' as const,
              fontFamily: 'inherit',
              fontWeight: 300,
            }}
          >
            Try again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
