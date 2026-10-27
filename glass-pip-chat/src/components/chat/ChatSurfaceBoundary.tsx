import { Component, type ReactNode } from 'react';

/** A failed transcript must leave a visible way back into the selected chat. */
export class ChatSurfaceBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (this.state.failed) return <main role="alert" style={{ padding: 24, color: '#f7f7f8', background: '#101114', height: '100%' }}>
      <h2>Chat couldn’t display this page</h2>
      <p>Your selected chat and saved draft are kept.</p>
      <button type="button" onClick={() => location.reload()}>Reload chat</button>
    </main>;
    return this.props.children;
  }
}
