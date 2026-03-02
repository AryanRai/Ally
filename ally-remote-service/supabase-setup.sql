-- ============================================
-- Ally Remote Service - Supabase Schema Setup
-- ============================================
-- Run this in your NEW Supabase project's SQL Editor
-- After creating a project at https://supabase.com/dashboard

-- 1. Chat sessions
CREATE TABLE IF NOT EXISTS chat_sessions (
  id TEXT PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT 'New Chat',
  metadata JSONB DEFAULT '{}',
  is_remote BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Chat messages
CREATE TABLE IF NOT EXISTS chat_messages (
  id TEXT PRIMARY KEY,
  session_id TEXT REFERENCES chat_sessions(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  response TEXT DEFAULT '',
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'error')),
  error_message TEXT,
  metadata JSONB DEFAULT '{}',
  source TEXT DEFAULT 'web' CHECK (source IN ('web', 'discord', 'phone', 'desktop')),
  is_remote BOOLEAN DEFAULT false,
  local_system_id TEXT NOT NULL DEFAULT 'default',
  discord_delivered BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

-- 3. Local systems (desktop Ally instances)
CREATE TABLE IF NOT EXISTS local_systems (
  id TEXT PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  status TEXT DEFAULT 'offline' CHECK (status IN ('online', 'offline', 'busy')),
  capabilities JSONB DEFAULT '{}',
  metadata JSONB DEFAULT '{}',
  last_heartbeat TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Tool executions
CREATE TABLE IF NOT EXISTS tool_executions (
  id TEXT PRIMARY KEY,
  message_id TEXT REFERENCES chat_messages(id) ON DELETE CASCADE,
  tool_name TEXT NOT NULL,
  parameters JSONB DEFAULT '{}',
  result JSONB,
  status TEXT DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed')),
  error_message TEXT,
  execution_time_ms INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- 5. Link tokens (for QR pairing)
CREATE TABLE IF NOT EXISTS link_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token TEXT UNIQUE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  system_id TEXT,
  system_name TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'claimed', 'expired')),
  claimed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. Discord links (maps Discord users to Ally users)
CREATE TABLE IF NOT EXISTS discord_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  discord_user_id TEXT NOT NULL UNIQUE,
  discord_username TEXT,
  discord_guild_id TEXT,
  discord_channel_id TEXT,
  linked_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- Row Level Security
-- ============================================
ALTER TABLE chat_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE local_systems ENABLE ROW LEVEL SECURITY;
ALTER TABLE tool_executions ENABLE ROW LEVEL SECURITY;
ALTER TABLE link_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE discord_links ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users manage own sessions" ON chat_sessions FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users manage own messages" ON chat_messages FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users manage own systems" ON local_systems FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users view own tool executions" ON tool_executions FOR SELECT
  USING (EXISTS (SELECT 1 FROM chat_messages WHERE chat_messages.id = tool_executions.message_id AND chat_messages.user_id = auth.uid()));
CREATE POLICY "Users insert own tool executions" ON tool_executions FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM chat_messages WHERE chat_messages.id = tool_executions.message_id AND chat_messages.user_id = auth.uid()));
CREATE POLICY "Users update own tool executions" ON tool_executions FOR UPDATE
  USING (EXISTS (SELECT 1 FROM chat_messages WHERE chat_messages.id = tool_executions.message_id AND chat_messages.user_id = auth.uid()));
CREATE POLICY "Users manage own link tokens" ON link_tokens FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users manage own discord links" ON discord_links FOR ALL USING (auth.uid() = user_id);

-- Service role can read link tokens by token value (for QR claim)
CREATE POLICY "Service can read pending tokens" ON link_tokens FOR SELECT USING (true);
CREATE POLICY "Service can update tokens" ON link_tokens FOR UPDATE USING (true);

-- ============================================
-- Indexes
-- ============================================
CREATE INDEX IF NOT EXISTS idx_messages_session ON chat_messages(session_id);
CREATE INDEX IF NOT EXISTS idx_messages_status ON chat_messages(status) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_messages_source ON chat_messages(source);
CREATE INDEX IF NOT EXISTS idx_systems_user ON local_systems(user_id);
CREATE INDEX IF NOT EXISTS idx_systems_status ON local_systems(status);
CREATE INDEX IF NOT EXISTS idx_link_tokens_token ON link_tokens(token);
CREATE INDEX IF NOT EXISTS idx_link_tokens_status ON link_tokens(status) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_discord_links_discord ON discord_links(discord_user_id);

-- ============================================
-- Functions
-- ============================================

-- Auto-expire old link tokens
CREATE OR REPLACE FUNCTION expire_old_tokens() RETURNS void AS $$
BEGIN
  UPDATE link_tokens SET status = 'expired' WHERE status = 'pending' AND expires_at < NOW();
END;
$$ LANGUAGE plpgsql;

-- Update system heartbeat (called by desktop poller via RPC)
CREATE OR REPLACE FUNCTION update_system_heartbeat(system_id TEXT, new_status TEXT DEFAULT 'online')
RETURNS void AS $$
BEGIN
  UPDATE local_systems
  SET last_heartbeat = NOW(), status = new_status
  WHERE id = system_id AND user_id = auth.uid();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
