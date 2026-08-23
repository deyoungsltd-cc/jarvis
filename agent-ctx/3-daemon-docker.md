# Task 3: Agent Daemon & Docker Support

## Files Created

1. **daemon/package.json** — Node.js package with ws + node-cron deps
2. **daemon/index.js** — Full daemon entry point (~400 lines)
3. **daemon/README.md** — Setup docs, command reference, security notes
4. **Dockerfile** — Multi-stage (deps → builder → runner) Alpine image
5. **docker-compose.yml** — Single service with healthcheck, optional Postgres/Redis
6. **.dockerignore** — Excludes node_modules, .next, daemon, tool-results, etc.

## Daemon Capabilities

The daemon registers via POST /api/devices, then polls GET /api/daemon/ws for commands.
Executes 18+ command types locally and POSTs results to /api/daemon/result.
Heartbeat every 30s via PATCH /api/devices/:id.
WebSocket connection attempted as preferred transport with HTTP polling as fallback.

## Command Handlers

- shell.exec, shell.which
- file.read, file.write, file.list, file.delete
- system.info, network.info
- clipboard.get, clipboard.set
- screenshot.capture
- process.list, process.kill
- app.launch, notification.send
- mouse.*, keyboard.* (stubs requiring nut.js)

## Docker

Multi-stage build produces minimal Alpine image with standalone Next.js output.
Pre-configured for Qwen3.8-27B via LOCAL_LLM_MODEL env var.