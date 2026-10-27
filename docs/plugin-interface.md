# DSH 插件接口规范 v1.1（能力优先）

状态：草案  
适用范围：DSH 平台上可被核心、QQ Bridge 及其他沟通表面消费的插件。

## 1. 模型：平台是人，插件是能力

平台不是一个“工具容器”，而是一个人的运行时：

```text
平台核心
├─ 人格 / 身份
├─ 意图 / 决策
├─ 记忆（会话、工作区）
├─ 能力选择与编排
├─ 权限 / 审批 / 审计
└─ 表达（沟通能力）
```

插件提供这个人的能力：

| 人的部分 | 能力类型 | 例子 |
|---|---|---|
| 眼睛、耳朵 | `perception` | 读文件、看图、抓网页、截图 |
| 手、脚 | `action` | 写文件、执行命令、生图、改图 |
| 学识 | `knowledge` | skill、领域方法、提示词 |
| 记忆 | `memory` | 工作区、会话归档、检索 |
| 嘴、耳朵 | `communication` | QQ、Web、邮件 |

QQ Bridge 是 `communication.qq`，不是平台本身，也不应该知道 image-gen 的私有逻辑。

## 2. 规范性用语

- **MUST**：不满足即不合规，平台可以拒绝加载或拒绝交付。
- **SHOULD**：不满足时降级并记录告警。
- **MAY**：可选。

## 3. 合规等级

| 等级 | 要求 |
|---|---|
| Core | 声明 `dsh.pluginApi` 与至少一个 capability |
| Prompt | capability 自带提示词文件 |
| Output | 工具结果使用 `meta.dsh.outputs` 声明媒体 |
| Recovery | 可恢复操作声明 `operation` / `resume` |

产生媒体或费用的能力 MUST 满足 Output；可恢复操作 SHOULD 满足 Recovery。

## 4. 能力清单

插件在 `package.json` 的 `dsh` 字段中声明能力，工具只是能力的实现绑定：

```json
{
  "dsh": {
    "pluginApi": "1.1",
    "capabilities": [
      {
        "id": "image.generate",
        "kind": "action",
        "title": "生成图片",
        "description": "根据文字生成图片，可产生外部费用。",
        "effects": ["network", "cost"],
        "permissions": ["image"],
        "prompts": ["./prompts/image-generation.md"],
        "bind": { "tool": "generate_image" },
        "delivery": ["image"],
        "retry": { "maxAttempts": 1 },
        "recovery": {
          "operationId": true,
          "resumeTool": "resume_image_operation"
        }
      }
    ]
  }
}
```

机器可读 schema：

- [plugin-manifest.schema.json](../schemas/plugin-manifest.schema.json)
- [capability.schema.json](../schemas/capability.schema.json)

字段：

| 字段 | 必填 | 说明 |
|---|---|---|
| `pluginApi` | 是 | `1.x`；平台拒绝不兼容主版本 |
| `capabilities` | 是 | 至少一个能力 |
| `prompts` | 否 | 兼容旧插件；新插件应放在 capability 内 |
| `tools` | 否 | 兼容旧清单；新插件用 `bind` |
| `delivery` | 否 | 插件级默认交付策略 |
| `permissions` | 否 | 插件级默认权限；能力可覆盖 |

### 4.1 版本规则

- 语义化版本；`1.x` 向后兼容。
- 平台 MUST 拒绝 `pluginApi` 主版本不匹配的插件。
- 破坏性变更提升主版本。

## 5. 能力类型

| kind | 含义 |
|---|---|
| `perception` | 获取信息：读、看、听、搜索 |
| `action` | 改变状态：写、执行、生成、修改 |
| `knowledge` | 提供方法：skill、领域规则 |
| `communication` | 与外部沟通：QQ、Web、邮件 |
| `memory` | 保存/检索会话和工作区信息 |

## 6. 能力效果

| effect | 说明 |
|---|---|
| `read` | 读取工作区或外部数据 |
| `write` | 写工作区 |
| `network` | 访问外部网络 |
| `exec` | 执行命令 |
| `cost` | 产生费用 |
| `external_effect` | 外部副作用，例如发消息 |

平台根据 `effects` 决定审批、沙箱和额度，不根据插件名判断。

## 7. 提示词归属能力

提示词属于 capability，不属于平台，也不属于某个固定插件。

### 7.1 文件格式

```md
---
id: image-generation
order: 200
when:
  capabilities: [image.generate, image.edit]
  surfaces: [qq]
---
生成或编辑图片后，使用平台输出契约交付图片。
```

机器可读 schema：[prompt.schema.json](../schemas/prompt.schema.json)。

字段：

| 字段 | 必填 | 说明 |
|---|---|---|
| `id` | 是 | 能力内唯一；平台展开为 `<plugin-id>:<capability-id>:<id>` |
| `order` | 是 | 0–1000，小的先注入 |
| `when.capabilities` | 否 | 激活的能力 |
| `when.surfaces` | 否 | `qq`、`web` 等 |
| `when.tools` | 否 | 兼容旧条件 |
| `when.modes` | 否 | `chat`、`design` 等 |

### 7.2 安全约束

- 提示词 MUST 来自插件包，不得包含用户输入、聊天原文或密钥。
- v1.1 不支持模板变量插值；平台只追加受控运行时上下文。
- 提示词 MUST 不包含“直接调用 QQ/NapCat/OneBot”的指令。
- 插件不得要求平台把用户消息拼进 system prompt。

## 8. 工具结果契约

产生媒体、费用或可恢复操作的工具，在 `meta.dsh` 中声明：

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
        "retryable": true,
        "reason": "transient_network",
        "maxAttempts": 1
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

机器可读 schema：[tool-result.schema.json](../schemas/tool-result.schema.json)。

### 8.1 outputs

| 字段 | 必填 | 说明 |
|---|---|---|
| `kind` | 是 | `image` / `video` / `audio` / `file` / `text` |
| `path` | 是* | 工作区路径，建议相对工作区根目录 |
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

### 8.2 operation

| 字段 | 说明 |
|---|---|
| `id` | 稳定操作 id；重试必须复用 |
| `recoverable` | 是否可在不重新提交的情况下恢复 |
| `resume.tool` | 恢复工具名，MUST 幂等 |
| `resume.args` | 恢复参数，必须可序列化 |

平台收到可恢复失败时 SHOULD 调用 `resume`，而不是重新执行原能力。

### 8.3 retry

| 字段 | 说明 |
|---|---|
| `retryable` | 是否允许平台重试 |
| `reason` | 见错误分类 |
| `maxAttempts` | 0 或 1；平台上限为 1 |
| `afterMs` | 建议等待时间 |

平台 MUST 不超过 `maxAttempts`，且 MUST 不自动重试 `auth`、`quota_exceeded`、`invalid_input`。

### 8.4 cost

| 字段 | 说明 |
|---|---|
| `amount` | 非负数 |
| `unit` | `buzz`、`usd`、`tokens` 等 |
| `provider` | 计费来源 |

平台只对已配置的单位扣额度；未知单位记录但不扣。

## 9. 错误分类

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

## 10. 交付

插件 MUST NOT 直接调用 QQ、NapCat、OneBot 或任何聊天 API。

插件只声明 outputs，由平台决定：

- 图片是否发送；
- 是否 @ 用户；
- 是否进入会话归档；
- 是否扣额度；
- 是否展示 caption。

QQ Bridge 只保留沟通能力语义：

```text
群聊要 @
回复带当前发送者
图片通过平台发送
非图片不自动发
```

## 11. 安全要求

插件 MUST：

- 输出路径限制在工作区；
- 不在提示词、错误、日志中放密钥；
- 不读取工作区外文件，除非平台显式授权；
- 不把用户输入拼进 system prompt；
- 不自行重试或递归生成；
- 对可恢复操作提供稳定 `operation.id`；
- 声明所需权限，按最小权限运行。

平台 MUST：

- 校验路径、MIME、大小；
- 拒绝未知 `pluginApi` 主版本；
- 对未知插件字段忽略而不是崩溃；
- 对不合规插件降级为“仅聊天能力”，不自动交付媒体。

## 12. 沟通能力示例：QQ Bridge

```json
{
  "dsh": {
    "pluginApi": "1.1",
    "capabilities": [
      {
        "id": "communication.qq",
        "kind": "communication",
        "title": "QQ 沟通",
        "effects": ["network", "external_effect"],
        "permissions": ["communication"],
        "prompts": ["./prompts/qq-transport.md"],
        "bind": { "tool": "qq.send" },
        "delivery": ["image"]
      }
    ]
  }
}
```

它不应该声明 `image.generate`，也不应该读取 image-gen 的 `savedTo`。

## 13. 兼容旧插件

旧插件可能只返回：

```json
{ "savedTo": "...", "cost": { "total": 14 } }
```

或旧清单：

```json
{ "dsh": { "tools": [...] } }
```

平台 MAY 通过适配层读取，但属于遗留兼容，不算合规。

新插件 MUST：

- 使用 `capabilities`；
- 提示词放在 capability；
- 工具结果使用 `meta.dsh`；
- 不依赖平台识别私有字段。

## 14. 验证清单

- [ ] `dsh.pluginApi` 为 `1.x`
- [ ] 至少一个 `capabilities`，`id` / `kind` 合法
- [ ] `action` / `communication` 能力有 `bind`
- [ ] prompt frontmatter 合法，且属于能力
- [ ] 媒体输出在 `meta.dsh.outputs`
- [ ] 路径在工作区内
- [ ] 错误使用标准 `code`
- [ ] 可恢复操作提供 `operation.id` / `resume`
- [ ] `retry.maxAttempts` 不超过 1
- [ ] 不在提示词/错误中泄露密钥
- [ ] 不直接调用 QQ/NapCat/OneBot

## 15. 当前迁移状态

- 本规范是 v1.1 目标接口。
- QQ Bridge 已移除 `qq:visual-design` 和 image-gen 专属重试提示，只保留 QQ 传输 prompt。
- 通用失败策略与创作策略在 `src/platform/prompts/`。
- 通用媒体交付在 `src/platform/delivery.js`，QQ mention 由通信层注入。
- image-gen 目前仍返回 `savedTo` / `cost.total`，由 `src/platform/plugin-adapter.js` 兼容。
- 平台侧 capability 加载器/完整校验器尚未接上宿主；当前已接入结果适配与分类器。

## 16. 未适配插件的运行时分类

平台不能要求所有现存插件立即改代码，因此运行时先做保守分类。

参考实现：[src/platform/plugin-adapter.js](../src/platform/plugin-adapter.js)。

### 16.1 分类结果

| level | 条件 | 平台行为 |
|---|---|---|
| `native` | 有 `capabilities` | 信任声明，正常加载 |
| `legacy-tools` | 只有 `tools` | 推断能力，按需人工复核 |
| `knowledge-only` | 只有 `prompts`/`skills` | 注入知识，不执行工具 |
| `unknown` | 什么也没有 | 观察模式，不自动交付 |

分类器不会猜测插件名字，只使用清单和工具名中的通用动词。

### 16.2 推断规则

```text
send/message/reply/notify/mail/qq  → communication
read/get/list/search/fetch/browse  → perception
generate/edit/draw/render/write    → action
memory/archive/history/session      → memory
skill/prompt/guide/knowledge        → knowledge
```

同时推断：

- `outputs`：工具名含 image/draw/render 或显式 `outputs`
- `effects`：`read`、`write`、`network`、`exec`、`cost`、`external_effect`
- `permissions`：`image`、`exec`、`communication`
- `bind`：原工具名

推断出的 capability 标记：

```json
{
  "inferred": true,
  "confidence": "high|medium|low",
  "requiresReview": true
}
```

以下情况必须人工复核，平台不应自动信任：

- `exec`
- `network`
- `external_effect`
- 低置信度工具

### 16.3 旧结果适配

旧插件结果：

```json
{ "savedTo": "E:\\ws\\image.jpg", "cost": { "total": 14 } }
```

运行时归一化为：

```json
{
  "source": "legacy",
  "outputs": [
    { "kind": "image", "path": "E:\\ws\\image.jpg", "mime": "image/jpeg" }
  ],
  "cost": { "amount": 14, "unit": "buzz" }
}
```

原生 `meta.dsh` 优先；旧字段只在缺失时作为迁移兼容。

### 16.4 接入方式

```js
import { createPluginAdapter } from './platform/plugin-adapter.js'

const adapter = createPluginAdapter(packageJson, { pluginId: packageJson.name })

// 按工具名找到推断出的能力
adapter.capabilityForTool('generate_image')

// 运行时归一化工具结果
const normalized = adapter.normalizeResult(toolResult.meta)
```

平台根据 `level` 和 `requiresReview` 决定：

- `native`：直接使用；
- `legacy-tools`：可加载，但危险效果先复核；
- `knowledge-only`：只加载 prompt；
- `unknown`：只记录，不自动发图、不扣费。

### 16.5 边界

- 分类器不是安全沙箱；它只是把未知插件降级到可观察、可控的路径。
- 推断出的 `effects` 只能用于审批提示，不能替代真实权限检查。
- 旧插件即使被适配，也仍然不算符合 v1.1；适配层是迁移桥。
