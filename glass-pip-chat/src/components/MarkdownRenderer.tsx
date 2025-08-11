import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Copy, Check, Terminal } from 'lucide-react';
import { cn } from '../lib/utils';

interface MarkdownRendererProps {
  content: string;
  messageId?: string;
  copiedCode?: Set<string>;
  runningCommands?: Set<string>;
  onCopyCode?: (text: string, codeId: string) => void;
  onRunCommand?: (command: string, codeId: string) => void;
  // Optional props sometimes passed by callers even if unused here
  platform?: string;
  theme?: 'light' | 'dark';
  compact?: boolean;
}

export default function MarkdownRenderer({
  content,
  messageId,
  copiedCode,
  runningCommands,
  onCopyCode,
  onRunCommand
}: MarkdownRendererProps) {
  const effectiveMessageId = messageId ?? 'md';
  const safeCopiedCode = copiedCode ?? new Set<string>();
  const safeRunningCommands = runningCommands ?? new Set<string>();
  const canRun = typeof onRunCommand === 'function';
  const canCopy = typeof onCopyCode === 'function';

  return (
    <div className="prose prose-sm max-w-none prose-invert">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
          code: ({ inline, className, children, ...props }) => {
            const codeText = String(children);
            const codeId = `${effectiveMessageId}-${Math.random().toString(36).slice(2, 11)}`;
            const isCopied = safeCopiedCode.has(codeId);

            return inline ? (
              <code className="px-1 py-0.5 bg-white/10 rounded text-xs" {...props}>
                {children}
              </code>
            ) : (
              <div className="relative group my-2">
                <pre className="bg-black/20 rounded-lg p-3 pr-20 overflow-x-auto">
                  <code className={cn("text-xs", className)} {...props}>
                    {children}
                  </code>
                </pre>
                {(canRun || canCopy) && (
                  <div className="absolute top-2 right-2 flex gap-1">
                    {canRun && (
                      <button
                        onClick={() => onRunCommand && onRunCommand(codeText, codeId)}
                        className={cn(
                          "p-1.5 rounded-md transition-all duration-200",
                          "opacity-0 group-hover:opacity-100 focus:opacity-100",
                          safeRunningCommands.has(codeId)
                            ? "bg-blue-500/20 text-blue-300"
                            : "bg-white/10 hover:bg-white/20 text-white/70 hover:text-white"
                        )}
                        title={safeRunningCommands.has(codeId) ? "Running..." : "Run in terminal"}
                        disabled={safeRunningCommands.has(codeId)}
                      >
                        <Terminal className="w-3 h-3" />
                      </button>
                    )}
                    {canCopy && (
                      <button
                        onClick={() => onCopyCode && onCopyCode(codeText, codeId)}
                        className={cn(
                          "p-1.5 rounded-md transition-all duration-200",
                          "opacity-0 group-hover:opacity-100 focus:opacity-100",
                          isCopied
                            ? "bg-green-500/20 text-green-300"
                            : "bg-white/10 hover:bg-white/20 text-white/70 hover:text-white"
                        )}
                        title={isCopied ? "Copied!" : "Copy code"}
                      >
                        {isCopied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          },
          ul: ({ children }) => <ul className="list-disc list-inside mb-2">{children}</ul>,
          ol: ({ children }) => <ol className="list-decimal list-inside mb-2">{children}</ol>,
          li: ({ children }) => <li className="mb-1">{children}</li>,
          h1: ({ children }) => <h1 className="text-lg font-bold mb-2">{children}</h1>,
          h2: ({ children }) => <h2 className="text-base font-bold mb-2">{children}</h2>,
          h3: ({ children }) => <h3 className="text-sm font-bold mb-1">{children}</h3>,
          blockquote: ({ children }) => (
            <blockquote className="border-l-2 border-white/20 pl-3 my-2 italic opacity-80">
              {children}
            </blockquote>
          ),
          a: ({ children, href }) => (
            <a href={href} className="text-blue-400 hover:underline" target="_blank" rel="noopener noreferrer">
              {children}
            </a>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}