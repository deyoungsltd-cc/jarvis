# ============================================================================
# start-server.ps1 — Windows PowerShell LLM server starter
# ============================================================================
# Usage:
#   .\start-server.ps1
#   .\start-server.ps1 -Backend ollama -Model llama3.1:70b -Port 11435
#   .\start-server.ps1 -Backend lmstudio -Port 1234
# ============================================================================

param(
    [ValidateSet('auto', 'ollama', 'lmstudio')]
    [string]$Backend = $(if ($env:BACKEND) { $env:BACKEND } else { 'auto' }),

    [string]$Model = $(if ($env:MODEL) { $env:MODEL } else { 'qwen2.5:32b' }),

    [int]$Port = $(if ($env:PORT) { [int]$env:PORT } else { 11434 })
)

$ErrorActionPreference = 'Stop'
$ScriptDir = $PSScriptRoot
if (-not $ScriptDir) { $ScriptDir = (Get-Location).Path }
$PidFile   = Join-Path $ScriptDir '.server.pid'
$LogFile   = Join-Path $ScriptDir 'server.log'

# ── helpers ───────────────────────────────────────────────────────────────
function Write-Log {
    param([string]$Message)
    $ts = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
    $line = "[$ts] $Message"
    Write-Host $line
    Add-Content -Path $LogFile -Value $line -Encoding UTF8
}

function Test-Port {
    param([int]$Port)
    try {
        $null = Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue
        return $true
    } catch {
        return $false
    }
}

function Wait-ForHealth {
    param(
        [int]$Port,
        [int]$TimeoutSeconds = 120
    )
    $url = "http://127.0.0.1:${Port}/v1/models"
    Write-Log "Waiting for ${url} to respond (timeout ${TimeoutSeconds}s)..."
    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    while ($sw.Elapsed.TotalSeconds -lt $TimeoutSeconds) {
        try {
            $null = Invoke-RestMethod -Uri $url -TimeoutSec 5 -ErrorAction Stop
            Write-Log "Server is healthy after $([math]::Round($sw.Elapsed.TotalSeconds))s."
            return $true
        } catch {
            Start-Sleep -Seconds 2
        }
    }
    Write-Log "ERROR: Server did not become healthy within ${TimeoutSeconds}s."
    return $false
}

# ── detect backend ────────────────────────────────────────────────────────
function Resolve-Backend {
    if ($Backend -ne 'auto') { return $Backend }

    # Check for ollama
    $ollamaCmd = Get-Command 'ollama' -ErrorAction SilentlyContinue
    if ($ollamaCmd) {
        Write-Log "Auto-detected backend: ollama"
        return 'ollama'
    }

    # Check for LM Studio on default port 1234
    try {
        $null = Invoke-RestMethod -Uri 'http://127.0.0.1:1234/v1/models' -TimeoutSec 3 -ErrorAction Stop
        Write-Log "Auto-detected backend: lmstudio (running on port 1234)"
        return 'lmstudio'
    } catch {
        Write-Log "Auto-detected backend: ollama (default — LM Studio not detected on port 1234)"
        return 'ollama'
    }
}

# ── start ollama ──────────────────────────────────────────────────────────
function Start-Ollama {
    param([int]$Port, [string]$Model)

    if (-not (Get-Command 'ollama' -ErrorAction SilentlyContinue)) {
        Write-Log "ERROR: 'ollama' command not found. Install from https://ollama.com"
        exit 1
    }

    # Pull model if needed
    $modelList = ollama list 2>&1
    if ($modelList -notmatch [regex]::Escape($Model)) {
        Write-Log "Pulling model ${Model}..."
        ollama pull $Model 2>&1 | ForEach-Object { Write-Log $_ }
    } else {
        Write-Log "Model ${Model} is already available."
    }

    # Set env var and start
    $env:OLLAMA_HOST = "127.0.0.1:${Port}"
    Write-Log "Starting ollama serve on port ${Port}..."
    $proc = Start-Process -FilePath 'ollama' -ArgumentList 'serve' \
        -WindowStyle Hidden -PassThru \
        -RedirectStandardOutput $LogFile \
        -RedirectStandardError (Join-Path $ScriptDir 'server.err.log')

    $proc.Id | Out-File -FilePath $PidFile -Encoding UTF8
    Write-Log "Ollama PID: $($proc.Id)"

    if (-not (Wait-ForHealth -Port $Port -TimeoutSeconds 120)) {
        Write-Log "ERROR: Ollama failed to start."
        exit 1
    }
}

# ── start lmstudio ────────────────────────────────────────────────────────
function Start-LMStudio {
    param([int]$Port)

    $url = "http://127.0.0.1:${Port}/v1/models"
    Write-Log "Checking if LM Studio is already running on port ${Port}..."
    try {
        $null = Invoke-RestMethod -Uri $url -TimeoutSec 5 -ErrorAction Stop
        Write-Log "LM Studio is already running on port ${Port}."
        return
    } catch {
        Write-Log "LM Studio is NOT running on port ${Port}."
        Write-Log "Please start LM Studio manually and load a model, then re-run this script."
        Write-Log "  1. Open LM Studio"
        Write-Log "  2. Load a model (local or downloaded)"
        Write-Log "  3. Start the local server in LM Studio (default port 1234)"
        exit 1
    }
}

# ── main ──────────────────────────────────────────────────────────────────
$resolvedBackend = Resolve-Backend

# Adjust default port for lmstudio
if ($resolvedBackend -eq 'lmstudio' -and $Port -eq 11434 -and -not $env:PORT) {
    $Port = 1234
}

Write-Log "========================================"
Write-Log " start-server.ps1"
Write-Log "   backend : $resolvedBackend"
Write-Log "   port    : $Port"
Write-Log "   model   : $Model"
Write-Log "   pid file: $PidFile"
Write-Log "   log file: $LogFile"
Write-Log "========================================"

switch ($resolvedBackend) {
    'ollama'  { Start-Ollama -Port $Port -Model $Model }
    'lmstudio' { Start-LMStudio -Port $Port }
    default {
        Write-Log "ERROR: Unknown backend '${resolvedBackend}'. Use: auto, ollama, lmstudio"
        exit 1
    }
}

Write-Log "Server started successfully."
Write-Log "  Endpoint: http://127.0.0.1:${Port}/v1"
Write-Log "  Models:   http://127.0.0.1:${Port}/v1/models"
