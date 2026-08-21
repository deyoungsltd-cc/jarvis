#!/usr/bin/env bash
set -euo pipefail

# ============================================================================
# start-server.sh — Cross-platform LLM server starter (Linux / macOS)
# ============================================================================
# Usage:
#   ./start-server.sh [BACKEND] [PORT]
#   BACKEND=ollama ./start-server.sh          # env var takes precedence
#   ./start-server.sh mlx 8080                # positional args as fallback
# ============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PID_FILE="${SCRIPT_DIR}/.server.pid"
LOG_FILE="${SCRIPT_DIR}/server.log"

# ── defaults ──────────────────────────────────────────────────────────────
BACKEND="${BACKEND:-${1:-auto}}"
PORT="${PORT:-${2:-}}"
MODEL="${MODEL:-qwen2.5:32b}"
MODEL_PATH="${MODEL_PATH:-}"
QUANT="${QUANT:-4bit}"
HEALTH_TIMEOUT="${HEALTH_TIMEOUT:-300}"   # 5 minutes for MLX model loading
OLLAMA_HEALTH_TIMEOUT="${OLLAMA_HEALTH_TIMEOUT:-120}"

# ── helpers ───────────────────────────────────────────────────────────────
log()  { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "${LOG_FILE}"; }

cleanup_pid() {
    if [[ -f "${PID_FILE}" ]]; then
        local old_pid
        old_pid=$(<"${PID_FILE}")
        if kill -0 "${old_pid}" 2>/dev/null; then
            log "WARNING: Stopping previous server (PID ${old_pid})"
            kill -TERM "${old_pid}" 2>/dev/null || true
            sleep 2
            kill -9 "${old_pid}" 2>/dev/null || true
        fi
        rm -f "${PID_FILE}"
    fi
}

wait_for_health() {
    local port="$1"
    local timeout="$2"
    local url="http://127.0.0.1:${port}/v1/models"
    local elapsed=0
    log "Waiting for ${url} to respond (timeout ${timeout}s)..."
    while (( elapsed < timeout )); do
        if curl -sf --max-time 5 "${url}" >/dev/null 2>&1; then
            log "Server is healthy after ${elapsed}s."
            return 0
        fi
        sleep 2
        (( elapsed += 2 ))
    done
    log "ERROR: Server did not become healthy within ${timeout}s."
    return 1
}

# ── detect backend ────────────────────────────────────────────────────────
detect_backend() {
    local os kernel_arch
    os="$(uname -s)"
    kernel_arch="$(uname -m)"

    if [[ "${os}" == "Darwin" && "${kernel_arch}" == "arm64" ]]; then
        # macOS Apple Silicon — prefer mlx-vlm, fall back to ollama
        if python3 -c "import mlx_vlm" 2>/dev/null; then
            log "Auto-detected backend: mlx (macOS arm64 with mlx_vlm installed)"
            BACKEND="mlx"
        else
            log "Auto-detected backend: ollama (macOS arm64, mlx_vlm not found)"
            BACKEND="ollama"
        fi
    else
        # Linux (and macOS x86_64) — use ollama
        log "Auto-detected backend: ollama (${os} ${kernel_arch})"
        BACKEND="ollama"
    fi
}

# ── ollama ────────────────────────────────────────────────────────────────
start_ollama() {
    local port="${1:-11434}"

    # Check ollama is installed
    if ! command -v ollama &>/dev/null; then
        log "ERROR: 'ollama' command not found. Install from https://ollama.com"
        exit 1
    fi

    # Pull model if not already present
    if ! ollama list 2>/dev/null | grep -q "${MODEL}"; then
        log "Pulling model ${MODEL}..."
        ollama pull "${MODEL}" 2>&1 | tee -a "${LOG_FILE}"
    else
        log "Model ${MODEL} is already available."
    fi

    # Start ollama serve
    cleanup_pid
    log "Starting ollama serve on port ${port}..."
    OLLAMA_HOST="127.0.0.1:${port}" ollama serve >>"${LOG_FILE}" 2>&1 &
    local pid=$!
    echo "${pid}" > "${PID_FILE}"
    log "Ollama PID: ${pid}"

    # Wait for health
    wait_for_health "${port}" "${OLLAMA_HEALTH_TIMEOUT}"
}

# ── mlx ───────────────────────────────────────────────────────────────────
start_mlx() {
    local port="${1:-8080}"

    # Check python3 + mlx_vlm
    if ! command -v python3 &>/dev/null; then
        log "ERROR: python3 not found."
        exit 1
    fi
    if ! python3 -c "import mlx_vlm" 2>/dev/null; then
        log "ERROR: mlx_vlm is not installed. Run: pip install mlx-vlm"
        exit 1
    fi

    # Resolve model path
    local resolved_model="${MODEL_PATH}"
    if [[ -z "${resolved_model}" ]]; then
        resolved_model="${SCRIPT_DIR}/models/qwen-mlx/${QUANT}/config.json"
    fi
    if [[ ! -f "${resolved_model}" ]]; then
        log "ERROR: MLX model config not found at: ${resolved_model}"
        log "Set MODEL_PATH or place model at: ${SCRIPT_DIR}/models/qwen-mlx/${QUANT}/config.json"
        exit 1
    fi

    # Extract model directory from config.json path (mlx_vlm expects the model dir)
    local model_dir
    model_dir="$(dirname "${resolved_model}")"

    cleanup_pid
    log "Starting mlx_vlm server..."
    log "  model: ${model_dir}"
    log "  port:  ${port}"
    log "  host:  127.0.0.1"

    python3 -m mlx_vlm server \
        --model "${model_dir}" \
        --port "${port}" \
        --host 127.0.0.1 \
        >>"${LOG_FILE}" 2>&1 &
    local pid=$!
    echo "${pid}" > "${PID_FILE}"
    log "mlx_vlm PID: ${pid}"

    # MLX model loading can be slow — allow up to 5 minutes
    wait_for_health "${port}" "${HEALTH_TIMEOUT}"
}

# ── main ──────────────────────────────────────────────────────────────────
if [[ "${BACKEND}" == "auto" ]]; then
    detect_backend
fi

BACKEND="$(echo "${BACKEND}" | tr '[:upper:]' '[:lower:]')"

# Set default port per backend
if [[ -z "${PORT}" ]]; then
    case "${BACKEND}" in
        ollama) PORT=11434 ;;
        mlx)    PORT=8080  ;;
        *)
            log "ERROR: Unknown backend '${BACKEND}'. Use: auto, ollama, mlx"
            exit 1
            ;;
    esac
fi

log "========================================"
log " start-server.sh"
log "   backend : ${BACKEND}"
log "   port    : ${PORT}"
log "   model   : ${MODEL}"
log "   pid file: ${PID_FILE}"
log "   log file: ${LOG_FILE}"
log "========================================"

case "${BACKEND}" in
    ollama) start_ollama "${PORT}" ;;
    mlx)    start_mlx "${PORT}" ;;
    *)
        log "ERROR: Unknown backend '${BACKEND}'. Use: auto, ollama, mlx"
        exit 1
        ;;
esac

log "Server started successfully."
log "  Endpoint: http://127.0.0.1:${PORT}/v1"
log "  Models:   http://127.0.0.1:${PORT}/v1/models"
