import { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Sun, Moon, Keyboard, Volume2 } from 'lucide-react';
import { cn } from '../lib/utils';
import { useSpeechService } from '../hooks/useSpeechService';
import { AppSettings } from '../types/settings';
import ShortcutsPanel from './settings/ShortcutsPanel';
import AgentSettingsSection from './settings/AgentSettingsSection';
import LookSettingsSection from './settings/LookSettingsSection';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  platform: string;
  theme: 'light' | 'dark';
  contextToggleEnabled?: boolean;
  onContextToggleChange?: (enabled: boolean) => void;
  appSettings: AppSettings;
  onSettingsChange: (settings: Partial<AppSettings>) => void;
}

export default function SettingsModal({
  isOpen,
  onClose,
  platform,
  theme: initialTheme,
  contextToggleEnabled = true,
  onContextToggleChange,
  appSettings,
  onSettingsChange,
}: SettingsModalProps) {
  const [theme, setTheme] = useState<'light' | 'dark'>(initialTheme);
  const [blurAmount, setBlurAmount] = useState(20); // Default blur amount
  const [blurType, setBlurType] = useState<'acrylic' | 'mica' | 'standard'>('acrylic'); // Blur type
  const [showShortcuts, setShowShortcuts] = useState(false);

  const modalRef = useRef<HTMLDivElement>(null);

  // Speech service integration
  const speechService = useSpeechService();
  const [speechSettings, setSpeechSettings] = useState({
    speed: 1.0,
    pitch: 1.0,
    volume: 0.8,
    voice: 'default',
    language: 'en-US',
    streamingEnabled: true,
    ggwaveEnabled: false
  });

  useEffect(() => {
    setTheme(initialTheme);
  }, [initialTheme]);

  useEffect(() => {
    if (!window.pip || !isOpen) return;
    return window.pip.onThemeChanged((newTheme) => setTheme(newTheme));
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
            className="fixed inset-0 bg-black/70 backdrop-blur-md z-50"
            onClick={onClose}
          />
          
          {/* Modal */}
          <div className="fixed inset-0 flex items-center justify-center p-4 z-50" onClick={(e) => e.stopPropagation()}>
            <motion.div
              ref={modalRef}
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              onClick={(e) => e.stopPropagation()}
              style={{
                backdropFilter: `blur(${blurAmount}px) saturate(180%)`,
                WebkitBackdropFilter: `blur(${blurAmount}px) saturate(180%)`
              }}
              className={cn(
                "w-72 max-w-[90vw] max-h-[85vh] overflow-y-auto",
                "rounded-2xl border shadow-[0_12px_60px_rgba(0,0,0,0.6)]",
                // YouTube-like scrollbars
                platform === 'win32' || theme === 'dark' ? "scrollbar-youtube" : "scrollbar-youtube-light",
                // Theme-aware styling with less transparency
                theme === 'dark' 
                  ? "border-white/30 text-white/95" 
                  : "border-black/30 text-black/95",
                // Platform-specific backgrounds with reduced transparency
                platform === 'win32' 
                  ? "bg-black/60" // More opaque for Windows acrylic
                  : theme === 'dark'
                    ? "bg-linear-to-b from-gray-900/95 to-gray-800/95"
                    : "bg-linear-to-b from-gray-100/95 to-gray-200/95"
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
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowShortcuts(!showShortcuts)}
                  className={cn(
                    "p-1.5 rounded-lg transition-colors",
                    platform === 'win32' 
                      ? "hover:bg-white/10"
                      : theme === 'dark' ? "hover:bg-white/10" : "hover:bg-black/10"
                  )}
                  title="Keyboard shortcuts"
                >
                  <Keyboard className="w-4 h-4" />
                </button>
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
            </div>

            <AnimatePresence>
              {showShortcuts && <ShortcutsPanel platform={platform} theme={theme} />}
            </AnimatePresence>


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
                            ? "bg-black/20 border-black/30"
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
                            ? "bg-white/20 border-white/30"
                            : "border-black/10 bg-black/5 hover:bg-black/10"
                      )}
                    >
                      <Moon className="w-4 h-4" />
                      <span className="text-sm">Dark</span>
                    </button>
                  </div>
                </div>

                {/* UI Settings */}
                <div className="space-y-3">
                  <h4 className={cn(
                    "text-sm font-medium",
                    platform === 'win32'
                      ? "text-white/80"
                      : theme === 'dark' ? "text-white/80" : "text-black/80"
                  )}>Interface</h4>
                  
                  {/* Font Size */}
                  <div className="space-y-2">
                    <label className={cn(
                      "text-xs font-medium",
                      platform === 'win32'
                        ? "text-white/80"
                        : theme === 'dark' ? "text-white/80" : "text-black/80"
                    )}>Font Size</label>
                    <div className="grid grid-cols-5 gap-1">
                      {(['xs', 'sm', 'base', 'lg', 'xl'] as const).map((size) => (
                        <button
                          key={size}
                          onClick={() => onSettingsChange({ 
                            ui: { ...appSettings.ui, fontSize: size } 
                          })}
                          className={cn(
                            "px-2 py-1.5 text-xs rounded-sm transition-all border",
                            appSettings.ui.fontSize === size
                              ? "bg-white/10 border-white/25 text-white"
                              : platform === 'win32'
                                ? "border-white/10 bg-white/5 hover:bg-white/10 text-white/80"
                                : theme === 'dark' 
                                  ? "border-white/10 bg-white/5 hover:bg-white/10 text-white/80"
                                  : "border-black/10 bg-black/5 hover:bg-black/10 text-black/80"
                          )}
                        >
                          {size.toUpperCase()}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Message Spacing */}
                  <div className="space-y-2">
                    <label className={cn(
                      "text-xs font-medium",
                      platform === 'win32'
                        ? "text-white/80"
                        : theme === 'dark' ? "text-white/80" : "text-black/80"
                    )}>Message Spacing</label>
                    <div className="grid grid-cols-3 gap-2">
                      {(['compact', 'normal', 'comfortable'] as const).map((spacing) => (
                        <button
                          key={spacing}
                          onClick={() => onSettingsChange({ 
                            ui: { ...appSettings.ui, messageSpacing: spacing } 
                          })}
                          className={cn(
                            "px-2 py-1.5 text-xs rounded-sm transition-all border",
                            appSettings.ui.messageSpacing === spacing
                              ? "bg-white/10 border-white/25 text-white"
                              : platform === 'win32'
                                ? "border-white/10 bg-white/5 hover:bg-white/10 text-white/80"
                                : theme === 'dark' 
                                  ? "border-white/10 bg-white/5 hover:bg-white/10 text-white/80"
                                  : "border-black/10 bg-black/5 hover:bg-black/10 text-black/80"
                          )}
                        >
                          {spacing.charAt(0).toUpperCase() + spacing.slice(1)}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Message Padding */}
                  <div className="space-y-2">
                    <label className={cn(
                      "text-xs font-medium",
                      platform === 'win32'
                        ? "text-white/80"
                        : theme === 'dark' ? "text-white/80" : "text-black/80"
                    )}>Message Padding</label>
                    <div className="grid grid-cols-3 gap-2">
                      {(['tight', 'normal', 'spacious'] as const).map((padding) => (
                        <button
                          key={padding}
                          onClick={() => onSettingsChange({ 
                            ui: { ...appSettings.ui, messagePadding: padding } 
                          })}
                          className={cn(
                            "px-2 py-1.5 text-xs rounded-sm transition-all border",
                            appSettings.ui.messagePadding === padding
                              ? "bg-white/10 border-white/25 text-white"
                              : platform === 'win32'
                                ? "border-white/10 bg-white/5 hover:bg-white/10 text-white/80"
                                : theme === 'dark' 
                                  ? "border-white/10 bg-white/5 hover:bg-white/10 text-white/80"
                                  : "border-black/10 bg-black/5 hover:bg-black/10 text-black/80"
                          )}
                        >
                          {padding.charAt(0).toUpperCase() + padding.slice(1)}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Native Windows acrylic owns the window edge and corner radius. */}
                  {platform !== 'win32' && <>
                  <div className="space-y-2">
                    <label className={cn(
                      "text-xs font-medium",
                      platform === 'win32'
                        ? "text-white/80"
                        : theme === 'dark' ? "text-white/80" : "text-black/80"
                    )}>Window Padding</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="range"
                        min="0"
                        max="32"
                        step="2"
                        value={appSettings.ui.windowPadding}
                        onChange={(e) => onSettingsChange({ 
                          ui: { ...appSettings.ui, windowPadding: parseInt(e.target.value) } 
                        })}
                        className="flex-1 h-2 bg-white/10 rounded-lg appearance-none slider"
                      />
                      <span className={cn(
                        "text-xs font-mono min-w-12 text-right",
                        platform === 'win32'
                          ? "text-white/60"
                          : theme === 'dark' ? "text-white/60" : "text-black/60"
                      )}>
                        {appSettings.ui.windowPadding}px
                      </span>
                    </div>
                    <p className={cn(
                      "text-xs",
                      platform === 'win32'
                        ? "text-white/50"
                        : theme === 'dark' ? "text-white/50" : "text-black/50"
                    )}>
                      Spacing around chat container (0px = full window)
                    </p>
                  </div>

                  {/* Border Radius */}
                  <div className="space-y-2">
                    <label className={cn(
                      "text-xs font-medium",
                      platform === 'win32'
                        ? "text-white/80"
                        : theme === 'dark' ? "text-white/80" : "text-black/80"
                    )}>Corner Radius</label>
                    <div className="grid grid-cols-4 gap-1">
                      {(['none', 'sm', 'md', 'lg', 'xl', '2xl', '3xl'] as const).map((radius) => (
                        <button
                          key={radius}
                          onClick={() => onSettingsChange({ 
                            ui: { ...appSettings.ui, borderRadius: radius } 
                          })}
                          className={cn(
                            "px-2 py-1.5 text-xs rounded-sm transition-all border",
                            appSettings.ui.borderRadius === radius
                              ? "bg-white/10 border-white/25 text-white"
                              : platform === 'win32'
                                ? "border-white/10 bg-white/5 hover:bg-white/10 text-white/80"
                                : theme === 'dark' 
                                  ? "border-white/10 bg-white/5 hover:bg-white/10 text-white/80"
                                  : "border-black/10 bg-black/5 hover:bg-black/10 text-black/80"
                          )}
                        >
                          {radius === 'none' ? '□' : radius.toUpperCase()}
                        </button>
                      ))}
                    </div>
                    <p className={cn(
                      "text-xs",
                      platform === 'win32'
                        ? "text-white/50"
                        : theme === 'dark' ? "text-white/50" : "text-black/50"
                    )}>
                      Rounded corners of chat container
                    </p>
                  </div>
                  </>}
                </div>
              </div>

              <LookSettingsSection dark={platform === 'win32' || theme === 'dark'} />

                {/* Windows Acrylic Settings — desktop only */}
                <div className="space-y-3">
                  <h3 className={cn(
                    "text-sm font-medium",
                    platform === 'win32'
                      ? "text-white/80"
                      : theme === 'dark' ? "text-white/80" : "text-black/80"
                  )}>Visual Effects</h3>
                  
                  {/* Blur Amount */}
                  <div className="space-y-2">
                    <label className={cn(
                      "text-xs font-medium",
                      platform === 'win32'
                        ? "text-white/80"
                        : theme === 'dark' ? "text-white/80" : "text-black/80"
                    )}>Blur Amount</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="range"
                        min="5"
                        max="50"
                        step="5"
                        value={blurAmount}
                        onChange={(e) => setBlurAmount(parseInt(e.target.value))}
                        className="flex-1 h-2 bg-white/10 rounded-lg appearance-none slider"
                      />
                      <span className={cn(
                        "text-xs font-mono min-w-12 text-right",
                        platform === 'win32'
                          ? "text-white/60"
                          : theme === 'dark' ? "text-white/60" : "text-black/60"
                      )}>
                        {blurAmount}px
                      </span>
                    </div>
                  </div>

                  {/* Blur Type (Windows only) */}
                  {platform === 'win32' && (
                    <div className="space-y-2">
                      <label className={cn(
                        "text-xs font-medium",
                        "text-white/80"
                      )}>Acrylic Type</label>
                      <div className="grid grid-cols-3 gap-2">
                        {(['acrylic', 'mica', 'standard'] as const).map((type) => (
                          <button
                            key={type}
                            onClick={() => setBlurType(type)}
                            className={cn(
                              "px-2 py-1.5 text-xs rounded-sm transition-all border",
                              blurType === type
                                ? "bg-white/10 border-white/25 text-white"
                                : "border-white/10 bg-white/5 hover:bg-white/10 text-white/80"
                            )}
                          >
                            {type.charAt(0).toUpperCase() + type.slice(1)}
                          </button>
                        ))}
                      </div>
                      <p className="text-xs text-white/50">
                        Different Windows acrylic materials for varied transparency effects.
                      </p>
                    </div>
                  )}
                </div>

              {/* Context Section — desktop only */}
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
                        className="w-3 h-3 rounded-sm border"
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

              <AgentSettingsSection platform={platform} theme={theme} />


              {/* Speech Settings Section — desktop only */}
              <div className="space-y-3">
                <h3 className={cn(
                  "text-sm font-medium",
                  platform === 'win32'
                    ? "text-white/80"
                    : theme === 'dark' ? "text-white/80" : "text-black/80"
                )}>Speech Service</h3>
                
                <div className="space-y-3">
                  {/* Connection Status */}
                  <div className={cn(
                    "p-3 rounded-lg border",
                    speechService.isConnected 
                      ? "bg-green-500/10 border-green-500/20"
                      : "bg-red-500/10 border-red-500/20"
                  )}>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <div className={cn(
                          "w-2 h-2 rounded-full",
                          speechService.isConnected ? "bg-green-400" : "bg-red-400"
                        )} />
                        <span className="text-xs font-medium">
                          {speechService.isConnected ? "Connected" : "Disconnected"}
                        </span>
                      </div>
                      <button
                        onClick={speechService.isConnected ? speechService.disconnect : speechService.connect}
                        className={cn(
                          "px-2 py-1 text-xs rounded-sm border transition-colors",
                          speechService.isConnected
                            ? "bg-red-500/20 border-red-500/30 text-red-400 hover:bg-red-500/30"
                            : "bg-green-500/20 border-green-500/30 text-green-400 hover:bg-green-500/30"
                        )}
                      >
                        {speechService.isConnected ? "Disconnect" : "Connect"}
                      </button>
                    </div>
                    <p className={cn(
                      "text-xs",
                      platform === 'win32'
                        ? "text-white/60"
                        : theme === 'dark' ? "text-white/60" : "text-black/60"
                    )}>
                      WebSocket: localhost:8765 • Auto-reconnect enabled
                    </p>
                    {speechService.speechError && (
                      <p className="text-xs text-red-400 mt-1">
                        Error: {speechService.speechError}
                      </p>
                    )}
                  </div>

                  {/* Voice Settings */}
                  <div className={cn(
                    "p-3 rounded-lg border",
                    platform === 'win32'
                      ? "bg-white/5 border-white/10"
                      : theme === 'dark' 
                        ? "bg-white/5 border-white/10"
                        : "bg-black/5 border-black/10"
                  )}>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium">Voice Settings</span>
                        <button
                          onClick={() => speechService.synthesizeSpeech("Hello! This is a test of the speech system.")}
                          disabled={!speechService.isConnected}
                          className={cn(
                            "px-2 py-1 text-xs rounded-sm border transition-colors disabled:opacity-50",
                            platform === 'win32'
                              ? "bg-white/10 border-white/25 text-white hover:bg-white/15"
                              : theme === 'dark' 
                                ? "bg-white/10 border-white/25 text-white hover:bg-white/15"
                                : "bg-white/10 border-white/25 text-white hover:bg-white/15"
                          )}
                        >
                          <Volume2 className="w-3 h-3 inline mr-1" />
                          Test TTS
                        </button>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className={cn(
                            "text-xs",
                            platform === 'win32'
                              ? "text-white/60"
                              : theme === 'dark' ? "text-white/60" : "text-black/60"
                          )}>Voice</label>
                          <select 
                            value={speechSettings.voice}
                            onChange={(e) => setSpeechSettings(prev => ({ ...prev, voice: e.target.value }))}
                            className={cn(
                              "w-full mt-1 px-2 py-1 text-xs rounded-sm border",
                              platform === 'win32'
                                ? "bg-white/5 border-white/10 text-white"
                                : theme === 'dark' 
                                  ? "bg-white/5 border-white/10 text-white"
                                  : "bg-black/5 border-black/10 text-black"
                            )}
                          >
                            <option value="default">Default Voice</option>
                            <option value="neural-en-us-1">Neural EN-US Female</option>
                            <option value="neural-en-us-2">Neural EN-US Male</option>
                            <option value="neural-en-gb-1">Neural EN-GB Female</option>
                          </select>
                        </div>
                        <div>
                          <label className={cn(
                            "text-xs",
                            platform === 'win32'
                              ? "text-white/60"
                              : theme === 'dark' ? "text-white/60" : "text-black/60"
                          )}>Language</label>
                          <select 
                            value={speechSettings.language}
                            onChange={(e) => setSpeechSettings(prev => ({ ...prev, language: e.target.value }))}
                            className={cn(
                              "w-full mt-1 px-2 py-1 text-xs rounded-sm border",
                              platform === 'win32'
                                ? "bg-white/5 border-white/10 text-white"
                                : theme === 'dark' 
                                  ? "bg-white/5 border-white/10 text-white"
                                  : "bg-black/5 border-black/10 text-black"
                            )}
                          >
                            <option value="en-US">English (US)</option>
                            <option value="en-GB">English (UK)</option>
                            <option value="es-ES">Spanish</option>
                            <option value="fr-FR">French</option>
                            <option value="de-DE">German</option>
                          </select>
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-3">
                        <div>
                          <label className={cn(
                            "text-xs",
                            platform === 'win32'
                              ? "text-white/60"
                              : theme === 'dark' ? "text-white/60" : "text-black/60"
                          )}>Speed: {speechSettings.speed.toFixed(1)}x</label>
                          <input
                            type="range"
                            min="0.5"
                            max="2.0"
                            step="0.1"
                            value={speechSettings.speed}
                            onChange={(e) => setSpeechSettings(prev => ({ ...prev, speed: parseFloat(e.target.value) }))}
                            className="w-full mt-1 h-1 bg-white/10 rounded-lg appearance-none slider"
                          />
                        </div>
                        <div>
                          <label className={cn(
                            "text-xs",
                            platform === 'win32'
                              ? "text-white/60"
                              : theme === 'dark' ? "text-white/60" : "text-black/60"
                          )}>Pitch: {speechSettings.pitch.toFixed(1)}x</label>
                          <input
                            type="range"
                            min="0.5"
                            max="2.0"
                            step="0.1"
                            value={speechSettings.pitch}
                            onChange={(e) => setSpeechSettings(prev => ({ ...prev, pitch: parseFloat(e.target.value) }))}
                            className="w-full mt-1 h-1 bg-white/10 rounded-lg appearance-none slider"
                          />
                        </div>
                        <div>
                          <label className={cn(
                            "text-xs",
                            platform === 'win32'
                              ? "text-white/60"
                              : theme === 'dark' ? "text-white/60" : "text-black/60"
                          )}>Volume: {Math.round(speechSettings.volume * 100)}%</label>
                          <input
                            type="range"
                            min="0"
                            max="1"
                            step="0.1"
                            value={speechSettings.volume}
                            onChange={(e) => setSpeechSettings(prev => ({ ...prev, volume: parseFloat(e.target.value) }))}
                            className="w-full mt-1 h-1 bg-white/10 rounded-lg appearance-none slider"
                          />
                        </div>
                      </div>

                      <div className="flex items-center justify-between text-xs">
                        <label className="flex items-center gap-2">
                          <input 
                            type="checkbox" 
                            checked={speechSettings.streamingEnabled}
                            onChange={(e) => setSpeechSettings(prev => ({ ...prev, streamingEnabled: e.target.checked }))}
                            className="w-3 h-3" 
                          />
                          <span className={cn(
                            platform === 'win32'
                              ? "text-white/60"
                              : theme === 'dark' ? "text-white/60" : "text-black/60"
                          )}>Streaming TTS</span>
                        </label>
                        <label className="flex items-center gap-2">
                          <input 
                            type="checkbox" 
                            checked={speechSettings.ggwaveEnabled}
                            onChange={(e) => setSpeechSettings(prev => ({ ...prev, ggwaveEnabled: e.target.checked }))}
                            className="w-3 h-3" 
                          />
                          <span className={cn(
                            platform === 'win32'
                              ? "text-white/60"
                              : theme === 'dark' ? "text-white/60" : "text-black/60"
                          )}>GGWave Mode</span>
                        </label>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <section className="space-y-2">
                <h3 className="text-sm font-medium">Chat greeting</h3>
                <p className="text-xs opacity-60">Your selected Claude Code or Codex model writes the greeting automatically.</p>
              </section>
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
                  <p>Ally v2.0.0 · Claude Code + Codex frontend</p>
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
