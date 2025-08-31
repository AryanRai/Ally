import '@testing-library/jest-dom';

// Mock window.pip for tests
global.window = global.window || {};
(global.window as any).pip = {
  ollama: {
    isAvailable: () => Promise.resolve(true),
    getModels: () => Promise.resolve([]),
    chat: () => Promise.resolve('Mock response'),
    streamChatWithThinking: () => Promise.resolve('Mock response'),
    getConfig: () => Promise.resolve({}),
    updateConfig: () => {}
  }
};

// Mock electron APIs
(global.window as any).electronAPI = {
  minimize: () => {},
  close: () => {},
  setAlwaysOnTop: () => {},
  setSize: () => {},
  getSize: () => Promise.resolve([400, 600]),
  onResize: () => {},
  removeAllListeners: () => {}
};