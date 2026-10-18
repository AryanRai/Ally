export type FollowupIntent = 'auto' | 'steer' | 'queue';
export type FollowupMode = 'steered' | 'queued';

/** Keep the same result on a network retry, including uncertain failures. */
export class FollowupReceipts {
  private requests = new Map<string, { text: string; intent: FollowupIntent; media: string; result: Promise<FollowupMode> }>();
  submit(id: string, text: string, deliver: () => Promise<FollowupMode>, intent: FollowupIntent = 'auto', media = ''): Promise<FollowupMode> {
    if (!/^[\w-]{1,80}$/.test(id) || !text.trim() || text.length > 12000) return Promise.reject(new Error('Invalid follow-up message'));
    const previous = this.requests.get(id);
    if (previous) return previous.text === text && previous.intent === intent && previous.media === media ? previous.result : Promise.reject(new Error('Request ID already belongs to a different message'));
    if (this.requests.size >= 64) return Promise.reject(new Error('Too many follow-ups in this response'));
    const result = Promise.resolve().then(deliver);
    this.requests.set(id, { text, intent, media, result });
    return result;
  }
}
