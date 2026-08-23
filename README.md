# OpenJARVIS

> Your open-source AI agent platform — run a fully private, sovereign AI assistant across all your devices with **hybrid cloud + local daemon** architecture.

OpenJARVIS is a modular AI agent system with a web dashboard, REST API, **agent daemon for remote hardware control**, Docker deployment, and **zero-cost local LLM support** powered by **Qwen3.8-27B-Uncensored** via Ollama, LM Studio, or MLX. No cloud API keys required.

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│  Cloud Dashboard (Next.js)                             │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌────────┐ │
│  │Auth/JWT  │  │Workspaces│  │Analytics │  │Vault   │ │
│  └──────────┘  └──────────┘  └──────────┘  └────────┘ │
└──────────────┬──────────────────────────────────────────┘
               │ WebSocket / HTTPS
┌──────────────▼──────────────────────────────────────────┐
│  Agent Daemon (runs on YOUR machine)                   │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌────────┐ │
│  │Shell Exec│  │File I/O  │  │Clipboard │  │Screen  │ │
│  └──────────┘  └──────────┘  └──────────┘  └────────┘ │
│  ┌──────────┐  ┌──────────┐  ┌─────────────────────────┐ │
│  │Processes │  │Network   │  │Mouse/Keyboard (nut.js) │ │
│  └──────────┘  └──────────┘  └─────────────────────────┘ │
└───────────────────────────────────────────────────────┘

LLM Providers:
  ├── Gemini (Google AI)
  ├── Groq
  └── Qwen3.8-27B-Uncensored (Local — Ollama / LM Studio / MLX)  ← $0
```

### Hybrid Cloud Model

OpenJARVIS uses a **cloud dashboard + local daemon** architecture:
- **Cloud Dashboard**: Hosted Next.js app with user accounts, device management, analytics
- **Agent Daemon**: Lightweight Node.js process running on your machine, connecting to the cloud via WebSocket/HTTP polling
- **Full Hardware Control**: The daemon executes shell commands, file operations, clipboard, screenshots, and more — all authorized by you

This is how tools like Tailscale, 1Password, and GitHub Copilot work — cloud service + local agent.

---

## Features

### AI & Intelligence
- **Qwen3.8-27B-Uncensored**: The default local brain — 27B parameter model, zero API costs, fully private, **zero guardrails, completely uncensored**
- **Provider Fallback Chain**: Automatically tries Gemini → Groq → Local Qwen3.8 on failure
- **Streaming Responses**: Word-by-word SSE streaming in the UI
- **Document/RAG Pipeline**: Upload PDFs, docs, code — JARVIS answers from your documents
- **Agent Loop**: Autonomous goal execution with tool calling, verification, and approval
- **Error Recovery**: Agent never crashes — classifies errors, retries with backoff, circuit breaker

### Hardware Control (via Agent Daemon)
- **Shell Execution**: Run any terminal command on connected devices
- **File Operations**: Read, write, delete, list files and directories
- **Clipboard Control**: Get/set clipboard content cross-platform
- **Screenshot Capture**: Platform-native screenshot tools (screencapture, import, PowerShell)
- **Process Management**: List and kill running processes
- **Network Info**: Enumerate network interfaces
- **App Launcher**: Launch applications by name
- **System Notifications**: Send native desktop notifications
- **Mouse & Keyboard**: Full control via nut.js (move, click, type, scroll)
- **Cross-Platform**: Windows, Linux, macOS — all supported

### Multi-User & Team Collaboration
- **Workspaces**: Create isolated workspaces for different projects or teams
- **Multi-User Sessions**: Each user gets their own chat history, preferences, and RAG docs
- **Role-Based Access**: Owner, admin, member, viewer roles per workspace

### Automation
- **Action Macros**: Chain tools into reusable workflows — "Every morning: open Chrome → check email → screenshot → summarize"
- **Cron Scheduler**: Recurring missions with cron expressions
- **Webhooks**: Discord, Slack, Telegram integration for notifications

### Monitoring & Compliance
- **Audit Logging**: Every action JARVIS takes is logged with timestamp, user, device, IP
- **Analytics Dashboard**: Mission stats, tool usage, daily activity, provider breakdown
- **Tool Approval Workflow**: "JARVIS wants to run shell command — Approve / Deny / Always allow"
- **Permission System**: Granular capability grants with scope (permanent, mission, session)

### Communication & Notifications
- **Webhooks**: Discord, Slack, Telegram integration
- **Mobile Push**: Polling-based notifications
- **Scheduled Tasks**: Cron-like recurring missions

### Voice & Ambient
- **Wake Word Detection**: Say "Hey JARVIS" — energy-based VAD + STT verification
- **Voice Control**: TTS/STT via browser or cloud providers

### UI/UX
- **Dark Mode**: System-aware theme with manual toggle
- **Sound Effects**: Web Audio API — activation chime, success tone, error buzz
- **Onboarding Wizard**: First-run setup guide
- **Export**: Download missions as JSON, Markdown, or plain text
- **Daemon Status**: Real-time device connectivity in the header

### Security & Infrastructure
- **Plugin System**: Drop-in JavaScript tools with hot-reload
- **JWT Auth**: Access (1hr) + refresh (30 day) tokens, HMAC-SHA256
- **API Keys**: Scoped API keys for programmatic access
- **AES-256-GCM Vault**: Encrypted secret storage at rest
- **Rate Limiting**: Sliding window, per-IP/client
- **Configurable Database**: SQLite / PostgreSQL / MySQL via single env var
- **Docker Support**: One-command deployment with `docker-compose up`

---

## Quick Start

### Option A: Local Development

```bash
git clone https://github.com/deyoungsltd-cc/jarvis.git
cd jarvis
bun install
cp .env.example .env
npx prisma generate
npx prisma db push
bun run dev
# Open http://localhost:3000
```

### Option B: Docker (Recommended for Hosting)

```bash
git clone https://github.com/deyoungsltd-cc/jarvis.git
cd jarvis
cp .env.example .env
# Edit .env with your API keys and secrets
docker compose up -d
# Open http://localhost:3000
```

### Option C: Local LLM (Zero Cost)

```bash
# Install Ollama from https://ollama.com
ollama pull qwen3.8:27b
ollama serve
# Set LOCAL_LLM_BASE_URL=http://host.docker.internal:11434 in .env
```

### Agent Daemon (Remote Hardware Control)

```bash
cd daemon
npm install
# Edit .env with DAEMON_WS_URL and DAEMON_AUTH_TOKEN
npm start
```

The daemon registers your machine as a device and polls for commands from the dashboard.

---

## Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `DATABASE_URL` | No | `file:./dev.db` | SQLite / PostgreSQL / MySQL connection string |
| `GEMINI_API_KEY` | For Gemini | — | Google AI API key |
| `GROQ_API_KEY` | For Groq | — | Groq API key |
| `LOCAL_LLM_BASE_URL` | No | `http://localhost:11434` | Local LLM endpoint (Ollama/LM Studio) |
| `LOCAL_LLM_MODEL` | No | `qwen3.8:27b` | Local model name |
| `JWT_SECRET` | Yes | — | 64-char random string for JWT signing |
| `VAULT_ENCRYPTION_KEY` | No | — | 32-byte hex key for secret encryption |
| `RATE_LIMIT_MAX_REQUESTS` | No | 100 | Requests per window per IP |
| `DAEMON_WS_URL` | No | `ws://localhost:3001` | Daemon WebSocket URL |
| `DAEMON_AUTH_TOKEN` | No | — | Token for daemon authentication |
| `WAKE_WORD` | No | `Hey JARVIS` | Wake word phrase |
| `NODE_ENV` | No | `development` | `production` or `development` |

Leave cloud API keys blank to run in **local-only mode** with Qwen3.8-27B-Uncensored.

---

## Dashboard Features

The web dashboard includes **10+ tabbed views**:

| Tab | Description |
|---|---|
| **Activity** | Real-time mission event timeline with WebSocket updates |
| **Analytics** | Mission stats, tool usage charts, daily activity, success rates |
| **Audit Log** | Full action log with user/device/action/IP filtering |
| **Macros** | Build and run multi-step automation workflows |
| **Devices** | Manage connected daemon devices, send remote commands |
| **RAG** | Upload documents for retrieval-augmented generation |
| **Scheduler** | Create and manage cron-based recurring missions |
| **Webhooks** | Configure Discord/Slack/Telegram notification endpoints |
| **Plugins** | Enable/disable and manage tool plugins |
| **Vault** | Encrypted secret storage for API keys and credentials |
| **Missions** | Mission list with status tracking and selection |
| **Tools** | Available tool registry with risk levels |
| **Memory** | Agent memory system with scope-based organization |
| **Settings** | Provider selection, theme, mobile API info |
| **Approvals** | Tool execution approval queue with rules engine |

---

## Project Structure

```
jarvis/
├── src/                          # Next.js web dashboard
│   ├── app/
│   │   └── api/                  # 38 API route handlers
│   │       ├── analytics/        # Usage analytics
│   │       ├── api-keys/         # Scoped API keys
│   │       ├── approvals/        # Approval queue + rules
│   │       ├── audit/            # Audit logging
│   │       ├── auth/             # NextAuth JWT
│   │       ├── capabilities/     # Permission grants
│   │       ├── daemon/           # Device command queue
│   │       ├── devices/          # Device management
│   │       ├── documents/        # RAG file upload
│   │       ├── export/           # Mission export (JSON/MD/Text)
│   │       ├── health/           # Health check
│   │       ├── macros/           # Action macros
│   │       ├── memory/           # Agent memory
│   │       ├── missions/         # Mission CRUD + events
│   │       ├── plugins/          # Plugin management
│   │       ├── scheduler/        # Cron jobs
│   │       ├── tools/            # Tool registry
│   │       ├── vault/            # AES-256-GCM secrets
│   │       ├── voice/            # Voice status
│   │       ├── webhooks/         # Webhook management
│   │       └── workspaces/       # Workspace management
│   ├── components/
│   │   ├── openjarvis/           # 25 JARVIS-specific components
│   │   └── ui/                   # 50+ shadcn/ui components
│   ├── hooks/                    # Custom React hooks
│   └── lib/                      # Types, API client, DB, sounds
├── daemon/                       # Agent daemon for remote hardware control
│   ├── index.js                  # Main daemon with 18+ command handlers
│   ├── package.json              # Daemon dependencies
│   └── README.md                 # Daemon setup guide
├── prisma/
│   └── schema.prisma             # 20+ database models
├── Dockerfile                    # Multi-stage Docker build
├── docker-compose.yml            # One-command deployment
└── .env.example                  # All configuration variables
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| **Web Frontend** | Next.js 16, React 19, Tailwind CSS 4, shadcn/ui, Framer Motion |
| **API Routes** | Next.js App Router, 38 route handlers |
| **Database** | SQLite, PostgreSQL, MySQL (Prisma ORM, configurable) |
| **Auth** | NextAuth, JWT (HMAC-SHA256), API Keys |
| **Encryption** | AES-256-GCM secret vault |
| **AI Providers** | Google Gemini, Groq, **Qwen3.8-27B-Uncensored** (Ollama/LM Studio) |
| **Hardware Control** | Agent Daemon (shell, file, clipboard, process, network) + nut.js |
| **Real-time** | WebSocket, SSE streaming |
| **Voice** | Browser Web Speech API, wake word VAD |
| **Daemon** | Standalone Node.js, HTTP polling + WebSocket, exponential backoff |
| **Deployment** | Docker, docker-compose |

---

## Monetization Path

OpenJARVIS is designed with a **freemium SaaS** model in mind:

- **Free Tier**: Local only, single device, core features
- **Pro ($12/mo)**: Cloud sync, multi-device, encrypted remote access
- **Team ($29/user/mo)**: SSO, audit logs, approval workflows, admin dashboard
- **Plugin Marketplace**: 20% commission on community plugins
- **On-Premise License**: $999-4,999/yr for enterprise
- **API Access**: For developers building on the platform

---

## License

Private — All rights reserved.
