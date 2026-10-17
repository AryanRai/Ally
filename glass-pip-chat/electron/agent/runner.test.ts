import { describe, expect, it } from 'vitest';
import { codexArgs, robotMcpServers } from './runner';

const robot = {
  instructions: 'be a robot',
  mcpUrl: 'http://localhost:8090/mcp',
  motionMcpUrl: 'http://localhost:8091/mcp',
};

describe('robot MCP servers', () => {
  it('names perception and motion servers, skipping unset ones', () => {
    expect(robotMcpServers(robot)).toEqual({
      howyouseeme: 'http://localhost:8090/mcp',
      droidcore: 'http://localhost:8091/mcp',
    });
    expect(robotMcpServers({ instructions: 'x', mcpUrl: 'http://a/mcp' })).toEqual({ howyouseeme: 'http://a/mcp' });
    expect(robotMcpServers(undefined)).toEqual({});
  });

  it('passes both servers to Codex as config overrides', () => {
    const args = codexArgs({ provider: 'codex', prompt: 'hi', cwd: '.', robot });
    expect(args).toContain('mcp_servers.howyouseeme.url="http://localhost:8090/mcp"');
    expect(args).toContain('mcp_servers.droidcore.url="http://localhost:8091/mcp"');
    expect(args[args.length - 1]).toBe('-');
  });
});
