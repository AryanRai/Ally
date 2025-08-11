import { useState, useEffect } from 'react';

type Size = 'S' | 'M' | 'L';

const sizePx: Record<Size, { w: number; h: number }> = {
  S: { w: 320, h: 420 },
  M: { w: 400, h: 560 },
  L: { w: 520, h: 680 },
};

const STORAGE_KEY = 'glass_pip_state';

interface PiPState {
  x: number;
  y: number;
  size: Size;
  collapsed: boolean;
}

export function useWindowManagement() {
  const [state, setState] = useState<PiPState>({
    x: 24,
    y: 24,
    size: 'M',
    collapsed: false
  });
  
  const [platform, setPlatform] = useState<string>('');
  const [theme, setTheme] = useState<'light' | 'dark'>('dark');
  const [isResizing, setIsResizing] = useState(false);
  const [serverStatus, setServerStatus] = useState<any>(null);

  // Load saved state
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setState(prev => ({ ...prev, ...parsed }));
      } catch (e) {
        console.error('Failed to parse saved state:', e);
      }
    }
  }, []);

  // Save state
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  // Test window.pip API availability and listen for resize completion
  useEffect(() => {
    console.log('window.pip available:', !!window.pip);
    if (window.pip) {
      console.log('window.pip methods:', Object.keys(window.pip));

      // Get platform info
      window.pip.getPlatform().then(setPlatform).catch(console.error);

      // Get initial theme
      window.pip.getTheme().then(setTheme).catch(console.error);

      // Listen for resize completion
      const cleanupResize = window.pip.onResizeComplete?.((size) => {
        console.log('Window resize completed:', size);
        setIsResizing(false);
      });

      // Listen for theme changes
      const cleanupTheme = window.pip.onThemeChanged?.((newTheme) => {
        setTheme(newTheme);
      });

      return () => {
        cleanupResize?.();
        cleanupTheme?.();
      };
    }
  }, []);

  // Server status monitoring
  useEffect(() => {
    if (!window.pip?.server) return;

    const checkServerStatus = async () => {
      try {
        const status = await window.pip.server.getStatus();
        setServerStatus(status);
      } catch (error) {
        console.error('Failed to get server status:', error);
      }
    };

    checkServerStatus();

    // Check server status every 30 seconds
    const interval = setInterval(checkServerStatus, 30000);

    return () => clearInterval(interval);
  }, []);

  // Handle escape key to hide window instead of destroying it
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        // Only hide if no input/textarea is focused and not in an editable element
        const activeElement = document.activeElement;
        const isInputFocused = activeElement && (
          activeElement.tagName === 'INPUT' || 
          activeElement.tagName === 'TEXTAREA' ||
          activeElement.contentEditable === 'true'
        );
        
        if (!isInputFocused) {
          event.preventDefault();
          event.stopPropagation();
          window.pip?.hide();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown, { capture: false });
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Sync window size when size state changes
  const syncWindowSize = (sidebarCollapsed: boolean) => {
    if (!window.pip) {
      console.warn('window.pip not available');
      return;
    }

    setIsResizing(true);
    const dims = sizePx[state.size];
    const sidebarWidth = state.collapsed ? 0 : (sidebarCollapsed ? 48 : 280);
    const width = dims.w + sidebarWidth;
    const height = state.collapsed ? 120 : dims.h;

    console.log('Resizing window to:', width, 'x', height, 'collapsed:', state.collapsed, 'sidebar:', sidebarWidth);

    // Use a small delay to ensure state has settled
    const resizeTimeout = setTimeout(() => {
      try {
        window.pip.resizeWindow(width, height);
      } catch (error) {
        console.error('Failed to resize window:', error);
      }
    }, 50);

    // Reset resizing state after animation
    const resetTimeout = setTimeout(() => setIsResizing(false), 400);

    return () => {
      clearTimeout(resizeTimeout);
      clearTimeout(resetTimeout);
    };
  };

  const handleSizeChange = () => {
    const nextSize: Size = state.size === 'S' ? 'M' : state.size === 'M' ? 'L' : 'S';
    setState(prev => ({ ...prev, size: nextSize }));
  };

  const handleCollapseToggle = () => {
    const newCollapsed = !state.collapsed;
    console.log('Toggling collapse from', state.collapsed, 'to', newCollapsed);

    // Update state - the useEffect will handle the window resize
    setState(prev => ({ ...prev, collapsed: newCollapsed }));
  };

  const handleHide = () => {
    window.pip?.hide();
  };

  return {
    state,
    setState,
    platform,
    theme,
    setTheme,
    isResizing,
    setIsResizing,
    serverStatus,
    sizePx,
    handleSizeChange,
    handleCollapseToggle,
    handleHide
  };
}