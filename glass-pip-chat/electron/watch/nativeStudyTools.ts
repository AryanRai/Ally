import { registerDeviceTool } from '../chatsMcp/index.js';
import { text } from '../chatsMcp/protocol.js';
import { NATIVE_STUDY_REFERENCES, nativeStudyReference } from './nativeStudyReference.js';

/** Static reference only; no model request, capture, board or drawing execution. */
export function registerNativeStudyTools(): () => void {
  return registerDeviceTool({
    name:'native_study_reference',
    description:'Read the native Ally Study drawing API for editing existing native objects/groups across turns, graphs, interactive waves/Fourier cards, timelines, 3D, animated figures or diagram cards. Use during a native Study reply, preserving progressive drawing with spoken steps. Does not display or execute anything.',
    inputSchema:{type:'object',properties:{topic:{type:'string',enum:Object.keys(NATIVE_STUDY_REFERENCES)}},required:['topic'],additionalProperties:false},
    handler:async args=>text(nativeStudyReference(args.topic)),
  });
}
