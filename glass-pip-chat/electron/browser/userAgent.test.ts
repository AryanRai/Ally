import { expect, it } from 'vitest';
import { chromiumUserAgent } from './userAgent';
it('uses the real Chromium version without desktop product tokens', () => {
  const chrome = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.6478.234 Safari/537.36';
  expect(chromiumUserAgent(chrome + ' glass-pip-chat/1.0.0 Electron/31.7.7', 'glass-pip-chat')).toBe(chrome);
  expect(chromiumUserAgent(chrome, 'Ally')).toBe(chrome);
});
