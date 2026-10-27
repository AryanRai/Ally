import { DEVICE_PROTOCOL_PREFIX } from '../watch/protocol.js';
import { studyUserText } from '../../src/lib/studyPresentation.js';
const WATCH_PREFIX = 'You are Ally on a round smartwatch.';
export const isDeviceProtocolTitle = (text: string) => text.startsWith(WATCH_PREFIX) || text.startsWith(DEVICE_PROTOCOL_PREFIX) || text.startsWith('Ally Study: continue this selected chat as a full agent.');
export function chatUserText(text: string): string {
  text = studyUserText(text);
  const marker = '\n\nUser message:\n';
  return isDeviceProtocolTitle(text) && text.includes(marker) ? text.slice(text.indexOf(marker) + marker.length) : text;
}
export function chatTitle(text: string): string {
  const user = chatUserText(text);
  return (isDeviceProtocolTitle(user) ? 'Ally chat' : user.replace(/\s+/g, ' ').trim()).slice(0, 80) || 'Ally chat';
}
