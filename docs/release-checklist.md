# 发布前检查清单

## 1. 本地验证

沙箱里 `node --test` 会因为测试运行器使用管道 stdio 报 `spawn EPERM`，逐文件跑即可：

```powershell
$node = 'E:\dsh\resources\runtime\primary-runtime\dependencies\node\bin\node.exe'
Get-ChildItem test -Filter *.test.js | ForEach-Object { & $node $_.FullName }
```

期望：**166 用例全过**（原生环境）。DSH 沙箱里 `test/chat.test.js` 的 junction 用例会失败，
那是环境限制，见 [current-state.md](current-state.md#4-测试基线)。

本地跑与 CI 相同的两步：

```powershell
powershell -ExecutionPolicy Bypass -File scripts\ci.ps1
```

Linux 侧（有 WSL 时）：

```bash
rm -rf /tmp/qqbridge-ci && mkdir -p /tmp/qqbridge-ci
cd /mnt/e/dsh/工作区对接QQ
tar --exclude=node_modules --exclude=.scratch -cf - . | tar -xf - -C /tmp/qqbridge-ci
cd /tmp/qqbridge-ci && pnpm install --frozen-lockfile && pnpm test
```

## 2. 密钥与本地状态

- 密钥文件在 `~/.dsh/deepseek-key.txt`，**不在仓库内**；`~/.dsh/.credentials.yaml` 同理。
- 工作区数据在 `E:\QQdsh`，不在仓库内。
- `.scratch/`、`attachments/`、`dist/`、`vendor/napcat/` 已被 `.gitignore` 忽略。
- 提交前扫一遍：

```powershell
Get-ChildItem -Recurse -File -Include *.js,*.mjs,*.md,*.json,*.yml,*.yaml,*.ps1,*.sh |
  Where-Object { $_.FullName -notmatch '\\node_modules\\|\\.scratch\\|\\dist\\' } |
  Select-String -Pattern 'sk-[A-Za-z0-9]{12,}'
```

期望只命中测试里的假 key（如 `sk-super-secret`）。

## 3. 版本与分发包

三个仓库都已初始化并配置 `origin`（`main`）：

```text
dsh-qq-bridge        Cheesy-Crab/dsh-qq-bridge
@dsh/platform-core   Cheesy-Crab/dsh-platform-core
@dsh/session-core    Cheesy-Crab/dsh-session-core
```

发版步骤：

1. 改 `package.json` 的 `version`（Node 写入，禁止 BOM）；
2. 更新 `CHANGELOG.md` 与 README 里的安装版本号；
3. 若核心包也发版，更新 `package.json` 里的 `codeload` tarball 版本并重新安装；
4. 打包：`powershell -ExecutionPolicy Bypass -File scripts\bundle.ps1`；
5. 解压到 `dist\dsh-qq-bridge-<version>-package`（profile 的 junction 目标），或直接
   `robocopy src dist\dsh-qq-bridge-<version>-package\src /MIR`；
6. 重启 DSH 并确认加载版本（见 [current-state.md](current-state.md)）。

## 4. 推送前最后确认

- `package.json` 里 `private: true`：仅通过 GitHub/path 安装时保持即可；要发 npm 需改成 `false`。
- README 的安装命令与分发形态一致（GitHub tag / 本地 `-package` 目录）。
- `docs/deploy-linux.md` 里的 `dsh` 路径按目标机实际位置改。
- `systemd/dsh-qq-bridge.service` 的 `User`、`DSH_HOME`、`ExecStart` 按目标机改。
- CI 首次运行后确认 ubuntu/windows 两个 job 都绿。

## 5. 推送

```bash
git push -u origin main
git tag v<version> && git push origin v<version>
```

推送后再做一次「从零安装」验证：

```bash
dsh plugin --profile scratch add github:Cheesy-Crab/dsh-qq-bridge#v<version>
dsh --profile scratch --dump-config | grep -A2 qq-bridge
```

## 6. 已知未完成项

- 官方 QQ 机器人适配（需要开放平台 appid/secret 与回调域名）。
- 出站非图片文件（pdf/zip）。
- 去重表持久化（重启后同一 `message_id` 会再处理）。
- 早期自检留下的空工作区清理。
- Fabric generation / effect ownership 收尾（见 [todo-next.md](todo-next.md)）。
