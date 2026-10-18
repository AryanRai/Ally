import { MessageResponse } from '@/components/ai-elements/message';
import { compactUserMessage } from '@/lib/compactPresentation';
import { OriginalMessage } from './WatchReplyContent';

export default function CompactUserMessage({ content }: { content: string }) {
  const message = compactUserMessage(content);
  return <div className="min-w-0 text-[11px] text-foreground/60" style={{ userSelect: 'text' }}>
    <p className="mb-0.5 text-[10px] text-foreground/40">{message.label}</p>
    <div className="max-h-20 overflow-y-auto overscroll-contain break-words [overflow-wrap:anywhere] [&_pre]:overflow-x-auto">
      <MessageResponse mode="static" className="text-[11px] leading-relaxed [&_p]:my-1">{message.text}</MessageResponse>
    </div>
    {!!message.questions.length && <details className="mt-1 text-[10px] text-foreground/40">
      <summary className="cursor-pointer">Question details</summary>
      <div className="max-h-28 overflow-y-auto">{message.questions.map((question, index) => <p key={index} className="mt-1 whitespace-pre-wrap">{question}</p>)}</div>
    </details>}
    {message.original && <OriginalMessage text={message.original} label="Original question reply" />}
  </div>;
}
