import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { StudyInputs } from './studyInputs';
import type { TutorBoard } from './types';

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) fs.rmSync(root,{recursive:true,force:true}); });
it('binds the exact crop, original session and permission before native capture or navigation', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(),'ally-study-input-')); roots.push(root);
  const image = path.join(root,'selected.png'); fs.writeFileSync(image,Buffer.from([1,2,3]));
  const selected = { chatId:'codex:original',provider:'codex' as const,sessionId:'original',title:'Study',permission:'readonly' as const };
  const board: TutorBoard = { id:'board',chatId:'local-a',sessionKey:'codex:original',presentation:'study',displayId:2,bounds:{x:-1920,y:0,width:1920,height:1080},focus:{x:100,y:200,width:300,height:400},capturedAt:1,steps:[],sketches:[],selected:0,following:true,sketching:false,frozen:false,revision:0 };
  board.screenBounds={x:-2400,y:0,width:2400,height:1350}; board.screenPixels={width:2400,height:1350};
  const input = new StudyInputs(root,()=>5000), id = input.issue(board,selected,'Explain the selected equation',image);
  const record = JSON.parse(fs.readFileSync(path.join(root,'profile/study-inputs',id+'.json'),'utf8'));
  expect(record).toMatchObject({selected,words:'Explain the selected equation',imagePath:image,context:{diagramBoardId:'board',selection:{focus:board.focus}}});
  selected.sessionId = 'newer'; expect(record.selected.sessionId).toBe('original');
  const wire = fs.readFileSync(path.join(root,'profile/study-inputs',id+'.input'),'utf8').trimEnd().split('\n').map(value=>Buffer.from(value,'base64').toString());
  expect(wire).toEqual(['Explain the selected equation',image,'-2400,0,2400,1350']);
  expect(record.context.screenshot).toBeUndefined();
  expect(record.context.selection.sourcePixels).toEqual({width:2400,height:1350});
  expect(()=>input.issue(board,{...selected,chatId:'codex:other'},'Wrong chat',image)).toThrow('selected chat changed');
  input.discard(id); expect(fs.existsSync(path.join(root,'profile/study-inputs',id+'.json'))).toBe(false);
});
