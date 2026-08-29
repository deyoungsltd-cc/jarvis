# OpenJarvis

A self-hosted, single-user AI agent system with autonomous mission execution, computer control, voice I/O, memory, and MCP plugin extensibility.

---

## Overview

OpenJarvis is the backend API for a personal AI agent that runs entirely on your own hardware. It accepts natural-language goals, plans multi-step tool-based actions, executes them in a secure loop with budget enforcement and human-in-the-loop approval, and streams real-time events over WebSocket.

Core design goals:

- **Single-user, self-hosted** — no multi-tenancy, no cloud dependencies beyond LLM APIs.
- **Autonomous agent loop** — interpret, plan, select tools, execute, observe, verify, and complete.
- **Human-in-the-loop** — undefined capabilities pause and ask; approval rules auto-approve or escalate.
- **Extensible via MCP** — plug in external tool servers over stdio or SSE.

---

## Architecture

```
┌────────────┐     HTTP/REST      ┌──────────────────────┐     ┌──────────────┐
│   Client   │ ◄───────────────► │   Express API         │     │  LLM Provider │
│  (Web/App) │                    │   (port 3001)         ├────►│  Gemini/Groq  │
└─────┬──────┘                    └──────────┬───────────┘     └──────────────┘
      │                                     │
      │          WebSocket (Socket.IO)       │
      └───────────────┬─────────────────────┘
                      │
              ┌───────┴────────┐
              │  WS Server     │
              │  (port 3002)   │
              └───────────────┘

  ┌─────────────────────────────────────────────────────────┐
  │                     Agent Runtime                       │
  │                                                         │
  │  ┌──────────────┐  ┌────────────┐  ┌────────────────┐  │
  │  │ Agent Loop    │  │ Tool Reg.  │  │ Memory Service │  │
  │  │ (plan/execute)│  │ (validated)│  │ (context build)│  │
  │  └──────┬───────┘  └─────┬──────┘  └───────┬────────┘  │
  │         │                │                 │           │
  │  ┌──────┴────────────────┴─────────────────┴────────┐   │
  │  │            Approval Gate / Capabilities           │   │
  │  │     (permission check → approve/ask/block)        │   │
  │  └──────────────────────────────────────────────────┘   │
  └─────────────────────────────────────────────────────────┘

  ┌────────────────┐  ┌───────────────┐  ┌──────────────────┐
  │ Built-in Tools │  │  MCP Plugins   │  │   Voice System   │
  │ (shell, fs,    │  │  (stdio/SSE/   │  │ (Gemini/Groq/    │
  │  mouse, keys…) │  │   in-process)  │  │   Browser Relay) │
  └────────────────┘  └───────────────┘  └──────────────────┘

  ┌─────────────────────────────────────────────────────────┐
  │               SQLite (Prisma ORM)                       │
  │  Missions · Events · Memory · Tools · Approvals · MCP   │
  └─────────────────────────────────────────────────────────┘
```

---

## Features

### Agent Loop

Missions progress through a formal state machine with validated transitions:

```
draft → queued → running ⇄ waiting_approval → completed
                  ↘ blocked / failed → queued (retry)
                  ↘ paused → running
                  ↘ cancelled / expired  (terminal)
```

Each iteration follows the pipeline: **interpret → context retrieval → plan → risk/permission check → tool select → tool execute → observe → verify → memory update → complete**.

Budget guards enforce configurable token and tool-call limits per mission.

### Built-in Tools

| Category | Tools |
|----------|-------|
| **Shell** | `shell_execute` |
| **Filesystem** | `filesystem_read`, `filesystem_write`, `filesystem_delete` |
| **Mouse** | `mouse_move`, `mouse_click`, `mouse_scroll` |
| **Keyboard** | `key_type`, `key_press` |
| **Window** | `window_list`, `window_focus`, `window_info` |
| **App** | `app_launch`, `app_close` |
| **Clipboard** | `clipboard_read`, `clipboard_write` |
| **Web** | `web_search` |
| **Memory** | `memory_store`, `memory_recall`, `memory_search`, `memory_forget` |

All tool execution goes through the **Tool Registry** with input/output schema validation, configurable timeouts, retries with exponential backoff, and full audit logging.

### MCP Plugin System

Extend the agent with external tools via the [Model Context Protocol](https://modelcontextprotocol.io/):

- **Transports**: stdio, SSE, in-process
- Tools are namespaced as `mcp__<server>__<tool>` and appear alongside built-in tools
- Server lifecycle (connect/disconnect) is managed via REST API
- MCP tools default to `medium` risk and flow through the same approval gate

### Human-in-the-Loop & Capabilities

The authorization model follows the principle: **"The admin is the policy."**

- Every capability starts **undefined** — the agent pauses and asks rather than silently failing
- Admin grants are **explicit**: `allowed` or `denied`
- Grants can be scoped: `permanent`, `mission`, or `session` (with optional context constraints like `pathPrefix`)
- **Approval rules** allow auto-approve, auto-reject, or require-manual based on risk level, tool name, or capability
- Revocation takes effect immediately, even for running missions

### Memory System

Five memory scopes: `working`, `episodic`, `semantic`, `preference`, `project`.

- Each entry has importance (1–5), access tracking, optional expiration, and tag-based search
- Memory associations link related entries with a strength weight
- The context builder injects relevant memories into the agent's system prompt automatically

### Voice

Three voice provider strategies:

| Provider | STT | TTS | Notes |
|----------|-----|-----|-------|
| **Browser Relay** | Client-side | Client-side | Always available, zero config |
| **Gemini** | Server-side | Server-side | Requires `GEMINI_API_KEY` |
| **Groq** | Server-side | Server-side | Requires `GROQ_API_KEY` |

Voice sessions manage state transitions (`idle → listening → processing → speaking`) and transcript history. Browser-relayed transcripts are broadcast over WebSocket.

### Mobile Clients

Lightweight API-key authentication for iOS, Android, and web clients. Each client gets a unique API key (shown once at creation, stored as bcrypt hash). Supports ping/heartbeat and full mission interaction.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | [Bun](https://bun.sh/) >= 1.3.0 |
| Language | TypeScript 5 |
| HTTP Framework | Express 5 |
| WebSocket | Socket.IO 4 |
| ORM | Prisma 6 (SQLite) |
| LLM Providers | Google Gemini, Groq |
| Auth | bcryptjs (admin password), API keys (mobile) |

---

## Getting Started

### Prerequisites

- [Bun](https://bun.sh/) >= 1.3.0
- An API key for at least one LLM provider (Gemini or Groq)

### Install & Run

```bash
# Install dependencies
bun install

# Run database migrations
bunx prisma migrate deploy

# Set environment variables (or use defaults)
export GEMINI_API_KEY="your-key-here"      # or GROQ_API_KEY
export MODEL_PROVIDER="gemini"             # "gemini" or "groq"
export DATABASE_URL="file:./data/openjarvis.db"

# Start the server
bun run dev        # development (hot reload)
bun run start      # production
```

Or use the provided script:

```bash
./start.sh
```

On first run, a one-time setup token is printed to the console. Use it to create your admin password:

```bash
curl -X POST http://localhost:3001/auth/setup \
  -H "Content-Type: application/json" \
  -d '{ "setupToken": "<token-from-console>", "password": "your-password" }'
```

### Verify

```bash
curl http://localhost:3001/health
```

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3001` | HTTP API port |
| `WS_PORT` | `3002` | WebSocket port |
| `DATABASE_URL` | `file:./data.db` | SQLite connection string |
| `MODEL_PROVIDER` | `gemini` | LLM provider: `gemini` or `groq` |
| `GEMINI_API_KEY` | — | Google Gemini API key |
| `GEMINI_MODEL` | `gemini-2.5-flash` | Gemini model name |
| `GROQ_API_KEY` | — | Groq API key |
| `GROQ_MODEL` | `llama-3.3-70b-versatile` | Groq model name |
| `VOICE_PROVIDER` | `browser` | Voice provider: `gemini`, `groq`, or `browser` |
| `CORS_ORIGIN` | `http://localhost:3000` | Allowed CORS origin for WebSocket |
| `TOOL_EXECUTION_TIMEOUT_MS` | `30000` | Per-tool timeout |
| `TOOL_RETRY_COUNT` | `2` | Retries on tool failure |
| `TOOL_RETRY_BACKOFF_MS` | `1000` | Base backoff between retries |

---

## API Routes

All routes except `/health`, `/auth`, and `/mobile/v1/*` require admin authentication (Bearer token from `/auth/login`).

| Route | Methods | Description |
|-------|---------|-------------|
| `/health` | GET | Liveness check |
| `/auth/setup` | POST | First-run admin password setup |
| `/auth/login` | POST | Login, returns JWT |
| `/missions` | GET, POST | List / create missions |
| `/missions/:id` | GET, PATCH, DELETE | Read / update / cancel a mission |
| `/missions/:id/run` | POST | Execute a mission (start agent loop) |
| `/missions/:id/events` | GET | Stream mission lifecycle events |
| `/tools` | GET | List all registered tools |
| `/memory` | GET, POST | List / store memory entries |
| `/memory/search` | GET | Search memory by query and tags |
| `/agent` | POST | Send a direct message to the agent |
| `/permissions` | GET, POST | Manage capability grants |
| `/capabilities` | GET | View all capability authorization statuses |
| `/approvals` | GET, POST | List / manage approval requests |
| `/approvals/:id/resolve` | POST | Approve or reject a pending request |
| `/voice` | GET, POST | Voice session management |
| `/mcp` | GET, POST | MCP server management |
| `/mcp/:id/connect` | POST | Connect an MCP server |
| `/mobile/v1/*` | — | Mobile client API (API key auth) |
| `/mobile/admin/*` | — | Mobile client administration |

---

## WebSocket Events

Connect to `ws://localhost:3002` and subscribe to real-time streams:

```js
const socket = io('http://localhost:3002');

// Subscribe to mission events
socket.emit('subscribe:mission', missionId);

// Subscribe to all approval requests
socket.emit('subscribe:approvals');

// Subscribe to approvals for a specific mission
socket.emit('subscribe:mission:approvals', missionId);

// Subscribe to voice session
socket.emit('subscribe:voice', sessionId);

// Relay browser-side voice transcript
socket.emit('voice:transcript', { sessionId, text, confidence, direction });
```

Events received:

- `mission:event` — real-time mission lifecycle events (interpret, tool_execute, observe, complete, etc.)
- `approval:created` — new approval request pending
- `approval:resolved` — approval decision made
- `voice:transcript` — voice transcript relay
- `voice:status` — voice session status update

---

## Database Schema

SQLite via Prisma ORM. Key models:

| Model | Purpose |
|-------|---------|
| `AdminUser` | Single admin account with bcrypt password |
| `Mission` | Goals, status, budget tracking |
| `MissionEvent` | Full audit trail of agent loop stages |
| `Tool` | Registered tool definitions and risk levels |
| `MemoryEntry` | Multi-scope memory with tags, importance, associations |
| `MemoryAssociation` | Links between related memory entries |
| `MobileClient` | API-key-authenticated mobile devices |
| `ApprovalRequest` | Human-in-the-loop approval queue |
| `ApprovalRule` | Auto-approve/reject/escalate rules |
| `CapabilityGrant` | Admin authorization grants (allowed/denied/undefined) |
| `McpServer` | MCP server configurations and connection state |
| `McpTool` | Tools discovered from MCP servers |

---

## Project Structure

```
openjarvis-api/
├── index.ts                       # Server entry (Express + Socket.IO)
├── start.sh                       # Convenience startup script
├── package.json
├── tsconfig.json
├── prisma/
│   ├── schema.prisma              # Database schema
│   └── migrations/                # Migration files
├── src/
│   ├── agent/
│   │   ├── agentLoop.ts           # Core execution engine
│   │   ├── missionStateMachine.ts # State transition enforcement
│   │   ├── modelProvider.ts       # Gemini & Groq adapters
│   │   ├── toolRegistry.ts        # Tool registration, validation, audit
│   │   ├── verification.ts        # Result verification
│   │   ├── types.ts               # Shared agent types
│   │   ├── memory/
│   │   │   ├── contextBuilder.ts  # Memory → system prompt injection
│   │   │   └── memoryTools.ts     # Memory tool definitions
│   │   ├── permissions/
│   │   │   ├── permissionManager.ts
│   │   │   └── types.ts
│   │   └── tools/
│   │       ├── webSearchTool.ts
│   │       └── computer-control/  # Shell, FS, mouse, keyboard, window, app, clipboard
│   ├── mcp/
│   │   ├── pluginManager.ts       # MCP server lifecycle & tool sync
│   │   ├── mcpClient.ts           # MCP protocol client
│   │   ├── transports.ts          # stdio, SSE, in-process transports
│   │   └── types.ts
│   ├── voice/
│   │   ├── voiceManager.ts        # Provider factory & session management
│   │   ├── geminiVoiceProvider.ts
│   │   ├── groqVoiceProvider.ts
│   │   ├── browserRelayProvider.ts
│   │   └── types.ts
│   ├── routes/                    # Express route handlers
│   ├── services/                  # Business logic layer
│   ├── middleware/                # Auth, logging, error handling
│   ├── mobile/                    # Mobile client types & pagination
│   └── utils/                     # Logger, event bus, DB client, errors
└── tests/                         # Phase-based integration tests
    ├── phase1.test.ts  .. phase10.test.ts
    └── phase10-auth-model.test.ts
```

---

## Development

```bash
# Run in development mode (hot reload)
bun run dev

# Run all tests
bun test tests/

# Run a specific test file
nbun test tests/phase1.test.ts

# Generate Prisma client after schema changes
bunx prisma generate

# Create a new migration
bunx prisma migrate dev --name description
```

---

## License

Private — all rights reserved.
