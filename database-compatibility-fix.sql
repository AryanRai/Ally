-- Database Compatibility Fix for Ally Integration
-- This script fixes schema compatibility issues between applications

-- Add missing 'type' column to local_systems table
ALTER TABLE local_systems ADD COLUMN IF NOT EXISTS type TEXT DEFAULT 'web';

-- Create a view that maps chat_messages to messages for compatibility
CREATE OR REPLACE VIEW messages AS
SELECT 
  id,
  session_id,
  user_id,
  content,
  response,
  status,
  error_message,
  metadata,
  is_remote,
  local_system_id,
  created_at,
  updated_at,
  processed_at,
  completed_at
FROM chat_messages;

-- Create insert trigger for messages view
CREATE OR REPLACE FUNCTION messages_insert_trigger()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO chat_messages (
    id, session_id, user_id, content, response, status, 
    error_message, metadata, is_remote, local_system_id,
    created_at, updated_at, processed_at, completed_at
  ) VALUES (
    COALESCE(NEW.id, gen_random_uuid()),
    NEW.session_id,
    NEW.user_id,
    NEW.content,
    COALESCE(NEW.response, ''),
    COALESCE(NEW.status, 'pending'),
    NEW.error_message,
    COALESCE(NEW.metadata, '{}'),
    COALESCE(NEW.is_remote, false),
    NEW.local_system_id,
    COALESCE(NEW.created_at, NOW()),
    COALESCE(NEW.updated_at, NOW()),
    NEW.processed_at,
    NEW.completed_at
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER messages_insert_trigger
  INSTEAD OF INSERT ON messages
  FOR EACH ROW EXECUTE FUNCTION messages_insert_trigger();

-- Create update trigger for messages view
CREATE OR REPLACE FUNCTION messages_update_trigger()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE chat_messages SET
    content = NEW.content,
    response = NEW.response,
    status = NEW.status,
    error_message = NEW.error_message,
    metadata = NEW.metadata,
    is_remote = NEW.is_remote,
    local_system_id = NEW.local_system_id,
    updated_at = NOW(),
    processed_at = NEW.processed_at,
    completed_at = NEW.completed_at
  WHERE id = OLD.id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER messages_update_trigger
  INSTEAD OF UPDATE ON messages
  FOR EACH ROW EXECUTE FUNCTION messages_update_trigger();

-- Create delete trigger for messages view
CREATE OR REPLACE FUNCTION messages_delete_trigger()
RETURNS TRIGGER AS $$
BEGIN
  DELETE FROM chat_messages WHERE id = OLD.id;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER messages_delete_trigger
  INSTEAD OF DELETE ON messages
  FOR EACH ROW EXECUTE FUNCTION messages_delete_trigger();

-- Enable RLS on the messages view
ALTER VIEW messages SET (security_invoker = true);

-- Update local_systems table to support both text and UUID IDs
-- Create a function to handle flexible ID insertion
CREATE OR REPLACE FUNCTION upsert_local_system(
  system_id TEXT,
  system_user_id UUID,
  system_name TEXT,
  system_type TEXT DEFAULT 'web',
  system_status TEXT DEFAULT 'online',
  system_capabilities JSONB DEFAULT '{}',
  system_metadata JSONB DEFAULT '{}'
) RETURNS void AS $$
BEGIN
  INSERT INTO local_systems (
    id, user_id, name, type, status, capabilities, metadata, last_heartbeat, created_at
  ) VALUES (
    system_id, system_user_id, system_name, system_type, system_status,
    system_capabilities, system_metadata, NOW(), NOW()
  )
  ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    type = EXCLUDED.type,
    status = EXCLUDED.status,
    capabilities = EXCLUDED.capabilities,
    metadata = EXCLUDED.metadata,
    last_heartbeat = NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create a function to handle flexible session ID insertion
CREATE OR REPLACE FUNCTION create_chat_session_flexible(
  session_id TEXT,
  session_user_id UUID,
  session_title TEXT,
  session_metadata JSONB DEFAULT '{}',
  session_is_remote BOOLEAN DEFAULT false
) RETURNS UUID AS $$
DECLARE
  session_uuid UUID;
BEGIN
  -- Try to parse session_id as UUID, otherwise generate new one
  BEGIN
    session_uuid := session_id::UUID;
  EXCEPTION WHEN invalid_text_representation THEN
    session_uuid := gen_random_uuid();
  END;
  
  INSERT INTO chat_sessions (
    id, user_id, title, metadata, is_remote, created_at, updated_at
  ) VALUES (
    session_uuid, session_user_id, session_title, session_metadata, session_is_remote, NOW(), NOW()
  )
  ON CONFLICT (id) DO UPDATE SET
    title = EXCLUDED.title,
    metadata = EXCLUDED.metadata,
    is_remote = EXCLUDED.is_remote,
    updated_at = NOW();
    
  RETURN session_uuid;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create a function to handle flexible message ID insertion
CREATE OR REPLACE FUNCTION create_message_flexible(
  message_id TEXT,
  message_session_id TEXT,
  message_user_id UUID,
  message_content TEXT,
  message_response TEXT DEFAULT '',
  message_status TEXT DEFAULT 'pending',
  message_metadata JSONB DEFAULT '{}',
  message_is_remote BOOLEAN DEFAULT false,
  message_local_system_id TEXT DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
  message_uuid UUID;
  session_uuid UUID;
BEGIN
  -- Try to parse message_id as UUID, otherwise generate new one
  BEGIN
    message_uuid := message_id::UUID;
  EXCEPTION WHEN invalid_text_representation THEN
    message_uuid := gen_random_uuid();
  END;
  
  -- Try to parse session_id as UUID, otherwise generate new one
  BEGIN
    session_uuid := message_session_id::UUID;
  EXCEPTION WHEN invalid_text_representation THEN
    session_uuid := gen_random_uuid();
  END;
  
  INSERT INTO chat_messages (
    id, session_id, user_id, content, response, status, metadata,
    is_remote, local_system_id, created_at, updated_at
  ) VALUES (
    message_uuid, session_uuid, message_user_id, message_content, message_response,
    message_status, message_metadata, message_is_remote, message_local_system_id, NOW(), NOW()
  );
    
  RETURN message_uuid;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant necessary permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON messages TO authenticated;
GRANT EXECUTE ON FUNCTION upsert_local_system TO authenticated;
GRANT EXECUTE ON FUNCTION create_chat_session_flexible TO authenticated;
GRANT EXECUTE ON FUNCTION create_message_flexible TO authenticated;

-- Enable realtime for the messages view
ALTER PUBLICATION supabase_realtime ADD TABLE messages;