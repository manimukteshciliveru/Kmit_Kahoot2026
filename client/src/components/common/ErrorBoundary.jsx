import React from 'react';

class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error) {
        return { hasError: true, error };
    }

    componentDidCatch(error, errorInfo) {
        console.error('ErrorBoundary caught an error:', error, errorInfo);
    }

    render() {
        if (this.state.hasError) {
            return (
                <div style={{
                    padding: '2rem',
                    textAlign: 'center',
                    background: 'var(--bg-card)',
                    borderRadius: '12px',
                    margin: '2rem',
                    border: '1px solid var(--danger)'
                }}>
                    <h2 style={{ color: 'var(--danger)' }}>Something went wrong</h2>
                    <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>
                        The application encountered an error. You can try refreshing the page.
                    </p>
                    <button
                        className="btn btn-primary"
                        onClick={() => window.location.reload()}
                    >
                        Refresh Page
                    </button>
                    {process.env.NODE_ENV === 'development' && (
                        <details style={{ marginTop: '1rem', textAlign: 'left', fontSize: '0.8rem' }}>
                            <summary>Error Details</summary>
                            <pre style={{ whiteSpace: 'pre-wrap', color: 'var(--danger)' }}>
                                {this.state.error?.toString()}
                            </pre>
                        </details>
                    )}
                </div>
            );
        }

        return this.props.children;
    }
}

export default ErrorBoundary;
