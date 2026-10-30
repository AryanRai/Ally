import { render, screen, cleanup } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import AttachmentView from '../../../ally-study/notch-ui/AttachmentView';
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
it('keeps a tall screenshot inside an initially collapsed flow container rather than a fixed-height button',()=>{
  const fetch=vi.fn();vi.stubGlobal('fetch',fetch);
  render(<AttachmentView asset={{id:'screenshot',name:'Tall.png',mimeType:'image/png',size:120,url:'/asset'}}/>);
  const summary=screen.getByText('Image · Tall.png');
  expect(summary.closest('details')?.open).toBe(false);
  expect(summary.closest('button')).toBeNull();
  expect(screen.queryByRole('img')).toBeNull();
  expect(fetch).not.toHaveBeenCalled();
});
