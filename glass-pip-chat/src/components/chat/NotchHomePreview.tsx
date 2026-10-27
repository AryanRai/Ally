import { ArrowUpRight, Ellipsis, RefreshCw } from 'lucide-react';
import CompactMarkdown from './CompactMarkdown';
import allyMark from '../../../assets/allay.png';
import { memo } from 'react';

type Props = { title: string; question: string; answer: string; working: boolean; loading?: boolean; error?: string; onOpenChat: () => void; onRefresh: () => void };

/** A glance at the selected chat. The native switcher owns the full workspace. */
export default memo(function NotchHomePreview({ title, question, answer, working, loading, error, onOpenChat, onRefresh }: Props) {
  return <section className="ally-home" aria-label="Selected chat preview">
    <div className="ally-home-pill">
      <img className="ally-home-brand" src={allyMark} alt="Ally"/>
      <button className="ally-home-title" onClick={onOpenChat} title={title}>{title}</button>
      <span className={`ally-home-state ${working ? 'is-working' : ''}`} role="status">{working ? 'Working' : 'Ready'}</span>
      <details className="ally-home-menu"><summary aria-label="Preview menu"><Ellipsis size={16}/></summary>
        <div><button onClick={onRefresh}><RefreshCw size={12}/>Refresh preview</button><button onClick={onOpenChat}><ArrowUpRight size={12}/>Open full chat</button></div>
      </details>
    </div>
    <div className="ally-home-body" aria-live="polite" aria-busy={!!loading}>
      {question && <p className="ally-home-question" title={question}><span>You</span>{question}</p>}
      {answer ? <div className="ally-home-answer"><CompactMarkdown>{answer}</CompactMarkdown></div>
        : <p className="ally-home-empty">{loading ? 'Loading your chat…' : working ? 'Ally is working on your question…' : 'Your latest question and answer will appear here.'}</p>}
      {error && <p className="ally-home-error" role="alert">{error}</p>}
    </div>
    <button className="ally-home-open" onClick={onOpenChat}>{question ? 'Continue in chat' : 'Ask Ally'}<ArrowUpRight size={12}/></button>
  </section>;
});
