/** Native move/resize fires throughout a drag. Persist only after it settles,
 * and flush explicitly before hide/quit so the final bounds are retained. */
export function boundsPersistence(save: () => void, delay = 150) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const flush = () => { if (!timer) return false; clearTimeout(timer); timer = undefined; save(); return true; };
  return {
    schedule() { if (timer) clearTimeout(timer); timer = setTimeout(() => { timer = undefined; save(); }, delay); },
    flush,
  };
}
