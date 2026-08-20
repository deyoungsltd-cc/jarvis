# OpenJarvis — BUILD_STATE.md

## Architecture Decisions Log

### Phase 16 Decisions

| Component | Decision | Why |
|---|---|---|
| Container runtime | **Docker Desktop for Windows (WSL2 backend)** | Standard, well-documented path for running Linux containers on Windows |
| Orchestration | **Docker Compose**, one stack per group (A/B/C/D) | Keeps updates/restarts scoped, reduces blast radius |
| Secure remote access | **Tailscale, free Personal plan** | Private mesh network, phone reaches services via Tailscale address, no ports to public internet |
| Reverse proxy | **Caddy** — automatic HTTPS, simple config | Clean internal hostnames (vault.internal, photos.internal, etc.) |
| Proxy exposure | **Bound to Tailscale interface only** | Biggest security measure: no admin panels on raw internet |
| Backup storage | **Local with second-location flag** | On single-PC, local backup is a copy that shares disk-failure risk — flagged as open risk |
| Update policy | **Staged: pull → health-check → apply → re-verify → auto-rollback** | Unattended docker pull on a live password vault is unsafe |

## Resource Estimates

### Per-Service Resource Footprint

| Service | Group | Weight | RAM (MB) | CPU Cores | Disk (GB) |
|---|---|---|---|---|---|
| Stirling-PDF | A | moderate | 1,024 | 1.0 | 2 |
| Immich | A | moderate | 1,024 | 2.0 | 50 |
| Upscayl | A | on-demand | 2,048 | 2.0 | 5 |
| Whisper | A | on-demand | 2,048 | 2.0 | 5 |
| LocalSend | A | lightweight | 64 | 0.5 | 1 |
| Audiblez | B | on-demand | 1,024 | 2.0 | 5 |
| Rembg | B | on-demand | 1,024 | 1.0 | 2 |
| Spleeter | B | on-demand | 1,024 | 2.0 | 2 |
| pyVideoTrans | B | heavy | 2,048 | 4.0 | 10 |
| OCRmyPDF | B | on-demand | 512 | 1.0 | 1 |
| Vaultwarden | C | lightweight | 64 | 0.25 | 1 |
| Nextcloud | C | moderate | 512 | 1.0 | 20 |
| Pi-hole | C | lightweight | 128 | 0.5 | 2 |
| Home Assistant | C | moderate | 512 | 1.0 | 5 |
| SearXNG | C | lightweight | 128 | 0.5 | 1 |
| AppFlowy | D | moderate | 512 | 1.0 | 5 |
| Cal.com | D | moderate | 512 | 1.0 | 5 |
| NocoDB | D | moderate | 512 | 1.0 | 5 |
| Listmonk | D | lightweight | 128 | 0.5 | 2 |
| Formbricks | D | moderate | 512 | 1.0 | 5 |

### Summary

| Category | RAM | Services |
|---|---|---|
| Always-on steady state | ~5.4 GB | 13 services |
| On-demand (when active) | ~9.7 GB | 7 services |
| **Total if all running** | **~15.2 GB** | 20 services |

### Go/No-Go Assessment

> **Decision: CONDITIONAL GO with staged rollout**
>
> A machine with 16GB RAM can run all always-on services with comfortable headroom (~10GB available). On-demand services should be started/stopped as needed rather than left running. If all 20 ran simultaneously, the system would be heavily memory-constrained. A 32GB machine would have no contention issues.

## Open Risks

### 1. Single-Disk Backup (CRITICAL)
Backups written to the same physical disk as the source data. If the disk fails, both original and backup are lost.
- **Mitigation**: Configure `BACKUP_DIR` to point to a second physical drive (external HDD/SSD), or set up Nextcloud to mirror critical backups off-box once a second machine is available.
- **Status**: Flagged. Not yet resolved.

### 2. Resource Contention (MODERATE)
7 on-demand services spike to ~9.7GB when all active simultaneously.
- **Mitigation**: Stop on-demand services when not in use. Consider staggering heavy workloads. On a 16GB machine, run at most 2-3 on-demand services concurrently.
- **Status**: Documented. Manageable with the stop/start lifecycle.

### 3. Home Assistant Empty Shell
HA deploys cleanly but controls nothing until real smart-home devices are added.
- **Status**: By design. Not a risk, but explicitly noted so the dashboard doesn't pretend to control anything.

### 4. SearXNG Single Instance
Same instance used for Phase 14 research fallback and Phase 16 self-hosted search.
- **Status**: By design. No duplication. Deploy once, reuse.

## Phase 16 Implementation Status

- [x] DB Schema: `ServiceInstance` + `ServiceBackup` models migrated
- [x] Service Catalog: All 20 services defined with resource profiles
- [x] Service Manager: deploy, update (staged), restart, stop, health check, rollback, backup, restore
- [x] Docker Compose files: 4 group files (group-a/b/c/d.yml)
- [x] Caddy config: 20 internal hostnames, Tailscale-only binding
- [x] 6 Tool Definitions: deploy/update/restart/backup/health_check/rollback
- [x] Permission tiering: routine (low risk) vs destructive (NEVER exposed as tools)
- [x] API routes: `/services/*` — 13 endpoints
- [x] WebSocket events: `subscribe:services`, `service:status_changed`, `service:health_alert`
- [x] Backup: Docker volume archiving, restore-tested flag, second-location storage target
- [x] Tests: 28/28 passing
- [ ] **Actual Docker deployment** — requires a machine with Docker installed
- [ ] **Tailscale setup** — requires Tailscale installed on PC and phone
- [ ] **Restore test** — requires an actual deployed service to test restore
- [ ] **Security audit** — verify Vaultwarden/Nextcloud/HA unreachable from public internet
