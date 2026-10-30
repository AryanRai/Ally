import { describe, expect, it } from 'vitest';
import { notchHomePreview, type HomeHistory } from './notchHomePreview';
import { buildNativeStudyPrompt } from '../../electron/watch/nativeStudy';

const history: HomeHistory = { chat: { id: 'one', title: 'MECH5720' }, running: false, messages: [
  { role: 'user', text: 'Old question', timestamp: 1 }, { role: 'assistant', text: 'Old answer', timestamp: 2 },
  { role: 'user', text: buildNativeStudyPrompt('Note this in formula sheet.', '{}'), timestamp: 3 },
  { role: 'assistant', text: '```js\nstep(1); say("Added on page 34.");\n```', timestamp: 4 },
] };
describe('selected chat Home preview', () => {
  it('carries live command activity only from the selected chat', () => {
    const turn = { id: 'turn', chatId: 'one', status: 'thinking', steps: [{ id: 'cmd', name: 'shell', status: 'running' }], timeline: [{ id: 'update', type: 'update' as const, text: 'Checking' }, { id: 'tool', type: 'tool' as const, stepId: 'cmd' }], startedAt: 1000 };
    expect(notchHomePreview(history, turn)).toMatchObject({ activityContent: { steps: turn.steps, timeline: turn.timeline }, startedAt: 1000 });
    expect(notchHomePreview(history, { ...turn, chatId: 'other' })).not.toHaveProperty('activityContent');
  });
  it('shows the most recent question and readable Study answer', () => {
    expect(notchHomePreview(history, null)).toEqual({ title: 'MECH5720', question: 'Note this in formula sheet.', answer: 'Added on page 34.', working: false });
  });
  it('does not present an old answer as the response to a new question', () => {
    expect(notchHomePreview({ ...history, messages: [...history.messages, { role: 'user', text: 'New question', timestamp: 5 }] }, null).answer).toBe('');
  });
  it('uses the selected active stream and ignores a different chat’s turn', () => {
    const turn = { id: 'turn', chatId: 'one', status: 'thinking', transcript: 'Explain the graph', liveText: '```js\nstep(1); say("First step"); say("Sec' };
    expect(notchHomePreview(history, turn)).toMatchObject({ question: 'Explain the graph', answer: 'First step', working: true });
    expect(notchHomePreview(history, { ...turn, chatId: 'two' }).answer).toBe('Added on page 34.');
  });
  it('clears to an empty preview when no chat is selected and hides reasoning blocks', () => {
    expect(notchHomePreview(null, null)).toEqual({ title: 'Ally', question: '', answer: '', working: false });
    expect(notchHomePreview({ ...history, messages: [{ role: 'assistant', text: '<think>Internal thought</think>\nDone.', timestamp: 1 }] }, null).answer).toBe('Done.');
  });
  it('shows public commentary when no final text has arrived and retains a finished live reply until history catches up',()=>{
    const active={id:'turn',chatId:'one',status:'thinking',transcript:'New question',progress:[{id:'a',text:'Checking the files.'}],activity:'Using browser'};
    expect(notchHomePreview(history,active)).toMatchObject({question:'New question',answer:'',progress:['Checking the files.'],activity:'Using browser',working:true});
    expect(notchHomePreview({...history,running:true},{...active,status:'done',reply:{text:'Finished answer.'}})).toMatchObject({answer:'Finished answer.',working:false});
    expect(notchHomePreview({...history,progress:[{id:'b',text:'Recent external update.'}],messages:[{role:'user',text:'Next',timestamp:5},{role:'assistant',text:'',commentary:['External progress.'],timestamp:6}]},null)).toMatchObject({progress:['Recent external update.']});
  });
});
