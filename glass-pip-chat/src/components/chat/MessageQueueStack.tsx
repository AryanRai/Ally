import { useEffect, useRef, useState } from 'react';
import type { QueueChange, QueueSnapshot } from '../../../electron/agent/messageQueueTypes';

/** Kept outside the transcript: queued input is not agent history until dispatched. */
export default function MessageQueueStack({ chatId }: { chatId?: string }) {
  const [queue, setQueue] = useState<QueueSnapshot>();
  const [error, setError] = useState('');
  const [changing, setChanging] = useState(false);
  const [editing, setEditing] = useState<{ id: string; text: string; revision: number }>();
  const [dragged, setDragged] = useState<string>();
  const generation = useRef(0);
  useEffect(() => {
    const current = ++generation.current;
    setQueue(undefined); setError(''); setEditing(undefined); setChanging(false);
    const refresh = async () => {
      if (!chatId || !window.pip?.agent?.queue) return;
      try {
        const next = await window.pip.agent.queue(chatId);
        if (current === generation.current) { setQueue(old => !old || next.revision >= old.revision ? next : old); }
      } catch { if (current === generation.current) setError('Queue unavailable. Reconnect to manage messages.'); }
    };
    void refresh(); const timer = setInterval(refresh, 1000);
    return () => { generation.current++; clearInterval(timer); };
  }, [chatId]);
  const change = async (action: Omit<QueueChange, 'revision'> & { revision?: number }) => {
    if (!chatId || !queue || changing) return;
    const current = generation.current; setChanging(true); setError('');
    try {
      const next = await window.pip.agent.queueChange(chatId, { revision: queue.revision, ...action });
      if (current === generation.current) { setQueue(old => !old || next.revision >= old.revision ? next : old); setEditing(undefined); }
    } catch (e) {
      if (current === generation.current) {
        setError(e instanceof Error ? e.message : String(e));
        const next = await window.pip.agent.queue(chatId).catch(() => undefined);
        if (next && current === generation.current) setQueue(old => !old || next.revision >= old.revision ? next : old);
      }
    } finally { if (current === generation.current) setChanging(false); }
  };
  if (!queue?.items.length) return null;
  const move = (from: number, to: number) => {
    if (to < 0 || to >= queue.items.length || from === to) return;
    const order = queue.items.map(i => i.id); order.splice(to, 0, order.splice(from, 1)[0]);
    void change({ action: 'reorder', order });
  };
  return <section aria-label="Queued messages" className="shrink-0 rounded-lg border border-border bg-black/15 p-2 text-xs">
    <div className="mb-1 font-medium">Queued · {queue.items.length}</div>
    {error && <p role="alert" className="text-amber-200">{error}</p>}
    <ol className="max-h-48 overflow-auto space-y-2">
      {queue.items.map((item, index) => <li key={item.id} className="rounded-md border border-border p-2" onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); if (dragged) move(queue.items.findIndex(i => i.id === dragged), index); setDragged(undefined); }}>
        <div className="flex items-start gap-2">
          <button type="button" aria-label={`Drag queued message ${index + 1}`} title="Drag to reorder" draggable={!changing && item.state !== 'sending'} disabled={changing || item.state === 'sending'} onDragStart={() => setDragged(item.id)} onDragEnd={() => setDragged(undefined)} className="cursor-grab p-1">⠿</button>
          <div className="min-w-0 flex-1">
            {editing?.id === item.id ? <textarea aria-label="Edit queued message" value={editing.text} maxLength={12000} onChange={e => setEditing({ ...editing, text: e.target.value })} className="w-full rounded bg-background p-2" /> : <p className="whitespace-pre-wrap break-words line-clamp-3">{item.text || 'Shared attachments'}</p>}
            {!!item.attachments.length && <p className="text-muted-foreground">{item.attachments.map(a => a.name).join(' · ')}</p>}
            {item.error && <p className="text-amber-200">{item.error}</p>}
            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-2 [&>button]:underline [&>button:disabled]:opacity-40">
              {editing?.id === item.id ? <><button disabled={changing || (!editing.text.trim() && !item.attachments.length) || item.state === 'sending'} onClick={() => void change({ action: 'edit', id: item.id, text: editing.text, revision: editing.revision })}>Save</button><button onClick={() => setEditing(undefined)}>Back</button></> : <>
                <button disabled={changing || item.state === 'sending'} onClick={() => setEditing({ id: item.id, text: item.text, revision: queue.revision })}>Edit</button>
                <button disabled={changing || item.state === 'sending'} onClick={() => void change({ action: 'send', id: item.id })}>{item.state === 'sending' ? 'Sending…' : 'Send now'}</button>
                <button disabled={changing || item.state === 'sending'} onClick={() => void change({ action: 'cancel', id: item.id })}>Cancel</button>
                <button aria-label={`Move message ${index+1} earlier`} disabled={changing || index === 0 || queue.items.some(i => i.state === 'sending')} onClick={() => move(index, index-1)}>↑</button>
                <button aria-label={`Move message ${index+1} later`} disabled={changing || index === queue.items.length-1 || queue.items.some(i => i.state === 'sending')} onClick={() => move(index, index+1)}>↓</button>
              </>}
            </div>
          </div>
        </div>
      </li>)}
    </ol>
  </section>;
}
