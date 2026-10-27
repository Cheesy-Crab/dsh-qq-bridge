# DSH 插件接口规范 v1.0

状态：草案  
适用范围：DSH 平台上可被 QQ Bridge 及其他聊天/交付表面消费的插件。

## 1. 目标

平台不感知具体插件的私有字段、提示词或重试逻辑。插件通过本规范声明：

- 自己提供哪些提示词；
- 工具会产生哪些输出；
- 输出如何交付；
- 失败是否可重试、如何恢复；
- 需要哪些权限；
- 如何做安全校验。

平台只实现通用契约，不为新插件写代码或写死提示词。

## 2. 规范性用语

- **MUST**：不满足即视为不合规，平台可以拒绝加载或拒绝交付。
- **SHOULD**：不满足时平台应降级并记录告警。
- **MAY**：可选能力。

## 3. 合规等级

| 等级 | 要求 |
|---|---|
| Core | 提供 `dsh.pluginApi`，声明权限，不直接访问聊天通道 |
| Prompt | 通过文件贡献提示词，不把插件私有逻辑写进平台 |
| Output | 工具输出使用 `meta.dsh.outputs` 声明媒体 |
| Recovery | 可恢复操作提供 `operation.id` 与 `operation.resume` |

只有 Core 是“能被平台加载”的最低要求；产生媒体输出的工具 MUST 满足 Output。

## 4. 插件清单

插件在 `package.json` 的 `dsh` 字段中声明：

机器可读 schema：[schemas/plugin-manifest.schema.json](../schemas/plugin-manifest.schema.json)。

```json
{
  "dsh": {
    "pluginApi": "1.0",
    "prompts": ["./prompts/image-generation.md"],
    "skills": ["./skills/image-gen/SKILL.md"],
    "tools": [
      {
        "name": "generate_image",
        "capability": "image",
        "outputs": ["image"],
        "retry": { "maxAttempts": 1 }
      }
    ],
    "delivery": {
      "images": true,
      "files": false
    }
  }
}
```

字段：

| 字段 | 必填 | 说明 |
|---|---|---|
| `pluginApi` | 是 | 接口版本，当前为 `1.0`；平台拒绝不兼容主版本 |
| `prompts` | 否 | 提示词文件，相对插件根目录 |
| `skills` | 否 | 技能文件，由 DSH skill 机制加载 |
| `tools` | 否 | 工具声明；工具产生媒体时必填 |
| `delivery` | 否 | 平台可自动交付的媒体类型 |
| `permissions` | 否 | 插件需要的平台能力，如 `image`、`workspace` |

### 4.1 版本规则

- 使用语义化版本；`1.x` 向后兼容。
- 平台 MUST 拒绝 `pluginApi` 主版本不匹配的插件。
- 插件 MUST 在破坏性变更时提升主版本。

## 5. 提示词贡献

提示词是插件自带的纯文本文件，平台按条件加载；QQ Bridge 不再为具体插件写死提示词。

### 5.1 文件格式

Markdown + frontmatter：

机器可读 schema：[schemas/prompt.schema.json](../schemas/prompt.schema.json)。

```md
---
id: image-generation
order: 200
when:
  tools: [generate_image, edit_image]
  capabilities: [image]
  surfaces: [qq]
---
生成或编辑图片后，使用平台输出契约交付图片。
不要直接把图片路径当作已发送。
```

字段：

| 字段 | 必填 | 说明 |
|---|---|---|
| `id` | 是 | 插件内唯一，平台展开为 `<plugin-id>:<id>` |
| `order` | 是 | 0–1000，数字小的先注入 |
| `when.tools` | 否 | 任一工具激活时加载 |
| `when.capabilities` | 否 | 需要的能力 |
| `when.surfaces` | 否 | `qq`、`web` 等；省略表示全部 |
| `when.modes` | 否 | `chat`、`design` 等 |

### 5.2 安全约束

- 提示词 MUST 来自插件包，不得包含用户输入、聊天原文或密钥。
- v1 不支持模板变量插值；平台只追加受控的运行时上下文。
- 提示词 MUST 不包含“直接调用 QQ/NapCat/OneBot”的指令。
- 插件不得要求平台把用户消息拼进 system prompt。

## 6. 工具结果契约

所有产生媒体、费用或可恢复操作的工具，在结果 `meta.dsh` 中声明：

机器可读 schema：[schemas/tool-result.schema.json](../schemas/tool-result.schema.json)。

```json
{
  "meta": {
    "dsh": {
      "version": "1.0",
      "outputs": [
        {
          "kind": "image",
          "path": "dsh-image-gen/image-abc.jpg",
          "mime": "image/jpeg",
          "width": 1024,
          "height": 768,
          "caption": "白猫窗台"
        }
      ],
      "operation": {
        "id": "civitai:workflow:123",
        "recoverable": true,
        "resume": {
          "tool": "resume_image_operation",
          "args": { "operationId": "civitai:workflow:123" }
        }
      },
      "retry": {
        "retryable": false,
        "reason": "auth",
        "maxAttempts": 0
      },
      "cost": {
        "amount": 14,
        "unit": "buzz",
        "provider": "civitai"
      }
    }
  }
}
```

### 6.1 outputs

| 字段 | 必填 | 说明 |
|---|---|---|
| `kind` | 是 | `image` / `video` / `audio` / `file` / `text` |
| `path` | 是* | 工作区内路径，建议相对工作区根目录 |
| `attachmentId` | 是* | 内联附件 id；与 `path` 二选一 |
| `mime` | 是 | 标准 MIME |
| `width` / `height` | 否 | 图片/视频尺寸 |
| `caption` | 否 | 面向用户的短说明 |
| `sha256` | 否 | 内容摘要，用于去重 |

\* `path` 与 `attachmentId` 至少一个。

平台 MUST：

- 校验路径在会话工作区内，拒绝 `..` 和符号链接逃逸；
- 限制文件大小和 MIME；
- 只自动交付 `delivery` 允许的媒体；
- 非图片默认不自动发到 QQ。

### 6.2 operation

| 字段 | 说明 |
|---|---|
| `id` | 稳定操作 id；重试必须复用 |
| `recoverable` | 是否可在不重新提交的情况下恢复 |
| `resume.tool` | 恢复工具名；MUST 是幂等的 |
| `resume.args` | 恢复参数，必须可序列化 |

平台收到可恢复失败时 SHOULD 调用 `resume`，而不是重新执行原工具。

### 6.3 retry

| 字段 | 说明 |
|---|---|
| `retryable` | 是否允许平台重试 |
| `reason` | 见错误分类 |
| `maxAttempts` | 0 或 1；平台上限为 1 |
| `afterMs` | 建议等待时间 |

平台 MUST 不超过 `maxAttempts`，且 MUST 不自动重试 `auth`、`quota`、`invalid_input`。

### 6.4 cost

| 字段 | 说明 |
|---|---|
| `amount` | 非负数 |
| `unit` | `buzz`、`usd`、`tokens` 等 |
| `provider` | 计费来源 |

平台只对已配置的计费单位扣额度；未知单位必须记录但不扣。

## 7. 错误分类

工具失败时返回：

```json
{
  "meta": {
    "dsh": {
      "version": "1.0",
      "error": {
        "code": "transient_network",
        "message": "Civitai workflow submit failed",
        "retryable": true,
        "operationId": "civitai:workflow:123",
        "userMessage": "图片服务暂时不可用，正在重试。"
      }
    }
  }
}
```

标准 `code`：

| code | 可重试 | 平台行为 |
|---|---|---|
| `transient_network` | 是 | 可通过 `resume` 恢复；最多一次 |
| `rate_limited` | 是 | 按 `afterMs` 等待后一次 |
| `upstream_error` | 是 | 同网络错误 |
| `quota_exceeded` | 否 | 告知用户/管理员 |
| `auth` | 否 | 告知配置 key/token |
| `invalid_input` | 否 | 让用户修正参数 |
| `canceled` | 否 | 不重试 |
| `unknown` | 否 | 记录并告知 |

平台 MUST 不把 API key、token、完整上游响应写进 QQ 消息。

## 8. 交付规则

插件 MUST NOT 直接调用 QQ、NapCat、OneBot 或任何聊天 API。

插件只声明 outputs，由平台决定：

- 图片是否发送；
- 是否 @ 用户；
- 是否进入会话归档；
- 是否扣额度；
- 是否展示 caption。

QQ Bridge 只保留平台语义：

```text
群聊要 @
回复带当前发送者
图片通过平台发送
非图片不自动发
```

## 9. 安全要求

插件 MUST：

- 输出路径限制在工作区；
- 不在提示词、错误、日志中放密钥；
- 不读取工作区外的文件，除非平台显式授权；
- 不把用户输入拼进 system prompt；
- 不自行重试或递归生成；
- 对可恢复操作提供稳定 `operation.id`；
- 声明所需权限，按最小权限运行。

平台 MUST：

- 校验路径、MIME、大小；
- 拒绝未知 `pluginApi` 主版本；
- 对未知插件字段忽略而不是崩溃；
- 对不合规插件降级为“仅聊天工具”，不自动交付媒体。

## 10. 兼容旧插件

旧插件可能只返回：

```json
{ "savedTo": "...", "cost": { "total": 14 } }
```

平台 MAY 通过适配层读取，但该行为属于遗留兼容，不算合规。

新插件 MUST 使用 `meta.dsh`，不得依赖平台识别私有字段。

## 11. 验证清单

插件发布前 MUST 通过：

- [ ] `dsh.pluginApi` 为 `1.x`
- [ ] 提示词文件存在且 frontmatter 合法
- [ ] 所有媒体输出在 `meta.dsh.outputs`
- [ ] 路径在工作区内
- [ ] 错误使用标准 `code`
- [ ] 可恢复操作提供 `operation.id` / `resume`
- [ ] `retry.maxAttempts` 不超过 1
- [ ] 不在提示词/错误中泄露密钥
- [ ] 不直接调用 QQ/NapCat/OneBot

## 12. 示例：image-gen

```json
{
  "dsh": {
    "pluginApi": "1.0",
    "prompts": ["./prompts/image-generation.md", "./prompts/visual-design.md"],
    "tools": [
      {
        "name": "generate_image",
        "capability": "image",
        "outputs": ["image"],
        "retry": { "maxAttempts": 1 }
      }
    ],
    "delivery": { "images": true, "files": false },
    "permissions": ["image", "workspace"]
  }
}
```

平台据此加载提示词、发送图片、扣 `buzz`，不再需要 QQ Bridge 里写：

```text
如果是 image-gen 的 savedTo ...
如果是 Civitai 的 ECONNRESET ...
```

这些都属于插件自己的契约与实现。
