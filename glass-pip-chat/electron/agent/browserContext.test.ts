import { expect, it } from 'vitest';
import { ALLY_BROWSER_INSTRUCTIONS } from './browserContext';
it('advertises extension control and the independent Ally browser without pretending Codex iab is connected',()=>{
  expect(ALLY_BROWSER_INSTRUCTIONS).toContain('browser_connections and browser_control');
  expect(ALLY_BROWSER_INSTRUCTIONS).toContain('backend chrome');
  expect(ALLY_BROWSER_INSTRUCTIONS).toContain('backend ally');
  expect(ALLY_BROWSER_INSTRUCTIONS).toContain('separate cookies');
  expect(ALLY_BROWSER_INSTRUCTIONS).toContain('Never switch backend to bypass');
});
it('recovers focus timeouts without repeating the failed claim, taking another chat tab or duplicating transmissions', () => {
  expect(ALLY_BROWSER_INSTRUCTIONS).toContain('do not repeat the same getTab call');
  expect(ALLY_BROWSER_INSTRUCTIONS).toContain('retaining the selected browser unless it explicitly disconnected');
  expect(ALLY_BROWSER_INSTRUCTIONS).toContain('reset it once');
  expect(ALLY_BROWSER_INSTRUCTIONS).toContain('When the browser contract permits');
  expect(ALLY_BROWSER_INSTRUCTIONS).toContain('A tab owned by another chat is an ownership restriction');
  expect(ALLY_BROWSER_INSTRUCTIONS).toContain('never duplicate a send or picture upload');
});
