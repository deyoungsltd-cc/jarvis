#!/usr/bin/env bash
set -euo pipefail

# ============================================================================
# stop-server.sh — Gracefully stop a local LLM server (Linux / macOS)
# ============================================================================
# Usage:  ./stop-server.sh
# ============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PID_FILE="${SCRIPT_DIR}/.server.pid"
LOG_FILE="${SCRIPT_DIR}/server.log"
GRACE_PERIOD=30

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "${LOG_FILE}"; }

# ── stop by PID file ──────────────────────────────────────────────────────
stop_from_pid_file() {
    if [[ ! -f "${PID_FILE}" ]]; then
        log "No PID file found at ${PID_FILE}"
        return 1
    fi

    local pid
    pid=$(<"${PID_FILE}")

    if ! kill -0 "${pid}" 2>/dev/null; then
        log "PID ${pid} from file is not running (stale PID file)."
        rm -f "${PID_FILE}"
        return 0
    fi

    log "Stopping server PID ${pid} (graceful, ${GRACE_PERIOD}s timeout)..."
    kill -TERM "${pid}" 2>/dev/null || true

    # Wait for process to exit gracefully
    local waited=0
    while (( waited < GRACE_PERIOD )); do
        if ! kill -0 "${pid}" 2>/dev/null; then
            log "Server stopped gracefully after ${waited}s."
            rm -f "${PID_FILE}"
            return 0
        fi
        sleep 1
        (( waited += 1 ))
    done

    # Force kill
    log "Server did not stop gracefully after ${GRACE_PERIOD}s — sending SIGKILL."
    kill -9 "${pid}" 2>/dev/null || true
    sleep 1

    if ! kill -0 "${pid}" 2>/dev/null; then
        log "Server force-killed."
    else
        log "ERROR: Could not kill PID ${pid}."
    fi

    rm -f "${PID_FILE}"
    return 0
}

# ── fallback: pgrep ───────────────────────────────────────────────────────
stop_by_pgrep() {
    local pids=()
    local found=false

    # Try ollama
    local ollama_pids
    ollama_pids=$(pgrep -f 'ollama serve' 2>/dev/null || true)
    if [[ -n "${ollama_pids}" ]]; then
        log "Found ollama serve processes via pgrep: ${ollama_pids}"
        for p in ${ollama_pids}; do
            pids+=("${p}")
        done
        found=true
    fi

    # Try mlx_vlm
    local mlx_pids
    mlx_pids=$(pgrep -f 'mlx_vlm.server' 2>/dev/null || true)
    if [[ -n "${mlx_pids}" ]]; then
        log "Found mlx_vlm server processes via pgrep: ${mlx_pids}"
        for p in ${mlx_pids}; do
            pids+=("${p}")
        done
        found=true
    fi

    if [[ "${found}" == "false" ]]; then
        log "No ollama or mlx_vlm processes found via pgrep."
        return 1
    fi

    for pid in "${pids[@]}"; do
        log "Killing PID ${pid}..."
        kill -TERM "${pid}" 2>/dev/null || true
    done

    local waited=0
    while (( waited < GRACE_PERIOD )); do
        local all_dead=true
        for pid in "${pids[@]}"; do
            if kill -0 "${pid}" 2>/dev/null; then
                all_dead=false
            fi
        done
        if [[ "${all_dead}" == "true" ]]; then
            log "All pgrep-found processes stopped after ${waited}s."
            return 0
        fi
        sleep 1
        (( waited += 1 ))
    done

    for pid in "${pids[@]}"; do
        if kill -0 "${pid}" 2>/dev/null; then
            log "Force-killing PID ${pid}..."
            kill -9 "${pid}" 2>/dev/null || true
        fi
    done

    log "Fallback pgrep stop complete."
    return 0
}

# ── main ──────────────────────────────────────────────────────────────────
log "stop-server.sh: Attempting to stop local LLM server..."

if stop_from_pid_file; then
    log "Server stopped (via PID file)."
    exit 0
fi

log "PID file method failed or not available. Trying pgrep fallback..."
if stop_by_pgrep; then
    log "Server stopped (via pgrep fallback)."
    exit 0
fi

log "No running LLM server found. Nothing to stop."
exit 0
