export function boundedActivity(result: { chats: any[] }) {
  return { chats: result.chats.slice(0, 20).map(row => ({ id: row.id, provider: row.provider, sessionId: row.sessionId,
    title: String(row.title || 'Conversation').slice(0, 120), status: row.status, detail: String(row.detail || '').slice(0, 160), text: String(row.text || '').slice(-500), updatedAt: row.updatedAt, unread: !!row.unread })) };
}
/** One shared, bounded status feed for all paired devices. No work without peers. */
export function startLiveActivity(read: () => Promise<{ chats: any[] }>, connected: () => boolean, send: (value: unknown) => void) {
  let stopped = false, previous = '', timer: ReturnType<typeof setTimeout>;
  const poll = async () => {
    try {
      if (!connected()) { previous = ''; return; }
      const result = await read();
      if (stopped || !connected()) return;
      const { chats } = boundedActivity(result);
      const fingerprint = JSON.stringify(chats);
      if (fingerprint !== previous) { previous = fingerprint; send({ type: 'agent_activity', activity: { chats } }); }
    } catch { /* Retain last observed state; a failed read is never completion. */ }
    finally { if (!stopped) timer = setTimeout(poll, 1500); }
  };
  void poll();
  return () => { stopped = true; clearTimeout(timer); };
}
