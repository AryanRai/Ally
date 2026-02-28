/**
 * Environment Variables Helper
 * 
 * Provides consistent access to environment variables in the browser
 */

export const env = {
  // Supabase Configuration
  SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL || 'https://delzfrzfwhycdzozxwgp.supabase.co',
  SUPABASE_ANON_KEY: import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRlbHpmcnpmd2h5Y2R6b3p4d2dwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTcxNjE2NjQsImV4cCI6MjA3MjczNzY2NH0.aWqbefKFuWZHXbmgjp-a0_QoD17PBrxlIDH_hoIYd9g',
  SUPABASE_SERVICE_KEY: import.meta.env.VITE_SUPABASE_SERVICE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRlbHpmcnpmd2h5Y2R6b3p4d2dwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NzE2MTY2NCwiZXhwIjoyMDcyNzM3NjY0fQ.xBgsm4NsZSde7Emm65GWaE0TcLl1xQhx6Uhx2h4tV20',

  // Local System Configuration
  LOCAL_SYSTEM_ID: import.meta.env.VITE_LOCAL_SYSTEM_ID || 'ally-desktop-system',
  LOCAL_SYSTEM_NAME: import.meta.env.VITE_LOCAL_SYSTEM_NAME || 'Ally Desktop System',
  POLL_INTERVAL: parseInt(import.meta.env.VITE_POLL_INTERVAL || '2000'),
  BATCH_SIZE: parseInt(import.meta.env.VITE_BATCH_SIZE || '10'),
  HEARTBEAT_INTERVAL: parseInt(import.meta.env.VITE_HEARTBEAT_INTERVAL || '30000'),
  RETRY_ATTEMPTS: parseInt(import.meta.env.VITE_RETRY_ATTEMPTS || '3'),

  // Remote Service Configuration
  REMOTE_SERVICE_URL: import.meta.env.VITE_REMOTE_SERVICE_URL || 'https://your-ally-remote.vercel.app',
  ENABLE_REMOTE: import.meta.env.VITE_ENABLE_REMOTE === 'true', // Default to false (local mode)
  DISABLE_SUPABASE: import.meta.env.VITE_DISABLE_SUPABASE === 'true', // Explicitly disable Supabase

  // Feature Flags
  ENABLE_SPEECH: import.meta.env.VITE_ENABLE_SPEECH !== 'false',
  ENABLE_TOOLS: import.meta.env.VITE_ENABLE_TOOLS !== 'false',
  TOOL_CALLING_ENABLED: import.meta.env.VITE_TOOL_CALLING_ENABLED !== 'false',
  UNIFIED_INTEGRATION_ENABLED: import.meta.env.VITE_UNIFIED_INTEGRATION_ENABLED !== 'false',
  CONTEXT_MONITORING_ENABLED: import.meta.env.VITE_CONTEXT_MONITORING_ENABLED !== 'false',

  // API Endpoints
  OLLAMA_BASE_URL: import.meta.env.VITE_OLLAMA_BASE_URL || 'http://localhost:11434',
  SPEECH_SERVICE_URL: import.meta.env.VITE_SPEECH_SERVICE_URL || 'ws://localhost:8765',
  STREAM_HANDLER_URL: import.meta.env.VITE_STREAM_HANDLER_URL || 'ws://localhost:8766',

  // Tool Configuration
  MAX_TOOL_CALLS: parseInt(import.meta.env.VITE_MAX_TOOL_CALLS || '5'),
  TOOL_CALL_TIMEOUT: parseInt(import.meta.env.VITE_TOOL_CALL_TIMEOUT || '30000'),

  // Development Flags
  IS_DEV: import.meta.env.DEV,
  IS_PROD: import.meta.env.PROD,
  APP_NAME: 'Ally Glass PiP Chat',
  APP_VERSION: '1.0.0',
};