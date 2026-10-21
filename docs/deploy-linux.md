# Linux 服务器部署

本文以 Ubuntu/Debian 为例，把一个长期运行的 DSH + QQ 机器人搭起来。Windows 本地开发见 README。

## 1. 前置

- Node.js ≥ 22（DSH 自带运行时也可以，只要 `dsh` 在 PATH 上）
- 一个专用的系统用户，例如 `dsh`
- NapCat（Docker 或 Linux QQ + NapCat），用于连 QQ

```bash
sudo useradd --create-home --shell /bin/bash dsh
sudo -iu dsh
```

## 2. 安装 DSH 与插件

按 DSH 官方方式安装 `dsh` 后，把插件装进 profile：

```bash
dsh plugin --profile web add /opt/dsh-qq-bridge
# 或者发布到 npm 后：
# dsh plugin --profile web add dsh-qq-bridge
```

确认插件行生效：

```bash
dsh --profile web --dump-config | grep -A2 qq-bridge
```

## 3. 目录与密钥

默认工作区根目录是 `${DSH_HOME}/qq-workspaces`（Linux 上即 `~/.dsh/qq-workspaces`）。想换位置，在 profile 的 `cordis.patch.yml` 里覆盖：

```yaml
- id: qq-bridge
  config:
    workspacesRoot: /srv/dsh/qq-workspaces
```

API key 放在文本文件里，权限收紧：

```bash
install -m 600 /dev/null ~/.dsh/deepseek-key.txt
printf 'DEEPSEEK_API_KEY=%s\n' 'sk-...' > ~/.dsh/deepseek-key.txt
chmod 600 ~/.dsh/deepseek-key.txt
```

插件启动时会把 key 导入 DSH 凭据存储（`~/.dsh/.credentials.yaml`）。文本文件仍然是每次启动的来源。

## 4. NapCat

推荐 Docker 并用 host 网络，这样反向 WS 能直接连到 `127.0.0.1:6700`：

```yaml
services:
  napcat:
    image: mlikiowa/napcat-docker:latest
    network_mode: host
    volumes:
      - ./napcat/config:/app/napcat/config
      - ./napcat/data:/app/napcat/data
    restart: unless-stopped
```

在 NapCat 的 WebUI 里添加「WebSocket 反向连接」：

- URL：`ws://127.0.0.1:6700/`
- Token：与 `QQ_ONEBOT_TOKEN` 环境变量一致

如果插件和 NapCat 不在同一台机器，把 `transport.onebot.host` 改成监听地址，并在两端配置 token 与防火墙规则；不要在公网裸奔这个端口。

## 5. systemd

```bash
sudo cp systemd/dsh-qq-bridge.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now dsh-qq-bridge
journalctl -u dsh-qq-bridge -f
```

`ExecStart` 里的 `dsh` 路径按实际安装位置调整。服务以 `dsh` 用户运行，`DSH_HOME` 指向它的家目录。

单实例：同一个 `DSH_HOME` 只允许一个进程连同一个 QQ 号。systemd 负责重启，插件自己会拒绝重复绑定。

## 6. 验收

```bash
# 服务日志里应出现
# [qq-bridge] onebot reverse ws listening on ws://127.0.0.1:6700/
# [qq-bridge] bridge started ...

# 用仓库自带假客户端验证（需要本机有 node）
node scripts/fake-commands.mjs ws://127.0.0.1:6700/ '/whoami;/status' 10001
```

真 QQ 上：私聊发 `/whoami` 应看到等级与工作区；群里 @机器人 发消息应得到带 @ 的回复。

## 7. 升级

```bash
sudo -iu dsh
dsh plugin --profile web add /opt/dsh-qq-bridge   # 重新 link/安装
sudo systemctl restart dsh-qq-bridge
```

重启后 `state.json` 里的工作区/会话映射会保留，插件会尝试 `agents.resume()` 续聊；恢复失败会回退新建会话。
