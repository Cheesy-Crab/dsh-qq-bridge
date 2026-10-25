# vendor/napcat

这个目录是 **NapCat Shell 的本地运行时**，由插件通过 `src/napcat.js` 启动和守护。

## 是否进 Git

**不进。** `vendor/napcat/` 已在 `.gitignore` 里。它包含 QQNT 客户端二进制、
`node.exe`、`wrapper.node` 等约 345MB 文件，直接提交会让仓库膨胀，也可能涉及
腾讯/ NapCat 的分发许可。发布时由 `scripts/bundle.ps1` 把它打进 zip。

## 如何填充

```powershell
powershell -ExecutionPolicy Bypass -File scripts/install-napcat.ps1
# 或指定已有的 NapCat Shell 目录
powershell -ExecutionPolicy Bypass -File scripts/install-napcat.ps1 -Source "D:\NapCat\NapCat.Shell.Windows.Node"
```

脚本只做目录复制，不会改 NapCat 配置。

## 插件配置

```yaml
napcat:
  enabled: true
  autoStart: true
  # command: ''            # 默认 vendor/napcat/napcat.bat
  # cwd: ''                # 默认 <plugin>/vendor/napcat
  # args: []
  restart: true
  restartDelayMs: 5000
```

启用后：

- 插件启动时若 6700 端口空闲，会自动拉起 `vendor/napcat/napcat.bat`；
- 若端口已被外部 NapCat 占用，插件不会重复启动，也不会杀外部进程；
- 进程退出后按 `restartDelayMs` 自动重启；
- QQ 指令：`/napcat status|start|stop|restart|qr`。

需要扫码时，`/napcat qr` 会把 `vendor/napcat/napcat/cache/qrcode.png` 发到 QQ。
