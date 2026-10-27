import { expect, it } from 'vitest';
import { historyProgress, updateProgress } from './progress';
it('seals public commentary on a real boundary and ignores thought/tool contents', () => {
  let rows=updateProgress([],{kind:'text',phase:'commentary',itemId:'a',text:'Checking '});
  rows=updateProgress(rows,{kind:'text',phase:'commentary',itemId:'a',text:'the result.'});
  expect(rows).toEqual([{id:'commentary:a',text:'Checking the result.',complete:false,kind:'commentary'}]);
  expect(updateProgress(rows,{kind:'thinking',text:'private reasoning'})).toEqual(rows);
  rows=updateProgress(rows,{kind:'tool_start',id:'t',name:'exec',input:{secret:'never narrate'}});
  expect(rows[0].complete).toBe(true);expect(JSON.stringify(rows)).not.toContain('secret');
  expect(updateProgress(rows,{kind:'continuation'})).toEqual([]);
});
it('projects complete literal Study speech while leaving code and unfinished calls out', () => {
  const output='```javascript\nstep(1); say("First step."); step(2); say("Still';
  const rows=updateProgress([],{kind:'text',text:output},output,true);
  expect(rows).toEqual([{id:'study:0',text:'First step.',complete:true,kind:'study'}]);
  const mixed='Checking the calculation.\n\n'+output;
  expect(updateProgress([],{kind:'text',text:mixed},mixed,true)).toEqual(rows);
  expect(updateProgress([],{kind:'text',text:'code'},'```javascript\nconst x = say("not a Study reply");\n```',true)).toEqual([]);
});
it('keeps native history updates separate from the final and marks only completed text for speech', () => {
  const messages=[{id:'u',role:'user',text:'Question'},{id:'a',role:'assistant',text:'',commentary:['Checked files.','Now testing']}];
  expect(historyProgress(messages,true)).toMatchObject({progressTurnId:'history:u',progress:[{complete:true},{complete:false}]});
  expect(historyProgress(messages,false).progress.every(p=>p.complete)).toBe(true);
});
