# Local LLM Server Scripts

Cross-platform scripts to start, stop, and health-check local LLM servers.
Supports **Ollama**, **LM Studio**, **mlx-vlm**, **llama-server**, and **vLLM** backends
with automatic detection based on platform and installed tools.

---

## Quick Start

### Windows (PowerShell)

```powershell
# Auto-detect backend (Ollama or LM Studio)
.\start-server.ps1

# Specify backend and model
.\start-server.ps1 -Backend ollama -Model qwen2.5:32b -Port 11434

# Use LM Studio (must be running already with a model loaded)
.\start-server.ps1 -Backend lmstudio -Port 1234

# Check health
.\health-server.ps1

# Stop server
.\stop-server.ps1
```

### Linux (Bash)

```bash
# Auto-detect → uses Ollama on Linux
./start-server.sh

# Specify backend and port
./start-server.sh ollama 11434

# Using environment variables
BACKEND=ollama MODEL=qwen2.5:7b PORT=11434 ./start-server.sh

# Check health
./health-server.sh

# Stop server
./stop-server.sh
```

### macOS (Ollama + MLX)

```bash
# Auto-detect → prefers mlx-vlm on Apple Silicon, falls back to Ollama
./start-server.sh auto

# Force Ollama
./start-server.sh ollama

# Force MLX with custom model path
MODEL_PATH=./models/qwen-mlx/4bit/config.json QUANT=4bit ./start-server.sh mlx 8080

# Check health (MLX default port)
./health-server.sh 8080

# Stop
./stop-server.sh
```

---

## Backend Comparison

| Backend | Windows | Linux | macOS | OpenAI-Compatible | Notes |
|---|---|---|---|---|---|
| **Ollama** | ✅ | ✅ | ✅ | ✅ `/v1/*` | Best cross-platform option. Install from [ollama.com](https://ollama.com). |
| **LM Studio** | ✅ | ✅ | ✅ | ✅ `/v1/*` | GUI app. Must be started manually; script only verifies it's running. |
| **mlx-vlm** | ❌ | ❌ | ✅ (Apple Silicon) | ✅ `/v1/*` | Best performance on Apple Silicon for supported models. `pip install mlx-vlm`. |
| **llama-server** | ✅ | ✅ | ✅ | ✅ `/v1/*` | Lightweight C/C++ server from llama.cpp. Compile or download from [ggml org](https://github.com/ggml-org/llama.cpp). |
| **vLLM** | ❌ | ✅ | ❌ | ✅ `/v1/*` | Best throughput on NVIDIA GPUs. Requires CUDA. `pip install vllm`. |

---

## Auto-Detection Logic

### Bash (Linux / macOS)

```
BACKEND=auto
  │
  ├─ macOS + arm64?
  │    ├─ python3 mlx_vlm importable? → mlx (port 8080)
  │    └─ else                        → ollama (port 11434)
  │
  └─ Linux (any arch)
       └─ ollama (port 11434)
```

### PowerShell (Windows)

```
-Backend auto
  │
  ├─ ollama command found? → ollama (port 11434)
  │
  └─ LM Studio responding on :1234? → lmstudio (port 1234)
     └─ else fallback → ollama (port 11434)
```

The `BACKEND` environment variable takes highest priority, followed by the
first positional argument, then auto-detection.

---

## Recommended Models by Available RAM

| System RAM | Recommended Model Size | Example Models | Notes |
|---|---|---|---|
| **8 GB** | 7B parameters | `qwen2.5:7b`, `llama3.1:8b`, `mistral:7b` | Q4 quantization. Good for general chat. |
| **16 GB** | 14B parameters | `qwen2.5:14b`, `qwen2:15b`, `codegemma:7b` | Q4 quantization. Better reasoning. |
| **24 GB** | 32B parameters | `qwen2.5:32b`, `deepseek-coder-v2:16b` | Q4 quantization. Strong coding & analysis. |
| **48 GB+** | 70B+ parameters | `qwen2.5:72b`, `llama3.1:70b` | Q2–Q4 quantization. Near GPT-4 quality. |

> **Tip:** Ollama auto-quantizes on pull. For MLX, download pre-quantized
> `.gguf` or MLX-format weights from HuggingFace.

---

## JARVIS Integration Examples

### 1. Direct OpenAI-Compatible API

All backends expose an OpenAI-compatible `/v1/chat/completions` endpoint.
Point your JARVIS LLM client to the server:

```bash
# After starting the server
export LLM_BASE_URL="http://127.0.0.1:11434/v1"
export LLM_API_KEY="local"          # any non-empty string
export LLM_MODEL="qwen2.5:32b"

# JARVIS picks up these env vars automatically
```

### 2. Script Wrapper

```bash
# Ensure server is running before launching JARVIS
./start-server.sh auto && \
  JARVIS_LLM_URL="http://127.0.0.1:11434/v1" jarvis start
```

### 3. Health Check in CI / Startup

```bash
#!/bin/bash
# check-and-start.sh
if ! ./health-server.sh 11434 >/dev/null 2>&1; then
    echo "LLM server not running — starting..."
    ./start-server.sh auto
fi
```

### 4. PowerShell Integration

```powershell
# Start server, wait, then launch JARVIS
.\start-server.ps1 -Backend ollama -Model qwen2.5:32b
$env:JARVIS_LLM_URL = "http://127.0.0.1:11434/v1"
jarvis start
```

---

## Scripts Reference

| Script | Platform | Description |
|---|---|---|
| `start-server.sh` | Linux / macOS | Start LLM server (Ollama or mlx-vlm). Auto-detects backend. |
| `stop-server.sh` | Linux / macOS | Stop server via PID file or `pgrep` fallback. Graceful then force kill. |
| `health-server.sh` | Linux / macOS | Curl `/v1/models`, parse with Python, print HEALTHY/UNHEALTHY + model list. |
| `start-server.ps1` | Windows | Start LLM server (Ollama or LM Studio). Auto-detects backend. |
| `stop-server.ps1` | Windows | Stop server via PID file or `Get-Process` fallback. |
| `health-server.ps1` | Windows | Invoke-RestMethod to `/v1/models`, print healthy/unhealthy + model list. |

### Environment Variables (Bash)

| Variable | Default | Description |
|---|---|---|
| `BACKEND` | `auto` | `auto`, `ollama`, or `mlx` |
| `PORT` | `11434` (ollama) / `8080` (mlx) | Server listening port |
| `MODEL` | `qwen2.5:32b` | Ollama model tag |
| `MODEL_PATH` | `${SCRIPT_DIR}/models/qwen-mlx/${QUANT}/config.json` | MLX model config path |
| `QUANT` | `4bit` | MLX quantization variant |
| `HEALTH_TIMEOUT` | `300` | Max seconds to wait for MLX model loading |

### PowerShell Parameters

| Parameter | Default | Description |
|---|---|---|
| `-Backend` | `auto` | `auto`, `ollama`, or `lmstudio` |
| `-Model` | `qwen2.5:32b` | Ollama model tag |
| `-Port` | `11434` | Server listening port |

---

## Files Generated at Runtime

| File | Description |
|---|---|
| `.server.pid` | PID of the running server process |
| `server.log` | Combined stdout/stderr log |
