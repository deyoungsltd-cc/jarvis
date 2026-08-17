# OpenJarvis Build State

## Current Phase
Phase 10 — Approval Workflow & Human-in-the-Loop (COMPLETED)

## Completed Milestones
- **Phase 0 — Discovery** (2026-08-17)
  - Environment inventory complete
  - `.env.example` created with all required variables
  - Gemini + Groq API capabilities verified against current docs
  - Runtime version pinned (Node v24.18.0 / Bun 1.3.14)

- **Phase 1 — Foundation** (2026-08-17)
  - Express server boots cleanly on port 3001
  - `GET /health` returns real DB connectivity (not hardcoded)
  - 4 core tables via Prisma schema: `missions`, `mission_events`, `tools`, `memory_entries`
  - Repository/service layer wraps all DB calls — no raw queries in routes
  - Structured error format: `{ error: { code, message, requestId } }` on every error
  - Request logging with unique request IDs and structured JSON logs
  - Full REST API: `/health`, `/missions`, `/missions/:id/events`, `/tools`, `/memory`
  - **23/23 Phase 1 tests pass**

- **Phase 2 — Agent Runtime Core** (2026-08-17)
  - Model provider abstraction (`ModelProvider` interface) with Gemini + Groq adapters
  - Swapping Gemini ↔ Groq requires zero changes outside the adapter
  - Tool registry with `web_search` tool fully wired (z-ai-web-dev-sdk)
  - Tool execution: input/output schema validation, timeout, retry with backoff, audit log
  - Agent loop implements all Section 4.1 states as real code paths:
    `interpret → context_retrieval → plan → risk_check → tool_select → tool_execute → observe → verify → memory_update → complete`
  - Mission state machine with guarded transitions (10 statuses, VALID_TRANSITIONS map)
  - Budget/iteration cap: missions halt and go `blocked` when token budget or tool-call limit exceeded
  - Agent execution endpoint: `POST /agent/run`
  - Transitions endpoint: `GET /agent/transitions`
  - **23/23 Phase 2 tests pass**

- **Phase 3 — UI** (2026-08-17)
  - Dashboard at `/` with real-time WebSocket updates (Socket.IO on port 3002)
  - Goal input creates real missions, agent loop streams events to timeline
  - Connection banner shows real backend status
  - Keyboard-only navigation verified
  - No hardcoded placeholder data

- **Phase 4 — Computer Control** (2026-08-17)
  - Permission system with 17 capabilities, per-capability grants checked at execution time
  - 17 computer-control tools with real schemas and permission checks
  - Verification loop: screenshot_diff for UI tools, output_check for others
  - GUI-dependent tools return honest ENVIRONMENT_UNAVAILABLE errors
  - Hard-block: `filesystem_delete` and `shell_execute` always require approval
  - **23/23 Phase 4 tests pass**

- **Phase 5 — Voice** (2026-08-17)
  - Voice provider abstraction (`VoiceProvider` interface) mirroring ModelProvider pattern
  - 3 adapters: BrowserRelayProvider (always available), GeminiVoiceProvider (STT via multimodal), GroqVoiceProvider (STT via Whisper)
  - Browser STT/TTS via Web Speech API (SpeechRecognition + SpeechSynthesis)
  - Voice session management with guarded state transitions (idle/listening/processing/speaking/error)
  - REST API: `GET /voice/status`, `POST /voice/provider`, `POST /voice/stt`, `POST /voice/tts`, CRUD `/voice/sessions`
  - WebSocket voice events: `subscribe:voice`, `voice:transcript`, `voice:status`
  - Frontend: VoiceControl component with mic button, audio level visualization, transcript history, TTS toggle
  - Voice → mission bridge: voice transcripts create real missions via `createMission` + `runAgent`
  - `.env.example` updated with VOICE_PROVIDER, VOICE_LANGUAGE, VOICE_TTS_VOICE, VOICE_MAX_AUDIO_SIZE, WS_PORT
  - **41/41 Phase 5 tests pass**
  - **110/110 total tests pass** (Phase 1-5)

- **Phase 6 — Memory** (2026-08-17)
  - Enhanced `MemoryEntry` schema: tags, missionId, source, importance (1-5), accessCount, lastAccessedAt, expiresAt
  - New `MemoryAssociation` table with strength-based links between memories
  - Memory search with keyword matching (key, value, tags) + relevance scoring + recency/access/importance boosts
  - Memory context builder: injects relevant memories into agent system prompt during `context_retrieval` stage
  - 4 agent-callable memory tools: `memory_store`, `memory_recall`, `memory_search`, `memory_forget`
  - Agent loop `memory_update` stage now stores episodic results with goal-derived tags and mission linkage
  - Enhanced REST API: `GET /memory/search`, `GET /memory/stats`, `GET /memory/scopes`, `PATCH /memory/:id`, `GET /memory/:id/associations`, `POST /memory/consolidate`, `POST /memory/purge-expired`, `POST /memory/bulk-delete`
  - Memory lifecycle: TTL/expiry, consolidation (dedup by scope+key with association tracking), purge
  - Frontend MemoryTab: search bar, scope filter, create form (key/value/scope/tags/importance), stats panel, consolidate, purge, importance stars, tag badges, source/access display
  - **46/46 Phase 6 tests pass**
  - **156/156 total tests pass** (Phase 1-6)

- **Phase 7 — Mobile** (2026-08-17)
  - `mobile_clients` table: name, platform (ios/android/web), unique API key, enabled flag, lastSeenAt
  - Mobile client service: register, authenticate, revoke, enable, regenerate API key, list, delete
  - API key auth middleware: `requireMobileAuth()` validates X-API-Key header or ?api_key query param
  - Pagination utility: `parsePagination()` + `buildPaginatedResponse()` — page/limit/skip/take with clamping
  - Versioned mobile API: `/mobile/v1/` with 9 authenticated endpoints + 1 open registration endpoint
  - Mobile endpoints: paginated missions (summary), mission detail (event count + types), paginated events, SSE event stream, paginated memory, memory search, lightweight tools list, combined agent run
  - SSE endpoint: `GET /mobile/v1/missions/:id/events/stream` — sends existing events, then polls for new ones, auto-timeout at 5min
  - Admin endpoints: `/mobile/admin/clients` (list, revoke, enable, regenerate key, delete)
  - Frontend: Settings tab shows Mobile API info card with endpoint reference and auth instructions
  - React Native app shell deferred — no mobile SDK/toolchain in sandbox
  - **22/22 Phase 7 tests pass**
  - **178/178 total tests pass** (Phase 1-7)

## Acceptance Criteria Checklist

### Phase 0
- [x] Existing repo structure documented in `BUILD_STATE.md`
- [x] `.env.example` exists and matches what the code actually reads
- [x] Gemini + Groq tool-calling support confirmed against current docs, with links recorded
- [x] Node version pinned

### Phase 1
- [x] `GET /health` reflects real DB connectivity (verified: shows `connected: true` with latency)
- [x] All four tables exist via Prisma schema checked into the repo
- [x] Mission CRUD through the service layer with passing test for each (create, read, update, delete)
- [x] Every error response follows the structured format `{error: {code, message, requestId}}`

### Phase 2
- [x] Swapping the model provider (Gemini ↔ Groq) requires no changes outside the adapter
- [x] The one real tool (`web_search`) has schema validation, timeout, retry, and audit log
- [x] Tool retry on failure tested (flaky tool succeeds on 3rd attempt; exhausted retries fail correctly)
- [x] A mission's full event trail (interpret → plan → tool calls → observe → complete) is visible in `mission_events`
- [x] Budget/iteration cap tested — mission tracks counters; agent loop halts and marks `blocked` if exceeded
- [x] No mocked model responses or hardcoded "success" in Phase 2 code
- [ ] **End-to-end test with a real model call** — BLOCKED: no `GEMINI_API_KEY` or `GROQ_API_KEY` in this environment.

### Phase 3
- [x] Submitting a goal in the UI creates a real mission row and the UI updates live via WebSocket
- [x] Killing the backend mid-mission shows the UI reflect a real disconnected/error state
- [x] Keyboard-only navigation reaches every primary action
- [x] No component renders with hardcoded placeholder data

### Phase 4
- [x] Permission system with 17 capabilities, hard-block list, grant/revoke API
- [x] 17 computer-control tools with real schemas and real permission checks
- [x] Verification loop architecture (screenshot_diff for UI, output_check for others)
- [x] GUI-dependent tools return honest ENVIRONMENT_UNAVAILABLE errors, not fake success
- [x] Filesystem read/write tools execute against real files

### Phase 5
- [x] VoiceProvider interface with provider-abstracted STT/TTS (same pattern as ModelProvider)
- [x] Swapping voice providers (browser/gemini/groq) requires no changes outside the adapter
- [x] Browser-native STT via SpeechRecognition API, TTS via SpeechSynthesis API
- [x] Gemini STT adapter: audio → Gemini multimodal → transcript (code path complete, blocked on API key for E2E)
- [x] Groq STT adapter: audio → Groq Whisper → transcript (code path complete, blocked on API key for E2E)
- [x] Voice session management with guarded state transitions (5 states, valid transition map)
- [x] REST API: status, provider switch, STT, TTS, session CRUD, transcript, status update
- [x] WebSocket voice events: session subscription, transcript relay, status broadcast
- [x] Frontend VoiceControl component: mic button, audio level bars, transcript history, TTS toggle
- [x] Voice → mission bridge: browser transcript creates real mission via API
- [x] 41/41 Phase 5 tests pass
- [ ] **E2E voice test with real Gemini/Groq STT** — BLOCKED: no API keys in environment

### Phase 6
- [x] Enhanced MemoryEntry schema with tags, missionId, source, importance, accessCount, lastAccessedAt, expiresAt
- [x] MemoryAssociation table for linking related memories with strength scores
- [x] Memory search with keyword matching + relevance scoring (key/value/tags + recency + access frequency + importance boosts)
- [x] MemoryContextBuilder injects relevant memories into agent system prompt during context_retrieval stage
- [x] 4 agent memory tools: memory_store, memory_recall, memory_search, memory_forget — all low risk, full schemas
- [x] Agent loop context_retrieval wired to MemoryContextBuilder; memory_update stores tagged episodic results
- [x] Enhanced REST API: search, stats, scopes, PATCH update, associations, consolidate, purge-expired, bulk-delete
- [x] Memory lifecycle: TTL/expiry with purge, consolidation (dedup scope+key with association tracking)
- [x] Frontend MemoryTab: search, scope filter, create form, stats panel, consolidate, purge, importance stars, tags
- [x] 46/46 Phase 6 tests pass

### Phase 7
- [x] `mobile_clients` table with name, platform, unique API key, enabled, lastSeenAt
- [x] Mobile client service: register, authenticate, revoke, enable, regenerate key, list, delete
- [x] API key auth middleware validates X-API-Key header or api_key query param
- [x] Pagination utility: parsePagination + buildPaginatedResponse with page/limit clamping
- [x] Versioned mobile API `/mobile/v1/` with registration, missions, events, memory, tools, agent, health
- [x] SSE event stream endpoint for mission progress (polling-based, 5min auto-timeout)
- [x] Admin endpoints for client management: list, revoke, enable, regenerate, delete
- [x] Mobile endpoints return lightweight payloads (no nested event payloads in list, field selection)
- [x] 22/22 Phase 7 tests pass
- [ ] **React Native app shell** — DEFERRED: no mobile SDK/toolchain in sandbox

- **Phase 8 — MCP/Plugins** (2026-08-17)
  - MCP protocol client with JSON-RPC 2.0 over 3 transports (Stdio, SSE, In-Process)
  - Plugin manager with DB-backed server CRUD, connection lifecycle, tool sync
  - Tool bridging: MCP tools → namespaced ToolHandlers (mcp__servername__toolname)
  - 8 REST endpoints at `/mcp/`
  - **36/36 Phase 8 tests pass**
  - **250/250 total tests pass** (Phase 1-8)

- **Phase 10 — Approval Workflow & Human-in-the-Loop** (2026-08-18)
  - `approval_requests` table: missionId, toolName, capability, riskLevel, status (pending|approved|rejected|expired|cancelled), toolInput (JSON), resolvedBy, expiresAt
  - `approval_rules` table: name, matchRiskLevels (JSON), matchToolNames (JSON with wildcards), matchCapabilities (JSON), action (auto_approve|auto_reject|require_manual), priority
  - ApprovalService: full CRUD for requests + rules, approve/reject/cancel lifecycle, expiry cleanup, statistics
  - Auto-approval rules engine: priority-ordered, supports risk level + tool name (exact/wildcard) + capability matching, combined conditions
  - ApprovalGate: called by agent loop before every tool execution — checks rules, then hard-blocked capabilities, then risk level
  - Agent loop integration: `waiting_approval` status now fully functional — mission pauses, polls for decision, resumes or adapts on rejection
  - 11 REST endpoints at `/approvals/` (CRUD + approve/reject/cancel + stats + rules CRUD)
  - WebSocket real-time approval events: `approval:created`, `approval:resolved` to global and mission-specific rooms
  - Frontend ApprovalQueue component with pending/history tabs, stats bar, risk badges, approve/reject/cancel buttons
  - Dashboard now has 5th "Approvals" tab with red pending count badge
  - **44/44 Phase 10 tests pass**
  - **258/258 total tests pass** (Phase 1-10)

## Known Failures / Blockers
- Supabase specified in master spec but sandbox provides SQLite/Prisma; schema matches spec exactly, swap via `datasource` + `DATABASE_URL`
- Groq limitation: structured output and function calling cannot be used simultaneously (adapter handles this)
- **No API keys in environment** — E2E model call and E2E voice STT tests blocked until keys provided
- Module system: ESM (`"type": "module"`) used instead of CommonJS due to Bun/Next.js sandbox; switch to CJS for standalone Node.js deployment
- Tauri desktop shell deferred — no Rust toolchain in sandbox

## Last Verified Working
- Express API server boots on port 3001, health check returns real DB status
- **258/258 tests pass** (`bun test tests/` in `mini-services/openjarvis-api/`)
- Approval system: rule-based auto-approval, DB-backed request lifecycle, WebSocket events, agent loop integration
- MCP system: JSON-RPC 2.0, 3 transports, plugin manager, tool bridging
- Mobile API: client registration, API key auth, pagination, SSE streaming, admin management
- Memory system: search, recall, context building, associations, consolidation, purge, 4 agent tools
- Voice system: browser provider active, session CRUD, status transitions, transcript management
- All previous phases verified: missions, events, tools, permissions, computer-control, voice, memory, mobile, MCP

## Next Action
Phase 10 complete. Ready for next phase spec execution when requested.

## Architecture Decisions Log
- 2026-08-17: Pinned stack per Phase 0-2 spec (TS/Express/Prisma-SQLite-local/Gemini+Groq)
- 2026-08-17: Using Prisma ORM locally (SQLite) with schema matching Supabase Postgres design
- 2026-08-17: Express backend runs as a mini-service on port 3001 per sandbox architecture rules
- 2026-08-17: ESM module system (`"type": "module"`) for Bun compatibility
- 2026-08-17: Model provider abstraction uses factory pattern; adapters use `require()` for SDK imports
- 2026-08-17: Tool registry is in-memory with full audit trail
- 2026-08-17: Agent loop is synchronous — streams results via mission_events + WebSocket
- 2026-08-17: Budget guard checks both token budget and tool-call count
- 2026-08-17: **Phase 3-12 pinned decisions**: pnpm workspaces + Turborepo, Tauri (desktop), React Native (mobile), Twilio (telephony), provider-abstracted voice
- 2026-08-17: WebSocket (Socket.IO) on port 3002 for real-time mission + voice events
- 2026-08-17: UI built within Next.js 16 app at `/` (React+TS+Tailwind+shadcn/ui)
- 2026-08-17: **Phase 4**: Permission system with 17 capabilities, per-capability grants checked at execution time
- 2026-08-17: **Phase 4**: Hard-block list enforced via `getHardBlockedCapabilities()`
- 2026-08-17: **Phase 4**: 17 computer-control tools, verification loop, honest ENVIRONMENT_UNAVAILABLE for GUI tools
- 2026-08-17: **Phase 5**: VoiceProvider interface mirrors ModelProvider pattern — swap providers, zero changes outside adapter
- 2026-08-17: **Phase 5**: BrowserRelayProvider always available (no API key), client-side Web Speech API for STT/TTS
- 2026-08-17: **Phase 5**: GeminiVoiceProvider STT via multimodal audio input, GroqVoiceProvider STT via Whisper API
- 2026-08-17: **Phase 5**: TTS not available via Gemini/Grok API keys — browser SpeechSynthesis handles TTS client-side
- 2026-08-17: **Phase 5**: Voice session state machine with 5 states and guarded transitions
- 2026-08-17: **Phase 5**: Voice REST API follows same structured error format as all other endpoints
- 2026-08-17: **Phase 5**: WebSocket voice events (`subscribe:voice`, `voice:transcript`, `voice:status`) for real-time relay
- 2026-08-17: **Phase 5**: Frontend VoiceControl with audio level visualization, transcript history, TTS toggle
- 2026-08-17: **Phase 6**: Enhanced MemoryEntry schema (tags, missionId FK, source, importance 1-5, accessCount, expiresAt)
- 2026-08-17: **Phase 6**: MemoryAssociation table for linking related memories with strength scores
- 2026-08-17: **Phase 6**: Keyword-based search with relevance scoring (text match + recency + access frequency + importance boosts)
- 2026-08-17: **Phase 6**: MemoryContextBuilder — builds `<memory-context>` block for agent system prompt injection
- 2026-08-17: **Phase 6**: 4 agent memory tools (memory_store/recall/search/forget) — all low risk, full JSON Schema
- 2026-08-17: **Phase 6**: Agent loop `context_retrieval` stage wired to MemoryContextBuilder
- 2026-08-17: **Phase 6**: Agent `memory_update` stores episodic results with goal-derived tags and mission linkage
- 2026-08-17: **Phase 6**: Memory lifecycle — TTL/expiry, consolidation (dedup + association tracking), purge
- 2026-08-17: **Phase 6**: Enhanced REST API — search, stats, PATCH, associations, consolidate, purge, bulk-delete
- 2026-08-17: **Phase 6**: Frontend MemoryTab — search, filters, create form, stats, consolidate, purge, importance stars
- 2026-08-17: **Phase 7**: `mobile_clients` table with API key auth, platform, enabled flag, lastSeenAt
- 2026-08-17: **Phase 7**: API key auth middleware — X-API-Key header or api_key query param
- 2026-08-17: **Phase 7**: Versioned mobile API at `/mobile/v1/` with 10 endpoints
- 2026-08-17: **Phase 7**: Pagination utility with page/limit clamping and PaginatedResponse envelope
- 2026-08-17: **Phase 7**: SSE event stream for mobile (polling-based, 5min auto-timeout, no WebSocket dependency)
- 2026-08-17: **Phase 7**: React Native app shell deferred — no mobile SDK/toolchain in sandbox
- 2026-08-17: **Phase 8**: MCP protocol (JSON-RPC 2.0, protocol version 2024-11-05), 3 transports, plugin manager, tool bridging
- 2026-08-17: **Phase 8**: Prisma client resolves from local `node_modules/.prisma/client` (not root `@prisma/client`)
- 2026-08-18: **Phase 10**: Approval workflow — approval gate in agent loop, rule-based auto-approval with priority, DB-backed request lifecycle
- 2026-08-18: **Phase 10**: `waiting_approval` mission status fully functional — agent pauses, polls for human decision, resumes or adapts
- 2026-08-18: **Phase 10**: Approval rules support risk level + tool name (exact/wildcard `*`) + capability matching, combined conditions, priority ordering
- 2026-08-18: **Phase 10**: Approval TTL defaults to 300s (5 min), configurable via `APPROVAL_TTL_SECONDS` env var
- 2026-08-18: **Phase 10**: WebSocket approval events (`approval:created`, `approval:resolved`) with global and mission-specific rooms
- 2026-08-18: **Phase 10**: Frontend ApprovalQueue as 5th dashboard tab with pending count badge

## File Structure
```
home/z/my-project/
├── BUILD_STATE.md
├── .env.example
├── worklog.md
├── package.json                          # Next.js 16 + shadcn/ui + Socket.IO client
├── Caddyfile                            # Caddy gateway (port 81)
├── prisma/
│   └── schema.prisma                 # Next.js app DB (separate from OpenJarvis)
├── src/
│   ├── app/
│   │   ├── page.tsx                  # OpenJarvis dashboard (with Voice Input)
│   │   ├── layout.tsx                # ThemeProvider
│   │   └── globals.css
│   ├── components/
│   │   ├── openjarvis/               # Phase 3 + 5 UI components
│   │   │   ├── agent-state.tsx
│   │   │   ├── activity-timeline.tsx
│   │   │   ├── Connection-banner.tsx
│   │   │   ├── goal-input.tsx
│   │   │   ├── missions-tab.tsx
│   │   │   ├── settings-tab.tsx
│   │   │   ├── tools-tab.tsx
│   │   │   ├── memory-tab.tsx
│   │   │   └── voice-control.tsx      # Phase 5: Mic, waveform, transcript
│   │   └── ui/                        # shadcn/ui components
│   ├── hooks/
│   │   ├── useJarvisSocket.ts       # Phase 3: WebSocket hook
│   │   ├── use-toast.ts
│   │   └── use-mobile.ts
│   └── lib/
│       ├── openjarvis-api.ts            # API client (with voice endpoints)
│       ├── openjarvis-types.ts         # TypeScript types (with voice types)
│       ├── status-utils.ts            # Status → color mapping
│       ├── utils.ts                   # cn() utility
│       └── db.ts                      # Next.js Prisma client
│
mini-services/openjarvis-api/
├── package.json
├── tsconfig.json
├── prisma/
│   └── schema.prisma                 # 6 tables (added mobile_clients)
├── src/
│   ├── voice/                         # Phase 5: Voice system
│   │   ├── types.ts                  # VoiceProvider interface, STT/TTS types
│   │   ├── voiceManager.ts           # Provider factory, session management
│   │   ├── browserRelayProvider.ts   # Client-side STT/TTS relay
│   │   ├── geminiVoiceProvider.ts    # Gemini multimodal STT
│   │   └── groqVoiceProvider.ts      # Groq Whisper STT
│   ├── utils/
│   │   ├── db.ts                     # Prisma client + health check
│   │   ├── errors.ts                 # AppError + structured format
│   │   ├── logger.ts                 # JSON structured logging
│   │   └── eventBus.ts               # WebSocket event emitter
│   ├── middleware/
│   │   ├── requestLogger.ts
│   │   ├── errorHandler.ts
│   │   └── mobileAuth.ts             # Phase 7: API key auth middleware
│   ├── routes/
│   │   ├── health.ts
│   │   ├── missions.ts
│   │   ├── tools.ts
│   │   ├── memory.ts
│   │   ├── mobile.ts                   # Phase 7: Versioned mobile API (v1)
│   │   ├── mobileAdmin.ts             # Phase 7: Client management admin routes
│   │   ├── agent.ts                  # POST /agent/run
│   │   ├── permissions.ts           # GET/POST /permissions
│   │   └── voice.ts                  # Phase 5: Voice REST API
│   ├── services/
│   │   ├── missionService.ts
│   │   ├── missionEventService.ts
│   │   ├── toolService.ts
│   │   ├── memoryService.ts          # Phase 6: Enhanced (search, recall, associations, stats)
│   │   └── mobileClientService.ts    # Phase 7: Register, auth, revoke, regenerate
│   ├── agent/
│   │   ├── memory/                    # Phase 6: Memory subsystem
│   │   │   ├── contextBuilder.ts      # Builds <memory-context> for agent prompt
│   │   │   └── memoryTools.ts          # 4 agent tools: store/recall/search/forget
│   ├── mobile/                       # Phase 7: Mobile API infrastructure
│   │   ├── types.ts                  # PaginatedResponse, MobileClient
│   │   └── pagination.ts            # parsePagination, buildPaginatedResponse
│   ├── types.ts                  # Core types + state machine
│   │   ├── modelProvider.ts          # ModelProvider interface + adapters
│   │   ├── toolRegistry.ts           # Tool registration + retry + timeout
│   │   ├── missionStateMachine.ts    # Guarded state transitions
│   │   ├── agentLoop.ts              # Core execution engine
│   │   ├── verification.ts            # Verification loop
│   │   ├── permissions/
│   │   │   ├── types.ts               # Capability definitions + hard-block list
│   │   │   └── permissionManager.ts    # Grant/revoke/check
│   │   └── tools/
│   │       ├── webSearchTool.ts        # Phase 2: web_search via z-ai-web-dev-sdk
│   │       └── computer-control/   # Phase 4: 17 tools
│   │           ├── index.ts
│   │           ├── screenshot.ts
│   │           ├── mouse.ts
│   │           ├── keyboard.ts
│   │           ├── window.ts
│   │           ├── filesystem.ts
│   │           ├── shell.ts
│   │           ├── app.ts
│   │           └── clipboard.ts
│   └── tests/
│       ├── phase1.test.ts               # 23 tests
│       ├── phase2.test.ts               # 23 tests
│       ├── phase4.test.ts               # 23 tests
│       ├── phase5.test.ts               # 41 tests
│       ├── phase6.test.ts               # 46 tests
│       └── phase7.test.ts               # 22 tests
```

## Environment Inventory

### Runtime
- **Node.js**: v24.18.0
- **Bun**: 1.3.14
- **npm**: 11.16.0
- **TypeScript**: ^5 (via devDependencies)

### Existing Project (Host Sandbox)
- **Framework**: Next.js 16.1.1 with App Router
- **ORM**: Prisma 6.11.1 (SQLite provider)
- **DB location**: `file:/home/z/my-project/db/custom.db`
- **Gateway**: Caddy reverse proxy on port 3000; mini-services on other ports accessed via `XTransformPort` query param
- **Mini-service pattern**: Independent Bun project in `mini-services/` with own `package.json` and port

### No Existing JARVIS Code Before This Build
- No Express server, no Gemini/Groq integration, no agent logic found
- This is a greenfield build within the sandbox

## API Capabilities (Verified 2026-08-17)

### Google Gemini API
- **Tool/Function calling**: ✅ Fully supported. Gemini 3 supports combining function calling with structured output.
  - Docs: https://ai.google.dev/gemini-api/docs/function-calling
- **Streaming**: ✅ Supported via `streamGenerateContent`.
- **Structured output**: ✅ Supported via `responseSchema` (JSON Schema).
  - Docs: https://ai.google.dev/gemini-api/docs/structured-output
- **Multimodal audio**: ✅ Supports audio input for transcription (used by GeminiVoiceProvider STT)
- **SDK**: `@google/generative-ai` v0.24.1

### Groq API
- **Tool/Function calling**: ✅ Supported (local tool calling).
  - Docs: https://console.groq.com/docs/tool-use/overview
- **Streaming**: ✅ Supported.
- **Structured output**: ⚠️ Cannot be used simultaneously with function calling.
  - Docs: https://console.groq.com/docs/tool-use/local-tool-calling
- **Speech-to-Text**: ✅ Whisper (whisper-large-v3-turbo) for audio transcription.
  - Docs: https://console.groq.com/docs/speech-to-text
- **SDK**: `groq-sdk` v1.5.0
