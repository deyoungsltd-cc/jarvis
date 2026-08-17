# OpenJarvis Build State

## Current Phase
Phase 4 — Computer Control (COMPLETED)

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
  - **23/23 Phase 2 tests pass** (state machine, tool registry with retry/timeout/audit, event trail, budget guard)
  - **46/46 total tests pass**

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
- [ ] **End-to-end test with a real model call** — BLOCKED: no `GEMINI_API_KEY` or `GROQ_API_KEY` in this environment. The code path is complete and tested up to the model adapter boundary. Supply keys via `.env` and run `POST /agent/run` with a real mission to close this criterion.

## Known Failures / Blockers
- Supabase specified in master spec but sandbox provides SQLite/Prisma; schema matches spec exactly, swap via `datasource` + `DATABASE_URL`
- Groq limitation: structured output and function calling cannot be used simultaneously (adapter handles this)
- **No API keys in environment** — end-to-end model call test blocked until `GEMINI_API_KEY` or `GROQ_API_KEY` is provided in `.env`
- Module system: ESM (`"type": "module"`) used instead of CommonJS due to Bun/Next.js sandbox; switch to CJS for standalone Node.js deployment

## Last Verified Working
- Express API server boots on port 3001, health check returns real DB status
- **69/69 tests pass** (`bun test tests/` in `mini-services/openjarvis-api/`)
- All CRUD operations verified via curl: missions, events, tools, memory
- Structured error format confirmed on 404, validation, and conflict errors
- State machine rejects invalid transitions (e.g., `completed → running`)
- Tool registry: retry, timeout, audit log, input validation all verified
- Dashboard renders with live data: "Connected" status, real missions list, real empty states
- Permission system: hard-block returns `requires_approval`, grant/revoke works at execution time
- Filesystem read/write tools execute against real files
- Verification loop: screenshot_diff for UI tools, output_check for others

## Next Action
Phase 4 complete. Ready for Phase 5 (Voice) spec execution when requested. Note: Tauri desktop shell deferred — no Rust toolchain in sandbox. GUI-dependent tools (screenshot, mouse, keyboard) return honest ENVIRONMENT_UNAVAILABLE errors, not fake success.

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
- 2026-08-17: WebSocket (Socket.IO) on port 3002 for real-time mission events
- 2026-08-17: UI built within Next.js 16 app at `/` (React+TS+Tailwind+shadcn/ui)
- 2026-08-17: Avatar deferred — simple state-driven icon/color per mission status
- 2026-08-17: **Phase 4**: Permission system with 17 capabilities, per-capability grants checked at execution time
- 2026-08-17: **Phase 4**: Hard-block list enforced via `getHardBlockedCapabilities()` (returns fresh Set to avoid Bun ESM singleton issues)
- 2026-08-17: **Phase 4**: 17 computer-control tools with real schemas, real permission checks
- 2026-08-17: **Phase 4**: Verification loop architecture — screenshot_diff for UI tools, output_check for others
- 2026-08-17: **Phase 4**: GUI-dependent tools (screenshot, mouse, keyboard) return honest ENVIRONMENT_UNAVAILABLE, not fake success
- 2026-08-17: **Phase 4**: `filesystem_delete` and `shell_execute` return `requires_approval` even if permission granted — double protection
- 2026-08-17: **Phase 4**: Permission API (`/permissions/grant`, `/permissions/revoke`, `GET /permissions`) wired into Express
- 2026-08-17: **Phase 4**: Permissions API client added to frontend `openjarvis-api.ts`

## Next Action
Phase 3 complete. Ready for Phase 4 (Computer Control) spec execution when requested.

## Phase 3 Acceptance Criteria
- [x] Submitting a goal in the UI creates a real mission row and the UI updates live via WebSocket as the agent loop progresses (verified: goal input → POST /missions → POST /agent/run → WebSocket events stream to timeline)
- [x] Killing the backend mid-mission shows the UI reflect a real disconnected/error state (verified: "Backend unavailable" banner with actual error, not a frozen spinner)
- [x] Keyboard-only navigation reaches every primary action (verified: Tab through goal input, submit, tab navigation, Settings)
- [x] No component renders with hardcoded placeholder data (verified: "No missions yet" and "No active mission" are real empty states from live API calls)

## Architecture Decisions Log
- 2026-08-17: Pinned stack per Phase 0-2 spec (TS/Express/Prisma-SQLite-local/Gemini+Groq)
- 2026-08-17: Using Prisma ORM locally (SQLite) with schema matching Supabase Postgres design; migration to Supabase requires only `datasource` + `DATABASE_URL` change
- 2026-08-17: Express backend runs as a mini-service on port 3001 per sandbox architecture rules
- 2026-08-17: ESM module system (`"type": "module"`) for Bun compatibility; CJS for standalone deployment
- 2026-08-17: Model provider abstraction uses a factory pattern (`createModelProvider('gemini'|'groq')`); adapters use `require()` for SDK imports to handle missing packages gracefully
- 2026-08-17: Tool registry is in-memory with full audit trail; tool definitions are passed to model providers in their native format
- 2026-08-17: Agent loop is synchronous (no WebSocket streaming yet) — streams results via mission_events; real-time updates deferred to Phase 2 WebSocket decision
- 2026-08-17: Budget guard checks both token budget and tool-call count before each model call and tool execution
- 2026-08-17: **Phase 3-12 pinned decisions**: pnpm workspaces + Turborepo (monorepo), Tauri (desktop), React Native (mobile), Twilio (telephony), provider-abstracted voice STT/TTS
- 2026-08-17: WebSocket (Socket.IO) chosen for real-time mission_events; Phase 2's "WebSocket decision deferred" is now resolved as Socket.IO on port 3002
- 2026-08-17: UI built within the existing Next.js 16 app at `/` (React+TS+Tailwind already present); no separate Vite app needed in this sandbox
- 2026-08-17: Avatar deferred per spec — simple state-driven icon/color per mission status used instead

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
│   │   ├── page.tsx                  # OpenJarvis dashboard
│   │   ├── layout.tsx                # ThemeProvider
│   │   └── globals.css
│   ├── components/
│   │   ├── openjarvis/               # Phase 3 UI components
│   │   │   ├── agent-state.tsx
│   │   │   ├── activity-timeline.tsx
│   │   │   ├── Connection-banner.tsx
│   │   │   ├── goal-input.tsx
│   │   │   ├── missions-tab.tsx
│   │   │   ├── settings-tab.tsx
│   │   │   ├── tools-tab.tsx
│   │   │   └── memory-tab.tsx
│   │   └── ui/                        # shadcn/ui components
│   ├── hooks/
│   │   ├── useJarvisSocket.ts       # Phase 3: WebSocket hook
│   │   ├── use-toast.ts
│   │   └── use-mobile.ts
│   └── lib/
│       ├── openjarvis-api.ts            # API client
│       ├── openjarvis-types.ts         # TypeScript types
│       ├── status-utils.ts            # Status → color mapping
│       ├── utils.ts                   # cn() utility
│       └── db.ts                      # Next.js Prisma client
│
mini-services/openjarvis-api/
├── package.json
├── tsconfig.json
├── prisma/
│   └── schema.prisma                 # 4 core tables
├── src/
│   ├── utils/
│   │   ├── db.ts                     # Prisma client + health check
│   │   ├── errors.ts                 # AppError + structured format
│   │   ├── logger.ts                 # JSON structured logging
│   │   └── eventBus.ts               # WebSocket event emitter
│   ├── middleware/
│   │   ├── requestLogger.ts
│   │   └── errorHandler.ts
│   ├── routes/
│   │   ├── health.ts
│   │   ├── missions.ts
│   │   ├── tools.ts
│   │   ├── memory.ts
│   │   ├── agent.ts                  # POST /agent/run
│   │   └── permissions.ts           # GET/POST /permissions
│   ├── services/
│   │   ├── missionService.ts
│   │   ├── missionEventService.ts
│   │   ├── toolService.ts
│   │   └── memoryService.ts
│   ├── agent/
│   │   ├── types.ts                  # Core types + state machine
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
│       └── phase4.test.ts               # 23 tests
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
- **SDK**: `@google/generative-ai` v0.24.1

### Groq API
- **Tool/Function calling**: ✅ Supported (local tool calling).
  - Docs: https://console.groq.com/docs/tool-use/overview
- **Streaming**: ✅ Supported.
- **Structured output**: ⚠️ Cannot be used simultaneously with function calling.
  - Docs: https://console.groq.com/docs/tool-use/local-tool-calling
- **SDK**: `groq-sdk` v1.5.0
