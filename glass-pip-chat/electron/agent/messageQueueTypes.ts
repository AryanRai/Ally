/** Data-only contracts shared with the sandboxed preload and renderers. */
export interface QueueItem {
  id: string; text: string; createdAt: number; state: 'queued' | 'sending' | 'failed'; error?: string;
  attachments: Array<{ name: string }>;
}
export interface QueueSnapshot { chatId: string; revision: number; items: QueueItem[] }
export type QueueChange = { action: 'edit' | 'cancel' | 'reorder' | 'send'; id?: string; text?: string; order?: string[]; revision: number };
