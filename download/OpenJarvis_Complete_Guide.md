# OpenJarvis — Complete Technical Guide

> A self-hosted, single-user AI agent system built with TypeScript, Express, Prisma (SQLite), Socket.IO, and multi-model AI providers.

---

## Table of Contents

1. [Project Overview](#project-overview)
2. [Architecture](#architecture)
3. [Phase-by-Phase Breakdown](#phase-by-phase-breakdown)
4. [Authorization Model](#authorization-model)
5. [Database Schema](#database-schema)
6. [API Reference](#api-reference)
7. [Authentication](#authentication)
8. [Agent Loop](#agent-loop)
9. [Tool System](#tool-system)
10. [Voice System](#voice-system)
11. [Memory System](#memory-system)
12. [Mobile API](#mobile-api)
13. [MCP/Plugin System](#mcpplugin-system)
14. [Approval Workflow](#approval-workflow)
15. [Audit & Fixes](#audit--fixes)
16. [Testing](#testing)
17. [Environment & Configuration](#environment--configuration)
18. [File Structure](#file-structure)
19. [Known Limitations & Missing Phases](#known-limitations--missing-phases)

---

## Project Overview

**OpenJarvis** is a multi-phase AI agent system designed for autonomous task execution with human-in-the-loop oversight. It implements a mission-based workflow where users define goals, and the agent interprets, plans, selects tools, executes, and verifies results — all with full audit trails and real-time WebSocket updates.

### Key Characteristics

- **Single-user, self-hosted** — designed for one admin, not multi-tenant
- **Zero default permissions** — every capability starts undefined until explicitly granted
- **"The admin is the policy"** — binary authorization gate, no RBAC complexity
- **Dual AI provider** — Gemini (Google) and Groq, swappable at runtime
- **Real-time** — Socket.IO for mission events, voice, and approval notifications
- **287 tests passing** — across 9 test files covering all phases
- **~8,000 lines of TypeScript** — 57 source files, 9 test files

### Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Runtime | Bun / Node.js | 1.3+ / 24+ |
| Framework | Express | 5.x |
| ORM | Prisma | 6.x |
| Database | SQLite | — |
| Real-time | Socket.IO | 4.x |
| AI (primary) | Google Gemini | @google/generative-ai 0.24.x |
| AI (secondary) | Groq | groq-sdk 1.5.x |
| Voice (STT) | Browser Web Speech / Gemini / Groq Whisper | — |
| Auth (keys) | bcryptjs | 3.x |
| Frontend | Next.js 16 + shadcn/ui + Tailwind | — |
| Module System | ESM (`"type": "module"`) | — |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Next.js 16 Frontend                      │
│  Dashboard / Missions / Tools / Memory / Voice / Approvals  │
└──────────┬──────────────────────────────────┬───────────────┘
           │ HTTP (port 3001)                  │ WS (port 3002)
           ▼                                  ▼
┌─────────────────────────────────────────────────────────────┐
│                  Express API Server                          │
│  ┌──────────────┐  ┌──────────────┐  ┌────────────────────┐ │
│  │ Admin Auth    │  │ Mobile Auth   │  │ Request Logger     │ │
│  │ Middleware     │  │ Middleware    │  │ Middleware         │ │
│  └──────────────┘  └──────────────┘  └────────────────────┘ │
│  ┌──────────────────────────────────────────────────────────┐│
│  │                    Routes Layer                           ││
│  │  health / missions / agent / tools / memory / voice       ││
│  │  mobile / mobileAdmin / approvals / capabilities / mcp    ││
│  └──────────────────────────────────────────────────────────┘│
│  ┌──────────────────────────────────────────────────────────┐│
│  │                   Services Layer                           ││
│  │  missionService / approvalGate / capabilityRegistry       ││
│  │  approvalService / memoryService / mobileClientService    ││
│  └──────────────────────────────────────────────────────────┘│
│  ┌──────────────────────────────────────────────────────────┐│
│  │                    Agent Core                             ││
│  │  AgentLoop → ToolRegistry → ModelProvider (Gemini/Groq)  ││
│  │  ApprovalGate (single authorization point)               ││
│  │  17 computer-control tools / 4 memory tools / web_search ││
│  └──────────────────────────────────────────────────────────┘│
│  ┌──────────────────────────────────────────────────────────┐│
│  │              Voice / MCP / Mobile Subsystems              ││
│  └──────────────────────────────────────────────────────────┘│
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
              ┌─────────────────┐
              │   SQLite (Prisma)│
              │    10 tables      │
              └─────────────────┘
```

---

## Phase-by-Phase Breakdown

### Phase 0 — Discovery (2026-08-17)
- Environment inventory, runtime pinning (Node v24.18.0 / Bun 1.3.14)
- Verified Gemini + Groq API capabilities
- `.env.example` created

### Phase 1 — Foundation (2026-08-17)
- Express server on port 3001 with structured error format
- 4 core Prisma tables: `missions`, `mission_events`, `tools`, `memory_entries`
- Service layer wraps all DB calls — no raw queries in routes
- Request logging with unique request IDs
- Full REST API: `/health`, `/missions`, `/missions/:id/events`, `/tools`, `/memory`
- **23 tests**

### Phase 2 — Agent Runtime Core (2026-08-17)
- `ModelProvider` interface with Gemini + Groq adapters
- `ToolRegistry` with `web_search` tool (z-ai-web-dev-sdk)
- Tool execution: schema validation, timeout, retry with backoff, audit log
- `AgentLoop` implementing all 10 states: interpret → context_retrieval → plan → risk_check → tool_select → tool_execute → observe → verify → memory_update → complete
- Mission state machine with guarded transitions (10 statuses)
- Budget/iteration cap: missions halt with `blocked` status when exceeded
- **23 tests**

### Phase 3 — UI (2026-08-17)
- Next.js 16 dashboard at `/` with real-time WebSocket updates
- Goal input creates real missions, agent loop streams events to timeline
- Connection banner, keyboard-only navigation
- No hardcoded placeholder data

### Phase 4 — Computer Control (2026-08-17, audited 2026-08-18)
- 17 computer-control tools: screenshot, mouse (move/click/scroll), keyboard (type/press), clipboard (read/write), filesystem (read/write/delete), shell_execute, app (launch/close), window (list/focus/info)
- Verification loop: screenshot_diff for UI tools, output_check for others
- GUI-dependent tools return honest `ENVIRONMENT_UNAVAILABLE` errors
- **Post-audit**: Removed dual permission system. Tools no longer check permissions internally — the Phase 10 `ApprovalGate` is the single authorization point. `filesystem_delete` and `shell_execute` are fully functional (not hardcoded blocked).
- **23 tests**

### Phase 5 — Voice (2026-08-17)
- `VoiceProvider` interface with 3 adapters:
  - `BrowserRelayProvider` — always available, client-side Web Speech API
  - `GeminiVoiceProvider` — STT via Gemini multimodal audio
  - `GroqVoiceProvider` — STT via Whisper API
- Voice session management with 5 states and guarded transitions
- REST API: status, provider switch, STT, TTS, session CRUD, transcript, status update
- WebSocket voice events: `subscribe:voice`, `voice:transcript`, `voice:status`
- Frontend VoiceControl component with mic button, waveform, transcript, TTS toggle
- **Post-audit**: Converted 14 inline error responses to throw `AppError` for centralized error handling
- **41 tests**

### Phase 6 — Memory (2026-08-17)
- Enhanced `MemoryEntry` schema: tags, missionId FK, source, importance (1-5), accessCount, lastAccessedAt, expiresAt
- `MemoryAssociation` table for linking related memories with strength scores
- Memory search with keyword matching + relevance scoring (text match + recency + access frequency + importance)
- `MemoryContextBuilder` injects relevant memories into agent system prompt
- 4 agent-callable memory tools: `memory_store`, `memory_recall`, `memory_search`, `memory_forget`
- Memory lifecycle: TTL/expiry, consolidation (dedup with association tracking), purge
- Enhanced REST API: search, stats, scopes, PATCH, associations, consolidate, purge, bulk-delete
- **46 tests**

### Phase 7 — Mobile (2026-08-17)
- `mobile_clients` table: name, platform (ios/android/web), bcrypt-hashed API key, enabled flag, lastSeenAt
- Mobile client service: register, authenticate, revoke, enable, regenerate API key, list, delete
- API key auth middleware: `requireMobileAuth()` validates `X-API-Key` header or `?api_key` query param
- Pagination utility: `parsePagination()` + `buildPaginatedResponse()`
- Versioned mobile API: `/mobile/v1/` with 9 authenticated endpoints + 1 open registration endpoint
- SSE event stream for mission progress (polling-based, 5min auto-timeout)
- Admin endpoints: `/mobile/admin/clients` with separate admin auth
- **Post-audit**: API keys now hashed with bcryptjs before storage. Raw key shown only at registration. Removed `@unique` constraint on apiKey (bcrypt hashes aren't indexed). Admin routes require `X-Admin-Key`.
- **22 tests**

### Phase 8 — MCP/Plugins (2026-08-17)
- MCP protocol client with JSON-RPC 2.0 over 3 transports (Stdio, SSE, In-Process)
- Plugin manager with DB-backed server CRUD, connection lifecycle, tool sync
- Tool bridging: MCP tools → namespaced `ToolHandler`s (`mcp__servername__toolname`)
- 8 REST endpoints at `/mcp/`
- **36 tests**

### Phase 9 — Opportunity Engine
- **NOT IMPLEMENTED**. No code exists for this phase.
- Was previously referenced by stale hardcoded blocks in `filesystem_delete` and `shell_execute` tools.
- Those blocks have been removed; authorization is now handled by the Phase 10 ApprovalGate.

### Phase 10 — Approval Workflow & Authorization Model (2026-08-18)
- `approval_requests` table: missionId, toolName, capability, riskLevel, status (pending|approved|rejected|expired|cancelled), toolInput, resolvedBy, expiresAt
- `approval_rules` table: name, match conditions (risk level, tool name with wildcards, capability), action (auto_approve|auto_reject|require_manual), priority
- `capability_grants` table: capability, allowed (bool), scopeType (permanent|mission|session), scopeContext (JSON constraints like `pathPrefix`), source
- **Authorization Model** — "The admin is the policy":
  - `undefined` → pause and ask (NOT a denial)
  - `allowed` → execute immediately
  - `denied` → block (no retry)
- **ApprovalGate** — single authorization point called by agent loop before every tool execution:
  1. Check auto-approval rules (highest priority)
  2. Check capability registry (allowed/denied/undefined)
  3. Risk-level fallback for tools without a capability
- **ApprovalService**: full CRUD for requests + rules, approve/reject/cancel lifecycle, expiry cleanup
- Agent loop integration: `waiting_approval` status pauses mission, polls for decision, resumes or adapts
- 11 REST endpoints at `/approvals/` + capability grant management at `/capabilities/`
- WebSocket real-time approval events
- Frontend ApprovalQueue component
- **Post-audit**: Unified with Phase 4. PermissionManager is now a thin in-memory cache; tools no longer call it. All authorization flows through ApprovalGate.
- **44 + 21 = 65 tests** (phase10.test.ts + phase10-auth-model.test.ts)

### Phase 11 — API/SDK
- **NOT IMPLEMENTED**. No code exists.

### Phase 12 — Hardening
- **NOT IMPLEMENTED**. No code exists.

---

## Authorization Model

### The Single Gate

All tool authorization flows through ONE function: `checkApprovalGate()` in `src/services/approvalGate.ts`.

```
Tool Execution Request
        │
        ▼
┌─────────────────────────┐
│  1. Auto-Approval Rules  │ ─── match? ──→ proceed / reject
│     (priority-ordered)   │
└───────────┬─────────────┘
            │ no match
            ▼
┌─────────────────────────┐
│  2. Capability Registry  │ ─── allowed? ──→ proceed
│     (DB-backed grants)   │ ─── denied? ───→ block
│     undefined? ──────────┼──→ pause & ask
└───────────┬─────────────┘
            │ no capability
            ▼
┌─────────────────────────┐
│  3. Risk-Level Fallback  │ ─── low/medium → proceed
│                           │ ─── high/critical → pause & ask
└─────────────────────────┘
```

### Three States Per Capability

| State | Meaning | Agent Behavior |
|-------|---------|---------------|
| `undefined` | No grant exists in DB | Pauses mission, creates approval request, polls for admin decision |
| `allowed` | Admin explicitly granted | Executes immediately, no pause |
| `denied` | Admin explicitly denied | Blocks immediately, no retry, no workaround |

### Scope Context

Grants can be scoped with JSON constraints:

```json
{
  "capability": "filesystem_write",
  "allowed": true,
  "scopeType": "permanent",
  "scopeContext": { "pathPrefix": "/projects/" }
}
```

This means: `filesystem_write` is allowed, but only for paths starting with `/projects/`. Other paths fall through to `undefined` (pause and ask).

### Tool-to-Capability Mapping

| Tool | Capability | Default Risk |
|------|-----------|-------------|
| `screenshot` | screenshot | low |
| `mouse_move` | mouse_move | medium |
| `mouse_click` | mouse_click | high |
| `mouse_scroll` | mouse_scroll | low |
| `key_type` | key_type | high |
| `key_press` | key_press | medium |
| `clipboard_read` | clipboard_read | medium |
| `clipboard_write` | clipboard_write | high |
| `filesystem_read` | filesystem_read | low |
| `filesystem_write` | filesystem_write | medium |
| `filesystem_delete` | filesystem_delete | critical |
| `shell_execute` | shell_execute | critical |
| `app_launch` | app_launch | medium |
| `app_close` | app_close | high |
| `window_list` | window_list | low |
| `window_focus` | window_focus | medium |
| `window_info` | window_info | low |
| `web_search` | *(none)* | medium |
| `memory_*` | *(none)* | low |

---

## Database Schema

10 tables via Prisma (SQLite provider):

| Table | Purpose | Key Fields |
|-------|---------|------------|
| `missions` | Agent mission lifecycle | status (10 states), goal, budget, maxToolCalls, tokenUsage |
| `mission_events` | Full event trail | type (14 event types), payload (JSON), missionId FK |
| `tools` | Tool definitions | name (unique), inputSchema, outputSchema, riskLevel, enabled |
| `memory_entries` | Agent memory | scope (5 types), key, value (JSON), tags (JSON), importance (1-5), accessCount, expiresAt |
| `memory_associations` | Memory-to-memory links | fromMemoryId, toMemoryId, strength (0.0-1.0) |
| `mobile_clients` | Mobile API clients | name, platform, apiKey (bcrypt hash), enabled, lastSeenAt |
| `approval_requests` | Human approval queue | missionId, toolName, capability, status (5 states), toolInput (JSON), expiresAt |
| `approval_rules` | Auto-approval policies | name (unique), matchRiskLevels (JSON), matchToolNames (JSON with wildcards), matchCapabilities (JSON), action, priority |
| `capability_grants` | Authorization grants | capability, allowed (bool), scopeType, scopeContext (JSON), missionId, source |
| `mcp_servers` | MCP plugin servers | name (unique), transport (stdio/sse/in-process), command, url, status, toolCount |
| `mcp_tools` | MCP-provided tools | serverId FK, name (unique per server), mcpName, inputSchema, riskLevel |

---

## API Reference

### Core API

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/health` | None | DB connectivity, server info |
| POST | `/missions` | Admin | Create mission |
| GET | `/missions` | Admin | List missions |
| GET | `/missions/:id` | Admin | Mission detail with event count |
| PATCH | `/missions/:id` | Admin | Update mission |
| DELETE | `/missions/:id` | Admin | Delete mission |
| GET | `/missions/:id/events` | Admin | Mission event trail |
| POST | `/agent/run` | Admin | Execute mission through agent loop |
| GET | `/agent/transitions` | Admin | Valid state transitions map |
| GET | `/tools` | Admin | List registered tools |
| POST | `/tools` | Admin | Register a tool |
| GET | `/memory` | Admin | List memory entries |
| POST | `/memory` | Admin | Create memory entry |
| GET | `/memory/search` | Admin | Search memories |
| GET | `/memory/stats` | Admin | Memory statistics |
| PATCH | `/memory/:id` | Admin | Update memory entry |
| DELETE | `/memory/:id` | Admin | Delete memory entry |
| GET | `/memory/:id/associations` | Admin | Memory associations |
| POST | `/memory/consolidate` | Admin | Deduplicate memories |
| POST | `/memory/purge-expired` | Admin | Purge expired memories |
| POST | `/memory/bulk-delete` | Admin | Bulk delete memories |

### Approval & Authorization API

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/approvals` | Admin | List approval requests (filterable) |
| POST | `/approvals` | Admin | Create approval request |
| GET | `/approvals/:id` | Admin | Get approval request detail |
| POST | `/approvals/:id/approve` | Admin | Approve once |
| POST | `/approvals/:id/approve-always` | Admin | Approve + create permanent grant |
| POST | `/approvals/:id/reject` | Admin | Reject |
| POST | `/approvals/:id/cancel` | Admin | Cancel |
| GET | `/approvals/stats` | Admin | Approval statistics |
| GET/POST | `/approvals/rules` | Admin | List/create auto-approval rules |
| PATCH | `/approvals/rules/:id` | Admin | Update rule |
| DELETE | `/approvals/rules/:id` | Admin | Delete rule |
| GET | `/capabilities` | Admin | List capability grants |
| POST | `/capabilities` | Admin | Create capability grant |
| GET | `/capabilities/statuses` | Admin | Current status of all capabilities |
| POST | `/capabilities/:id/revoke` | Admin | Revoke grant (immediate effect) |
| POST | `/capabilities/:capability/revoke-all` | Admin | Revoke all grants for a capability |

### Voice API

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/voice/status` | Admin | Voice system status + providers |
| POST | `/voice/provider` | Admin | Switch active voice provider |
| POST | `/voice/stt` | Admin | Speech-to-text |
| POST | `/voice/tts` | Admin | Text-to-speech |
| GET | `/voice/sessions` | Admin | List voice sessions |
| POST | `/voice/sessions` | Admin | Create voice session |
| GET | `/voice/sessions/:id` | Admin | Session detail + transcript |
| DELETE | `/voice/sessions/:id` | Admin | Delete session |
| POST | `/voice/sessions/:id/transcript` | Admin | Add transcript entry |
| POST | `/voice/sessions/:id/status` | Admin | Update session status |

### Mobile API

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/mobile/v1/register` | None | Register new client (returns API key) |
| GET | `/mobile/v1/missions` | Mobile | List missions (paginated) |
| GET | `/mobile/v1/missions/:id` | Mobile | Mission detail |
| GET | `/mobile/v1/missions/:id/events` | Mobile | Mission events (paginated) |
| GET | `/mobile/v1/missions/:id/events/stream` | Mobile | SSE event stream |
| GET | `/mobile/v1/memory` | Mobile | Memory entries (paginated) |
| GET | `/mobile/v1/memory/search` | Mobile | Search memories |
| GET | `/mobile/v1/tools` | Mobile | Lightweight tools list |
| POST | `/mobile/v1/agent/run` | Mobile | Run agent |
| GET | `/mobile/v1/health` | Mobile | Health check |

### Mobile Admin API

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/mobile/admin/clients` | Admin | List all clients (no key hashes) |
| POST | `/mobile/admin/clients/:id/revoke` | Admin | Disable client |
| POST | `/mobile/admin/clients/:id/enable` | Admin | Re-enable client |
| POST | `/mobile/admin/clients/:id/regenerate` | Admin | Regenerate API key |
| DELETE | `/mobile/admin/clients/:id` | Admin | Delete client |

### MCP API

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/mcp/servers` | Admin | List MCP servers |
| POST | `/mcp/servers` | Admin | Create MCP server |
| GET | `/mcp/servers/:id` | Admin | Server detail |
| PATCH | `/mcp/servers/:id` | Admin | Update server |
| DELETE | `/mcp/servers/:id` | Admin | Delete server |
| POST | `/mcp/servers/:id/connect` | Admin | Connect to server |
| POST | `/mcp/servers/:id/disconnect` | Admin | Disconnect from server |
| GET | `/mcp/tools` | Admin | List all MCP tools |

### Permissions API (Legacy)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/permissions` | Admin | List in-memory permission grants |
| POST | `/permissions/grant` | Admin | Grant a capability (in-memory) |
| POST | `/permissions/revoke` | Admin | Revoke a capability (in-memory) |

> **Note**: The `/permissions` API manipulates the in-memory `PermissionManager` only. For persistent authorization, use `/capabilities` which writes to the DB-backed `CapabilityRegistry`.

---

## Authentication

### Admin Authentication

Set `ADMIN_API_KEY` in `.env` to enable auth on all routes except:
- `GET /health`
- `POST /mobile/v1/register`

Key can be passed via:
- `X-Admin-Key` header
- `Authorization: Bearer <key>` header
- `?admin_key` query param

If `ADMIN_API_KEY` is not set, authentication is **skipped** (development mode).

### Mobile Authentication

Mobile clients receive an API key at registration. The key is:
1. Generated as a 64-char hex string
2. Hashed with bcrypt (10 rounds) before storage
3. Returned **once** in plaintext at registration
4. Validated on each request via constant-time bcrypt comparison

```bash
# Register
curl -X POST http://localhost:3001/mobile/v1/register \
  -H 'Content-Type: application/json' \
  -d '{"name":"My iPhone","platform":"ios"}'
# Response: { "id": "...", "apiKey": "abc123...", ... }  ← SAVE THIS

# Use
curl http://localhost:3001/mobile/v1/missions \
  -H 'X-API-Key: abc123...'
```

### WebSocket Authentication

WebSocket connections (port 3002) do not have auth middleware. For production, the admin should restrict WebSocket access via firewall, reverse proxy, or by adding Socket.IO middleware.

---

## Agent Loop

The `AgentLoop` class in `src/agent/agentLoop.ts` is the core execution engine.

### Execution Flow

```
1. interpret     — Parse the user's goal
2. context_retrieval — Build memory context (Phase 6)
3. plan         — Model decides approach
4. risk_check   — ApprovalGate check (Phase 10)
   └── if waiting_approval → pause, poll for decision
   └── if blocked → inform model, continue loop
5. tool_select  — Model picks a tool
6. tool_execute — Run the tool
7. observe      — Analyze tool output
8. verify       — Verification loop if applicable
9. memory_update — Store episodic result
10. complete    — Return final answer
```

### Budget Guards

- **Token budget**: Tracks cumulative token usage, halts at `mission.budget`
- **Tool call limit**: Tracks tool call count, halts at `mission.maxToolCalls`
- **Max iterations**: Outer loop cap (set to `maxToolCalls`)

### State Machine

10 mission statuses with guarded transitions:

```
draft → queued → running → completed
                  ↘ waiting_approval → running (approved) / running (rejected, continue)
                  ↘ blocked (budget exceeded)
                  ↘ failed (error)
                  ↘ cancelled
                  ↘ expired (approval timeout)
```

---

## Tool System

### Tool Registration

```typescript
const registry = new ToolRegistry();
registry.register(createWebSearchTool());
registry.register(createFilesystemReadTool());
// etc.
```

### Tool Execution Features

- **Schema validation**: Input validated against `inputSchema` before execution
- **Timeout**: Default 30s, configurable per tool
- **Retry with backoff**: 3 attempts with exponential backoff
- **Audit log**: Every tool execution logged as a `tool_execute` mission event

### Computer-Control Tools (17)

All return `ENVIRONMENT_UNAVAILABLE` in headless environments. In desktop environments, they interface with platform APIs (xdotool, wmctrl, screencapture, etc.).

### Web Search Tool

Uses `z-ai-web-dev-sdk` for real web search. Low risk, no capability required.

### Memory Tools (4)

`memory_store`, `memory_recall`, `memory_search`, `memory_forget` — all low risk, no capability required. The agent uses these to build persistent knowledge across missions.

---

## Voice System

### Providers

| Provider | STT | TTS | API Key Required |
|----------|-----|-----|-----------------|
| Browser Relay | Client-side | Client-side | No |
| Gemini | Server-side (multimodal) | No | Yes |
| Groq | Server-side (Whisper) | No | Yes |

The Browser Relay provider is always available and requires no API keys. STT/TTS happen in the browser via Web Speech API; the server relays audio buffers and transcripts.

### Voice Sessions

Sessions track ongoing voice interactions with:
- 5 states: idle → listening → processing → speaking → error
- Guarded state transitions
- Transcript entries (user/agent, with timestamps and confidence)
- WebSocket real-time relay

---

## Memory System

### Memory Scopes

| Scope | Purpose | Persistence |
|-------|---------|------------|
| `working` | Current task context | Session |
| `episodic` | Past mission results | Permanent |
| `semantic` | General knowledge | Permanent |
| `preference` | User preferences | Permanent |
| `project` | Project-specific | Permanent |

### Memory Search

Keyword matching across `key`, `value`, and `tags` fields with a composite relevance score:
- Text match score (exact > substring)
- Recency boost (more recent = higher)
- Access frequency boost (more accessed = higher)
- Importance boost (1-5 scale)

### Memory Lifecycle

- **TTL/expiry**: `expiresAt` field; `POST /memory/purge-expired` removes expired entries
- **Consolidation**: Deduplicates memories with same `scope` + `key`, merges tags, creates associations
- **Associations**: Links related memories with strength scores (0.0-1.0)

---

## Mobile API

### Design Decisions

- Versioned at `/mobile/v1/` for future breaking changes
- API key auth (not OAuth) — appropriate for single-user system
- SSE for event streaming (not WebSocket) — simpler for mobile clients, no persistent connection needed
- Paginated responses with `page`, `limit`, `total`, `offset` metadata
- Lightweight payloads: no nested event payloads in list views

---

## MCP/Plugin System

### Transports

| Transport | Use Case | Connection |
|-----------|----------|------------|
| `stdio` | Local CLI tools | Spawn process, JSON-RPC over stdin/stdout |
| `sse` | Remote MCP servers | HTTP SSE connection |
| `in-process` | Same-process plugins | Direct function calls |

### Tool Bridging

MCP tools are namespaced as `mcp__servername__toolname` and registered in the ToolRegistry. They participate in the same approval gate and risk-level system as built-in tools.

---

## Approval Workflow

### Creating Approvals

Approvals are created automatically by the `ApprovalGate` when:
1. A tool has a capability that is `undefined` (no grant exists)
2. A tool without a capability has `high` or `critical` risk level

### Resolving Approvals

- **Approve once**: Mission resumes, tool executes, no grant created
- **Approve always**: Mission resumes AND a permanent `capability_grant` is created (future executions auto-proceed)
- **Reject**: Mission continues (agent adapts to rejection)
- **Cancel/Expire**: Mission continues

### Auto-Approval Rules

Rules are evaluated in priority order (higher first). Conditions can combine:
- `matchRiskLevels`: e.g., `["low", "medium"]`
- `matchToolNames`: exact or wildcard, e.g., `["web_search", "mcp__*"]`
- `matchCapabilities`: e.g., `["filesystem_read"]`

Actions: `auto_approve`, `auto_reject`, `require_manual`

---

## Audit & Fixes

### Release Audit (2026-08-18)

A comprehensive audit identified 27 issues (7 Critical, 12 High, 5 Medium, 3 Low). All 7 CRITICAL issues were fixed:

#### CRITICAL 1: No README/INSTALLATION/QUICKSTART
- **Fix**: Created `mini-services/openjarvis-api/README.md` with Quick Start, Architecture, API Reference, Auth docs

#### CRITICAL 2: .env.example does not exist
- **Fix**: Created `.env.example` at project root with all configuration variables documented

#### CRITICAL 3: .env tracked in git
- **Fix**: `git rm --cached .env`; `.env*` pattern already in `.gitignore`

#### CRITICAL 4: SQLite .db files tracked in git
- **Fix**: `git rm --cached` for all .db files; added `*.db`, `*.db-journal`, `*.db-wal`, `*.db-shm` to `.gitignore`

#### CRITICAL 5: Mobile API keys stored in plaintext
- **Fix**: Added `bcryptjs` dependency; `mobileClientService` now hashes keys with bcrypt (10 rounds) before storage; raw key returned only once at registration; removed `@unique` on apiKey column (hashes aren't indexed); auth uses constant-time bcrypt comparison with legacy plaintext fallback

#### CRITICAL 6: All core API routes have zero authentication
- **Fix**: Created `adminAuth.ts` middleware; wired into Express as global middleware; exempts `/health` and `/mobile/v1/register`; skips auth when `ADMIN_API_KEY` is not set (dev mode); admin routes (`/mobile/admin/*`) have separate admin auth check

#### CRITICAL 7: Dual permission systems + filesystem_delete broken
- **Root Cause**: Phase 4's in-memory `PermissionManager` (binary granted/not-granted) and Phase 10's DB-backed `CapabilityRegistry` (allowed/denied/undefined) were independent systems. Agent loop checked DB system → approved; tool's `execute()` checked in-memory system → refused.
- **Fix**: 
  - Removed all `getPermissionManager().check()` calls from all 17 computer-control tool `execute()` methods
  - Removed hardcoded "Phase 9" blocks from `filesystem_delete` and `shell_execute`
  - Both tools now execute normally (filesystem operations use real `fs` calls)
  - `PermissionManager` retained as thin in-memory cache for `/permissions` API compatibility
  - `ApprovalGate` is now the **single authorization point** — checked by agent loop BEFORE tool execution
  - Expanded `_getCapabilityForTool()` mapping to include all 17 capabilities

#### Additional Fix: voice.ts error handling
- Converted 14 inline `res.status(X).json(...)` error responses to `throw AppError(...)` + `next(err)` for centralized error handling via the existing `errorHandler` middleware

---

## Testing

```bash
cd mini-services/openjarvis-api
bun install
npx prisma db push    # sync DB schema
bun test tests/       # run all tests
```

### Test Files

| File | Tests | Coverage |
|------|-------|----------|
| `phase1.test.ts` | 23 | Health, Mission CRUD, Events, Tool CRUD, Memory CRUD, Structured Errors |
| `phase2.test.ts` | 23 | Model Provider, Tool Registry, Agent Loop, State Machine, Budget Guards |
| `phase4.test.ts` | 23 | Permission Manager, Tool Execution, Filesystem Tools, Verification Loop, Risk Levels |
| `phase5.test.ts` | 41 | Voice Providers, Sessions, State Transitions, Provider Factory, Provider Switching |
| `phase6.test.ts` | 46 | Memory CRUD, Search, Recall, Associations, Context Builder, Consolidation, Purge |
| `phase7.test.ts` | 22 | Mobile Client Service, Auth, Pagination, Types |
| `phase8.test.ts` | 36 | MCP Client, Plugin Manager, Transports, Tool Bridging |
| `phase10.test.ts` | 44 | Approval CRUD, Lifecycle, Rules Engine, Gate Integration, Stats |
| `phase10-auth-model.test.ts` | 21 | Capability Registry CRUD, Three-State Check, Scoped Grants, Scope Context, Gate Integration, Immediate Revocation |
| **Total** | **287** | |

---

## Environment & Configuration

### Required Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `DATABASE_URL` | SQLite database path | `file:/home/z/my-project/db/custom.db` |
| `GEMINI_API_KEY` | Google Gemini API key | *(none — agent won't run without one)* |
| `GROQ_API_KEY` | Groq API key | *(optional fallback)* |

### Optional Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | HTTP API port | `3001` |
| `WS_PORT` | WebSocket port | `3002` |
| `ADMIN_API_KEY` | Admin auth key (if unset, auth is disabled) | *(none)* |
| `VOICE_PROVIDER` | Voice provider (browser/gemini/groq) | `browser` |
| `VOICE_LANGUAGE` | Voice language | `en-US` |
| `APPROVAL_TTL_SECONDS` | Approval request timeout | `300` |

---

## File Structure

```
mini-services/openjarvis-api/
├── index.ts                           # Express + Socket.IO entry point (168 lines)
├── package.json                       # Dependencies (bcryptjs, express, prisma, socket.io, etc.)
├── tsconfig.json
├── README.md                          # Quick start + API reference
├── prisma/
│   ├── schema.prisma                  # 10 tables (231 lines)
│   └── migrations/                    # 3 migration files (phase6, phase7, phase8)
├── src/
│   ├── agent/
│   │   ├── agentLoop.ts               # Core execution engine (387 lines)
│   │   ├── toolRegistry.ts            # Tool registration + retry + timeout
│   │   ├── missionStateMachine.ts      # 10-state guarded transitions
│   │   ├── modelProvider.ts           # ModelProvider interface + Gemini/Groq adapters
│   │   ├── verification.ts            # Verification loop (screenshot_diff, output_check)
│   │   ├── types.ts                   # Core types (ChatMessage, ModelProvider, ToolHandler, etc.)
│   │   ├── permissions/
│   │   │   ├── permissionManager.ts    # In-memory grant cache (unified with Phase 10)
│   │   │   └── types.ts               # 17 capability definitions, risk levels
│   │   ├── memory/
│   │   │   ├── contextBuilder.ts      # Builds <memory-context> for agent prompt
│   │   │   └── memoryTools.ts          # 4 agent tools: store/recall/search/forget
│   │   └── tools/
│   │       ├── webSearchTool.ts        # web_search via z-ai-web-dev-sdk
│   │       └── computer-control/       # 17 tools (8 files)
│   │           ├── filesystem.ts       # read, write, delete (real fs operations)
│   │           ├── shell.ts            # Command execution (real execSync)
│   │           ├── screenshot.ts       # Screen capture
│   │           ├── mouse.ts            # move, click, scroll
│   │           ├── keyboard.ts         # type, press
│   │           ├── clipboard.ts        # read, write
│   │           ├── window.ts           # list, focus, info
│   │           └── app.ts             # launch, close
│   ├── services/
│   │   ├── approvalGate.ts            # Single authorization point (165 lines)
│   │   ├── capabilityRegistry.ts      # DB-backed authorization model (341 lines)
│   │   ├── approvalService.ts         # Approval request + rule lifecycle
│   │   ├── missionService.ts          # Mission CRUD
│   │   ├── missionEventService.ts     # Mission event trail
│   │   ├── toolService.ts             # Tool CRUD
│   │   ├── memoryService.ts           # Memory CRUD + search + associations + lifecycle
│   │   └── mobileClientService.ts     # Client registration (bcrypt hashing)
│   ├── routes/                         # 12 route files
│   │   ├── health.ts                  # GET /health
│   │   ├── missions.ts                # Mission CRUD + events
│   │   ├── agent.ts                   # POST /agent/run, GET /agent/transitions
│   │   ├── tools.ts                   # Tool CRUD
│   │   ├── memory.ts                  # Memory CRUD + search + lifecycle
│   │   ├── permissions.ts             # Legacy in-memory permission grants
│   │   ├── voice.ts                   # Voice REST API (STT, TTS, sessions)
│   │   ├── mobile.ts                  # Versioned mobile API (v1)
│   │   ├── mobileAdmin.ts             # Admin client management
│   │   ├── approval.ts                # Approval request + rule endpoints
│   │   ├── capabilities.ts            # Capability grant endpoints
│   │   └── mcp.ts                     # MCP server + tool endpoints
│   ├── middleware/
│   │   ├── adminAuth.ts               # ADMIN_API_KEY authentication
│   │   ├── mobileAuth.ts              # Mobile API key authentication
│   │   ├── requestLogger.ts           # Structured JSON request logging
│   │   └── errorHandler.ts           # Centralized error handling
│   ├── voice/
│   │   ├── voiceManager.ts            # Provider factory, session management
│   │   ├── browserRelayProvider.ts    # Client-side STT/TTS relay
│   │   ├── geminiVoiceProvider.ts     # Gemini multimodal STT
│   │   ├── groqVoiceProvider.ts       # Groq Whisper STT
│   │   └── types.ts                   # VoiceProvider interface, VoiceError
│   ├── mcp/
│   │   ├── pluginManager.ts           # DB-backed MCP server lifecycle
│   │   ├── mcpClient.ts               # JSON-RPC 2.0 client
│   │   ├── transports.ts              # Stdio, SSE, In-Process transports
│   │   ├── types.ts                   # MCP types
│   │   └── index.ts                   # Barrel exports
│   ├── mobile/
│   │   ├── types.ts                   # PaginatedResponse, MobileClient types
│   │   └── pagination.ts              # parsePagination, buildPaginatedResponse
│   └── utils/
│       ├── db.ts                      # Prisma client + health check
│       ├── errors.ts                  # AppError + structured error factories
│       ├── logger.ts                  # JSON structured logging
│       └── eventBus.ts               # WebSocket event emitter
└── tests/                              # 9 test files, 287 tests
    ├── phase1.test.ts                 # 23 tests
    ├── phase2.test.ts                 # 23 tests
    ├── phase4.test.ts                 # 23 tests
    ├── phase5.test.ts                 # 41 tests
    ├── phase6.test.ts                 # 46 tests
    ├── phase7.test.ts                 # 22 tests
    ├── phase8.test.ts                 # 36 tests
    ├── phase10.test.ts                 # 44 tests
    └── phase10-auth-model.test.ts      # 21 tests (authorization model)

Frontend (Next.js 16):  src/components/openjarvis/
├── agent-state.tsx                    # Agent status display
├── activity-timeline.tsx              # Mission event timeline
├── Connection-banner.tsx              # Backend connection status
├── goal-input.tsx                     # Mission creation input
├── missions-tab.tsx                   # Mission list + detail
├── tools-tab.tsx                      # Tool registry display
├── memory-tab.tsx                     # Memory management UI
├── voice-control.tsx                  # Voice mic, waveform, transcript
├── settings-tab.tsx                   # Settings + mobile API info
└── approval-queue.tsx                 # Approval pending/history tabs
```

---

## Known Limitations & Missing Phases

### Missing Phases

| Phase | Name | Status |
|-------|------|--------|
| Phase 9 | Opportunity Engine | **Not implemented** — no code |
| Phase 11 | API/SDK | **Not implemented** — no code |
| Phase 12 | Hardening | **Not implemented** — no code |

### E2E Testing Blocked
- No `GEMINI_API_KEY` or `GROQ_API_KEY` in the sandbox environment
- E2E model call tests and E2E voice STT tests cannot run without API keys

### Desktop Tools
- All 17 computer-control tools return `ENVIRONMENT_UNAVAILABLE` in headless environments
- They contain real platform API code paths (xdotool, wmctrl, screencapture) for desktop deployment

### Database
- SQLite is used in development; the schema matches Supabase Postgres design for production swap
- Only 3 migration files exist (phase6, phase7, phase8); base tables were created via `prisma db push`

### WebSocket Auth
- Socket.IO WebSocket connections (port 3002) have no authentication middleware
- For production, restrict via reverse proxy or add Socket.IO middleware

### Module System
- ESM (`"type": "module"`) used for Bun compatibility; may need CJS adjustment for standalone Node.js deployment

---

## Error Response Format

Every error follows this shape:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "missionId is required",
    "requestId": "abc-123-def"
  }
}
```

### Common Error Codes

| Code | HTTP Status | Meaning |
|------|-------------|---------|
| `VALIDATION_ERROR` | 400 | Invalid input |
| `AUTH_REQUIRED` | 401 | Missing authentication |
| `AUTH_INVALID` | 401 | Invalid credentials |
| `ADMIN_AUTH_REQUIRED` | 401 | Missing admin key |
| `ADMIN_NOT_CONFIGURED` | 503 | ADMIN_API_KEY not set |
| `NOT_FOUND` | 404 | Resource not found |
| `VOICE_UNAVAILABLE` | 503 | Voice system error |
| `AUDIO_TOO_LARGE` | 413 | Audio exceeds 10MB |