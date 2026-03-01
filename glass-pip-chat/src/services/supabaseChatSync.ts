/**
 * Supabase Chat Sync Service
 *
 * Syncs local chat history to/from Supabase so the web UI
 * shows the same conversations as the desktop Electron app.
 *
 * - Desktop (Electron): writes local chats to Supabase after each message
 * - Web: reads chats from Supabase, sends new messages through Supabase
 */

import { getSupabaseClient, isSupabaseEnabled } from '../utils/supabase';
import { Chat, Message } from '../types/chat';

export class SupabaseChatSync {
  private static instance: SupabaseChatSync;
  private userId: string | null = null;
  private realtimeSubscription: any = null;
  private _selectedSystemId: string = 'ally-local-system';

  static getInstance(): SupabaseChatSync {
    if (!SupabaseChatSync.instance) {
      SupabaseChatSync.instance = new SupabaseChatSync();
    }
    return SupabaseChatSync.instance;
  }

  get selectedSystemId(): string {
    return this._selectedSystemId;
  }

  set selectedSystemId(id: string) {
    this._selectedSystemId = id;
    try { localStorage.setItem('ally-selected-system', id); } catch {}
  }

  async init(): Promise<void> {
    if (!isSupabaseEnabled()) return;
    const client = getSupabaseClient();
    if (!client) return;
    const { data: { session } } = await client.auth.getSession();
    this.userId = session?.user?.id ?? null;
    try {
      const saved = localStorage.getItem('ally-selected-system');
      if (saved) this._selectedSystemId = saved;
    } catch {}
  }

  /** Push a single chat session + its messages to Supabase */
  async syncChat(chat: Chat): Promise<void> {
    if (!this.userId || !isSupabaseEnabled()) return;
    const client = getSupabaseClient();
    if (!client) return;

    // Upsert session
    await client.from('chat_sessions').upsert({
      id: chat.id,
      user_id: this.userId,
      title: chat.title,
      is_remote: false,
      metadata: {},
      created_at: new Date(chat.createdAt).toISOString(),
      updated_at: new Date(chat.updatedAt).toISOString(),
    }, { onConflict: 'id' });

    // Upsert messages — pair user+assistant messages into single rows
    if (chat.messages.length > 0) {
      const rows: any[] = [];
      for (let i = 0; i < chat.messages.length; i++) {
        const m = chat.messages[i];
        if (m.role === 'user') {
          // Look ahead for the assistant response
          const next = chat.messages[i + 1];
          const response = next?.role === 'assistant' ? next.content : '';
          rows.push({
            id: m.id,
            session_id: chat.id,
            user_id: this.userId!,
            content: m.content,
            response,
            status: 'completed' as const,
            is_remote: false,
            local_system_id: 'desktop-sync',
            source: 'desktop' as const,
            metadata: m.metadata ?? {},
            created_at: new Date(m.timestamp).toISOString(),
            updated_at: new Date(next?.timestamp ?? m.timestamp).toISOString(),
          });
          if (next?.role === 'assistant') i++; // skip the paired assistant message
        }
        // Skip standalone assistant messages (like the welcome message)
      }
      if (rows.length > 0) {
        await client.from('chat_messages').upsert(rows, { onConflict: 'id' });
      }
    }
  }

  /** Push all local chats to Supabase (initial sync) */
  async syncAllChats(chats: Chat[]): Promise<void> {
    for (const chat of chats) {
      await this.syncChat(chat);
    }
  }

  /** Fetch all chat sessions from Supabase (for web mode) */
  async fetchChats(): Promise<Chat[]> {
    if (!this.userId || !isSupabaseEnabled()) return [];
    const client = getSupabaseClient();
    if (!client) return [];

    const { data: sessions } = await client
      .from('chat_sessions')
      .select('*')
      .eq('user_id', this.userId)
      .order('updated_at', { ascending: false });

    if (!sessions) return [];

    const chats: Chat[] = [];
    for (const s of sessions) {
      const { data: msgs } = await client
        .from('chat_messages')
        .select('*')
        .eq('session_id', s.id)
        .order('created_at', { ascending: true });

      const messages: Message[] = (msgs ?? []).flatMap(m => {
        const out: Message[] = [];
        if (m.content) {
          out.push({
            id: m.id + '_user',
            role: 'user',
            content: m.content,
            timestamp: new Date(m.created_at).getTime(),
            metadata: m.metadata,
          });
        }
        if (m.response) {
          out.push({
            id: m.id + '_assistant',
            role: 'assistant',
            content: m.response,
            timestamp: new Date(m.updated_at || m.created_at).getTime(),
            metadata: m.metadata,
          });
        }
        return out;
      });

      chats.push({
        id: s.id,
        title: s.title,
        messages,
        createdAt: new Date(s.created_at).getTime(),
        updatedAt: new Date(s.updated_at).getTime(),
      });
    }
    return chats;
  }

  /**
   * Send a message via Supabase (web mode).
   * Creates a pending message row that the desktop poller picks up.
   * Returns the message ID so the web UI can poll for the response.
   */
  async sendRemoteMessage(
    sessionId: string,
    content: string,
    systemId: string = 'ally-local-system'
  ): Promise<string | null> {
    if (!this.userId || !isSupabaseEnabled()) return null;
    const client = getSupabaseClient();
    if (!client) return null;

    const msgId = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const { error } = await client.from('chat_messages').insert({
      id: msgId,
      session_id: sessionId,
      user_id: this.userId,
      content,
      response: '',
      status: 'pending',
      is_remote: true,
      local_system_id: systemId,
      source: 'web',
      metadata: { useTools: true },
    });

    if (error) {
      console.error('Failed to send remote message:', error);
      return null;
    }
    return msgId;
  }

  /**
   * Subscribe to realtime updates for a message (response streaming).
   * Calls onUpdate with the latest response text whenever it changes.
   */
  subscribeToMessage(
    messageId: string,
    onUpdate: (response: string, status: string) => void
  ): () => void {
    if (!isSupabaseEnabled()) return () => {};
    const client = getSupabaseClient();
    if (!client) return () => {};

    const channel = client
      .channel(`msg-${messageId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'chat_messages',
          filter: `id=eq.${messageId}`,
        },
        (payload: any) => {
          const row = payload.new;
          onUpdate(row.response || '', row.status);
        }
      )
      .subscribe();

    return () => {
      client.removeChannel(channel);
    };
  }

  /**
   * Poll for message response (fallback if realtime isn't set up).
   */
  async pollMessageResponse(messageId: string): Promise<{ response: string; status: string } | null> {
    if (!isSupabaseEnabled()) return null;
    const client = getSupabaseClient();
    if (!client) return null;

    const { data } = await client
      .from('chat_messages')
      .select('response, status')
      .eq('id', messageId)
      .single();

    return data ? { response: data.response || '', status: data.status } : null;
  }

  /** Fetch active local systems (for web mode dashboard) */
  async fetchActiveSystems(): Promise<Array<{
    id: string;
    name: string;
    status: string;
    lastHeartbeat: string;
    capabilities: any;
  }>> {
    if (!this.userId || !isSupabaseEnabled()) return [];
    const client = getSupabaseClient();
    if (!client) return [];

    const { data } = await client
      .from('local_systems')
      .select('*')
      .eq('user_id', this.userId)
      .order('last_heartbeat', { ascending: false });

    return (data ?? []).map(s => ({
      id: s.id,
      name: s.name,
      status: s.status,
      lastHeartbeat: s.last_heartbeat,
      capabilities: s.capabilities,
    }));
  }

  /**
   * Fetch remote chats that don't exist locally (for desktop pull-sync).
   * Returns full Chat objects for any session IDs not in the provided local set.
   */
  async fetchNewRemoteChats(localChatIds: Set<string>): Promise<Chat[]> {
    if (!this.userId || !isSupabaseEnabled()) return [];
    const client = getSupabaseClient();
    if (!client) return [];

    const { data: sessions } = await client
      .from('chat_sessions')
      .select('*')
      .eq('user_id', this.userId)
      .order('updated_at', { ascending: false });

    if (!sessions) return [];

    const newSessions = sessions.filter(s => !localChatIds.has(s.id));
    if (newSessions.length === 0) return [];

    const chats: Chat[] = [];
    for (const s of newSessions) {
      const { data: msgs } = await client
        .from('chat_messages')
        .select('*')
        .eq('session_id', s.id)
        .order('created_at', { ascending: true });

      const messages: Message[] = (msgs ?? []).flatMap(m => {
        const out: Message[] = [];
        if (m.content) {
          out.push({
            id: m.id + '_user',
            role: 'user',
            content: m.content,
            timestamp: new Date(m.created_at).getTime(),
            metadata: m.metadata,
          });
        }
        if (m.response) {
          out.push({
            id: m.id + '_assistant',
            role: 'assistant',
            content: m.response,
            timestamp: new Date(m.updated_at || m.created_at).getTime(),
            metadata: m.metadata,
          });
        }
        return out;
      });

      chats.push({
        id: s.id,
        title: s.title,
        messages,
        createdAt: new Date(s.created_at).getTime(),
        updatedAt: new Date(s.updated_at).getTime(),
      });
    }
    return chats;
  }

  destroy(): void {
    if (this.realtimeSubscription) {
      const client = getSupabaseClient();
      if (client) client.removeChannel(this.realtimeSubscription);
    }
  }
}
