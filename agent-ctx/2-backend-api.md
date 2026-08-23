# Task ID: 2 - backend-api
## Task: Build all backend API routes for OpenJARVIS

### Files Created (37 route files):

| # | Path | Methods | Description |
|---|------|---------|-------------|
| 1 | `src/app/api/auth/[...nextauth]/route.ts` | GET, POST | NextAuth with JWT + Credentials provider |
| 2 | `src/app/api/workspaces/route.ts` | GET, POST | List/create workspaces |
| 3 | `src/app/api/workspaces/[id]/route.ts` | GET, PATCH, DELETE | Single workspace CRUD |
| 4 | `src/app/api/audit/route.ts` | GET | Audit logs with pagination + filters |
| 5 | `src/app/api/export/route.ts` | POST | Export mission as JSON/Markdown/plain text |
| 6 | `src/app/api/analytics/route.ts` | GET | Usage analytics aggregation |
| 7 | `src/app/api/macros/route.ts` | GET, POST | List/create macros |
| 8 | `src/app/api/macros/[id]/route.ts` | GET, PATCH, DELETE | Single macro CRUD |
| 9 | `src/app/api/macros/[id]/run/route.ts` | POST | Trigger macro execution |
| 10 | `src/app/api/devices/route.ts` | GET, POST | List/register devices |
| 11 | `src/app/api/devices/[id]/route.ts` | GET, PATCH, DELETE | Single device CRUD |
| 12 | `src/app/api/daemon/ws/route.ts` | GET, POST | Device command queue (polling) |
| 13 | `src/app/api/daemon/result/route.ts` | POST | Device reports command result |
| 14 | `src/app/api/api-keys/route.ts` | GET, POST | List/create API keys (masked) |
| 15 | `src/app/api/plugins/route.ts` | GET, POST | List/register plugins |
| 16 | `src/app/api/plugins/[id]/route.ts` | PATCH, DELETE | Toggle/delete plugin |
| 17 | `src/app/api/documents/route.ts` | GET, POST | List/upload documents |
| 18 | `src/app/api/documents/[id]/route.ts` | DELETE | Remove document + file |
| 19 | `src/app/api/webhooks/route.ts` | GET, POST | List/create webhooks |
| 20 | `src/app/api/webhooks/[id]/route.ts` | PATCH, DELETE | Update/delete webhook |
| 21 | `src/app/api/scheduler/route.ts` | GET, POST | List/create scheduled jobs |
| 22 | `src/app/api/scheduler/[id]/route.ts` | PATCH, DELETE | Update/delete job |
| 23 | `src/app/api/vault/route.ts` | GET, POST | List/store secrets (AES-256-GCM) |
| 24 | `src/app/api/vault/[key]/route.ts` | GET, DELETE | Retrieve/decrypt/delete secret |
| 25 | `src/app/api/missions/route.ts` | GET, POST | List/create missions with pagination |
| 26 | `src/app/api/missions/[id]/route.ts` | GET, PATCH, DELETE | Single mission CRUD |
| 27 | `src/app/api/missions/[id]/events/route.ts` | GET, POST | List/create mission events |
| 28 | `src/app/api/memory/route.ts` | GET, POST | List/create memory entries |
| 29 | `src/app/api/memory/search/route.ts` | GET | Search memory by keyword |
| 30 | `src/app/api/memory/[id]/route.ts` | GET, PATCH, DELETE | Single memory entry CRUD |
| 31 | `src/app/api/tools/route.ts` | GET, POST | List/register tools |
| 32 | `src/app/api/approvals/route.ts` | GET, POST | List/create approvals with filters |
| 33 | `src/app/api/approvals/[id]/approve/route.ts` | POST | Approve request |
| 34 | `src/app/api/approvals/[id]/reject/route.ts` | POST | Reject request |
| 35 | `src/app/api/approvals/rules/route.ts` | GET, POST | List/create approval rules |
| 36 | `src/app/api/capabilities/grants/route.ts` | GET, POST | List/create capability grants |
| 37 | `src/app/api/voice/status/route.ts` | GET | Voice status from env vars |
| 38 | `src/app/api/health/route.ts` | GET | Health check with DB connection test |

### Key Design Decisions:
- All routes use `import { db } from '@/lib/db'` consistently
- Dynamic params use Next.js 16 `Promise<{ id: string }>` pattern
- Vault uses AES-256-GCM with VAULT_ENCRYPTION_KEY env var
- Daemon uses in-memory command queue as WebSocket alternative
- Pagination follows { data, pagination: { page, limit, total, pages } } pattern
- Zero new lint errors introduced
