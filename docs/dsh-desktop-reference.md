# DSH Desktop 参考分析

来源：

- https://github.com/anywhere-labs/dsh-desktop
- `docs/architecture.md`
- `docs/plugin-development.md`
- `docs/plugin-ecosystem.md`
- `dsh-community-fabric/README.zh.md`
- `dsh-community-fabric/docs/rfcs/0001-plugin-manifest-capabilities-events.zh.md`
- `dsh-plugin-desktop/docs/plugin-services.zh.md`

## 1. 它是什么

DSH Desktop 不是简单的 Electron 壳，而是：

```text
Electron 宿主
  + 固定版本的上游 DSH
  + 桌面壳自身作为 DSH 插件
  + 插件市场
  + 插件生态倡议
  + Community Fabric 互操作标准草案
```

它的核心主张：

> 万物皆插件，桌面本身也是插件。

它没有修改上游源码，而是把桌面能力也通过 DSH 插件机制组合进同一个运行时。

## 2. 值得参考的部分

### 2.1 宿主自身也是插件

Desktop 的窗口、托盘、终端、更新、工作配置都按 DSH 插件接入，不走特权旁路。

对我们的启发：

```text
adapter 不是特权层
QQ / Web / Desktop 都应该是同一种组合参与方
```

我们的 `AdapterHost` 方向是对的，但还可以进一步：

```text
platform-core 不直接知道 QQ
session-core 不直接知道 QQ
adapter 通过 host contract 接入
```

### 2.2 generation 边界

Desktop 的 profile / mode 切换不是就地改状态，而是：

```text
dispose 当前 generation
→ 启动新 generation
```

并且明确：

```text
service reference 不能跨 generation 缓存
window / subprocess handle 不能跨 generation
```

对我们的启发：

```text
profile 切换
capability 切换
surface 切换
都应该被视为 generation 边界
```

我们现在的 `/profile use` 会清 session、下一条消息重建，方向接近，但还缺少：

- generation id
- 旧 service reference 失效
- ledger 的 generation 归属

### 2.3 公开 contract 与私有实现分离

Desktop 明确区分：

```text
公开：
desktopProfiles
desktopPnpm
desktopWindow

私有：
desktopRuntime
desktopPnpmBootstrap
Electron BrowserWindow
托盘注册表
```

第三方插件只能依赖公开 contract。

对我们的启发：

```text
公开：
dsh.platform.contract
capabilities
profiles
adapter host
delivery / invocation contract

私有：
具体 adapter 实现
QQ transport
NapCat 进程
```

我们现在把 `/profile` 命令写在 QQ adapter 里，就是一个私有边界问题。  
后续应该把 profile 操作提升成平台 contract，而不是 QQ 特例。

### 2.4 跨宿主插件的 fallback 模式

Desktop 推荐：

```ts
if (ctx.get('desktopProfiles') === undefined) {
  mountOrdinaryDsh(ctx)
  return
}
ctx.inject(['desktopProfiles', 'desktopPnpm'], (desktopCtx) => {
  mountDesktopAdapter(desktopCtx)
})
```

特点：

- Desktop-only 依赖不进入顶层 required inject
- 普通 DSH 仍有明确 fallback
- Desktop service 出现/消失时，adapter 随 generation 一起卸载

对我们的启发：

```text
QQ adapter 不应假设 platform-core 一定存在
platform-core 不应假设 QQ 一定存在
```

但我们现在反过来：QQ 依赖 `adapterHost`，platform-core 是必需前置。  
这条边界需要再设计，至少要有明确错误和降级说明。

### 2.5 Host Descriptor

Fabric 提议每个 Host 发布机器可读描述：

```json
{
  "descriptorVersion": "0.1.0",
  "id": "org.example.dsh-webui",
  "apiVersions": ["0.1.0"],
  "execution": {
    "environment": "node",
    "trustMode": "trusted-in-process"
  },
  "capabilities": {
    "messages.observe": "0.1.0",
    "commands": "0.1.0"
  }
}
```

关键点：

- Host 支持什么，不是靠产品名猜
- `support / request / grant / enforcement` 分开
- trusted in-process 不等于沙箱
- required capability 缺失时明确拒载
- optional capability 缺失时明确降级

我们的 `dsh.platform.contract` 目前只是版本，不是 Host Descriptor。

可借鉴：

```text
platform descriptor
  - 支持的 contract 版本
  - 支持的 capabilities
  - surfaces
  - trust mode
  - 是否支持 profile
```

### 2.6 required / optional capability 协商

Fabric 的 manifest：

```json
{
  "capabilities": {
    "required": { "commands": "..." },
    "optional": { "ui.panel.basic": "..." }
  }
}
```

我们的 profile 目前只有：

```json
{
  "capabilities": ["image.generate"]
}
```

缺少：

```text
required / optional
版本范围
缺失时是拒载还是降级
```

这对插件兼容性很重要。

### 2.7 effect ledger / 资源归属

Fabric 提议 Broker 记录：

```text
pluginId
activationId
effectId
effectKind
operation
state
```

目的：

```text
哪个插件创建了什么
替换了什么
释放了什么
清理失败是什么
```

我们的 DeliveryCoordinator / InvocationLedger 已经有部分：

```text
outputId
claim / commit / release
调用幂等
```

但缺少：

```text
owner pluginId
activationId / generationId
资源释放记录
```

### 2.8 静态兼容，不等于安全认证

Fabric 明确区分：

```text
声明兼容
等待授权
已实测
不兼容
未知
```

而且：

```text
capability 声明 ≠ 沙箱
目录收录 ≠ 安全审核
```

我们的 contract validation 现在只有：

```text
ok / rejected
```

可以扩展成兼容状态：

```text
compatible
needs-grant
degraded
incompatible
unknown
```

## 3. 不该照搬的部分

```text
❌ Electron / Tauri 壳
❌ desktopProfiles / desktopPnpm / desktopWindow
❌ 桌面窗口、托盘、更新、安装器
❌ 插件市场后台
❌ dsh-plugin.json 尚未定稿就切换
```

Desktop 的 `dsh-community-fabric` 明确是 Draft：

```text
没有 runtime
没有 SDK
没有正式 schema
没有兼容认证
```

所以：

> 参考它的架构，不要现在把我们的 manifest 改成 Fabric 格式。

## 4. 和我们的映射

| Desktop / Fabric | 我们的对应物 | 状态 |
|---|---|---|
| 桌面壳是插件 | adapter 是组合参与方 | 已有 |
| generation | profile / capability 切换 | 部分 |
| desktopProfiles | ProfileRegistry | 已有 |
| desktopPnpm | QQ 命令/插件操作 | 私有，待提升 |
| Host Descriptor | `dsh.platform.contract` | 缺 |
| required/optional capability | profile.capabilities | 缺 |
| capability activation | profile + tool exposure | 缺 |
| effect ledger | Delivery/InvocationLedger | 部分 |
| 静态兼容状态 | contract validation | 简单版 |
| Fabric manifest | `dsh.platform` | 两套，待适配 |

## 5. 推荐工作

### 先做调研，不改实现

- [ ] 读完 Fabric RFC 0001–0004
- [ ] 列出我们 `dsh.platform` 与 Fabric manifest 的字段差异
- [ ] 判断：兼容 adapter / 双写 / 暂不兼容
- [ ] 设计 Host Descriptor v0
- [ ] 设计 required/optional capability 语义
- [ ] 设计 generation id 与 effect ownership

### 再做一个薄适配层

- [ ] 从 `dsh.platform` 生成 Fabric 兼容描述
- [ ] 不替换现有 bundle/patch 加载
- [ ] 不要求上游修改
- [ ] 不把 Desktop service 引入 platform-core

### 最后才考虑标准化

- [ ] 兼容状态展示
- [ ] 一致性 fixtures
- [ ] 市场静态预检
- [ ] 两个 Host 的互操作证据

## 6. 结论

DSH Desktop 对我们的价值不是“再做一个桌面壳”，而是：

```text
插件即一等公民
generation 生命周期
公开/私有 contract 分离
Host Descriptor
required/optional capability
effect ledger
兼容状态
```

这些可以直接用于 platform-core 的下一阶段。

我们的差异化仍然保留：

```text
多 surface adapter
session / principal / quota
delivery egress
profile → agentPreset
QQ 场景
```

一句话：

> **参考 Desktop 的契约和生命周期，不做 Desktop 的壳。**
