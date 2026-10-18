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
  manualSizes?: { collapsed?: Dimensions; expanded?: Dimensions };
}
type Dimensions = { width: number; height: number };
const validDimensions = (size: Dimensions | undefined): Dimensions | undefined => size && Number.isFinite(size.width) && Number.isFinite(size.height) && size.width >= 120 && size.width <= 800 && size.height >= 64 && size.height <= 1000 ? size : undefined;

/** Overlay window state: size preset, collapsed pill, platform and theme. */
export function useWindowManagement() {
  const [state, setState] = useState<PiPState>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
      return { size: saved.size ?? 'M', collapsed: !!saved.collapsed, manualSizes: { collapsed: validDimensions(saved.manualSizes?.collapsed), expanded: validDimensions(saved.manualSizes?.expanded) } };
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
    const cleanupManual = pip.onManualResize?.(size => {
      if (!validDimensions(size)) return;
      setIsResizing(false);
      setState(previous => {
        const mode = previous.collapsed ? 'collapsed' : 'expanded';
        const old = previous.manualSizes?.[mode];
        if (old?.width === size.width && old.height === size.height) return previous;
        return { ...previous, manualSizes: { ...previous.manualSizes, [mode]: size } };
      });
    });
    const cleanupTheme = pip.onThemeChanged(setTheme);
    return () => {
      cleanupResize?.();
      cleanupManual?.();
      cleanupTheme();
    };
  }, []);

  const handleSizeChange = () => {
    setState(prev => ({ ...prev, size: prev.size === 'S' ? 'M' : prev.size === 'M' ? 'L' : 'S', manualSizes: { ...prev.manualSizes, [prev.collapsed ? 'collapsed' : 'expanded']: undefined } }));
  };

  const handleCollapseToggle = () => {
    setState(prev => ({ ...prev, collapsed: !prev.collapsed }));
  };

  const handleHide = () => window.pip?.hide();

  return {
    state,
    manualSize: state.manualSizes?.[state.collapsed ? 'collapsed' : 'expanded'],
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
