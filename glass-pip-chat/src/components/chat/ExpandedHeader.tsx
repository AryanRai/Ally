import { Maximize2, Minus, X, Settings, Clipboard, ClipboardX, Check, Mic, GripVertical, MoreHorizontal } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { UnifiedModelSelector } from '../UnifiedModelSelector';
import OutputMuteButton from './OutputMuteButton';

interface ExpandedHeaderProps {
  platform: string;
  theme: 'light' | 'dark';
  isResizing: boolean;
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
        {/* The sidebar has its own toggle; this grip drags the window */}
        <span className="grid h-6 w-4 shrink-0 cursor-grab place-items-center text-foreground/30 hover:text-foreground/60" title="Drag window">
          <GripVertical className="size-3.5" />
        </span>

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
        <OutputMuteButton />
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

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className={cn(iconButton, 'relative data-[state=open]:bg-accent data-[state=open]:text-foreground')} title="More">
              <MoreHorizontal className="size-3.5" />
              {hasClipboard && <span className="absolute right-1 top-1 size-1 animate-pulse rounded-full bg-foreground" />}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-52">
            <DropdownMenuItem onSelect={onContextToggle}>
              <Clipboard className="size-3.5" /> {showContext ? 'Hide' : 'Show'} clipboard context
              {hasClipboard && <span className="ml-auto size-1.5 rounded-full bg-foreground" />}
            </DropdownMenuItem>
            <DropdownMenuCheckboxItem checked={contextToggleEnabled} onCheckedChange={v => onContextToggleChange(!!v)}>
              <ClipboardX className="size-3.5" /> Watch clipboard
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem checked={showSpeechControls} onCheckedChange={onSpeechToggle}>
              <Mic className="size-3.5" /> Voice controls
            </DropdownMenuCheckboxItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={onSizeChange} disabled={isResizing}>
              <Maximize2 className="size-3.5" /> Window size <span className="ml-auto font-mono text-[11px] text-muted-foreground">{size}</span>
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={onSettings}>
              <Settings className="size-3.5" /> Settings
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <Button variant="ghost" size="icon" className={iconButton} onClick={onCollapseToggle} title="Collapse">
          <Minus className="size-3.5" />
        </Button>
        <Button variant="ghost" size="icon" className={cn(iconButton, 'hover:bg-destructive/20')} onClick={onHide} title="Close">
          <X className="size-3.5" />
        </Button>
      </div>
    </>
  );
}
