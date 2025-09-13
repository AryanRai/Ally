/**
 * Shared Configuration for Ally Integration
 * 
 * This file provides unified configuration that works across both
 * ally-remote-service (Next.js) and glass-pip-chat (Vite/Electron)
 */

// Environment detection
const isNextJS = typeof process !== 'undefined' && process.env.NEXT_PUBLIC_SUPABASE_URL;
const isVite = typeof import.meta !== 'undefined' && import.meta.env;

// Unified environment variable access
function getEnvVar(key) {
  if (isNextJS) {
    // Next.js environment variables
    switch (key) {
      case 'SUPABASE_URL':
        return process.env.NEXT_PUBLIC_SUPABASE_URL;
      case 'SUPABASE_ANON_KEY':
        return process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      case 'SUPABASE_SERVICE_KEY':
        return process.env.SUPABASE_SERVICE_ROLE_KEY;
      case 'LOCAL_SYSTEM_ID':
        return process.env.LOCAL_SYSTEM_ID || 'ally-web-system';
      case 'LOCAL_SYSTEM_NAME':
        return process.env.LOCAL_SYSTEM_NAME || 'Ally Web System';
      case 'POLL_INTERVAL':
        return parseInt(process.env.POLL_INTERVAL || '2000');
      case 'BATCH_SIZE':
        return parseInt(process.env.BATCH_SIZE || '10');
      case 'HEARTBEAT_INTERVAL':
        return parseInt(process.env.HEARTBEAT_INTERVAL || '30000');
      default:
        return process.env[key];
    }
  } else if (isVite) {
    // Vite environment variables
    switch (key) {
      case 'SUPABASE_URL':
        return import.meta.env.VITE_SUPABASE_URL;
      case 'SUPABASE_ANON_KEY':
        return import.meta.env.VITE_SUPABASE_ANON_KEY;
      case 'SUPABASE_SERVICE_KEY':
        return import.meta.env.VITE_SUPABASE_SERVICE_KEY;
      case 'LOCAL_SYSTEM_ID':
        return import.meta.env.VITE_LOCAL_SYSTEM_ID || 'ally-desktop-system';
      case 'LOCAL_SYSTEM_NAME':
        return import.meta.env.VITE_LOCAL_SYSTEM_NAME || 'Ally Desktop System';
      case 'POLL_INTERVAL':
        return parseInt(import.meta.env.VITE_POLL_INTERVAL || '2000');
      case 'BATCH_SIZE':
        return parseInt(import.meta.env.VITE_BATCH_SIZE || '10');
      case 'HEARTBEAT_INTERVAL':
        return parseInt(import.meta.env.VITE_HEARTBEAT_INTERVAL || '30000');
      default:
        return import.meta.env[`VITE_${key}`];
    }
  }
  
  // Fallback defaults - use environment variables in production
  const defaults = {
    SUPABASE_URL: process.env.SUPABASE_URL || '',
    SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY || '',
    LOCAL_SYSTEM_ID: 'ally-system',
    LOCAL_SYSTEM_NAME: 'Ally System',
    POLL_INTERVAL: 2000,
    BATCH_SIZE: 10,
    HEARTBEAT_INTERVAL: 30000
  };
  
  return defaults[key];
}

// Unified configuration object
export const sharedConfig = {
  supabase: {
    url: getEnvVar('SUPABASE_URL'),
    anonKey: getEnvVar('SUPABASE_ANON_KEY'),
    serviceKey: getEnvVar('SUPABASE_SERVICE_KEY')
  },
  system: {
    id: getEnvVar('LOCAL_SYSTEM_ID'),
    name: getEnvVar('LOCAL_SYSTEM_NAME'),
    type: isNextJS ? 'web' : 'desktop'
  },
  polling: {
    interval: getEnvVar('POLL_INTERVAL'),
    batchSize: getEnvVar('BATCH_SIZE'),
    heartbeatInterval: getEnvVar('HEARTBEAT_INTERVAL')
  },
  storage: {
    authKey: isNextJS ? 'ally-web-auth' : 'ally-desktop-auth',
    sessionKey: isNextJS ? 'ally-web-session' : 'ally-desktop-session'
  }
};

// Environment detection helpers
export const environment = {
  isNextJS,
  isVite,
  isElectron: typeof window !== 'undefined' && window.electronAPI,
  isBrowser: typeof window !== 'undefined',
  isNode: typeof process !== 'undefined'
};

export default sharedConfig;