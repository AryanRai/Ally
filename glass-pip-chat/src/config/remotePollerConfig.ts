/**
 * Remote Message Poller Configuration
 * Requirements: 3.1, 3.2, 3.3
 */

import { MessagePollerConfig } from '../services/remoteMessagePoller';
import { env } from '../utils/env';

export function createRemotePollerConfig(): MessagePollerConfig {
  const config: MessagePollerConfig = {
    supabaseUrl: env.SUPABASE_URL,
    supabaseServiceKey: env.SUPABASE_SERVICE_KEY,
    systemId: env.LOCAL_SYSTEM_ID,
    systemName: env.LOCAL_SYSTEM_NAME,
    pollInterval: env.POLL_INTERVAL,
    batchSize: env.BATCH_SIZE,
    heartbeatInterval: env.HEARTBEAT_INTERVAL,
    maxRetryAttempts: env.RETRY_ATTEMPTS,
    retryDelay: 1000 // Start with 1 second delay
  };

  return config;
}

export const DEFAULT_POLLER_CONFIG = createRemotePollerConfig();