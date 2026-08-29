# OpenJarvis — Master Reference Document

> **A self-hosted, single-user AI agent system with computer-control capabilities, voice interaction, persistent memory, MCP plugin extensibility, and a human-in-the-loop approval workflow.**

**Runtime Stack:** Bun · TypeScript · Express 5 · Socket.IO 4 · Prisma/SQLite · bcryptjs

**LLM Providers:** Google Gemini (primary), Groq (fallback)

**Voice Providers:** BrowserRelay · Gemini · Groq

**Project Path:** `/home/z/my-project/mini-services/openjarvis-api/`

---

## Table of Contents

1. [Build Phases Summary](#1-build-phases-summary)
2. [Architecture Overview](#2-architecture-overview)
3. [Authentication & Security](#3-authentication--security)
4. [Authorization Model (Phase 10)](#4-authorization-model-phase-10)
5. [Unified Permission System](#5-unified-permission-system)
6. [Agent Runtime (Phase 2)](#6-agent-runtime-phase-2)
7. [Built-in Tools (Phase 4)](#7-built-in-tools-phase-4)
8. [Voice System (Phase 5)](#8-voice-system-phase-5)
9. [Memory System (Phase 6)](#9-memory-system-phase-6)
10. [Mobile Clients (Phase 7)](#10-mobile-clients-phase-7)
11. [MCP Plugin System (Phase 8)](#11-mcp-plugin-system-phase-8)
12. [Approval Workflow (Phase 10)](#12-approval-workflow-phase-10)
13. [Database Schema](#13-database-schema)
14. [API Reference](#14-api-reference)
15. [WebSocket Events](#15-websocket-events)
16. [Environment Variables](#16-environment-variables)
17. [Project File Structure](#17-project-file-structure)
18. [Test Suite](#18-test-suite)
19. [Security Fixes Applied](#19-security-fixes-applied)
20. [Phase 13 & 14 Spec Status](#20-phase-13--14-spec-status)
21. [Known Limitations](#21-known-limitations)

---

## 1. Build Phases Summary

| Phase | Name | What Was Built | Key Files |
|-------|------|----------------|-----------|
| 0 | Project Scaffold | Bun + TypeScript + Express 5 + Prisma/SQLite, health check, DB setup, error handling, request logger | `index.ts`, `prisma/schema.prisma`, `src/utils/` |
| 1 | Mission Lifecycle | Mission CRUD, state machine (10 states), event timeline, REST endpoints | `src/services/missionService.ts`, `src/services/missionEventService.ts`, `src/routes/missions.ts`, `src/agent/missionStateMachine.ts` |
| 2 | Agent Runtime | ModelProvider interface, Gemini + Groq adapters, ToolRegistry, AgentLoop with 14 stages | `src/agent/modelProvider.ts`, `src/agent/toolRegistry.ts`, `src/agent/agentLoop.ts`, `src/agent/types.ts` |
| 3 | Tool Schema | ToolHandler interface, DB Tool model, tool CRUD REST endpoints, JSON Schema validation | `src/agent/types.ts`, `src/services/toolService.ts`, `src/routes/tools.ts` |
| 4 | Computer Control Tools | 17 permission-gated tools: mouse, keyboard, screenshot, filesystem, shell, clipboard, window, app | `src/agent/tools/computer-control/` |
| 5 | Voice System | 3 voice providers (BrowserRelay, Gemini, Groq), sessions, STT/TTS, browser transcript relay | `src/voice/`, `src/routes/voice.ts` |
| 6 | Memory Enhancement | 5-scope memory, importance scoring, associations, keyword search, context builder for agent prompt injection | `src/services/memoryService.ts`, `src/agent/memory/contextBuilder.ts`, `src/agent/memory/memoryTools.ts`, `src/routes/memory.ts` |
| 7 | Mobile Clients | API key auth (bcrypt hashed), versioned mobile API, pagination, SSE event streaming | `src/services/mobileClientService.ts`, `src/middleware/mobileAuth.ts`, `src/routes/mobile.ts`, `src/routes/mobileAdmin.ts`, `src/mobile/` |
| 8 | MCP Plugin System | 3 transport types (stdio, SSE, in-process), tool sync, plugin manager, MCP protocol client | `src/mcp/`, `src/routes/mcp.ts` |
| 9 | (Placeholder) | Shell execution blocked, awaiting Phase 10 approval workflow | `src/agent/tools/computer-control/shell.ts` |
| 10 | Approval Workflow & Auth | 3-state capability system, approval gate, rules engine, always-allow learning, admin auth with setup token | `src/services/approvalGate.ts`, `src/services/approvalService.ts`, `src/services/capabilityRegistry.ts`, `src/middleware/adminAuth.ts`, `src/routes/approval.ts`, `src/routes/capabilities.ts`, `src/routes/auth.ts`, `src/routes/permissions.ts` |
| 11 | (Security hardening) | Unified permission system, bcrypt mobile keys, admin auth on all routes, .gitignore, README | Security fixes (see §19) |
| 12 | (Integration testing) | Comprehensive test suite expanded, all 283 tests passing | `tests/` |

---

## 2. Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    OpenJarvis API Server                     │
│                                                              │
│  ┌──────────┐  ┌────────────┐  ┌───────────┐  ┌───────────┐ │
│  │ Express 5│  │ Socket.IO 4│  │ Prisma/SQL│  │   Logger   │ │
│  │ HTTP :3001│  │  WS  :3002 │  │   (DB)    │  │  + EventBus│ │
│  └────┬─────┘  └──────┬─────┘  └─────┬─────┘  └───────────┘ │
│       │               │               │                      │
│  ┌────▼───────────────────────────────▼─────────────────────┐│
│  │                    Middleware Layer                        ││
│  │  requestLogger → adminAuth → mobileAuth → errorHandler    ││
│  └────┬───────────────────────────────┬─────────────────────┘│
│       │               │               │                      │
│  ┌────▼───────────────────────────────▼─────────────────────┐│
│  │                    Route Layer (13 files)                  ││
│  │  health · auth · missions · tools · memory · agent         ││
│  │  permissions · voice · mobile · mobileAdmin · mcp          ││
│  │  approval · capabilities                                   ││
│  └────┬───────────────────────────────┬─────────────────────┘│
│       │               │                                       │
│  ┌────▼───────────────────────────────▼─────────────────────┐│
│  │                    Service Layer                           ││
│  │  missionService · missionEventService · toolService        ││
│  │  memoryService · approvalService · capabilityRegistry      ││
│  │  approvalGate · mobileClientService                        ││
│  └────┬───────────────────────────────┬─────────────────────┘│
│       │               │                                       │
│  ┌────▼───────────────────────────────▼─────────────────────┐│
│  │                    Agent Runtime                           ││
│  │  AgentLoop → ModelProvider (Gemini/Groq)                   ││
│  │  ToolRegistry → 17 computer tools + web_search             ││
│  │  PermissionManager → CapabilityRegistry (unified)          ││
│  │  ApprovalGate → ApprovalService → WebSocket broadcast      ││
│  │  ContextBuilder (memory → system prompt injection)         ││
│  └──────────────────────────────────────────────────────────┘│
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐ │
│  │ Voice System │  │ MCP Plugins  │  │  Mobile Client API   │ │
│  │ BrowserRelay  │  │ stdio/sse/   │  │  /mobile/v1/*        │ │
│  │ Gemini        │  │ in-process   │  │  X-API-Key auth      │ │
│  │ Groq          │  │ tool sync    │  │  SSE streaming       │ │
│  └──────────────┘  └──────────────┘  └──────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

### Data Flow: Mission Execution

1. **Create mission** via `POST /missions` or `POST /mobile/v1/missions`
2. **Run agent** via `POST /agent/run` — agent loop starts
3. Agent loop stages: `interpret → context_retrieval → plan → risk_check → tool_select → tool_execute → observe → verify → memory_update → complete`
4. At **risk_check**, the approval gate runs: auto-approval rules → capability registry → risk-level fallback
5. If approval needed, mission pauses at `waiting_approval` → WebSocket notifies admin → admin approves/rejects via REST
6. On approval with `alwaysAllow: true`, a permanent capability grant is created (preference learning)
7. Mission events emitted via Socket.IO to `mission:{id}` room
8. On completion, episodic memory is stored with goal→result association

---

## 3. Authentication & Security

### 3.1 Admin Authentication (Bearer Token)

All core routes require `Authorization: Bearer <token>`.

**First-run setup flow:**

```
1. Server starts, calls ensureAdminUser()
2. No admin exists → generates one-time setup token (UUID, expires in 24h)
3. Token logged to console and returned via GET /auth/status
4. Admin calls POST /auth/setup { setupToken, password }
5. Password hashed with bcrypt (12 rounds), setup token consumed
6. Session token (UUID) returned for subsequent requests
```

**Login flow:**

```
POST /auth/login { username: "admin", password: "..." }
→ bcrypt.compare(password, passwordHash)
→ Session token (UUID) stored in-memory, expires in 24h
→ Return { token: "<session-uuid>" }
```

**Session management:**
- In-memory `Map<string, { createdAt: number }>`
- Sessions reset on server restart
- 24-hour expiry enforced on each request
- `POST /auth/logout` invalidates session

### 3.2 Mobile Authentication (API Key)

Mobile clients use `X-API-Key` header or `?api_key` query param.

```
POST /mobile/v1/register { name: "iPhone", platform: "ios" }
→ 64-char hex API key generated
→ Key hashed with bcrypt (10 rounds) before storage
→ Plaintext key returned ONLY at creation time
```

**Authentication:** On each request, `mobileClientService.authenticate(apiKey)` scans all enabled clients and compares bcrypt hashes. `lastSeenAt` updated on successful auth.

### 3.3 Route Protection Matrix

| Route Prefix | Auth Required | Method |
|--------------|---------------|--------|
| `/health` | None | Public |
| `/auth` | None (except `/logout`) | Self-managed |
| `/mobile/v1` | X-API-Key (mobile auth) | `requireMobileAuth()` |
| `/missions` | Bearer token (admin auth) | `requireAdminAuth()` |
| `/tools` | Bearer token | `requireAdminAuth()` |
| `/memory` | Bearer token | `requireAdminAuth()` |
| `/agent` | Bearer token | `requireAdminAuth()` |
| `/permissions` | Bearer token | `requireAdminAuth()` |
| `/voice` | Bearer token | `requireAdminAuth()` |
| `/mobile/admin` | Bearer token | `requireAdminAuth()` |
| `/mcp` | Bearer token | `requireAdminAuth()` |
| `/approvals` | Bearer token | `requireAdminAuth()` |
| `/capabilities` | Bearer token | `requireAdminAuth()` |

---

## 4. Authorization Model (Phase 10)

### 4.1 Three-State Capability System

"The admin is the policy." Every capability starts in the **undefined** state.

| State | Meaning | Agent Behavior |
|-------|---------|----------------|
| `undefined` | No grant exists yet | **Pauses and asks** — creates an approval request, mission enters `waiting_approval` |
| `allowed` | Admin explicitly granted | **Executes immediately** — no pause |
| `denied` | Admin explicitly denied | **Blocks** — no retry, no workaround |

> **Key insight:** `undefined ≠ denied`. Undefined pauses; denied blocks. This prevents the agent from silently failing and forces explicit admin decisions.

### 4.2 Scoped Grants

Grants can be scoped to limit their applicability:

| Scope Type | Description | Example |
|------------|-------------|---------|
| `permanent` | Always applies | Grant `filesystem_read` permanently |
| `mission` | Only for a specific mission | Grant `shell_execute` for mission `abc123` |
| `session` | For this server session | Grant `mouse_click` temporarily |

**Scope Context:** Optional JSON constraint for fine-grained control:
```json
{ "pathPrefix": "/projects/" }
```
When a grant has scope context, the tool input is checked against it. For example, a `filesystem_write` grant with `pathPrefix: "/projects/"` only allows writes under that directory.

### 4.3 Approval Gate Flow

The `checkApprovalGate()` function in `src/services/approvalGate.ts` implements the authorization decision:

```
Tool execution requested
       │
       ▼
Step 1: Check auto-approval rules (highest priority)
       │
       ├─ Rule matches → auto_approve?  → { proceed: true }
       │              → auto_reject?   → { proceed: false, status: 'blocked' }
       │              → require_manual? → fall through
       │
       ▼
Step 2: If tool has a capability, check capability registry
       │
       ├─ ALLOWED   → { proceed: true }
       ├─ DENIED    → { proceed: false, status: 'blocked' }
       └─ UNDEFINED → fall through

       ▼
Step 3: Risk-level fallback (only for tools WITHOUT a capability)
       │
       ├─ low/medium risk → { proceed: true }
       └─ high/critical  → pause and ask

       ▼
Step 4: Create ApprovalRequest, pause mission at waiting_approval
       → Agent loop polls waitForApprovalDecision() every 2s (max 5 min)
```

### 4.4 Auto-Approval Rules

Admin-configured policy rules stored in the `approval_rules` table. Rules have:

- **matchRiskLevels:** JSON array, e.g. `["low", "medium"]`
- **matchToolNames:** JSON array with wildcard support, e.g. `["web_search", "mcp__*"]`
- **matchCapabilities:** JSON array, e.g. `["filesystem_read"]`
- **action:** `auto_approve` | `auto_reject` | `require_manual`
- **priority:** Higher priority rules evaluated first (descending)

If no conditions are set, the rule matches everything (global catch-all).

### 4.5 Always-Allow Preference Learning

When approving a request, the admin can set `alwaysAllow: true`:

```json
POST /approvals/:id/approve
{ "resolvedBy": "admin", "alwaysAllow": true }
```

This creates a **permanent capability grant** with source `approval_always_allow`, linking back to the approval request ID. Future requests for the same capability will auto-proceed without asking.

---

## 5. Unified Permission System

### The Problem

Phase 4 created an in-memory `PermissionManager` with a `Map<Capability, boolean>`. Phase 10 introduced the DB-backed `CapabilityRegistry` with 3-state semantics. These needed to be unified.

### The Solution

`PermissionManager.check()` now **delegates entirely** to `capabilityRegistry.check()`. The old in-memory Map is no longer the source of truth.

```typescript
// src/agent/permissions/permissionManager.ts
async check(capability: Capability): Promise<{ allowed: boolean; reason?: string }> {
  const result = await capabilityRegistry.check(capability);

  if (result.status === 'allowed') return { allowed: true };
  if (result.status === 'denied')  return { allowed: false, reason: `...explicitly denied...` };
  // undefined — pause and ask
  return { allowed: false, reason: result.reason || `...requires admin approval...` };
}
```

### Why This Matters for `filesystem_delete`

Previously, `filesystem_delete` was **hard-blocked** by the old permission system — it always returned `allowed: false` regardless of capability grants. After unification, `filesystem_delete` goes through the normal approval flow: the approval gate creates an approval request, the admin decides, and if approved (especially with `alwaysAllow`), the capability grant persists.

---

## 6. Agent Runtime (Phase 2)

### 6.1 Agent Loop

The `AgentLoop` class in `src/agent/agentLoop.ts` is the core execution engine. It runs as a synchronous-looking `async` function that loops until completion, error, or budget exceeded.

### 6.2 Loop Stages

| Stage | Description |
|-------|-------------|
| `interpret` | Parse the user's goal, set initial state |
| `context_retrieval` | Build memory context via `buildMemoryContext()`, inject into system prompt |
| `plan` | Model plans its approach (implicit in the LLM response) |
| `risk_check` | Approval gate check — auto-approve/deny, capability registry, risk-level fallback |
| `tool_select` | Model selects a tool to call |
| `tool_execute` | Tool executed via ToolRegistry (with timeout, retry, audit) |
| `observe` | Analyze tool output, record success/failure |
| `verify` | Verify the final result (on completion) |
| `memory_update` | Store episodic result memory with goal→result association |
| `adapt` | (Reserved) Adapt strategy based on observations |
| `escalate` | (Reserved) Escalate to human if stuck |
| `complete` | Mission completed successfully |
| `error` | Unrecoverable error |
| `budget_exceeded` | Token budget or tool call limit reached |

### 6.3 Tool Registry

`ToolRegistry` (in-memory `Map<string, ToolHandler>`) provides:

- **Registration:** `register(handler)` — validates no duplicates
- **Execution:** `executeTool(name, input, options)` — with:
  - Configurable timeout (default 30s via `TOOL_EXECUTION_TIMEOUT_MS`)
  - Configurable retries (default 2 via `TOOL_RETRY_COUNT`)
  - Exponential backoff (base 1s via `TOOL_RETRY_BACKOFF_MS`)
  - JSON Schema input/output validation
  - In-memory audit log of all executions

### 6.4 Model Provider Abstraction

Both Gemini and Groq implement the `ModelProvider` interface:

```typescript
interface ModelProvider {
  readonly name: string;
  chat(messages: ChatMessage[], tools?: ToolDefinition[]): Promise<ModelResponse>;
}
```

| Provider | Default Model | Package |
|----------|--------------|---------|
| `GeminiProvider` | `gemini-2.5-flash` | `@google/generative-ai` |
| `GroqProvider` | `llama-3.3-70b-versatile` | `groq-sdk` |

Factory function: `createModelProvider('gemini' | 'groq')` — swapping providers requires zero changes outside the adapter.

### 6.5 Mission State Machine

10 valid states with enforced transitions:

| Current State | Allowed Next States |
|---------------|-------------------|
| `draft` | `queued`, `cancelled` |
| `queued` | `running`, `cancelled` |
| `running` | `waiting_approval`, `paused`, `blocked`, `failed`, `completed`, `cancelled` |
| `waiting_approval` | `running`, `paused`, `blocked`, `failed`, `cancelled` |
| `paused` | `running`, `cancelled` |
| `blocked` | `queued`, `cancelled` |
| `failed` | `queued`, `cancelled` |
| `completed` | *(terminal)* |
| `cancelled` | *(terminal)* |
| `expired` | *(terminal)* |

---

## 7. Built-in Tools (Phase 4)

All 17 computer-control tools are defined in `src/agent/tools/computer-control/`. Each tool calls `getPermissionManager().check()` before execution, which delegates to the unified capability registry.

### 7.1 Complete Tool Reference

| # | Tool Name | Capability | Risk Level | File | Description |
|---|-----------|-----------|------------|------|-------------|
| 1 | `screenshot` | `screenshot` | low | `screenshot.ts` | Capture screen as base64 image |
| 2 | `mouse_move` | `mouse_move` | medium | `mouse.ts` | Move cursor to coordinates |
| 3 | `mouse_click` | `mouse_click` | high | `mouse.ts` | Click at position (verification loop) |
| 4 | `mouse_scroll` | `mouse_scroll` | low | `mouse.ts` | Scroll mouse wheel |
| 5 | `key_type` | `key_type` | high | `keyboard.ts` | Type text string (verification loop) |
| 6 | `key_press` | `key_press` | medium | `keyboard.ts` | Press single key/combination |
| 7 | `clipboard_read` | `clipboard_read` | medium | `clipboard.ts` | Read clipboard contents |
| 8 | `clipboard_write` | `clipboard_write` | high | `clipboard.ts` | Write to clipboard |
| 9 | `filesystem_read` | `filesystem_read` | low | `filesystem.ts` | Read file or list directory |
| 10 | `filesystem_write` | `filesystem_write` | medium | `filesystem.ts` | Write file (creates dirs) |
| 11 | `filesystem_delete` | `filesystem_delete` | critical | `filesystem.ts` | Delete file/directory |
| 12 | `shell_execute` | `shell_execute` | critical | `shell.ts` | Execute shell command (hard-blocked) |
| 13 | `app_launch` | `app_launch` | medium | `app.ts` | Launch application |
| 14 | `app_close` | `app_close` | high | `app.ts` | Close application (verification loop) |
| 15 | `window_list` | `window_list` | low | `window.ts` | List all open windows |
| 16 | `window_focus` | `window_focus` | medium | `window.ts` | Focus window by ID (verification loop) |
| 17 | `window_info` | `window_info` | low | `window.ts` | Get focused window info |

### 7.2 Additional Tool

| Tool Name | Risk Level | File | Description |
|-----------|------------|------|-------------|
| `web_search` | low | `webSearchTool.ts` | Search web via z-ai-web-dev-sdk. No capability gating (non-destructive). |

### 7.3 Risk Level Distribution

| Risk Level | Capabilities |
|------------|-------------|
| **critical** | `filesystem_delete`, `shell_execute` |
| **high** | `mouse_click`, `key_type`, `clipboard_write`, `app_close` |
| **medium** | `mouse_move`, `key_press`, `clipboard_read`, `filesystem_write`, `app_launch`, `window_focus` |
| **low** | `screenshot`, `mouse_scroll`, `filesystem_read`, `window_list`, `window_info` |

### 7.4 ToolHandler Interface

```typescript
interface ToolHandler {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;   // JSON Schema
  outputSchema: Record<string, unknown>;  // JSON Schema
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  capability?: string;  // maps to CapabilityRegistry for permission gating
  execute: (input: Record<string, unknown>) => Promise<ToolExecutionResult>;
}
```

### 7.5 Environment Availability

All computer-control tools return `ENVIRONMENT_UNAVAILABLE` in headless/sandbox environments. Only `filesystem_read`, `filesystem_write`, and `filesystem_delete` have real implementations (using Node.js `fs` module). `window_list` attempts `wmctrl -l` on Linux. `shell_execute` is explicitly hard-blocked pending approval workflow.

---

## 8. Voice System (Phase 5)

### 8.1 Provider Architecture

Three voice providers, all implementing the `VoiceProvider` interface:

```typescript
interface VoiceProvider {
  readonly name: string;
  readonly capabilities: VoiceCapability[];  // 'stt' | 'tts' | 'streaming_stt' | 'streaming_tts'
  transcribe(audio: Buffer, options?: VoiceStreamOptions): Promise<STTResult>;
  synthesize(text: string, options?: VoiceStreamOptions): Promise<TTSResult>;
  getVoices(): Promise<VoiceInfo[]>;
}
```

| Provider | Capabilities | API Key Required | Description |
|----------|-------------|------------------|-------------|
| `BrowserRelayProvider` | None (relay only) | No | Client-side Web Speech API, server relays transcripts via WebSocket |
| `GeminiVoiceProvider` | `stt`, `tts` | `GEMINI_API_KEY` | Server-side STT/TTS via Google Gemini |
| `GroqVoiceProvider` | `stt`, `tts` | `GROQ_API_KEY` | Server-side STT/TTS via Groq |

### 8.2 Initialization

`initVoiceSystem()` is called at server startup:
1. Always registers BrowserRelay (always available, no API key)
2. Attempts to initialize configured provider (`VOICE_PROVIDER` env var, default `browser`)
3. Falls back to `browser` on failure
4. Also registers Gemini and Groq as secondaries if their API keys are available

### 8.3 Voice Sessions

In-memory session management for streaming conversations:

```typescript
interface VoiceSession {
  id: string;
  missionId?: string;
  status: VoiceSessionStatus;  // 'idle' | 'listening' | 'processing' | 'speaking' | 'error'
  provider: string;
  language: string;      // default 'en-US'
  voice: string;         // default 'browser-default'
  createdAt: Date;
  lastActivityAt: Date;
  transcript: VoiceTranscriptEntry[];
}
```

Valid session transitions: `idle → listening → processing → speaking → idle` (with `error` accessible from any state).

### 8.4 TTS Stream Options

```typescript
interface VoiceStreamOptions {
  language?: string;      // e.g. 'en-US', 'zh-CN'
  voice?: string;         // provider-specific voice ID
  speed?: number;         // 0.25 - 4.0
  pitch?: number;         // -20.0 to 20.0
  chunkSizeMs?: number;   // streaming chunk size for TTS
}
```

---

## 9. Memory System (Phase 6)

### 9.1 Five Memory Scopes

| Scope | Purpose | Typical Content |
|-------|---------|----------------|
| `working` | Short-lived, mission-specific scratchpad | Intermediate calculations, current task state |
| `episodic` | Past experiences and outcomes | Mission results, what worked/failed |
| `semantic` | General knowledge and facts | Technical concepts, domain knowledge |
| `preference` | User preferences and settings | Coding style, preferred tools, communication style |
| `project` | Project-specific context | Project structure, conventions, active tasks |

### 9.2 Memory Entry Structure

| Field | Type | Description |
|-------|------|-------------|
| `scope` | string | One of 5 scopes above |
| `key` | string | Unique within scope |
| `value` | JSON string | Arbitrary structured data |
| `tags` | JSON array string | e.g. `["python", "debugging"]` |
| `missionId` | string? | Link to creating mission |
| `source` | string | `agent` / `user` / `system` / `import` |
| `importance` | int (1-5) | 5 = most important |
| `accessCount` | int | Incremented on each recall |
| `lastAccessedAt` | datetime? | Updated on recall |
| `expiresAt` | datetime? | null = never expires |

### 9.3 Importance Scoring (1-5)

| Level | Meaning |
|-------|---------|
| 1 | Ephemeral, can be purged freely |
| 2 | Low priority, useful but not critical |
| 3 | Default for auto-created memories |
| 4 | Important, should be retained |
| 5 | Critical, must not be purged automatically |

### 9.4 Search & Recall

Keyword-based search with composite relevance scoring:

- **Exact key match:** +0.5
- **Key contains query:** +0.3
- **Value contains query:** +0.2
- **Token-level matching:** +0.1 to +0.2 per token
- **Tag match:** +0.2 per matching tag
- **Recency bonus:** Up to +0.1 (decays over 30 days)
- **Access frequency bonus:** Up to +0.1 (normalized by 20 accesses)
- **Importance bonus:** Up to +0.15 (importance/5 × 0.15)

### 9.5 Memory Associations

Directed associations between memory entries with strength (0.0-1.0):
```typescript
interface MemoryAssociation {
  fromMemoryId: string;
  toMemoryId: string;
  strength: number;  // 0.0-1.0
}
```

Used during consolidation to link old→new entries when merging duplicates.

### 9.6 Context Builder

`buildMemoryContext()` (in `src/agent/memory/contextBuilder.ts`) is called during the agent loop's `context_retrieval` stage:

1. Recalls relevant memories via `memoryService.recallForContext(goal)`
2. Fetches mission-specific memories if `missionId` provided
3. Sorts by combined relevance+importance score
4. Groups by scope with human-readable labels
5. Builds `<memory-context>` block (max ~2000 tokens / 8000 chars)
6. Injects into system prompt for the LLM
7. Touches (increments access count) on all used memories

### 9.7 Memory Operations

| Operation | Method | Description |
|-----------|--------|-------------|
| Create | `memoryService.create()` | Store new memory |
| Read | `memoryService.getById()` / `get()` | Get by ID or scope+key |
| Update | `memoryService.update()` | Update value, tags, importance, expiry |
| Delete | `memoryService.remove()` / `bulkRemove()` | Single or batch delete |
| Search | `memoryService.search()` | Keyword search with scoring |
| Recall | `memoryService.recallForContext()` | Multi-scope recall for agent |
| Consolidate | `memoryService.consolidate()` | Merge duplicates, create associations |
| Purge | `memoryService.purgeExpired()` | Delete expired entries |
| Stats | `memoryService.getStats()` | By scope, importance, source counts |
| Associate | `memoryService.createAssociation()` | Link two memories |

---

## 10. Mobile Clients (Phase 7)

### 10.1 Client Registration

```bash
POST /mobile/v1/register
{ "name": "My iPhone", "platform": "ios" }

# Response (apiKey shown ONLY here, never again)
{
  "id": "uuid",
  "name": "My iPhone",
  "platform": "ios",
  "apiKey": "a1b2c3d4...64 chars...",
  "createdAt": "..."
}
```

Supported platforms: `ios`, `android`, `web`

### 10.2 API Key Security

- Keys are 64-character hex strings (two UUIDs concatenated)
- Stored as **bcrypt hashes** (10 rounds) in the `mobile_clients` table
- Plaintext key returned **only at creation time** and on explicit regeneration
- Authentication scans all enabled clients (no plaintext index possible with bcrypt)

### 10.3 Mobile API Endpoints

All under `/mobile/v1/`, authenticated via `X-API-Key` header:

| Endpoint | Description |
|----------|-------------|
| `POST /register` | Register client, get API key (no auth required) |
| `GET /missions` | Paginated mission list (summary only) |
| `GET /missions/:id` | Mission detail with event summary |
| `POST /missions` | Create mission |
| `GET /missions/:id/events` | Paginated events |
| `GET /missions/:id/events/stream` | **SSE event stream** (auto-timeout 5min) |
| `GET /memory` | Paginated memory list |
| `GET /memory/search` | Search memories |
| `GET /tools` | Tool list (names, descriptions, risk levels) |
| `POST /agent/run` | Create mission + get SSE stream URL |
| `GET /health` | Mobile API health check |

### 10.4 SSE Event Streaming

`GET /mobile/v1/missions/:id/events/stream` provides a Server-Sent Events stream:
- Sends existing events first
- Polls DB every 1s for new events
- Auto-terminates on mission completion (`done` event) or 5-minute timeout
- Event types match agent loop stages

### 10.5 Pagination

Standard pagination via `page` and `limit` query params (defaults: page=1, limit=20, max=100):

```json
{
  "data": [...],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 42,
    "totalPages": 3,
    "hasNext": true,
    "hasPrev": false
  }
}
```

### 10.6 Admin Management

Admin endpoints under `/mobile/admin/` (require Bearer token):

| Endpoint | Description |
|----------|-------------|
| `GET /clients` | List all clients (hash never exposed) |
| `POST /clients/:id/revoke` | Disable a client |
| `POST /clients/:id/enable` | Re-enable a client |
| `POST /clients/:id/regenerate` | Regenerate API key |
| `DELETE /clients/:id` | Delete a client |

---

## 11. MCP Plugin System (Phase 8)

### 11.1 Transport Types

| Transport | Description | Config Required |
|-----------|-------------|----------------|
| `stdio` | Launch external process, communicate via stdin/stdout | `command`, `args`, `env` |
| `sse` | Connect to remote MCP server via Server-Sent Events | `url` |
| `in-process` | Register tools directly in the server process | Tool definitions + handlers |

### 11.2 MCP Protocol

Implements JSON-RPC 2.0 over the transport layer:
- `initialize` → `McpInitializeResult`
- `tools/list` → `McpListToolsResult`
- `tools/call` → `McpCallToolResult`

### 11.3 Tool Synchronization

When an MCP server connects:
1. Protocol client sends `tools/list`
2. Discovered tools are stored in `mcp_tools` table
3. Tool names are namespaced: `mcp__{serverName}__{toolName}`
4. All MCP tools default to `riskLevel: 'medium'`
5. Tools from disconnected servers are not available to the agent

### 11.4 Plugin Manager

`mcpPluginManager` (in `src/mcp/pluginManager.ts`):

- **Server CRUD:** Create, list, get, update, delete MCP server configs (DB-backed)
- **Connection lifecycle:** Connect (creates transport → initializes protocol → syncs tools), disconnect
- **Tool handlers:** `buildToolHandlers()` creates `ToolHandler[]` from all connected servers for injection into the agent's `ToolRegistry`
- **In-process registration:** `registerInProcess()` for testing or built-in plugins

### 11.5 MCP Server Statuses

| Status | Description |
|--------|-------------|
| `disconnected` | Registered but not connected |
| `connecting` | Connection in progress |
| `connected` | Active, tools available |
| `error` | Connection failed, `lastError` populated |

---

## 12. Approval Workflow (Phase 10)

### 12.1 Approval Request Lifecycle

```
pending → approved
pending → rejected
pending → expired (auto, after TTL)
pending → cancelled
```

### 12.2 Approval Request Fields

| Field | Description |
|-------|-------------|
| `missionId` | Which mission triggered this |
| `toolName` | Tool being requested |
| `capability` | Capability being checked (for permission-gated tools) |
| `riskLevel` | Tool's risk level |
| `status` | `pending` / `approved` / `rejected` / `expired` / `cancelled` |
| `reason` | Human-readable reason |
| `toolInput` | JSON string of the tool's input arguments |
| `resolvedBy` | Who approved/rejected |
| `response` | Optional response message from approver |
| `expiresAt` | Auto-expire time (default 5 minutes) |

### 12.3 Approval Rules Engine

Rules stored in `approval_rules` table, evaluated by priority (descending):

```json
{
  "name": "auto-approve-read-ops",
  "description": "Auto-approve all read-only operations",
  "enabled": true,
  "matchRiskLevels": ["low"],
  "matchCapabilities": ["filesystem_read", "screenshot", "window_list"],
  "action": "auto_approve",
  "priority": 10
}
```

Rule matching supports:
- **Exact tool names:** `["web_search"]`
- **Wildcard patterns:** `["mcp__*"]` (matches any MCP tool)
- **Risk level arrays:** `["low", "medium"]`
- **Capability arrays:** `["filesystem_read"]`

### 12.4 Approval Statistics

```json
GET /approvals/stats
{
  "total": 42,
  "pending": 3,
  "approved": 35,
  "rejected": 2,
  "expired": 1,
  "cancelled": 1
}
```

---

## 13. Database Schema

**Database:** SQLite (via Prisma ORM)

**Migrations:** 3 migrations applied

### 13.1 All 12 Models

#### Mission
| Field | Type | Default | Notes |
|-------|------|---------|-------|
| `id` | String (UUID) | auto | PK |
| `owner` | String | `"default"` | |
| `goal` | String | — | Required |
| `status` | String | `"draft"` | 10 valid states |
| `plan` | String? | — | JSON string |
| `riskLevel` | String? | `"low"` | low/medium/high/critical |
| `budget` | Int | `100000` | Max token budget |
| `maxToolCalls` | Int | `50` | Max tool calls per mission |
| `toolCallCount` | Int | `0` | Actual tool calls made |
| `tokenUsage` | Int | `0` | Approx tokens consumed |
| `createdAt` | DateTime | `now()` | |
| `updatedAt` | DateTime | `@updatedAt` | |

**Relations:** has many `MissionEvent`, has many `MemoryEntry`

#### MissionEvent
| Field | Type | Notes |
|-------|------|-------|
| `id` | String (UUID) | PK |
| `missionId` | String | FK → Mission (cascade delete) |
| `type` | String | 14 event types (see §6.2) |
| `payload` | String? | JSON string |
| `createdAt` | DateTime | |

**Indexes:** `missionId`

#### Tool
| Field | Type | Default | Notes |
|-------|------|---------|-------|
| `id` | String (UUID) | PK |
| `name` | String | Unique |
| `description` | String | Required |
| `inputSchema` | String? | JSON Schema string |
| `outputSchema` | String? | JSON Schema string |
| `riskLevel` | String | `"low"` |
| `enabled` | Boolean | `true` |
| `createdAt` | DateTime | |

#### MemoryEntry
| Field | Type | Default | Notes |
|-------|------|---------|-------|
| `id` | String (UUID) | PK |
| `scope` | String | — | working/episodic/semantic/preference/project |
| `key` | String | — | |
| `value` | String? | — | JSON string |
| `tags` | String? | — | JSON array string |
| `missionId` | String? | — | FK → Mission (set null on delete) |
| `source` | String | `"agent"` | agent/user/system/import |
| `importance` | Int | `3` | 1-5 scale |
| `accessCount` | Int | `0` | |
| `lastAccessedAt` | DateTime? | — | |
| `expiresAt` | DateTime? | — | null = never expires |

**Indexes:** `scope`, `key`, `missionId`, `importance`

#### MemoryAssociation
| Field | Type | Default | Notes |
|-------|------|---------|-------|
| `id` | String (UUID) | PK |
| `fromMemoryId` | String | FK → MemoryEntry (cascade) |
| `toMemoryId` | String | FK → MemoryEntry (cascade) |
| `strength` | Float | `1.0` | 0.0-1.0 |

**Unique:** `[fromMemoryId, toMemoryId]`

#### MobileClient
| Field | Type | Notes |
|-------|------|-------|
| `id` | String (UUID) | PK |
| `name` | String | |
| `platform` | String | ios/android/web |
| `apiKeyHash` | String | Unique, bcrypt hash |
| `enabled` | Boolean | Default true |
| `lastSeenAt` | DateTime? | Updated on auth |

#### ApprovalRequest
| Field | Type | Notes |
|-------|------|-------|
| `id` | String (UUID) | PK |
| `missionId` | String | |
| `toolName` | String | |
| `capability` | String? | For permission-gated tools |
| `riskLevel` | String | Default "medium" |
| `status` | String | pending/approved/rejected/expired/cancelled |
| `reason` | String? | |
| `toolInput` | String? | JSON string |
| `resolvedBy` | String? | |
| `resolvedAt` | DateTime? | |
| `response` | String? | |
| `expiresAt` | DateTime? | |

#### CapabilityGrant
| Field | Type | Default | Notes |
|-------|------|---------|-------|
| `id` | String (UUID) | PK |
| `capability` | String | — | e.g. "filesystem_write" |
| `allowed` | Boolean | `true` | true=granted, false=denied |
| `scopeType` | String | `"permanent"` | permanent/mission/session |
| `scopeContext` | String? | — | JSON constraint string |
| `missionId` | String? | — | For mission-scoped grants |
| `source` | String | `"manual"` | manual/approval_always_allow |
| `approvalRequestId` | String? | — | Link back to approval |

#### AdminUser
| Field | Type | Notes |
|-------|------|-------|
| `id` | String (UUID) | PK |
| `username` | String | Unique, default "admin" |
| `passwordHash` | String | bcrypt hash |
| `setupToken` | String? | Unique, one-time |
| `setupTokenExp` | DateTime? | 24h expiry |
| `lastLoginAt` | DateTime? | |

#### ApprovalRule
| Field | Type | Notes |
|-------|------|-------|
| `id` | String (UUID) | PK |
| `name` | String | Unique |
| `description` | String? | |
| `enabled` | Boolean | Default true |
| `matchRiskLevels` | String? | JSON array |
| `matchToolNames` | String? | JSON array (supports `*` wildcard) |
| `matchCapabilities` | String? | JSON array |
| `action` | String | auto_approve/auto_reject/require_manual |
| `priority` | Int | Default 0, higher = evaluated first |

#### McpServer
| Field | Type | Notes |
|-------|------|-------|
| `id` | String (UUID) | PK |
| `name` | String | Unique |
| `description` | String? | |
| `transport` | String | stdio/sse/in-process |
| `command` | String? | For stdio |
| `args` | String? | JSON array for stdio |
| `url` | String? | For sse |
| `env` | String? | JSON object for stdio |
| `enabled` | Boolean | Default true |
| `status` | String | disconnected/connecting/connected/error |
| `lastError` | String? | |
| `toolCount` | Int | Default 0 |
| `connectedAt` | DateTime? | |

**Relations:** has many `McpTool`

#### McpTool
| Field | Type | Notes |
|-------|------|-------|
| `id` | String (UUID) | PK |
| `serverId` | String | FK → McpServer (cascade) |
| `name` | String | Namespaced: `mcp__servername__toolname` |
| `mcpName` | String | Original name from MCP server |
| `description` | String? | |
| `inputSchema` | String? | JSON Schema string |
| `riskLevel` | String | Default "medium" |
| `enabled` | Boolean | Default true |

**Unique:** `[serverId, mcpName]`

---

## 14. API Reference

### 14.1 Health (`src/routes/health.ts`) — No Auth

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check with DB latency, process info |

### 14.2 Auth (`src/routes/auth.ts`) — No Auth

| Method | Path | Description |
|--------|------|-------------|
| GET | `/auth/status` | Check if admin setup is needed (`{ needsSetup: bool }`) |
| POST | `/auth/setup` | One-time password setup (`{ setupToken, password }`) → `{ token }` |
| POST | `/auth/login` | Login (`{ username, password }`) → `{ token }` |
| POST | `/auth/logout` | Invalidate session (requires Bearer token) |

### 14.3 Missions (`src/routes/missions.ts`) — Admin Auth

| Method | Path | Description |
|--------|------|-------------|
| GET | `/missions` | List all missions with events |
| GET | `/missions/:id` | Get mission with events |
| POST | `/missions` | Create mission (`{ goal, budget?, maxToolCalls?, riskLevel? }`) |
| PATCH | `/missions/:id` | Update mission |
| DELETE | `/missions/:id` | Delete mission (cascades events) |
| GET | `/missions/:id/events` | List events for mission |
| POST | `/missions/:id/events` | Record a mission event (`{ type, payload? }`) |

### 14.4 Tools (`src/routes/tools.ts`) — Admin Auth

| Method | Path | Description |
|--------|------|-------------|
| GET | `/tools` | List all tools |
| GET | `/tools/:name` | Get tool by name |
| POST | `/tools` | Register a tool (`{ name, description, inputSchema?, ... }`) |
| PATCH | `/tools/:name` | Update tool |
| DELETE | `/tools/:name` | Remove tool |

### 14.5 Memory (`src/routes/memory.ts`) — Admin Auth

| Method | Path | Description |
|--------|------|-------------|
| GET | `/memory` | List all memories (optional `?scope=` filter) |
| GET | `/memory/search` | Search memories (`?q=`, `?scope=`, `?limit=`, `?min_importance=`, `?tags=`) |
| GET | `/memory/stats` | Memory statistics |
| GET | `/memory/scopes` | List valid scopes |
| GET | `/memory/:id` | Get single memory |
| GET | `/memory/:id/associations` | Get associated memories (`?direction=from|to`) |
| POST | `/memory` | Store new memory |
| PATCH | `/memory/:id` | Update memory |
| POST | `/memory/consolidate` | Merge duplicate memories |
| POST | `/memory/purge-expired` | Delete expired memories |
| POST | `/memory/bulk-delete` | Delete multiple memories (`{ ids: [...] }`) |
| DELETE | `/memory/:id` | Delete memory |

### 14.6 Agent (`src/routes/agent.ts`) — Admin Auth

| Method | Path | Description |
|--------|------|-------------|
| POST | `/agent/run` | Execute mission through agent loop (`{ missionId, provider? }`) |
| GET | `/agent/transitions` | Get valid state transitions map |

### 14.7 Permissions (`src/routes/permissions.ts`) — Admin Auth

| Method | Path | Description |
|--------|------|-------------|
| GET | `/permissions` | List all 17 capabilities with grant status |
| POST | `/permissions/grant` | Grant a capability (`{ capability, allowed?, scope?, scopeContext?, missionId? }`) |
| POST | `/permissions/revoke` | Revoke all grants for a capability (`{ capability }`) |

### 14.8 Voice (`src/routes/voice.ts`) — Admin Auth

| Method | Path | Description |
|--------|------|-------------|
| GET | `/voice/status` | Voice system status, available providers/voices |
| POST | `/voice/stt` | Speech-to-text (base64 audio → transcript) |
| POST | `/voice/tts` | Text-to-speech (text → base64 audio) |
| GET | `/voice/sessions` | List active voice sessions |
| POST | `/voice/sessions` | Create voice session (`{ missionId?, provider?, language?, voice? }`) |
| GET | `/voice/sessions/:id` | Get session details + transcript |
| DELETE | `/voice/sessions/:id` | Delete voice session |
| POST | `/voice/sessions/:id/transcript` | Add browser-relayed transcript entry |
| PUT | `/voice/provider` | Switch active voice provider (`{ provider }`) |

### 14.9 Mobile (`src/routes/mobile.ts`) — Mobile Auth

| Method | Path | Description |
|--------|------|-------------|
| POST | `/mobile/v1/register` | Register client, get API key (no auth) |
| GET | `/mobile/v1/missions` | Paginated mission list |
| GET | `/mobile/v1/missions/:id` | Mission detail |
| POST | `/mobile/v1/missions` | Create mission |
| GET | `/mobile/v1/missions/:id/events` | Paginated events |
| GET | `/mobile/v1/missions/:id/events/stream` | SSE event stream |
| GET | `/mobile/v1/memory` | Paginated memory list |
| GET | `/mobile/v1/memory/search` | Search memories |
| GET | `/mobile/v1/tools` | Tool list (lightweight) |
| POST | `/mobile/v1/agent/run` | Create mission + get stream URL |
| GET | `/mobile/v1/health` | Mobile API health |

### 14.10 Mobile Admin (`src/routes/mobileAdmin.ts`) — Admin Auth

| Method | Path | Description |
|--------|------|-------------|
| GET | `/mobile/admin/clients` | List all clients |
| POST | `/mobile/admin/clients/:id/revoke` | Disable client |
| POST | `/mobile/admin/clients/:id/enable` | Re-enable client |
| POST | `/mobile/admin/clients/:id/regenerate` | Regenerate API key |
| DELETE | `/mobile/admin/clients/:id` | Delete client |

### 14.11 MCP (`src/routes/mcp.ts`) — Admin Auth

| Method | Path | Description |
|--------|------|-------------|
| GET | `/mcp/servers` | List all MCP servers |
| POST | `/mcp/servers` | Register MCP server (`{ name, transport, command?, url?, ... }`) |
| GET | `/mcp/servers/:id` | Get server details |
| PATCH | `/mcp/servers/:id` | Update server config |
| DELETE | `/mcp/servers/:id` | Delete server |
| POST | `/mcp/servers/:id/connect` | Connect to server |
| POST | `/mcp/servers/:id/disconnect` | Disconnect from server |
| GET | `/mcp/servers/:id/tools` | List tools from server |
| GET | `/mcp/tools` | List all MCP tools across servers |
| GET | `/mcp/status` | Overall MCP system status |

### 14.12 Approvals (`src/routes/approval.ts`) — Admin Auth

| Method | Path | Description |
|--------|------|-------------|
| GET | `/approvals` | List approval requests (`?missionId=`, `?status=`, `?riskLevel=`) |
| GET | `/approvals/stats` | Approval statistics |
| GET | `/approvals/pending` | All pending requests |
| POST | `/approvals/expire` | Expire stale pending requests |
| GET | `/approvals/:id` | Get single request |
| POST | `/approvals/:id/approve` | Approve (`{ alwaysAllow?: boolean }`) |
| POST | `/approvals/:id/reject` | Reject (`{ response?: string }`) |
| POST | `/approvals/:id/cancel` | Cancel |
| GET | `/approvals/rules` | List approval rules |
| POST | `/approvals/rules` | Create rule (`{ name, action, matchRiskLevels?, ... }`) |
| GET | `/approvals/rules/:id` | Get single rule |
| PATCH | `/approvals/rules/:id` | Update rule |
| DELETE | `/approvals/rules/:id` | Delete rule |

### 14.13 Capabilities (`src/routes/capabilities.ts`) — Admin Auth

| Method | Path | Description |
|--------|------|-------------|
| GET | `/capabilities/grants` | List all capability grants (`?capability=`, `?allowed=`, `?scopeType=`) |
| GET | `/capabilities/statuses` | Authorization status for all capabilities |
| POST | `/capabilities/grants` | Create grant (`{ capability, allowed, scopeType?, scopeContext?, missionId? }`) |
| GET | `/capabilities/grants/:id` | Get single grant |
| PATCH | `/capabilities/grants/:id` | Update grant |
| DELETE | `/capabilities/grants/:id` | Revoke specific grant |
| DELETE | `/capabilities/grants/:capability/revoke-all` | Revoke ALL grants for a capability |

---

## 15. WebSocket Events

**Server:** Socket.IO 4 on separate port (default `:3002`)

### 15.1 Client → Server (Subscribe)

| Event | Payload | Description |
|-------|---------|-------------|
| `subscribe:mission` | `missionId: string` | Join `mission:{id}` room |
| `unsubscribe:mission` | `missionId: string` | Leave mission room |
| `subscribe:voice` | `sessionId: string` | Join `voice:{id}` room |
| `unsubscribe:voice` | `sessionId: string` | Leave voice room |
| `subscribe:approvals` | — | Join `approvals:all` room |
| `unsubscribe:approvals` | — | Leave approvals room |
| `subscribe:mission:approvals` | `missionId: string` | Join `approvals:mission:{id}` room |
| `unsubscribe:mission:approvals` | `missionId: string` | Leave mission approvals room |

### 15.2 Client → Server (Send)

| Event | Payload | Description |
|-------|---------|-------------|
| `voice:transcript` | `{ sessionId, text, confidence?, direction? }` | Relay browser transcript |
| `voice:status` | `{ sessionId, status }` | Update voice session status |

### 15.3 Server → Client (Emit)

| Event | Room | Description |
|-------|------|-------------|
| `mission:{id}:event` | `mission:{id}` | Mission event (any stage type) |
| `mission:{id}:status` | `mission:{id}` | Mission status change |
| `mission:{id}:update` | `mission:{id}` | Any mission field update |
| `approval:created` | `approvals:all`, `approvals:mission:{id}` | New approval request |
| `approval:resolved` | `approvals:all`, `approvals:mission:{id}` | Approval decision made |
| `voice:transcript` | `voice:{sessionId}` | Transcript relayed to session subscribers |
| `voice:status` | `voice:{sessionId}` | Session status update |

---

## 16. Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3001` | HTTP API port |
| `WS_PORT` | `3002` | WebSocket (Socket.IO) port |
| `DATABASE_URL` | `file:./dev.db` | SQLite database path |
| `GEMINI_API_KEY` | — | Google Gemini API key (required for Gemini provider) |
| `GEMINI_MODEL` | `gemini-2.5-flash` | Gemini model name |
| `GROQ_API_KEY` | — | Groq API key (required for Groq provider) |
| `GROQ_MODEL` | `llama-3.3-70b-versatile` | Groq model name |
| `VOICE_PROVIDER` | `browser` | Active voice provider (`browser`/`gemini`/`groq`) |
| `CORS_ORIGIN` | `http://localhost:3000` | CORS allowed origin for WebSocket |
| `TOOL_EXECUTION_TIMEOUT_MS` | `30000` | Tool execution timeout |
| `TOOL_RETRY_COUNT` | `2` | Tool retry attempts on failure |
| `TOOL_RETRY_BACKOFF_MS` | `1000` | Tool retry backoff (multiplied by attempt) |
| `APPROVAL_TTL_SECONDS` | `300` | Approval request auto-expiry (5 minutes) |

---

## 17. Project File Structure

```
openjarvis-api/
├── index.ts                          # Server entry: Express + Socket.IO, route mounting
├── package.json                      # Dependencies, scripts, engine requirements
├── tsconfig.json                     # TypeScript configuration
├── bun.lock                          # Lock file
├── start.sh                          # Startup script with env defaults
├── README.md                         # Project README
├── prisma/
│   ├── schema.prisma                 # 12 models, SQLite datasource
│   └── migrations/
│       ├── migration_lock.toml
│       ├── 20260817104406_phase6_memory_enhancement/
│       ├── 20260817111051_phase7_mobile_clients/
│       └── 20260817125247_phase8_mcp_plugins/
├── src/
│   ├── middleware/
│   │   ├── adminAuth.ts              # Admin auth: setup token, login, session management
│   │   ├── mobileAuth.ts             # Mobile auth: X-API-Key validation
│   │   ├── errorHandler.ts           # Global error handler
│   │   └── requestLogger.ts          # Request ID generation, logging
│   ├── routes/
│   │   ├── health.ts                 # GET /health
│   │   ├── auth.ts                   # POST /auth/setup, /login, /logout
│   │   ├── missions.ts               # Mission CRUD + events
│   │   ├── tools.ts                  # Tool CRUD
│   │   ├── memory.ts                 # Memory CRUD + search + consolidate
│   │   ├── agent.ts                  # POST /agent/run, GET /transitions
│   │   ├── permissions.ts            # GET /permissions, POST grant/revoke
│   │   ├── voice.ts                  # STT/TTS/sessions
│   │   ├── mobile.ts                 # /mobile/v1/* (API key auth)
│   │   ├── mobileAdmin.ts            # /mobile/admin/* (admin auth)
│   │   ├── mcp.ts                    # MCP server + tool management
│   │   ├── approval.ts              # Approval requests + rules CRUD
│   │   └── capabilities.ts           # Capability grants CRUD
│   ├── services/
│   │   ├── missionService.ts         # Mission CRUD, state transitions
│   │   ├── missionEventService.ts    # Event creation, WebSocket broadcast
│   │   ├── toolService.ts            # Tool CRUD in DB
│   │   ├── memoryService.ts          # Full memory lifecycle
│   │   ├── approvalService.ts        # Approval workflow + rules engine
│   │   ├── approvalGate.ts           # Authorization decision gate
│   │   ├── capabilityRegistry.ts     # 3-state capability authorization
│   │   └── mobileClientService.ts    # Client registration, bcrypt auth
│   ├── agent/
│   │   ├── types.ts                  # Core types, state machine, tool interfaces
│   │   ├── agentLoop.ts             # Main agent execution engine
│   │   ├── modelProvider.ts          # Gemini + Groq adapters, factory
│   │   ├── toolRegistry.ts          # Tool management, validation, execution
│   │   ├── missionStateMachine.ts   # State transition enforcement
│   │   ├── verification.ts          # Tool output verification
│   │   ├── permissions/
│   │   │   ├── types.ts            # 17 capabilities, risk levels
│   │   │   └── permissionManager.ts # Unified: delegates to CapabilityRegistry
│   │   ├── memory/
│   │   │   ├── contextBuilder.ts   # Memory → system prompt injection
│   │   │   └── memoryTools.ts      # Memory-related agent tools
│   │   └── tools/
│   │       ├── webSearchTool.ts     # web_search tool (z-ai-web-dev-sdk)
│   │       └── computer-control/
│   │           ├── index.ts         # Barrel exports
│   │           ├── screenshot.ts    # screenshot tool
│   │           ├── mouse.ts         # mouse_move, mouse_click, mouse_scroll
│   │           ├── keyboard.ts      # key_type, key_press
│   │           ├── filesystem.ts    # filesystem_read, filesystem_write, filesystem_delete
│   │           ├── shell.ts         # shell_execute (hard-blocked)
│   │           ├── app.ts           # app_launch, app_close
│   │           ├── clipboard.ts     # clipboard_read, clipboard_write
│   │           └── window.ts        # window_list, window_focus, window_info
│   ├── voice/
│   │   ├── types.ts                 # VoiceProvider interface, session types
│   │   ├── voiceManager.ts          # Provider registry, session management
│   │   ├── browserRelayProvider.ts  # Browser Web Speech API relay
│   │   ├── geminiVoiceProvider.ts   # Gemini STT/TTS
│   │   └── groqVoiceProvider.ts     # Groq STT/TTS
│   ├── mcp/
│   │   ├── types.ts                 # JSON-RPC, MCP protocol, transport types
│   │   ├── mcpClient.ts            # MCP protocol client (initialize, list, call)
│   │   ├── pluginManager.ts        # Server lifecycle, tool sync
│   │   ├── transports.ts           # Stdio, SSE, InProcess transport implementations
│   │   └── index.ts                 # Barrel exports
│   ├── mobile/
│   │   ├── types.ts                 # PaginatedRequest, PaginatedResponse
│   │   └── pagination.ts           # parsePagination, buildPaginatedResponse
│   └── utils/
│       ├── db.ts                    # Prisma client singleton, connection check
│       ├── logger.ts                # Structured logger with requestId
│       ├── errors.ts                # AppError, badRequest, unauthorized, notFound
│       └── eventBus.ts             # Socket.IO event emission, mission/approval events
└── tests/
    ├── phase1.test.ts               # 23 tests — Mission CRUD, state machine, events
    ├── phase2.test.ts               # 23 tests — Agent loop, model provider, tool registry
    ├── phase4.test.ts               # 17 tests — Computer-control tools
    ├── phase5.test.ts               # 41 tests — Voice providers, sessions, STT/TTS
    ├── phase6.test.ts               # 46 tests — Memory service, search, context builder
    ├── phase7.test.ts               # 22 tests — Mobile clients, API key auth, pagination
    ├── phase8.test.ts               # 36 tests — MCP plugin system, transports
    ├── phase10.test.ts              # 44 tests — Approval workflow, rules engine
    └── phase10-auth-model.test.ts   # 31 tests — Capability registry, permission unification
```

---

## 18. Test Suite

**Total: 283 tests across 9 files**

Run with: `bun test tests/`

| Test File | Tests | Lines | Coverage |
|-----------|-------|-------|----------|
| `phase1.test.ts` | 23 | 244 | Mission CRUD, state machine, events, validation |
| `phase2.test.ts` | 23 | 308 | Agent loop, ModelProvider, ToolRegistry, JSON Schema validation, retries |
| `phase4.test.ts` | 17 | 164 | All 17 computer-control tools, permission gating, risk levels |
| `phase5.test.ts` | 41 | 426 | Voice providers (Browser/Gemini/Groq), sessions, STT/TTS, manager |
| `phase6.test.ts` | 46 | 670 | Memory CRUD, search, scoring, associations, consolidation, context builder |
| `phase7.test.ts` | 22 | 240 | Mobile client registration, bcrypt auth, pagination, SSE streaming |
| `phase8.test.ts` | 36 | 484 | MCP server CRUD, transports, tool sync, plugin manager |
| `phase10.test.ts` | 44 | 627 | Approval requests, rules engine, auto-approve/deny, stats |
| `phase10-auth-model.test.ts` | 31 | 553 | Capability registry 3-state system, permission unification, scoped grants |

---

## 19. Security Fixes Applied

### CRITICAL 1: README.md Created
- Added project README with setup instructions, architecture overview, and API documentation.
- Location: `README.md` at project root.

### CRITICAL 2: .env.example Created
- Documented all required and optional environment variables.
- Ensures new developers know what configuration is needed.

### CRITICAL 3: .env Removed from Git Tracking
- Ensured `.env` file is not tracked by git.
- Prevents accidental credential leakage.

### CRITICAL 4: *.db Files Removed from Git, Added to .gitignore
- All SQLite database files (`*.db`) excluded from version control.
- Prevents database state (which may contain sensitive data like bcrypt hashes and session tokens) from being committed.

### CRITICAL 5: Mobile API Keys Now bcrypt Hashed
- **Before:** API keys stored as plaintext in `apiKey` column.
- **After:** API keys hashed with bcrypt (10 rounds) in `apiKeyHash` column.
- Plaintext key returned **only** at creation time and on explicit regeneration.
- Authentication scans all enabled clients and compares hashes (no plaintext index).

### CRITICAL 6: Admin Auth Middleware on All Core Routes
- **Before:** All routes were publicly accessible.
- **After:** All 11 core route groups protected with `requireAdminAuth()` middleware:
  - `/missions`, `/tools`, `/memory`, `/agent`, `/permissions`, `/voice`, `/mobile/admin`, `/mcp`, `/approvals`, `/capabilities`
- Public routes remain: `/health`, `/auth`, `/mobile/v1` (has its own API key auth).

### CRITICAL 7: Dual Permission System Unified, `filesystem_delete` Unblocked
- **Before:** Old in-memory `PermissionManager` had a hard-block set that permanently denied `filesystem_delete` regardless of capability grants. Two separate permission systems could conflict.
- **After:** `PermissionManager.check()` fully delegates to `capabilityRegistry.check()`. The 3-state system (undefined/allowed/denied) is the single source of truth. `filesystem_delete` now follows the normal approval flow — creates an approval request, admin decides, grant persists if `alwaysAllow` is set.

---

## 20. Phase 13 & 14 Spec Status

### Phase 13 — Not Implemented
**Status:** Specification received but not yet implemented.

**Dependencies:** Requires completion of Phases 1-12 (done).

**Expected scope:** Likely involves advanced agent features, multi-step reasoning, or enhanced tool orchestration.

### Phase 14 — Not Implemented
**Status:** Specification received but not yet implemented.

**Dependencies:** Depends on Phase 13 completion.

**Expected scope:** Likely involves deployment, monitoring, or production hardening.

---

## 21. Known Limitations

### Functional Limitations

1. **No real computer control in headless environments.** All 17 computer-control tools return `ENVIRONMENT_UNAVAILABLE` in sandbox/container environments. Only `filesystem_read`, `filesystem_write`, `filesystem_delete` have real implementations. `window_list` attempts `wmctrl -l` on Linux.

2. **Shell execution is hard-blocked.** The `shell_execute` tool is explicitly blocked even after approval. It returns `requires_approval` error regardless of capability grants. The comment says "refuse until Phase 9" but the approval workflow (Phase 10) is complete — this tool needs to be unblocked.

3. **In-memory session store.** Admin sessions are stored in a `Map` that resets on server restart. All admins will need to re-login after a server restart.

4. **No voice provider has real implementations for Gemini/Groq.** The provider files exist with correct interfaces, but the actual STT/TTS API calls may not be fully functional (they depend on API availability).

5. **Keyword-only memory search.** No vector embeddings or semantic search. Memory recall uses token-based string matching which may miss semantically similar but lexically different content.

6. **No user management.** The system is strictly single-user (one admin). There is no multi-user support, role-based access control, or user accounts.

### Architecture Limitations

7. **No persistence for voice sessions.** Voice sessions are in-memory only and lost on server restart.

8. **No persistence for tool audit logs.** The ToolRegistry's audit log is in-memory only.

9. **No background task runner.** Approval expiry cleanup (`expirePending`) must be triggered manually via `POST /approvals/expire`. There is no cron/scheduler.

10. **No rate limiting.** No request rate limiting on any endpoints.

11. **SSE polling instead of true push.** The mobile SSE event stream uses 1-second polling rather than true push notifications.

12. **No TLS/HTTPS.** The server runs plain HTTP. TLS termination is expected to be handled by a reverse proxy.

13. **SQLite limitations.** No concurrent write support beyond SQLite's built-in WAL mode. Not suitable for multi-instance deployment.

14. **No MCP tool execution in agent loop.** The `POST /agent/run` endpoint currently only registers `web_search`. MCP tools are managed but not automatically injected into the agent's tool registry during execution.

---

*Generated from the OpenJarvis codebase. This document is the single source of truth for what exists in the codebase as of the last build phase (Phase 12).*
