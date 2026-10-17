import { motion } from 'framer-motion';
import { cn } from '../../lib/utils';

interface ShortcutsPanelProps {
  platform: string;
  theme: 'light' | 'dark';
}

/** Keyboard shortcut reference shown at the top of the settings modal. */
export default function ShortcutsPanel({ platform, theme }: ShortcutsPanelProps) {
  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      className="overflow-hidden"
    >
      <div className={cn(
        "p-4 border-b",
        platform === 'win32'
          ? "border-white/10 bg-white/5"
          : theme === 'dark' ? "border-white/10 bg-white/5" : "border-black/10 bg-black/5"
      )}>
        <h3 className={cn(
          "text-sm font-medium mb-3",
          platform === 'win32'
            ? "text-white/80"
            : theme === 'dark' ? "text-white/80" : "text-black/80"
        )}>Keyboard Shortcuts</h3>
        
        <div className="space-y-4">
          {/* Global Shortcuts */}
          <div className="space-y-2">
            <h4 className={cn(
              "text-xs font-medium",
              platform === 'win32'
                ? "text-white/70"
                : theme === 'dark' ? "text-white/70" : "text-black/70"
            )}>🌐 Global Shortcuts (anywhere)</h4>
            <div className="grid grid-cols-1 gap-1 text-xs">
              <div className="flex justify-between items-center">
                <span className={cn(
                  platform === 'win32'
                    ? "text-white/60"
                    : theme === 'dark' ? "text-white/60" : "text-black/60"
                )}>Toggle collapse/expand</span>
                <kbd className={cn(
                  "px-2 py-0.5 rounded-sm text-xs font-mono",
                  platform === 'win32'
                    ? "bg-white/10 border border-white/20"
                    : theme === 'dark' ? "bg-white/10 border border-white/20" : "bg-black/10 border border-black/20"
                )}>Ctrl+Shift+C</kbd>
              </div>
              <div className="flex justify-between items-center">
                <span className={cn(
                  platform === 'win32'
                    ? "text-white/60"
                    : theme === 'dark' ? "text-white/60" : "text-black/60"
                )}>Open settings</span>
                <kbd className={cn(
                  "px-2 py-0.5 rounded-sm text-xs font-mono",
                  platform === 'win32'
                    ? "bg-white/10 border border-white/20"
                    : theme === 'dark' ? "bg-white/10 border border-white/20" : "bg-black/10 border border-black/20"
                )}>Ctrl+Shift+S</kbd>
              </div>
              <div className="flex justify-between items-center">
                <span className={cn(
                  platform === 'win32'
                    ? "text-white/60"
                    : theme === 'dark' ? "text-white/60" : "text-black/60"
                )}>New chat</span>
                <kbd className={cn(
                  "px-2 py-0.5 rounded-sm text-xs font-mono",
                  platform === 'win32'
                    ? "bg-white/10 border border-white/20"
                    : theme === 'dark' ? "bg-white/10 border border-white/20" : "bg-black/10 border border-black/20"
                )}>Ctrl+Shift+N</kbd>
              </div>
              <div className="flex justify-between items-center">
                <span className={cn(
                  platform === 'win32'
                    ? "text-white/60"
                    : theme === 'dark' ? "text-white/60" : "text-black/60"
                )}>Hide window</span>
                <kbd className={cn(
                  "px-2 py-0.5 rounded-sm text-xs font-mono",
                  platform === 'win32'
                    ? "bg-white/10 border border-white/20"
                    : theme === 'dark' ? "bg-white/10 border border-white/20" : "bg-black/10 border border-black/20"
                )}>Ctrl+Shift+H</kbd>
              </div>
              <div className="flex justify-between items-center">
                <span className={cn(
                  platform === 'win32'
                    ? "text-white/60"
                    : theme === 'dark' ? "text-white/60" : "text-black/60"
                )}>Resize window</span>
                <kbd className={cn(
                  "px-2 py-0.5 rounded-sm text-xs font-mono",
                  platform === 'win32'
                    ? "bg-white/10 border border-white/20"
                    : theme === 'dark' ? "bg-white/10 border border-white/20" : "bg-black/10 border border-black/20"
                )}>Ctrl+Shift+R</kbd>
              </div>
              <div className="flex justify-between items-center">
                <span className={cn(
                  platform === 'win32'
                    ? "text-white/60"
                    : theme === 'dark' ? "text-white/60" : "text-black/60"
                )}>Focus input</span>
                <kbd className={cn(
                  "px-2 py-0.5 rounded-sm text-xs font-mono",
                  platform === 'win32'
                    ? "bg-white/10 border border-white/20"
                    : theme === 'dark' ? "bg-white/10 border border-white/20" : "bg-black/10 border border-black/20"
                )}>/</kbd>
              </div>
            </div>
          </div>

          {/* Input Shortcuts */}
          <div className="space-y-2">
            <h4 className={cn(
              "text-xs font-medium",
              platform === 'win32'
                ? "text-white/70"
                : theme === 'dark' ? "text-white/70" : "text-black/70"
            )}>⌨️ Input Shortcuts (when typing)</h4>
            <div className="grid grid-cols-1 gap-1 text-xs">
              <div className="flex justify-between items-center">
                <span className={cn(
                  platform === 'win32'
                    ? "text-white/60"
                    : theme === 'dark' ? "text-white/60" : "text-black/60"
                )}>Previous message</span>
                <kbd className={cn(
                  "px-2 py-0.5 rounded-sm text-xs font-mono",
                  platform === 'win32'
                    ? "bg-white/10 border border-white/20"
                    : theme === 'dark' ? "bg-white/10 border border-white/20" : "bg-black/10 border border-black/20"
                )}>↑</kbd>
              </div>
              <div className="flex justify-between items-center">
                <span className={cn(
                  platform === 'win32'
                    ? "text-white/60"
                    : theme === 'dark' ? "text-white/60" : "text-black/60"
                )}>Next message</span>
                <kbd className={cn(
                  "px-2 py-0.5 rounded-sm text-xs font-mono",
                  platform === 'win32'
                    ? "bg-white/10 border border-white/20"
                    : theme === 'dark' ? "bg-white/10 border border-white/20" : "bg-black/10 border border-black/20"
                )}>↓</kbd>
              </div>
              <div className="flex justify-between items-center">
                <span className={cn(
                  platform === 'win32'
                    ? "text-white/60"
                    : theme === 'dark' ? "text-white/60" : "text-black/60"
                )}>Send message</span>
                <kbd className={cn(
                  "px-2 py-0.5 rounded-sm text-xs font-mono",
                  platform === 'win32'
                    ? "bg-white/10 border border-white/20"
                    : theme === 'dark' ? "bg-white/10 border border-white/20" : "bg-black/10 border border-black/20"
                )}>Enter</kbd>
              </div>
              <div className="flex justify-between items-center">
                <span className={cn(
                  platform === 'win32'
                    ? "text-white/60"
                    : theme === 'dark' ? "text-white/60" : "text-black/60"
                )}>Stop typing</span>
                <kbd className={cn(
                  "px-2 py-0.5 rounded-sm text-xs font-mono",
                  platform === 'win32'
                    ? "bg-white/10 border border-white/20"
                    : theme === 'dark' ? "bg-white/10 border border-white/20" : "bg-black/10 border border-black/20"
                )}>Ctrl+.</kbd>
              </div>
              <div className="flex justify-between items-center">
                <span className={cn(
                  platform === 'win32'
                    ? "text-white/60"
                    : theme === 'dark' ? "text-white/60" : "text-black/60"
                )}>Clear input</span>
                <kbd className={cn(
                  "px-2 py-0.5 rounded-sm text-xs font-mono",
                  platform === 'win32'
                    ? "bg-white/10 border border-white/20"
                    : theme === 'dark' ? "bg-white/10 border border-white/20" : "bg-black/10 border border-black/20"
                )}>Ctrl+K</kbd>
              </div>
            </div>
          </div>

          {/* Function Keys */}
          <div className="space-y-2">
            <h4 className={cn(
              "text-xs font-medium",
              platform === 'win32'
                ? "text-white/70"
                : theme === 'dark' ? "text-white/70" : "text-black/70"
            )}>📱 Function Keys</h4>
            <div className="grid grid-cols-1 gap-1 text-xs">
              <div className="flex justify-between items-center">
                <span className={cn(
                  platform === 'win32'
                    ? "text-white/60"
                    : theme === 'dark' ? "text-white/60" : "text-black/60"
                )}>Settings</span>
                <kbd className={cn(
                  "px-2 py-0.5 rounded-sm text-xs font-mono",
                  platform === 'win32'
                    ? "bg-white/10 border border-white/20"
                    : theme === 'dark' ? "bg-white/10 border border-white/20" : "bg-black/10 border border-black/20"
                )}>F1</kbd>
              </div>
              <div className="flex justify-between items-center">
                <span className={cn(
                  platform === 'win32'
                    ? "text-white/60"
                    : theme === 'dark' ? "text-white/60" : "text-black/60"
                )}>New chat</span>
                <kbd className={cn(
                  "px-2 py-0.5 rounded-sm text-xs font-mono",
                  platform === 'win32'
                    ? "bg-white/10 border border-white/20"
                    : theme === 'dark' ? "bg-white/10 border border-white/20" : "bg-black/10 border border-black/20"
                )}>F2</kbd>
              </div>
              <div className="flex justify-between items-center">
                <span className={cn(
                  platform === 'win32'
                    ? "text-white/60"
                    : theme === 'dark' ? "text-white/60" : "text-black/60"
                )}>Toggle collapse</span>
                <kbd className={cn(
                  "px-2 py-0.5 rounded-sm text-xs font-mono",
                  platform === 'win32'
                    ? "bg-white/10 border border-white/20"
                    : theme === 'dark' ? "bg-white/10 border border-white/20" : "bg-black/10 border border-black/20"
                )}>F3</kbd>
              </div>
              <div className="flex justify-between items-center">
                <span className={cn(
                  platform === 'win32'
                    ? "text-white/60"
                    : theme === 'dark' ? "text-white/60" : "text-black/60"
                )}>Resize window</span>
                <kbd className={cn(
                  "px-2 py-0.5 rounded-sm text-xs font-mono",
                  platform === 'win32'
                    ? "bg-white/10 border border-white/20"
                    : theme === 'dark' ? "bg-white/10 border border-white/20" : "bg-black/10 border border-black/20"
                )}>F4</kbd>
              </div>
            </div>
          </div>

          {/* Tips */}
          <div className="space-y-2">
            <h4 className={cn(
              "text-xs font-medium",
              platform === 'win32'
                ? "text-white/70"
                : theme === 'dark' ? "text-white/70" : "text-black/70"
            )}>💡 Tips</h4>
            <div className={cn(
              "text-xs space-y-1",
              platform === 'win32'
                ? "text-white/50"
                : theme === 'dark' ? "text-white/50" : "text-black/50"
            )}>
              <p>• Arrow keys recall earlier messages</p>
              <p>• Escape blurs the input, or hides the window</p>
              <p>• Ctrl+Shift+C works even when Ally is hidden</p>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
