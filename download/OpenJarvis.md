# OpenJarvis — Complete Technical Reference

**A self-hosted, single-user AI agent system with autonomous mission execution, tool orchestration, approval workflows, voice capabilities, and ambient presence.**

Built across 13 phases (0-13) over two days. 320 tests passing. Single-user, self-hosted, "the admin is the policy."

---

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [Technology Stack](#technology-stack)
- [Phase-by-Phase Build Summary](#phase-by-phase-build-summary)
- [API Reference](#api-reference)
- [Database Schema](#database-schema)
- [Authorization Model](#authorization-model)
- [Voice System](#voice-system)
- [Ambient Presence (Phase 13)](#ambient-presence-phase-13)
- [Mobile API](#mobile-api)
- [MCP Plugin System](#mcp-plugin-system)
- [Frontend Dashboard](#frontend-dashboard)
- [Configuration Reference](#configuration-reference)
- [Testing](#testing)
- [File Structure](#file-structure)
- [Known Limitations](#known-limitations)
- [Security Model](#security-model)

---

## Architecture Overview

OpenJarvis is a multi-layer AI agent system with clear separation between the backend API (Express/Bun), the real-time event layer (Socket.IO), and the frontend dashboard (Next.js 16).

```
┌─────────────────────────────────────────────────────┐
│                 Next.js 16 Frontend                  │
│  ┌──────────┐ ┌──────────┐ ┌──────────────────────┐  │
│  │ Dashboard │ │ Talking  │ │ Ambient Settings Tab │  │
│  │ (6 tabs)  │ │  Head    │ │ (Vision/Quiet Hrs/   │  │
│  │          │ │ (HeyGen) │ │  Triggers)           │  │
│  └────┬─────┘ └────┬─────┘ └──────────┬───────────┘  │
│       └────────────┴──────────────────┘              │
│                         │ REST + WebSocket          │
├─────────────────────────┼───────────────────────────┤
│              Express API (port 3001)                   │
│  ┌──────────┐ ┌──────────┐ ┌──────────────────────┐  │
│  │ Routes   │ │ Services │ │ Ambient Subsystem    │  │
│  │ (14 route│ │ (Mission,│ │ (Wake Word, Gemini    │  │
│  │  files)  │ │  Tool,   │ │  Live, Proactive,     │  │
│  │          │ │  Memory, │ │  Avatar)              │  │
│  │          │ │  Approval│ │                      │  │
│  │          │ │  Mobile) │ │                      │  │
│  └────┬─────┘ └────┬─────┘ └──────────┬───────────┘  │
│       └────────────┴──────────────────┘              │
│                         │ Prisma ORM                 │
├─────────────────────────┼───────────────────────────┤
│              SQLite Database (10 tables)              │
└─────────────────────────────────────────────────────┘

         Socket.IO WebSocket (port 3002)
         Real-time: missions, voice, approvals, ambient
```

**Design principles:**

- **"The admin is the policy"** — authorization is a flat, admin-editable capability list. Nothing is enabled by default.
- **Request/response first, ambient second** — Phase 13 adds wake word, proactive speech, and avatar on top of the existing chat/mission dashboard. The dashboard still works fully with the avatar hidden.
- **Graceful degradation** — if the avatar, wake word, or Gemini Live API is unavailable, the system falls back to text chat with no loss of functionality.
- **Single-user, self-hosted** — no multi-tenant, no user accounts, no external SaaS dependencies beyond API keys.

---

## Technology Stack

| Layer | Technology | Version | Notes |
|-------|-----------|---------|-------|
| Runtime | Bun | 1.3+ | Also runs on Node.js 24+ |
| Backend | Express | 5.2.1 | ESM module system (`"type": "module"`) |
| ORM | Prisma | 6.11.1 | SQLite provider, Supabase-compatible schema |
| Database | SQLite | — | File-based, swap to Postgres via `DATABASE_URL` |
| AI Models | Google Gemini + Groq | — | Provider abstraction, swap with zero code changes |
| Real-time | Socket.IO | 4.8.3 | Separate port (3002), CORS for dev |
| Voice STT | Gemini Multimodal + Groq Whisper | — | 3 adapters: browser, gemini, groq |
| Wake Word | Picovoice Porcupine Web SDK | — | On-device, 5-15ms latency |
| Ambient Voice | Gemini Live API | — | Duplex WebSocket, speech-to-speech |
| Avatar | HeyGen LiveAvatar | — | Real-time lip-sync via WebRTC |
| Frontend | Next.js 16 | 16.1.1 | React, TypeScript, Tailwind CSS 4 |
| UI Components | shadcn/ui | — | Headless, accessible |
| Auth | bcryptjs | 3.0.3 | API key hashing for mobile clients |

---

## Phase-by-Phase Build Summary

### Phase 0 — Discovery

Environment inventory, API capability verification against current documentation (2026-08-17), runtime pinning (Node v24.18.0, Bun 1.3.14), `.env.example` creation.

### Phase 1 — Foundation

Express server on port 3001. 4 core tables via Prisma (`missions`, `mission_events`, `tools`, `memory_entries`). Repository/service layer wrapping all DB calls. Structured error format `{error: {code, message, requestId}}`. Request logging with unique request IDs. Full REST API for health, missions, events, tools, and memory.

**Tests: 23/23**

### Phase 2 — Agent Runtime Core

Model provider abstraction (`ModelProvider` interface) with Gemini + Groq adapters. Swapping providers requires zero changes outside the adapter. Tool registry with `web_search` tool. Tool execution with input/output schema validation, timeout, retry with backoff, and audit logging. Agent loop implements all Section 4.1 states as real code paths: `interpret → context_retrieval → plan → risk_check → tool_select → tool_execute → observe → verify → memory_update → complete`. Mission state machine with 10 statuses and guarded transitions. Budget/iteration cap.

**Tests: 23/23**

### Phase 3 — Dashboard

Next.js 16 dashboard with real-time WebSocket updates via Socket.IO. Goal input creates real missions. Live activity timeline showing agent loop stages. Mission history tab. Agent state indicator. Keyboard-only navigation.

### Phase 4 — Computer Control & Permissions

17 computer-control tools (screenshot, mouse, keyboard, clipboard, filesystem, shell, app, window) with real JSON schemas and risk levels. Permission system with 17 capabilities, hard-block list, grant/revoke API. Verification loop architecture. GUI-dependent tools return honest `ENVIRONMENT_UNAVAILABLE` errors. Unified with Phase 10's authorization model — the `ApprovalGate` in the agent loop is now the single authorization point; tools no longer check permissions internally.

**Tests: 23/23**

### Phase 5 — Voice

Voice provider abstraction (`VoiceProvider` interface) mirroring the model provider pattern. 3 adapters: BrowserRelayProvider (client-side Web Speech API, always available), GeminiVoiceProvider (STT via multimodal audio), GroqVoiceProvider (STT via Whisper). Voice session management with 5 states and guarded transitions. REST API: status, provider switch, STT, TTS, session CRUD, transcript, status update. WebSocket voice events for real-time relay. Frontend VoiceControl component with mic button, audio level visualization, transcript history, TTS toggle. Voice → mission bridge: browser transcripts create real missions.

**Tests: 41/41**

### Phase 6 — Memory

Enhanced `MemoryEntry` schema: tags, missionId, source, importance (1-5), accessCount, lastAccessedAt, expiresAt. `MemoryAssociation` table for linking related memories with strength scores. Keyword-based search with relevance scoring (text match + recency + access frequency + importance boosts). `MemoryContextBuilder` injects relevant memories into agent system prompt during `context_retrieval` stage. 4 agent-callable memory tools: `memory_store`, `memory_recall`, `memory_search`, `memory_forget`. Memory lifecycle: TTL/expiry, consolidation, purge.

**Tests: 46/46**

### Phase 7 — Mobile

`mobile_clients` table with bcrypt-hashed API keys (raw key shown only once at registration). API key auth middleware. Versioned mobile API at `/mobile/v1/` with 10 endpoints. Pagination utility with page/limit clamping. SSE event stream for mission progress. Admin endpoints for client management. React Native app shell deferred (no mobile SDK in sandbox).

**Tests: 22/22**

### Phase 8 — MCP/Plugins

MCP protocol client with JSON-RPC 2.0 over 3 transports (Stdio, SSE, In-Process). Plugin manager with DB-backed server CRUD, connection lifecycle, and tool sync. Tool bridging: MCP tools become namespaced `ToolHandlers` (e.g., `mcp__servername__toolname`). 8 REST endpoints at `/mcp/`.

**Tests: 36/36**

### Phase 10 — Approval Workflow & Human-in-the-Loop

`approval_requests` table: missionId, toolName, capability, riskLevel, status (pending|approved|rejected|expired|cancelled), toolInput (JSON), resolvedBy, expiresAt. `approval_rules` table: priority-ordered auto-approval/auto-reject rules supporting risk level + tool name (exact/wildcard `*`) + capability matching, combined conditions. `ApprovalGate` called by agent loop before every tool execution — checks rules, then capability registry, then risk level fallback. Agent loop `waiting_approval` status fully functional — mission pauses, polls for decision, resumes or adapts. Frontend ApprovalQueue as 5th dashboard tab with pending count badge.

**Tests: 44/44**

### Phase 13 — Ambient Presence: Wake Word, Proactive Speech, Talking-Head Frontend

Adds three new input/output layers on top of the existing request/response system without replacing it:

1. **Wake Word Detection** — Porcupine Web SDK (on-device, 5-15ms, built-in "Jarvis" keyword) or openWakeWord fallback. Server-side configuration, confidence filtering (minimum threshold to prevent false positives), detection logging. No audio is sent to any cloud API before the wake word fires. COOP/COEP headers set dynamically for SharedArrayBuffer requirement.

2. **Ambient Conversation** — Gemini Live API (duplex WebSocket, speech-to-speech) replaces the push-to-talk STT round-trip once the wake word fires. Real barge-in (user interrupts JARVIS mid-sentence). Session lifecycle: standby → wake word fires → live → idle re-arm (75s default) → standby. Hard session cap at 9.5 minutes with resumption token support for continuing past the 10-minute Gemini Live limit. Audio budget guard: per-session (500K tokens) and daily (2M tokens), enforced server-side with midnight auto-reset. Vision frame input (off by default, 1 FPS, no frame persistence).

3. **Proactive Speech** — Event-to-speech decision service subscribing to the existing `eventBus`. 6 trigger types: `mission_completed`, `mission_failed`, `mission_blocked`, `approval_pending`, `budget_cap_hit`, `error_occurred`. Admin-configured — JARVIS never invents reasons to speak unprompted. Quiet hours / do-not-disturb. Per-trigger cooldown timers. Every proactive utterance logged as a `mission_event` for full auditability.

4. **Talking-Head Avatar** — HeyGen LiveAvatar (`@heygen/liveavatar-web-sdk`, the new SDK — not the deprecated Interactive Avatar SDK). Server-side session token creation — the API key is NEVER exposed to the browser. WebRTC for real-time two-way video with lip-sync, expressions, and gestures. Holographic-style UI chrome: CSS glow, scanline overlay, particle field, HUD status readouts layered around the avatar video. Graceful degradation: if HeyGen fails, the system falls back to the Phase 3 agent-state indicator and audio-only response.

**Tests: 33/33**

---

## API Reference

### Base URL

```
http://localhost:3001
```

### Authentication

Set `ADMIN_API_KEY` in `.env` to enable auth. All routes except `/health` and `/mobile/v1/register` require:

```
X-Admin-Key: your-secret-key
```

Mobile endpoints use their own per-client API key via `X-API-Key` header.

### Core Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | DB connectivity + server info |
| POST | `/missions` | Create mission |
| GET | `/missions` | List missions |
| GET | `/missions/:id` | Get mission detail |
| PATCH | `/missions/:id` | Update mission |
| DELETE | `/missions/:id` | Delete mission |
| GET | `/missions/:id/events` | Mission event trail |
| POST | `/agent/run` | Execute mission through agent loop |
| GET | `/agent/transitions` | Valid state transitions |

### Tool & Memory Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/tools` | List registered tools |
| GET/POST | `/memory` | Memory CRUD |
| GET | `/memory/search` | Search memories |
| GET | `/memory/stats` | Memory statistics |
| POST | `/memory/consolidate` | Dedup and link memories |
| POST | `/memory/purge-expired` | Remove expired memories |

### Authorization Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET/POST | `/capabilities` | Capability grant CRUD |
| GET | `/capabilities/statuses` | All capability states |
| POST | `/capabilities/:id/revoke` | Revoke a grant |
| GET/POST | `/approvals` | Approval request CRUD |
| POST | `/approvals/:id/approve` | Approve (once) |
| POST | `/approvals/:id/approve-always` | Approve + permanent grant |
| POST | `/approvals/:id/reject` | Reject |
| GET/POST | `/approvals/rules` | Auto-approval rules CRUD |

### Voice Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/voice/status` | Voice system status |
| POST | `/voice/provider` | Switch voice provider |
| POST | `/voice/stt` | Speech-to-text |
| POST | `/voice/tts` | Text-to-speech |
| GET/POST | `/voice/sessions` | Voice session CRUD |
| POST | `/voice/sessions/:id/transcript` | Add transcript entry |

### Ambient Presence Endpoints (Phase 13)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/ambient/status` | Full ambient system status |
| GET/PUT | `/ambient/wakeword` | Wake word config |
| POST | `/ambient/wakeword/start` | Start wake word listening |
| POST | `/ambient/wakeword/stop` | Stop wake word listening |
| POST | `/ambient/wakeword/detect` | Client reports detection |
| GET | `/ambient/wakeword/log` | Detection log |
| POST | `/ambient/start` | Start ambient session |
| POST | `/ambient/end` | End ambient session |
| POST | `/ambient/send-text` | Send text to ambient session |
| POST | `/ambient/interrupt` | Barge-in (interrupt JARVIS) |
| POST | `/ambient/send-vision-frame` | Send vision frame |
| GET/PUT | `/ambient/vision` | Vision configuration |
| GET | `/ambient/avatar` | Avatar status |
| POST | `/ambient/avatar/start` | Start avatar session |
| POST | `/ambient/avatar/end` | End avatar session |
| PUT | `/ambient/avatar/config` | Update avatar config |
| GET | `/ambient/proactive/triggers` | Get all trigger configs |
| PUT | `/ambient/proactive/triggers/:type` | Update a trigger |
| GET/PUT | `/ambient/proactive/quiet-hours` | Quiet hours config |
| GET | `/ambient/proactive/log` | Proactive speech log |

### Mobile Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/mobile/v1/register` | Register mobile client (open) |
| GET | `/mobile/v1/missions` | Paginated mission list |
| GET | `/mobile/v1/missions/:id` | Mission detail |
| GET | `/mobile/v1/missions/:id/events` | Mission events |
| GET | `/mobile/v1/missions/:id/events/stream` | SSE event stream |
| GET | `/mobile/v1/memory` | Paginated memory |
| GET | `/mobile/v1/memory/search` | Memory search |
| GET | `/mobile/v1/tools` | Tools list (lightweight) |
| POST | `/mobile/v1/agent/run` | Run agent |
| GET | `/mobile/v1/health` | Health check |

### MCP Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/mcp/servers` | List MCP servers |
| POST | `/mcp/servers` | Create server |
| GET | `/mcp/servers/:id` | Get server |
| PATCH | `/mcp/servers/:id` | Update server |
| DELETE | `/mcp/servers/:id` | Delete server |
| POST | `/mcp/servers/:id/connect` | Connect to server |
| POST | `/mcp/servers/:id/disconnect` | Disconnect |
| GET | `/mcp/tools` | List all MCP tools |

### WebSocket Events (port 3002)

| Event | Direction | Description |
|-------|-----------|-------------|
| `subscribe:mission` | Client→Server | Subscribe to mission updates |
| `mission:event` | Server→Client | Mission event broadcast |
| `mission:status` | Server→Client | Mission status change |
| `subscribe:voice` | Client→Server | Subscribe to voice session |
| `voice:transcript` | Bidirectional | Voice transcript relay |
| `voice:status` | Bidirectional | Voice session status |
| `subscribe:approvals` | Client→Server | Subscribe to approval events |
| `approval:created` | Server→Client | New approval request |
| `approval:resolved` | Server→Client | Approval decision made |
| `subscribe:ambient` | Client→Server | Subscribe to ambient events |
| `ambient:audio` | Client→Server | Relay audio to Gemini Live |
| `ambient:state_change` | Server→Client | Ambient state transition |
| `ambient:transcript` | Server→Client | Ambient transcript entry |
| `wakeword:detected` | Server→Client | Wake word fired |

---

## Database Schema

10 tables via Prisma (SQLite):

### Core Tables

| Table | Purpose | Key Fields |
|-------|---------|------------|
| `missions` | Agent mission lifecycle | id, goal, status (10 states), budget, tokenUsage, toolCallCount |
| `mission_events` | Mission event trail | id, missionId, type (15 event types), payload (JSON) |
| `tools` | Tool definitions | id, name (unique), description, riskLevel, inputSchema, outputSchema |

### Memory Tables

| Table | Purpose | Key Fields |
|-------|---------|------------|
| `memory_entries` | Agent memory with tags | scope (working/episodic/semantic/preference/project), key, value (JSON), tags (JSON array), importance (1-5), accessCount, expiresAt |
| `memory_associations` | Links between memories | fromMemoryId, toMemoryId, strength (0.0-1.0) |

### Authorization Tables

| Table | Purpose | Key Fields |
|-------|---------|------------|
| `capability_grants` | Authorization model grants | capability, allowed (bool), scopeType (permanent/mission/session), scopeContext (JSON) |
| `approval_requests` | Human-in-the-loop queue | missionId, toolName, capability, riskLevel, status (pending/approved/rejected/expired/cancelled), toolInput (JSON) |
| `approval_rules` | Auto-approval/auto-reject rules | matchRiskLevels (JSON), matchToolNames (JSON with wildcards), matchCapabilities (JSON), action (auto_approve/auto_reject/require_manual), priority |

### Mobile & Plugin Tables

| Table | Purpose | Key Fields |
|-------|---------|------------|
| `mobile_clients` | Mobile API clients | name, platform (ios/android/web), apiKey (bcrypt hash), enabled, lastSeenAt |
| `mcp_servers` | MCP plugin servers | name, transport (stdio/sse/in-process), command, url, status, toolCount |
| `mcp_tools` | MCP-bridged tools | serverId, name, mcpName, inputSchema, riskLevel |

---

## Authorization Model

**"The admin is the policy."** — A single binary gate per capability.

### Three States

| State | Meaning | Agent Loop Behavior |
|-------|---------|-------------------|
| `undefined` | No grant exists | Pause and ask admin |
| `allowed` | Admin explicitly granted | Execute immediately |
| `denied` | Admin explicitly denied | Block (no retry) |

### Authorization Flow (per tool execution)

1. **Auto-approval rules** (highest priority) — admin-configured policy overrides. Supports risk level, tool name (exact/wildcard `*`), and capability matching with priority ordering.
2. **Capability registry** — DB-backed grants with scope (permanent/mission/session). Scope context supports path prefix, domain, and generic key-value matching.
3. **Risk-level fallback** — for tools without a capability: low/medium → proceed, high/critical → pause and ask.

### Key Principle

Undefined is NOT the same as denied. Undefined pauses and asks — denied blocks permanently. This means nothing is enabled by default. Every potentially dangerous capability must be explicitly granted by the admin.

---

## Voice System

### Provider Architecture

The voice system follows the same provider abstraction as the model system:

```
VoiceProvider (interface)
├── BrowserRelayProvider  — Client-side STT/TTS via Web Speech API (always available)
├── GeminiVoiceProvider   — STT via Gemini multimodal audio input
└── GroqVoiceProvider     — STT via Groq Whisper API
```

Swapping voice providers requires zero changes outside the adapter.

### Voice Session States

```
idle → listening → processing → speaking → idle
                  ↓           ↓
                error        error → idle
```

### Ambient Voice (Phase 13)

The ambient voice system is a separate, additional layer from the Phase 5 voice system. Phase 5 is request/response (push-to-talk). Phase 13 adds continuous listening via the Gemini Live API:

```
standby → (wake word fires) → waking → live → idle_rearm → standby
                                                      ↑
                                               (75s silence or 9.5min hard cap)
```

The Gemini Live API provides real bidirectional speech-to-speech with native barge-in. It is NOT the same as the STT→LLM→TTS pipeline from Phase 5.

---

## Ambient Presence (Phase 13)

### Session Lifecycle

```
1. STANDBY — Wake word listener running on-device (Porcupine/openWakeWord)
                No audio sent to any cloud API. Cheap, local.

2. WAKE WORD FIRES — Detection reported to server, confidence validated.
                 Low-confidence near-misses are logged but don't trigger.

3. WAKING — Server starts Gemini Live WebSocket session.
               If resumption token exists, conversation continues.

4. LIVE — Duplex conversation. Real barge-in supported natively.
             Audio tokens counted against budget.
             Vision frames sent if enabled (1 FPS, off by default).

5. IDLE RE-ARM — No speech for 75 seconds (configurable).
                  Session ends cleanly with resumption token.
                  System returns to standby (cheap, local).

6. HARD CAP — 9.5 minutes of continuous conversation.
                Session ends. Resumption token saved.
                Can be continued in a new session.
```

### Audio Budget

| Budget | Default | Purpose |
|--------|---------|---------|
| Per-session | 500,000 tokens | Prevents single long conversation from overspending |
| Daily | 2,000,000 tokens | Hard daily cap, auto-resets at midnight |

Estimated costs at Gemini Live pricing (~$3/1M input, ~12/1M output): a full daily budget would cost approximately $15-20.

### Proactive Speech Triggers

| Trigger | Default | Description |
|---------|---------|-------------|
| `mission_completed` | Enabled | "Your mission has been completed successfully." |
| `mission_failed` | Enabled | "A mission has failed. You may want to review what happened." |
| `mission_blocked` | Enabled | "A mission was blocked. It exceeded its budget or tool call limit." |
| `approval_pending` | Enabled | "An action is waiting for your approval." (2min cooldown) |
| `budget_cap_hit` | Enabled | "The daily audio budget has been reached." (5min cooldown) |
| `error_occurred` | **Disabled** | Off by default — errors can be noisy |

JARVIS never invents new reasons to speak unprompted. The trigger list is admin-editable, same "you are the policy" model as the Authorization Model.

### HeyGen Avatar

- Uses `@heygen/liveavatar-web-sdk` (new SDK, NOT the deprecated Interactive Avatar SDK)
- Session tokens created server-side — API key never exposed to browser
- WebRTC for real-time two-way video with lip-sync
- Graceful degradation: if avatar fails, falls back to Phase 3 state indicator + audio-only
- Single-user: trial limit of 3 concurrent sessions is irrelevant

### Holographic UI

The "holographic" visual is a **stylized 2D video treatment with CSS/WebGL effects around the HeyGen video stream**, not a literal projected hologram. Effects include:

- Dynamic glow ring (color changes with state: blue=standby, green=live, amber=waking, red=error)
- Scanline overlay for CRT/hologram aesthetic
- CSS particle field with slow rotation
- HUD-style status readouts layered around the avatar (not inside it)
- State indicators: STANDBY, LISTENING, WAKING, RE-ARMING, ERROR
- Vision-active indicator (red pulsing dot when environmental vision is on)

### Vision (Environmental Awareness)

**Off by default on every fresh install.** When enabled:

- Screen/camera frames sent to the Gemini Live session at 1 FPS
- No frames are persisted to storage (live-processing only)
- Separate explicit admin toggle (distinct from voice/wake-word permission)
- Visible, persistent recording-style indicator whenever active
- Vision-derived observations feed the same proactive-speech trigger list

---

## Mobile API

Mobile clients register at `POST /mobile/v1/register` to receive an API key:

```bash
# Register
curl -X POST /mobile/v1/register \
  -d '{"name":"My Phone","platform":"ios"}'
# Returns: { id, name, platform, apiKey }  ← save the apiKey

# Use
curl -H 'X-API-Key: <apiKey>' http://localhost:3001/mobile/v1/missions
```

API keys are hashed with bcrypt (10 rounds) before storage. The raw key is shown only once at registration. Legacy plaintext keys are supported for migration (auto-detected by length).

---

## MCP Plugin System

OpenJarvis supports MCP (Model Context Protocol) servers as tool sources:

```bash
# Register an MCP server
curl -X POST /mcp/servers -d '{
  "name": "filesystem",
  "transport": "stdio",
  "command": "npx",
  "args": "["-y", "@modelcontextprotocol/server-filesystem", "/home/user"]"
}'

# Connect
curl -X POST /mcp/servers/<id>/connect

# List bridged tools
curl /mcp/tools
```

MCP tools are namespaced as `mcp__servername__toolname` and go through the same approval gate as native tools.

---

## Frontend Dashboard

### Layout

```
┌─────────────────────────────────────────────────────────┐
│  [Bot] OpenJarvis            Connected          v3.0   │
├──────────┬──────────────────────────┬───────────────────┤
│ LEFT     │  CENTER                  │ RIGHT             │
│          │                          │                   │
│ New      │  Activity                │ [Missions]        │
│ Mission  │  Timeline                │ [Tools]           │
│          │                          │ [Memory]          │
│ Voice    │  (real-time event        │ [Settings]        │
│ Input    │   stream via WS)         │ [Approvals]       │
│          │                          │ [Ambient] ← NEW   │
│ Talking  │                          │                   │
│ Head ←   │                          │                   │
│ NEW      │                          │                   │
│          │                          │                   │
│ Agent    │                          │                   │
│ State    │                          │                   │
├──────────┴──────────────────────────┴───────────────────┤
│  OpenJarvis Agent Dashboard                    v3.0     │
└─────────────────────────────────────────────────────────┘
```

### Tabs (Right Panel)

1. **Missions** — Mission history with status filters
2. **Tools** — Registered tool list with risk levels
3. **Memory** — Search, create, consolidate, purge memories
4. **Settings** — Model provider selection, configuration
5. **Approvals** — Pending approval queue with approve/reject
6. **Ambient** (Phase 13) — System status, vision toggle, quiet hours, proactive triggers, activity log

---

## Configuration Reference

See `.env.example` for all configuration variables. Key categories:

### Required

| Variable | Description | Default |
|----------|-------------|---------|
| `DATABASE_URL` | SQLite path | `file:/home/z/my-project/db/custom.db` |
| `GEMINI_API_KEY` | Google Gemini API key | — |
| `GROQ_API_KEY` | Groq API key | — |

### Optional

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | API server port | `3001` |
| `WS_PORT` | WebSocket port | `3002` |
| `ADMIN_API_KEY` | Enables auth on all routes (dev mode if empty) | — |
| `VOICE_PROVIDER` | Voice provider: browser/gemini/groq | `browser` |
| `APPROVAL_TTL_SECONDS` | Approval request timeout | `300` |

### Phase 13 (Ambient Presence)

| Variable | Description | Default |
|----------|-------------|---------|
| `PORCUPINE_ACCESS_KEY` | Picovoice Porcupine access key | — |
| `GEMINI_LIVE_MODEL` | Gemini Live model ID | `gemini-2.5-flash-native-audio-preview-05-20` |
| `GEMINI_LIVE_VOICE` | Gemini Live voice name | `Aoede` |
| `AMBIENT_MAX_SESSION_TOKENS` | Per-session audio token budget | `500000` |
| `AMBIENT_MAX_DAILY_TOKENS` | Daily audio token budget | `2000000` |
| `AMBIENT_IDLE_TIMEOUT_SEC` | Seconds before idle re-arm | `75` |
| `HEYGEN_API_KEY` | HeyGen avatar API key | — |
| `HEYGEN_AVATAR_ID` | HeyGen avatar ID | — |
| `HEYGEN_VOICE_ID` | HeyGen voice ID | — |

---

## Testing

```bash
cd mini-services/openjarvis-api

# Run all 320 tests
bun test tests/

# Run specific phase
bun test tests/phase13.test.ts

# Run with verbose output
bun test tests/ --verbose
```

### Test Coverage by Phase

| Phase | Tests | File |
|-------|-------|------|
| Phase 1 | 23 | `tests/phase1.test.ts` |
| Phase 2 | 23 | `tests/phase2.test.ts` |
| Phase 4 | 23 | `tests/phase4.test.ts` |
| Phase 5 | 41 | `tests/phase5.test.ts` |
| Phase 6 | 46 | `tests/phase6.test.ts` |
| Phase 7 | 22 | `tests/phase7.test.ts` |
| Phase 8 | 36 | `tests/phase8.test.ts` |
| Phase 10 | 44 | `tests/phase10.test.ts` + `tests/phase10-auth-model.test.ts` |
| Phase 13 | 33 | `tests/phase13.test.ts` |
| **Total** | **320** | **10 files** |

---

## File Structure

```
home/z/my-project/
├── BUILD_STATE.md                 # Phase tracking, architecture decisions, file structure
├── .env.example                   # All configuration variables (copy to .env)
├── package.json                   # Next.js 16 + shadcn/ui + Socket.IO client
├── Caddyfile                       # Caddy gateway (port 81)
├── src/
│   ├── app/
│   │   ├── page.tsx               # OpenJarvis dashboard (6 tabs + TalkingHead)
│   │   ├── layout.tsx              # ThemeProvider
│   │   └── globals.css
│   ├── components/
│   │   ├── openjarvis/            # All OpenJarvis UI components
│   │   │   ├── talking-head.tsx    # Phase 13: Holographic avatar with HUD
│   │   │   ├── ambient-tab.tsx     # Phase 13: Ambient settings tab
│   │   │   ├── agent-state.tsx     # Phase 3: Agent state indicator
│   │   │   ├── activity-timeline.tsx
│   │   │   ├── Connection-banner.tsx
│   │   │   ├── goal-input.tsx
│   │   │   ├── missions-tab.tsx
│   │   │   ├── settings-tab.tsx
│   │   │   ├── tools-tab.tsx
│   │   │   ├── memory-tab.tsx
│   │   │   ├── voice-control.tsx   # Phase 5: Mic, waveform, transcript
│   │   │   └── approval-queue.tsx  # Phase 10: Approval queue
│   │   └── ui/                     # shadcn/ui components
│   ├── hooks/
│   │   ├── useJarvisSocket.ts     # WebSocket hook
│   │   ├── use-toast.ts
│   │   └── use-mobile.ts
│   └── lib/
│       ├── openjarvis-api.ts       # API client (all endpoints including Phase 13)
│       ├── openjarvis-types.ts    # TypeScript types
│       ├── status-utils.ts
│       ├── utils.ts
│       └── db.ts

mini-services/openjarvis-api/
├── package.json
├── tsconfig.json
├── prisma/
│   └── schema.prisma              # 10 tables (SQLite)
├── src/
│   ├── ambient/                    # Phase 13: Ambient presence
│   │   ├── types.ts               # Type definitions
│   │   ├── geminiLiveProvider.ts  # Gemini Live API WebSocket client
│   │   ├── wakeWordService.ts     # Wake word config + detection logging
│   │   └── sessionManager.ts      # Lifecycle orchestrator
│   ├── avatar/                     # Phase 13: Avatar
│   │   └── avatarService.ts       # HeyGen session management
│   ├── proactive/                  # Phase 13: Proactive speech
│   │   └── proactiveSpeechService.ts  # Event-to-speech triggers
│   ├── agent/
│   │   ├── agentLoop.ts            # Core execution engine
│   │   ├── toolRegistry.ts         # Tool registration + retry + timeout
│   │   ├── missionStateMachine.ts  # Guarded state transitions
│   │   ├── modelProvider.ts        # Gemini + Groq adapters
│   │   ├── permissions/
│   │   │   ├── types.ts            # Capability definitions
│   │   │   └── permissionManager.ts # In-memory grant cache (unified)
│   │   ├── memory/
│   │   │   ├── contextBuilder.ts   # Memory context for agent prompt
│   │   │   └── memoryTools.ts       # 4 agent tools
│   │   └── tools/
│   │       ├── webSearchTool.ts
│   │       └── computer-control/   # 17 tools
│   ├── services/
│   │   ├── approvalGate.ts         # Single authorization point
│   │   ├── capabilityRegistry.ts   # DB-backed capability grants
│   │   ├── approvalService.ts      # Approval request lifecycle
│   │   ├── missionService.ts
│   │   ├── missionEventService.ts
│   │   ├── toolService.ts
│   │   ├── memoryService.ts
│   │   └── mobileClientService.ts  # bcrypt API key management
│   ├── routes/                     # 14 route files
│   │   ├── health.ts, missions.ts, tools.ts, memory.ts
│   │   ├── agent.ts, permissions.ts, voice.ts
│   │   ├── mobile.ts, mobileAdmin.ts
│   │   ├── mcp.ts, approval.ts, capabilities.ts
│   │   └── ambient.ts              # Phase 13: 18 endpoints
│   ├── middleware/
│   │   ├── adminAuth.ts            # ADMIN_API_KEY auth
│   │   ├── mobileAuth.ts           # Mobile API key auth
│   │   ├── coopCoep.ts             # Phase 13: COOP/COEP headers
│   │   ├── requestLogger.ts
│   │   └── errorHandler.ts
│   ├── voice/                      # Phase 5: Voice providers
│   │   ├── types.ts, voiceManager.ts
│   │   ├── browserRelayProvider.ts
│   │   ├── geminiVoiceProvider.ts
│   │   └── groqVoiceProvider.ts
│   ├── mcp/                        # Phase 8: MCP plugin system
│   │   ├── types.ts, mcpClient.ts
│   │   ├── pluginManager.ts, transports.ts
│   │   └── index.ts
│   ├── mobile/
│   │   ├── types.ts, pagination.ts
│   └── utils/
│       ├── db.ts, errors.ts, logger.ts, eventBus.ts
├── tests/                         # 320 tests across 10 files
│   ├── phase1.test.ts (23)
│   ├── phase2.test.ts (23)
│   ├── phase4.test.ts (23)
│   ├── phase5.test.ts (41)
│   ├── phase6.test.ts (46)
│   ├── phase7.test.ts (22)
│   ├── phase8.test.ts (36)
│   ├── phase10.test.ts (8)
│   ├── phase10-auth-model.test.ts (36)
│   └── phase13.test.ts (33)

mini-services/openjarvis-mobile/   # React Native app shell (deferred)
```

---

## Known Limitations

| Limitation | Status | Notes |
|-----------|--------|-------|
| Phase 9 (Opportunity Engine) | Not implemented | No code. Was referenced by old hardcoded blocks, now removed. |
| Phase 11 (API/SDK) | Not implemented | No public API/SDK for third-party integrations. |
| Phase 12 (Hardening) | Not implemented | No rate limiting, no input sanitization hardening, no security audit. |
| E2E model calls | Blocked | No `GEMINI_API_KEY` or `GROQ_API_KEY` in sandbox environment. |
| E2E voice STT | Blocked | Same API key dependency. |
| E2E ambient voice | Blocked | Requires `GEMINI_API_KEY` with Live API access. |
| E2E avatar | Blocked | Requires `HEYGEN_API_KEY`. |
| E2E wake word | Blocked | Requires `PORCUPINE_ACCESS_KEY` and browser environment. |
| Tauri desktop shell | Deferred | No Rust toolchain in sandbox. |
| React Native mobile | Deferred | No mobile SDK/toolchain in sandbox. |
| Supabase | SQLite | Schema matches Supabase Postgres design. Swap via `datasource` + `DATABASE_URL`. |
| Groq | Limitation | Structured output and function calling cannot be used simultaneously. |
| Module system | ESM | Uses `"type": "module"` for Bun compatibility. Switch to CJS for standalone Node. |

---

## Security Model

### Authentication

- **Admin API**: `ADMIN_API_KEY` env var → `X-Admin-Key` header. Skipped if not set (dev mode).
- **Mobile API**: Per-client API keys, bcrypt-hashed. Registered via `POST /mobile/v1/register`.
- **WebSocket**: No auth on Socket.IO (same-origin in production). In dev, open.

### Authorization

- **Capability grants**: Flat, admin-editable list. Three states: undefined/pause, allowed/execute, denied/block.
- **Approval gate**: Checked before every tool execution in the agent loop.
- **Auto-approval rules**: Priority-ordered policy overrides for risk level, tool name, and capability.

### Data Protection

- `.env` and `*.db` files are gitignored and not tracked.
- Mobile API keys stored as bcrypt hashes (never plaintext in DB).
- HeyGen API key never exposed to browser (server-side token creation only).
- Vision frames never persisted to storage by default.

### What's NOT Secured (Phase 12 scope)

- No rate limiting on API endpoints
- No HTTPS enforcement (handled by reverse proxy in production)
- No input sanitization beyond JSON schema validation
- No CSP headers beyond COOP/COEP
- WebSocket has `CORS: *` in dev mode
- No audit logging for admin config changes (only mission events are logged)

---

## Quick Start

```bash
# 1. Clone and install
cd mini-services/openjarvis-api
bun install

# 2. Configure environment
cp ../../.env.example .env
# Edit .env: set GEMINI_API_KEY, GROQ_API_KEY, ADMIN_API_KEY

# 3. Set up database
npx prisma db push

# 4. Run tests
bun test tests/

# 5. Start the API server
bun run dev
# → Express API on port 3001
# → WebSocket on port 3002

# 6. Start the frontend (from project root)
cd ../..
pnpm dev
# → Dashboard at http://localhost:3000
```

---

## Agent Loop Stages

Every mission executes through these stages, each logged as a `mission_event`:

1. **interpret** — Parse the user's goal and understand intent
2. **context_retrieval** — Search memory for relevant context (Phase 6)
3. **plan** — Decide approach and tool usage strategy
4. **risk_check** — Check approval gate (Phase 10): auto-rules → capability registry → risk fallback
5. **tool_select** — Choose the appropriate tool and arguments
6. **tool_execute** — Run the tool with timeout, retry, and audit logging
7. **observe** — Analyze tool output, determine if goal is met
8. **verify** — Verify the result is correct and complete
9. **memory_update** — Store episodic results in memory with goal-derived tags
10. **complete** — Return final result or continue the loop

Special states: `budget_exceeded` (halts with `blocked` status), `waiting_approval` (pauses for human decision), `error`.

---

*Built across 13 phases on 2026-08-17 and 2026-08-18. 320 tests passing. Single-user, self-hosted.*
