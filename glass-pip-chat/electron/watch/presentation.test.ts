import { expect, it } from 'vitest';
import { deviceHistoryReply, deviceReply, deviceUserText, replyPreview } from './presentation';
it('projects Study speech without evaluating drawing code', () => {
 const raw='```javascript\nstep(1); say("The point stays visible."); rect(1,2,3,4);\nstep(2); say(`Only the blur disappears.`);\n```';
 expect(deviceReply(raw).text).toBe('The point stays visible.\n\nOnly the blur disappears.');
 expect(replyPreview(raw)).toBe('The point stays visible. Only the blur disappears.');
 expect(deviceReply('```javascript\nconsole.log("ordinary code");\n```').text).toContain('console.log');
});
it('keeps commentary separate and selects only the explicit final',()=>{
 const reply=deviceHistoryReply({role:'assistant',timestamp:1,content:'progress\nfinal',segments:[{type:'thinking',content:'private'},{type:'text',phase:'commentary',content:'Checking devices'},{type:'text',phase:'final_answer',content:'**Installed** both apps.'}]});
 expect(reply).toMatchObject({text:'**Installed** both apps.',commentary:['Checking devices']});
 expect(replyPreview(reply.text)).toBe('Installed both apps.');
 expect(deviceHistoryReply({role:'assistant',timestamp:1,content:'progress',segments:[{type:'text',phase:'commentary',content:'progress'}]}).text).toBe('');
});
it('strips only the recognized Study instruction envelope',()=>{
 expect(deviceUserText('Ally Study: continue this selected chat as a full agent.\nThe app draws and speaks each step live.\nResume normal formatting after this turn.\nContext\nUser message:\nExplain orthogonality')).toBe('Explain orthogonality');
 expect(deviceUserText('ordinary User message:\nKeep this')).toBe('ordinary User message:\nKeep this');
});
it('bounds previews and leaves ordinary code in chat',()=>{
 expect(replyPreview('hello '.repeat(100)).length).toBeLessThanOrEqual(280);
 expect(replyPreview('Done\n```js\ncode\n```')).toBe('Done [Code available in chat]');
});
