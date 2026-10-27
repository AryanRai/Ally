// @vitest-environment node
import { expect, it, vi } from 'vitest';
const tools=vi.hoisted(()=>({register:vi.fn(),stop:vi.fn()}));
vi.mock('../chatsMcp/index.js',()=>({registerDeviceTool:tools.register}));
import { nativeStudyReference, NATIVE_STUDY_REFERENCES } from './nativeStudyReference';
import { registerNativeStudyTools } from './nativeStudyTools';

it('provides only the selected API reference, including progressive speech examples',()=>{
  for(const [topic,reference] of Object.entries(NATIVE_STUDY_REFERENCES)){
    const result=nativeStudyReference(topic);
    expect(result).toContain(reference.example);
    expect(reference.example).toContain('step(1)');
    expect(reference.example).toContain('say(');
    expect(result.length).toBeLessThan(2400);
  }
  expect(nativeStudyReference('graph')).not.toContain('lessonMechanism');
  expect(()=>nativeStudyReference('__proto__')).toThrow('Choose');
  expect(()=>nativeStudyReference(null)).toThrow('Choose');
});

it('registers a reference-only tool and releases it with the bridge',async()=>{
  tools.register.mockReturnValue(tools.stop);
  const stop=registerNativeStudyTools();
  const spec=tools.register.mock.calls[0][0];
  expect(spec.name).toBe('native_study_reference');
  expect(spec.inputSchema.properties.topic.enum).toEqual(Object.keys(NATIVE_STUDY_REFERENCES));
  const result=await spec.handler({topic:'figure'});
  expect(result.content[0].text).toContain('f.tick(');
  expect(result.content[0].text).toContain('does not itself display');
  stop();expect(tools.stop).toHaveBeenCalledOnce();
});
