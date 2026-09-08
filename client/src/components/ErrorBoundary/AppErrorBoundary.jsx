import { Component } from 'react';
import './AppErrorBoundary.css';

/**
 * Catches render errors anywhere below it and shows something explanatory.
 *
 * Without this the app is a bare SPA: one uncaught error unmounts the whole
 * tree and leaves a white page with nothing on it. That is exactly how the
 * wallpaper crash presented — a blank profile, no clue why, and the only way to
 * find out was the browser console.
 *
 * A class component because error boundaries have no hook equivalent; React
 * offers componentDidCatch and getDerivedStateFromError only on classes.
 */
export default class AppErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // Kept in the console: this is the detail a bug report needs, and there is
    // no error-reporting service configured to send it to.
    console.error('Unhandled error in the UI:', error, info?.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="app-error">
        <div className="app-error-card">
          <h1 className="app-error-title">Something broke on this page</h1>
          <p className="app-error-text">
            This is a bug in webpost.ing, not something you did. The rest of the
            site should still work.
          </p>

          <div className="app-error-actions">
            <button type="button" className="app-error-btn app-error-btn--primary"
                    onClick={() => window.location.reload()}>
              Reload the page
            </button>
            <a className="app-error-btn app-error-btn--ghost" href="/">Go home</a>
          </div>

          {/* Collapsed rather than hidden: useless to most people, and the
              first thing anyone reporting the bug will be asked for. */}
          <details className="app-error-details">
            <summary>Technical details</summary>
            <pre className="app-error-stack">{String(error?.stack || error)}</pre>
          </details>
        </div>
      </div>
    );
  }
}
