import ReactMarkdown from 'react-markdown';
import MarkdownImage, { chatUrlTransform } from './MarkdownImage';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import { mathMarkdown } from '@/lib/mathMarkdown';

/** Narrow, selectable Markdown with real paragraph/list structure and no icon toolbar. */
export default function CompactMarkdown({ children }: { children: string }) {
  return <div className="min-w-0 break-words text-[13px] leading-relaxed text-foreground/85 [overflow-wrap:anywhere] [&_p]:my-2 [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:my-1 [&_h1]:mb-2 [&_h1]:mt-3 [&_h1]:font-semibold [&_h2]:mb-2 [&_h2]:mt-3 [&_h2]:font-semibold [&_h3]:my-2 [&_h3]:font-medium [&_a]:text-sky-300 [&_a]:underline [&_a]:underline-offset-2 [&_code]:rounded [&_code]:bg-white/10 [&_code]:px-1 [&_code]:font-mono [&_code]:text-[11px] [&_pre]:my-2 [&_pre]:max-w-full [&_pre]:overflow-x-auto [&_pre]:rounded [&_pre]:bg-black/20 [&_pre]:p-2 [&_pre_code]:bg-transparent [&_blockquote]:border-l-2 [&_blockquote]:border-white/20 [&_blockquote]:pl-3 [&_img]:max-w-full [&_table]:text-xs [&_td]:border [&_td]:border-white/10 [&_td]:p-1 [&_th]:p-1 [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
    <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[[rehypeKatex, { trust: false, strict: 'ignore', throwOnError: false }]]} urlTransform={chatUrlTransform}
      components={{
        img: MarkdownImage,
        a: ({ children, ...props }) => <a {...props} target="_blank" rel="noreferrer">{children}</a>,
        table: ({ children, ...props }) => <div className="max-w-full overflow-x-auto"><table {...props}>{children}</table></div>,
      }}>{mathMarkdown(children)}</ReactMarkdown>
  </div>;
}
