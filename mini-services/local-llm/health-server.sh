#!/usr/bin/env bash
set -euo pipefail

# ============================================================================
# health-server.sh — Check health of a local LLM server (Linux / macOS)
# ============================================================================
# Usage:  ./health-server.sh [PORT]
# ============================================================================

PORT="${PORT:-${1:-11434}}"
URL="http://127.0.0.1:${PORT}/v1/models"

# ── check curl response ───────────────────────────────────────────────────
response=$(curl -sf --max-time 10 "${URL}" 2>/dev/null || echo "")

if [[ -z "${response}" ]]; then
    echo "UNHEALTHY — Could not reach ${URL}"
    echo "  Is the server running? Try:"
    echo "    ./start-server.sh"
    exit 1
fi

# ── parse with python3 ────────────────────────────────────────────────────
if command -v python3 &>/dev/null; then
    model_list=$(echo "${response}" | python3 -c "
import sys, json
data = json.load(sys.stdin)
models = data.get('data', [])
if not models:
    print('  (no models listed)')
else:
    for m in models:
        mid = m.get('id', '(unknown)')
        print(f'  - {mid}')
" 2>/dev/null || echo "  (failed to parse response)")
else
    # Fallback: crude grep
    model_list=$(echo "${response}" | python3 -c "
import sys, json; data = json.load(sys.stdin)
for m in data.get('data', []): print('  - ' + m.get('id', '(unknown)'))
" 2>/dev/null || echo "  (python3 not available — raw output below)")
    if [[ "${model_list}" == *"not available"* ]]; then
        echo "${response}"
        echo ""
        echo "HEALTHY (but install python3 for cleaner output)"
        exit 0
    fi
fi

echo "HEALTHY — Server responding at http://127.0.0.1:${PORT}"
echo "Models:"
echo "${model_list}"
