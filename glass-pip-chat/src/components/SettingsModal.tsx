import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Sun, Moon, Monitor, Server, Wifi, WifiOff, RefreshCw } from 'lucide-react';
import { cn } from '../lib/utils';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  platform: string;
  theme: 'light' | 'dark';
  contextToggleEnabled?: boolean;
  onContextToggleChange?: (enabled: boolean) => void;
}

export default function SettingsModal({ 
  isOpen, 
  onClose, 
  platform, 
  theme: initialTheme, 
  contextToggleEnabled = true,
  onContextToggleChange 
}: SettingsModalProps) {
  const [theme, setTheme] = useState<'light' | 'dark'>(initialTheme);
  const [serverStatus, setServerStatus] = useState<any>(null);
  const [ollamaStatus, setOllamaStatus] = useState<{ available: boolean; models: any[] }>({ available: false, models: [] });
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    setTheme(initialTheme);
  }, [initialTheme]);

  useEffect(() => {
    if (!window.pip || !isOpen) return;

    // Listen for theme changes
    const cleanup = window.pip.onThemeChanged((newTheme) => {
      setTheme(newTheme);
    });

    // Load server status and Ollama info when modal opens
    const loadStatus = async () => {
      try {
        const [server, ollamaAvailable, models] = await Promise.all([
          window.pip.server?.getStatus(),
          window.pip.ollama?.isAvailable(),
          window.pip.ollama?.getModels().catch(() => [])
        ]);
        
        setServerStatus(server);
        setOllamaStatus({
          available: ollamaAvailable || false,
          models: models || []
        });
      } catch (error) {
        console.error('Failed to load status information:', error);
      }
    };

    loadStatus();

    return cleanup;
  }, [isOpen]);

  const handleThemeChange = (newTheme: 'light' | 'dark') => {
    if (!window.pip) return;
    window.pip.setTheme(newTheme);
    setTheme(newTheme);
  };

  const handleRefreshStatus = async () => {
    if (!window.pip || isRefreshing) return;
    
    setIsRefreshing(true);
    try {
      const [server, ollamaAvailable, models] = await Promise.all([
        window.pip.server?.checkStatus(),
        window.pip.ollama?.isAvailable(),
        window.pip.ollama?.getModels().catch(() => [])
      ]);
      
      setServerStatus(server);
      setOllamaStatus({
        available: ollamaAvailable || false,
        models: models || []
      });
    } catch (error) {
      console.error('Failed to refresh status:', error);
    } finally {
      setIsRefreshing(false);
    }
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
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
                    <span className="text-xs font-medium">Active</span>
                  </div>
                  <p className={cn(
                    "text-xs mb-3",
                    platform === 'win32'
                      ? "text-white/60"
                      : theme === 'dark' ? "text-white/60" : "text-black/60"
                  )}>
                    Clipboard and selection monitoring is enabled. Context appears when new content is copied.
                  </p>
                  
                  <div className="space-y-2">
                    <label className={cn(
                      "text-xs font-medium",
                      platform === 'win32'
                        ? "text-white/80"
                        : theme === 'dark' ? "text-white/80" : "text-black/80"
                    )}>Smart Context Mode</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={contextToggleEnabled}
                        onChange={(e) => onContextToggleChange?.(e.target.checked)}
                        className="w-3 h-3 rounded border"
                      />
                      <span className={cn(
                        "text-xs",
                        platform === 'win32'
                          ? "text-white/60"
                          : theme === 'dark' ? "text-white/60" : "text-black/60"
                      )}>
                        Only show context for new copies while app is open
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Ollama Section */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className={cn(
                    "text-sm font-medium",
                    platform === 'win32'
                      ? "text-white/80"
                      : theme === 'dark' ? "text-white/80" : "text-black/80"
                  )}>Ollama AI</h3>
                  <button
                    onClick={handleRefreshStatus}
                    disabled={isRefreshing}
                    className={cn(
                      "p-1 rounded transition-colors",
                      platform === 'win32' 
                        ? "hover:bg-white/10"
                        : theme === 'dark' ? "hover:bg-white/10" : "hover:bg-black/10"
                    )}
                    title="Refresh status"
                  >
                    <RefreshCw className={cn("w-3 h-3", isRefreshing && "animate-spin")} />
                  </button>
                </div>
                
                <div className={cn(
                  "p-3 rounded-lg border",
                  ollamaStatus.available 
                    ? "bg-green-500/10 border-green-500/20" 
                    : "bg-red-500/10 border-red-500/20"
                )}>
                  <div className="flex items-center gap-2 mb-2">
                    <div className={cn(
                      "w-2 h-2 rounded-full",
                      ollamaStatus.available ? "bg-green-400" : "bg-red-400"
                    )} />
                    <span className="text-xs font-medium">
                      {ollamaStatus.available ? "Connected" : "Offline"}
                    </span>
                  </div>
                  <p className={cn(
                    "text-xs mb-2",
                    platform === 'win32'
                      ? "text-white/60"
                      : theme === 'dark' ? "text-white/60" : "text-black/60"
                  )}>
                    {ollamaStatus.available 
                      ? `Connected to Ollama. ${ollamaStatus.models.length} model(s) available.`
                      : "Ollama is not running. Please start Ollama to enable AI responses."
                    }
                  </p>
                  
                  {ollamaStatus.available && ollamaStatus.models.length > 0 && (
                    <div className="space-y-1">
                      <span className={cn(
                        "text-xs font-medium",
                        platform === 'win32'
                          ? "text-white/80"
                          : theme === 'dark' ? "text-white/80" : "text-black/80"
                      )}>Available Models:</span>
                      <div className="flex flex-wrap gap-1">
                        {ollamaStatus.models.slice(0, 3).map((model) => (
                          <span
                            key={model.name}
                            className={cn(
                              "px-2 py-0.5 text-xs rounded border",
                              platform === 'win32'
                                ? "bg-white/5 border-white/10"
                                : theme === 'dark' 
                                  ? "bg-white/5 border-white/10"
                                  : "bg-black/5 border-black/10"
                            )}
                          >
                            {model.name}
                          </span>
                        ))}
                        {ollamaStatus.models.length > 3 && (
                          <span className={cn(
                            "px-2 py-0.5 text-xs rounded border",
                            platform === 'win32'
                              ? "bg-white/5 border-white/10"
                              : theme === 'dark' 
                                ? "bg-white/5 border-white/10"
                                : "bg-black/5 border-black/10"
                          )}>
                            +{ollamaStatus.models.length - 3} more
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Server Status Section */}
              <div className="space-y-3">
                <h3 className={cn(
                  "text-sm font-medium",
                  platform === 'win32'
                    ? "text-white/80"
                    : theme === 'dark' ? "text-white/80" : "text-black/80"
                )}>Server Status</h3>
                
                {serverStatus ? (
                  <div className={cn(
                    "p-3 rounded-lg border",
                    serverStatus.status === 'online' 
                      ? "bg-green-500/10 border-green-500/20"
                      : serverStatus.status === 'offline'
                        ? "bg-red-500/10 border-red-500/20"
                        : "bg-yellow-500/10 border-yellow-500/20"
                  )}>
                    <div className="flex items-center gap-2 mb-2">
                      <div className={cn(
                        "w-2 h-2 rounded-full",
                        serverStatus.status === 'online' ? "bg-green-400" : 
                        serverStatus.status === 'offline' ? "bg-red-400" : "bg-yellow-400"
                      )} />
                      <span className="text-xs font-medium capitalize">
                        {serverStatus.status}
                      </span>
                      {serverStatus.status === 'online' && <Wifi className="w-3 h-3" />}
                      {serverStatus.status === 'offline' && <WifiOff className="w-3 h-3" />}
                    </div>
                    
                    <div className={cn(
                      "space-y-1 text-xs",
                      platform === 'win32'
                        ? "text-white/60"
                        : theme === 'dark' ? "text-white/60" : "text-black/60"
                    )}>
                      <div className="flex items-center gap-2">
                        <Server className="w-3 h-3" />
                        <span>{serverStatus.domain || serverStatus.ip}</span>
                      </div>
                      {serverStatus.uptime !== undefined && (
                        <p>Uptime: {Math.floor(serverStatus.uptime / 3600)}h {Math.floor((serverStatus.uptime % 3600) / 60)}m</p>
                      )}
                      {serverStatus.load !== undefined && (
                        <p>Load: {serverStatus.load.toFixed(1)}%</p>
                      )}
                      <p>Last checked: {new Date(serverStatus.lastCheck).toLocaleTimeString()}</p>
                    </div>
                  </div>
                ) : (
                  <div className="p-3 rounded-lg bg-gray-500/10 border border-gray-500/20">
                    <p className={cn(
                      "text-xs",
                      platform === 'win32'
                        ? "text-white/60"
                        : theme === 'dark' ? "text-white/60" : "text-black/60"
                    )}>
                      Loading server status...
                    </p>
                  </div>
                )}
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