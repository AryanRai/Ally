import { describe, expect, it, vi } from 'vitest';
vi.mock('@/components/ai-elements/terminal', () => ({ Terminal: () => null }));
import { describeTool, editDiff } from './ToolCall';
import type { ToolExecution } from '@/types/chat';

const tool = (name: string, parameters: Record<string, unknown>): ToolExecution => ({ id: 't', name, parameters, status: 'success', startTime: 0 });

describe('tool summaries and diffs', () => {
  it('shows Codex command arguments and unwraps PowerShell', () => {
    expect(describeTool(tool('functions.exec_command', { cmd: 'powershell.exe -Command "git status"' }))).toMatchObject({ done: 'Ran', command: 'git status' });
  });
  it('renders a Codex patch with its filename and accurate counts', () => {
    const patch = tool('functions.apply_patch', { input: '*** Begin Patch\n*** Update File: src/app.ts\n@@\n-old\n+new\n+another\n*** End Patch' });
    expect(describeTool(patch)).toMatchObject({ done: 'Edited', target: 'src/app.ts' });
    expect(editDiff(patch)?.filter(l => l.sign === '+')).toHaveLength(2);
    expect(editDiff(patch)?.filter(l => l.sign === '-')).toHaveLength(1);
  });
  it('does not invent a removed blank line for new files or count trailing newlines', () => {
    expect(editDiff(tool('Write', { content: 'new\n' }))).toEqual([{ sign: '+', text: 'new' }]);
    expect(editDiff(tool('Edit', { old_string: '', new_string: 'new\n' }))).toEqual([{ sign: '+', text: 'new' }]);
  });
});
