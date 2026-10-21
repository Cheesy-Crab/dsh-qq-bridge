# QQ ↔ DSH 多工作区对接插件 · 设计大纲 v2.1

> 定位：一个 QQ 机器人作为服务端入口，按 QQ 身份做权限分级；私聊时每个客户端 QQ 管理自己的工作区，群聊时每个群拥有一个专属工作区；普通消息即对话，定制指令管理工作区与会话；服务器主（L3）可控制所有工作区。本地 Windows 起步，同一套代码需能部署到 Linux 服务器。

## 0. 已确认的决策

| 项 | 决定 |
|---|---|
| 权限分级 | 四级：L0 访客 / L1 用户 / L2 高级 / L3 管理员 |
| 访客策略 | 未绑定也可只读对话，落在 guest 沙箱工作区 |
| 工作区可见性 | 注册进 DSH workspace 注册表，管理员在 GUI 侧栏可见 |
| 群聊模型 | 每个群一个专属工作区 + 一个全群共享会话；与私聊工作区隔离 |
| 接入路线 | NapCat / OneBot 11 起步，官方机器人后续加适配器 |
| 目录根 | 默认 Windows `E:\QQdsh`；其他平台 `${DSH_HOME}/qq-workspaces` |
| 部署形态 | 本地 Windows 起步，同一套代码可部署 Linux 服务器 |

> 全部决策已确认。群工作区采用全群共享会话。
>
> 进度：M0 ✅（骨架、路径层、四接缝）、M1 ✅（OneBot 反向 WS、回显、去重、重连）、M2 ✅（私聊 → 工作区会话 → 模型回复）、M3 ✅（持久化、指令层、工作区/会话切换）、M4 ✅（权限分级、绑定、配额、审批桥）、M5 ✅（群工作区、共享会话、@ 触发；图片顺延）、M6 🚧（CI、Linux 部署文档、systemd；官方适配待凭据）。

## 1. 权限模型

| 级别 | 名称 | 典型对象 | 核心能力 |
|---|---|---|---|
| L0 | 访客 guest | 未绑定/临时用户 | 私聊 guest 沙箱只读对话；群里对群工作区只读 |
| L1 | 用户 user | 绑定后的客户端 QQ | 个人工作区：建/切/改名/归档；对话与写自己的文件 |
| L2 | 高级 trusted | 可信成员 | L1 + 更高配额 |
| L3 | 管理员 admin | 服务器主 | 所有工作区（个人与群）可读写/切换/归档；用户与权限管理；审计 |

**能力矩阵**

| 能力 | L0 | L1 | L2 | L3 |
|---|---|---|---|---|
| 私聊普通对话 | ✅（guest 沙箱） | ✅ | ✅ | ✅ |
| 切换自己的个人工作区 | ❌ | ✅ | ✅ | ✅ |
| 新建个人工作区 | ❌ | ✅（默认 3） | ✅（默认 10） | ✅（不限） |
| 改名/归档自己的个人工作区 | ❌ | ✅ | ✅ | ✅ |
| 进入任意工作区 | ❌ | ❌ | ❌ | ✅ |
| 在群工作区对话 | ✅（只读） | ✅ | ✅ | ✅ |
| 写文件 / 执行命令类工具 | ❌ | ✅（限个人工作区或所在群工作区） | ✅ | ✅（按配置） |
| 群内新开/重置会话（`/new` `/reset`） | ❌ | ❌ | ❌ | ✅ |
| 群内中断当前轮次（`/stop`） | 发起者 | 发起者 | 发起者 | ✅ |
| 归档群工作区 | ❌ | ❌ | ❌ | ✅ |
| 用户管理 / 授权 | ❌ | ❌ | ❌ | ✅ |
| 审计与全局状态 | ❌ | ❌ | ❌ | ✅ |

实现：能力检查集中在一个 `authorize(user, capability, target)`；指令声明所需能力，工具白名单走同一张表。

## 2. 工作区模型

### 2.1 两类工作区

| | 个人工作区 | 群工作区 |
|---|---|---|
| owner | `user:<openid>` | `group:<group_openid>` |
| 数量 | 按级别配额 | 每群固定 1 个（首次 @ 自动创建） |
| 目录 | `<root>/u-<ownerHash8>/<wsSlug>/` | `<root>/g-<groupHash8>/` |
| 谁能用 | 仅 owner（L3 可进入） | 该群成员（按级别限读写） |
| 注册名 | `qq/<昵称>/<工作区>` | `qq/群-<群名或群号>` |
| `/ws` 指令 | 完整可用（私聊） | 仅 `/ws info`；建/切/改名/归档走私聊或管理员 |

- 私聊消息只操作个人工作区；群聊消息只操作该群的群工作区。两条线互不串。
- 工作区路径规范化后必须落在 `<root>` 下，拒绝 `..` 与符号链接逃逸。
- 工作区名在 owner 内唯一；全局 id 用短随机串，指令里可用“序号或名称”指代。
- 路径只放短哈希 + ASCII slug，用户可见名称存元数据；唯一性按 NFKC + 小写比较，字符集取 Windows 最严限制（见 §11.1）。

### 2.2 切换语义
- “切换工作区”不是改当前会话的 cwd，而是把该身份的 **activeWorkspace** 指向目标工作区，并在其中创建/恢复会话。
- 私聊：每个 QQ 记住自己的 `activeWorkspaceId + activeSessionId`。
- 群聊：每个群记住自己工作区的共享会话（key 为 `group:<gid>`），工作区固定。
- 同一工作区被多人触达时（群共享、管理员进入），按工作区加**轮次锁**串行执行，避免并发改文件。

### 2.3 群工作区细则
- 首次收到该群 @ 时创建并注册；群名变更不回改工作区名，可用 `/admin ws rename` 手动改。
- 每个群工作区只有 **一个全群共享会话**：上下文连续、接话自然；代价是多人信息混在一起，属于聊天场景可接受的取舍。
- 群内 `/new` `/reset` 仅 L3 可用（会影响所有人）；`/stop` 允许当前轮次发起者或 L3 使用。
- 同一群同时只跑一个轮次，消息按到达顺序排队；回复自动 `@发送者`，一条一轮。
- 群工作区归档/删除仅 L3；归档后群消息提示“该群工作区已归档”。

## 3. 指令系统

### 3.1 解析规则
- 前缀可配（默认 `/`，兼容 `#`）。
- 私聊：`/` 开头即指令，其余当对话。
- 群聊：必须先 @机器人；@ 后 `/` 开头为指令，否则为对话（可配禁用群对话）。
- 未知指令只提示 `/help`，不喂给模型。

### 3.2 指令清单（括号内为适用范围）

**通用**
```
/help [指令]        按级别过滤显示
/whoami             我的 openid / 级别 / 当前工作区 / 当前会话（私聊、群）
/status             连接、队列、配额
```

**个人工作区（私聊，L1+）**
```
/ws list            我的工作区（序号、名称、会话数、最后活跃）
/ws new <名称>      新建并设为当前
/ws use <序号|名称> 切换
/ws info            当前工作区详情
/ws rename <名称>
/ws archive         归档（软删除）
/ws restore <名称>
```

**会话（私聊，L1+）**
```
/new                在当前工作区新开会话
/sessions           当前工作区的会话列表
/use <序号>         切换会话
/reset              重置当前会话
/stop               中断当前轮次
```

**会话（群，共享）**
```
/whoami /status     同上
/stop               中断当前轮次（发起者或 L3）
/new /reset         仅 L3：会影响全群
```

**群工作区**
```
/ws info            群工作区详情（路径、创建时间、会话数）
```

**绑定（L0→L1）**
```
/bind <配对码>      配对码由管理员生成或 GUI 显示，5 分钟过期
```

**管理（L3）**
```
/admin users                     用户列表（级别、配额、状态）
/admin grant <openid> <L0-L3>
/admin revoke <openid>
/admin freeze <openid>
/admin ws list [--all]           所有工作区（个人 + 群，含 owner）
/admin ws use <owner> <名称>     进入任意工作区
/admin ws archive <owner> <名称>
/admin quota <openid> <key> <n>
/admin audit [n]
/admin reload
```

### 3.3 指令框架
- 注册表：`{ name, aliases, level, scope: 'private'|'group'|'both', usage, handler }`。
- `/help` 按级别 + 场景过滤生成。
- 参数解析只做空格分词 + 引号。
- handler 返回结构化结果（文本/错误码），由 outbox 统一分段、加 @。

## 4. 数据模型

```ts
users:      { openid, level, nickname, status, createdAt, limits }
workspaces: { id, ownerType: 'user'|'group', ownerId, name, relPath,
              createdAt, archived, registered }
sessions:   { sessionId, workspaceId, ownerScope: 'user'|'group', ownerId,
              title, lastActiveAt }
active:     { scopeKey, openid?, workspaceId, sessionId }
            // scopeKey: "private:<openid>" 或 "group:<gid>"
bindings:   { code, openid, expiresAt }
audit:      { at, openid, scope, action, target, result }
dedupe:     { eventId → at }     // 保留 7 天
outbox:     { id, chat, payload, attempts, nextAt }
```

- 存储：`$DSH_HOME/storages/qq-bridge/`，按表分文件，原子写（临时文件 + rename）。
- 工作区只存相对 `workspacesRoot` 的 `relPath`（`/` 分隔），绝对路径运行时拼接；换机器时按 relPath 重新注册进 DSH。
- 审计只追加；日志里 openid 脱敏显示后四位。

## 5. 运行时架构

```
QQ ⇄ NapCat/官方网关 ⇄ Transport ⇄ Inbox ─┬─ 指令解析 → 权限 → handler
                                          └─ 对话 → 选上下文(私聊/群) → 选会话 → agent.followup
                                                                         ↓
                                       Outbox ← 事件聚合 ← agent/assistant-stream、session/event
                                          ↑
                                    审批桥（approval/request waterfall）
```

- **Transport**：OneBot（正/反向 WS）、官方适配、fake；统一 `QqTransport` 接口。
- **Inbox**：去重、限流、按用户串行、按工作区轮次锁。
- **Router**：私聊 `openid → 个人 active`；群聊 `group → 群工作区 → 该群唯一共享会话`。
- **Outbox**：分段、@ 回复、重试、保序。
- **Approval**：注册 `approval/request` 应答者，按会话路由到对应 QQ；超时拒绝；L0 会话设 `never`。

## 6. 安全与隔离

- **路径**：工作区路径必须落在 `<root>` 下；规范化 + 前缀校验 + 拒绝软链。
- **身份**：openid 由 QQ 提供，不可伪造；`/admin` 加二次确认码，可配。
- **工具**：按级别给工具允许列表；L0 只读；L1 限本工作区；L3 按配置。
- **群**：只响应 @；全群操作同一个共享会话，回复标注发送者；群工作区文件对群成员可见，文档写明。
- **配额**：每人工作区数、每日 turn、单条长度、全局并发 turn。
- **删除**：只归档，真删除需 L3 二次确认。

## 7. 插件工程

```
dsh-qq-bridge/
├── package.json            # dsh.bundle.patch
├── cordis.patch.yml
├── src/
│   ├── index.ts            # apply / inject / Config
│   ├── config.ts
│   ├── service.ts          # QqBridgeService
│   ├── auth/{levels,bind}.ts
│   ├── transport/{types,onebot,official,fake}.ts
│   ├── workspace/{registry,resolver}.ts   # 注册表对接 + 名称/序号解析 + 路径安全
│   ├── link/{inbox,outbox,router}.ts
│   ├── commands/{index,ws,session,group,admin,help}.ts
│   ├── agent/{submit,approval}.ts
│   ├── format.ts
│   └── store.ts
├── test/
└── README.md
```

- host-only，不声明 `dsh.client`；后续 GUI 面板再加 client。
- `inject` 初定：`['agent', 'workspaceController', 'approval']`，M0 取证签名。
- 所有 socket/timer/listener/route 用 `ctx.effect` 管理，卸载可清理。

**配置草案**

```yaml
workspacesRoot: "${DSH_HOME}/qq-workspaces"   # 默认：Windows 为 E:\QQdsh，其他平台为 ${DSH_HOME}/qq-workspaces
guestWorkspace: "${workspacesRoot}/_guest"
registerToDsh: true
transport:
  kind: onebot
  onebot: { mode: reverse, listen: "127.0.0.1:6700", accessTokenEnv: QQ_ONEBOT_TOKEN, selfId: "..." }
access:
  admins: ["<openid>"]
  bindCodeTtlMinutes: 5
defaults:
  autoProvision: true              # L1 首次私聊自动建默认工作区
limits:
  maxWorkspaces: { L1: 3, L2: 10, L3: 0 }
  dailyTurns: { L0: 20, L1: 200, L2: 1000, L3: 0 }
  maxChars: 1800
group:
  enabled: true
  autoCreateWorkspace: true        # 首次 @ 自动建群工作区
  sessionScope: shared             # shared（默认）| per-sender（预留）
  allowChat: true                  # 群里是否允许普通对话
  replyWithMention: true
approval:
  timeoutSec: 120
  default: deny
```

## 8. 里程碑

| 阶段 | 内容 | 验收 |
|---|---|---|
| M0 ✅ | 骨架 + API 取证（workspace 创建/会话创建/审批应答者/工具门控）+ 跨平台路径层 | 插件可装、`--dump-config` 可见；四个接缝各有最小 demo；Windows/Linux 单测矩阵通过 |
| M1 ✅ | Transport + 回显 + 去重/重连 | 私聊/群聊回显；断线重连不重复 |
| M2 ✅ | 私聊单工作区文本闭环 | L1 对话；目录落盘；重启恢复 active |
| M3 ✅ | 工作区注册 + 指令框架 + 切换 | `/ws new/use/list`、`/new`、`/use`；注册表可见 |
| M4 ✅ | 权限分级 + 隔离 + 配额 + 管理指令 | L0/L1/L3 行为可测；路径逃逸被拒；`/admin` 全链路 |
| M5 ✅ | 群工作区（每群一个 + 共享会话）+ 审批桥（图片顺延） | 群里按发送者分会话；共享文件串行；审批可回复 |
| M6 🚧 | 官方适配 + 打包发布 | CI 双平台通过、Linux 部署文档与 systemd 就绪；官方沙箱待凭据 |

## 9. 风险

| 风险 | 对策 |
|---|---|
| 跨用户越权/路径逃逸 | 单一 `authorize` + 路径规范化 + 拒绝软链 |
| 群工作区文件冲突 | 工作区轮次锁 + 排队提示 |
| 群共享会话被带偏/误重置 | `/new` `/reset` 限 L3；审计记录发起人 |
| 群里串台/泄露 | 共享会话中按发送者标注 + 回复 @ 发送者 + 文档说明群内可见 |
| 提示注入诱导 L0 执行工具 | L0 只读 + 工具白名单 + 审批 fail-closed |
| 侧栏被大量工作区淹没 | 命名规范 + 归档 + 配额 |
| NapCat 变更/封号 | 锁定版本；连接可观测；对外用官方 |
| 管理员账号被盗 | `/admin` 二次确认码 + 审计 |
| 群工作区无限增长 | 每群 1 个 + 归档清理策略 |
| Windows 路径长度/保留字与 Linux 大小写敏感 | 短哈希目录 + NFKC 小写判重 + 取最严字符集 |
| 服务器托管（开机自启、崩溃重启、双开） | systemd unit 示例 + 文件锁 + SIGTERM 清理 |

## 10. 决策记录

| 项 | 决定 |
|---|---|
| 权限分级 | L0 访客 / L1 用户 / L2 高级 / L3 管理员 |
| 访客 | 可只读对话，落 guest 沙箱工作区 |
| 工作区可见性 | 注册进 DSH 注册表，GUI 侧栏可见 |
| 私聊工作区 | 每人独立，按级别配额 |
| 群工作区 | 每群一个，按群号归属 |
| 群会话 | 全群共享一个，聊天场景优先上下文连续 |
| 群内重置/新建 | 仅 L3，避免单人影响全群 |
| 群内中断 | 当前轮次发起者或 L3 |
| 接入路线 | NapCat / OneBot 11 起步 |
| 目录根 | 默认 Windows `E:\QQdsh`；其他平台 `${DSH_HOME}/qq-workspaces` |
| 部署形态 | 本地 Windows 起步，同一套代码可部署 Linux 服务器 |

## 11. 跨平台与部署

### 11.1 路径与命名（可移植）
- 代码里不出现绝对路径。`workspacesRoot` 默认 Windows 为 `E:\QQdsh`、其他平台为 `${DSH_HOME}/qq-workspaces`，服务器上无需配置。
- 目录用短哈希，避开中文、长名和 Windows 260 字符上限：
  - 个人：`<root>/u-<ownerHash8>/<wsSlug>/`
  - 群：`<root>/g-<groupHash8>/`
- 用户可见名称只存元数据，不进路径；指令按“名称/序号”解析回 id。
- 唯一性 key = `NFKC(name).toLowerCase()`：Windows 大小写不敏感、Linux 敏感，统一按小写判重，避免 `A`/`a` 在两套系统上行为不同、迁移后重名。
- 命名取 Windows 最严限制，保证两边都能落盘：禁止 `\ / : * ? " < > |`、控制字符、结尾点或空格、`CON/PRN/AUX/NUL/COM1-9/LPT1-9`；单段 ≤ 64 字符；最终生成 ASCII slug，加 `-<hash6>` 兜底。
- 所有路径先 `realpath` 再校验以 root 为前缀；软链和 Windows junction 一律视为逃逸。

### 11.2 数据可迁移
- store 只存 `relPath`（相对 root，统一 `/`），绝对路径运行时拼接。
- DSH 注册表里是绝对路径，属于 host 本地状态；换机器按 `relPath` 重新注册，或提供 `/admin ws repair` 重建。
- 时间统一 UTC ISO8601，展示按配置时区；不依赖本地化标题做业务键。

### 11.3 进程与托管
- 插件不自建守护进程，随 DSH 启停；不 shell out 到 PowerShell/cmd，只用 Node API。
- Linux：systemd unit 示例（`Restart=always`、`EnvironmentFile` 放 token、权限 `0600`、专用 `dsh` 账号）；Windows：计划任务/NSSM 或直接跑桌面端。
- 处理 `SIGTERM`/`SIGINT`：先停入站 → 取消在途轮次 → 关连接 → 落盘 mapping/outbox。
- 单实例：同一 `DSH_HOME` 只允许一个进程连同一个 QQ 号（启动文件锁 + 存活检测），防双开抢消息。
- 日志 JSON lines 到 stdout（systemd journal 友好），可选文件；不写平台特有路径。

### 11.4 NapCat 两种部署
- Windows：NapCat.Shell，反向 WS 连 `ws://127.0.0.1:6700`。
- Linux：官方 Docker 镜像（挂配置卷、映射端口），或 Linux QQ + NapCat；插件只认 WS URL/token，不感知平台。
- 默认只监听 `127.0.0.1`；跨机才改 `0.0.0.0`，并强制 token + 防火墙。
- 断线指数退避重连，状态进 `/status`。

### 11.5 官方机器人（服务器场景）
- 回调需要公网 HTTPS：Caddy/nginx 反代到 DSH 的 webhook 路由，证书自动续期。
- 主动消息配额、群内必须 @ 的限制在发送层做节流，不能靠调用方自觉。

### 11.6 权限与隔离
- Linux 每个用户目录 `0700`，服务用专用账号；Windows ACL 尽力而为。
- OS 权限只是兜底：agent 与服务同用户运行，真正的边界靠工具策略 + 工作区根校验（§6）。

### 11.7 CI
- GitHub Actions matrix：`ubuntu-latest` + `windows-latest`，跑 store/路径/命名/指令单测；NapCat 端到端只挑一个 OS。
- 测试禁止写死盘符、家目录、大小写假设。

## 12. 参考

- 工作区控制：`packages/api/workspace-controller`（创建/重命名/移除、会话归属）
- 审批 seam：`docs/subsystems/approval.zh.md`（`ctx.approval`、`approval/request` waterfall）
- Agent 轮次与事件：`docs/agent-lifecycle.md`（`followup`、`session/event`、`assistant-stream`）
- 插件契约：<https://github.com/NanmiCoder/dsh-agent-teams/blob/main/.dsh/skills/dsh-plugin-development/SKILL.md>
- 官方文档镜像：<https://github.com/Pasumao/dsh-plugin-dev-kb>
