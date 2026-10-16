import { motion } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { cn } from '../../lib/utils';
import type { UISettings } from '../../types/settings';
import { InlineToolPill, Segment } from './InlineToolIndicator';

interface StreamingMessageProps {
  text: string;
  segments: Segment[];
  theme: 'light' | 'dark';
  platform: string;
  fontSize: UISettings['fontSize'];
}

const markdownComponents = {
  p: ({ children }: any) => <p className="mb-2 last:mb-0">{children}</p>,
  code: ({ inline, className, children, ...props }: any) =>
    inline ? (
      <code className="px-1 py-0.5 bg-white/10 rounded text-sm" {...props}>{children}</code>
    ) : (
      <pre className="bg-black/20 rounded-lg overflow-x-auto my-2 p-3">
        <code className={cn('text-sm', className)} {...props}>{children}</code>
      </pre>
    ),
};

// Spelled out so Tailwind can see the class names
const TEXT_SIZE: Record<UISettings['fontSize'], string> = { xs: 'text-xs', sm: 'text-sm', base: 'text-base', lg: 'text-lg', xl: 'text-xl' };
const PROSE_SIZE: Record<UISettings['fontSize'], string> = { xs: 'prose-xs', sm: 'prose-sm', base: 'prose-base', lg: 'prose-lg', xl: 'prose-xl' };

const Cursor = () => <span className="inline-block w-2 h-4 bg-current animate-pulse ml-1 align-text-bottom" />;

function Dot({ delay, platform, theme }: { delay: number; platform: string; theme: 'light' | 'dark' }) {
  return (
    <div
      className={cn('w-2 h-2 rounded-full animate-bounce', platform === 'win32' || theme === 'dark' ? 'bg-white/40' : 'bg-black/40')}
      style={{ animationDelay: `${delay}ms` }}
    />
  );
}

/** The in-progress agent reply: text interleaved with live tool pills. */
export default function StreamingMessage({ text, segments, theme, platform, fontSize }: StreamingMessageProps) {
  if (!text && segments.length === 0) {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center gap-1 px-3 py-2">
        <Dot delay={0} platform={platform} theme={theme} />
        <Dot delay={150} platform={platform} theme={theme} />
        <Dot delay={300} platform={platform} theme={theme} />
      </motion.div>
    );
  }

  const shown: Segment[] = segments.length > 0 ? segments : [{ type: 'text', content: text }];
  const lastIsTool = shown[shown.length - 1]?.type === 'tool';

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn('group relative mr-8 max-w-[90%] rounded-2xl p-4 bg-white/5', TEXT_SIZE[fontSize])}
    >
      <div className={cn('prose max-w-none prose-invert', PROSE_SIZE[fontSize])}>
        {shown.map((seg, i) =>
          seg.type === 'tool' && seg.toolExecution ? (
            <InlineToolPill key={seg.toolExecution.id ?? i} execution={seg.toolExecution} theme={theme} />
          ) : (
            <ReactMarkdown key={i} remarkPlugins={[remarkGfm]} components={markdownComponents}>
              {(seg.content ?? '') + (i === shown.length - 1 ? '▋' : '')}
            </ReactMarkdown>
          )
        )}
        {lastIsTool && <Cursor />}
      </div>
    </motion.div>
  );
}
