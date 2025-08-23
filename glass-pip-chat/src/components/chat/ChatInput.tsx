import { forwardRef } from 'react';
import { 
  CornerDownLeft, 
  Square, 
  Clipboard, 
  MousePointer 
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { ThemeUtils } from '../../utils/themeUtils';

interface ChatInputProps {
  platform: string;
  theme: 'light' | 'dark';
  input: string;
  setInput: (value: string) => void;
  onSend: () => void;
  isTyping: boolean;
  onStop: () => void;
  contextData: any;
  onExplainClipboard: () => void;
  onHelpSelected: () => void;
  onRunCommand: () => void;
}

const ChatInput = forwardRef<HTMLInputElement, ChatInputProps>(({
  platform,
  theme,
  input,
  setInput,
  onSend,
  isTyping,
  onStop,
  contextData,
  onExplainClipboard,
  onHelpSelected,
  onRunCommand
}, ref) => {
  return (
    <div className={cn(
      "border-t p-3",
      ThemeUtils.getBorderClass(platform, theme)
    )}>
      {/* Quick context actions */}
      <div className="flex flex-wrap gap-1 mb-2">
        {/* Context actions */}
        {contextData.clipboard && (
          <button
            onClick={onExplainClipboard}
            className={cn(
              "px-2 py-1 text-xs rounded-lg",
              "bg-blue-500/20 hover:bg-blue-500/30",
              "border border-blue-500/30",
              "transition-colors"
            )}
            title="Ask about clipboard content"
          >
            <Clipboard className="w-3 h-3 inline mr-1" />
            Explain
          </button>
        )}
        {contextData.selectedText && contextData.selectedText !== contextData.clipboard && (
          <button
            onClick={onHelpSelected}
            className={cn(
              "px-2 py-1 text-xs rounded-lg",
              "bg-purple-500/20 hover:bg-purple-500/30",
              "border border-purple-500/30",
              "transition-colors"
            )}
            title="Ask about selected text"
          >
            <MousePointer className="w-3 h-3 inline mr-1" />
            Help
          </button>
        )}

        {/* Command shortcuts */}
        <button
          onClick={onRunCommand}
          className={cn(
            "px-2 py-1 text-xs rounded-lg",
            "bg-green-500/20 hover:bg-green-500/30",
            "border border-green-500/30",
            "transition-colors"
          )}
          title="Run a system command"
        >
          <CornerDownLeft className="w-3 h-3 inline mr-1" />
          Run
        </button>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSend();
        }}
        className="flex items-center gap-2"
      >
        <input
          ref={ref}
          id="main-input"
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type a message..."
          className={cn(
            "flex-1 px-3 py-2 rounded-xl text-sm",
            platform !== 'win32' && "backdrop-blur-md",
            ThemeUtils.getInputClass(platform, theme)
          )}
        />
        <button
          type="submit"
          disabled={!input.trim() && !isTyping}
          onClick={(e) => {
            if (isTyping) {
              e.preventDefault();
              onStop();
            }
          }}
          className={cn(
            "p-2 rounded-xl transition-all",
            "disabled:opacity-50 disabled:cursor-not-allowed",
            platform !== 'win32' && "backdrop-blur-md",
            isTyping
              ? "bg-red-500/20 hover:bg-red-500/30 text-red-300"
              : ThemeUtils.getBackgroundClass(platform, theme, 'hover')
          )}
          title={isTyping ? "Stop" : "Send"}
        >
          {isTyping ? <Square className="w-4 h-4" /> : <CornerDownLeft className="w-4 h-4" />}
        </button>
      </form>
    </div>
  );
});

ChatInput.displayName = 'ChatInput';

export default ChatInput;