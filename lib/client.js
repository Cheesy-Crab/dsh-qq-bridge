window.__ModuleLoader__.load({
  id: "dsh-qq-bridge",
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" })
    const React = require("react")

    const base = () => {
      const transport = globalThis.__DSH_TRANSPORT__
      return typeof transport?.streamBaseUrl === "string" ? transport.streamBaseUrl.replace(/\/$/, "") : ""
    }

    async function call(path, method = "GET") {
      const response = await fetch(base() + "/qq-bridge" + path, { method, credentials: "omit" })
      const type = response.headers.get("content-type") || ""
      const body = type.includes("application/json") ? await response.json() : await response.text()
      if (!response.ok) throw new Error(body?.error || String(body) || `HTTP ${response.status}`)
      return body
    }

    const styles = {
      root: { display: "flex", flexDirection: "column", gap: "14px", padding: "4px 2px", maxWidth: "560px" },
      title: { margin: 0, fontSize: "16px", fontWeight: 600 },
      hint: { margin: 0, opacity: 0.72, fontSize: "13px", lineHeight: 1.5 },
      row: { display: "flex", flexWrap: "wrap", gap: "8px" },
      button: {
        appearance: "none",
        border: "1px solid rgba(127,127,127,.35)",
        background: "transparent",
        color: "inherit",
        borderRadius: "8px",
        padding: "7px 12px",
        fontSize: "13px",
        cursor: "pointer",
      },
      primary: { borderColor: "transparent", background: "rgba(64,132,255,.16)", color: "inherit" },
      card: {
        border: "1px solid rgba(127,127,127,.22)",
        borderRadius: "10px",
        padding: "12px 14px",
        display: "grid",
        gap: "6px",
        fontSize: "13px",
      },
      error: { color: "#d9534f", fontSize: "13px", margin: 0 },
      qr: { width: "220px", height: "220px", imageRendering: "pixelated", background: "#fff", borderRadius: "8px" },
    }

    function QqBridgeSection() {
      const [status, setStatus] = React.useState(null)
      const [error, setError] = React.useState("")
      const [busy, setBusy] = React.useState("")
      const [showQr, setShowQr] = React.useState(false)

      const refresh = React.useCallback(async () => {
        try {
          setStatus(await call("/napcat/status"))
          setError("")
        } catch (err) {
          setError(String(err?.message ?? err))
        }
      }, [])

      React.useEffect(() => {
        refresh()
        const timer = setInterval(refresh, 5000)
        return () => clearInterval(timer)
      }, [refresh])

      const action = async (name) => {
        setBusy(name)
        try {
          await call(`/napcat/${name}`, "POST")
          await refresh()
        } catch (err) {
          setError(String(err?.message ?? err))
        } finally {
          setBusy("")
        }
      }

      const running = status?.running
      return React.createElement("div", { style: styles.root },
        React.createElement("h2", { style: styles.title }, "QQ Bridge · NapCat"),
        React.createElement("p", { style: styles.hint },
          "由 dsh-qq-bridge 管理的本机 NapCat。启动/停止只影响插件拉起的实例；外部已连接的 NapCat 不会被结束。"),
        status === null
          ? React.createElement("p", { style: styles.hint }, "正在读取状态…")
          : React.createElement("div", { style: styles.card },
              React.createElement("div", null, `状态：${running ? "运行中" : "未运行"}${status.managed ? "（插件管理）" : status.external ? "（外部实例）" : ""}`),
              React.createElement("div", null, `端口：${status.port}｜PID：${status.pid ?? "—"}`),
              React.createElement("div", null, `目录：${status.cwd}`),
              React.createElement("div", null, `自动启动：${status.autoStart ? "是" : "否"}`),
            ),
        React.createElement("div", { style: styles.row },
          React.createElement("button", { style: { ...styles.button, ...styles.primary }, disabled: Boolean(busy) || running, onClick: () => action("start") }, busy === "start" ? "启动中…" : "启动"),
          React.createElement("button", { style: styles.button, disabled: Boolean(busy) || !running || status?.external, onClick: () => action("stop") }, busy === "stop" ? "停止中…" : "停止"),
          React.createElement("button", { style: styles.button, disabled: Boolean(busy) || status?.external, onClick: () => action("restart") }, busy === "restart" ? "重启中…" : "重启"),
          React.createElement("button", { style: styles.button, onClick: () => setShowQr((value) => !value) }, showQr ? "隐藏二维码" : "显示二维码"),
        ),
        showQr
          ? React.createElement("img", { style: styles.qr, alt: "NapCat 登录二维码", src: base() + `/qq-bridge/napcat/qr?ts=${Date.now()}` })
          : null,
        error ? React.createElement("p", { style: styles.error }, error) : null,
      )
    }

    function apply(ctx) {
      ctx.slots.inject("settings.section", () => ctx.slots.register({
        name: "settings.section",
        id: "qq-bridge",
        order: 80,
        label: () => "QQ Bridge",
      }, QqBridgeSection))
    }

    exports.apply = apply
    return module.exports
  }
})
