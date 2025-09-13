/**
 * Remote Message Poller Configuration
 * Requirements: 3.1, 3.2, 3.3
 */

import { MessagePollerConfig } from '../services/remoteMessagePoller';
import { env } from '../utils/env';

export function createRemotePollerConfig(): MessagePollerConfig {
  // Get system config from localStorage or use defaults
  const systemId = (typeof window !== 'undefined' ? localStorage.getItem('ally-system-id') : null) || env.LOCAL_SYSTEM_ID;
  const systemName = (typeof window !== 'undefined' ? localStorage.getItem('ally-system-name') : null) || env.LOCAL_SYSTEM_NAME;

  const config: MessagePollerConfig = {
    supabaseUrl: env.SUPABASE_URL,
    supabaseServiceKey: env.SUPABASE_SERVICE_KEY,
    systemId,
    systemName,
    pollInterval: env.POLL_INTERVAL,
    batchSize: env.BATCH_SIZE,
    heartbeatInterval: env.HEARTBEAT_INTERVAL,
    maxRetryAttempts: env.RETRY_ATTEMPTS,
    retryDelay: 1000 // Start with 1 second delay
  };

  console.log('🔧 RemotePollerConfig: Using system config:', { systemId, systemName });
  return config;
}

export const DEFAULT_POLLER_CONFIG = createRemotePollerConfig();