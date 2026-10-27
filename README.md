# dsh-qq-bridge

QQ ↔ DSH 工作区对接插件：让 QQ 成为 DSH 工作区的远程入口。每个客户端 QQ 管理自己的工作区，每个群有专属工作区，普通消息即对话，`/` 开头为指令。

当前进度：**M0–M6 已完成**；图片收发、内置 NapCat、会话归档、能力白名单均已实现。官方 QQ 机器人适配仍需开放平台凭据。

架构说明见 [docs/architecture.md](docs/architecture.md)：工作区对接域、agent 行为扩展域、QQ 适配层与运行支撑层。

平台插件接口规范见 [docs/plugin-interface.md](docs/plugin-interface.md)，机器可读 schema 在 [schemas/](schemas/)；平台核心边界见 [docs/platform-core.md](docs/platform-core.md)，独立仓库为 https://github.com/Cheesy-Crab/dsh-platform-core；会话核心独立仓库为 https://github.com/Cheesy-Crab/dsh-session-core。外部平台/插件边界结论见 [docs/adr/0001-external-platform-boundary.md](docs/adr/0001-external-platform-boundary.md)。

## 安装（DSH Desktop 推荐）

DSH Desktop 侧边栏 **插件 → 添加插件 → 安装第三方插件**，填 GitHub 地址：

```
https://github.com/Cheesy-Crab/dsh-qq-bridge.git#v0.46.1
```

仓库是 public。也可以填本地小包目录：

```
dist\dsh-qq-bridge-0.36.0-package
```

安装并启用 `dsh-qq-bridge`，重启 Desktop，然后在 **设置 → QQ Bridge** 按向导完成：
下载 NapCat、设置管理员、启动、扫码。默认直接使用 DSH 当前登录账号，不需要 API Key。

NapCat 不需要打进插件包，设置页的 **下载** 按钮会把它装到
`%USERPROFILE%\.dsh\qq-bridge\napcat`。只有完全离线时才需要 118MB 完整包。

不需要 qqweb，也不用手写 profile 配置。完整步骤见
[docs/deploy-windows.md](docs/deploy-windows.md)。

## 安装（旧版 qqweb / 开发模式）

```powershell
dsh plugin --profile qqweb add E:\dsh\工作区对接QQ
```

安装后重启目标 profile，`dsh --profile qqweb --dump-config` 应能看到：

```yaml
- id: qq-bridge
  name: dsh-qq-bridge
```

## M1 联调（不需要真的 NapCat）

1. 启动 profile：

   ```powershell
   dsh web
   ```

2. 另开一个终端，用自带假客户端连上去：

   ```powershell
   $node = 'E:\dsh\resources\runtime\primary-runtime\dependencies\node\bin\node.exe'
   & $node scripts\fake-napcat.mjs ws://127.0.0.1:6700/
   ```

3. 期望结果：

   ```
   [fake-napcat] connected to ws://127.0.0.1:6700/
   [fake-napcat] action={"action":"send_private_msg","params":{"user_id":10001,...},"echo":"..."}
   [fake-napcat] redelivering the same message_id (must be ignored)
   [fake-napcat] echoes=1 -> OK
   ```

   同时插件日志里应有 `onebot client connected`、`echoed private:10001 (...)`、`duplicate message skipped: ...`。

4. 换成真 NapCat：在 NapCat 里加一个「WebSocket 反向连接」，URL 填 `ws://127.0.0.1:6700/`，token 与 `QQ_ONEBOT_TOKEN` 环境变量一致（不设 token 则不校验）。

## M2 对话链路

私聊消息现在会真正进入工作区：

1. 按 QQ 号在 `E:\QQdsh\u-<hash8>\default-<hash6>` 建或复用工作区，并注册进 DSH；
2. 第一条消息创建 agent 会话（`sess-qq-...`），之后的消复用同一个；
3. 同一个 QQ 的消息排队，一次只跑一个 turn；
4. 回复按 `limits.maxChars` 分段发回；turn 失败或超时会回一条错误说明。

审批策略固定为 `never`：M4 之前不弹审批，需要审批的工具会被拒绝（fail-closed）。

## M3 指令与持久化

聊天状态保存在 `~/.dsh/storages/qq-bridge/state.json`：当前工作区、当前会话，以及每个工作区上次用的会话。插件重启后会 `agents.resume()` 续聊；恢复失败会回退建新会话。

指令（私聊，`/` 开头）：

| 指令 | 说明 |
|---|---|
| `/help` | 可用指令 |
| `/whoami` | QQ、工作区、路径、会话、额度、排队 |
| `/quota` | 查看个人额度；群里显示本群共享额度 |
| `/status` | 连接、聊天数、去重表、根目录 |
| `/ws list` | 我的工作区 |
| `/ws new <名称>` | 新建工作区并切过去 |
| `/ws use <序号\|名称>` | 切换工作区（复用该工作区上次的会话） |
| `/ws info` | 当前工作区详情 |
| `/ws rename <名称>` | 重命名当前工作区（目录不变） |
| `/ws delete <序号\|名称>` | 移除工作区登记（目录和会话历史保留） |
| `/new [名称]` | 在当前工作区新开会话，可命名 |
| `/reset [名称]` | 重置为新会话（等同 `/new`） |
| `/rename <名称>` | 给当前会话命名 |
| `/sessions` | 当前工作区的会话列表（显示名称） |
| `/archive [名称\|序号]` | 归档会话，从列表隐藏，可恢复 |
| `/unarchive <名称\|会话id>` | 恢复已归档会话 |
| `/archived` | 已归档会话列表 |
| `/screenshot` | 截取当前屏幕并发送到 QQ（L3） |
| `/sendimage <路径>` | 发送工作区里的图片（L3） |
| `/use <序号\|名称>` | 切换会话 |
| `/stop` | 中断当前回合 |

## M4 权限与审批

**等级**：L0 访客 / L1 用户 / L2 高级 / L3 管理员。管理员在 profile 配置里指定：

```yaml
- id: qq-bridge
  config:
    access:
      admins: ['10001']
```

- L0 只能只读对话：落在 `E:\QQdsh\_guest`，写文件/执行命令类工具被 `tools.restrict` + `guard` 双重拦截，且审批直接拒绝。
- L1+ 使用自己的工作区；L0 不能执行 `/ws`、`/new` 等会话指令。
- `/bind <配对码>` 绑定；管理员用 `/admin invite <等级>` 生成 5 分钟有效的一次性配对码。
- 配额：`limits.maxWorkspaces` 限制每人工作区数量，`limits.dailyTurns` 限制每日模型轮次。
- L1+ 的会话审批策略为 `ask`：需要审批的工具会发 QQ 消息「回复 1 允许，2 拒绝」，只认发起人，超时或拒绝都 fail-closed。

管理员指令：

| 指令 | 说明 |
|---|---|
| `/admin users` | 用户、等级、状态、今日轮次 |
| `/admin invite [L0-L3]` | 生成配对码（默认 L1） |
| `/admin level <openid> <L0-L3>` | 调整等级 |
| `/admin freeze <openid>` / `/admin unfreeze <openid>` | 冻结/解冻 |
| `/admin ws list` | 全部工作区（跨用户） |

## M5 群工作区

- 每个群一个专属工作区：`E:\QQdsh\g-<hash8>`，标题 `QQ Group <群号>`。
- 全群共享一个会话，上下文连续；重启后按群恢复。
- 群里必须 @机器人 才响应；不 @ 的消息直接忽略。
- 回复自动带 `@发送者`，只回复最近一条消息的发送者。
- 群内指令限制：`/ws info` 可用；`/new`、`/reset` 仅 L3；`/sessions`、`/use`、`/ws list|new|use` 不可用。
- 群聊不需要 `/bind`；加进群即可使用，每条消息带 `[QQ:<QQ号>]` 前缀供 agent 区分成员。
- 每个群使用一个主体 `group:<群号>`，共享一份等级、能力和生图额度；成员个人等级不参与群权限。
- 群主体配置示例（私聊管理员执行）：
  ```text
  /admin level group:987654321 L3
  /admin allow group:987654321 image
  /admin quota group:987654321 100
  ```
- 审批请求会 @ 发起人，只有发起人能回 1/2。

## 手册

- [使用手册（QQ 用户）](docs/manual-user.md)：怎么和机器人聊天、指令、工作区、群聊、权限、审批。
- [管理手册（部署者）](docs/manual-admin.md)：部署、启动停止、管理员与配对码、配置、排障、备份、升级。

## Windows 另一台电脑部署

见 [docs/deploy-windows.md](docs/deploy-windows.md)：建 profile、装插件（私有仓库鉴权或路径安装）、配管理员与 key、接 NapCat、开机自启。

## Linux 部署

完整步骤见 [docs/deploy-linux.md](docs/deploy-linux.md)，包含：

- DSH 与插件的安装、profile 配置；
- key 文件权限（`chmod 600`）与目录规划；
- NapCat Docker（host 网络 + 反向 WS）；
- systemd 单元 [systemd/dsh-qq-bridge.service](systemd/dsh-qq-bridge.service)；
- 升级与验收。

CI 在 `ubuntu-latest` 和 `windows-latest` 上跑同一套单测：[.github/workflows/ci.yml](.github/workflows/ci.yml)。

发布前检查与推送步骤见 [docs/release-checklist.md](docs/release-checklist.md)，版本历史见 [CHANGELOG.md](CHANGELOG.md)，未完成事项见 [TODO.md](TODO.md)。

## 图片收发

- 入站：QQ 里的图片会下载到当前工作区 `attachments/incoming/qq-*.jpg|png`，并把
  `[图片已保存] 路径` 追加到消息里；agent 可以用 `read_image` 或脚本继续处理。
  模型能否“看懂”图片取决于它是否支持视觉输入。
- 出站：
  - agent 用 `present` 展示图片时，自动转发到对应 QQ 会话；
  - L3 可用 `/screenshot` 抓整个桌面；
  - L3 可用 `/sendimage <路径>` 发送工作区里的任意图片。
- 非图片文件（pdf、zip 等）不会自动转发，仍然只发文字说明。

## 内置 NapCat

项目支持把 NapCat Shell 作为本地运行时放进 `vendor/napcat`，由插件自动启动和守护：

```yaml
- id: qq-bridge
  config:
    napcat:
      enabled: true
      autoStart: true
      args: ['-q', '123456789']   # 快速登录；首次仍需扫码
```

- `vendor/napcat` 不进 Git（345MB，含 QQNT 二进制），用 `scripts/install-napcat.ps1` 填充；
- 插件启动时若没有 OneBot 客户端连接，就拉起 `vendor/napcat/napcat.bat`；
- 已有外部 NapCat 连接时不会重复启动，也不会杀外部进程；
- 进程异常退出按 `restartDelayMs` 自动重启；插件停止时结束它；
- QQ 指令：`/napcat status|start|stop|restart|qr`；
- `scripts/bundle.ps1` 可把源码 + `vendor/napcat` 打成一个发布 zip。

## DSH Desktop 一键部署

推荐把**完整插件**装进 DSH Desktop，让 Desktop 自己跑 bridge + NapCat，不再需要
qqweb 或浏览器页面。安装前先停掉 qqweb，避免同一个 QQ 号/6700 端口冲突。

1. Desktop 侧边栏 **插件 → 添加插件 → 安装第三方插件**；
2. 输入本地绝对路径 `E:\dsh\工作区对接QQ`；
3. 安装并启用 `dsh-qq-bridge`，重启/刷新 Desktop；
4. 打开 **设置 → QQ Bridge**，按页面顺序操作：
   - **NapCat 路径**：已有 NapCat 点「选择目录」或粘路径回车；没有就点右侧「下载」；
   - **保存 API Key**；
   - **设置管理员 QQ**；
   - **启动**，点 **显示二维码** 扫码登录。

NapCat 默认安装到 `%USERPROFILE%\.dsh\qq-bridge\napcat`，不随插件仓库分发，所以
插件包本身很小。所有步骤都在 Desktop 设置页完成，不会再打开前台网页。

如果仍想保留 qqweb 后台 bot，只把 `packages/qq-bridge-ui` 装进 Desktop 作为遥控器；
它只含客户端 UI，通过 `http://127.0.0.1:3080/qq-bridge/*` 控制 qqweb。

## 配置

默认工作区根目录：Windows 是 `E:\QQdsh`，其他平台是 `${DSH_HOME}/qq-workspaces`。想改，在 profile 的 `cordis.patch.yml` 里按 id 覆盖：

```yaml
- id: qq-bridge
  config:
    workspacesRoot: E:\QQdsh
```

完整配置项见 [`src/core/config.js`](src/core/config.js)：

| 键 | 默认 | 说明 |
|---|---|---|
| `workspacesRoot` | Windows `E:\QQdsh`；其他平台 `${DSH_HOME}/qq-workspaces` | 支持 `${DSH_HOME}` 展开 |
| `guestWorkspaceName` | `_guest` | 访客沙箱目录名 |
| `defaultWorkspaceName` | `default` | 每个 QQ 的默认工作区名 |
| `stateFile` | `${DSH_HOME}/storages/qq-bridge/state.json` | 聊天/工作区/会话映射 |
| `commandPrefix` | `['/', '!', '#']` | 指令前缀，可配置字符串或数组；多字符前缀按最长匹配 |
| `agent.provider` / `agent.model` | `deepseek-account` / `deepseek-flash` | 默认使用 DSH 当前登录账号；API Key 模式设 `deepseek-official` |
| `agent.preset` | `standard` | agent preset（决定工具集，缺省会导致只有全局工具） |
| `agent.turnTimeoutMs` | `1800000` | 单轮超时（毫秒）；默认 30 分钟 |
| `agent.maxQueue` | `3` | 每个聊天最多排队的消息数 |
| `agent.followUp.enabled` | `true` | 是否投递“自动续跑轮”（子代理完成、后台任务回报触发的轮次） |
| `agent.followUp.pollMs` | `2000` | 续跑轮检测间隔（毫秒） |
| `agent.followUp.idleMs` | `1800000` | 轮次结束后继续等“自动续跑轮”的窗口（毫秒）；默认 30 分钟，与单轮超时对齐 |
| `sandbox.modeByLevel` | `L0 read-only`；`L1/L2 workspace-write`；`L3 danger-full-access` | 会话文件沙箱模式；L1/L2 有 write/exec 时保持 workspace-write |
| `access.admins` | `[]` | 管理员 openid 列表（L3） |
| `access.bindCodeTtlMinutes` | `5` | 配对码有效期 |
| `access.whitelist` | `{}` | 非 L3 的能力白名单，如 `{'123': ['workspace','read','write','exec','image']}` |
| `limits.maxWorkspaces` | `{L1:3, L2:10, L3:0}` | 每人工作区数，0 为不限 |
| `limits.dailyTurns` | `{L0:20, L1:200, L2:1000, L3:0}` | 每日模型轮次，0 为不限 |
| `approval.timeoutSec` | `120` | QQ 审批等待时间 |
| `questions.timeoutSec` | `1800` | QQ 提问等待时间；`0` 表示不限时 |
| `napcat.enabled` | `false` | 是否由插件管理内置 NapCat |
| `napcat.autoStart` | `false` | 插件启动时自动拉起 NapCat |
| `napcat.cwd` | `<plugin>/vendor/napcat` | NapCat 目录 |
| `napcat.args` | `[]` | 例如 `['-q','123456789']` 快速登录 |
| `napcat.restart` | `true` | 进程退出后自动重启 |
| `napcat.restartDelayMs` | `5000` | 重启间隔 |
| `apiKeyFile` | `${DSH_HOME}/deepseek-key.txt` | 启动时读取密钥的文本文件 |
| `apiKeyEnv` | `DEEPSEEK_API_KEY` | 读到的密钥写入哪个环境变量 |
| `registerToDsh` | `true` | 工作区是否注册进 DSH 注册表 |
| `selfTest` | `false` | 启动后跑四接缝自检 |
| `selfTestModel` | `deepseek-official` / `deepseek-flash` | 自检建 agent 用的路由 |
| `transport.kind` | `onebot` | `onebot` / `fake`（`official` 未实现） |
| `transport.echo` | `true` | M1 的回显开关，M2 接 agent 后移除 |
| `transport.onebot.host` | `127.0.0.1` | 反向 WS 监听地址 |
| `transport.onebot.port` | `6700` | 反向 WS 端口 |
| `transport.onebot.path` | `/` | `/` 接受任意路径；其他值精确匹配 |
| `transport.onebot.accessTokenEnv` | `QQ_ONEBOT_TOKEN` | 从该环境变量读 token；为空则不校验 |
| `group.sessionScope` | `shared` | 群会话粒度 |
| `limits.maxChars` | `1800` | 单条消息分段长度 |

## API Key 文件

插件启动时从文本文件读取模型密钥并写入 `DEEPSEEK_API_KEY`（不会写进配置或日志）。默认路径（`%USERPROFILE%` 是你的 Windows 用户目录，本机为 `C:\Users\雪之下雪奶酪`）：

```
%USERPROFILE%\.dsh\deepseek-key.txt
```

文件内容支持两种写法，任选其一：

```text
sk-你的key
```

```text
# 注释行会被忽略
DEEPSEEK_API_KEY=sk-你的key
```

规则：

- 环境变量里已经有 `DEEPSEEK_API_KEY` 时优先用环境变量，文件被忽略；
- 文件不存在只警告，不影响插件启动，但真实对话会报 `MISSING_CREDENTIAL`；
- 改 key 后需要重启 profile；
- 想放别处，在 profile 的 `cordis.patch.yml` 里覆盖 `apiKeyFile`：

```yaml
- id: qq-bridge
  config:
    apiKeyFile: E:\QQdsh\keys\deepseek.txt
```

## 自检（四接缝）

```powershell
$env:DSH_QQ_SELFTEST='1'
$env:DSH_QQ_BRIDGE_DEBUG='1'
dsh web
```

期望输出：

```
[qq-bridge] selftest PASS services
[qq-bridge] selftest PASS workspace.register
[qq-bridge] selftest PASS agent.create
[qq-bridge] selftest PASS approval.policy
[qq-bridge] selftest PASS tools.restrict
[qq-bridge] selftest PASS cleanup
[qq-bridge] selftest PASSED (6/6)
```

自检不会调用模型：只建工作区、建 agent、挂审批策略与工具限制，然后全部清理。

## 开发

```powershell
$node = 'E:\dsh\resources\runtime\primary-runtime\dependencies\node\bin\node.exe'
node --test          # 81 个用例：路径、配置、密钥、去重、OneBot、WS、会话路由、指令、存储、权限、审批、群聊
```

本地跑与 CI 完全相同的两步（会先把 DSH 自带的 node/pnpm 接进 PATH）：

```powershell
powershell -ExecutionPolicy Bypass -File scripts\ci.ps1
```

Linux 侧可以用 WSL 验证：把仓库复制到家目录（排除 `node_modules`），`pnpm install --frozen-lockfile && pnpm test`。

## 目录

```
src/
  index.js            Cordis 入口：配置、日志、生命周期、自检开关
  bridge.js           传输编排：去重 → 回显，未来接会话路由
  config.js           配置默认值与校验
  paths.js            跨平台路径层
  selftest.js         四接缝自检
  transport/
    onebot.js         OneBot 11 反向 WS：握手、token、收发、action 关联
    dedupe.js         message_id 去重（TTL + 容量）
    fake.js           测试/离线传输
scripts/
  fake-napcat.mjs     模拟 NapCat 的联调客户端
test/
  paths/config/dedupe/onebot/transport 共 28 个用例
docs/
  api-notes.md        已实测的 DSH 宿主 API 与坑
```

## 更新与重启

改完 `src/` 后要做两件事：刷新分发包、重启 DSH。DSH 实际加载的是分发包，
profile 里的 `node_modules\dsh-qq-bridge` 是指向 `dist\dsh-qq-bridge-<版本>-package` 的 junction，
不是本仓库的 `src/`：

```powershell
# 1. 刷新分发包（先自己备份或保留旧目录做回滚）
robocopy src dist\dsh-qq-bridge-0.31.0-package\src /MIR
# 2. 重启 DSH / QQ 桥 / NapCat（无控制台窗口）
wscript.exe //B scripts\restart-dsh-hidden.vbs
```

`restart-dsh-hidden.vbs` 用隐藏窗口调用 `restart-dsh.ps1`，适合从 GUI/计划任务触发；
`restart-dsh.ps1` 会优雅关闭 DSH 进程树、重新拉起，并轮询 `/qq-bridge/bridge/status`
直到 OneBot 重连；日志在 `%USERPROFILE%\.dsh\logs\restart-*.log`。远端没有 GUI 也能跑。
常用参数：`-SkipStart` 只停机、`-TimeoutSec 180` 放宽等待、`-Port` 换端口。
若在 DSH 会话内部执行（例如让 agent 调它），会连调用方一起杀掉，默认拒绝，需加 `-Force`。

## 已知限制

- 出站只支持图片（`present` 自动转发、`/sendimage`）；pdf/zip 等还没有出口。
- 官方 QQ 机器人适配还没做，需要开放平台的 appid/secret 与回调域名。
- 去重表在内存里，进程重启后同一 `message_id` 会被再次处理；持久化还没做。
- 会话恢复失败（例如旧会话缺消息 id）会回退新建会话，历史仍留在磁盘上，可用 `/use` 切回已存在的会话。
- 自检和早期测试留下的空工作区仍登记在 DSH 注册表里，需要时可在 GUI 里删除。
- 密钥会导入 DSH 凭据存储（`~/.dsh/.credentials.yaml`）；文本文件仍是每次启动的来源，文件存在时会覆盖存储值。
- 通过 CLI 启动的 profile 没有 `DEEPSEEK_API_KEY`，真实对话会报 `MISSING_CREDENTIAL`。
- Windows 控制台里中文日志可能显示为乱码，那是 `Get-Content` 的编码问题，数据本身是 UTF-8。

