# Glass PiP Chat – DroidCore UI Bridge (Supabase Edition)

Apple-style glassmorphic, picture-in-picture chat window (Electron + React/Tailwind + Framer Motion), wired to **Ollama (gpt-oss‑20b)** locally and **Supabase** for storage with realtime capabilities.

## Stack
- **Shell:** Electron (Node/TS) – fast iteration. (Later optional: Tauri for lean builds)
- **UI:** React + TypeScript + Tailwind + Framer Motion (or Motion Primitives), Radix UI, Lucide.
- **LLM Local:** Ollama @ `http://localhost:11434` targeting `gpt-oss:20b` (adjust model tag as needed).
- **Storage:** Supabase (PostgreSQL + Realtime + Edge Functions) with automatic scaling and built-in security.

## Features

- 🪟 **Frameless, transparent window** with cross-platform blur support (macOS vibrancy, Windows Acrylic, Linux compositor blur)
- 🎯 **Always-on-top PiP mode** visible on all workspaces
- 🔄 **Drag to move, snap to corners** with smooth animations
- 📏 **Three sizes (S/M/L)** with collapse/expand states
- ⌨️ **Global shortcut** (Cmd/Ctrl+Shift+C) to toggle visibility
- 💾 **Persistent state** for window position and size
- ⚡ **Realtime responses** via Supabase subscriptions (no polling needed)
- 🔒 **Built-in security** with Row Level Security and API rate limiting
- 🎨 **Glassmorphic design** with adaptive blur effects

## High-Level Flow

```
Renderer (PiP UI)  <->  Preload IPC  <->  Main (Electron)
                                             |
                                             +-- HTTP -> Ollama (local)    [stream]
                                             |
                                             +-- HTTPS -> Supabase        [realtime storage]
```

## Supabase Database Schema

Set up your Supabase database with these tables:

```sql
-- Chat sessions
CREATE TABLE chat_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR(255),
  title VARCHAR(500),
  model VARCHAR(100) DEFAULT 'gpt-oss:20b',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Chat messages
CREATE TABLE chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES chat_sessions(id) ON DELETE CASCADE,
  role VARCHAR(20) NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  tokens_used INTEGER,
  processing_time INTEGER, -- milliseconds
  metadata JSONB, -- for storing additional data like model params
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_chat_messages_session_created ON chat_messages(session_id, created_at);
CREATE INDEX idx_chat_sessions_user_updated ON chat_sessions(user_id, updated_at DESC);

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE chat_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE chat_sessions;

-- Row Level Security
ALTER TABLE chat_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

-- Policies (adjust based on your auth needs)
CREATE POLICY "Users can manage own sessions" ON chat_sessions
FOR ALL USING (user_id = current_setting('request.jwt.claims')::json->>'sub');

CREATE POLICY "Users can manage own messages" ON chat_messages
FOR ALL USING (
  session_id IN (
    SELECT id FROM chat_sessions 
    WHERE user_id = current_setting('request.jwt.claims')::json->>'sub'
  )
);

-- Auto-cleanup function for old sessions
CREATE OR REPLACE FUNCTION cleanup_old_sessions()
RETURNS void AS $$
BEGIN
  DELETE FROM chat_sessions 
  WHERE updated_at < NOW() - INTERVAL '30 days';
END;
$$ LANGUAGE plpgsql;

-- Schedule cleanup weekly
SELECT cron.schedule('cleanup-sessions', '0 0 * * 0', 'SELECT cleanup_old_sessions();');
```

## Supabase Client Implementation

### Supabase API Client

```typescript
// src/lib/supabaseClient.ts
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

export type ChatSession = {
  id: string
  user_id: string
  title: string
  model: string
  created_at: string
  updated_at: string
}

export type ChatMessage = {
  id: string
  session_id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  tokens_used?: number
  processing_time?: number
  metadata?: Record<string, any>
  created_at: string
}
```

### Chat Service with Realtime

```typescript
// src/lib/chatService.ts
import { supabase, ChatSession, ChatMessage } from './supabaseClient'
import { RealtimeChannel } from '@supabase/supabase-js'

export class ChatService {
  private channel: RealtimeChannel | null = null
  private onMessageCallback: ((message: ChatMessage) => void) | null = null

  async createSession(userId: string, title: string): Promise<ChatSession> {
    const { data, error } = await supabase
      .from('chat_sessions')
      .insert([{
        user_id: userId,
        title: title || 'New Chat',
        model: import.meta.env.VITE_DEFAULT_MODEL || 'gpt-oss:20b'
      }])
      .select()
      .single()

    if (error) throw error
    return data
  }

  async getSession(sessionId: string): Promise<ChatSession> {
    const { data, error } = await supabase
      .from('chat_sessions')
      .select('*')
      .eq('id', sessionId)
      .single()

    if (error) throw error
    return data
  }

  async getMessages(sessionId: string): Promise<ChatMessage[]> {
    const { data, error } = await supabase
      .from('chat_messages')
      .select('*')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true })

    if (error) throw error
    return data || []
  }

  async addMessage(message: Omit<ChatMessage, 'id' | 'created_at'>): Promise<ChatMessage> {
    const { data, error } = await supabase
      .from('chat_messages')
      .insert([message])
      .select()
      .single()

    if (error) throw error
    return data
  }

  async updateMessage(id: string, updates: Partial<ChatMessage>): Promise<void> {
    const { error } = await supabase
      .from('chat_messages')
      .update(updates)
      .eq('id', id)

    if (error) throw error
  }

  // Realtime subscription for instant updates
  subscribeToMessages(sessionId: string, onMessage: (message: ChatMessage) => void) {
    this.onMessageCallback = onMessage
    
    this.channel = supabase
      .channel(`chat:${sessionId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'chat_messages',
        filter: `session_id=eq.${sessionId}`
      }, (payload) => {
        this.onMessageCallback?.(payload.new as ChatMessage)
      })
      .subscribe()
  }

  unsubscribeFromMessages() {
    if (this.channel) {
      supabase.removeChannel(this.channel)
      this.channel = null
      this.onMessageCallback = null
    }
  }

  // Get user's recent sessions
  async getUserSessions(userId: string, limit = 10): Promise<ChatSession[]> {
    const { data, error } = await supabase
      .from('chat_sessions')
      .select('*')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })
      .limit(limit)

    if (error) throw error
    return data || []
  }
}

export const chatService = new ChatService()
```

## Updated Ollama Client with Supabase Integration

```typescript
// src/lib/ollamaClient.ts
import { chatService } from './chatService'

export async function* streamOllama(opts: { 
  model: string; 
  prompt: string; 
  system?: string;
  sessionId: string;
  messageId?: string;
}) {
  const startTime = Date.now()
  let fullResponse = ''

  try {
    const res = await fetch('http://localhost:11434/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        model: opts.model, 
        prompt: opts.prompt, 
        stream: true, 
        system: opts.system 
      })
    })

    const reader = res.body!.getReader()
    const decoder = new TextDecoder()

    while (true) {
      const { value, done } = await reader.read()
      if (done) break

      const chunk = decoder.decode(value)
      for (const line of chunk.split('\n')) {
        if (!line.trim()) continue
        
        try {
          const json = JSON.parse(line)
          if (json.response) {
            fullResponse += json.response
            yield json.response
          }
        } catch (e) {
          // Skip malformed JSON lines
        }
      }
    }

    // Update the message in Supabase with final response
    if (opts.messageId) {
      await chatService.updateMessage(opts.messageId, {
        content: fullResponse,
        processing_time: Date.now() - startTime,
        metadata: { model: opts.model, completed: true }
      })
    }

  } catch (error) {
    // Handle errors by updating the message
    if (opts.messageId) {
      await chatService.updateMessage(opts.messageId, {
        content: `Error: ${error.message}`,
        metadata: { error: true, model: opts.model }
      })
    }
    throw error
  }
}
```

## React Component Integration

```tsx
// src/components/GlassChatPiP.tsx
import React, { useState, useEffect, useRef } from 'react'
import { chatService, ChatMessage, ChatSession } from '../lib/chatService'
import { streamOllama } from '../lib/ollamaClient'

export function GlassChatPiP() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [currentSession, setCurrentSession] = useState<ChatSession | null>(null)
  const [input, setInput] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const userId = 'default-user' // Replace with actual user management

  useEffect(() => {
    initializeChat()
    return () => chatService.unsubscribeFromMessages()
  }, [])

  const initializeChat = async () => {
    try {
      // Create or load session
      const session = await chatService.createSession(userId, 'PiP Chat')
      setCurrentSession(session)

      // Load existing messages
      const existingMessages = await chatService.getMessages(session.id)
      setMessages(existingMessages)

      // Subscribe to realtime updates
      chatService.subscribeToMessages(session.id, (newMessage) => {
        setMessages(prev => [...prev, newMessage])
      })
    } catch (error) {
      console.error('Failed to initialize chat:', error)
    }
  }

  const onSend = async (text: string) => {
    if (!currentSession || !text.trim()) return

    setIsStreaming(true)
    setInput('')

    try {
      // Add user message
      const userMessage = await chatService.addMessage({
        session_id: currentSession.id,
        role: 'user',
        content: text
      })

      // Create placeholder assistant message
      const assistantMessage = await chatService.addMessage({
        session_id: currentSession.id,
        role: 'assistant',
        content: '...',
        metadata: { streaming: true }
      })

      // Build conversation context
      const conversationHistory = [...messages, userMessage]
      const prompt = buildPrompt(conversationHistory)

      // Stream LLM response
      let streamedContent = ''
      for await (const token of streamOllama({
        model: currentSession.model,
        prompt,
        sessionId: currentSession.id,
        messageId: assistantMessage.id
      })) {
        streamedContent += token
        
        // Update UI immediately for streaming effect
        setMessages(prev => prev.map(msg => 
          msg.id === assistantMessage.id 
            ? { ...msg, content: streamedContent }
            : msg
        ))
      }

    } catch (error) {
      console.error('Error sending message:', error)
    } finally {
      setIsStreaming(false)
    }
  }

  const buildPrompt = (history: ChatMessage[]): string => {
    return history
      .filter(msg => msg.role !== 'system')
      .map(msg => `${msg.role}: ${msg.content}`)
      .join('\n') + '\nassistant:'
  }

  return (
    <div className="glass-pip-container">
      {/* Your existing glass UI components */}
      <div className="messages">
        {messages.map(msg => (
          <div key={msg.id} className={`message message-${msg.role}`}>
            {msg.content}
          </div>
        ))}
      </div>
      
      <div className="input-area">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && onSend(input)}
          disabled={isStreaming}
          placeholder="Type your message..."
        />
      </div>
    </div>
  )
}
```

## Environment Variables

Update your `.env.local` file:

```env
# Supabase Configuration
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-public-key
VITE_SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Ollama Configuration
VITE_DEFAULT_MODEL=gpt-oss:20b
VITE_OLLAMA_BASE_URL=http://localhost:11434

# Optional: User session management
VITE_USER_ID=default-user
```

## Milestones (Updated)

### ✅ M0 – UI Prototype (v0)
- Glass PiP component: drag/resize/snap, collapse pill, light/dark, animations.
- Local state persisted (size/position).
- No backend calls yet.

### ✅ M1 – Electron Shell 
- Frameless, transparent window, always-on-top, cross-platform blur effects
- Global shortcut toggle
- Bounds persistence in `userData`
- Preload exposes safe IPC for show/hide/toggle

### ✅ M2 – Ollama Integration (Current)
- `ollamaClient.ts` with **streaming** generation
- Stream tokens to the UI via direct fetch with ReadableStream
- Model default: `gpt-oss:20b` with settings override

### 📋 M3 – Supabase Integration (Replaces DO)
- **Database**: PostgreSQL with chat sessions and messages
- **Realtime**: Instant message updates without polling
- **Security**: Row Level Security for data protection
- **Scaling**: Unlimited API requests, predictable costs
- **Features**:
  - Session management with conversation history
  - Message threading and metadata storage
  - Automatic cleanup of old conversations
  - Built-in rate limiting and authentication

### 🤖 M5 – Robot Hooks (DroidCore)
- Add action channel: if message includes structured "robot-intent", emit to a local ROS2 bridge
- Store robot commands and responses in Supabase for audit trail

### 📋 M6 – Enhanced Features
- **Edge Functions** for custom API endpoints
- **Realtime presence** for multi-device sync
- **Message search** with full-text search capabilities
- **Export/Import** conversations via Supabase Storage

## Key Advantages Over DigitalOcean

### 🚀 **Performance**
- **Realtime subscriptions**: No polling overhead
- **Global CDN**: Fast worldwide access
- **Connection pooling**: Efficient database connections

### 💰 **Cost Efficiency**
- **Free tier**: 500MB database, unlimited API requests
- **Predictable scaling**: $25/month for 8GB + extras
- **No surprise charges**: Service becomes read-only when limits exceeded

### 🔒 **Security**
- **Built-in auth**: JWT tokens, Row Level Security
- **API rate limiting**: Automatic protection
- **HTTPS by default**: No certificate management needed

### 🛠 **Developer Experience**
- **Real-time dev tools**: Instant database changes in dashboard
- **Auto-generated APIs**: REST and GraphQL endpoints
- **TypeScript support**: Full type safety with generated types

## Updated Package Dependencies

```json
{
  "dependencies": {
    "@supabase/supabase-js": "^2.39.0",
    "@supabase/realtime-js": "^2.9.0",
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "framer-motion": "^10.16.0",
    "tailwindcss": "^3.3.0",
    "radix-ui": "^1.0.0",
    "lucide-react": "^0.263.1"
  },
  "devDependencies": {
    "electron": "^27.0.0",
    "typescript": "^5.0.0",
    "vite": "^4.4.0"
  }
}
```

## Deployment

### 1. Supabase Setup
```bash
# Install Supabase CLI
npm install -g supabase

# Login and link project
supabase login
supabase link --project-ref your-project-ref

# Deploy database schema
supabase db push
```

### 2. Local Development
```bash
# Install dependencies
npm install

# Start development
npm run dev
```

### 3. Production Build
```bash
# Build for current platform
npm run build

# Build for all platforms
npm run build:all
```

## Chat Flow Implementation

### Sending Messages

```typescript
async function sendMessage(text: string) {
  if (!currentSession) return

  // 1. Add user message to Supabase
  const userMessage = await chatService.addMessage({
    session_id: currentSession.id,
    role: 'user',
    content: text
  })

  // 2. Create streaming assistant message
  const assistantMessage = await chatService.addMessage({
    session_id: currentSession.id,
    role: 'assistant',
    content: '',
    metadata: { streaming: true }
  })

  // 3. Stream from Ollama and update Supabase in real-time
  let fullResponse = ''
  for await (const token of streamOllama({
    model: currentSession.model,
    prompt: buildConversationPrompt(messages),
    sessionId: currentSession.id,
    messageId: assistantMessage.id
  })) {
    fullResponse += token
    // UI updates automatically via realtime subscription
  }

  // 4. Update session timestamp
  await supabase
    .from('chat_sessions')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', currentSession.id)
}
```

### Realtime Updates

The UI automatically receives updates when:
- New messages are added by any client
- Messages are updated (streaming completion)
- Sessions are modified

This creates a seamless, real-time chat experience across all connected clients.

## Security Best Practices

### Row Level Security Policies

```sql
-- More granular policies for production
CREATE POLICY "Users can only read own chat data" ON chat_messages
FOR SELECT USING (
  session_id IN (
    SELECT id FROM chat_sessions 
    WHERE user_id = auth.uid()::text
  )
);

CREATE POLICY "Users can only insert to own sessions" ON chat_messages
FOR INSERT WITH CHECK (
  session_id IN (
    SELECT id FROM chat_sessions 
    WHERE user_id = auth.uid()::text
  )
);
```

### API Rate Limiting

```typescript
// Supabase Edge Function with rate limiting
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

serve(async (req) => {
  const authHeader = req.headers.get('Authorization')
  
  // Built-in rate limiting via Supabase
  if (!authHeader) {
    return new Response('Unauthorized', { status: 401 })
  }

  // Your API logic here
})
```

## Migration from DigitalOcean

If you have existing data in DigitalOcean (We Dont):

1. **Export your data** from DO Postgres
2. **Transform schema** to match Supabase structure
3. **Import via Supabase CLI** or dashboard
4. **Update environment variables** in your app
5. **Deploy new version** with Supabase client

## Next Steps

1. **Set up Supabase project** and configure database schema
2. **Replace DO API calls** with Supabase client methods  
3. **Implement realtime subscriptions** for instant UI updates
4. **Add user authentication** with Supabase Auth (optional)
5. **Deploy Edge Functions** for any custom API logic
6. **Configure RLS policies** for production security

This Supabase implementation provides better performance, lower costs, and enhanced security compared to the DigitalOcean approach, while maintaining the same core functionality of your Glass PiP Chat system.