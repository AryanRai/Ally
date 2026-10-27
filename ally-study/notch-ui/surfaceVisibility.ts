export function isSurfaceVisible() {
  return !document.hidden && (window as unknown as { __allySurfaceVisible?: boolean }).__allySurfaceVisible !== false;
}

/** Native removal/opacity alone does not reliably set WebView document.hidden. */
export function waitForSurfaceVisible(): Promise<void> {
  if (isSurfaceVisible()) return Promise.resolve();
  return new Promise(resolve => {
    const wake = () => {
      if (!isSurfaceVisible()) return;
      document.removeEventListener('visibilitychange', wake);
      window.removeEventListener('ally-surface-visibility', wake);
      resolve();
    };
    document.addEventListener('visibilitychange', wake);
    window.addEventListener('ally-surface-visibility', wake);
  });
}
