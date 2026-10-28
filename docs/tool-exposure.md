# Capability → Tool Exposure

状态：已实现并在 QQ 实际验证（platform-core 0.48.2）。

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

platform-core 0.48.2 已内置 image-gen 的 8 个工具映射（`src/capability-bindings.js`）；插件 manifest 或 config 仍可覆盖/补充：

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

## 实际验证

时间：2026-10-28 23:56

```text
QQ 私聊 <QQ号>
/profile use image
→ profileId=image
→ 新 session: sess-qq-mvsaqr09-lg2go3
```

请求工具数：

```text
默认 profile: 40 tools / 47,940 bytes
image profile: 33 tools / 34,179 bytes
```

contextBreakdown：

```text
默认 profile toolsTokens: 11,588
image profile toolsTokens:  8,260
节省: ~3,328 tokens（约 28.7%）
```

保留：

```text
generate_image
read / write / pwsh / web_search / ...
```

隐藏：

```text
edit_image
generate_images
estimate_image_cost
enhance_prompt
find_inspiration
canvas_state
view_canvas
```

注意：

```text
image profile 只激活 image.generate
所以 batch / edit / inspiration 等工具不可见
需要这些能力时扩展 profile.capabilities
```

## 不做

```text
不把 capability 暴露成可调用 tool
不用 guard 代替 exposure
不为了省 token 动态切换当前 turn 的工具表
```


