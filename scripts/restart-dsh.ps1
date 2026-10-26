<#
.SYNOPSIS
  重启 DeepSeek Harness（连带 QQ 桥和 NapCat），可在远端命令行直接执行。

.DESCRIPTION
  改完 dsh-qq-bridge 源码后必须重启 DSH 才生效：Node 进程里已加载的模块没有热更新。
  脚本只做三件事：优雅关闭 → 重新拉起 → 轮询 /qq-bridge/bridge/status 确认 OneBot 已重连。
  日志写到 <DSH_HOME>\logs\restart-<时间戳>.log。

  注意：脚本会结束整个 DSH 进程树（含 NapCat 子进程）。若在 DSH 会话内部执行
  （例如让 agent 调用），会把自己一起杀掉，必须加 -Force 才继续；正常请在外部终端运行。

.PARAMETER AppPath
  DeepSeek Harness 可执行文件。省略时先取正在运行的进程路径，再退回 E:\dsh\DeepSeek Harness.exe。

.PARAMETER Port
  DSH Web 端口。省略时取 $env:DSH_WEB_PORT，再退回 64490。

.PARAMETER TimeoutSec
  等待桥接重连的最长秒数，默认 120。NapCat 拉起 + 扫码快速登录通常 20–60 秒。

.PARAMETER GracefulSec
  关闭窗口后等待进程自行退出的秒数，超时才强杀，默认 15。

.PARAMETER SkipStart
  只停止，不重新启动（用于换版本前先停机）。

.PARAMETER Force
  检测到从 DSH 内部运行时仍然继续。

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File E:\dsh\工作区对接QQ\scripts\restart-dsh.ps1

.EXAMPLE
  # 远端只停机，等新版本就位后再启
  .\restart-dsh.ps1 -SkipStart

.EXAMPLE
  # 端口不是默认值
  .\restart-dsh.ps1 -Port 64490 -TimeoutSec 180
#>
[CmdletBinding()]
param(
  [string]$AppPath,
  [int]$Port = 0,
  [int]$TimeoutSec = 120,
  [int]$GracefulSec = 15,
  [switch]$SkipStart,
  [switch]$Force,
  [switch]$AgentLog
)

$ErrorActionPreference = 'Stop'
$processName = 'DeepSeek Harness'
$exitOk = 0
$exitFailed = 1
$exitNoApp = 2
$exitRefused = 3

$dshHome = if ($env:DSH_HOME) { $env:DSH_HOME } else { Join-Path $env:USERPROFILE '.dsh' }
$logDir = Join-Path $dshHome 'logs'
$null = New-Item -ItemType Directory -Force -Path $logDir
$logFile = Join-Path $logDir ("restart-{0}.log" -f (Get-Date -Format 'yyyyMMdd-HHmmss'))

function Write-Log {
  param([string]$Message)
  $line = "{0} {1}" -f (Get-Date -Format 'HH:mm:ss'), $Message
  Write-Host $line
  Add-Content -Path $logFile -Value $line -Encoding utf8
}

function Resolve-Port {
  if ($Port -gt 0) { return $Port }
  if ($env:DSH_WEB_PORT) {
    $parsed = 0
    if ([int]::TryParse($env:DSH_WEB_PORT, [ref]$parsed) -and $parsed -gt 0) { return $parsed }
  }
  return 0
}

function Get-BridgeStatus {
  param([int]$ListenPort)
  $url = "http://127.0.0.1:$ListenPort/qq-bridge/bridge/status"
  return Invoke-RestMethod -Uri $url -TimeoutSec 5 -UseBasicParsing
}

function Test-InsideDsh {
  foreach ($name in @('DSH_SESSION_ID', 'DSH_HARNESS_SESSION', 'DSH_WEB_URL', 'DSH_CLIENT')) {
    if ([Environment]::GetEnvironmentVariable($name)) { return $true }
  }
  return $false
}

Write-Log "重启 DeepSeek Harness（日志：$logFile）"

if ((Test-InsideDsh) -and -not $Force) {
  Write-Log '检测到正在 DSH 会话内部运行：继续会杀掉调用方自身，已中止。请在外部终端运行，或加 -Force。'
  exit $exitRefused
}

$listenPort = Resolve-Port

# 1. 定位可执行文件
$processes = @(Get-Process -Name $processName -ErrorAction SilentlyContinue)
if (-not $AppPath) {
  $running = $processes | Sort-Object StartTime | Select-Object -First 1
  if ($running -and $running.Path) {
    $AppPath = $running.Path
  } elseif (Test-Path 'E:\dsh\DeepSeek Harness.exe') {
    $AppPath = 'E:\dsh\DeepSeek Harness.exe'
  }
}
if (-not $AppPath) {
  Write-Log "找不到 $processName：请用 -AppPath 指定可执行文件。"
  exit $exitNoApp
}
if (-not (Test-Path $AppPath)) {
  Write-Log "可执行文件不存在：$AppPath"
  exit $exitNoApp
}
Write-Log "程序：$AppPath"
if ($listenPort -gt 0) { Write-Log "端口：$listenPort" } else { Write-Log '端口：自动发现（DSH 每次启动可能不同）' }

# 2. 关闭：先给主窗口发关闭消息，超时才强杀进程树
if ($processes.Count -gt 0) {
  $main = $processes | Sort-Object StartTime | Select-Object -First 1
  Write-Log ("停止中：{0} 个进程，主进程 PID {1}" -f $processes.Count, $main.Id)
  try {
    $null = $main.CloseMainWindow()
  } catch {
    Write-Log "关闭窗口失败（可能没有窗口）：$($_.Exception.Message)"
  }

  $deadline = (Get-Date).AddSeconds($GracefulSec)
  while ((Get-Date) -lt $deadline) {
    Start-Sleep -Milliseconds 500
    if (-not (Get-Process -Name $processName -ErrorAction SilentlyContinue)) { break }
  }

  $left = @(Get-Process -Name $processName -ErrorAction SilentlyContinue)
  if ($left.Count -gt 0) {
    Write-Log ("优雅退出超时，强制结束 {0} 个进程（含 NapCat 子进程）" -f $left.Count)
    foreach ($item in $left) {
      try {
        & taskkill /PID $item.Id /T /F 2>&1 | Out-Null
      } catch {
        Write-Log "结束 PID $($item.Id) 失败：$($_.Exception.Message)"
      }
    }
  } else {
    Write-Log '已正常退出。'
  }

  $deadline = (Get-Date).AddSeconds(15)
  while ((Get-Date) -lt $deadline) {
    Start-Sleep -Milliseconds 500
    if (-not (Get-Process -Name $processName -ErrorAction SilentlyContinue)) { break }
  }
  if (Get-Process -Name $processName -ErrorAction SilentlyContinue) {
    Write-Log '仍有 DSH 进程存活，重启可能失败。'
    exit $exitFailed
  }
} else {
  Write-Log 'DSH 当前没有运行。'
}

if ($SkipStart) {
  Write-Log '按 -SkipStart 只停止，不重新启动。'
  exit $exitOk
}

# 3. 重新拉起（独立进程，不继承本脚本的生命周期）
Write-Log '启动中…'
if ($AgentLog) {
  $env:DSH_QQ_AGENT_LOG = '1'
  Write-Log '已开启桥接诊断日志：~/.dsh/logs/agent-ext.log'
}
$workdir = Split-Path -Parent $AppPath
$null = Start-Process -FilePath $AppPath -WorkingDirectory $workdir

# 4. 等待桥接重连。DSH 每次启动的 Web 端口可能不同，先在进程的监听端口里发现它。
$deadline = (Get-Date).AddSeconds($TimeoutSec)
$lastError = ''
$connected = $false
$bridgePort = $listenPort

function Get-CandidatePorts {
  $ports = New-Object System.Collections.Generic.List[int]
  if ($listenPort -gt 0 -and -not $ports.Contains($listenPort)) { $ports.Add($listenPort) }
  foreach ($proc in @(Get-Process -Name $processName -ErrorAction SilentlyContinue)) {
    foreach ($connection in @(Get-NetTCPConnection -State Listen -OwningProcess $proc.Id -ErrorAction SilentlyContinue)) {
      $candidate = [int]$connection.LocalPort
      if ($connection.LocalAddress -eq '127.0.0.1' -and -not $ports.Contains($candidate)) { $ports.Add($candidate) }
    }
  }
  return $ports
}

while ((Get-Date) -lt $deadline -and -not $connected) {
  Start-Sleep -Seconds 2
  foreach ($candidate in (Get-CandidatePorts)) {
    try {
      $status = Get-BridgeStatus -ListenPort $candidate
    } catch {
      $lastError = $_.Exception.Message
      continue
    }
    $bridgePort = $candidate
    if ($status.transport.connected) {
      $connected = $true
      Write-Log ("桥接已重连：端口 {0}，OneBot 客户端 {1} 个，聊天 {2} 个" -f $candidate, $status.transport.clients, $status.chats.chats)
      break
    }
    $lastError = '桥接已就绪，但 NapCat 还没连上来'
    Write-Log $lastError
  }
}

if (-not $connected) {
  Write-Log ("等待 {0} 秒仍未重连：{1}" -f $TimeoutSec, $lastError)
  $qrFile = ''
  if ($bridgePort -gt 0) {
    try {
      $napcat = Invoke-RestMethod -Uri "http://127.0.0.1:$bridgePort/qq-bridge/napcat/status" -TimeoutSec 5 -UseBasicParsing
      if ($napcat.qrFile) { $qrFile = $napcat.qrFile }
    } catch {
      Write-Log "读取 NapCat 状态失败：$($_.Exception.Message)"
    }
  }
  if ($qrFile) {
    Write-Log "NapCat 需要重新扫码：$qrFile"
    Write-Log "在 DSH 设置页点「显示二维码」，或 GET http://127.0.0.1:$bridgePort/qq-bridge/napcat/qr"
  } else {
    Write-Log '排查：GET /qq-bridge/napcat/status 看 NapCat 是否在跑；二维码在 /qq-bridge/napcat/qr。'
  }
  exit $exitFailed
}

try {
  $napcat = Invoke-RestMethod -Uri "http://127.0.0.1:$bridgePort/qq-bridge/napcat/status" -TimeoutSec 5 -UseBasicParsing
  Write-Log ("NapCat：运行中={0} 受管={1} PID={2}" -f $napcat.running, $napcat.managed, $napcat.pid)
} catch {
  Write-Log "读取 NapCat 状态失败：$($_.Exception.Message)"
}

Write-Log '完成。'
exit $exitOk
