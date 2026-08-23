# OpenJARVIS

> Your open-source AI agent platform — run a fully private, sovereign AI assistant across all your devices.

OpenJARVIS is a modular AI agent system with a web dashboard, REST/WebSocket API, mobile clients (iOS & Android), and **zero-cost local LLM support** powered by **Qwen3.8-27B-Uncensored** via Ollama, LM Studio, or MLX. No cloud API keys required.

---

## Architecture

```
Smartphone (iOS/Android)
  └── OpenJARVIS Mobile (Expo/React Native)
        └── Tailscale tunnel (optional, for remote access)
              └── OpenJARVIS API (Express/Bun)
                    ├── Gemini (Google AI)
                    ├── Groq
                    └── Qwen3.8-27B (Local — Ollama / LM Studio / MLX)  ← $0
                          └── Agent Loop → Tools → Memory → Services
```

### Core Components

| Component | Path | Tech | Description |
|---|---|---|---|
| **Web Dashboard** | `/` | Next.js 16, React 19, Tailwind 4, shadcn/ui | Real-time agent control panel with dark mode, sound effects, onboarding wizard |
| **API Server** | `/mini-services/openjarvis-api/` | Express 5, Bun, Prisma, Socket.IO | REST + WebSocket + SSE API, agent loop, tool execution, service lifecycle |
| **Mobile App** | `/mini-services/openjarvis-mobile/` | Expo 57, React Native, React Navigation | iOS & Android client with push notifications, mission tracking |
| **Desktop Tray** | `/mini-services/desktop-tray/` | Electron | Windows system tray app, auto-start on boot, process management |
| **Local LLM** | `/mini-services/local-llm/` | Bash + PowerShell scripts | Cross-platform local LLM server management |
| **Plugins** | `/mini-services/openjarvis-api/plugins/` | JavaScript | Drop-in tool plugins (calculator, weather, hello-world) |

---

## Features

### AI & Intelligence
- **Qwen3.8-27B-Uncensored**: The default local brain — 27B parameter model, zero API costs, fully private, zero guardrails
- **Provider Fallback Chain**: Automatically tries Gemini → Groq → Local Qwen3.8 on failure
- **Streaming Responses**: Word-by-word SSE streaming in the UI
- **Document/RAG Pipeline**: Upload PDFs, docs, code — JARVIS answers from them
- **Agent Loop**: Autonomous goal execution with tool calling, verification, and approval
- **Error Recovery**: Agent never crashes — classifies errors, retries with backoff, circuit breaker

### Hardware Control
- **Mouse**: Move, click (left/right/double), scroll via nut.js
- **Keyboard**: Type text, press key combos (Ctrl+C, Alt+Tab) via nut.js
- **Screenshot**: Capture screen to base64 PNG
- **Clipboard**: Read/write system clipboard
- **Window Management**: List, focus, get info on windows
- **App Control**: Launch and close applications
- **Filesystem**: Read, write, delete files with permission gates
- **Shell**: Execute terminal commands with approval queue
- **Cross-Platform**: All controls work on Windows, Linux, macOS

### Voice & Ambient
- **Wake Word Detection**: Say "Hey JARVIS" — energy-based VAD + STT verification
- **Always Listening**: Continuous mic monitoring with configurable sensitivity
- **Voice Control**: TTS/STT via Gemini, Groq, or browser relay

### Communication & Notifications
- **Webhooks**: Discord, Slack, Telegram integration — broadcast mission results
- **Mobile Push**: Polling-based notifications for mission complete, approvals, alerts
- **Scheduled Tasks**: Cron-like recurring missions (every 5 min, daily at 9am, weekly)

### UI/UX
- **Dark Mode**: System-aware theme with manual toggle (light/dark/system)
- **Sound Effects**: Web Audio API — activation chime, success tone, error buzz, wake word beep
- **Onboarding Wizard**: First-run setup guide for provider, API keys, local LLM, voice
- **Desktop Tray App**: Windows system tray with status indicator, quick actions, auto-start

### Security & Infrastructure
- **Plugin System**: Drop-in JavaScript tools in `plugins/` folder, hot-reload
- **JWT Auth**: Access + refresh tokens, revocation, HMAC-SHA256 signing
- **API Key Encryption**: AES-256-GCM encrypted secret vault at rest
- **Rate Limiting**: Sliding window, per-IP/client, configurable per route
- **Config Validation**: Startup validation of all env vars with clear error messages
- **Database**: Configurable SQLite / PostgreSQL / MySQL via single env var
- **Permission System**: Granular tool-level permissions with approval queues
- **MCP Plugin System**: Extend capabilities via Model Context Protocol
- **Service Lifecycle**: Manage 20+ Docker-based microservices

---

## Quick Start

### Prerequisites

- [Bun](https://bun.sh/) >= 1.3.0
- [Node.js](https://nodejs.org/) >= 24 (or use Bun)
- [Ollama](https://ollama.com) (for local LLM, recommended)

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
# Edit .env — add your API keys or leave blank for local-only mode
bun run db:generate
bun run db:push
bun run dev
```

### 3. Set Up Local LLM (Zero Cost)

```bash
# Install Ollama from https://ollama.com
cd ../local-llm

# Windows:
.\start-server.ps1

# Linux / macOS:
chmod +x *.sh
./start-server.sh
```

See [`mini-services/local-llm/README.md`](mini-services/local-llm/README.md) for full cross-platform instructions.

### 4. Launch Web Dashboard

```bash
cd ../..
bun run dev
# Open http://localhost:3000
```

### 5. Desktop Tray (Windows)

```bash
cd mini-services/desktop-tray
npm install
npm start
```

### 6. Mobile App (Optional)

```bash
cd mini-services/openjarvis-mobile
npm install
npx expo start
```

---

## Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `GEMINI_API_KEY` | For Gemini | — | Google AI API key |
| `GROQ_API_KEY` | For Groq | — | Groq API key |
| `LOCAL_LLM_BASE_URL` | No | auto-detect | Override auto-detect (e.g. `http://localhost:11434/v1`) |
| `LOCAL_LLM_MODEL` | No | auto-detect | Override auto-detected model name |
| `LOCAL_LLM_TEMPERATURE` | No | 0.7 | Generation temperature |
| `LOCAL_LLM_MAX_TOKENS` | No | 4096 | Max tokens per response |
| `LOCAL_LLM_TIMEOUT_MS` | No | 120000 | Request timeout in ms |
| `DATABASE_PROVIDER` | No | sqlite | `sqlite` / `postgresql` / `mysql` |
| `DATABASE_URL` | No | file:./prisma/dev.db | Database connection string |
| `WAKE_WORD_ENABLED` | No | false | Enable always-listening wake word |
| `WAKE_WORD` | No | hey jarvis | Wake word phrase |
| `WAKE_WORD_SENSITIVITY` | No | 0.5 | Voice activity detection threshold |

Leave cloud API keys blank to run in **local-only mode** with Qwen3.8.

---

## Project Structure

```
jarvis/
├── src/                          # Next.js web dashboard
│   ├── app/                    # App router pages
│   ├── components/
│   │   ├── openjarvis/           # JARVIS UI (wizard, theme, sounds)
│   │   └── ui/                   # shadcn/ui components
│   ├── hooks/                  # React hooks (sounds, mobile)
│   └── lib/                    # Utilities (sounds)
├── mini-services/
│   ├── openjarvis-api/          # Core API server
│   │   ├── src/
│   │   │   ├── agent/           # Agent loop, providers, tools
│   │   │   │   ├── fallbackProvider.ts  # Auto-fallback chain
│   │   │   │   ├── localLLMProvider.ts # Local LLM auto-detect
│   │   │   │   ├── modelProvider.ts    # Provider factory
│   │   │   │   └── tools/              # Hardware control, search
│   │   │   ├── routes/           # REST endpoints
│   │   │   ├── services/         # Business logic
│   │   │   ├── voice/            # TTS/STT + wake word
│   │   │   ├── mcp/              # MCP plugin system
│   │   │   └── middleware/        # Auth, rate limiting
│   │   ├── plugins/           # Drop-in tool plugins
│   │   ├── compose/           # Docker Compose files
│   │   └── prisma/            # Database schema
│   ├── openjarvis-mobile/       # React Native mobile app
│   ├── desktop-tray/           # Windows Electron tray app
│   └── local-llm/              # Local LLM scripts
├── prisma/                       # Dashboard database
├── public/                       # Static assets
└── tests/                       # Test scripts
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| **Web Frontend** | Next.js 16, React 19, Tailwind CSS 4, shadcn/ui, Recharts, Framer Motion, next-themes |
| **API Server** | Express 5, Bun runtime, TypeScript, Prisma ORM, Socket.IO |
| **Mobile** | Expo 57, React Native, React Navigation |
| **Desktop** | Electron, system tray, Windows auto-start |
| **AI Providers** | Google Gemini, Groq, Qwen3.8-27B (Ollama/LM Studio/MLX) |
| **Database** | SQLite, PostgreSQL, MySQL (configurable via env) |
| **Hardware Control** | nut.js (mouse, keyboard, screen, clipboard, windows) |
| **Auth** | JWT (HMAC-SHA256), API keys, AES-256-GCM secret vault |
| **Real-time** | Socket.IO (WebSocket), SSE streaming |
| **Voice** | Gemini TTS/STT, Groq TTS, Browser Web Speech API, wake word VAD |
| **Plugins** | Drop-in JS plugins, Model Context Protocol (MCP) |

---

## API Endpoints

### Agent
| Method | Path | Description |
|---|---|---|
| POST | `/agent/run` | Execute a mission through the agent loop |
| POST | `/agent/chat/stream` | SSE streaming chat |
| GET | `/agent/local-llm/health` | Local LLM health + auto-detect |
| GET | `/agent/local-llm/status` | Local LLM config + instructions |
| GET | `/agent/transitions` | Valid state transitions |

### Missions & Memory
| Method | Path | Description |
|---|---|---|
| GET/POST | `/missions` | List / create missions |
| GET | `/memory` | List memory entries |
| GET | `/tools` | List available tools (includes plugins) |

### Documents & RAG
| Method | Path | Description |
|---|---|---|
| POST | `/documents/upload` | Upload PDF/TXT/MD/DOCX |
| GET | `/documents` | List uploaded documents |
| POST | `/documents/query` | Query documents for relevant chunks |
| DELETE | `/documents/:id` | Delete a document |

### Scheduler
| Method | Path | Description |
|---|---|---|
| GET | `/scheduler/tasks` | List scheduled tasks |
| POST | `/scheduler/tasks` | Create a cron task |
| POST | `/scheduler/tasks/:id/run` | Trigger immediately |

### Webhooks & Notifications
| Method | Path | Description |
|---|---|---|
| GET/POST | `/webhooks` | List / add webhooks (Discord/Slack/Telegram) |
| POST | `/webhooks/broadcast` | Send to all webhooks |
| GET | `/mobile/notifications` | Mobile push notifications |

### Voice
| Method | Path | Description |
|---|---|---|
| GET | `/voice/status` | Voice provider status |
| POST | `/voice/wake-word/start` | Start always-listening |
| GET | `/voice/wake-word/status` | Wake word detector status |

### System
| Method | Path | Description |
|---|---|---|
| GET | `/plugins` | List loaded plugins |
| POST | `/plugins/reload` | Hot-reload all plugins |
| POST/GET | `/vault/secrets` | Manage encrypted secrets |
| POST | `/auth/token` | Exchange API key for JWT |
| GET | `/health` | API health check |

---

## License

Private — All rights reserved.
