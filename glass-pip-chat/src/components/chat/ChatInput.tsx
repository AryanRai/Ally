import { forwardRef, useState } from 'react';
import { 
  CornerDownLeft, 
  Square, 
  Clipboard, 
  MousePointer,
  Plus,
  X,
  ClipboardCopy,
  Wrench,
  Zap,
  ShieldCheck,
  ShieldAlert,
  Code2,
  Terminal,
  Cpu
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { ThemeUtils } from '../../utils/themeUtils';
import { Message } from '../../types/chat';

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
  placeholder?: string;
  // Extra toolbar props
  messages?: Message[];
  currentModel?: string;
  toolsEnabled?: boolean;
  agenticMode?: boolean;
  autopilotMode?: boolean;
  mcpToolCount?: number;
  onToolsToggle?: () => void;
  onAgenticModeToggle?: () => void;
  onAutopilotToggle?: () => void;
  ptcMode?: boolean;
  onPtcModeToggle?: () => void;
  /** Robot Control Mode — uses DroidCore/Comms v4.0 system prompt */
  robotMode?: boolean;
  onRobotModeToggle?: () => void;
  /** Terminal panel visibility + toggle */
  showTerminal?: boolean;
  onTerminalToggle?: () => void;
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
  onRunCommand,
  placeholder = 'Balalalala',
  messages = [],
  currentModel = 'unknown',
  toolsEnabled = false,
  agenticMode = false,
  autopilotMode = true,
  mcpToolCount = 0,
  onToolsToggle,
  onAgenticModeToggle,
  onAutopilotToggle,
  ptcMode = false,
  onPtcModeToggle,
  robotMode = false,
  onRobotModeToggle,
  showTerminal = false,
  onTerminalToggle,
}, ref) => {
  const [showToolbar, setShowToolbar] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCopyChatDebug = async () => {
    const lines: string[] = [
      `=== CHAT EXPORT ===`,
      `Exported: ${new Date().toLocaleString()}`,
      `Model: ${currentModel}`,
      `Tools: ${toolsEnabled ? 'ON' : 'OFF'} | Agentic: ${agenticMode ? 'ON' : 'OFF'} | PTC: ${ptcMode ? 'ON' : 'OFF'}`,
      `Messages: ${messages.length} | Platform: ${navigator.platform}`,
      ``,
    ];

    for (const msg of messages) {
      const time = new Date(msg.timestamp).toLocaleTimeString();
      const role = msg.role.toUpperCase();
      lines.push(`── [${time}] ${role} ──────────────────────`);

      // Extract collapsible sections from content
      let text = msg.content;
      const collapsibles: string[] = [];

      // thinking / think blocks
      text = text.replace(/<(?:thinking|think)>([\s\S]*?)<\/(?:thinking|think)>/gi, (_, inner) => {
        collapsibles.push(`  [THINKING]\n${inner.trim().split('\n').map((l: string) => '    ' + l).join('\n')}`);
        return '';
      });

      // <tool_use> XML blocks
      text = text.replace(/<tool_use>([\s\S]*?)<\/tool_use>/gi, (_, inner) => {
        const nameMatch = inner.match(/<tool_name>([\s\S]*?)<\/tool_name>/i);
        const toolName = nameMatch ? nameMatch[1].trim() : 'tool';
        const params: Record<string, string> = {};
        const paramRegex = /<tool_parameter name="([^"]+)">([\s\S]*?)<\/tool_parameter>/gi;
        let pm;
        while ((pm = paramRegex.exec(inner)) !== null) params[pm[1]] = pm[2].trim();
        collapsibles.push(`  [TOOL CALL: ${toolName}]\n    ${JSON.stringify(params, null, 2).split('\n').join('\n    ')}`);
        return '';
      });

      // JSON tool calls
      text = text.replace(/\{"name"\s*:\s*"([^"]+)"[\s\S]*?"parameters"\s*:\s*(\{[\s\S]*?\})\s*\}/g, (match, name) => {
        try {
          const parsed = JSON.parse(match);
          collapsibles.push(`  [TOOL CALL: ${name}]\n    ${JSON.stringify(parsed.parameters || {}, null, 2).split('\n').join('\n    ')}`);
          return '';
        } catch { return match; }
      });

      // Tool result blocks
      text = text.replace(/🔧 \*\*([^*\n]+)\*\*\s*\n```[^\n]*\n([\s\S]*?)\n?```/g, (_, name, result) => {
        collapsibles.push(`  [TOOL RESULT: ${name.trim()}]\n${result.trim().split('\n').map((l: string) => '    ' + l).join('\n')}`);
        return '';
      });

      // PTC scripts
      text = text.replace(/```(?:javascript|js)\s*\n([\s\S]*?)```/g, (match, code) => {
        if (code.includes('await ') || code.includes('print(')) {
          collapsibles.push(`  [PTC SCRIPT]\n${code.trim().split('\n').map((l: string) => '    ' + l).join('\n')}`);
          return '';
        }
        return match;
      });

      const cleanText = text.replace(/\n{3,}/g, '\n\n').trim();
      if (cleanText) lines.push(cleanText);
      if (collapsibles.length > 0) lines.push(...collapsibles);

      if (msg.metadata?.source) lines.push(`  [source: ${msg.metadata.source}]`);
      lines.push('');
    }

    lines.push(`=== END ===`);

    try {
      await navigator.clipboard.writeText(lines.join('\n'));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy chat:', err);
    }
  };

  // Derive mode label and colour for the indicator bar
  const modeBarInfo = (() => {
    if (robotMode)
      return { dot: 'bg-red-400', label: 'Robot', extra: `· ${currentModel} · DroidCore` };
    if (toolsEnabled && agenticMode && ptcMode)
      return { dot: 'bg-cyan-400', label: 'PTC', extra: `· ${currentModel}${mcpToolCount > 0 ? ` · ${mcpToolCount} tools` : ''}` };
    if (toolsEnabled && agenticMode)
      return { dot: 'bg-amber-400', label: 'Agentic', extra: `· ${currentModel}${mcpToolCount > 0 ? ` · ${mcpToolCount} tools` : ''}` };
    if (toolsEnabled)
      return { dot: 'bg-green-400', label: 'Ask', extra: `· ${currentModel}${mcpToolCount > 0 ? ` · ${mcpToolCount} tools` : ''}` };
    return { dot: 'bg-gray-400', label: 'Basic', extra: `· ${currentModel}` };
  })();

  return (
    <div className={cn(
      "border-t p-3",
      ThemeUtils.getBorderClass(platform, theme)
    )}>
      {/* Mode indicator bar */}
      <div className="flex items-center gap-1.5 mb-2 px-0.5">
        <span className={cn('w-1.5 h-1.5 rounded-full flex-shrink-0', modeBarInfo.dot)} />
        <span className="text-[10px] text-white/50 truncate">
          <span className="text-white/70 font-medium">{modeBarInfo.label}</span>
          {' '}
          <span className="text-white/30">{modeBarInfo.extra}</span>
        </span>
      </div>

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

      {/* Expandable extra toolbar */}
      <div className="flex items-center gap-1 mb-2">
        <button
          onClick={() => setShowToolbar(!showToolbar)}
          className={cn(
            "p-1 rounded-lg transition-colors",
            showToolbar
              ? "bg-white/15 text-white/80"
              : "hover:bg-white/10 text-white/40"
          )}
          title={showToolbar ? "Hide toolbar" : "More options"}
        >
          {showToolbar ? <X className="w-3 h-3" /> : <Plus className="w-3 h-3" />}
        </button>

        {showToolbar && (
          <div className="flex flex-wrap items-center gap-1 animate-in fade-in slide-in-from-left-2 duration-150">
            {/* Copy Chat Debug */}
            <button
              onClick={handleCopyChatDebug}
              className={cn(
                "inline-flex items-center gap-1 px-2 py-1 text-[10px] rounded-lg transition-colors",
                copied
                  ? "bg-green-500/20 border border-green-500/30 text-green-300"
                  : "bg-white/5 hover:bg-white/10 border border-white/10 text-white/60 hover:text-white/80"
              )}
              title="Copy full chat with debug info"
            >
              <ClipboardCopy className="w-3 h-3" />
              {copied ? 'Copied!' : 'Copy Chat'}
            </button>

            {/* Tools toggle */}
            {onToolsToggle ? (
              <button
                onClick={onToolsToggle}
                className={cn(
                  "inline-flex items-center gap-1 px-2 py-1 text-[10px] rounded-lg transition-colors border",
                  toolsEnabled
                    ? "bg-purple-500/20 border-purple-500/30 text-purple-300"
                    : "bg-white/5 hover:bg-white/10 border-white/10 text-white/60"
                )}
                title={toolsEnabled ? `Tools ON (${mcpToolCount} available)` : "Tools OFF"}
              >
                <Wrench className="w-3 h-3" />
                Tools{toolsEnabled && mcpToolCount > 0 ? ` (${mcpToolCount})` : ''}
              </button>
            ) : toolsEnabled ? (
              <span
                className="inline-flex items-center gap-1 px-2 py-1 text-[10px] rounded-lg border bg-purple-500/15 border-purple-500/20 text-purple-300/70 cursor-default"
                title="Tools enabled on desktop"
              >
                <Wrench className="w-3 h-3" />
                Tools (Desktop)
              </span>
            ) : null}

            {/* Agentic toggle */}
            {toolsEnabled && onAgenticModeToggle && (
              <button
                onClick={onAgenticModeToggle}
                className={cn(
                  "inline-flex items-center gap-1 px-2 py-1 text-[10px] rounded-lg transition-colors border",
                  agenticMode
                    ? "bg-amber-500/20 border-amber-500/30 text-amber-300"
                    : "bg-white/5 hover:bg-white/10 border-white/10 text-white/60"
                )}
                title={agenticMode ? "Agentic: Multi-tool" : "Single tool"}
              >
                <Zap className="w-3 h-3" />
                Agentic
              </button>
            )}
            {toolsEnabled && !onAgenticModeToggle && agenticMode && (
              <span
                className="inline-flex items-center gap-1 px-2 py-1 text-[10px] rounded-lg border bg-amber-500/15 border-amber-500/20 text-amber-300/70 cursor-default"
                title="Agentic mode enabled on desktop"
              >
                <Zap className="w-3 h-3" />
                Agentic
              </span>
            )}

            {/* PTC toggle — only shown when tools + agentic are both on */}
            {toolsEnabled && agenticMode && onPtcModeToggle && (
              <button
                onClick={onPtcModeToggle}
                className={cn(
                  "inline-flex items-center gap-1 px-2 py-1 text-[10px] rounded-lg transition-colors border",
                  ptcMode
                    ? "bg-cyan-500/20 border-cyan-500/30 text-cyan-300"
                    : "bg-white/5 hover:bg-white/10 border-white/10 text-white/60"
                )}
                title={ptcMode ? "PTC ON — LLM writes a script (2 LLM calls)" : "PTC OFF — standard agentic loop"}
              >
                <Code2 className="w-3 h-3" />
                PTC
              </button>
            )}

            {/* Robot mode toggle */}
            {onRobotModeToggle && (
              <button
                onClick={onRobotModeToggle}
                className={cn(
                  "inline-flex items-center gap-1 px-2 py-1 text-[10px] rounded-lg transition-colors border",
                  robotMode
                    ? "bg-red-500/20 border-red-500/30 text-red-300"
                    : "bg-white/5 hover:bg-white/10 border-white/10 text-white/60"
                )}
                title={robotMode ? "Robot Mode ON — DroidCore Comms v4.0 safety contract active" : "Robot Mode OFF — enable for DroidCore control"}
              >
                <Cpu className="w-3 h-3" />
                Robot
              </button>
            )}

            {/* Terminal toggle */}
            {onTerminalToggle && (
              <button
                onClick={onTerminalToggle}
                className={cn(
                  "inline-flex items-center gap-1 px-2 py-1 text-[10px] rounded-lg transition-colors border",
                  showTerminal
                    ? "bg-green-500/20 border-green-500/30 text-green-300"
                    : "bg-white/5 hover:bg-white/10 border-white/10 text-white/60"
                )}
                title={showTerminal ? "Hide terminal panel" : "Show terminal panel (Ctrl+Shift+`)"}
              >
                <Terminal className="w-3 h-3" />
                Terminal
              </button>
            )}

            {/* Model indicator */}
            <span className="px-2 py-1 text-[10px] text-white/30 truncate max-w-[120px]" title={currentModel}>
              {currentModel}
            </span>
          </div>
        )}
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
          placeholder={placeholder}
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
        {/* Autopilot toggle - extreme right */}
        {toolsEnabled && onAutopilotToggle && (
          <button
            type="button"
            onClick={onAutopilotToggle}
            className={cn(
              "p-2 rounded-xl transition-all",
              platform !== 'win32' && "backdrop-blur-md",
              autopilotMode
                ? "bg-green-500/20 hover:bg-green-500/30 text-green-300 border border-green-500/30"
                : "bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30"
            )}
            title={autopilotMode ? "Autopilot ON — tools run without asking" : "Autopilot OFF — asks before running tools"}
          >
            {autopilotMode ? <ShieldCheck className="w-4 h-4" /> : <ShieldAlert className="w-4 h-4" />}
          </button>
        )}
      </form>
    </div>
  );
});

ChatInput.displayName = 'ChatInput';

export default ChatInput;