import { ArrowUpRight, Check, Copy, Ellipsis, RefreshCw } from 'lucide-react';
import CompactMarkdown from './CompactMarkdown';
import allyMark from '../../../assets/allay.png';
import { memo, useEffect, useRef, useState } from 'react';
import { copyPreviewText } from '@/lib/copyPreviewText';

type Props = { title: string; question: string; answer: string; working: boolean; progress?: string[]; activity?: string; loading?: boolean; error?: string; controls?: React.ReactNode; onOpenChat: () => void; onRefresh: () => void };

/** A glance at the selected chat. The native switcher owns the full workspace. */
export default memo(function NotchHomePreview({ title, question, answer, working, progress = [], activity, loading, error, controls, onOpenChat, onRefresh }: Props) {
  const [copied,setCopied]=useState(''),[copyError,setCopyError]=useState('');
  const reader=useRef<HTMLDivElement>(null),held=useRef(false),latest=useRef({question,answer,progress});latest.current={question,answer,progress};
  const [selectionView,setSelectionView]=useState<typeof latest.current|null>(null);
  useEffect(()=>{
    const changed=()=>{if(held.current)return;const selection=window.getSelection();const selecting=selection&&!selection.isCollapsed&&reader.current?.contains(selection.anchorNode)&&reader.current.contains(selection.focusNode);setSelectionView(old=>selecting?old??latest.current:null);};
    const released=()=>{held.current=false;changed();};
    document.addEventListener('selectionchange',changed);document.addEventListener('pointerup',released);
    return()=>{document.removeEventListener('selectionchange',changed);document.removeEventListener('pointerup',released);};
  },[]);
  const visible=selectionView??{question,answer,progress};
  const copyText=visible.answer||visible.progress.join('\n\n');
  return <section className="ally-home" aria-label="Selected chat preview">
    <div className="ally-home-pill">
      <img className="ally-home-brand" src={allyMark} alt="Ally"/>
      <button className="ally-home-title" onClick={onOpenChat} title={title}>{title}</button>
      <span className={`ally-home-state ${working ? 'is-working' : ''}`} role="status" title={activity}>{working ? activity || 'Working' : 'Ready'}</span>
      <button type="button" className="ally-home-copy" disabled={!copyText} aria-label="Copy preview" title={copyError || 'Copy reply or latest updates'} onClick={()=>{setCopyError('');void copyPreviewText(copyText).then(()=>setCopied(copyText)).catch(()=>setCopyError('Select the text and press Ctrl+C.'));}}>{copied===copyText&&copyText?<Check size={14}/>:<Copy size={14}/>}</button>
      {controls}
      <details className="ally-home-menu"><summary aria-label="Preview menu"><Ellipsis size={16}/></summary>
        <div><button onClick={onRefresh}><RefreshCw size={12}/>Refresh preview</button><button onClick={onOpenChat}><ArrowUpRight size={12}/>Open full chat</button></div>
      </details>
    </div>
    <div ref={reader} className="ally-home-body" role="region" aria-label="Live chat preview" tabIndex={0} style={{userSelect:'text',WebkitUserSelect:'text'}} onPointerDown={()=>{held.current=true;setSelectionView(latest.current);}}>
      {visible.question && <p className="ally-home-question" title={visible.question}><span>You</span>{visible.question}</p>}
      {!!visible.progress.length && <div className="ally-home-updates"><span>Latest update</span>{visible.progress.map((text,i)=><div key={i}><CompactMarkdown>{text}</CompactMarkdown></div>)}</div>}
      {visible.answer ? <div className="ally-home-answer"><CompactMarkdown>{visible.answer}</CompactMarkdown></div>
        : visible.progress.length ? null
        : <p className="ally-home-empty">{loading ? 'Loading your chat…' : working ? 'Ally is working on your question…' : 'Your latest question and answer will appear here.'}</p>}
      {error && <p className="ally-home-error" role="alert">{error}</p>}
      {copyError && <p className="ally-home-error" role="alert">{copyError}</p>}
    </div>
    <button className="ally-home-open" onClick={onOpenChat}>{question ? 'Continue in chat' : 'Ask Ally'}<ArrowUpRight size={12}/></button>
  </section>;
});
