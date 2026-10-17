import { useState, useEffect } from 'react';

export type WindowSize = 'S' | 'M' | 'L';

export const sizePx: Record<WindowSize, { w: number; h: number }> = {
  S: { w: 320, h: 420 },
  M: { w: 400, h: 560 },
  L: { w: 480, h: 680 },
};

const STORAGE_KEY = 'glass_pip_state';

interface PiPState {
  size: WindowSize;
  collapsed: boolean;
}

/** Overlay window state: size preset, collapsed pill, platform and theme. */
export function useWindowManagement() {
  const [state, setState] = useState<PiPState>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
      return { size: saved.size ?? 'M', collapsed: !!saved.collapsed };
    } catch {
      return { size: 'M', collapsed: false };
    }
  });
  const [platform, setPlatform] = useState('');
  const [theme, setTheme] = useState<'light' | 'dark'>('dark');
  const [isResizing, setIsResizing] = useState(false);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  useEffect(() => {
    const pip = window.pip;
    if (!pip) return;
    pip.getPlatform().then(setPlatform).catch(console.error);
    pip.getTheme().then(setTheme).catch(console.error);
    const cleanupResize = pip.onResizeComplete?.(() => setIsResizing(false));
    const cleanupTheme = pip.onThemeChanged(setTheme);
    return () => {
      cleanupResize?.();
      cleanupTheme();
    };
  }, []);

  const handleSizeChange = () => {
    setState(prev => ({ ...prev, size: prev.size === 'S' ? 'M' : prev.size === 'M' ? 'L' : 'S' }));
  };

  const handleCollapseToggle = () => {
    setState(prev => ({ ...prev, collapsed: !prev.collapsed }));
  };

  const handleHide = () => window.pip?.hide();

  return {
    state,
    platform,
    theme,
    isResizing,
    setIsResizing,
    sizePx,
    handleSizeChange,
    handleCollapseToggle,
    handleHide,
  };
}
