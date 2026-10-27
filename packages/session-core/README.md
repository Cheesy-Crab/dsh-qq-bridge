# @dsh/session-core

Surface-neutral session and workspace manager for DSH.

## Role

```text
communication adapter
  → conversation key + send callbacks
session-core
  → session lifecycle, workspace, queue, context, titles
platform core
  → capability registry, prompts, delivery
```

It does not know QQ, OneBot, NapCat or mention semantics.

## API

```js
import { ChatAgentManager } from '@dsh/session-core'

const manager = new ChatAgentManager({
  ctx,
  config,
  root,
  log,
  send,
  sendImage,
  store,
  approval,
  bindSession,
  resolveChat,
  behavior,
})
```

The communication adapter supplies:

- `chat`-like target with a stable `type` and `id`
- `send` / `sendImage` callbacks
- approval bridge
- session binding / reverse lookup
- behavior extensions

## Boundary

This package owns:

- workspace path allocation
- session creation / resume / deletion
- turn queue
- reply splitting
- titles
- per-session state

It does not own:

- QQ transport
- capability plugins
- plugin-specific prompts
- visual generation

## Status

Extracted from `dsh-qq-bridge` in `0.42.0`; further conversation-key generalization is planned.
