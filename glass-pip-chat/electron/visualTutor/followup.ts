/** Only unambiguous transport commands. Explanation requests always reach the agent. */
export function playbackFollowup(words:string):'pause'|'play'|'replay'|'slower'|undefined{
 const text=words.trim().toLowerCase().replace(/[.!?]+$/,'').replace(/\s+/g,' ');
 if(/^(?:please )?pause(?: (?:there|here|it|the animation|this animation))?$/.test(text))return 'pause';
 if(/^(?:please )?(?:play|resume)(?: (?:it|the animation|this animation))?$/.test(text)||text==='continue the animation')return 'play';
 if(/^(?:please )?(?:replay|repeat (?:that part|this animation|the animation))$/.test(text))return 'replay';
 if(/^(?:please )?(?:slower|slow (?:it|the animation) down)$/.test(text))return 'slower';
}
