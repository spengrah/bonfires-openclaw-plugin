# Spec: Strip prependContext from Captured Messages

## Goal
Prevent Bonfires context injections from being re-captured back to Bonfires, creating a feedback loop.

## Background
The `before_agent_start` hook returns `{ prependContext: "--- Bonfires context ---\n..." }`. OpenClaw prepends this text to the user's message before passing it to the LLM. The combined text (prependContext + user message) is then stored in the session transcript as the user's message content.

When `agent_end` captures this message and sends it to Bonfires `stack/add`, the Bonfires context injection is treated as user-authored content. This creates a feedback loop:
1. Bonfires returns context → injected into user message
2. Message stored in transcript with injection
3. `agent_end` captures transcript → sends injection text back to Bonfires
4. Bonfires indexes the injection text as user content
5. Future searches return the injection text as a result → re-injected

## Requirements
1. Before sending user messages to `stack/add`, strip any leading `--- Bonfires context ---` block from the message text.
2. The stripping pattern is: text starting with `--- Bonfires context ---\n`, continuing through zero or more `- ` prefixed lines, ending at the `---` closing marker and any following whitespace.
3. Stripping applies only to `role: "user"` messages.
4. If the entire message content is the prependContext block (no user text after it), skip the message entirely — do not send an empty message to Bonfires.
5. Stripping is applied in the capture path (`bonfires-client.ts` or `hooks.ts`), not in the hook event data — the LLM still sees the full prepended prompt.

## Acceptance
- A captured user message containing `--- Bonfires context ---\n- summary (source: ...)\n---\nhello world` is sent to Bonfires as `hello world`.
- A captured user message that is entirely a prependContext block is skipped.
- Assistant messages are not modified.
- Messages without the prependContext prefix are passed through unchanged.
