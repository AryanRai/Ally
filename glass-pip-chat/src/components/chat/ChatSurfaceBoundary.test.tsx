import {expect,it,vi} from 'vitest';
import {render,screen} from '@testing-library/react';
import {ChatSurfaceBoundary} from './ChatSurfaceBoundary';
it('shows recovery instead of an empty chat when transcript rendering fails',()=>{
  const log=vi.spyOn(console,'error').mockImplementation(()=>{});
  const Broken=():never=>{throw Error('fixture render failure');};
  try {render(<ChatSurfaceBoundary><Broken/></ChatSurfaceBoundary>);expect(screen.getByRole('alert')).toHaveTextContent('saved draft are kept');expect(screen.getByRole('button',{name:'Reload chat'})).toBeVisible();}finally{log.mockRestore();}
});
