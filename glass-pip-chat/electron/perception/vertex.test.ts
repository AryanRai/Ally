import { afterEach, describe, expect, it, vi } from 'vitest';
import { askVertex, scoresFromVertex, vertexUrl, type VertexTransport } from './vertex';

const adc = vi.hoisted(() => ({ request: vi.fn(), getClient: vi.fn(), construct: vi.fn() }));
vi.mock('google-auth-library', () => ({ GoogleAuth: class {
  constructor(options: unknown) { adc.construct(options); }
  getClient() { return adc.getClient(); }
} }));

const config = { project: 'orbit-494815', location: 'global', model: 'gemini-2.5-flash-lite' };
const scores = { relevant: 0.9, question: 0.95, newTopic: 0.5, canHelp: 0.9, proactiveUseful: 0.8, interrupt: 0.8, urgency: 0.8, category: 'technical_question', categoryConfidence: 0.9 };
const answer = (text: string, finishReason = 'STOP') => ({ data: { candidates: [{ finishReason, content: { parts: [{ text }] } }] } });
afterEach(() => vi.useRealTimers());

describe('Vertex relevance classifier', () => {
  it('resolves credentials in the main process with an explicit project and reuses the auth client', async () => {
    adc.getClient.mockResolvedValue({ request: adc.request });
    adc.request.mockResolvedValue(answer(JSON.stringify(scores)));
    await askVertex('synthetic', config);
    await askVertex('synthetic again', config);
    expect(adc.construct).toHaveBeenCalledTimes(1);
    expect(adc.construct).toHaveBeenCalledWith({ projectId: 'orbit-494815', scopes: ['https://www.googleapis.com/auth/cloud-platform'] });
    expect(adc.request).toHaveBeenCalledTimes(2);
  });
  it('uses ADC project billing, structured output and a bounded tool-free request', async () => {
    const request = vi.fn<VertexTransport>().mockResolvedValue(answer(JSON.stringify(scores)));
    expect(await askVertex('untrusted transcript', config, request)).toEqual(scores);
    const call = request.mock.calls[0][0];
    expect(call.url).toBe('https://aiplatform.googleapis.com/v1/projects/orbit-494815/locations/global/publishers/google/models/gemini-2.5-flash-lite:generateContent');
    expect(call.headers).toEqual({ 'x-goog-user-project': 'orbit-494815' });
    expect(call.retry).toBe(false);
    expect(call.data).not.toHaveProperty('tools');
    expect(call.data).toMatchObject({ generationConfig: { responseMimeType: 'application/json', maxOutputTokens: 512, thinkingConfig: { thinkingBudget: 0 } } });
    expect(call.data.systemInstruction).toMatchObject({ parts: [{ text: expect.stringContaining('untrusted data') }] });
  });

  it('bounds input and supports regional endpoints without arbitrary hosts or paths', async () => {
    expect(vertexUrl({ ...config, location: 'australia-southeast1' })).toContain('https://australia-southeast1-aiplatform.googleapis.com/');
    for (const bad of [{ project: '../other' }, { location: 'example.com' }, { model: 'gemini-x:otherMethod' }]) expect(() => vertexUrl({ ...config, ...bad })).toThrow();
    const request = vi.fn<VertexTransport>().mockResolvedValue(answer(JSON.stringify(scores)));
    await askVertex('a'.repeat(20_000), config, request);
    expect(request.mock.calls[0][0].data.contents).toEqual([{ role: 'user', parts: [{ text: 'a'.repeat(10_000) }] }]);
  });

  it('rejects missing, nonnumeric, nonfinite or out-of-range scores and unknown categories', () => {
    for (const bad of [{ relevant: undefined }, { question: '0.9' }, { urgency: 2 }, { interrupt: NaN }, { category: 'execute_action' }]) expect(() => scoresFromVertex({ ...scores, ...bad })).toThrow();
    expect(scoresFromVertex({ ...scores, tools: ['dangerous'] })).toEqual(scores);
  });

  it('rejects malformed, truncated, blocked and empty model responses', async () => {
    for (const result of [answer('not json'), answer(JSON.stringify(scores), 'MAX_TOKENS'), answer('', 'SAFETY'), { data: {} }]) {
      await expect(askVertex('test', config, async () => result)).rejects.toThrow(/Gemini relevance/);
    }
  });

  it('does not expose Google request bodies or credentials in errors', async () => {
    const request = vi.fn<VertexTransport>().mockRejectedValue({ response: { status: 403 }, message: 'Bearer SECRET; private transcript', config: { headers: { Authorization: 'SECRET' } } });
    await expect(askVertex('private transcript', config, request)).rejects.toThrow('Vertex AI returned 403');
    request.mockRejectedValueOnce(new Error('Bearer SECRET; private transcript'));
    await expect(askVertex('private transcript', config, request)).rejects.toThrow('Vertex AI unavailable; check Google Application Default Credentials and project access');
  });

  it('bounds authentication and request latency and aborts a slow transport', async () => {
    vi.useFakeTimers();
    const request = vi.fn<VertexTransport>(() => new Promise(() => {}));
    const result = askVertex('test', { ...config, timeoutMs: 50 }, request);
    const check = expect(result).rejects.toThrow('Gemini relevance timed out');
    await vi.advanceTimersByTimeAsync(50);
    await check;
    expect(request.mock.calls[0][0].signal.aborted).toBe(true);
  });
});
