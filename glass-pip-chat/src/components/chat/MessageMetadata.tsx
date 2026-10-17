import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, ChevronRight, Wrench, Clipboard, CheckCircle, XCircle } from 'lucide-react';
import { cn } from '../../lib/utils';
import { ThemeUtils } from '../../utils/themeUtils';
import { ToolCall, ToolResult } from '../../types/chat';

interface MessageMetadataProps {
  platform: string;
  theme: 'light' | 'dark';
  context?: string;
  toolCalls?: ToolCall[];
  toolResults?: ToolResult[];
  className?: string;
}

export default function MessageMetadata({
  platform,
  theme,
  context,
  toolCalls,
  toolResults,
  className
}: MessageMetadataProps) {
  const [showContext, setShowContext] = useState(false);
  const [showTools, setShowTools] = useState(false);

  const hasContext = context && context.trim().length > 0;
  const hasTools = toolCalls && toolCalls.length > 0;

  if (!hasContext && !hasTools) {
    return null;
  }

  return (
    <div className={cn('mt-2 space-y-2', className)}>
      {/* Context Dropdown */}
      {hasContext && (
        <div className={cn(
          'border rounded-lg overflow-hidden',
          ThemeUtils.getBorderClass(platform, theme),
          'bg-white/15 dark:bg-white/10'
        )}>
          <button
            onClick={() => setShowContext(!showContext)}
            className={cn(
              'w-full flex items-center gap-2 px-3 py-2 text-sm font-medium transition-colors',
              'hover:bg-white/15 dark:hover:bg-white/15',
              ThemeUtils.getTextClass(platform, theme, 'primary')
            )}
          >
            <Clipboard className="w-4 h-4 text-white" />
            <span>Context Attached</span>
            <div className="flex-1" />
            {showContext ? (
              <ChevronDown className="w-4 h-4" />
            ) : (
              <ChevronRight className="w-4 h-4" />
            )}
          </button>
          
          <AnimatePresence>
            {showContext && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <div className={cn(
                  'px-3 py-2 border-t text-sm',
                  ThemeUtils.getBorderClass(platform, theme),
                  'bg-white/10 dark:bg-white/15',
                  ThemeUtils.getTextClass(platform, theme, 'secondary')
                )}>
                  <div className="font-mono text-xs whitespace-pre-wrap wrap-break-word">
                    {context}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* Tool Calls Dropdown */}
      {hasTools && (
        <div className={cn(
          'border rounded-lg overflow-hidden',
          ThemeUtils.getBorderClass(platform, theme),
          'bg-white/15 dark:bg-white/10'
        )}>
          <button
            onClick={() => setShowTools(!showTools)}
            className={cn(
              'w-full flex items-center gap-2 px-3 py-2 text-sm font-medium transition-colors',
              'hover:bg-white/15 dark:hover:bg-white/15',
              ThemeUtils.getTextClass(platform, theme, 'primary')
            )}
          >
            <Wrench className="w-4 h-4 text-white" />
            <span>
              {toolCalls.length} Tool{toolCalls.length !== 1 ? 's' : ''} Used
            </span>
            <div className="flex-1" />
            {showTools ? (
              <ChevronDown className="w-4 h-4" />
            ) : (
              <ChevronRight className="w-4 h-4" />
            )}
          </button>
          
          <AnimatePresence>
            {showTools && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <div className={cn(
                  'border-t',
                  ThemeUtils.getBorderClass(platform, theme),
                  'bg-white/10 dark:bg-white/15'
                )}>
                  {toolCalls.map((toolCall, index) => {
                    const result = toolResults?.find(r => r.name === toolCall.name);
                    
                    return (
                      <div
                        key={index}
                        className={cn(
                          'px-3 py-2',
                          index > 0 && 'border-t',
                          ThemeUtils.getBorderClass(platform, theme)
                        )}
                      >
                        <div className="flex items-center gap-2 mb-2">
                          <div className={cn(
                            'flex items-center gap-1 px-2 py-1 rounded-sm text-xs font-medium',
                            'bg-white/10 dark:bg-white/15 text-white dark:text-white'
                          )}>
                            <Wrench className="w-3 h-3" />
                            {toolCall.name}
                          </div>
                          
                          {result && (
                            <div className={cn(
                              'flex items-center gap-1 px-2 py-1 rounded-sm text-xs font-medium',
                              result.success
                                ? 'bg-green-100 dark:bg-green-800/50 text-green-700 dark:text-green-300'
                                : 'bg-red-100 dark:bg-red-800/50 text-red-700 dark:text-red-300'
                            )}>
                              {result.success ? (
                                <CheckCircle className="w-3 h-3" />
                              ) : (
                                <XCircle className="w-3 h-3" />
                              )}
                              {result.success ? 'Success' : 'Failed'}
                            </div>
                          )}
                        </div>
                        
                        {/* Parameters */}
                        {Object.keys(toolCall.parameters ?? {}).length > 0 && (
                          <div className="mb-2">
                            <div className={cn(
                              'text-xs font-medium mb-1',
                              ThemeUtils.getTextClass(platform, theme, 'secondary')
                            )}>
                              Parameters:
                            </div>
                            <div className={cn(
                              'font-mono text-xs p-2 rounded-sm',
                              'bg-gray-100 dark:bg-gray-800',
                              ThemeUtils.getTextClass(platform, theme, 'secondary')
                            )}>
                              {JSON.stringify(toolCall.parameters, null, 2)}
                            </div>
                          </div>
                        )}
                        
                        {/* Result */}
                        {result && (
                          <div>
                            <div className={cn(
                              'text-xs font-medium mb-1',
                              ThemeUtils.getTextClass(platform, theme, 'secondary')
                            )}>
                              {result.success ? 'Result:' : 'Error:'}
                            </div>
                            <div className={cn(
                              'font-mono text-xs p-2 rounded-sm',
                              result.success
                                ? 'bg-green-50 dark:bg-green-900/20'
                                : 'bg-red-50 dark:bg-red-900/20',
                              ThemeUtils.getTextClass(platform, theme, 'secondary')
                            )}>
                              {result.success 
                                ? JSON.stringify(result.result, null, 2)
                                : result.error
                              }
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}