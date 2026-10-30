import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { DeviceActivityReply, activityRows } from './DeviceActivityReply';
import type { InteractionHistory } from '../../../electron/devices/interactions';
vi.mock('./ChatMessage', () => ({ AgentReply: ({ text }: { text: string }) => <p>{text}</p> }));
afterEach(cleanup);
const content = { steps: [{ id: 'cmd', name: 'shell', status: 'done', detail: 'echo verified' }], timeline: [{ id: 'a', type: 'update' as const, text: 'Checking' }, { id: 'b', type: 'tool' as const, stepId: 'cmd' }, { id: 'c', type: 'update' as const, text: 'Verified' }], durationMs: 65000 };
it('places a real question between its originating command and the next update', () => {
  const request = { id:'q',kind:'question',title:'Choose one',state:'answered',createdAt:25,expiresAt:100,fields:[],actions:[],decision:'submit' } as unknown as InteractionHistory;
  const rows=activityRows({...content,steps:[{...content.steps[0],startedAt:20,endedAt:30}]},[request]);
  expect(rows.map(row=>row.type)).toEqual(['update','tool','request','update']);
});
it('keeps command images inside their originating command instead of duplicating them after the answer', () => {
  const asset={id:'image',name:'Screenshot',mimeType:'image/png',size:4,url:'/asset'};
  render(<DeviceActivityReply content={{...content,steps:[{...content.steps[0],attachments:[asset]}]}} text="Answer" renderAsset={image=><span>{image.name}</span>}/>);
  const image=screen.getByText('Screenshot');
  expect(image.closest('details')?.textContent).toContain('shell');
  expect(screen.getAllByText('Screenshot')).toHaveLength(1);
});
it('keeps public updates and commands chronological, individually expandable, with a single live status', () => {
  const { container } = render(<DeviceActivityReply content={content} text="Live answer" working action="Writing" />);
  expect(container.textContent).toMatch(/Checking.*Thinking.*shell.*Verified.*Writing.*Live answer/s);
  expect(screen.getAllByRole('status')).toHaveLength(1);
  const command = screen.getByText(/✓ shell/).closest('details')!;
  expect(command.open).toBe(false); fireEvent.click(command.querySelector('summary')!); expect(command.open).toBe(true);
});
it('collapses all completed activity above the answer and retains elapsed time', () => {
  render(<DeviceActivityReply content={content} text="Final answer" />);
  const summary = screen.getByText('Activity · 1 steps · 2 updates · 1m 5s');
  expect(summary.closest('details')!.open).toBe(false);
  expect(screen.getByText('Final answer').closest('details')).toBeNull();
});
it('uses one status within a trailing tool group and appends legacy missing steps once', () => {
  render(<DeviceActivityReply content={{ ...content, timeline: content.timeline.slice(0, 2) }} text="" working action="Using shell" />);
  expect(screen.getAllByText(/Using shell/)).toHaveLength(1);
  expect(screen.queryByRole('status')).toBeNull();
  expect(activityRows({ steps: content.steps, commentary: ['Legacy'] })).toHaveLength(2);
  expect(activityRows(content)).toHaveLength(3);
});
