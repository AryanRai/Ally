import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Sun, Moon, Monitor } from 'lucide-react';
import { cn } from '../lib/utils';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  platform: string;
  theme: 'light' | 'dark';
}

export default function SettingsModal({ isOpen, onClose, platform, theme: initialTheme }: SettingsModalProps) {
  const [theme, setTheme] = useState<'light' | 'dark'>(initialTheme);

  useEffect(() => {
    setTheme(initialTheme);
  }, [initialTheme]);

  useEffect(() => {
    if (!window.pip || !isOpen) return;

    // Listen for theme changes
    const cleanup = window.pip.onThemeChanged((newTheme) => {
      setTheme(newTheme);
    });

    return cleanup;
  }, [isOpen]);

  const handleThemeChange = (newTheme: 'light' | 'dark') => {
    if (!window.pip) return;
    window.pip.setTheme(newTheme);
    setTheme(newTheme);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50"
            onClick={onClose}
          />
          
          {/* Modal */}
          <div className="fixed inset-0 flex items-center justify-center p-4 z-50">
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className={cn(
                "w-80 max-w-full max-h-[90vh] overflow-y-auto",
                "rounded-2xl border shadow-[0_8px_40px_rgba(0,0,0,0.4)]",
                // Theme-aware styling
                theme === 'dark' 
                  ? "border-white/20 text-white/90" 
                  : "border-black/20 text-black/90",
                // Platform-specific backgrounds
                platform === 'win32' 
                  ? "bg-black/20" // Let Windows acrylic handle the background
                  : theme === 'dark'
                    ? "bg-gradient-to-b from-gray-900/90 to-gray-800/90 backdrop-blur-2xl backdrop-saturate-150"
                    : "bg-gradient-to-b from-gray-100/90 to-gray-200/90 backdrop-blur-2xl backdrop-saturate-150"
              )}
            >
            {/* Header */}
            <div className={cn(
              "flex items-center justify-between p-4 border-b",
              platform === 'win32'
                ? "border-white/10"
                : theme === 'dark' ? "border-white/10" : "border-black/10"
            )}>
              <h2 className="text-lg font-semibold">Settings</h2>
              <button
                onClick={onClose}
                className={cn(
                  "p-1.5 rounded-lg transition-colors",
                  platform === 'win32' 
                    ? "hover:bg-white/10"
                    : theme === 'dark' ? "hover:bg-white/10" : "hover:bg-black/10"
                )}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Content */}
            <div className="p-4 space-y-6">
              {/* Theme Section */}
              <div className="space-y-3">
                <h3 className={cn(
                  "text-sm font-medium",
                  platform === 'win32'
                    ? "text-white/80"
                    : theme === 'dark' ? "text-white/80" : "text-black/80"
                )}>Appearance</h3>
                
                <div className="space-y-2">
                  <label className={cn(
                    "text-xs",
                    platform === 'win32'
                      ? "text-white/60"
                      : theme === 'dark' ? "text-white/60" : "text-black/60"
                  )}>Theme</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => handleThemeChange('light')}
                      className={cn(
                        "flex items-center gap-2 p-3 rounded-xl transition-all border",
                        platform === 'win32'
                          ? theme === 'light'
                            ? "bg-white/20 border-white/30"
                            : "border-white/10 bg-white/5 hover:bg-white/10"
                          : theme === 'light' 
                            ? theme === 'dark'
                              ? "bg-white/20 border-white/30" 
                              : "bg-black/20 border-black/30"
                            : theme === 'dark'
                              ? "border-white/10 bg-white/5 hover:bg-white/10"
                              : "border-black/10 bg-black/5 hover:bg-black/10"
                      )}
                    >
                      <Sun className="w-4 h-4" />
                      <span className="text-sm">Light</span>
                    </button>
                    
                    <button
                      onClick={() => handleThemeChange('dark')}
                      className={cn(
                        "flex items-center gap-2 p-3 rounded-xl transition-all border",
                        platform === 'win32'
                          ? theme === 'dark'
                            ? "bg-white/20 border-white/30"
                            : "border-white/10 bg-white/5 hover:bg-white/10"
                          : theme === 'dark' 
                            ? theme === 'dark'
                              ? "bg-white/20 border-white/30" 
                              : "bg-black/20 border-black/30"
                            : theme === 'dark'
                              ? "border-white/10 bg-white/5 hover:bg-white/10"
                              : "border-black/10 bg-black/5 hover:bg-black/10"
                      )}
                    >
                      <Moon className="w-4 h-4" />
                      <span className="text-sm">Dark</span>
                    </button>
                  </div>
                </div>

                {platform === 'win32' && (
                  <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
                    <div className="flex items-center gap-2 mb-1">
                      <Monitor className="w-3 h-3" />
                      <span className="text-xs font-medium">Windows Acrylic</span>
                    </div>
                    <p className="text-xs text-white/60">
                      Theme changes will affect the acrylic background material for better system integration.
                    </p>
                  </div>
                )}
              </div>

              {/* Context Section */}
              <div className="space-y-3">
                <h3 className={cn(
                  "text-sm font-medium",
                  platform === 'win32'
                    ? "text-white/80"
                    : theme === 'dark' ? "text-white/80" : "text-black/80"
                )}>Context Monitoring</h3>
                
                <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/20">
                  <div className="flex items-center gap-2 mb-1">
                    <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
                    <span className="text-xs font-medium">Active</span>
                  </div>
                  <p className={cn(
                    "text-xs",
                    platform === 'win32'
                      ? "text-white/60"
                      : theme === 'dark' ? "text-white/60" : "text-black/60"
                  )}>
                    Clipboard and selection monitoring is enabled. Context will appear automatically when available.
                  </p>
                </div>
              </div>

              {/* Info Section */}
              <div className="space-y-2">
                <h3 className={cn(
                  "text-sm font-medium",
                  platform === 'win32'
                    ? "text-white/80"
                    : theme === 'dark' ? "text-white/80" : "text-black/80"
                )}>About</h3>
                <div className={cn(
                  "text-xs space-y-1",
                  platform === 'win32'
                    ? "text-white/60"
                    : theme === 'dark' ? "text-white/60" : "text-black/60"
                )}>
                  <p>Glass PiP Chat v1.0.0</p>
                  <p>Platform: {platform}</p>
                  <p>Press Ctrl+Shift+C to toggle visibility</p>
                </div>
              </div>
            </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}