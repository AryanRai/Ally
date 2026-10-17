import { Maximize2, Minus, X, Settings, Clipboard, Check, Mic, MicOff, PanelLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { UnifiedModelSelector } from '../UnifiedModelSelector';

interface ExpandedHeaderProps {
  platform: string;
  theme: 'light' | 'dark';
  isResizing: boolean;
  sidebarCollapsed: boolean;
  onSidebarToggle: () => void;
  activeChat: { title?: string } | null;
  headerTitleEdit: any;
  hasNewContext: boolean;
  contextData: { clipboard?: string; selectedText?: string };
  showContext: boolean;
  onContextToggle: () => void;
  contextToggleEnabled: boolean;
  onContextToggleChange: (enabled: boolean) => void;
  currentModel: string;
  showModelSelector: boolean;
  onModelSelectorToggle: () => void;
  onModelSelect: (model: string) => void;
  onSizeChange: () => void;
  onSettings: () => void;
  onCollapseToggle: () => void;
  onHide: () => void;
  size: string;
  showSpeechControls: boolean;
  onSpeechToggle: () => void;
}

const noDrag = { WebkitAppRegion: 'no-drag' } as React.CSSProperties;
const iconButton = 'size-6 rounded-sm text-muted-foreground hover:text-foreground';

/** Expanded window header: Tanker wordmark, chat title, agent picker, window controls. */
export default function ExpandedHeader({
  platform,
  theme,
  isResizing,
  sidebarCollapsed,
  onSidebarToggle,
  activeChat,
  headerTitleEdit,
  hasNewContext,
  contextData,
  showContext,
  onContextToggle,
  contextToggleEnabled,
  onContextToggleChange,
  currentModel,
  showModelSelector,
  onModelSelectorToggle,
  onModelSelect,
  onSizeChange,
  onSettings,
  onCollapseToggle,
  onHide,
  size,
  showSpeechControls,
  onSpeechToggle,
}: ExpandedHeaderProps) {
  const hasClipboard = hasNewContext && !!(contextData.clipboard || contextData.selectedText);

  return (
    <>
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          className={iconButton}
          style={noDrag}
          onClick={onSidebarToggle}
          title={sidebarCollapsed ? 'Show chats' : 'Hide chats'}
        >
          <PanelLeft className="size-3.5" />
        </Button>

        <span className="select-none font-tanker text-[15px] leading-none tracking-wide text-foreground">ALLY</span>
        <span className="h-3 w-px shrink-0 bg-border" />

        {headerTitleEdit.isEditing ? (
          <div className="flex min-w-0 flex-1 items-center gap-1" style={noDrag}>
            <input
              ref={headerTitleEdit.inputRef as React.RefObject<HTMLInputElement>}
              value={headerTitleEdit.editValue}
              onChange={e => headerTitleEdit.setEditValue(e.target.value)}
              onKeyDown={headerTitleEdit.handleKeyDown}
              onBlur={headerTitleEdit.saveEdit}
              className="min-w-0 flex-1 border border-input bg-transparent px-1.5 py-0.5 text-xs font-light outline-none focus:border-ring"
              placeholder="Chat title…"
            />
            <Button variant="ghost" size="icon" className={iconButton} onClick={headerTitleEdit.saveEdit} title="Save title">
              <Check className="size-3" />
            </Button>
          </div>
        ) : (
          <button
            className={cn(
              'min-w-0 flex-1 truncate text-left text-xs font-light text-foreground/70 transition-colors hover:text-foreground',
              size === 'S' && 'max-w-[60px] text-[10px]'
            )}
            style={noDrag}
            title={`${activeChat?.title || 'Untitled'} · click to rename`}
            onClick={() => headerTitleEdit.startEdit(activeChat?.title)}
          >
            {activeChat?.title || 'Untitled'}
          </button>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-0.5" style={{ ...noDrag, userSelect: 'none' }}>
        <UnifiedModelSelector
          platform={platform}
          theme={theme}
          currentModel={currentModel}
          onModelSelect={onModelSelect}
          showSelector={showModelSelector}
          onToggleSelector={onModelSelectorToggle}
          compact
          windowSize={size as 'S' | 'M' | 'L'}
        />

        {/* Click toggles the clipboard chip; right-click turns clipboard watching on/off */}
        <Button
          variant="ghost"
          size="icon"
          className={cn(iconButton, 'relative', !contextToggleEnabled && 'opacity-40')}
          onClick={onContextToggle}
          onContextMenu={e => {
            e.preventDefault();
            onContextToggleChange(!contextToggleEnabled);
          }}
          title={`Clipboard context: ${showContext ? 'shown' : 'hidden'} · watching ${contextToggleEnabled ? 'on' : 'off'} (right-click)`}
        >
          <Clipboard className="size-3.5" />
          {hasClipboard && <span className="absolute right-1 top-1 size-1 animate-pulse bg-foreground" />}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className={cn(iconButton, showSpeechControls && 'bg-accent text-foreground')}
          onClick={onSpeechToggle}
          title={`Voice controls ${showSpeechControls ? 'on' : 'off'}`}
        >
          {showSpeechControls ? <Mic className="size-3.5" /> : <MicOff className="size-3.5" />}
        </Button>
        <Button variant="ghost" size="icon" className={iconButton} onClick={onSettings} title="Settings">
          <Settings className="size-3.5" />
        </Button>
        <Button variant="ghost" size="icon" className={iconButton} onClick={onSizeChange} disabled={isResizing} title={`Size: ${size}`}>
          <Maximize2 className="size-3.5" />
        </Button>
        <Button variant="ghost" size="icon" className={iconButton} onClick={onCollapseToggle} disabled={isResizing} title="Collapse">
          <Minus className="size-3.5" />
        </Button>
        <Button variant="ghost" size="icon" className={cn(iconButton, 'hover:bg-destructive/20')} onClick={onHide} title="Close">
          <X className="size-3.5" />
        </Button>
      </div>
    </>
  );
}
