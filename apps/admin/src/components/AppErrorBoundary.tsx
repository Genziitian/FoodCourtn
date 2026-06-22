import React from 'react';

interface State {
  error: Error | null;
}

export class AppErrorBoundary extends React.Component<React.PropsWithChildren, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('Admin app render failed:', error, info);
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="min-h-screen bg-slate-50 grid place-items-center p-6">
        <div className="max-w-lg rounded-2xl bg-white border border-slate-200 shadow-card p-6">
          <p className="text-xs font-bold uppercase tracking-widest text-rose-600">Admin app error</p>
          <h1 className="mt-2 text-xl font-extrabold text-slate-900">This page hit a render error.</h1>
          <p className="mt-2 text-sm text-slate-600">
            Refresh once. If it keeps happening, copy the message below from this screen.
          </p>
          <pre className="mt-4 max-h-48 overflow-auto rounded-xl bg-slate-950 p-3 text-xs text-slate-100 whitespace-pre-wrap">
            {this.state.error.message || String(this.state.error)}
          </pre>
          <button
            onClick={() => window.location.reload()}
            className="mt-4 rounded-full bg-brand-600 px-4 py-2 text-sm font-bold text-white hover:bg-brand-700"
          >
            Reload
          </button>
        </div>
      </div>
    );
  }
}
