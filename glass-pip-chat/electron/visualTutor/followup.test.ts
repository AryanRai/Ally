// @vitest-environment node
import {expect,it} from 'vitest';
import {playbackFollowup} from './followup';
it('routes explicit transport commands and leaves teaching/ambiguous requests to the agent',()=>{
 for(const [words,action]of [['Pause there.','pause'],['Please replay','replay'],['repeat that part','replay'],['slower','slower'],['Resume the animation','play']])expect(playbackFollowup(words)).toBe(action);
 for(const words of ['Explain this arrow','pause and derive the result','continue','repeat that explanation','delete the car'])expect(playbackFollowup(words)).toBeUndefined();
});
