---
Task ID: 5
Agent: main
Task: OpenJarvis Phase 5 — Voice System

Work Log:
- Created voice provider abstraction: `VoiceProvider` interface with `transcribe()`, `synthesize()`, `getVoices()`
- Implemented `BrowserRelayProvider`: always available, no API key, client-side STT/TTS acknowledgment
- Implemented `GeminiVoiceProvider`: STT via Gemini multimodal audio input, audio MIME type detection (WAV/MP3/OGG/WebM)
- Implemented `GroqVoiceProvider`: STT via Groq Whisper API (`whisper-large-v3-turbo`), language code conversion
- Both server-side adapters honestly return `TTS_NOT_SUPPORTED` — browser handles TTS via SpeechSynthesis
- Created `voiceManager.ts`: provider factory, session CRUD, status transitions, transcript management
- Voice session state machine: 5 states (idle/listening/processing/speaking/error) with guarded transitions
- Added voice REST routes: `GET /voice/status`, `POST /voice/provider`, `POST /voice/stt`, `POST /voice/tts`, CRUD `/voice/sessions`, transcript, status updates
- Added WebSocket voice events: `subscribe:voice`, `voice:transcript`, `voice:status` for real-time relay
- Updated `.env.example` with voice variables: VOICE_PROVIDER, VOICE_LANGUAGE, VOICE_TTS_VOICE, VOICE_MAX_AUDIO_SIZE, WS_PORT
- Created frontend `VoiceControl` component: mic button with pulse animation, 20-bar audio level visualization, real-time interim transcript, TTS toggle, transcript history with clear
- Voice → mission bridge: browser STT transcript creates real mission via `createMission` + `runAgent` API calls
- Updated frontend API client with 9 voice functions (status, provider switch, STT, TTS, sessions CRUD, transcript, status)
- Updated TypeScript types with voice types (VoiceStatus, STTResponse, TTSResponse, VoiceSession, VoiceTranscriptEntry)
- 41/41 Phase 5 tests pass, 110/110 total tests pass (Phases 1-5)

Stage Summary:
- Phase 5 code-complete
- 110/110 tests passing
- Voice provider abstraction mirrors ModelProvider pattern
- Browser-native STT/TTS works immediately (no API keys needed)
- Gemini/Groq STT adapters ready (blocked on API keys for E2E testing)
- Voice sessions with guarded state machine and transcript persistence
- Frontend voice control integrated into dashboard left panel
- BUILD_STATE.md updated with all Phase 5 acceptance criteria

---
Task ID: 2
Agent: main
Task: OpenJarvis Phase 3-4 Build

Work Log:
- Phase 3 UI: Added Socket.IO WebSocket server on port 3002 to Express backend
- Phase 3 UI: Created eventBus to broadcast mission_events after every DB write
- Phase 3 UI: Built 12 new/modified frontend files (8 components, 3 lib files, 1 hook)
- Phase 3 UI: Main dashboard with 3-panel layout (goal+state | timeline | tabbed views)
- Phase 3 UI: Agent state indicator driven by real mission status via WebSocket
- Phase 3 UI: Advanced views: Missions, Tools, Memory, Settings (all live data)
- Phase 3 UI: Connection banner shows real error state when backend is down
- Phase 3 UI: Dark/light/system theme via next-themes
- Phase 4 Computer Control: Created permission system with 17 capabilities
- Phase 4 Computer Control: Hard-block list enforced (filesystem_delete, shell_execute return requires_approval)
- Phase 4 Computer Control: Permission grants checked at execution time, not just at connection
- Phase 4 Computer Control: 17 computer-control tools with real schemas (screenshot, mouse, keyboard, clipboard, filesystem, shell, window, app)
- Phase 4 Computer Control: Verification loop architecture (screenshot_diff for UI tools, output_check for others)
- Phase 4 Computer Control: GUI-dependent tools return honest ENVIRONMENT_UNAVAILABLE, not fake success
- Phase 4 Computer Control: Permission API endpoints wired into Express + frontend API client
- Phase 4 Computer Control: 23/23 Phase 4 tests pass
- All tests pass: 69/69 across Phases 1-4

Stage Summary:
- Phases 0-4 are code-complete
- 69/69 tests passing
- 17 computer-control tools ready for desktop environment
- Permission system with hard-block protection
- Verification loop architecture in place
- Tauri desktop shell and mobile (React Native) deferred per spec
- GUI tools honestly fail in headless sandbox — no fake successes

---
Task ID: 6
Agent: main
Task: OpenJarvis Phase 6 — Memory System

Work Log:
- Migrated MemoryEntry schema: added tags (JSON array), missionId (FK to missions), source (agent/user/system/import), importance (1-5), accessCount, lastAccessedAt, expiresAt, updatedAt
- Created MemoryAssociation table with from/to relations, strength (0-1), unique constraint on pairs
- Rewrote memoryService with 15+ methods: CRUD, search (keyword + relevance scoring), recallForContext, touch, consolidate, purgeExpired, getStats, createAssociation, getAssociated, bulkRemove, removeByScope, listByMission
- Built MemoryContextBuilder (agent/memory/contextBuilder.ts): formats relevant memories as `<memory-context>` XML block for system prompt injection, groups by scope with labels, respects token/entry limits, auto-touches recalled memories
- Created 4 agent memory tools (agent/memory/memoryTools.ts): memory_store, memory_recall, memory_search, memory_forget — all low risk, full JSON Schema input/output definitions
- Wired context_retrieval stage in agent loop to MemoryContextBuilder — builds memory context from goal before first model call
- Enhanced memory_update stage to store episodic results with goal-derived tags, missionId linkage, and source tracking
- Rewrote memory REST API (routes/memory.ts): GET /memory/search, GET /memory/stats, GET /memory/scopes, GET /memory/:id, GET /memory/:id/associations, POST /memory (enhanced), PATCH /memory/:id, POST /memory/consolidate, POST /memory/purge-expired, POST /memory/bulk-delete
- Updated frontend types (openjarvis-types.ts): MemoryScope now 5 scopes, added MemorySource, MemorySearchResult, MemoryStats, enhanced MemoryEntry
- Updated API client (openjarvis-api.ts): searchMemory, getMemoryStats, getMemoryById, updateMemory, consolidateMemory, purgeExpiredMemory, bulkDeleteMemory
- Rewrote MemoryTab component: search bar, scope filter dropdown, create form (key/value/scope/tags/importance), stats panel, consolidate button, purge button, importance stars, tag badges, source/access display, group-hover delete
- Fixed Phase 1 test (memory update API changed from positional to named {value} param)
- Fixed SQLite compatibility: removed Prisma `or` filter for null date, moved expiry filtering to application layer
- Fixed search scoring: require text relevance > 0 before including results (prevents importance/recency alone from surfacing irrelevant entries)
- Fixed DB query ordering: use createdAt desc instead of importance desc to avoid missing recent entries in search

Stage Summary:
- Phase 6 complete with 46/46 tests passing
- 156/156 total tests pass (Phase 1-6)
- Key architecture: keyword search with relevance scoring, context injection into agent prompt, 4 agent tools, memory lifecycle management
- BUILD_STATE.md updated with Phase 6 completion and 11 acceptance criteria checked
\n---\nTask ID: 7\nAgent: main\nTask: OpenJarvis Phase 7 — Mobile API Layer\n\nWork Log:\n- Added mobile_clients table: name, platform (ios/android/web), unique apiKey, enabled, lastSeenAt\n- Created mobile client service: register, authenticate, revoke, enable, regenerateApiKey, list, delete\n- Built API key auth middleware: requireMobileAuth() — validates X-API-Key header or api_key query param, optional mode\n- Created pagination utility: parsePagination (page/limit clamping) + buildPaginatedResponse (data + metadata envelope)\n- Created mobile types: PaginatedRequest/Response, MobileClient, MobileMissionSummary, MobileAgentRunResponse\n- Built versioned mobile API at /mobile/v1/ with 10 endpoints:\n  - POST /register (open), GET /missions (paginated summary), GET /missions/:id (detail with event count),\n  - GET /missions/:id/events (paginated), GET /missions/:id/events/stream (SSE),\n  - GET /memory (paginated), GET /memory/search, GET /tools (lightweight),\n  - POST /agent/run (combined create+start), GET /health\n- Built admin routes at /mobile/admin/clients: list, revoke, enable, regenerate, delete\n- SSE event stream: sends existing events, polls for new, auto-timeout at 5min, no WebSocket dependency\n- Added unauthorized() error factory to errors.ts\n- Added Mobile API info card to Settings tab in frontend\n- React Native app shell deferred — no mobile SDK/toolchain in sandbox\n\nStage Summary:\n- Phase 7 complete with 22/22 tests passing\n- 178/178 total tests pass (Phase 1-7)\n- Key architecture: versioned API, API key auth, pagination, SSE streaming, client management\n- BUILD_STATE.md updated with Phase 7 completion and 9 acceptance criteria checked

---
Task ID: 7b
Agent: main
Task: OpenJarvis Phase 7 — React Native Mobile Client

Work Log:
- Initialized Expo SDK 57 project with React Native 0.86, React 19
- Installed dependencies: @react-navigation/native, bottom-tabs, native-stack, react-native-screens, safe-area-context, async-storage
- Built API client layer (src/api/client.ts): OpenJarvisClient class with loadConfig, register, health, listMissions, getMission, createMission, listEvents, runAgent, listMemory, searchMemory, listTools, SSE streamEvents with ReadableStream parsing, AbortController support
- Built API types (src/api/types.ts): 17 types mirroring backend /mobile/v1 contract — PaginatedRequest/Response, MobileClient, MissionSummary/Detail, MissionEvent, AgentRunResponse, MemoryEntry, MemorySearchResponse, ToolSummary, HealthResponse, ApiError
- Built formatting utilities (src/utils/formatters.ts): timeAgo, formatDateTime, truncate, statusColor, riskColor, riskLabel, formatNumber, stageLabel
- Built theme system (src/theme/index.ts): Colors (dark-first), Spacing, Radius, FontSize constants
- Built common UI components (src/components/common.tsx): Badge, Button, EmptyState, SectionHeader, ListItem, LoadingSpinner
- Built Screen wrapper component with safe area and optional scroll
- Built AppContext (src/store/AppContext.tsx): global state for client config, registration, server URL, logout/refresh
- Built 6 screens:
  - SetupScreen: server URL config → device registration (2-step first-run flow)
  - MissionsScreen: paginated mission cards with status badges, tool call/token stats, timeAgo, load more
  - MissionDetailScreen: mission info, 4-stat cards (calls/tokens/events/risk), event timeline with SSE live streaming, connector lines, stage labels
  - AgentScreen: multiline goal input (500 char), run/stop/reset buttons, live SSE progress list with stage labels
  - MemoryScreen: search bar, horizontal scope filter chips (all/working/episodic/semantic/preference/preference/project), memory cards with importance stars, tags, scope badges
  - ToolsScreen: tool catalog with name, description, risk level badges
  - SettingsScreen: server URL config with save, health check dot, device info, disconnect button
- Built navigation: bottom tabs (Missions/Agent/Memory/Tools/Settings) + stack navigator for MissionDetail
- Built App.tsx root: NavigationContainer with dark theme, AppProvider + AppGate (setup vs main)
- Wrote 55 unit tests across 3 test suites:
  - formatters.test.ts (31 tests): timeAgo (6), truncate (4), statusColor (5), riskColor (5), riskLabel (1), formatNumber (4), stageLabel (2), formatDateTime (1), plus edge cases
  - apiClient.test.ts (21 tests): Config Management (7), HTTP Requests (4), API Endpoints (9), SSE Streaming (3), ApiClientError (1)
  - types.test.ts (3 tests): barrel exports, ApiClientError instanceof, module loading
- All tests pass: 55/55 mobile + 178/178 backend = 233 total

Stage Summary:
- Phase 7 React Native mobile client is code-complete
- 55/55 mobile tests, 178/178 backend tests — all green
- 233 total tests across the full OpenJarvis project
- Key architecture: Expo SDK 57, API key auth, SSE streaming, AsyncStorage persistence, 5-tab navigation
- Mobile app connects to existing /mobile/v1 backend endpoints (no backend changes needed)
- BUILD_STATE.md updated with Phase 7 mobile completion

---
Task ID: 8
Agent: main
Task: OpenJarvis Phase 8 — MCP / Plugin System

Work Log:
- Added McpServer table: name (unique), transport (stdio|sse|in-process), command, args (JSON array), url, env (JSON object), enabled, status (disconnected|connecting|connected|error), lastError, toolCount, connectedAt
- Added McpTool table: serverId FK, name (namespaced "mcp__servername__toolname"), mcpName (original), description, inputSchema (JSON), riskLevel (default medium), enabled; unique constraint on (serverId, mcpName)
- Created MCP types (src/mcp/types.ts): JSON-RPC 2.0 request/response, MCP protocol types (initialize, listTools, callTool, tool definition), server config, transport interface, plugin manager types
- Built McpProtocolClient (src/mcp/mcpClient.ts): JSON-RPC 2.0 over transport, initialize with client info, listTools, callTool with typed responses, McpError class
- Built 3 transport implementations (src/mcp/transports.ts):
  - StdioTransport: spawns child process, stdin/stdout JSON-RPC, stderr logging, 10s connect timeout, 30s request timeout, pending request map with timeout cleanup
  - SseTransport: HTTP SSE connect, parses endpoint event, POST for requests, session ID tracking
  - InProcessTransport: in-memory tool collection, synchronous JSON-RPC handling, perfect for testing and built-in plugins
- Built MCP Plugin Manager (src/mcp/pluginManager.ts):
  - Server CRUD (DB-backed): createServer, listServers, getServer, updateServer, deleteServer with validation (transport/command/url requirements)
  - Connection lifecycle: connectServer (transport creation → initialize → listTools → syncTools → status update), disconnectServer, error handling with status tracking
  - Tool sync: _syncTools deletes old tools, creates new McpTool records with namespaced names (mcp__servername__toolname)
  - Tool bridging: buildToolHandlers() creates ToolHandler[] from all connected MCP servers, each handler calls client.callTool() and extracts text content from MCP response
  - Status: getStatus returns totalServers, connected, error, totalMcpTools counts
  - In-process registration: registerInProcess for testing/built-in plugins
- Built REST API (src/routes/mcp.ts): 8 endpoints
  - GET/POST /mcp/servers (list, create), GET/PATCH/DELETE /mcp/servers/:id (CRUD)
  - POST /mcp/servers/:id/connect, /mcp/servers/:id/disconnect (lifecycle)
  - GET /mcp/servers/:id/tools, GET /mcp/tools (tool listing)
  - GET /mcp/status (system status)
- Wired /mcp routes into index.ts Express app
- 36/36 Phase 8 tests pass covering: MCP types (3), In-Process Transport (9), Protocol Client (4), Plugin Manager CRUD (9), In-Process Connect (4), buildToolHandlers (3), Status (1), McpError (1)

Stage Summary:
- Phase 8 complete with 36/36 tests passing
- 269 total tests pass (214 backend + 55 mobile)
- Key architecture: JSON-RPC 2.0 over 3 transports, DB-backed plugin registry, namespaced tool bridging into existing ToolRegistry
- MCP tools default to "medium" risk level (external code)
- Stdio transport ready for npx/node based MCP servers (e.g. @anthropic/mcp-server-*), SSE transport ready for remote MCP servers
- BUILD_STATE.md updated with Phase 8 completion

---
Task ID: 10
Agent: main
Task: OpenJarvis Phase 10 — Approval Workflow & Human-in-the-Loop

Work Log:
- Added ApprovalRequest table: missionId, toolName, capability, riskLevel (default medium), status (pending|approved|rejected|expired|cancelled), reason, toolInput (JSON), resolvedBy, resolvedAt, response, expiresAt, with indexes on status/riskLevel/expiresAt/missionId
- Added ApprovalRule table: name (unique), description, enabled, matchRiskLevels (JSON array), matchToolNames (JSON array with wildcard support), matchCapabilities (JSON array), action (auto_approve|auto_reject|require_manual), priority (higher wins)
- Ran prisma db push to create new tables
- Fixed Prisma client resolution: @prisma/client was resolving to root Next.js project's client (User/Post tables). Changed db.ts to import from local `../../node_modules/.prisma/client/index.js`
- Created approvalService (src/services/approvalService.ts): full CRUD for requests + rules, approve/reject/cancel lifecycle, expiry cleanup, stats, rule-based auto-approval engine with priority, pattern matching (wildcard *), combined conditions
- Created approvalGate (src/services/approvalGate.ts): checkApprovalGate() called by agent loop before tool execution, determines if tool needs approval based on: (1) auto-approval rules (highest priority first), (2) hard-blocked capabilities (filesystem_delete, shell_execute), (3) risk level (high/critical). Returns {proceed, approvalId, status, reason}. Also includes waitForApprovalDecision() polling function.
- Modified agent loop (agentLoop.ts): before each tool execution, calls checkApprovalGate(). If waiting_approval, sets mission to waiting_approval status, records risk_check stage, polls for decision. On approved: resumes. On rejected/expired/cancelled: feeds error back to model as tool result so it can adapt.
- Created approval REST routes (src/routes/approval.ts): 11 endpoints — GET/POST approvals, GET stats, GET pending, POST expire, GET/:id, POST :id/approve, POST :id/reject, POST :id/cancel, GET/PATCH/DELETE rules
- Wired /approvals routes into index.ts Express app
- Added WebSocket approval events: subscribe:approvals, subscribe:mission:approvals, unsubscribe variants. eventBus.emit broadcasts approval:created and approval:resolved to global and mission-specific rooms
- Added frontend types (openjarvis-types.ts): ApprovalRequest, ApprovalRequestList, ApprovalStats, ApprovalRule, WsApprovalEvent
- Added frontend API client (openjarvis-api.ts): 11 approval functions — getApprovals, getPendingApprovals, getApprovalStats, getApproval, approveRequest, rejectRequest, cancelRequest, expirePendingApprovals, getApprovalRules, createApprovalRule, updateApprovalRule, deleteApprovalRule
- Created ApprovalQueue component (approval-queue.tsx): pending/history tabs, stats bar (pending/approved/rejected/expired), ApprovalCard with risk badge, expandable tool input, approve/reject/cancel buttons, reject-with-reason input, auto-poll every 5s
- Integrated ApprovalQueue into dashboard page.tsx as 5th tab (Approvals) with red badge counter
- 44/44 Phase 10 tests pass, 258/258 total tests pass (Phases 1-10)

Stage Summary:
- Phase 10 complete with 44/44 tests passing
- 258 total backend tests pass across 8 test files (previously 214)
- Key architecture: approval gate pattern in agent loop, rule-based auto-approval engine with priority ordering, DB-backed request lifecycle, WebSocket real-time notifications
- Mission state machine's `waiting_approval` status now fully functional with real tool-gating logic
- Rules support: risk level matching, tool name exact/wildcard matching, capability matching, combined conditions, priority ordering, disabled state
- Approval TTL defaults to 300s (5 min), configurable per request
- Frontend shows approval queue as a tab with pending count badge
---
Task ID: 10
Agent: main
Task: Implement Phase 10 Authorization Model ("The admin is the policy")

Work Log:
- Explored existing codebase: found Phase 10 approval workflow existed but lacked the core Authorization Model
- Added `capability_grants` table to Prisma schema with proper indexing
- Created `capabilityRegistry` service (DB-backed, replaces in-memory PermissionManager)
- Rewrote `approvalGate.ts` to implement the 3-state authorization flow: allowed→execute, denied→block, undefined→ask
- Updated `approvalService.approve()` to support `alwaysAllow` option (creates permanent grant)
- Added `/capabilities` REST routes (CRUD + statuses + revoke-all)
- Updated `/permissions` routes to use DB-backed registry
- Updated `/approvals/:id/approve` route to accept `alwaysAllow` body param
- Updated frontend: `ApprovalQueue` now has "Approve Once" + "Always Allow" buttons + "Registry" tab
- Added `CapabilityRegistryPanel` component showing all 17 capabilities with status
- Added API client functions and TypeScript types for capability grants
- Wrote 31 new Authorization Model tests covering: CRUD, 3-state check, scoped grants, scope context, gate integration, approve-once vs always-allow, immediate revocation
- Fixed 1 existing test that relied on pre-authorization-model behavior
- Full test suite: 289 pass, 0 fail

Stage Summary:
- The Authorization Model is now fully implemented per spec
- Core principle: "JARVIS has no opinions about what it should or shouldn't do beyond what you've configured"
- Three states: undefined (pause+ask), allowed (execute), denied (block)
- "Always Allow" button creates permanent grants so admin is only asked once per capability
- Revocation takes immediate effect including for in-progress missions
- Scoped grants support (permanent, mission, session) with scope context (pathPrefix, domain)
- All 289 tests pass

---
Task ID: 16
Agent: main
Task: OpenJarvis Phase 16 — The Sovereign Stack: Self-Hosted Tool Suite

Work Log:
- Added `service_instances` and `service_backups` tables to Prisma schema (migration: phase16_service_instances)
- Created `serviceCatalog.ts`: 20 services with full metadata (name, displayName, group, repoUrl, replaces, hostname, imageTag, resource weight, RAM/CPU/disk estimates, port, mobile app info, backup priority, backup volumes, special notes)
- Created `serviceManager.ts`: core service lifecycle service with deploy, staged update (pull → health-check → apply → re-verify → auto-rollback), restart, stop, health check (docker inspect + HTTP), backup (docker volume archiving), restore, rollback
- Created 4 Docker Compose files:
  - `compose/group-a.yml`: Stirling-PDF, Immich (+Postgres+Redis), Upscayl, Whisper, LocalSend, Caddy
  - `compose/group-b.yml`: Audiblez, Rembg, Spleeter, pyVideoTrans, OCRmyPDF (all on-demand with profiles)
  - `compose/group-c.yml`: Vaultwarden, Nextcloud (+MariaDB), Pi-hole, Home Assistant, SearXNG
  - `compose/group-d.yml`: AppFlowy, Cal.com (+Postgres+Redis), NocoDB, Listmonk (+Postgres), Formbricks (+Postgres)
- Created `compose/caddy/Caddyfile`: 20 internal hostnames (*.internal), Tailscale-only binding documentation
- Created 6 service lifecycle tools (`src/agent/tools/service-lifecycle/index.ts`): deploy_service (medium), update_service (medium), restart_service (low), backup_service (low), check_service_health (low), rollback_service (high)
- Added 6 service lifecycle capabilities to `permissions/types.ts`: service_deploy, service_update, service_restart, service_backup, service_health_check, service_rollback
- Destructive actions (volume deletion, force-recreate) are NOT exposed as tools — only admin can do them
- Created `/services` REST routes (13 endpoints): list, resources, get, deploy, update, restart, stop, rollback, health (single + all), backup (create + list), restore
- Wired service routes into `index.ts` Express app
- Added WebSocket service subscriptions: `subscribe:services`, `service:status_changed`, `service:health_alert` events
- Updated eventBus to broadcast service:* events
- Added `capability` field to `ToolHandler` interface in `types.ts`
- Changed `CAPABILITY_RISK` type from `Record<Capability, ...>` to `Record<string, ...>` to accommodate new capabilities
- Created `BUILD_STATE.md` with: architecture decisions, resource estimates, go/no-go assessment, open risks, implementation status
- Created 28 Phase 16 tests: service catalog (7), resource estimation (3), service manager seed (5), lifecycle tools (5), permission tiering (4), resource report (2), backup listing (2)
- All 28 tests pass

Stage Summary:
- Phase 16 code-complete (infrastructure layer)
- 20 services defined across 4 deployment groups with resource profiles
- 6 new tools registered for agent use, gated by the existing authorization model
- Staged update flow with automatic rollback on health check failure
- Destructive actions are architecturally impossible via tools (no `service_delete_volume` capability)
- Backup system with restore-tested flag and second-location storage target field
- Single-disk backup risk explicitly flagged in BUILD_STATE.md
- Mobile apps documented: Immich, Bitwarden, Nextcloud, Home Assistant (all with pairing instructions)
- SearXNG confirmed as single instance (Phase 14 reuse)
- Home Assistant explicitly noted as empty shell
- Real deployment requires: Docker on PC, Tailscale on PC+phone, second storage for real backups

