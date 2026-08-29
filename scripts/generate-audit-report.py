"""OpenJarvis v1.0 Release Audit Report - PDF generation script."""
import sys, os
sys.path.insert(0, '/home/z/my-project/skills/pdf/scripts')

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm, cm
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_JUSTIFY
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    PageBreak, KeepTogether, HRFlowable
)
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfbase.pdfmetrics import registerFontFamily

FONT_DIR = '/usr/share/fonts'
pdfmetrics.registerFont(TTFont('NotoSerifSC', f'{FONT_DIR}/truetype/noto-serif-sc/NotoSerifSC-Regular.ttf'))
pdfmetrics.registerFont(TTFont('NotoSerifSC-Bold', f'{FONT_DIR}/truetype/noto-serif-sc/NotoSerifSC-Bold.ttf'))
registerFontFamily('NotoSerifSC', normal='NotoSerifSC', bold='NotoSerifSC-Bold')
pdfmetrics.registerFont(TTFont('NotoSansSC', f'{FONT_DIR}/truetype/chinese/SarasaMonoSC-Regular.ttf'))
pdfmetrics.registerFont(TTFont('NotoSansSC-Bold', f'{FONT_DIR}/truetype/chinese/SarasaMonoSC-Bold.ttf'))
pdfmetrics.registerFont(TTFont('DejaVuSans', f'{FONT_DIR}/truetype/dejavu/DejaVuSans.ttf'))
pdfmetrics.registerFont(TTFont('DejaVuSans-Bold', f'{FONT_DIR}/truetype/dejavu/DejaVuSans-Bold.ttf'))

PAGE_BG = colors.HexColor('#f5f5f4')
CARD_BG = colors.HexColor('#e7e6e4')
TABLE_STRIPE = colors.HexColor('#eeedea')
HEADER_FILL = colors.HexColor('#4f4832')
BORDER = colors.HexColor('#d8d3c5')
ACCENT = colors.HexColor('#8e7423')
TEXT_PRIMARY = colors.HexColor('#151413')
TEXT_MUTED = colors.HexColor('#7f7d75')
SEM_SUCCESS = colors.HexColor('#4c865f')
SEM_WARNING = colors.HexColor('#9c824c')
SEM_ERROR = colors.HexColor('#984b43')
SEM_INFO = colors.HexColor('#597795')

PAGE_W, PAGE_H = A4
LEFT_M = 20*mm
RIGHT_M = 20*mm
TOP_M = 22*mm
BOTTOM_M = 22*mm
CONTENT_W = PAGE_W - LEFT_M - RIGHT_M
OUTPUT = '/home/z/my-project/download/OpenJarvis_v1.0_Release_Audit.pdf'
os.makedirs(os.path.dirname(OUTPUT), exist_ok=True)

sH1 = ParagraphStyle('H1', fontName='NotoSansSC-Bold', fontSize=18, leading=24, textColor=TEXT_PRIMARY, spaceAfter=8, spaceBefore=16)
sH2 = ParagraphStyle('H2', fontName='NotoSansSC-Bold', fontSize=14, leading=20, textColor=TEXT_PRIMARY, spaceAfter=6, spaceBefore=14)
sH3 = ParagraphStyle('H3', fontName='NotoSansSC-Bold', fontSize=11.5, leading=16, textColor=TEXT_PRIMARY, spaceAfter=4, spaceBefore=10)
sBody = ParagraphStyle('Body', fontName='NotoSerifSC', fontSize=10, leading=16, textColor=TEXT_PRIMARY, alignment=TA_JUSTIFY, spaceAfter=6)
sTC = ParagraphStyle('TC', fontName='NotoSerifSC', fontSize=8.5, leading=12, textColor=TEXT_PRIMARY)
sTCB = ParagraphStyle('TCB', fontName='NotoSansSC-Bold', fontSize=8.5, leading=12, textColor=TEXT_PRIMARY)
sVP = ParagraphStyle('VP', fontName='NotoSansSC-Bold', fontSize=8.5, leading=12, textColor=SEM_SUCCESS)
sVF = ParagraphStyle('VF', fontName='NotoSansSC-Bold', fontSize=8.5, leading=12, textColor=SEM_ERROR)
sVW = ParagraphStyle('VW', fontName='NotoSansSC-Bold', fontSize=8.5, leading=12, textColor=SEM_WARNING)
sVS = ParagraphStyle('VS', fontName='NotoSerifSC', fontSize=8.5, leading=12, textColor=TEXT_MUTED)
sSmall = ParagraphStyle('Sm', fontName='NotoSerifSC', fontSize=8.5, leading=12, textColor=TEXT_MUTED)
sMuted = ParagraphStyle('Mu', fontName='NotoSerifSC', fontSize=10, leading=16, textColor=TEXT_MUTED, spaceAfter=6)

def vc(text, level):
    m = {'PASS': sVP, 'FAIL': sVF, 'WARN': sVW, 'SKIP': sVS, 'CRITICAL': sVF, 'HIGH': sVF, 'MEDIUM': sVW, 'LOW': sVW, 'OPEN': sVF}
    return Paragraph(text, m.get(level, sTC))

def sec():
    return HRFlowable(width='100%', thickness=0.5, color=BORDER, spaceAfter=6, spaceBefore=6)

def tbl(headers, rows, cw):
    hdr = [Paragraph(h, sTCB) for h in headers]
    data = [hdr] + rows
    t = Table(data, colWidths=cw, repeatRows=1)
    sc = [
        ('BACKGROUND', (0,0), (-1,0), HEADER_FILL),
        ('TEXTCOLOR', (0,0), (-1,0), colors.white),
        ('BOTTOMPADDING', (0,0), (-1,0), 6), ('TOPPADDING', (0,0), (-1,0), 6),
        ('LEFTPADDING', (0,0), (-1,-1), 6), ('RIGHTPADDING', (0,0), (-1,-1), 6),
        ('TOPPADDING', (0,1), (-1,-1), 4), ('BOTTOMPADDING', (0,1), (-1,-1), 4),
        ('GRID', (0,0), (-1,-1), 0.4, BORDER),
        ('VALIGN', (0,0), (-1,-1), 'TOP'),
    ]
    for i in range(1, len(data)):
        if i % 2 == 0: sc.append(('BACKGROUND', (0,i), (-1,i), TABLE_STRIPE))
    t.setStyle(TableStyle(sc))
    return t

def build():
    doc = SimpleDocTemplate(OUTPUT, pagesize=A4, leftMargin=LEFT_M, rightMargin=RIGHT_M,
        topMargin=TOP_M, bottomMargin=BOTTOM_M,
        title='OpenJarvis v1.0 Release Audit', author='Automated Audit System',
        subject='Pre-release audit and debug checklist')
    S = []

    # === COVER ===
    S.append(Spacer(1, 80*mm))
    S.append(Paragraph('FINAL RELEASE AUDIT', ParagraphStyle('k', fontName='DejaVuSans', fontSize=11, leading=14, textColor=TEXT_MUTED, spaceAfter=8)))
    S.append(Spacer(1, 4*mm))
    S.append(Paragraph('OpenJarvis v1.0', ParagraphStyle('h', fontName='NotoSansSC-Bold', fontSize=42, leading=50, textColor=TEXT_PRIMARY, spaceAfter=4)))
    S.append(Spacer(1, 2*mm))
    S.append(Paragraph('Audit and Debug Checklist', ParagraphStyle('s', fontName='NotoSerifSC', fontSize=16, leading=22, textColor=TEXT_MUTED, spaceAfter=12)))
    S.append(Spacer(1, 8*mm))
    S.append(Paragraph('This report presents the comprehensive pre-release audit of the OpenJarvis AI agent system, covering build state verification, cold-start testing, security audit, per-phase re-verification, scope-drift analysis, and documentation accuracy checks against the actual running application.', ParagraphStyle('su', fontName='NotoSerifSC', fontSize=10, leading=16, textColor=TEXT_MUTED, spaceAfter=20)))
    S.append(Spacer(1, 30*mm))
    ms = ParagraphStyle('m', fontName='NotoSerifSC', fontSize=10, leading=15, textColor=TEXT_MUTED)
    S.append(Paragraph('Audit Date: 2026-08-18', ms))
    S.append(Paragraph('Auditor: Automated Audit System', ms))
    S.append(Paragraph('Target: OpenJarvis Phases 0-12', ms))
    S.append(Spacer(1, 10*mm))
    S.append(HRFlowable(width='30%', thickness=3, color=ACCENT))
    S.append(PageBreak())

    # === 1. EXECUTIVE SUMMARY ===
    S.append(Paragraph('1. Executive Summary', sH1))
    S.append(Paragraph('This audit was conducted against the actual running OpenJarvis application, not against code or self-reported claims. The project is a multi-phase, single-user, self-hosted AI agent system built with TypeScript, Express, Prisma (SQLite), and a Next.js 16 frontend. The BUILD_STATE.md claims completion through Phase 10 with 258 tests passing. The audit reveals a significant gap between claimed state and reality: while all 289 unit tests pass, three entire phases (9, 11, 12) are missing, the database migration history is incomplete, critical security vulnerabilities exist, and there is zero cold-start documentation for new users.', sBody))
    S.append(Paragraph('The most critical findings are: (1) no README, INSTALLATION, or QUICKSTART documentation exists, making cold-start impossible for a new user; (2) three phases are entirely missing with no acknowledgment in BUILD_STATE.md; (3) a dual permission system conflict between Phase 4 and Phase 10 causes tools to be permanently blocked; (4) all API routes lack authentication, exposing the agent execution and approval system to untrusted access; and (5) the .env file is tracked in git. These issues collectively prevent a v1.0 release.', sBody))
    S.append(sec())
    S.append(Paragraph('Audit Scorecard', sH3))
    S.append(tbl(
        ['Audit Section', 'Status', 'Critical Issues'],
        [
            [Paragraph('BUILD_STATE.md Accuracy', sTCB), vc('FAIL','FAIL'), Paragraph('3', sTC)],
            [Paragraph('Cold-Start Test', sTCB), vc('FAIL','FAIL'), Paragraph('3', sTC)],
            [Paragraph('Secrets & Credentials', sTCB), vc('FAIL','FAIL'), Paragraph('5', sTC)],
            [Paragraph('Per-Phase Verification', sTCB), vc('FAIL','FAIL'), Paragraph('4', sTC)],
            [Paragraph('Chaos / Resilience Tests', sTCB), vc('SKIP','SKIP'), Paragraph('N/A', sTC)],
            [Paragraph('Scope-Drift Check', sTCB), vc('FAIL','FAIL'), Paragraph('3', sTC)],
            [Paragraph('Documentation Accuracy', sTCB), vc('FAIL','FAIL'), Paragraph('6', sTC)],
            [Paragraph('Legal / Compliance', sTCB), vc('SKIP','SKIP'), Paragraph('N/A', sTC)],
            [Paragraph('Cost / Budget Sanity', sTCB), vc('WARN','WARN'), Paragraph('1', sTC)],
        ],
        [CONTENT_W*0.40, CONTENT_W*0.20, CONTENT_W*0.40]
    ))

    # === 2. BUILD_STATE.md ===
    S.append(Paragraph('2. BUILD_STATE.md Reality Check', sH1))
    S.append(Paragraph('2.1 Current Phase Mismatch', sH2))
    S.append(Paragraph('BUILD_STATE.md declares "Phase 10 - Approval Workflow and Human-in-the-Loop (COMPLETED)" as the current phase. However, the document makes no mention of Phase 9 (Opportunity Engine), Phase 11 (API/SDK), or Phase 12 (Hardening). These phases are not listed as completed, pending, or deferred. The "Known Failures / Blockers" section also fails to acknowledge their absence. For a release audit, the BUILD_STATE.md must honestly reflect the true state of the project, including phases that were skipped or remain unimplemented. The Architecture Decisions Log contains entries through Phase 10 but has no notation indicating phases 9, 11, or 12 were deliberately skipped, which undermines the document as a reliable source of truth.', sBody))
    S.append(Paragraph('2.2 File Structure Stale at Phase 7', sH2))
    S.append(Paragraph('The "File Structure" section in BUILD_STATE.md (lines 255-365) was frozen after Phase 7. It does not list any files from Phase 8 (MCP/Plugins), Phase 10 (Approvals/Authorization), or the mobile app shell. Specifically missing: all MCP files under src/mcp/ (mcpClient.ts, types.ts, transports.ts, pluginManager.ts), the approval system (approvalGate.ts, approvalService.ts, capabilityRegistry.ts), approval route and UI component, test files for phases 8 and 10, and the entire mini-services/openjarvis-mobile/ directory with approximately 30+ React Native files. The test count is also wrong: claimed 258, actual 289 (31 extra from phase10-auth-model.test.ts).', sBody))

    # === 3. COLD-START ===
    S.append(Paragraph('3. Cold-Start Test', sH1))
    S.append(Paragraph('The cold-start test simulates what a new developer would experience when cloning the repository and attempting to run the application for the first time. This is the single most important test in the audit, because if a stranger cannot get the app running by following the provided documentation, nothing else matters.', sBody))
    S.append(Paragraph('3.1 Documentation Availability', sH2))
    S.append(Paragraph('The audit found no README.md, INSTALLATION.md, or QUICKSTART.md at the project root. The only documentation is BUILD_STATE.md, a build tracker, not a setup guide. A new developer would have no instructions for installing dependencies, setting up the database, or starting the server. The .env.example file referenced in the Phase 0 acceptance checklist (".env.example exists and matches what the code actually reads") does not exist anywhere in the repository, making this checklist item demonstrably false. This is a complete cold-start failure.', sBody))
    S.append(Paragraph('3.2 Database Migration Gap', sH2))
    S.append(Paragraph('The Prisma migrations directory contains only 3 migration files: phase6_memory_enhancement, phase7_mobile_clients, and phase8_mcp_plugins. The base schema migrations covering the foundational tables (missions, mission_events, tools, memory_entries) from Phase 1 are missing. When prisma db push --force-reset is run, it syncs the full schema correctly, but prisma migrate status falsely reports "Database schema is up to date" because it only compares against the 3 known migrations. The start.sh script does not include a prisma migrate or prisma db push step, further compounding this issue. Without manual intervention, a fresh clone cannot set up the database correctly.', sBody))
    S.append(Paragraph('3.3 Server Boot Result', sH2))
    S.append(Paragraph('Despite documentation and migration issues, the server boots successfully when dependencies are installed and the database schema is synced manually. The Express API starts on port 3001, the WebSocket server starts on port 3002, and the /health endpoint returns a healthy status with real database connectivity (latency: 5-8ms). The server handles SIGTERM gracefully. However, reaching this point requires knowledge that is not documented anywhere in the repository.', sBody))

    # === 4. SECRETS ===
    S.append(Paragraph('4. Secrets and Credentials Audit', sH1))
    S.append(Paragraph('A comprehensive scan of the entire repository for hardcoded API keys, tokens, connection strings, and passwords found no secrets embedded in source code. All sensitive configuration correctly uses process.env references. However, several critical security issues were identified in how secrets are managed and how authentication is implemented.', sBody))
    S.append(tbl(
        ['#', 'Severity', 'Issue', 'Location'],
        [
            [Paragraph('1', sTC), vc('CRITICAL','FAIL'), Paragraph('.env tracked in git despite .gitignore rule. Was committed before the rule was added, so git continues tracking it.', sTC), Paragraph('.env, .gitignore', sSmall)],
            [Paragraph('2', sTC), vc('CRITICAL','FAIL'), Paragraph('SQLite .db files tracked in git. dev.db contains MobileClient table with plaintext API keys.', sTC), Paragraph('prisma/dev.db', sSmall)],
            [Paragraph('3', sTC), vc('CRITICAL','FAIL'), Paragraph('Mobile API keys stored in plaintext (not hashed). No hashing library in dependencies.', sTC), Paragraph('schema.prisma:107', sSmall)],
            [Paragraph('4', sTC), vc('CRITICAL','FAIL'), Paragraph('All core API routes have zero authentication. /agent/run can trigger AI execution consuming paid API credits.', sTC), Paragraph('index.ts', sSmall)],
            [Paragraph('5', sTC), vc('CRITICAL','FAIL'), Paragraph('Admin routes (/mobile/admin/*) have no authentication. Anyone can regenerate API keys.', sTC), Paragraph('mobileAdmin.ts', sSmall)],
            [Paragraph('6', sTC), vc('HIGH','FAIL'), Paragraph('WebSocket server has no auth and uses CORS origin: *. Any client can subscribe to events.', sTC), Paragraph('index.ts:58-68', sSmall)],
            [Paragraph('7', sTC), vc('MEDIUM','WARN'), Paragraph('No .env.example file exists. Required env vars are undocumented.', sTC), Paragraph('Project root', sSmall)],
            [Paragraph('8', sTC), vc('MEDIUM','WARN'), Paragraph('No rate limiting on mobile registration endpoint.', sTC), Paragraph('routes/mobile.ts', sSmall)],
        ],
        [CONTENT_W*0.05, CONTENT_W*0.10, CONTENT_W*0.58, CONTENT_W*0.27]
    ))
    S.append(Spacer(1, 4*mm))
    S.append(Paragraph('The positive finding is that no API keys or tokens are reachable from browser devtools. The frontend API client sends only Content-Type headers with no authentication tokens. However, the complete absence of authentication on all API routes is a critical security gap that must be addressed before any public release, even for a single-user self-hosted system.', sBody))

    # === 5. PER-PHASE ===
    S.append(Paragraph('5. Per-Phase Re-Verification', sH1))
    S.append(Paragraph('Each phase was re-verified against the actual running application, not trusted from the original session. All 289 unit tests pass when the database schema is properly synced. Live API endpoint tests confirm core functionality is working. However, several structural issues were found that cause runtime failures in specific scenarios.', sBody))
    S.append(Paragraph('5.1 Unit Test Results', sH2))
    S.append(tbl(
        ['Test Suite', 'Tests', 'Pass', 'Fail', 'Verdict'],
        [
            [Paragraph('Phase 1 - Foundation', sTC), Paragraph('23', sTC), Paragraph('23', sTC), Paragraph('0', sTC), vc('ALL PASS','PASS')],
            [Paragraph('Phase 2 - Agent Runtime', sTC), Paragraph('23', sTC), Paragraph('23', sTC), Paragraph('0', sTC), vc('ALL PASS','PASS')],
            [Paragraph('Phase 4 - Computer Control', sTC), Paragraph('23', sTC), Paragraph('23', sTC), Paragraph('0', sTC), vc('ALL PASS','PASS')],
            [Paragraph('Phase 5 - Voice', sTC), Paragraph('41', sTC), Paragraph('41', sTC), Paragraph('0', sTC), vc('ALL PASS','PASS')],
            [Paragraph('Phase 6 - Memory', sTC), Paragraph('46', sTC), Paragraph('46', sTC), Paragraph('0', sTC), vc('ALL PASS','PASS')],
            [Paragraph('Phase 7 - Mobile', sTC), Paragraph('22', sTC), Paragraph('22', sTC), Paragraph('0', sTC), vc('ALL PASS','PASS')],
            [Paragraph('Phase 8 - MCP/Plugins', sTC), Paragraph('36', sTC), Paragraph('36', sTC), Paragraph('0', sTC), vc('ALL PASS','PASS')],
            [Paragraph('Phase 10 - Approvals', sTC), Paragraph('44', sTC), Paragraph('44', sTC), Paragraph('0', sTC), vc('ALL PASS','PASS')],
            [Paragraph('Phase 10 - Auth Model', sTC), Paragraph('31', sTC), Paragraph('31', sTC), Paragraph('0', sTC), vc('ALL PASS','PASS')],
            [Paragraph('TOTAL', sTCB), Paragraph('289', sTCB), Paragraph('289', sTCB), Paragraph('0', sTCB), vc('100% PASS','PASS')],
        ],
        [CONTENT_W*0.34, CONTENT_W*0.12, CONTENT_W*0.12, CONTENT_W*0.12, CONTENT_W*0.30]
    ))
    S.append(Spacer(1, 4*mm))
    S.append(Paragraph('5.2 Critical Phase Issues', sH2))
    S.append(Paragraph('Dual Permission System Conflict (Phase 4 vs Phase 10)', sH3))
    S.append(Paragraph('The most significant per-phase finding is a dual permission system conflict. Phase 4 introduced an in-memory PermissionManager with a binary granted/not-granted model. Phase 10 introduced a DB-backed CapabilityRegistry implementing the Authorization Model spec with three states (allowed/denied/undefined). The agent loop calls checkApprovalGate() which uses the DB-backed system. However, all 17 computer-control tool files also call getPermissionManager().check() inside their execute() method. This means a capability granted in the DB will be approved by the agent loop but then immediately refused by the tool itself, because the two systems do not share state. Granting a capability in the database does not grant it in the in-memory PermissionManager.', sBody))
    S.append(Paragraph('filesystem_delete Permanently Broken', sH3))
    S.append(Paragraph('The filesystem_delete tool contains a hardcoded block at lines 166-172 of filesystem.ts that always returns a requires_approval error with the message "Filesystem delete requires human approval via the approval queue (Phase 9)". This code was written as a placeholder during Phase 4, anticipating that Phase 9 would provide the approval queue. Now that Phase 10 has implemented the approval system, this hardcoded block was never removed. The result is that filesystem_delete is permanently non-functional regardless of permission grants or approvals.', sBody))
    S.append(Paragraph('Missing Phases: 9, 11, 12', sH3))
    S.append(Paragraph('Phase 9 (Opportunity Engine / Approvals for spending), Phase 11 (API/SDK with rate limiting), and Phase 12 (Hardening with chaos tests) have zero implementation in the codebase. No test files, no source code, no route definitions, and no acknowledgment in BUILD_STATE.md. The opportunity engine concept (spending scoring, discovery sources, approval-for-spend) is entirely absent. No SDK client library, no rate limiting middleware, no chaos test suite, no circuit breakers, and no graceful degradation code exists anywhere in the repository.', sBody))

    # === 6. CHAOS ===
    S.append(Paragraph('6. Chaos and Resilience Tests', sH1))
    S.append(Paragraph('The checklist requires six specific chaos tests: DB disconnection mid-mission, backend process kill mid-tool-call, network disconnect mid-voice-session, malformed tool response, worker restart mid-mission, and duplicate event processing. None of these tests have been implemented. The entire Phase 12 (Hardening) is absent from the codebase. There are no circuit breakers, no graceful degradation mechanisms, no retry logic for database connections, and no duplicate detection for webhooks or messages. The agent loop is synchronous and will crash if the database connection is lost mid-execution. Mission state is not checkpointed, so a process kill would lose the current execution context. WebSocket connections do not have reconnection logic with state recovery. All six chaos tests are marked as SKIP.', sBody))

    # === 7. SCOPE DRIFT ===
    S.append(Paragraph('7. Scope-Drift Check', sH1))
    S.append(Paragraph('7.1 Memory Operations Completeness', sH2))
    S.append(Paragraph('The memory system (Phase 6) implements most required operations at the database level via Prisma. Create, read, search, update, delete, recall, forget, associations, consolidation, and purge are all fully functional and verified through 46 passing tests. However, two operations are missing: "export" (bulk download of memory entries in a structured format) and "disable/deactivate" (temporarily disabling a memory entry without deleting it). Neither has a service method, route endpoint, or UI control.', sBody))
    S.append(Paragraph('7.2 Approval-Required Actions at Tool Layer', sH2))
    S.append(Paragraph('The approval gate (Phase 10) is called by the agent loop before every tool execution, which correctly enforces approval requirements at the execution layer. However, the dual permission system issue (Section 5.2) means that computer-control tools have a second, independent permission check inside their execute() method that uses the Phase 4 in-memory system. This creates a gap where the approval gate might approve an action but the tool itself refuses it. The approval system is architecturally correct but operationally broken for 17 tools.', sBody))
    S.append(Paragraph('7.3 UI vs. Backend Consistency', sH2))
    S.append(Paragraph('The dashboard has 5 tabs (Missions, Tools, Memory, Settings, Approvals) that correspond to real backend endpoints. No fake or placeholder components were found. However, the capability grant management system has full backend CRUD endpoints and corresponding frontend API client functions in openjarvis-api.ts, but no UI component exposes these capabilities to the admin. This means the Authorization Model ("The admin is the policy") cannot be managed through the UI, a significant gap for the stated design goal.', sBody))
    S.append(Paragraph('7.4 Structured Error Format Consistency', sH2))
    S.append(Paragraph('The structured error format {error: {code, message, requestId}} is used correctly across most routes via the centralized error handler middleware. All routes that throw AppError get properly formatted responses. The exception is voice.ts, which uses inline res.status().json({error: {...}}) at 14 separate error points instead of throwing AppError. While the output format is identical, these inline responses bypass the error handler, meaning errors are not logged via logger.error(), the isOperational flag is not set, and stack traces are not captured for debugging.', sBody))

    # === 8. DOCS ===
    S.append(Paragraph('8. Documentation Accuracy', sH1))
    S.append(Paragraph('Documentation drift is severe. The audit checked for README, QUICKSTART, INSTALLATION, ARCHITECTURE, CONFIGURATION, SECURITY, TROUBLESHOOTING, and API documentation. None exist as standalone documents. The only documentation is BUILD_STATE.md, which serves as a combined build tracker, architecture log, and file structure reference, but it is stale and incomplete.', sBody))
    S.append(tbl(
        ['Document', 'Exists', 'Accurate', 'Issue'],
        [
            [Paragraph('README.md', sTCB), vc('NO','FAIL'), vc('N/A','SKIP'), Paragraph('No project README', sTC)],
            [Paragraph('QUICKSTART.md', sTCB), vc('NO','FAIL'), vc('N/A','SKIP'), Paragraph('No quickstart guide', sTC)],
            [Paragraph('INSTALLATION.md', sTCB), vc('NO','FAIL'), vc('N/A','SKIP'), Paragraph('No installation guide', sTC)],
            [Paragraph('ARCHITECTURE.md', sTCB), vc('NO','FAIL'), vc('N/A','SKIP'), Paragraph('Only in BUILD_STATE.md (stale)', sTC)],
            [Paragraph('CONFIGURATION.md', sTCB), vc('NO','FAIL'), vc('N/A','SKIP'), Paragraph('No env var documentation', sTC)],
            [Paragraph('SECURITY.md', sTCB), vc('NO','FAIL'), vc('N/A','SKIP'), Paragraph('No security documentation', sTC)],
            [Paragraph('TROUBLESHOOTING.md', sTCB), vc('NO','FAIL'), vc('N/A','SKIP'), Paragraph('No troubleshooting guide', sTC)],
            [Paragraph('API docs', sTCB), vc('NO','FAIL'), vc('N/A','SKIP'), Paragraph('No OpenAPI/Swagger spec', sTC)],
            [Paragraph('LICENSE', sTCB), vc('NO','FAIL'), vc('N/A','SKIP'), Paragraph('No project-root LICENSE file', sTC)],
            [Paragraph('.env.example', sTCB), vc('NO','FAIL'), vc('N/A','SKIP'), Paragraph('Claimed in Phase 0 but missing', sTC)],
        ],
        [CONTENT_W*0.22, CONTENT_W*0.12, CONTENT_W*0.15, CONTENT_W*0.51]
    ))
    S.append(Spacer(1, 4*mm))
    S.append(Paragraph('Environment variables actually used by the code: DATABASE_URL, PORT, WS_PORT, GEMINI_API_KEY, GROQ_API_KEY, VOICE_PROVIDER, APPROVAL_TTL_SECONDS, LOG_LEVEL. BUILD_STATE.md additionally mentions VOICE_LANGUAGE, VOICE_TTS_VOICE, and VOICE_MAX_AUDIO_SIZE, but these were not found in the actual source code, suggesting they were planned but never implemented.', sBody))

    # === 9. LEGAL ===
    S.append(Paragraph('9. Legal and Compliance Spot-Check', sH1))
    S.append(Paragraph('The legal and compliance checks are largely not applicable because the critical phases containing the relevant features have not been implemented. Telephony (Phase 10 in the checklist) does not exist: no Twilio integration, no consent management, no do-not-call list checking, no AI-disclosure logic. The opportunity engine (Phase 9) that would handle discovery source compliance has zero implementation. The only compliance-relevant finding is the absence of a project-root LICENSE file. BUILD_STATE.md mentions MIT license per the phase spec, but only the mobile sub-project has a license file. All other legal checks are marked as SKIP.', sBody))

    # === 10. COST ===
    S.append(Paragraph('10. Cost and Budget Sanity Check', sH1))
    S.append(Paragraph('The budget cap system (Phase 2) is implemented and tested: missions track token usage and tool call counts, and the agent loop halts to "blocked" status when either limit is exceeded. However, a full end-to-end test with real API calls cannot be performed because no GEMINI_API_KEY or GROQ_API_KEY is available in this environment. The approval system (Phase 10) adds a secondary spending control layer by requiring human approval for certain tool executions, but the dual permission system conflict means this is not functioning correctly for computer-control tools. There is no mechanism to track cumulative spending across missions or enforce a global spending limit.', sBody))

    # === 11. OPEN ISSUES ===
    S.append(Paragraph('11. Open Issues Log', sH1))
    S.append(Paragraph('The following table tracks all issues discovered during this audit. No v1.0 release should be tagged until this log is empty or every remaining item is explicitly deferred with documented reasoning.', sBody))
    issues = [
        ['1', '2.1', 'Phase 9, 11, 12 missing from BUILD_STATE.md', 'HIGH', 'OPEN'],
        ['2', '2.2', 'File Structure section frozen at Phase 7', 'MEDIUM', 'OPEN'],
        ['3', '2.3', 'Test count claimed 258, actual 289', 'LOW', 'OPEN'],
        ['4', '3.1', 'No README, INSTALLATION, or QUICKSTART docs', 'CRITICAL', 'OPEN'],
        ['5', '3.1', '.env.example does not exist (claimed in Phase 0)', 'CRITICAL', 'OPEN'],
        ['6', '3.2', 'Base schema migrations missing (Phase 1-4 tables)', 'HIGH', 'OPEN'],
        ['7', '3.2', 'start.sh does not run prisma migrate/db push', 'MEDIUM', 'OPEN'],
        ['8', '4', '.env tracked in git', 'CRITICAL', 'OPEN'],
        ['9', '4', 'SQLite .db files tracked in git (plaintext API keys)', 'CRITICAL', 'OPEN'],
        ['10', '4', 'Mobile API keys stored in plaintext, not hashed', 'CRITICAL', 'OPEN'],
        ['11', '4', 'All core API routes have zero authentication', 'CRITICAL', 'OPEN'],
        ['12', '4', 'Admin routes have zero authentication', 'CRITICAL', 'OPEN'],
        ['13', '4', 'WebSocket has no auth, CORS allows all origins', 'HIGH', 'OPEN'],
        ['14', '4', 'No rate limiting on mobile registration', 'MEDIUM', 'OPEN'],
        ['15', '5.2', 'Dual permission systems: Phase 4 vs Phase 10', 'CRITICAL', 'OPEN'],
        ['16', '5.2', 'filesystem_delete permanently broken (Phase 9 block)', 'CRITICAL', 'OPEN'],
        ['17', '5.2', 'Phase 9 (Opportunity Engine) not implemented', 'HIGH', 'OPEN'],
        ['18', '5.2', 'Phase 11 (API/SDK) not implemented', 'HIGH', 'OPEN'],
        ['19', '5.2', 'Phase 12 (Hardening) not implemented', 'HIGH', 'OPEN'],
        ['20', '6', 'No chaos/resilience tests exist', 'HIGH', 'OPEN'],
        ['21', '7.1', 'Memory export and disable operations missing', 'LOW', 'OPEN'],
        ['22', '7.3', 'Capability grant management has no UI', 'MEDIUM', 'OPEN'],
        ['23', '7.4', 'Voice routes bypass error handler (14 points)', 'MEDIUM', 'OPEN'],
        ['24', '8', 'No project-root LICENSE file', 'MEDIUM', 'OPEN'],
        ['25', '8', '3 env vars in BUILD_STATE not in code', 'LOW', 'OPEN'],
        ['26', '9', 'Telephony, DNC, AI-disclosure not implemented', 'HIGH', 'OPEN'],
        ['27', '10', 'No E2E budget verification (no API keys)', 'MEDIUM', 'OPEN'],
    ]
    issue_rows = []
    for row in issues:
        issue_rows.append([Paragraph(row[0], sTC), Paragraph(row[1], sTC), Paragraph(row[2], sTC), vc(row[3], row[3]), vc(row[4], 'FAIL')])
    S.append(tbl(
        ['#', 'Section', 'Issue', 'Severity', 'Status'],
        issue_rows,
        [CONTENT_W*0.05, CONTENT_W*0.09, CONTENT_W*0.48, CONTENT_W*0.13, CONTENT_W*0.12]
    ))

    # === 12. VERDICT ===
    S.append(Paragraph('12. Final Verdict', sH1))
    S.append(Paragraph('Based on the comprehensive audit presented in this report, the OpenJarvis project is <b>NOT ready for v1.0 release</b>. While the engineering quality of the implemented phases is solid (289/289 tests pass, clean architecture, proper separation of concerns), the project has critical gaps in documentation, security, and completeness that collectively prevent a release tag.', sBody))
    S.append(Paragraph('The three most impactful blocker categories are: (1) the complete absence of onboarding documentation, which means no new user can get the application running; (2) the authentication gap on all API routes, which is unacceptable even for a self-hosted single-user system because it exposes the agent execution pipeline to any network-adjacent attacker; and (3) the dual permission system conflict, which makes 17 computer-control tools non-functional despite both permission systems individually passing their tests.', sBody))
    S.append(Paragraph('The missing phases (9, 11, 12) represent significant feature gaps but could potentially be deferred with explicit documentation if the admin decides they are not required for the initial release. However, the BUILD_STATE.md must be updated to acknowledge these deferrals with documented rationale before any release is considered.', sBody))
    vd = [[Paragraph(
        '<b>VERDICT: NOT READY FOR RELEASE</b><br/><br/>'
        '27 open issues (7 Critical, 8 High, 8 Medium, 4 Low)<br/>'
        '3 missing phases (9, 11, 12) unacknowledged<br/>'
        '0 cold-start documentation files<br/>'
        '0 authenticated API routes<br/><br/>'
        'Recommended: Address all CRITICAL issues, create minimum documentation '
        '(README + .env.example), resolve the dual permission system, then re-run this audit.',
        ParagraphStyle('v', fontName='NotoSerifSC', fontSize=10, leading=15, textColor=SEM_ERROR)
    )]]
    vt = Table(vd, colWidths=[CONTENT_W])
    vt.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), colors.HexColor('#fdf2f2')),
        ('BOX', (0,0), (-1,-1), 1.5, SEM_ERROR),
        ('LEFTPADDING', (0,0), (-1,-1), 12), ('RIGHTPADDING', (0,0), (-1,-1), 12),
        ('TOPPADDING', (0,0), (-1,-1), 10), ('BOTTOMPADDING', (0,0), (-1,-1), 10),
    ]))
    S.append(Spacer(1, 6*mm))
    S.append(vt)

    doc.build(S)
    print(f'PDF generated: {OUTPUT}')

if __name__ == '__main__':
    build()
