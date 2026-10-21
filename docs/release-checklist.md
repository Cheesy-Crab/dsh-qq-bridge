# 发布前检查清单

仓库目前**还没有 `git init`**，以下步骤在准备推送 GitHub 时执行。

## 1. 本地验证

```powershell
powershell -ExecutionPolicy Bypass -File scripts\ci.ps1
```

期望 `81 pass / 0 fail`、退出码 0。

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
- `.scratch/` 是本地调试产物，已被 `.gitignore` 忽略；`.github/`、`docs/`、`systemd/` 需要提交。
- 提交前扫一遍：

```powershell
Get-ChildItem -Recurse -File -Include *.js,*.mjs,*.md,*.json,*.yml,*.yaml,*.ps1,*.sh |
  Where-Object { $_.FullName -notmatch '\\node_modules\\|\\.scratch\\' } |
  Select-String -Pattern 'sk-[A-Za-z0-9]{12,}'
```

期望只命中测试里的假 key（如 `sk-super-secret`）。

## 3. 初始化与提交

```bash
git init
git add .
git status --short      # 确认没有 node_modules、.scratch、日志、密钥
git commit -m "feat: QQ <-> DSH workspace bridge"
git branch -M main
git remote add origin git@github.com:<owner>/<repo>.git
```

## 4. 推送前最后确认

- `package.json` 里 `private: true`：仅通过 GitHub/path 安装时保持即可；要发 npm 需改成 `false`。
- `README.md` 的安装命令是否与分发形态一致（路径 / npm / `github:`）。
- `docs/deploy-linux.md` 里的 `dsh` 路径是按 `/usr/local/bin/dsh` 写的，服务器上按实际位置改。
- `systemd/dsh-qq-bridge.service` 的 `User`、`DSH_HOME`、`ExecStart` 按目标机器改。
- CI 首次运行后确认 ubuntu/windows 两个 job 都绿。

## 5. 推送

```bash
git push -u origin main
```

推送后再做一次「从零安装」验证：

```bash
dsh plugin --profile scratch add github:<owner>/<repo>
dsh --profile scratch --dump-config | grep -A2 qq-bridge
```

## 6. 已知未完成项

- 官方 QQ 机器人适配（需要开放平台 appid/secret 与回调域名）。
- 图片/文件收发。
- 去重表持久化。
- 早期自检留下的空工作区清理。
