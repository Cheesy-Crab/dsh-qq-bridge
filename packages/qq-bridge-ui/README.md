# dsh-qq-bridge-ui

Desktop-side control panel for a QQ Bridge host running at `http://127.0.0.1:3080`.

This package contains **only the client UI**: the `settings.section` entry named
`QQ Bridge` with NapCat status/start/stop/restart/QR buttons. It does not start a
QQ bridge or NapCat, so it is safe to install into the DSH Desktop profile while
the real bridge keeps running in the `qqweb` profile.

Install from the Desktop sidebar **插件 → 添加插件 → 安装第三方插件**, using this
directory as a local absolute path, then enable the bundle.

The API origin can be overridden before the client loads:

```js
globalThis.__QQ_BRIDGE_ORIGIN__ = "http://127.0.0.1:3080"
```
