export const DRAFTS_KEY = 'ally-chat-drafts';
export type Drafts = Record<string, string>;

export function readLocalDrafts(): Drafts {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(DRAFTS_KEY) || '{}');
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    return Object.fromEntries(Object.entries(value).filter(([, text]) => typeof text === 'string'));
  } catch { return {}; }
}

// A separate quota from localStorage's transcript cache. Keep records per chat so
// an early keystroke cannot replace drafts that are still being hydrated.
function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('ally-composer', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('drafts', { keyPath: 'id' });
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

export async function readBackupDrafts(): Promise<Drafts> {
  const db = await database();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction('drafts', 'readonly');
      const request = tx.objectStore('drafts').getAll();
      tx.oncomplete = () => resolve(Object.fromEntries(request.result.map(row => [row.id, row.text])));
      tx.onabort = () => reject(tx.error);
    });
  } finally { db.close(); }
}

export async function saveBackupDraft(id: string, text: string): Promise<void> {
  const db = await database();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('drafts', 'readwrite');
      // Empty strings are deliberate clears; retain them over older local drafts.
      tx.objectStore('drafts').put({ id, text });
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(tx.error);
    });
  } finally { db.close(); }
}
