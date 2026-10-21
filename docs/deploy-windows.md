# Windows 另一台电脑部署

适用于 Windows 10/11。目标：独立跑一个带 QQ 机器人的 DSH 实例，不影响桌面端。

## 1. 装什么

| 组件 | 说明 |
|---|---|
| DSH | 与当前机器相同的安装包 |
| Git | 从 GitHub 安装插件时需要；用本地目录安装则不需要 |
| QQNT | 机器人要登录的 QQ |
| NapCat | OneBot 11 协议端，连到插件的 6700 |

## 2. 创建 profile

桌面端 `desktop` profile 由 Electron 独占，CLI 不能装插件。新机器上建一个独立 profile，并从 `web` 模板初始化（否则缺 workspace/agent 行）：

```powershell
dsh qqweb --from-default-profile web --dump-config
```

这一步只创建/重置 profile 并打印配置，不会启动界面。

## 3. 安装插件

仓库目前是 **private**，新机器需要先能访问 GitHub：

```powershell
# 首次会弹 Git Credential Manager 登录（或用 PAT）
dsh plugin --profile qqweb add github:Cheesy-Crab/dsh-qq-bridge
```

如果不想处理私有仓库鉴权，把仓库设为 public，或把整个目录拷过去后用路径安装：

```powershell
dsh plugin --profile qqweb add E:\path\to\dsh-qq-bridge
```

确认插件行：

```powershell
dsh --profile qqweb --dump-config | Select-String qq-bridge -Context 0,2
```

## 4. 配管理员

先启动一次，用 `/whoami` 拿到自己的 openid（L0 也能用这个指令）：

```powershell
dsh --profile qqweb
```

然后编辑 `%USERPROFILE%\.dsh\profiles\qqweb\cordis.patch.yml`：

```yaml
- id: qq-bridge
  config:
    access:
      admins:
        - '<你的 openid>'
```

重启 profile 生效。

## 5. API key

```powershell
notepad "$env:USERPROFILE\.dsh\deepseek-key.txt"
```

内容任选其一：

```text
sk-你的key
```

```text
DEEPSEEK_API_KEY=sk-你的key
```

## 6. NapCat

1. 从 NapCat Release 下载 `NapCat.Shell.zip` 并解压；
2. 运行启动脚本，按提示选择 QQNT 路径并拉起 QQ；
3. 扫码登录机器人 QQ；
4. 在 NapCat 配置里加「WebSocket 反向连接」：`ws://127.0.0.1:6700/`；
5. 如需 token，设置环境变量 `QQ_ONEBOT_TOKEN`，并在 NapCat 里填同一个值。

## 7. 启动与验证

```powershell
dsh --profile qqweb
```

日志里应出现：

```
[qq-bridge] onebot reverse ws listening on ws://127.0.0.1:6700/
[qq-bridge] bridge started root=E:\QQdsh transport=onebot
```

没有 QQ 时先用假客户端验证：

```powershell
$node = 'E:\dsh\resources\runtime\primary-runtime\dependencies\node\bin\node.exe'
& $node scripts\fake-commands.mjs ws://127.0.0.1:6700/ '/whoami;/status' 10001
```

真 QQ：私聊 `/whoami`，群里 @机器人 发消息。

## 8. 开机自启

用「任务计划程序」创建登录时启动的任务，程序填 `dsh.cmd` 或 `DeepSeek Harness.exe`，参数 `--profile qqweb`；或使用 NSSM 包装成服务。Linux 用 systemd，见 [deploy-linux.md](deploy-linux.md)。

## 9. 注意

- 同一 `DSH_HOME` 只允许一个进程连同一个 QQ 号，别和桌面端抢同一个机器人账号。
- 全局 `git config http.proxy` 如果指向没开的代理，`dsh plugin add github:` 会失败；先修代理或用路径安装。
- 工作区数据默认在 `E:\QQdsh`（Windows），要换在 profile patch 里设 `workspacesRoot`。
