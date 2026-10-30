import { expect, it, vi } from 'vitest';
import { createNotchApi } from '../../../ally-study/notch-ui/api';

it('sends a collapsed-notch answer as authenticated POST with its exact request id, action and fields', async () => {
  const request = vi.fn(async (_url: RequestInfo | URL, _options?: RequestInit) => new Response(JSON.stringify({ accepted: true })));
  const api = createNotchApi('synthetic-capability', request);
  const answer = { action: 'submit', values: { route: 'phone' } };
  await api('interactions/exact-request/answer', answer);
  expect(request).toHaveBeenCalledWith('/notch-api/v1/interactions/exact-request/answer', expect.objectContaining({
    method: 'POST', body: JSON.stringify(answer),
    headers: { Authorization: 'Bearer synthetic-capability', 'Content-Type': 'application/json' },
  }));
  await api('interactions?chatId=codex%3Aoriginal');
  expect(request.mock.calls[1][1]).toMatchObject({ method: 'GET' });
  expect(request.mock.calls[1][1]).not.toHaveProperty('body');
});

it('surfaces a refused or expired answer without automatically replaying it', async () => {
  const request = vi.fn(async () => new Response(JSON.stringify({ error: 'Request expired' }), { status: 400 }));
  await expect(createNotchApi('synthetic-capability', request)('interactions/old/answer', { action: 'accept' })).rejects.toThrow('Request expired');
  expect(request).toHaveBeenCalledOnce();
});
