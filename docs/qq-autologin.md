# QQ 自动登录

## 当前配置

```text
NapCat quick login account: <QQ号>
DSH qq-bridge napcat.enabled: true
DSH qq-bridge napcat.autoStart: true
```

## 配置位置

```text
%USERPROFILE%\.dsh\profiles\desktop\cordis.patch.yml
```

```yaml
- id: qq-bridge
  name: dsh-qq-bridge
  config:
    napcat:
      enabled: true
      autoStart: true
```

NapCat：

```text
vendor\napcat\napcat\config\webui.json
```

```json
{
  "autoLoginAccount": "<QQ号>"
}
```

## 生效方式

```text
DSH 启动
  → qq-bridge start
  → napcat.enabled && autoStart
  → 启动 NapCat
  → NapCat 读取 autoLoginAccount
  → 快速登录 <QQ号>
```

## 条件

```text
<QQ号> 必须仍然存在于 NapCat 的快速登录列表
设备登录状态未失效
```

如果不满足：

```text
NapCat 会回退到二维码/密码登录
```

## 手动验证

```text
GET http://127.0.0.1:6099/api/QQLogin/GetAutoLoginAccount
```

或查看 NapCat 日志：

```text
[WebUi] 自动快速登录成功: <QQ号>
```

## 关闭

```yaml
napcat:
  enabled: true
  autoStart: false
```

或清空：

```json
{ "autoLoginAccount": "" }
```

## 常见失败：账号已被桌面 QQ 占用

NapCat 状态：

```json
{
  "loginPhase": "waiting_qrcode",
  "qrcodeurl": "",
  "loginError": "当前账号(<QQ号>)已登录,无法重复登录"
}
```

原因：

```text
桌面 QQ 正在使用 <QQ号>
NapCat 不能再登录同一账号
```

处理：

```text
1. 完全退出桌面 QQ（不是只关窗口）
2. 让 NapCat 重新尝试快速登录
   或
3. 给 NapCat 换一个独立 QQ 账号
```

同一 QQ 账号不能同时被桌面客户端和 NapCat 使用。

