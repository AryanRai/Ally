/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_PUBLISHABLE_KEY: string
  readonly VITE_SUPABASE_SECRET_KEY: string
  readonly VITE_LOCAL_SYSTEM_ID: string
  readonly VITE_LOCAL_SYSTEM_NAME: string
  readonly VITE_POLL_INTERVAL: string
  readonly VITE_BATCH_SIZE: string
  readonly VITE_HEARTBEAT_INTERVAL: string
  readonly VITE_RETRY_ATTEMPTS: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}