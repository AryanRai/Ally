import { describe, expect, it } from 'vitest';
import { robotMcpServers } from './runner';
import { codexThreadConfig } from './codexRun';

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
    const config = codexThreadConfig({ provider: 'codex', prompt: 'hi', cwd: '.', robot });
    expect(config).toMatchObject({ config: { mcp_servers: { howyouseeme: { url: robot.mcpUrl }, droidcore: { url: robot.motionMcpUrl } } } });
  });
});
