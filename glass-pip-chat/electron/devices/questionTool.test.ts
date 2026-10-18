import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('../chatsMcp/index', () => ({ registerDeviceTool: vi.fn(() => vi.fn()) }));
import { registerDeviceTool } from '../chatsMcp/index';
import { questionFields, registerQuestionTool } from './questionTool';
import { interactions } from './interactions';
afterEach(() => { interactions.closeAll(); vi.clearAllMocks(); });
describe('actual MCP question requests', () => {
  it('validates questions, unique options and credential handoffs', () => {
    expect(questionFields([{id:'pick',question:'Which?',options:['A','B']}])[0]).toMatchObject({freeText:true,secret:false,required:true});
    for (const questions of [[],[{id:'same',question:'A'},{id:'same',question:'B'}],[{id:'secret',question:'Code?',secret:true}],[{id:'pick',question:'Choose',options:['A','A']}]]) expect(() => questionFields(questions)).toThrow();
  });
  it('returns only the real submitted answer, bound to the exact caller conversation', async () => {
    registerQuestionTool(); const tool=vi.mocked(registerDeviceTool).mock.calls[0][0]; const chatId='codex:session-1234';
    const result=tool.handler({questions:[{id:'pick',question:'Which?',options:['A','B']}]},{caller:chatId});
    const request=interactions.list(chatId)[0]; expect(request.fields[0].options.map(o=>o.value)).toEqual(['A','B']);
    interactions.answer(request.id,{action:'submit',values:{pick:'B'}},'watch'); expect((await result).content[0].text).toBe('{"action":"submit","values":{"pick":"B"}}');
  });
  it('withdraws questions when the requesting MCP connection ends', async () => {
    registerQuestionTool(); const tool=vi.mocked(registerDeviceTool).mock.calls[0][0]; const controller=new AbortController();
    const result=tool.handler({chatId:'codex:session-1234',questions:[{id:'pick',question:'Which?'}]},{signal:controller.signal});
    expect(interactions.list()).toHaveLength(1); controller.abort(); expect((await result).content[0].text).toBe('{"action":"cancel"}'); expect(interactions.list()).toHaveLength(0);
  });
});
