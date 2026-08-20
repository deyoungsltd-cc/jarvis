/**
 * Phase 16 — Service Catalog
 *
 * Static registry of all 20 Sovereign Stack services with metadata.
 * This is the source of truth for what services exist, their
 * resource profiles, Docker images, and deployment groups.
 *
 * Services are seeded into the DB on first run via serviceManager.seed().
 */

export interface ServiceDefinition {
  name: string;            // unique slug: "immich", "vaultwarden", etc.
  displayName: string;     // human-readable: "Immich (Google Photos)"
  group: 'A' | 'B' | 'C' | 'D';
  repoUrl: string;         // GitHub repo
  replaces: string;        // what it replaces
  hostname: string;        // Caddy internal hostname
  serviceName: string;     // docker-compose service name
  imageTag: string;        // default image:tag
  healthUrl?: string;      // container-internal health endpoint
  healthCheckCmd?: string; // docker healthcheck command override
  resourceWeight: 'lightweight' | 'moderate' | 'heavy' | 'on-demand';
  ramEstimateMB: number;   // estimated steady-state RAM usage
  cpuCores: number;        // typical CPU cores used
  diskEstimateGB: number;  // estimated disk footprint
  port: number;            // internal container port
  mobileApp?: string;      // official mobile app name (if any)
  mobileAppNote?: string;  // pairing instructions
  backupPriority: 'daily' | 'weekly' | 'manual';
  backupVolumes: string[]; // docker volume names to back up
  notes?: string;          // special considerations
}

/**
 * All 20 services organized by deployment group.
 * Resource estimates are conservative for the default/typical config.
 */
export const SERVICE_CATALOG: ServiceDefinition[] = [
  // ===== Group A — Apps Big Tech Sells You =====
  {
    name: 'stirling-pdf',
    displayName: 'Stirling-PDF (Adobe Acrobat)',
    group: 'A',
    repoUrl: 'https://github.com/Stirling-Tools/Stirling-PDF',
    replaces: 'Adobe Acrobat',
    hostname: 'pdf.internal',
    serviceName: 'stirling-pdf',
    imageTag: 'frooodle/s-pdf:latest',
    healthUrl: 'http://stirling-pdf:8080/api/v1/info',
    resourceWeight: 'moderate',
    ramEstimateMB: 1024,
    cpuCores: 1,
    diskEstimateGB: 2,
    port: 8080,
    backupPriority: 'weekly',
    backupVolumes: ['stirling-pdf_config', 'stirling-pdf_customFiles', 'stirling-pdf_logs'],
  },
  {
    name: 'immich',
    displayName: 'Immich (Google Photos)',
    group: 'A',
    repoUrl: 'https://github.com/immich-app/immich',
    replaces: 'Google Photos',
    hostname: 'photos.internal',
    serviceName: 'immich-server',
    imageTag: 'ghcr.io/immich-app/immich-server:v1.106.3',
    healthUrl: 'http://immich-server:2283/api/server-info',
    resourceWeight: 'moderate',
    ramEstimateMB: 1024,
    cpuCores: 2,
    diskEstimateGB: 50,
    port: 2283,
    mobileApp: 'Immich',
    mobileAppNote: 'Set server URL to https://photos.internal (via Tailscale). Login with your Immich credentials.',
    backupPriority: 'daily',
    backupVolumes: ['immich_postgres_data', 'immich_upload', 'immich_redis_data'],
  },
  {
    name: 'upscayl',
    displayName: 'Upscayl (Topaz)',
    group: 'A',
    repoUrl: 'https://github.com/upscayl/upscayl',
    replaces: 'Topaz',
    hostname: 'upscayl.internal',
    serviceName: 'upscayl',
    imageTag: 'jlongstreth/upscayl-docker:latest',
    resourceWeight: 'on-demand',
    ramEstimateMB: 2048,
    cpuCores: 2,
    diskEstimateGB: 5,
    port: 8080,
    backupPriority: 'manual',
    backupVolumes: [],
    notes: 'CPU/GPU heavy during upscaling. Best run on-demand rather than always-on. No persistent data to back up.',
  },
  {
    name: 'whisper',
    displayName: 'Whisper (Otter.ai)',
    group: 'A',
    repoUrl: 'https://github.com/openai/whisper',
    replaces: 'Otter.ai',
    hostname: 'whisper.internal',
    serviceName: 'whisper',
    imageTag: 'ahmetoner/whisper-asr-webservice:latest',
    healthUrl: 'http://whisper:9000/',
    resourceWeight: 'on-demand',
    ramEstimateMB: 2048,
    cpuCores: 2,
    diskEstimateGB: 5,
    port: 9000,
    backupPriority: 'manual',
    backupVolumes: [],
    notes: 'GPU recommended for real-time transcription. CPU mode is slow but functional. No persistent data.',
  },
  {
    name: 'localsend',
    displayName: 'LocalSend (AirDrop)',
    group: 'A',
    repoUrl: 'https://github.com/localsend/localsend',
    replaces: 'AirDrop',
    hostname: 'localsend.internal',
    serviceName: 'localsend',
    imageTag: 'localsend/localsend:latest',
    resourceWeight: 'lightweight',
    ramEstimateMB: 64,
    cpuCores: 0.5,
    diskEstimateGB: 1,
    port: 5333,
    mobileApp: 'LocalSend',
    mobileAppNote: 'No server pairing needed — discovers peers on the same network/Tailscale mesh automatically.',
    backupPriority: 'manual',
    backupVolumes: [],
    notes: 'Peer-to-peer file transfer. No server-side data persistence. Mobile app auto-discovers.',
  },

  // ===== Group B — AI Busywork Tools =====
  {
    name: 'audiblez',
    displayName: 'Audiblez (Audible)',
    group: 'B',
    repoUrl: 'https://github.com/santinic/audiblez',
    replaces: 'Audible',
    hostname: 'audiblez.internal',
    serviceName: 'audiblez',
    imageTag: 'santinic/audiblez:latest',
    resourceWeight: 'on-demand',
    ramEstimateMB: 1024,
    cpuCores: 2,
    diskEstimateGB: 5,
    port: 8000,
    backupPriority: 'manual',
    backupVolumes: ['audiblez_output'],
    notes: 'Text-to-audiobook conversion. CPU intensive during generation.',
  },
  {
    name: 'rembg',
    displayName: 'Rembg (remove.bg)',
    group: 'B',
    repoUrl: 'https://github.com/danielgatis/rembg',
    replaces: 'remove.bg',
    hostname: 'rembg.internal',
    serviceName: 'rembg',
    imageTag: 'danielgatis/rembg:latest',
    healthUrl: 'http://rembg:5000/',
    resourceWeight: 'on-demand',
    ramEstimateMB: 1024,
    cpuCores: 1,
    diskEstimateGB: 2,
    port: 5000,
    backupPriority: 'manual',
    backupVolumes: [],
    notes: 'Background removal API. Stateless — processes images in-memory.',
  },
  {
    name: 'spleeter',
    displayName: 'Spleeter (Moises)',
    group: 'B',
    repoUrl: 'https://github.com/deezer/spleeter',
    replaces: 'Moises',
    hostname: 'spleeter.internal',
    serviceName: 'spleeter',
    imageTag: 'ghcr.io/spleeter-web/spleeter-api:latest',
    resourceWeight: 'on-demand',
    ramEstimateMB: 1024,
    cpuCores: 2,
    diskEstimateGB: 2,
    port: 8082,
    backupPriority: 'manual',
    backupVolumes: ['spleeter_output'],
    notes: 'Audio stem separation. CPU intensive. Output volumes should be cleaned periodically.',
  },
  {
    name: 'pyvideotrans',
    displayName: 'pyVideoTrans (HeyGen Dubbing)',
    group: 'B',
    repoUrl: 'https://github.com/jianchang512/pyvideotrans',
    replaces: 'HeyGen dubbing',
    hostname: 'videotrans.internal',
    serviceName: 'pyvideotrans',
    imageTag: 'jianchang512/pyvideotrans:latest',
    resourceWeight: 'heavy',
    ramEstimateMB: 2048,
    cpuCores: 2,
    diskEstimateGB: 10,
    port: 19090,
    backupPriority: 'weekly',
    backupVolumes: ['pyvideotrans_data'],
    notes: 'Video translation/dubbing. Requires significant GPU for real-time processing.',
  },
  {
    name: 'ocrmypdf',
    displayName: 'OCRmyPDF (Adobe Scan)',
    group: 'B',
    repoUrl: 'https://github.com/ocrmypdf/OCRmyPDF',
    replaces: 'Adobe Scan',
    hostname: 'ocr.internal',
    serviceName: 'ocrmypdf',
    imageTag: 'ocrmypdf/ocrmypdf-webservice:latest',
    healthUrl: 'http://ocrmypdf:5000/',
    resourceWeight: 'on-demand',
    ramEstimateMB: 512,
    cpuCores: 1,
    diskEstimateGB: 1,
    port: 5000,
    backupPriority: 'manual',
    backupVolumes: [],
    notes: 'PDF OCR processing. Stateless service.',
  },

  // ===== Group C — Data Sovereignty =====
  {
    name: 'vaultwarden',
    displayName: 'Vaultwarden (1Password)',
    group: 'C',
    repoUrl: 'https://github.com/dani-garcia/vaultwarden',
    replaces: '1Password',
    hostname: 'vault.internal',
    serviceName: 'vaultwarden',
    imageTag: 'vaultwarden/server:latest',
    healthUrl: 'http://vaultwarden:80/alive',
    resourceWeight: 'lightweight',
    ramEstimateMB: 64,
    cpuCores: 0.25,
    diskEstimateGB: 1,
    port: 80,
    mobileApp: 'Bitwarden',
    mobileAppNote: 'Use the official Bitwarden mobile app. Set server URL to https://vault.internal (via Tailscale).',
    backupPriority: 'daily',
    backupVolumes: ['vaultwarden_data'],
  },
  {
    name: 'nextcloud',
    displayName: 'Nextcloud (Google Drive)',
    group: 'C',
    repoUrl: 'https://github.com/nextcloud/server',
    replaces: 'Google Drive',
    hostname: 'cloud.internal',
    serviceName: 'nextcloud',
    imageTag: 'docker.io/library/nextcloud:30-apache',
    healthUrl: 'http://nextcloud:80/status.php',
    resourceWeight: 'moderate',
    ramEstimateMB: 512,
    cpuCores: 1,
    diskEstimateGB: 20,
    port: 80,
    mobileApp: 'Nextcloud',
    mobileAppNote: 'Use the official Nextcloud mobile app. Set server URL to https://cloud.internal (via Tailscale).',
    backupPriority: 'daily',
    backupVolumes: ['nextcloud_data', 'nextcloud_db', 'nextcloud_apps'],
  },
  {
    name: 'pihole',
    displayName: 'Pi-hole (Network Ad Block)',
    group: 'C',
    repoUrl: 'https://github.com/pi-hole/pi-hole',
    replaces: 'Network-wide ad blocking',
    hostname: 'pihole.internal',
    serviceName: 'pihole',
    imageTag: 'pihole/pihole:latest',
    healthUrl: 'http://pihole:80/admin/api.php?status',
    resourceWeight: 'lightweight',
    ramEstimateMB: 128,
    cpuCores: 0.25,
    diskEstimateGB: 2,
    port: 80,
    backupPriority: 'weekly',
    backupVolumes: ['pihole_etc'],
    notes: 'Requires DNS configuration. Must be set as the DNS server for your network or individual devices.',
  },
  {
    name: 'homeassistant',
    displayName: 'Home Assistant (Google Home)',
    group: 'C',
    repoUrl: 'https://github.com/home-assistant/core',
    replaces: 'Google Home',
    hostname: 'home.internal',
    serviceName: 'homeassistant',
    imageTag: 'homeassistant/home-assistant:stable',
    healthUrl: 'http://homeassistant:8123/api/',
    resourceWeight: 'moderate',
    ramEstimateMB: 512,
    cpuCores: 1,
    diskEstimateGB: 5,
    port: 8123,
    mobileApp: 'Home Assistant',
    mobileAppNote: 'Use the official Home Assistant mobile app. Set server URL to https://home.internal (via Tailscale).',
    backupPriority: 'weekly',
    backupVolumes: ['homeassistant_config'],
    notes: 'EMPTY SHELL until real smart-home devices are added. Deploys cleanly but controls nothing yet.',
  },
  {
    name: 'searxng',
    displayName: 'SearXNG (Google Search)',
    group: 'C',
    repoUrl: 'https://github.com/searxng/searxng',
    replaces: 'Google Search',
    hostname: 'search.internal',
    serviceName: 'searxng',
    imageTag: 'searxng/searxng:latest',
    healthUrl: 'http://searxng:8080/search?q=test&format=json',
    resourceWeight: 'lightweight',
    ramEstimateMB: 128,
    cpuCores: 0.5,
    diskEstimateGB: 1,
    port: 8080,
    backupPriority: 'weekly',
    backupVolumes: ['searxng_data'],
    notes: 'SAME INSTANCE as Phase 14 research fallback. Deploy once here, reuse for web_search tool.',
  },

  // ===== Core AI — JARVIS Brain (Local Inference) =====
  {
    name: 'local-llm',
    displayName: 'Local LLM Brain (Ollama / LM Studio / MLX)',
    group: 'B',
    repoUrl: 'https://github.com/ollama/ollama',
    replaces: 'OpenAI / Claude / Gemini API (local, private, zero-cost)',
    hostname: 'llm.internal',
    serviceName: 'local-llm',
    imageTag: 'n/a (native process — not containerized)',
    healthUrl: 'http://localhost:11434/v1/models',
    resourceWeight: 'on-demand',
    ramEstimateMB: 16384,
    cpuCores: 8,
    diskEstimateGB: 20,
    port: 11434,
    backupPriority: 'manual',
    backupVolumes: [],
    notes: 'Cross-platform local inference. Windows/Linux/macOS via Ollama (port 11434), macOS Apple Silicon via mlx-vlm (port 8080), or LM Studio (port 1234). Auto-detects running server. Start: cd mini-services/local-llm && ./start-server.sh (or start-server.ps1 on Windows). Use provider="local" in POST /agent/run.',
  },

  // ===== Group D — Subscription Replacements =====
  {
    name: 'appflowy',
    displayName: 'AppFlowy (Notion)',
    group: 'D',
    repoUrl: 'https://github.com/AppFlowy-IO/AppFlowy',
    replaces: 'Notion',
    hostname: 'appflowy.internal',
    serviceName: 'appflowy',
    imageTag: 'appflowyio/appflowy_cloud:latest',
    resourceWeight: 'moderate',
    ramEstimateMB: 512,
    cpuCores: 1,
    diskEstimateGB: 5,
    port: 8000,
    backupPriority: 'weekly',
    backupVolumes: ['appflowy_data', 'appflowy_postgres'],
  },
  {
    name: 'calcom',
    displayName: 'Cal.com (Calendly)',
    group: 'D',
    repoUrl: 'https://github.com/calcom/cal.com',
    replaces: 'Calendly',
    hostname: 'calendar.internal',
    serviceName: 'calcom',
    imageTag: 'calcom/cal.com:latest',
    resourceWeight: 'moderate',
    ramEstimateMB: 512,
    cpuCores: 1,
    diskEstimateGB: 5,
    port: 3000,
    backupPriority: 'weekly',
    backupVolumes: ['calcom_postgres', 'calcom_data'],
  },
  {
    name: 'nocodb',
    displayName: 'NocoDB (Airtable)',
    group: 'D',
    repoUrl: 'https://github.com/nocodb/nocodb',
    replaces: 'Airtable',
    hostname: 'db.internal',
    serviceName: 'nocodb',
    imageTag: 'nocodb/nocodb:latest',
    healthUrl: 'http://nocodb:8080/api/v1/health',
    resourceWeight: 'moderate',
    ramEstimateMB: 512,
    cpuCores: 1,
    diskEstimateGB: 5,
    port: 8080,
    backupPriority: 'weekly',
    backupVolumes: ['nocodb_data'],
  },
  {
    name: 'listmonk',
    displayName: 'Listmonk (Mailchimp)',
    group: 'D',
    repoUrl: 'https://github.com/knadh/listmonk',
    replaces: 'Mailchimp',
    hostname: 'mail.internal',
    serviceName: 'listmonk',
    imageTag: 'docker.io/listmonk/listmonk:latest',
    healthUrl: 'http://listmonk:9000/api/health',
    resourceWeight: 'lightweight',
    ramEstimateMB: 128,
    cpuCores: 0.5,
    diskEstimateGB: 2,
    port: 9000,
    backupPriority: 'weekly',
    backupVolumes: ['listmonk_data', 'listmonk_postgres'],
  },
  {
    name: 'formbricks',
    displayName: 'Formbricks (Typeform)',
    group: 'D',
    repoUrl: 'https://github.com/formbricks/formbricks',
    replaces: 'Typeform',
    hostname: 'forms.internal',
    serviceName: 'formbricks',
    imageTag: 'ghcr.io/formbricks/formbricks:latest',
    healthUrl: 'http://formbricks:3000/api/v1/health',
    resourceWeight: 'moderate',
    ramEstimateMB: 512,
    cpuCores: 1,
    diskEstimateGB: 5,
    port: 3000,
    backupPriority: 'weekly',
    backupVolumes: ['formbricks_data', 'formbricks_postgres'],
  },
];

/** Resource weight totals for go/no-go analysis */
export function getResourceSummary() {
  const summary = { lightweight: 0, moderate: 0, heavy: 0, 'on-demand': 0 } as Record<string, ServiceDefinition[]>;
  let totalRam = 0;
  let totalDisk = 0;

  for (const svc of SERVICE_CATALOG) {
    if (!summary[svc.resourceWeight]) summary[svc.resourceWeight] = [];
    summary[svc.resourceWeight].push(svc);
    totalRam += svc.ramEstimateMB;
    totalDisk += svc.diskEstimateGB;
  }

  return {
    byWeight: summary,
    totalRamEstimateMB: totalRam,
    totalDiskEstimateGB: totalDisk,
    alwaysOnRamMB: SERVICE_CATALOG
      .filter(s => s.resourceWeight !== 'on-demand')
      .reduce((sum, s) => sum + s.ramEstimateMB, 0),
    onDemandRamMB: SERVICE_CATALOG
      .filter(s => s.resourceWeight === 'on-demand')
      .reduce((sum, s) => sum + s.ramEstimateMB, 0),
  };
}

export function getServicesByGroup(group: 'A' | 'B' | 'C' | 'D') {
  return SERVICE_CATALOG.filter(s => s.group === group);
}

export function getServiceDefinition(name: string): ServiceDefinition | undefined {
  return SERVICE_CATALOG.find(s => s.name === name);
}
