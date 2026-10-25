# Windows 部署（DSH Desktop 一键版）

适用于 Windows 10/11。目标：把 QQ Bridge 装进 **DSH Desktop 本身**，让 Desktop 同时
跑 bridge、NapCat 和设置页；不再需要 qqweb、浏览器页面或单独启动 NapCat。

> 同一个机器人 QQ 只能在一处登录。切换到 Desktop 前，先停掉旧的 qqweb 实例。

## 1. 准备

| 组件 | 说明 |
|---|---|
| DSH Desktop | 与开发机相同或更新版本 |
| 网络 | 从 GitHub 安装或下载 NapCat 时需要 |
| 机器人 QQ | 用于 NapCat 扫码登录 |
| DeepSeek API Key | `sk-...`，向导里可直接保存 |

## 2. 安装插件

DSH Desktop 侧边栏：**插件 → 添加插件 → 安装第三方插件**，然后选一种方式。

### 方式 A：GitHub 地址（推荐）

```
https://github.com/Cheesy-Crab/dsh-qq-bridge.git#v0.20.0
```

或：

```
github:Cheesy-Crab/dsh-qq-bridge#v0.20.0
```

仓库目前是 **private**，需要这台机器已经登录 GitHub（Git Credential Manager 或
带 `repo` 权限的 PAT）。如果不想处理鉴权，把仓库设为 public 后可直接用上面的 URL。

仓库不包含 345MB 的 NapCat，安装包很小；NapCat 由向导下载。

### 方式 B：本地目录

把源码目录（或 `dist\dsh-qq-bridge-0.20.0-package`）复制到目标机器，安装时填：

```
D:\dsh-qq-bridge
```

### 方式 C：离线完整包

`dist\dsh-qq-bridge-0.20.0.zip` 约 118MB，包含 `vendor/napcat`。解压后把解压目录
作为本地路径安装；或者按插件管理器的提示安装 zip。

## 3. 启用插件

1. 安装完成后启用 `dsh-qq-bridge`；
2. 重启或刷新 DSH Desktop；
3. 打开 **设置 → QQ Bridge**。

正常情况下设置页直接看到部署向导；如果看不到，先确认插件已启用并重启 Desktop。

## 4. 部署向导（全部用按钮）

### 4.1 提供 NapCat 路径

设置页有一行 **NapCat 路径**：

```
[ D:\NapCat\NapCat.Shell.Windows.Node ]  [选择目录]  [下载]
```

- 已有 NapCat：点 **选择目录**，或直接把路径粘进输入框后按回车；
- 没有 NapCat：点右侧 **下载**，自动装到
  `%USERPROFILE%\.dsh\qq-bridge\napcat`；
- 路径会保存到 `%USERPROFILE%\.dsh\qq-bridge\settings.json`，重启后继续使用；
- 只接受包含 `napcat.bat` 的 NapCat Shell 目录。

### 4.2 保存 API Key

填入 `sk-...`，点 **保存 Key**。插件会写入 DSH 的 key 文件并导入凭据，不需要命令行。

### 4.3 设置管理员

填你自己的 QQ 号，点 **设为管理员**。该账号变为 L3；之后可用 `/admin` 管理其他人。

### 4.4 启动并扫码

1. 点 **启动**；
2. 点 **显示二维码**；
3. 用机器人 QQ 扫码登录。

登录后状态会变成 **QQ 已连接**，NapCat 显示运行中。

## 5. 后续免扫码（可选）

首次扫码后，如果希望每次启动 Desktop 不再扫码，在 profile patch 里启用快速登录：

```
%USERPROFILE%\.dsh\profiles\desktop\cordis.patch.yml
```

```yaml
- id: qq-bridge
  config:
    napcat:
      args: ['-q', '<机器人QQ号>']
```

保存后重启 Desktop。没有这一步时，NapCat 每次重启会重新要求扫码。

## 6. 验证

QQ 里发：

```
/whoami
/napcat status
```

Desktop 的 **设置 → QQ Bridge** 应显示：

- Bridge：QQ 已连接
- NapCat：运行中
- API Key：已配置
- 管理员：你的 QQ

## 7. 数据与升级

| 内容 | 位置 |
|---|---|
| 工作区 | `E:\QQdsh`（默认） |
| 用户/会话映射 | `%USERPROFILE%\.dsh\storages\qq-bridge` |
| NapCat 运行时 | `%USERPROFILE%\.dsh\qq-bridge\napcat` |
| NapCat 登录缓存 | 上述目录下的 `napcat\cache` |

升级插件：在插件管理器里卸载后重新安装新版本；工作区和用户数据保留。
升级 NapCat：重新点安装，或替换 `~/.dsh/qq-bridge/napcat`。

## 8. 常见问题

**QQ 没上线**
- 设置页看 NapCat 是否运行；
- 没运行就点启动，再看二维码；
- 二维码过期就重新点显示二维码。

**端口 6700 被占用**
- 旧 qqweb 还在跑；先停掉它，再重启 Desktop。

**GitHub 安装失败**
- private 仓库鉴权失败：改用本地目录，或把仓库设为 public；
- 网络失败：用本地 `dist\dsh-qq-bridge-0.20.0-package`。

**NapCat 下载失败**
- 在安装输入框填本地 NapCat 目录或 zip；
- 也可以先手动解压到 `%USERPROFILE%\.dsh\qq-bridge\napcat`，再点启动。

## 9. Linux

内置的 NapCat 安装向导针对 Windows；Linux 服务器请使用外部 NapCat（Docker 等），
并在配置里关闭插件对 NapCat 进程的管理：

```yaml
napcat:
  enabled: false
  autoStart: false
```

其余 bridge/agent 行为相同，见 [deploy-linux.md](deploy-linux.md)。
