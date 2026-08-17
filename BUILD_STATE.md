# OpenJarvis Build State

## Current Phase
Phase 0 — Discovery (COMPLETED)

## Completed Milestones
- **Phase 0 — Discovery** (2026-08-17)
  - Environment inventory complete
  - `.env.example` created with all required variables
  - Gemini + Groq API capabilities verified against current docs
  - Runtime version pinned

## Known Failures / Blockers
- No existing JARVIS repo found — this is a greenfield build
- Supabase is specified in the master spec but the sandbox provides SQLite/Prisma; schema will match the spec exactly and can be swapped to Supabase by changing `datasource` in `prisma/schema.prisma` and `DATABASE_URL`
- Groq has a known limitation: structured output (JSON Schema) and function calling cannot be used simultaneously as of late 2025; the adapter must handle this by using function calling without structured output constraint when tools are active
- No GEMINI_API_KEY or GROQ_API_KEY set in current environment — integration tests will need keys provided via `.env`

## Last Verified Working
(no code yet — Phase 0 is discovery only)

## Next Action
Begin Phase 1 — Foundation

## Architecture Decisions Log
- 2026-08-17: Pinned stack per Phase 0-2 spec (TS/Express/Prisma-SQLite-local/Gemini+Groq)
- 2026-08-17: Using Prisma ORM locally (SQLite) with schema matching Supabase Postgres design; migration to Supabase requires only `datasource` + `DATABASE_URL` change
- 2026-08-17: Express backend runs as a mini-service on port 3001 per sandbox architecture rules
- 2026-08-17: CommonJS not used — sandbox uses ESM (Bun/Next.js); the Express mini-service will use ESM (`"type": "module"` in its package.json) for consistency with the host project. If migrating to a standalone Node.js deployment later, the module system can be switched to CJS.

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
- **Styling**: Tailwind CSS 4 + shadcn/ui
- **UI packages**: React 19, Radix UI, Framer Motion, Recharts, Lucide icons
- **State**: Zustand, TanStack Query
- **Existing schema**: `User` and `Post` models (boilerplate — will be replaced/augmented)
- **Gateway**: Caddy reverse proxy on port 3000; mini-services on other ports accessed via `XTransformPort` query param
- **Mini-service pattern**: Independent Bun project in `mini-services/` with own `package.json` and port

### No Existing JARVIS Code
- No Express server, no Gemini/Groq integration, no agent logic found
- This is a greenfield build within the sandbox

## API Capabilities (Verified 2026-08-17)

### Google Gemini API
- **Tool/Function calling**: ✅ Fully supported. Gemini 3 supports combining function calling with structured output.
  - Docs: https://ai.google.dev/gemini-api/docs/function-calling
- **Streaming**: ✅ Supported via `streamGenerateContent`.
  - Docs: https://ai.google.dev/gemini-api/docs/generate-content (streaming section)
- **Structured output**: ✅ Supported via `responseSchema` (JSON Schema).
  - Docs: https://ai.google.dev/gemini-api/docs/structured-output
- **SDK**: `@google/generative-ai` v0.24.1

### Groq API
- **Tool/Function calling**: ✅ Supported (local tool calling).
  - Docs: https://console.groq.com/docs/tool-use/overview
- **Streaming**: ✅ Supported.
- **Structured output**: ⚠️ Supported via JSON Schema, BUT cannot be used simultaneously with function calling (known limitation as of late 2025). Adapter must use one or the other per request.
  - Docs: https://console.groq.com/docs/tool-use/local-tool-calling
- **SDK**: `groq-sdk` v1.5.0

### Key npm Packages
- `@google/generative-ai`: 0.24.1
- `groq-sdk`: 1.5.0
- `express`: 5.2.1
- `uuid`: 14.0.1
