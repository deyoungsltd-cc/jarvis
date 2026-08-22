# ============================================================================
# stop-server.ps1 — Stop a local LLM server (Windows PowerShell)
# ============================================================================
# Usage:  .\stop-server.ps1
# ============================================================================

$ErrorActionPreference = 'Stop'
$ScriptDir = $PSScriptRoot
if (-not $ScriptDir) { $ScriptDir = (Get-Location).Path }
$PidFile = Join-Path $ScriptDir '.server.pid'
$LogFile = Join-Path $ScriptDir 'server.log'

function Write-Log {
    param([string]$Message)
    $ts = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
    $line = "[$ts] $Message"
    Write-Host $line
    Add-Content -Path $LogFile -Value $line -Encoding UTF8
}

Write-Log "stop-server.ps1: Attempting to stop local LLM server..."

$stopped = $false

# ── stop via PID file ─────────────────────────────────────────────────────
if (Test-Path $PidFile) {
    $pid = Get-Content $PidFile -Raw | ForEach-Object { $_.Trim() }
    Write-Log "Found PID file with PID: ${pid}"

    try {
        $proc = Get-Process -Id $pid -ErrorAction Stop
        Write-Log "Stopping process ${pid} ($($proc.ProcessName))..."
        Stop-Process -Id $pid -Force -ErrorAction Stop
        Start-Sleep -Seconds 2
        Write-Log "Process ${pid} stopped."
        $stopped = $true
    } catch {
        Write-Log "PID ${pid} is not running (stale PID file)."
    }
    Remove-Item -Path $PidFile -Force -ErrorAction SilentlyContinue
}

# ── fallback: Get-Process ─────────────────────────────────────────────────
if (-not $stopped) {
    Write-Log "PID file method failed. Trying process name fallback..."

    $proc = Get-Process -Name 'ollama' -ErrorAction SilentlyContinue
    if ($proc) {
        Write-Log "Found ollama process(es): $($proc.Id -join ', ')"
        $proc | ForEach-Object {
            Write-Log "Stopping PID $($_.Id)..."
            Stop-Process -Id $_.Id -Force -ErrorAction Stop
        }
        $stopped = $true
    }
}

if ($stopped) {
    Write-Log "Server stopped successfully."
} else {
    Write-Log "No running LLM server found. Nothing to stop."
}