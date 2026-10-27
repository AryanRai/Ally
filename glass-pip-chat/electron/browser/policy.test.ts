// @vitest-environment node
import { expect, it } from 'vitest';
import { callerKey, operationArgs, taskKey, webURL } from './policy';
it('rejects local files, scripts, credentials and unsupported operations', () => {
  for (const url of ['file:///C:/test.pdf','javascript:alert(1)','https://user:password@example.com','data:text/html,hello']) expect(() => webURL(url)).toThrow();
  for (const operation of ['javascript','evaluate','download','click_at']) expect(() => operationArgs({ operation })).toThrow();
  expect(webURL('https://example.com')).toBe('https://example.com/');
});
it('binds chat identity and forwards only validated operation fields', () => {
  expect(() => callerKey('codex:a','codex:b')).toThrow();
  expect(() => callerKey(undefined,'anonymous')).toThrow();
  expect(callerKey('codex:a',undefined)).toBe('codex:a');
  expect(taskKey('codex:a')).not.toBe(taskKey('codex:b'));
  expect(operationArgs({operation:'fill',tabId:'12',ref:'e0',text:'test',javascript:'bad',owner:'another'})).toEqual({operation:'fill',tabId:'12',ref:'e0',text:'test'});
  expect(() => operationArgs({operation:'press',tabId:'12',key:'Ctrl+L'})).toThrow();
  expect(() => operationArgs({operation:'click',tabId:'12',ref:'bad]selector'})).toThrow();
});
