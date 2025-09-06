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
  LOCAL_SYSTEM_ID: import.meta.env.VITE_LOCAL_SYSTEM_ID || 'ally-local-system',
  LOCAL_SYSTEM_NAME: import.meta.env.VITE_LOCAL_SYSTEM_NAME || 'Ally Local System',
  POLL_INTERVAL: parseInt(import.meta.env.VITE_POLL_INTERVAL || '2000'),
  BATCH_SIZE: parseInt(import.meta.env.VITE_BATCH_SIZE || '10'),
  HEARTBEAT_INTERVAL: parseInt(import.meta.env.VITE_HEARTBEAT_INTERVAL || '30000'),
  RETRY_ATTEMPTS: parseInt(import.meta.env.VITE_RETRY_ATTEMPTS || '3'),
};