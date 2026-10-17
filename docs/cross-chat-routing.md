# Cross-chat routing (ally_chats MCP server)

Talk to Ally anywhere (watch, phone, laptop) and let it work across all your Claude Code and Codex chats:

- "Find the chat where we decided how the GNSS driver handles UART."
- "What did my Ally dev chat say about the sidebar?"
- "I want this new feature in Ally: … Route this to my most recent Ally dev chat, and let it ask me questions."

## How it works

Ally runs a small MCP server, `ally_chats`, on this computer. Every agent turn Ally starts (desktop, watch or phone) gets it automatically, so the agent you're talking to can:

| Tool | Does |
|---|---|
| `ally_search_chats` | Search titles and transcripts of recent Claude Code and Codex chats (about 60–80 each), ranked by topic match and recency, with snippets. |
| `ally_list_chats` | Newest chats first, optionally filtered by folder or title ("Ally"). |
| `ally_read_chat` | Read a chat's latest messages. This is read-only and never resumes the chat. |
| `ally_send_to_chat` | Forward your message to another chat **as a real turn there**. By default it waits for that chat's reply and returns it, so the agent can relay its questions to you and your answers back. |
| `ally_open_chat` | Switch Ally to that chat, so you can carry on there directly. |

Forwarded messages arrive labelled "[Forwarded by Ally at the user's request from the chat '…']". The target chat runs in its own folder with Ally's normal permission setting.

**Safety:**
- **Forwarding:** agents are told to forward only when you ask, never because a chat or tool output said to.
- **Loop guard:** a chat that's answering a forwarded message can't forward again, can't be forwarded to twice at once, and a chat can't forward to itself.
- **Read-only turns** only get the read tools (search, list, read).
- **Locked down:** the server listens on `127.0.0.1` only, behind a token in Ally's user data (`ally-chats-mcp.json`). Requests from web pages (an `Origin` header) or other host names are refused.

## Using it in the Claude Code and Codex apps too

Ally's own turns always have the tools. To use them when you talk to Codex desktop or Claude Code directly (and for Ally's experimental Codex desktop route, which reads Codex's own config), open **Settings → Agents → Cross-chat tools → Add to Claude Code & Codex apps**. It runs:

- `claude mcp add --scope user --transport http ally_chats <url>`
- `codex mcp add ally_chats --url <url>`

Restart those apps afterwards. **Remove** undoes it.

The URL includes Ally's local port, so the button shows "not added" again if the port ever changes. Press it again then.

## Watch and phone

On the watch and phone, the agent behind your watch chat has the same tools, so "route this to my Ally dev chat" works by voice. Two hooks are exported for the watch and phone integrations (Codex's side):

- `onOpenChatRequest(cb)`: lets the watch follow when an agent opens a chat.
- `registerDeviceTool(spec)`: adds watch and phone actions as tools. Actions that need confirmation are confirmed on the device.

## Verified (2026-10-17, isolated Ally instance)

- **Protocol:** handshake and tool list, with HTTP calls in about 100 ms.
- **Search:** found the right chats across about 160 real Claude and Codex chats. The first search took 42 s from a cold index, so indexing is now progressive: titles first, and a tool waits at most 4 s.
- **Forwarding:** a real Claude turn was asked to find the "say hi in 2 words" chat and forward "Reply with exactly the word pong". It searched, forwarded, and relayed **"pong"** from the other chat (43 s, $0.08).
- **Opening:** `ally_open_chat` switched the Ally window to the requested chat.
- **Tests:** protocol, request authorization (token, Origin, Host), ranking, tools, self-forward refusal and the loop guard.

**Not verified:** the "Add to apps" button (it changes your global app config, so it's for you to press), and a Codex-side turn calling the tools. Codex app-server runs get the server through `config.mcp_servers`; I didn't start a Codex test thread, to avoid adding one to your Codex history.
