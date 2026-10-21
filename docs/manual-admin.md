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

### 3.3 NapCat 反向 WS

配置文件：

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

绑定流程：管理员 `/admin invite L1` → 把六位码给用户 → 用户 `/bind 123456`。

等级与配额含义见 [使用手册](manual-user.md#7-权限等级)。

## 5. 配置项

在 profile 的 `cordis.patch.yml` 里按 id 覆盖：

```yaml
- id: qq-bridge
  config:
    workspacesRoot: E:\QQdsh
    agent:
      provider: deepseek-official
      model: deepseek-flash
      turnTimeoutMs: 300000
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
- 备份：停掉 DSH，复制 `E:\QQdsh` 和 `~/.dsh/storages/qq-bridge` 即可；密钥文件单独保管。
- 重置某个用户：删 `users.json` 里对应条目（先停 DSH），或 `/admin level` 重设。

## 7. 日志与排障

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

## 8. 安全

- NapCat 和插件都在 `127.0.0.1`，不对外暴露 6700/6099。
- **OneBot token 尚未设置**（见 [TODO](../TODO.md)）：本机自用可接受，跨机/多用户前必须加，填 `websocketClients[].token` 与 `QQ_ONEBOT_TOKEN`。
- 管理员账号就是 L3，等同于服务器权限；不要随意 `/admin level` 提权。
- 群工作区内容对群成员可见，提醒用户不要发敏感信息。
- 审批 fail-closed：超时、错人、无应答者都会拒绝。
- 密钥文件只给运行 DSH 的账号读；不要提交进 git。

## 9. 升级

```powershell
cd 'E:\dsh\工作区对接QQ'
git pull
& 'E:\dsh\resources\runtime\cli\bin\dsh.cmd' plugin --profile qqweb add 'E:\dsh\工作区对接QQ'
```

然后重启 DSH。NapCat 不需要动。升级前备份工作区和状态目录。

## 10. 已知缺口

见 [TODO.md](../TODO.md)：官方机器人适配、图片/文件、去重持久化、开机自启、早期测试工作区清理。
