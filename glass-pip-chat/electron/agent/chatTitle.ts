import { DEVICE_PROTOCOL_PREFIX } from '../watch/protocol.js';
const WATCH_PREFIX = 'You are Ally on a round smartwatch.';
export const isDeviceProtocolTitle = (text: string) => text.startsWith(WATCH_PREFIX) || text.startsWith(DEVICE_PROTOCOL_PREFIX);
export function chatUserText(text: string): string {
  const marker = '\n\nUser message:\n';
  return isDeviceProtocolTitle(text) && text.includes(marker) ? text.slice(text.indexOf(marker) + marker.length) : text;
}
export function chatTitle(text: string): string {
  const user = chatUserText(text);
  return (isDeviceProtocolTitle(user) ? 'Ally chat' : user.replace(/\s+/g, ' ').trim()).slice(0, 80) || 'Ally chat';
}
