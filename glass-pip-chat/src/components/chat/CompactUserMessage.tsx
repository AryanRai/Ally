import { memo, useState } from 'react';
import CompactMarkdown from './CompactMarkdown';
import { compactUserMessage } from '@/lib/compactPresentation';
import { OriginalMessage } from './WatchReplyContent';
import { ImageStrip } from './ToolCall';

export default memo(function CompactUserMessage({ content, images }: { content: string; images?: string[] }) {
  const message = compactUserMessage(content);
  const [expanded, setExpanded] = useState(false);
  const long = message.text.length > 240 || message.text.split('\n').length > 4;
  return <div className="min-w-0 text-[11px] text-foreground/60" style={{ userSelect: 'text' }}>
    <p className="mb-0.5 text-[10px] text-foreground/40">{message.label}</p>
    {long && !expanded ? <div className="max-h-[4.5rem] overflow-hidden [mask-image:linear-gradient(black_65%,transparent)]"><CompactMarkdown>{message.text}</CompactMarkdown></div> :
      <div className="max-h-64 overflow-y-auto overscroll-contain"><CompactMarkdown>{message.text}</CompactMarkdown></div>}
    {long && <button type="button" aria-expanded={expanded} onClick={() => setExpanded(value => !value)} className="mt-1 py-1 text-[11px] text-sky-300 hover:underline">{expanded ? 'Show less' : 'Read full request'}</button>}
    {!!images?.length && <ImageStrip images={images} />}
    {!!message.questions.length && <details className="mt-1 text-[10px] text-foreground/40">
      <summary className="cursor-pointer">Question details</summary>
      <div className="max-h-28 overflow-y-auto">{message.questions.map((question, index) => <p key={index} className="mt-1 whitespace-pre-wrap">{question}</p>)}</div>
    </details>}
    {message.original && <OriginalMessage text={message.original} label={message.label === 'You' ? 'Request details' : 'Original question reply'} />}
  </div>;
});
