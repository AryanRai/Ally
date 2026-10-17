import { describe, expect, it, vi } from 'vitest';
import { FollowupReceipts } from './followups';

describe('follow-up delivery receipts', () => {
  it('coalesces concurrent and late retries without sending twice', async () => {
    const receipts = new FollowupReceipts();
    const deliver = vi.fn(async () => 'steered' as const);
    expect(await Promise.all([receipts.submit('id', 'same', deliver), receipts.submit('id', 'same', deliver)])).toEqual(['steered', 'steered']);
    expect(await receipts.submit('id', 'same', deliver)).toBe('steered');
    expect(deliver).toHaveBeenCalledOnce();
    await expect(receipts.submit('id', 'changed', deliver)).rejects.toThrow('different message');
  });
  it('never automatically replays an uncertain delivery', async () => {
    const receipts = new FollowupReceipts();
    const deliver = vi.fn(async () => { throw new Error('connection lost after submission'); });
    await expect(receipts.submit('id', 'input', deliver)).rejects.toThrow('connection lost');
    await expect(receipts.submit('id', 'input', deliver)).rejects.toThrow('connection lost');
    expect(deliver).toHaveBeenCalledOnce();
  });
  it('rejects empty and oversized input before dispatch', async () => {
    const receipts = new FollowupReceipts(); const deliver = vi.fn(async () => 'queued' as const);
    await expect(receipts.submit('id', ' ', deliver)).rejects.toThrow('Invalid');
    await expect(receipts.submit('id', 'x'.repeat(12001), deliver)).rejects.toThrow('Invalid');
    expect(deliver).not.toHaveBeenCalled();
  });
});
