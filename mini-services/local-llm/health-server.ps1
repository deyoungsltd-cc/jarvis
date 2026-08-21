# ============================================================================
# health-server.ps1 — Check health of a local LLM server (Windows)
# ============================================================================
# Usage:  .\health-server.ps1 [-Port 11434]
# ============================================================================

param(
    [int]$Port = $(if ($env:PORT) { [int]$env:PORT } else { 11434 })
)

$ErrorActionPreference = 'Stop'
$url = "http://127.0.0.1:${Port}/v1/models"

try {
    $response = Invoke-RestMethod -Uri $url -TimeoutSec 10 -ErrorAction Stop

    Write-Host "HEALTHY — Server responding at http://127.0.0.1:${Port}"
    Write-Host "Models:"

    if ($response.data -and $response.data.Count -gt 0) {
        foreach ($m in $response.data) {
            Write-Host ("  - " + $m.id)
        }
    } else {
        Write-Host "  (no models listed)"
    }

} catch {
    Write-Host "UNHEALTHY — Could not reach ${url}"
    Write-Host "  Is the server running? Try:"
    Write-Host "    .\start-server.ps1"
    exit 1
}