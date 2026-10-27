import { expect, it } from 'vitest';
import { replyCard } from './replyCard';
import { DeviceHub } from './hub';

it('delivers a labeled reply to both devices with its exact provider/session, never inferring approval', () => {
  const notice = { id: 'complete', title: 'Watch reply ready', text: 'Need permission. Please approve.', session: { id: 'session-one', provider: 'claude' as const, title: 'Original chat', cwd: '/project' } };
  const phone: unknown[] = [], watch: unknown[] = [];
  const hub = new DeviceHub(() => {});
  hub.connect('phone-one','phone', item => phone.push(item)); hub.connect('watch-one','watch', item => watch.push(item));
  hub.publish('phone',replyCard(notice,'phone')); hub.publish('watch',replyCard(notice,'watch'));
  expect(phone).toMatchObject([{ type: 'card', card: { kind: 'response', chatId: 'claude:session-one', title: 'Original chat', body: notice.text } }]);
  expect(watch).toMatchObject([{ type: 'card', card: { kind: 'response', chatId: 'claude:session-one' } }]);
  expect(replyCard(notice,'phone').id).not.toBe(replyCard(notice,'watch').id);
  hub.close();
});
it('does not manufacture a native route for a local renderer chat ID', () => {
  expect(replyCard({id:'local',chatId:'renderer-id',title:'Done',text:'Done'},'phone').chatId).toBeUndefined();
});
it('labels a failed send as attention and hides internal Study instructions in its title', () => {
  expect(replyCard({id:'failed',kind:'attention',title:'Ally Study: continue this selected chat as a full agent. Use available tools',text:'Your message was not sent.'},'phone'))
    .toMatchObject({kind:'attention',title:'Ally chat',body:'Your message was not sent.'});
});
