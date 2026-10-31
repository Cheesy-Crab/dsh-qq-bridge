# 当前状态与交接（Current State）

状态基线：2026-11-01 01:45（Asia/Shanghai）

用途：新会话接手时读这一份。它记录**已核实的事实**（版本、安装形态、运行态、测试基线、已知限制）；
未完成项的路线图见 [todo-next.md](todo-next.md)，运维项见 [TODO.md](../TODO.md)。

## 1. 仓库与版本

| 包 | 版本 | 本地位置 | 远端 |
|---|---|---|---|
| `dsh-qq-bridge` | 0.55.4 | `E:\dsh\工作区对接QQ` | `Cheesy-Crab/dsh-qq-bridge` |
| `@dsh/platform-core` | 0.54.0（仓库，待发版；运行中 0.53.0） | `E:\dsh\dsh-platform-core` | `Cheesy-Crab/dsh-platform-core` |
| `@dsh/session-core` | 0.52.8 | `E:\dsh\dsh-session-core` | `Cheesy-Crab/dsh-session-core` |
| `dsh-tavern-qq` | 0.1.0 | `E:\dsh\dsh-tavern-qq` | 未安装（环境无 `dsh-liketavern`） |
| `dsh-image-gen` | 0.9.2 | 第三方安装目录（profile junction） | 上游插件，不在本仓库 |

- 三个仓库都在 `main`，都配了 GitHub `origin`；**本地提交不等于发布**。
- QQ 仓库通过 `codeload` tarball 依赖核心包（见 `package.json` 的 `devDependencies`）：
  platform-core `v0.54.0`、session-core `v0.52.8`。
- **platform-core 0.54.0 尚未推送 tag**：本地仓库已是 0.54.0，运行中的 profile 仍安装 0.53.0；
  发版步骤见 §7。
- 依赖方向固定：QQ 适配器 → 平台核心 / 会话核心，核心不反向依赖 QQ。

## 2. 安装形态

`%USERPROFILE%\.dsh\profiles\desktop`：

```text
bundles:
  @deepseek-ai/dsh-base
  @deepseek-ai/dsh-web-app
  @dsh/platform-core      0.53.0（运行中；0.54.0 待安装）
  dsh-qq-bridge           0.55.4   (junction → dist\dsh-qq-bridge-0.55.4-package)
  @dsh/session-core       0.52.8
  dsh-image-gen           0.9.2
  dsh-whale-widget        0.4.2
```

- DSH 实际加载的是 `dist\dsh-qq-bridge-<version>-package`，不是本仓库 `src/`。
  改完 `src/` 必须刷新分发包并重启 DSH 才生效。
- `cordis.patch.yml` 中 qq-bridge 的 `agent.provider` = `deepseek-official`，
  `agent.model` = `deepseek-flash`，`napcat.enabled` 与 `napcat.autoStart` 均为 `true`。

## 3. 运行态（2026-11-01 01:45 实测）

```text
DSH Desktop:      运行中（2026-11-01 01:35 启动）
GUI:              http://127.0.0.1:54477（--port 0，每次启动变）
OneBot 反向 WS:   ws://127.0.0.1:6700
NapCat:           由插件管理，autoStart，快速登录
QQ 机器人:        在线（transport connected，clients=1）
```

**状态路由都在 `/qq-bridge` 前缀下**（裸 `/platform/status` 是 404）：

| 路由 | 用途 |
|---|---|
| `GET /qq-bridge/setup/status` | 部署向导状态（provider、管理员、key） |
| `GET /qq-bridge/bridge/status` | 传输连接、chat 数、pending |
| `GET /qq-bridge/platform/status` | host descriptor、generation、effects、profile/prediction 统计 |
| `GET /qq-bridge/session/status` | chats / pending |
| `GET /qq-bridge/profile/status` | profile 列表 |
| `GET /qq-bridge/profile/state[?id=<profileId>]` | profile 持久统计 |
| `GET /qq-bridge/napcat/status` | NapCat 进程与登录阶段 |

最近一次读数：

```text
bridge:        connected=true clients=1 chats=2 pending=1
platform:      generation=gen-mvwomm1c-1fd18413
               profiles=[image] capabilities=8 predictions=63
               plugins=3（classification 全 unknown，见 §5）
               delivery=0 invocations=0 effects=0
profile state: image 统计为空（重启后尚未产生工具调用）
```

## 4. 测试基线

- **完全权限 / CI**：`node --test` → 167 用例全过（2026-11-01 实测）。
- **受限沙箱（workspace-write）**：测试运行器用管道 stdio，会报 `spawn EPERM`；
  此时逐文件执行：

```powershell
$node = 'E:\dsh\resources\runtime\primary-runtime\dependencies\node\bin\node.exe'
Get-ChildItem test -Filter *.test.js | ForEach-Object { & $node $_.FullName }
```

  逐文件下 **166 用例 165 过**，唯一失败是 `test/chat.test.js` 的「junction 归一化」用例：
  该沙箱里 `fs.symlinkSync(dir, link, 'junction')` 的产物 `lstat` 不报 symlink、
  `fs.realpathSync(link)` 返回 link 自身，`canonicalDir` 因此拿不到真实路径。
  **这是环境限制，不是代码回归**；完整权限或原生 CI 下该用例通过。

## 5. 运行时事实与已知限制

- 插件分类 `unknown=3`：`dsh-qq-bridge`、`dsh-image-gen`、`dsh-whale-widget` 的 manifest
  只声明 `dsh.bundle` / `dsh.client`，没有 `dsh.platform.capabilities`。
  image 能力来自 platform-core 内置的 legacy bindings，不依赖插件 manifest。
- `dsh-image-gen 0.9.2` 仍未声明 `dsh.platform`；capability brief 按 known tools 过滤，
  不会宣传未安装工具。
- 去重表仍在内存：进程重启后同一 `message_id` 会被再次处理。
- 出站只支持图片（`present` 自动转发、`/sendimage`）；pdf/zip 没有出口。
- profile 统计不从历史会话回灌，只累计新调用（见 [profile-state.md](profile-state.md)）。
- 尚未生效的架构项：Fabric generation 跨代拒绝、adapter `pluginId`/`activationId`、
  cleanup-failed 已在 platform-core 0.54.0 实现，但运行中 profile 仍是 0.53.0，
  需要发版并重启才生效（见 §7）。

## 6. 开发约定

1. 每个任务必须有测试；测试不过不进入下一项。
2. 不把“prompt 写了”当作完成，必须有代码约束或运行时校验。
3. 不新增 PowerShell 写 JSON；统一 Node `JSON.stringify`，禁止 BOM。
4. 不改 capability 核心语义（effects / permissions / delivery / retry / recovery）。
5. QQ 默认保持离线；需要上线验证时单独确认。
6. **不自动重启 DSH**：端口每次变化、旧标签页失效；需要重启时先确认没有进行中的工具调用。
7. 发版后要同步 `dist` 包 + profile 安装，再重启才生效。

## 7. 下一步

未完成项按优先级见 [todo-next.md](todo-next.md)：

```text
1. platform-core 0.54.0 发版：push main + tag v0.54.0 → 重装 profile 的 platform-core → 重启 DSH
   （重启会中断当前会话，需先确认没有进行中的工具调用）
2. 去重表持久化 + 出站非图片文件
3. 显式 profile 展开 family / 预测失败修正
4. Profile State 重启后统计核对
5. dsh-tavern-qq 安装（阻塞：无 liketavern）
```
