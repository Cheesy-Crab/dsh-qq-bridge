# 管理手册（服务端 / 部署者）

面向在一台 Windows 机器上部署和维护机器人的人。Linux 部署见 [deploy-linux.md](deploy-linux.md)。

## 1. 组成与端口

```
QQ 客户端 ⇄ 腾讯服务器 ⇄ NapCat ⇄(ws://127.0.0.1:6700)⇄ DSH 插件 ⇄ DSH 会话/工作区
```

| 组件 | 本机路径 | 端口 |
|---|---|---|
| DSH + 插件 | `E:\dsh`，profile `qqweb` | 3080（Web GUI）、6700（OneBot 反向 WS） |
| NapCat | `E:\NapCat\NapCat.Shell.Windows.Node` | 6099（WebUI） |
| 工作区 | `E:\QQdsh` | — |
| 状态 | `%USERPROFILE%\.dsh\storages\qq-bridge\` | — |

## 2. 启动与停止

**启动 DSH（先起，监听 6700）**

```powershell
& 'E:\dsh\resources\runtime\cli\bin\dsh.cmd' --profile qqweb --no-open
```

**启动 NapCat**

```powershell
cd 'E:\NapCat\NapCat.Shell.Windows.Node'
.\napcat.bat
```

如果出现二维码，用机器人 QQ 扫码；登录后 NapCat 会自动连 6700。

**停止**：两个窗口分别 `Ctrl+C`。强制结束：

```powershell
Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*--profile qqweb*' } | ForEach-Object { taskkill /PID $_.ProcessId /T /F }
Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath -like 'E:\NapCat\*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
```

**检查**

```powershell
Get-NetTCPConnection -State Listen | Where-Object LocalPort -in 3080,6099,6700
```

## 3. 首次配置

### 3.1 管理员

编辑 `%USERPROFILE%\.dsh\profiles\qqweb\cordis.patch.yml`：

```yaml
- id: qq-bridge
  config:
    access:
      admins:
        - '10001'
```

openid 就是 QQ 号（OneBot 的 `user_id`）。重启 DSH 后，该账号自动升为 L3。

### 3.2 API Key

`%USERPROFILE%\.dsh\deepseek-key.txt`，内容：

```text
DEEPSEEK_API_KEY=sk-...
```

插件启动时读入并写入 DSH 凭据存储（`~/.dsh/.credentials.yaml`）。文件是每次启动的来源。

### 3.3 内置 NapCat

插件默认从项目内 `vendor/napcat` 启动 NapCat，不再依赖 `E:\NapCat` 外部目录：

- `vendor/napcat` 约 345MB，已加入 `.gitignore`，用 `scripts/install-napcat.ps1` 填充；
- 配置：

```yaml
napcat:
  enabled: true
  autoStart: true
  args: ['-q', '123456789']
```

- 首次启动仍需扫码，二维码在 `vendor\napcat\napcat\cache\qrcode.png`；
  登录过一次后 `-q <QQ>` 可快速登录；
- 已有外部 OneBot 客户端连接时，插件不会重复启动 NapCat，也不会结束外部进程；
- `/napcat status` 查看状态，`/napcat qr` 重发二维码，`/napcat restart` 重启。

如果继续使用外部 NapCat，反向 WS 配置在：

```
E:\NapCat\NapCat.Shell.Windows.Node\napcat\config\onebot11_<QQ号>.json
```

关键片段：

```json
{
  "network": {
    "websocketClients": [
      {
        "name": "dsh-qq-bridge",
        "enable": true,
        "url": "ws://127.0.0.1:6700/",
        "messagePostFormat": "array",
        "reportSelfMessage": false,
        "reconnectInterval": 3000,
        "token": "",
        "debug": false,
        "heartInterval": 30000
      }
    ]
  }
}
```

改完必须重启 NapCat，它不热加载。重启后可能要重新扫码。

## 4. 用户与权限管理

在 QQ 里发给机器人（L3）：

| 指令 | 作用 |
|---|---|
| `/admin users` | 用户、等级、状态、今日轮次 |
| `/admin invite [L0-L3]` | 生成 5 分钟一次性配对码，默认 L1 |
| `/admin level <openid> <L0-L3>` | 调整等级 |
| `/admin freeze <openid>` | 冻结 |
| `/admin unfreeze <openid>` | 解冻 |
| `/admin ws list` | 所有工作区（跨用户） |
| `/napcat status\|start\|stop\|restart\|qr` | 管理内置 NapCat |

绑定流程：管理员 `/admin invite L1` → 把六位码给用户 → 用户 `/bind 123456`。

等级与配额含义见 [使用手册](manual-user.md#7-权限等级与白名单)。

### 4.1 能力白名单

L3 以外默认仅聊天。按账号授予：

| 能力 | 作用 |
|---|---|
| `workspace` | `/ws`、`/new`、`/sessions`、`/use` |
| `read` | read/glob/grep 等读取工具 |
| `write` | 写文件（隐含 read） |
| `exec` | 执行命令（隐含 read/write，工具集全开） |

```text
/admin allow <openid> workspace write
/admin deny <openid> exec
/admin perms <openid>
```

也可以写在 profile 配置里（启动时合并进用户记录）：

```yaml
access:
  whitelist:
    '123456': ['workspace', 'read', 'write']
```

白名单变更后，该用户下一条消息生效；已建立的会话会用新能力重新挂 guard 和沙箱模式。

文件策略按等级自动套用（默认见上表），L3 也可以在 QQ 里临时切换当前会话：

```
/sandbox danger-full-access
/sandbox workspace-write
/sandbox
```

`agent.preset` 决定会话能看到哪些工具。不要删除，否则会话只剩全局的 `working_directory`，连写文件都做不到。

### 4.2 用户提问

agent 的 `ask_user_question` 现在会转成 QQ 文字：

- 选项按 `1. 2. 3.` 列出，用户回复序号、选项文字或自定义文字；
- 多选回复 `1,3`；
- 默认等待 30 分钟，`questions.timeoutSec` 可改，`0` 为不限时；
- 提问由 QQ 会话接管后，桌面端的同一选项框不会同时生效；
- 超时后模型收到“用户超时未回复”的自定义答案，可继续或结束任务。

## 5. 配置项

在 profile 的 `cordis.patch.yml` 里按 id 覆盖：

```yaml
- id: qq-bridge
  config:
    workspacesRoot: E:\QQdsh
    commandPrefix: ['/', '!', '#']
    agent:
      provider: deepseek-official
      model: deepseek-flash
      preset: standard
      turnTimeoutMs: 300000
    sandbox:
      modeByLevel:
        L0: read-only
        L1: workspace-write
        L2: workspace-write
        L3: danger-full-access
    limits:
      maxChars: 1800
      maxWorkspaces: { L1: 3, L2: 10, L3: 0 }
      dailyTurns: { L0: 20, L1: 200, L2: 1000, L3: 0 }
    approval:
      timeoutSec: 120
    access:
      admins: ['10001']
      bindCodeTtlMinutes: 5
    transport:
      onebot:
        port: 6700
        accessTokenEnv: QQ_ONEBOT_TOKEN
```

完整默认值见仓库 [src/config.js](../src/config.js) 与 [README](../README.md)。

## 6. 状态与数据

| 文件 | 内容 |
|---|---|
| `~/.dsh/storages/qq-bridge/state.json` | 每个聊天的当前工作区、当前会话、各工作区上次会话 |
| `~/.dsh/storages/qq-bridge/users.json` | 用户等级、冻结状态、每日轮次、配对码 |
| `E:\QQdsh\u-*\` | 个人工作区 |
| `E:\QQdsh\g-*\` | 群工作区 |

- 会话恢复失败会自动新建，旧会话仍在 DSH 里，可 `/sessions` 后 `/use` 切回。
- 归档（`/archive`）只把会话从列表隐藏并调用 DSH 的 archive，不删除 `~/.dsh/sessions` 下的日志；需要彻底删除只能停服务后手动清理。
- `/ws delete` 调用 `workspaceRegistry.delete(id)`，只移除工作区登记，不删目录和会话；会话会变成 ungrouped。
- 备份：停掉 DSH，复制 `E:\QQdsh` 和 `~/.dsh/storages/qq-bridge` 即可；密钥文件单独保管。
- 重置某个用户：删 `users.json` 里对应条目（先停 DSH），或 `/admin level` 重设。

## 7. 截图

L3 在 QQ 里发送：

```
/screenshot
```

插件会抓取所有显示器（虚拟屏幕），压缩成 JPEG（质量 70），保存到当前工作区的
`attachments/qq/`，再以 OneBot `image` 段（base64）发回当前聊天；群里会附带 @。

依赖：Python + Pillow。DSH 自带的 Python 通常已含 Pillow；找不到时可设
`DSH_QQ_PYTHON` 指向带 Pillow 的 `python.exe`。抓屏需要交互式桌面会话，服务化/
无桌面环境会失败。

另外，agent 在回复里用 `present` 展示图片时，桥接器会在该轮结束时把图片自动转发到
对应的 QQ 会话（只转发 png/jpg/jpeg/gif/webp；其他文件仍只发文字）。

入站图片会下载到当前工作区的 `attachments/incoming/`，文件名形如
`qq-2026-10-23T16-45-08-078Z-9otz0p.jpg`，大小上限 20MB；下载失败时消息里会出现
`[图片下载失败]`。模型是否理解图片内容取决于模型能力，桥接器只负责落盘和传路径。

## 8. 日志与排障

| 现象 | 排查 |
|---|---|
| 6700 被占用 | 已经有一个 DSH 实例在跑；先结束重复进程 |
| NapCat 反复 `ECONNREFUSED 127.0.0.1:6700` | DSH 没起或没监听；先起 DSH，NapCat 每 3 秒重试 |
| DSH 连上但 QQ 不回 | 看 NapCat 日志有没有 `接收 <-`；看插件日志有没有 `处理失败` |
| `MISSING_CREDENTIAL` | key 文件缺失或格式不对；确认 `DEEPSEEK_API_KEY=` 前缀或裸 key |
| `resume failed ... lacks an identified message` | 旧会话是早期版本写的，回退新会话即可 |
| 扫码后立刻又掉线 | 机器人账号在别处登录被踢；只保留一个 NapCat |
| WebUI 打不开 6099 | NapCat 没起，或看日志里的 token URL |

日志位置：

- DSH：启动窗口输出，或启动时重定向的文件（如 `E:\NapCat\dsh-qqbridge3.log`）；
- NapCat：启动窗口输出，或 `E:\NapCat\napcat-run2.log`。

打开调试日志：启动 DSH 前设 `DSH_QQ_BRIDGE_DEBUG=1`。

## 9. 安全

- NapCat 和插件都在 `127.0.0.1`，不对外暴露 6700/6099。
- **OneBot token 尚未设置**（见 [TODO](../TODO.md)）：本机自用可接受，跨机/多用户前必须加，填 `websocketClients[].token` 与 `QQ_ONEBOT_TOKEN`。
- 管理员账号就是 L3，等同于服务器权限；不要随意 `/admin level` 提权。
- 群工作区内容对群成员可见，提醒用户不要发敏感信息。
- 审批 fail-closed：超时、错人、无应答者都会拒绝。
- **L3 也不自动放行**：L3 的沙箱是 `danger-full-access`，但审批仍是 `ask`，由 L3 的 QQ 本人回 `1`/`2`。
- **没有跨会话授权**：另一个会话无法代授权限；DSH 权限按会话与每次调用判定。
- 密钥文件只给运行 DSH 的账号读；不要提交进 git。

## 10. 升级

```powershell
cd 'E:\dsh\工作区对接QQ'
git pull
& 'E:\dsh\resources\runtime\cli\bin\dsh.cmd' plugin --profile qqweb add 'E:\dsh\工作区对接QQ'
```

然后重启 DSH。NapCat 不需要动。升级前备份工作区和状态目录。

## 11. 已知缺口

见 [TODO.md](../TODO.md)：官方机器人适配、图片/文件、去重持久化、开机自启、早期测试工作区清理。
