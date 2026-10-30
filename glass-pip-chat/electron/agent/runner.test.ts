import { describe, expect, it } from 'vitest';
import { robotMcpServers, claudeArgs } from './runner';
import { setEndpoint } from '../chatsMcp/registry';
import { codexThreadConfig } from './codexRun';

const robot = {
  instructions: 'be a robot',
  mcpUrl: 'http://localhost:8090/mcp',
  motionMcpUrl: 'http://localhost:8091/mcp',
};

describe('robot MCP servers', () => {
  it('allows capability-bound drawings in readonly chats without allowing forwarding or file writes', () => {
    setEndpoint({ port: 18767, token: 'f'.repeat(48) });
    try {
      const args = claudeArgs({ provider: 'claude', prompt: 'explain my selection', cwd: '.', permission: 'readonly' }, {});
      const allowed = args[args.indexOf('--allowedTools') + 1].split(',');
      expect(allowed).toContain('mcp__ally_chats__visual_tutor_read');
      expect(allowed).toContain('mcp__ally_chats__study_open');
      expect(allowed).toContain('mcp__ally_chats__visual_tutor_draw');
      expect(allowed).toContain('mcp__ally_chats__native_study_reference');
      expect(allowed).not.toContain('mcp__ally_chats__ally_send_to_chat');
      expect(args).toContain('plan');
    } finally { setEndpoint(null); }
  });
  it('names perception and motion servers, skipping unset ones', () => {
    expect(robotMcpServers(robot)).toEqual({
      howyouseeme: 'http://localhost:8090/mcp',
      droidcore: 'http://localhost:8091/mcp',
    });
    expect(robotMcpServers({ instructions: 'x', mcpUrl: 'http://a/mcp' })).toEqual({ howyouseeme: 'http://a/mcp' });
    expect(robotMcpServers(undefined)).toEqual({});
  });

  it('passes both servers to Codex as config overrides', () => {
    const config = codexThreadConfig({ provider: 'codex', prompt: 'hi', cwd: '.', robot });
    expect(config).toMatchObject({ config: { mcp_servers: { howyouseeme: { url: robot.mcpUrl }, droidcore: { url: robot.motionMcpUrl } } } });
  });
});
