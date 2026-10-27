import { useLayoutEffect, type Dispatch, type SetStateAction } from 'react';
import { CHAT_COLLAPSE_MS } from '../components/chat/ExpandedChatSurface';

/** Grow immediately; shrink after the existing content exit fade has painted. */
export function useWindowSizing(width: number, height: number, collapsed: boolean, setIsResizing: Dispatch<SetStateAction<boolean>>) {
  useLayoutEffect(() => {
    const pip = window.pip;
    if (!pip) return;
    setIsResizing(true);
    const resize = () => pip.resizeWindow(width, height, collapsed ? 'collapsed' : 'expanded');
    const delay = collapsed ? CHAT_COLLAPSE_MS : 0;
    const scheduled = delay ? setTimeout(resize, delay) : undefined;
    if (!delay) resize();
    // The normal completion acknowledgement clears this sooner. Retain a
    // fallback for hosts without it, and cancel it on reversal/unmount.
    const fallback = setTimeout(() => setIsResizing(false), 400 + delay);
    return () => {
      clearTimeout(scheduled);
      clearTimeout(fallback);
    };
  }, [width, height, collapsed, setIsResizing]);
}
