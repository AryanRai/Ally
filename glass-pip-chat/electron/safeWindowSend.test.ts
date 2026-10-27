import { expect, it, vi } from 'vitest';
import { safeWindowSend } from './safeWindowSend';

it('publishes normal state and tolerates either destruction order during quit', () => {
  const send=vi.fn(), contents={isDestroyed:()=>false,send}, alive={isDestroyed:()=>false,webContents:contents};
  expect(safeWindowSend(alive as any,'state',{active:false})).toBe(true);
  expect(send).toHaveBeenCalledWith('state',{active:false});
  expect(safeWindowSend({isDestroyed:()=>true,get webContents(){throw Error('Destroyed window accessed');}} as any,'state',null)).toBe(false);
  expect(safeWindowSend({isDestroyed:()=>false,webContents:{isDestroyed:()=>true,send}} as any,'state',null)).toBe(false);
  expect(safeWindowSend(null,'state',null)).toBe(false);expect(send).toHaveBeenCalledOnce();
});
