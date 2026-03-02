-- Migration: Add discord_delivered column to chat_messages
-- Run this in your Supabase SQL Editor

ALTER TABLE chat_messages
  ADD COLUMN IF NOT EXISTS discord_delivered BOOLEAN DEFAULT false;

-- Index for fast cron queries
CREATE INDEX IF NOT EXISTS idx_chat_messages_discord_pending
  ON chat_messages (source, status, discord_delivered)
  WHERE source = 'discord' AND discord_delivered = false;
