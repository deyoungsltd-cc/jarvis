# OpenJARVIS

> Your open-source AI agent platform — run a fully private, sovereign AI assistant across all your devices.

OpenJARVIS is a modular AI agent system with a web dashboard, REST/WebSocket API, mobile clients (iOS & Android), and **zero-cost local LLM support** via Ollama, LM Studio, or MLX. No cloud API keys required.

---

## Architecture

```
Smartphone (iOS/Android)
  └── OpenJARVIS Mobile (Expo/React Native)
        └── Tailscale tunnel (optional, for remote access)
              └── OpenJARVIS API (Express/Bun)
                    ├── Gemini (Google AI)
                    ├── Groq
                    └── Local LLM (Ollama / LM Studio / MLX)  ← $0
                          └── Agent Loop → Tools → Memory → Services
```

### Core Components

| Component | Path | Tech | Description |
|---|---|---|---|
| **Web Dashboard** | `/` | Next.js 16, React 19, Tailwind 4, shadcn/ui | Real-time agent control panel with missions, memory, tools, voice |
| **API Server** | `/mini-services/openjarvis-api/` | Express 5, Bun, Prisma, Socket.IO | REST + WebSocket API, agent loop, tool execution, service lifecycle |
| **Mobile App** | `/mini-services/openjarvis-mobile/` | Expo 57, React Native, React Navigation | iOS & Android client with mission tracking, memory, settings |
| **Local LLM** | `/mini-services/local-llm/` | Bash + PowerShell scripts | Cross-platform local LLM server management |

---

## Features

- **Multi-Provider AI**: Switch between Gemini, Groq, and local LLMs (Ollama, LM Studio, MLX) — or use them together with fallback
- **Local LLM Auto-Detection**: Probes Ollama (port 11434), LM Studio (1234), and MLX (8080) automatically — zero config
- **Agent Loop**: Autonomous goal execution with tool calling, verification, and human-in-the-loop approval
- **Memory System**: Short-term context + long-term persistent memory with semantic search
- **Missions**: Create, track, and manage multi-step AI missions with state machine workflow
- **Voice Control**: Speech-to-text and text-to-speech via Gemini, Groq, or browser relay
- **MCP Plugin System**: Extend capabilities via Model Context Protocol plugins
- **Permission System**: Granular tool-level permissions with approval queues
- **Service Lifecycle**: Manage 20+ Docker-based microservices from the agent
- **Mobile Clients**: Native iOS and Android apps via Expo
- **Cross-Platform**: Windows, Linux, and macOS supported

---

## Quick Start

### Prerequisites

- [Bun](https://bun.sh/) >= 1.3.0
- [Node.js](https://nodejs.org/) >= 24 (or use Bun)

### 1. Clone and Install

```bash
git clone https://github.com/deyoungsltd-cc/jarvis.git
cd jarvis
bun install
```

### 2. Set Up API Server

```bash
cd mini-services/openjarvis-api
bun install
cp .env.example .env
# Edit .env — add your API keys (Gemini/Groq) or leave blank for local-only mode
bun run db:generate
bun run db:push
bun run dev
```

### 3. Set Up Local LLM (Zero Cost)

```bash
# Install Ollama from https://ollama.com
cd mini-services/local-llm

# Windows:
.\start-server.ps1

# Linux / macOS:
chmod +x *.sh
./start-server.sh
```

See [`mini-services/local-llm/README.md`](mini-services/local-llm/README.md) for full cross-platform instructions, model recommendations by RAM, and advanced configuration.

### 4. Launch Web Dashboard

```bash
cd ..
bun run dev
# Open http://localhost:3000
```

### 5. Mobile App (Optional)

```bash
cd mini-services/openjarvis-mobile
npm install
npx expo start
```

---

## Local LLM Setup

Run a fully private AI assistant with **zero API costs**. The system auto-detects which LLM server is running:

| Backend | Windows | Linux | macOS | Install |
|---|---|---|---|---|
| **Ollama** | Yes | Yes | Yes | [ollama.com](https://ollama.com) |
| **LM Studio** | Yes | Yes | Yes | [lmstudio.ai](https://lmstudio.ai) |
| **MLX** | No | No | Apple Silicon only | `pip install mlx-vlm` |

### Recommended Models by RAM

| RAM | Model Size | Examples |
|---|---|---|
| 8 GB | 7B | `qwen2.5:7b`, `llama3.1:8b` |
| 16 GB | 14B | `qwen2.5:14b`, `qwen2:15b` |
| 24 GB | 32B | `qwen2.5:32b` |
| 48 GB+ | 70B+ | `qwen2.5:72b`, `llama3.1:70b` |

---

## Environment Variables

Copy `.env.example` in the API directory and configure:

| Variable | Required | Description |
|---|---|---|
| `GEMINI_API_KEY` | For Gemini | Google AI API key |
| `GROQ_API_KEY` | For Groq | Groq API key |
| `LOCAL_LLM_BASE_URL` | No | Override auto-detect (e.g. `http://localhost:11434/v1`) |
| `LOCAL_LLM_MODEL` | No | Override auto-detected model name |
| `LOCAL_LLM_TEMPERATURE` | No | Generation temperature (default: 0.7) |
| `LOCAL_LLM_MAX_TOKENS` | No | Max tokens per response (default: 4096) |
| `LOCAL_LLM_TIMEOUT_MS` | No | Request timeout in ms (default: 120000) |

Leave cloud API keys blank to run in **local-only mode**.

---

## Project Structure

```
jarvis/
├── src/                          # Next.js web dashboard
│   ├── app/                    # App router pages
│   ├── components/
│   │   ├── openjarvis/           # JARVIS-specific UI components
│   │   └── ui/                   # shadcn/ui components
│   ├── hooks/                  # React hooks
│   └── lib/                    # Utilities and types
├── mini-services/
│   ├── openjarvis-api/          # Core API server
│   │   ├── src/
│   │   │   ├── agent/           # Agent loop, providers, tools
│   │   │   │   ├── localLLMProvider.ts  # Local LLM with auto-detection
│   │   │   │   ├── modelProvider.ts     # Provider factory (gemini/groq/local)
│   │   │   │   └── tools/              # Computer control, web search, etc.
│   │   │   ├── routes/           # REST endpoints
│   │   │   ├── services/         # Business logic
│   │   │   ├── voice/            # TTS/STT providers
│   │   │   └── mcp/              # MCP plugin system
│   │   ├── compose/             # Docker Compose files
│   │   └── prisma/              # Database schema & migrations
│   ├── openjarvis-mobile/       # React Native mobile app
│   └── local-llm/             # Local LLM server scripts
├── prisma/                       # Dashboard database
├── public/                       # Static assets
└── tests/                       # Test scripts
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| **Web Frontend** | Next.js 16, React 19, Tailwind CSS 4, shadcn/ui, Recharts, Framer Motion |
| **API Server** | Express 5, Bun runtime, TypeScript, Prisma ORM, Socket.IO |
| **Mobile** | Expo 57, React Native, React Navigation |
| **AI Providers** | Google Gemini, Groq, Ollama, LM Studio, MLX |
| **Database** | SQLite (Prisma) |
| **Real-time** | Socket.IO (WebSocket) |
| **Voice** | Gemini TTS/STT, Groq TTS, Browser Web Speech API |
| **Plugins** | Model Context Protocol (MCP) |

---

## API Endpoints

| Method | Path | Description |
|---|---|---|
| POST | `/agent/chat` | Send message to AI agent |
| GET | `/agent/local-llm/health` | Local LLM health check + auto-detect |
| GET | `/agent/local-llm/status` | Local LLM config + install instructions |
| GET | `/missions` | List all missions |
| POST | `/missions` | Create new mission |
| GET | `/memory` | List memory entries |
| GET | `/tools` | List available tools |
| GET | `/services` | List service catalog |
| GET | `/voice/status` | Voice provider status |
| GET/POST | `/mobile/*` | Mobile client endpoints |

---

## License

Private — All rights reserved.
