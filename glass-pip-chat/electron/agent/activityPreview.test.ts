// @vitest-environment node
import {expect,it} from 'vitest';
import {activityPreview} from './activityPreview';
it('keeps public progress and excludes reasoning, tools and old turns',()=>{
 const records=[{type:'response_item',payload:{type:'message',role:'assistant',channel:'final',content:[{type:'output_text',text:'old answer'}]}},{type:'event_msg',payload:{type:'task_started'}},{type:'response_item',payload:{type:'message',role:'assistant',channel:'analysis',content:[{type:'output_text',text:'private thought'}]}},{type:'response_item',payload:{type:'message',role:'assistant',channel:'commentary',content:[{type:'output_text',text:'Checking the files.'}]}}];
 expect(activityPreview(records,'codex')).toBe('Checking the files.');expect(activityPreview(records.slice(0,3),'codex')).toBe('');
 expect(activityPreview([{type:'assistant',message:{content:[{type:'thinking',thinking:'private'},{type:'text',text:'Public update'}]}}],'claude')).toBe('Public update');
});
