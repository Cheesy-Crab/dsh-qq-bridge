# Capability → Tool Exposure

状态：基础版已实现（platform-core 0.48.0），尚未在当前运行进程激活。

## 规则

```text
profile.capabilities 存在
  → 只允许这些 capability 绑定的 tool
profile.capabilities 不存在
  → legacy 行为，不限制
```

实现使用：

```js
agent.ctx.tools.restrict({ deny: [...] })
```

只 deny 未激活 capability 绑定的 managed tool，保留 base tools。

## 配置

如果插件 manifest 没有 capability 映射，可以在 platform-core config 中补：

```yaml
- id: platform-core
  config:
    capabilityBindings:
      - id: image.generate
        kind: action
        bind:
          tool: generate_image
      - id: image.edit
        kind: action
        bind:
          tool: edit_image
      - id: image.inspiration
        kind: knowledge
        bind:
          tool: find_inspiration
```

profile：

```json
{
  "id": "image",
  "agentPreset": "image",
  "capabilities": ["image.generate"]
}
```

结果：

```text
generate_image 可见
edit_image 被 deny
find_inspiration 被 deny
read / write / pwsh 保留
```

## 当前限制

```text
image-gen 0.9.2 没有 dsh.platform capabilities
需要在 platform-core config 中补 capabilityBindings
如果工具是 preset-scope 注册，restrict 可能无效
```

## 验证计划

```text
1. 给 image profile 加 capabilityBindings
2. 新建会话，检查 edit_image 不在工具表
3. 对比 contextBreakdown.toolsTokens
4. 确认 base tools 仍可用
```

## 不做

```text
不把 capability 暴露成可调用 tool
不用 guard 代替 exposure
不为了省 token 动态切换当前 turn 的工具表
```
