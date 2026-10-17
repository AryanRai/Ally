/** Open the Claude Code sign-in dialog from anywhere (an error message, Settings). */
export const openClaudeLogin = () => window.dispatchEvent(new Event('ally:claude-login'));

/** Message text that means the CLI needs signing in again (see electron/agent/parsers.ts#claudeError). */
export const needsClaudeLogin = (text: string) => text.includes('Claude Code is not logged in');
