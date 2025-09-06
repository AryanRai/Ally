-- Remote Chat API Database Schema
-- This migration sets up the database schema for the remote chat functionality

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Extended chat sessions table
CREATE TABLE IF NOT EXISTS chat_sessions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT 'New Chat',
  metadata JSONB DEFAULT '{}',
  is_remote BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enhanced chat messages table with remote support
CREATE TABLE IF NOT EXISTS chat_messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID REFERENCES chat_sessions(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  response TEXT DEFAULT '',
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'error')),
  error_message TEXT,
  metadata JSONB DEFAULT '{}',
  is_remote BOOLEAN DEFAULT false,
  local_system_id TEXT, -- Identifies which local system should process this
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  processed_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE
);

-- Tool execution tracking
CREATE TABLE IF NOT EXISTS tool_executions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  message_id UUID REFERENCES chat_messages(id) ON DELETE CASCADE,
  tool_name TEXT NOT NULL,
  parameters JSONB DEFAULT '{}',
  result JSONB,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  error_message TEXT,
  execution_time_ms INTEGER,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE
);

-- Local system registration and heartbeat
CREATE TABLE IF NOT EXISTS local_systems (
  id TEXT PRIMARY KEY, -- Unique identifier for each local system
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  last_heartbeat TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  status TEXT DEFAULT 'offline' CHECK (status IN ('online', 'offline', 'busy')),
  capabilities JSONB DEFAULT '{}', -- Available tools, models, etc.
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_chat_messages_status ON chat_messages(status, created_at);
CREATE INDEX IF NOT EXISTS idx_chat_messages_remote ON chat_messages(is_remote, local_system_id, status);
CREATE INDEX IF NOT EXISTS idx_chat_messages_user_session ON chat_messages(user_id, session_id, created_at);
CREATE INDEX IF NOT EXISTS idx_tool_executions_message ON tool_executions(message_id);
CREATE INDEX IF NOT EXISTS idx_tool_executions_status ON tool_executions(status, created_at);
CREATE INDEX IF NOT EXISTS idx_local_systems_user ON local_systems(user_id, status);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_user ON chat_sessions(user_id, created_at);

-- Row Level Security policies
ALTER TABLE chat_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE tool_executions ENABLE ROW LEVEL SECURITY;
ALTER TABLE local_systems ENABLE ROW LEVEL SECURITY;

-- Users can only access their own data
CREATE POLICY "Users can access own sessions" ON chat_sessions
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can access own messages" ON chat_messages
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can access own tool executions" ON tool_executions
  FOR ALL USING (auth.uid() = (SELECT user_id FROM chat_messages WHERE id = message_id));

CREATE POLICY "Users can access own local systems" ON local_systems
  FOR ALL USING (auth.uid() = user_id);

-- Enable realtime for all tables
ALTER PUBLICATION supabase_realtime ADD TABLE chat_sessions;
ALTER PUBLICATION supabase_realtime ADD TABLE chat_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE tool_executions;
ALTER PUBLICATION supabase_realtime ADD TABLE local_systems;

-- Function to update message response incrementally (for streaming)
CREATE OR REPLACE FUNCTION append_message_response(
  message_id UUID,
  new_content TEXT
) RETURNS void AS $$
BEGIN
  UPDATE chat_messages 
  SET 
    response = COALESCE(response, '') || new_content,
    updated_at = NOW()
  WHERE id = message_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to update local system heartbeat
CREATE OR REPLACE FUNCTION update_system_heartbeat(
  system_id TEXT,
  new_status TEXT DEFAULT 'online'
) RETURNS void AS $$
BEGIN
  UPDATE local_systems 
  SET 
    last_heartbeat = NOW(),
    status = new_status
  WHERE id = system_id;
  
  -- Insert if doesn't exist (upsert functionality)
  IF NOT FOUND THEN
    INSERT INTO local_systems (id, user_id, name, status, last_heartbeat)
    VALUES (system_id, auth.uid(), system_id, new_status, NOW())
    ON CONFLICT (id) DO UPDATE SET
      last_heartbeat = NOW(),
      status = new_status;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get pending messages for a local system
CREATE OR REPLACE FUNCTION get_pending_messages(
  system_id TEXT,
  batch_size INTEGER DEFAULT 10
) RETURNS TABLE (
  id UUID,
  session_id UUID,
  user_id UUID,
  content TEXT,
  metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    m.id,
    m.session_id,
    m.user_id,
    m.content,
    m.metadata,
    m.created_at
  FROM chat_messages m
  WHERE m.is_remote = true
    AND m.local_system_id = system_id
    AND m.status = 'pending'
  ORDER BY m.created_at ASC
  LIMIT batch_size;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to update message status
CREATE OR REPLACE FUNCTION update_message_status(
  message_id UUID,
  new_status TEXT,
  error_msg TEXT DEFAULT NULL
) RETURNS void AS $$
BEGIN
  UPDATE chat_messages 
  SET 
    status = new_status,
    error_message = error_msg,
    updated_at = NOW(),
    processed_at = CASE WHEN new_status = 'processing' THEN NOW() ELSE processed_at END,
    completed_at = CASE WHEN new_status IN ('completed', 'error') THEN NOW() ELSE completed_at END
  WHERE id = message_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply the trigger to relevant tables
CREATE TRIGGER update_chat_sessions_updated_at
  BEFORE UPDATE ON chat_sessions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_chat_messages_updated_at
  BEFORE UPDATE ON chat_messages
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();