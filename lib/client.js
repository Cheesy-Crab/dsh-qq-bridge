window.__ModuleLoader__.load({
  id: "dsh-qq-bridge",
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" })
    const React = require("react")
    const inject = ["slots"]

    const base = () => {
      const transport = globalThis.__DSH_TRANSPORT__
      return typeof transport?.streamBaseUrl === "string" ? transport.streamBaseUrl.replace(/\/$/, "") : ""
    }

    async function call(path, method = "GET", body) {
      const response = await fetch(base() + "/qq-bridge" + path, {
        method,
        credentials: "omit",
        headers: body === undefined ? undefined : { "content-type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      })
      const type = response.headers.get("content-type") || ""
      const value = type.includes("application/json") ? await response.json() : await response.text()
      if (!response.ok) throw new Error(value?.error || String(value) || `HTTP ${response.status}`)
      return value
    }

    const styles = {
      root: { display: "flex", flexDirection: "column", gap: "14px", padding: "4px 2px", maxWidth: "620px" },
      title: { margin: 0, fontSize: "16px", fontWeight: 600 },
      sub: { margin: 0, opacity: 0.72, fontSize: "13px", lineHeight: 1.5 },
      card: {
        border: "1px solid rgba(127,127,127,.22)",
        borderRadius: "10px",
        padding: "12px 14px",
        display: "grid",
        gap: "7px",
        fontSize: "13px",
      },
      row: { display: "flex", flexWrap: "wrap", gap: "8px", alignItems: "center" },
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
      input: {
        boxSizing: "border-box",
        flex: "1 1 220px",
        minWidth: "180px",
        border: "1px solid rgba(127,127,127,.35)",
        background: "transparent",
        color: "inherit",
        borderRadius: "8px",
        padding: "7px 10px",
        fontSize: "13px",
      },
      error: { color: "#d9534f", fontSize: "13px", margin: 0 },
      ok: { color: "#1a9f5b", fontSize: "13px", margin: 0 },
      qr: { width: "220px", height: "220px", imageRendering: "pixelated", background: "#fff", borderRadius: "8px" },
    }

    function QqBridgeSection() {
      const [status, setStatus] = React.useState(null)
      const [error, setError] = React.useState("")
      const [ok, setOk] = React.useState("")
      const [busy, setBusy] = React.useState("")
      const [showQr, setShowQr] = React.useState(false)
      const [napcatPath, setNapcatPath] = React.useState("")
      const [apiKey, setApiKey] = React.useState("")
      const [admin, setAdmin] = React.useState("")

      const refresh = React.useCallback(async () => {
        try {
          setStatus(await call("/setup/status"))
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

      React.useEffect(() => {
        if (status && napcatPath === "") setNapcatPath(status.napcat?.cwd ?? "")
      }, [status, napcatPath])

      const act = async (name, path, body) => {
        setBusy(name)
        setError("")
        setOk("")
        try {
          await call(path, "POST", body)
          await refresh()
          setOk(name === "install" ? "NapCat 安装完成。" : name === "key" ? "API Key 已保存。" : name === "admin" ? "管理员已设置。" : "")
        } catch (err) {
          setError(String(err?.message ?? err))
        } finally {
          setBusy("")
        }
      }

      const applyPath = async (value) => {
        const clean = String(value ?? "").trim()
        if (clean === "") return
        setBusy("path")
        setError("")
        setOk("")
        try {
          const result = await call("/setup/napcat-path", "POST", { path: clean })
          setNapcatPath(result.cwd)
          await refresh()
          setOk("已使用该 NapCat 目录。")
        } catch (err) {
          setError(String(err?.message ?? err))
        } finally {
          setBusy("")
        }
      }

      const chooseDirectory = async () => {
        setBusy("browse")
        setError("")
        setOk("")
        try {
          const result = await call("/setup/browse", "POST")
          if (result.path) {
            setNapcatPath(result.path)
            await applyPath(result.path)
          }
        } catch (err) {
          setError(String(err?.message ?? err))
        } finally {
          setBusy("")
        }
      }

      const downloadNapcat = async () => {
        setBusy("download")
        setError("")
        setOk("")
        try {
          const result = await call("/setup/install", "POST", { source: "" })
          if (result.cwd) setNapcatPath(result.cwd)
          await refresh()
          setOk("NapCat 下载并安装完成。")
        } catch (err) {
          setError(String(err?.message ?? err))
        } finally {
          setBusy("")
        }
      }

      if (status === null) {
        return React.createElement("div", { style: styles.root },
          React.createElement("h2", { style: styles.title }, "QQ Bridge"),
          React.createElement("p", { style: styles.sub }, error || "正在读取部署状态…"),
        )
      }

      const napcat = status.napcat ?? {}
      const bridge = status.bridge ?? {}
      const running = napcat.running
      const installed = napcat.installed
      const admins = status.admins ?? []
      const usesAccount = String(status.provider ?? "").startsWith("deepseek-account")

      return React.createElement("div", { style: styles.root },
        React.createElement("h2", { style: styles.title }, "QQ Bridge 部署"),
        React.createElement("p", { style: styles.sub },
          "所有操作都在这里完成：安装 NapCat、配置 API Key/管理员、启动服务、扫描二维码。"),

        React.createElement("div", { style: styles.card },
          React.createElement("div", null, `Bridge：${bridge.transport?.connected ? "QQ 已连接" : "等待 QQ 连接"}｜端口 ${bridge.transport?.port ?? 6700}｜会话 ${bridge.chats?.chats ?? 0}`),
          React.createElement("div", null, `NapCat：${installed ? (running ? "运行中" : "已安装，未运行") : "未安装"}`),
          React.createElement("div", null, usesAccount ? "模型：DSH 当前登录账号" : `API Key：${status.apiKey?.configured ? "已配置" : "未配置"}`),
          React.createElement("div", null, `管理员：${admins.length > 0 ? admins.join(", ") : "未配置"}`),
          React.createElement("div", null, `安装目录：${status.setupDir}`),
        ),

        React.createElement("div", { style: styles.card },
          React.createElement("strong", null, "NapCat 路径"),
          React.createElement("p", { style: styles.sub }, "已有 NapCat 直接选择目录；没有就点右侧「下载」。输入路径后按回车应用。"),
          React.createElement("div", { style: styles.row },
            React.createElement("input", {
              style: styles.input,
              placeholder: "例如 D:\\NapCat\\NapCat.Shell.Windows.Node",
              value: napcatPath,
              onChange: (event) => setNapcatPath(event.target.value),
              onKeyDown: (event) => {
                if (event.key === "Enter") applyPath(event.currentTarget.value)
              },
            }),
            React.createElement("button", {
              style: styles.button,
              disabled: Boolean(busy),
              onClick: chooseDirectory,
            }, busy === "browse" ? "选择中…" : "选择目录"),
            React.createElement("button", {
              style: { ...styles.button, ...styles.primary },
              disabled: Boolean(busy),
              onClick: downloadNapcat,
            }, busy === "download" ? "下载中…" : "下载"),
          ),
        ),

        !usesAccount && !status.apiKey?.configured
          ? React.createElement("div", { style: styles.card },
              React.createElement("strong", null, "2. 配置 API Key"),
              React.createElement("p", { style: styles.sub }, "写入 DSH 的 DeepSeek Key 文件并导入凭据，不需要命令行。"),
              React.createElement("div", { style: styles.row },
                React.createElement("input", {
                  style: styles.input,
                  type: "password",
                  placeholder: "sk-...",
                  value: apiKey,
                  onChange: (event) => setApiKey(event.target.value),
                }),
                React.createElement("button", {
                  style: { ...styles.button, ...styles.primary },
                  disabled: Boolean(busy) || apiKey.trim() === "",
                  onClick: () => act("key", "/setup/api-key", { key: apiKey }),
                }, busy === "key" ? "保存中…" : "保存 Key"),
              ),
            )
          : null,

        admins.length === 0
          ? React.createElement("div", { style: styles.card },
              React.createElement("strong", null, "3. 设置管理员"),
              React.createElement("p", { style: styles.sub }, "填你的 QQ 号，设为 L3 管理员。之后也可以用 /admin 管理其他人。"),
              React.createElement("div", { style: styles.row },
                React.createElement("input", {
                  style: styles.input,
                  placeholder: "QQ 号",
                  value: admin,
                  onChange: (event) => setAdmin(event.target.value),
                }),
                React.createElement("button", {
                  style: { ...styles.button, ...styles.primary },
                  disabled: Boolean(busy) || admin.trim() === "",
                  onClick: () => act("admin", "/setup/admin", { openid: admin }),
                }, busy === "admin" ? "设置中…" : "设为管理员"),
              ),
            )
          : null,

        React.createElement("div", { style: styles.card },
          React.createElement("strong", null, installed ? "4. 启动并登录" : "4. 启动并登录（先安装 NapCat）"),
          React.createElement("div", { style: styles.row },
            React.createElement("button", { style: { ...styles.button, ...styles.primary }, disabled: Boolean(busy) || running || !installed, onClick: () => act("start", "/napcat/start") }, busy === "start" ? "启动中…" : "启动"),
            React.createElement("button", { style: styles.button, disabled: Boolean(busy) || !running || napcat.external, onClick: () => act("stop", "/napcat/stop") }, busy === "stop" ? "停止中…" : "停止"),
            React.createElement("button", { style: styles.button, disabled: Boolean(busy) || napcat.external || !installed, onClick: () => act("restart", "/napcat/restart") }, busy === "restart" ? "重启中…" : "重启"),
            React.createElement("button", { style: styles.button, onClick: () => setShowQr((value) => !value) }, showQr ? "隐藏二维码" : "显示二维码"),
          ),
        ),

        showQr
          ? React.createElement("img", { style: styles.qr, alt: "NapCat 登录二维码", src: base() + `/qq-bridge/napcat/qr?ts=${Date.now()}` })
          : null,
        error ? React.createElement("p", { style: styles.error }, error) : null,
        ok ? React.createElement("p", { style: styles.ok }, ok) : null,
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
    exports.inject = inject
    return module.exports
  }
})
