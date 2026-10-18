# Natural phone and watch replies

Phone and watch no longer prepend a smartwatch persona or require concise answers. The agent keeps its normal response style. The shared device prompt only documents optional UI components and real action/approval behavior.

Ordinary text and Markdown already travel through the existing reply envelope as text with no cards. Agents can still return `{ "text": "...", "components": [...] }` when optional widgets help. Existing timer, checklist and action limitations remain accurate; widgets cannot grant tool approvals.

No Android protocol or app update is needed. Both clients already render the same text/cards schema, and existing transport length limits are unchanged. Legacy smartwatch prompts and the new device-interface prefix are recognized when displaying user messages and repairing chat titles; stored conversation content is not rewritten.

Verification covers natural Markdown through the authenticated HTTP bridge, JSON/widget compatibility, streaming, history/presentation and chat titles. Tests use synthetic responses without starting a model, recording audio or answering a real approval. Deployment readiness and the active artifact are recorded in `agent-collaboration.md`.
