/** WebView clipboard permissions vary. Keep the native keyboard-copy path as a
 * fallback, and restore the reader's selection/focus after using it. */
export async function copyPreviewText(text: string): Promise<void> {
  if (!text) return;
  try { if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(text); return; } } catch { /* Try the native copy command. */ }
  const selection = window.getSelection(), ranges: Array<{start:Node;startOffset:number;end:Node;endOffset:number}> = [];
  for (let i=0;selection && i<selection.rangeCount;i++) {const range=selection.getRangeAt(i);ranges.push({start:range.startContainer,startOffset:range.startOffset,end:range.endContainer,endOffset:range.endOffset});}
  const focus = document.activeElement as HTMLElement | null;
  const field=document.createElement('textarea');field.value=text;field.readOnly=true;
  field.style.cssText='position:fixed;left:-10000px;top:0;opacity:0';document.body.appendChild(field);
  try {field.focus();field.select();if(!document.execCommand('copy'))throw Error('Select the text and press Ctrl+C.');}
  finally {field.remove();focus?.focus({preventScroll:true});selection?.removeAllRanges();ranges.forEach(saved=>{if(!saved.start.isConnected||!saved.end.isConnected)return;const range=document.createRange();range.setStart(saved.start,saved.startOffset);range.setEnd(saved.end,saved.endOffset);selection?.addRange(range);});}
}
