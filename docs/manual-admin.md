# 管理手册（服务端 / 部署者）

面向在一台 Windows 机器上部署和维护机器人的人。Linux 部署见 [deploy-linux.md](deploy-linux.md)，
QQ 用户的使用说明见 [manual-user.md](manual-user.md)。当前版本与运行态见 [current-state.md](current-state.md)。

## 1. 部署形态与组成

当前生产实例是 **DSH Desktop + `desktop` profile** 的形态：Desktop 自己加载插件、
管理 NapCat、提供设置页；不需要 qqweb、浏览器后台或单独启动 NapCat。

```text
QQ 客户端 ⇄ 腾讯服务器 ⇄ NapCat ⇄(ws://127.0.0.1:6700)⇄ dsh-qq-bridge ⇄ DSH 会话/工作区
```

| 组件 | 本机位置 | 端口 |
|---|---|---|
| DSH Desktop | `E:\dsh\DeepSeek Harness.exe`，profile `desktop` | GUI 端口每次启动随机（`--port 0`） |
| dsh-qq-bridge | junction → `dist\dsh-qq-bridge-<版本>-package` | 监听 OneBot 反向 WS 6700 |
| NapCat Shell | 插件设置里的 `napcatCwd`，当前是仓库内 `vendor\napcat` | WebUI 6099 |
| 工作区根 | `E:\QQdsh` | — |
| 状态 | `%USERPROFILE%\.dsh\storages\qq-bridge\` | — |
| 桥设置 | `%USERPROFILE%\.dsh\qq-bridge\settings.json` | — |

## 2. 启动、停止、重启

**日常**：打开 DSH Desktop，插件随 profile 启动；`napcat.autoStart` 为 true 时 NapCat 一起拉起。

**重启**（不自动重启，见 [restart-policy.md](restart-policy.md)）：

```powershell
wscript.exe //B "E:\dsh\工作区对接QQ\scripts\restart-dsh-hidden.vbs"
```

`restart-dsh.ps1` 会优雅关闭 DSH 进程树、重新拉起，并轮询 `/qq-bridge/bridge/status`
直到 OneBot 重连；日志在 `%USERPROFILE%\.dsh\logs\restart-*.log`。
参数：`-SkipStart` 只停机、`-TimeoutSec 180` 放宽等待、`-Port` 换端口。
在 DSH 会话内执行会连调用方一起杀掉，默认拒绝，需加 `-Force`。

**检查**：

```powershell
Get-NetTCPConnection -State Listen | Where-Object LocalPort -in 6700,6099
Invoke-RestMethod http://127.0.0.1:<GUI端口>/qq-bridge/bridge/status
```

## 3. 首次配置

### 3.1 提供 NapCat 路径

设置页 **NapCat 路径**：已有 NapCat 点「选择目录」（目录里必须有 `napcat.bat`），
或粘路径回车；没有就点「下载」，装到 `%USERPROFILE%\.dsh\qq-bridge\napcat`。
路径写入 `settings.json` 的 `napcatCwd`，重启后继续使用。

当前实例指向仓库内 `vendor\napcat`（约 345MB，已在 `.gitignore` 里，不随插件分发）。

### 3.2 模型账号

默认直接用 DSH Desktop 当前登录的 DeepSeek 账号（`deepseek-account`），不需要 API Key。
当前 profile 覆盖为 API Key 模式时（`agent.provider: deepseek-official`），在设置页保存 `sk-...`，
或写入 `%USERPROFILE%\.dsh\deepseek-key.txt`（支持裸 key 或 `DEEPSEEK_API_KEY=sk-...`）。
插件启动时读文件并写入 DSH 凭据存储；环境变量已存在时优先用环境变量。

### 3.3 设置管理员

设置页填自己的 QQ 号点「设为管理员」，该账号变为 L3，之后可用 `/admin` 管理其他人。
也可以用 profile patch 指定（启动时合并）：

```yaml
- id: qq-bridge
  config:
    access:
      admins: ['<QQ号>']
```

### 3.4 启动并扫码

设置页点 **启动** → **显示二维码** → 机器人 QQ 扫码。登录后状态变为 **QQ 已连接**。

### 3.5 免扫码（可选）

首次扫码后，在 NapCat 的 `napcat\config\webui.json` 里设置 `autoLoginAccount` 为该 QQ 号，
或在 profile patch 里：

```yaml
- id: qq-bridge
  config:
    napcat:
      args: ['-q', '<QQ号>']
```

同一 QQ 号不能同时被桌面 QQ 和 NapCat 登录；报「当前账号已登录,无法重复登录」时先完全退出桌面 QQ，
或给 NapCat 换一个独立账号。详见 [qq-autologin.md](qq-autologin.md)。

## 4. 用户与权限

等级与白名单：

| 等级 | 文件沙箱 | 审批 | 默认能力 |
|---|---|---|---|
| L0 访客 | `read-only` | `never` | 仅聊天（共享访客工作区） |
| L1 用户 | `workspace-write` | `ask` | 聊天 + `image`（额度 0） |
| L2 高级 | `workspace-write` | `ask` | 聊天 + `image`（额度 0，配额更高） |
| L3 管理员 | `danger-full-access` | `ask` | 全部 |

- 审批策略按「L3 或存在 `accessGrants`」取 `ask`，否则 `never`；
- **L3 也不自动放行**：沙箱最大，但审批仍由本人回 `1`/`2`；
- 白名单能力：`workspace` / `read` / `write` / `exec` / `image`；变更在下一条消息生效。

管理员在 QQ 里（私聊机器人）操作：

| 指令 | 作用 |
|---|---|
| `/admin users` | 用户、等级、状态、今日轮次 |
| `/admin invite [L0-L3]` | 生成一次性配对码，默认 L1，5 分钟有效 |
| `/admin level <openid> <L0-L3>` | 调整等级 |
| `/admin freeze <openid>` / `/admin unfreeze <openid>` | 冻结/解冻 |
| `/admin allow <openid> <能力…>` / `/admin deny …` | 能力白名单 |
| `/admin perms <openid>` | 查看能力 |
| `/admin ws list` | 全部工作区（跨用户） |
| `/admin quota <openid> <数量>` | 生图额度（Buzz） |
| `/admin image-balance` | Civitai 账户总额（仅 L3） |
| `/napcat status\|start\|stop\|restart\|qr` | 管理内置 NapCat |

群主体按 `group:<群号>` 单独配置：

```text
/admin level group:<群号> L3
/admin allow group:<群号> image
/admin quota group:<群号> 100
```

绑定流程（仅私聊需要）：`/admin invite L1` → 用户 `/bind <配对码>`。群聊加进群即可，不需要绑定。

### 4.1 提问与审批

- `ask_user_question` 转成 QQ 文字：选项按 `1. 2. 3.` 列出，回序号、选项文字或自定义文字；
  多选回 `1,3`；默认等 30 分钟（`questions.timeoutSec`，0 为不限时）；
- 工具审批发「回复 1 允许，2 拒绝」，只认发起人，超时或拒绝都 fail-closed
  （`approval.timeoutSec`，默认 120 秒）。

## 5. 配置项

在 `%USERPROFILE%\.dsh\profiles\desktop\cordis.patch.yml` 里按 id 覆盖（完整默认值见
`src/core/config.js` 与 README）：

```yaml
- id: qq-bridge
  config:
    workspacesRoot: E:\QQdsh
    commandPrefix: ['/', '!', '#']
    agent:
      provider: deepseek-official
      model: deepseek-flash
      preset: standard
      turnTimeoutMs: 1800000
      followUp:
        enabled: true
    sandbox:
      modeByLevel: { L0: read-only, L1: workspace-write, L2: workspace-write, L3: danger-full-access }
    limits:
      maxChars: 1800
      maxWorkspaces: { L1: 3, L2: 10, L3: 0 }
      dailyTurns: { L0: 20, L1: 200, L2: 1000, L3: 0 }
    approval:
      timeoutSec: 120
    questions:
      timeoutSec: 1800
    napcat:
      enabled: true
      autoStart: true
    transport:
      onebot:
        port: 6700
        accessTokenEnv: QQ_ONEBOT_TOKEN
```

`agent.preset` 决定会话能看到哪些工具，不要删除（否则只剩全局工具）。

## 6. 状态与数据

| 文件 / 目录 | 内容 |
|---|---|
| `~/.dsh/storages/qq-bridge/state.json` | 每个聊天的当前工作区、当前会话、各工作区上次会话、标题、归档 |
| `~/.dsh/storages/qq-bridge/users.json` | 等级、冻结、每日轮次、能力、生图额度、配对码 |
| `~/.dsh/qq-bridge/settings.json` | NapCat 路径等桥设置 |
| `~/.dsh/platform/profiles/<profileId>.json` | profile 持久统计 |
| `~/.dsh/platform/predictions.jsonl` | profile 预测日志（只记元数据） |
| `E:\QQdsh\u-*\`、`E:\QQdsh\g-*\` | 个人 / 群工作区 |

状态路由都在 `/qq-bridge` 前缀下：`setup/status`、`bridge/status`、`platform/status`、
`session/status`、`profile/status`、`profile/state[?id=]`、`napcat/status|qr`、
`napcat/start|stop|restart`（POST 需 `x-qq-bridge-control: 1`）。

备份：停掉 DSH，复制 `E:\QQdsh` 和 `%USERPROFILE%\.dsh\storages\qq-bridge`，密钥文件单独保管。
会话历史在 `~/.dsh/sessions`，归档只隐藏不删除。

## 7. 截图与图片

- `/screenshot`（L3）：抓所有显示器，压成 JPEG，存到当前工作区 `attachments/qq/` 后按 base64 发回；
  依赖 Python + Pillow，可用 `DSH_QQ_PYTHON` 指定解释器；需要交互式桌面会话；
- 入站图片：下载到 `attachments/incoming/`，只有 `file_id` 时先调 NapCat `get_image` 再落盘；
  失败时消息里出现 `[图片下载失败]`；
- 出站：`present` 展示的图片在 turn 结束自动转发；L3 可用 `/sendimage <路径>`；
  支持 png/jpg/jpeg/gif/webp/bmp，其他文件只发文字。

## 8. 日志与排障

| 现象 | 排查 |
|---|---|
| 6700 被占用 | 已有 DSH 实例在跑；结束重复进程 |
| NapCat 反复 `ECONNREFUSED 127.0.0.1:6700` | DSH 没起或没监听；先起 DSH，NapCat 每 3 秒重试 |
| 连上但 QQ 不回 | 看 NapCat 是否收到事件、插件是否 `处理失败`；`/qq-bridge/bridge/status` 的 `pending` |
| `MISSING_CREDENTIAL` | key 文件缺失或格式不对 |
| `resume failed ... lacks an identified message` | 旧会话是早期版本写的，回退新会话即可 |
| 扫码后立刻掉线 | 机器人账号在别处登录被踢；只保留一个 NapCat |
| WebUI 6099 打不开 | NapCat 没起；token 在 `napcat\config\webui.json` |

日志：DSH 启动窗口或 `%USERPROFILE%\.dsh\logs\`（含 `restart-*.log`）；NapCat 启动终端输出。
排障时设 `DSH_QQ_BRIDGE_DEBUG=1` 把插件日志镜像到 console。

## 9. 安全

- NapCat 与插件都只连 `127.0.0.1`，不要对外暴露 6700/6099；
- **OneBot token 尚未设置**（见 [TODO](../TODO.md)）：跨机/多用户前必须补，
  NapCat 的 `websocketClients[].token` 与 `QQ_ONEBOT_TOKEN` 填同一个值；
- 管理员账号等同服务器权限；不要随意 `/admin level` 提权；
- 群工作区内容对群成员可见，提醒不要发敏感信息；
- 密钥只给运行 DSH 的账号读，不要提交进 git；`~/.dsh/.credentials.yaml` 同理。

## 10. 升级

```powershell
cd 'E:\dsh\工作区对接QQ'
git pull
# 刷新 profile 加载的目录（junction 目标）
robocopy src dist\dsh-qq-bridge-0.55.4-package\src /MIR
# 重启 DSH
wscript.exe //B scripts\restart-dsh-hidden.vbs
```

或按 [deploy-windows.md](deploy-windows.md) 在插件管理器里重装 GitHub tag。
升级前备份工作区与状态目录；发版流程见 [release-checklist.md](release-checklist.md)。

## 11. 已知缺口

见 [TODO.md](../TODO.md)：官方 QQ 机器人适配、出站非图片文件、去重持久化、开机自启、
早期测试工作区清理；Fabric generation 收尾见 [todo-next.md](todo-next.md)。

## 附录：旧版 qqweb 部署（仅参考）

早期形态是在 `qqweb` profile 里用 CLI 启动 DSH（3080 端口）并手动起外部 NapCat
（`dsh plugin --profile qqweb add ...`）。该流程仍可用，但不再是默认形态；
需要时按 `git show <旧版本>:docs/manual-admin.md` 取旧文档。
