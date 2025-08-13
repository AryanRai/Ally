// Remote server configuration
export const REMOTE_CONFIG = {
  // Replace with your Digital Ocean droplet IP
  DEFAULT_SERVER_URL: 'http://ally.aryanrai.me:3001',
  
  // Connection settings
  RECONNECT_ATTEMPTS: 5,
  RECONNECT_DELAY: 3000,
  
  // Ally identification
  DEFAULT_ALLY_NAME: 'Glass PiP Ally',
  
  // Auto-connect on startup (set to true if you want automatic connection)
  AUTO_CONNECT: true
};

// Helper function to get server URL from localStorage or default
export const getServerUrl = (): string => {
  return localStorage.getItem('ally-remote-server-url') || REMOTE_CONFIG.DEFAULT_SERVER_URL;
};

// Helper function to save server URL
export const saveServerUrl = (url: string): void => {
  localStorage.setItem('ally-remote-server-url', url);
};