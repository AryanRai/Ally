# Collapsed message readability

Implemented in source; not deployed by this chat. The live desktop was inspected read-only and still runs `claude-resume-20261018` (main PID 6884). No model prompts, recording, approval decisions, resend, shared dist write, Git mutation or production restart was performed.

## Behavior

- Compact requests use readable Markdown and a bounded preview with **Read full request / Show less**. Browser ambient context is removed only from the display projection, recognizing the actual leading `<in-app-browser-context source="ambient-ui-state">` envelope and its exact copied Markdown/prose representation. A leading environment envelope with recognized fields is also recognized. Native prompts and stored source content are not rewritten by these display helpers.
- Codex app-server/exec/rollout readers preserve text item IDs and commentary/final phases. Claude imports and live events preserve assistant message IDs. The live React accumulator retains these boundaries and accepts phase metadata arriving on completion without replaying text.
- The latest text item is the primary reader; earlier text and tool activity remain under **Progress and activity**. Explicit commentary is labeled **Latest update** when idle. Legacy text without recoverable boundaries remains complete rather than guessing a final paragraph. Existing reasoning UI in full chat is unchanged; the compact activity projection does not add reasoning.
- Paragraphs, lists, headings, inline/fenced code, links, tables and images use a compact Markdown layout. Native/tool images and watch reply widgets remain reachable. The current request/reply are excluded from Recent messages to avoid duplication.
- Standalone, well-formed `::created-thread` becomes **Open created chat** with the exact `codex://threads/<id>` target; pending client IDs become creation-status text. Quoted/indented/fenced/inline examples and ordinary links remain intact. Unknown directive syntax is left alone. Copy preserves meaningful Markdown/link targets, without the raw recognized directive.
- The reported `Latest replysvgsvg` corresponds to the header's two SVG controls; no literal `svgsvg` string exists in the component. Explicit `aria-hidden`/`focusable=false` and a non-selectable header prevent decorative controls from entering accessible/copied reply content. Literal user-authored `svgsvg` is preserved. Native browser AX and copy checks show no icon text.

## Verification

63 targeted tests pass on an isolated PR30 baseline plus the readability files. This includes Codex import/live phases, Claude import/live boundaries, late completion metadata, no delta replay, interruption status, new-turn clearing, follow/pause controls, exact browser envelope/copy forms, Markdown semantics, expansion, copy and directive-code examples. Workspace and isolated TypeScript passed; isolated Vite and Electron builds passed. Visual QA uses a synthetic local-only harness at 320, 360 and 480 px, with request expansion, activity disclosure, streaming/completion and copy controls; it sends no provider/device requests.

Local isolated project: `C:/Users/buzza/Desktop/Projects/Active/Exo/.ally-readability-20261018/glass-pip-chat`. The temporary `readability.html` harness is only in that snapshot. Screenshots and the owned-file manifest are in its parent directory. Do not launch this QA snapshot as the combined production build.

## Integration

The unified UI chat owns Git and deployment. Preserve all scoped files in `owned-files.txt`, including the new untracked helpers/components/tests. Shared parent wiring is exactly one additive `responseSegments={currentResponse ? streamingSegments : undefined}` prop on `CollapsedHeader` in `GlassChatPiP.tsx`; the unified Circle/meeting edits remain intact. Include parser/types/hook changes together with the renderer so fresh imports and streams retain phase boundaries. No `historyReply.ts`, chat-title, configuration, Android or provider execution behavior was changed.
