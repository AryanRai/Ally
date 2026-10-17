import { useEffect, useRef } from 'react';

export interface ShortcutActions {
  toggleCollapse: () => void;
  openSettings: () => void;
  newChat: () => void;
  hide: () => void;
  cycleSize: () => void;
  toggleSidebar: () => void;
  toggleContext: () => void;
  focusInput: () => void;
  stop: () => void;
  /** Input history for ↑/↓ recall, newest last */
  history: string[];
  isTyping: boolean;
}

/** In-window shortcuts plus the global hotkeys forwarded from the main process. */
export function useKeyboardShortcuts(actions: ShortcutActions) {
  // Always read the latest actions without re-binding listeners each render
  const ref = useRef(actions);
  ref.current = actions;
  const historyIndex = useRef(-1);

  useEffect(() => {
    return window.pip?.onShortcut(event => {
      const a = ref.current;
      if (event === 'toggle-collapse') a.toggleCollapse();
      else if (event === 'cycle-size') a.cycleSize();
      else if (event === 'toggle-context') a.toggleContext();
      else a.focusInput();
    });
  }, []);

  useEffect(() => {
    const setInputValue = (el: HTMLInputElement | HTMLTextAreaElement, value: string) => {
      // Go through the native setter so React's onChange sees the change
      const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, 'value')?.set?.call(el, value);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    };

    const onKeyDown = (event: KeyboardEvent) => {
      const a = ref.current;
      const el = document.activeElement as HTMLElement | null;
      const inInput = !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
      const mod = event.ctrlKey || event.metaKey;
      const run = (fn: () => void) => {
        event.preventDefault();
        fn();
      };

      if (mod && event.shiftKey) {
        const map: Record<string, () => void> = { C: a.toggleCollapse, S: a.openSettings, N: a.newChat, H: a.hide, R: a.cycleSize };
        if (map[event.key]) return run(map[event.key]);
      }

      const fkeys: Record<string, () => void> = { F1: a.openSettings, F2: a.newChat, F3: a.toggleCollapse, F4: a.cycleSize, F5: a.toggleSidebar };
      if (fkeys[event.key]) return run(fkeys[event.key]);

      if (event.key === 'Escape') {
        if (inInput) {
          historyIndex.current = -1;
          el!.blur();
        } else {
          a.hide();
        }
        return run(() => {});
      }

      if (mod && !event.shiftKey) {
        const map: Record<string, () => void> = { n: a.newChat, s: a.openSettings, h: a.hide, w: a.hide, r: a.cycleSize, '.': a.stop };
        const fn = map[event.key.toLowerCase()];
        if (fn) return run(fn);
      }

      if (inInput && (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) {
        // In a multi-line draft the arrows move the caret, not through history
        const singleLine = !el.value.includes('\n');
        if (event.key === 'ArrowUp' && singleLine && a.history.length > 0) {
          historyIndex.current = Math.min(historyIndex.current + 1, a.history.length - 1);
          return run(() => setInputValue(el, a.history[a.history.length - 1 - historyIndex.current]));
        }
        if (event.key === 'ArrowDown' && singleLine && historyIndex.current >= 0) {
          historyIndex.current -= 1;
          const value = historyIndex.current >= 0 ? a.history[a.history.length - 1 - historyIndex.current] : '';
          return run(() => setInputValue(el, value));
        }
        if (mod && event.key === 'k') {
          historyIndex.current = -1;
          return run(() => setInputValue(el, ''));
        }
        return;
      }

      if (event.key === '/') run(a.focusInput);
    };

    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, []);
}
