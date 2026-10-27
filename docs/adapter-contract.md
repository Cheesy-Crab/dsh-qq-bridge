# Communication Adapter Contract

An adapter is a transport implementation. It must not import platform-core or
session-core implementations.

## Shape

```js
export const adapter = {
  id: 'qq',
  mount(host) {
    // host is provided by @dsh/platform-core AdapterHost
    return instance
  },
}
```

`instance` may expose `stop()` and `status()`.

## Host context

```js
host = {
  id,
  config,
  root,
  log,

  extensions,                 // shared AgentExtensionRegistry
  registerExtensions(list),   // register adapter-owned behavior extensions
  createSessionManager(opts), // core-owned ChatAgentManager
  createUserStore(opts),      // core-owned UserStore
  forwardMediaOutputs(opts),  // surface-neutral media delivery
}
```

## Adapter responsibilities

- transport lifecycle (`start` / `stop`)
- receive raw messages and normalize them
- send text / images
- mention / target formatting
- map surface identity to a principal
- expose adapter-specific agent extensions

## Adapter must not

- create `ChatAgentManager` directly
- create `UserStore` directly
- import `@dsh/platform-core` or `@dsh/session-core`
- read platform storage or quota files
- register itself into platform internals

## Composition

```text
platform-core AdapterHost
  ├─ sessionService.createManager
  ├─ accessService.createStore
  ├─ agentExtensions.register
  └─ delivery.forwardMediaOutputs
            ↓ host context
       qq adapter.mount(host)
```

The host owns composition. The adapter owns QQ.
