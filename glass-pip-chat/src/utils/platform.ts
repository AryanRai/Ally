/**
 * Platform Detection
 *
 * Detects whether the app is running inside Electron or as a web page.
 * Used to switch between local (Electron) and remote (Supabase) transports.
 */

const forceWeb = import.meta.env.VITE_WEB_MODE === 'true';

export const isElectron = !forceWeb && typeof window !== 'undefined' && !!window.pip;
export const isWeb = !isElectron;

/**
 * In web mode, the app should:
 * - Start fully expanded (no PiP collapse)
 * - Route messages through Supabase instead of local Ollama
 * - Hide Electron-only controls (window resize, hide, etc.)
 * - Show auth UI if not signed in
 */
export const platform = {
  isElectron,
  isWeb,
  /** Whether local Ollama is available */
  hasLocalOllama: isElectron && !!window.pip?.ollama,
  /** Whether window management APIs are available */
  hasWindowManagement: isElectron && !!window.pip?.resizeWindow,
} as const;
