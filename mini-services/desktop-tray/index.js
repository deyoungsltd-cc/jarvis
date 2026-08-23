/**
 * OpenJARVIS Desktop Tray App (Windows)
 * 
 * System tray application that provides:
 * - Quick access to Dashboard (localhost:3000) and API (localhost:4000)
 * - Start/Stop JARVIS API server
 * - Start/Stop Local LLM
 * - Status indicators (green/yellow/red)
 * - System notifications
 * - Auto-start on boot support
 */

const { app, Tray, Menu, Notification, nativeImage, BrowserWindow } = require('electron');
const { spawn, execSync, exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const http = require('http');
const net = require('net');

// ---- Configuration ----
const CONFIG = {
  dashboardUrl: 'http://localhost:3000',
  apiUrl: 'http://localhost:3001',
  wsUrl: 'http://localhost:3002',
  healthCheckInterval: 15000,
  apiDir: path.resolve(__dirname, '..', 'openjarvis-api'),
  llmDir: path.resolve(__dirname, '..', 'local-llm'),
};

// ---- State ----
let tray = null;
let jarvisProcess = null;
let llmProcess = null;
let jarvisStatus = 'stopped'; // stopped | starting | running | error
let llmStatus = 'stopped';
let healthCheckTimer = null;

// ---- Icon Generation ----
// Generate a simple 16x16 icon with status color
function createTrayIcon(status) {
  // Create a simple canvas-based icon using a native image
  // We'll use a 16x16 PNG with a colored circle
  const size = 16;
  
  // Color based on status
  const colors = {
    stopped: [220, 50, 50],    // Red
    starting: [240, 180, 40],  // Yellow
    running: [50, 200, 80],    // Green
    error: [220, 50, 50],      // Red
  };
  
  const [r, g, b] = colors[status] || colors.stopped;
  
  // Create a minimal PNG with a colored circle
  // Using raw PNG generation for simplicity (no canvas dependency)
  const rgba = Buffer.alloc(size * size * 4);
  
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;
      const cx = x - size / 2 + 0.5;
      const cy = y - size / 2 + 0.5;
      const dist = Math.sqrt(cx * cx + cy * cy);
      const radius = size / 2 - 1;
      
      if (dist <= radius) {
        // Inside circle - fill with status color
        rgba[idx] = r;
        rgba[idx + 1] = g;
        rgba[idx + 2] = b;
        rgba[idx + 3] = 255;
      } else {
        // Outside circle - transparent
        rgba[idx] = 0;
        rgba[idx + 1] = 0;
        rgba[idx + 2] = 0;
        rgba[idx + 3] = 0;
      }
    }
  }
  
  // Try to load logo from the project, fall back to generated icon
  const logoPath = path.resolve(__dirname, '..', '..', 'public', 'logo.svg');
  if (fs.existsSync(logoPath)) {
    try {
      // If we have a nativeImage from the SVG, use it
      // Electron can handle SVG on some platforms
      const logoImg = nativeImage.createFromPath(logoPath);
      if (!logoImg.isEmpty()) {
        return logoImg;
      }
    } catch {
      // Fall through to generated icon
    }
  }
  
  return nativeImage.createFromBuffer(createPNGFromRGBA(rgba, size, size));
}

/**
 * Minimal PNG encoder - creates a valid PNG from RGBA pixel data
 */
function createPNGFromRGBA(rgba, width, height) {
  const zlib = require('zlib');
  
  // Add filter byte (0 = None) before each row
  const rawData = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    rawData[y * (1 + width * 4)] = 0; // Filter: None
    rgba.copy(
      rawData,
      y * (1 + width * 4) + 1,
      y * width * 4,
      (y + 1) * width * 4
    );
  }
  
  const compressed = zlib.deflateSync(rawData);
  
  // Build PNG file
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  
  // IHDR chunk
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8;  // bit depth
  ihdrData[9] = 6;  // color type: RGBA
  ihdrData[10] = 0; // compression
  ihdrData[11] = 0; // filter
  ihdrData[12] = 0; // interlace
  const ihdr = createChunk('IHDR', ihdrData);
  
  // IDAT chunk
  const idat = createChunk('IDAT', compressed);
  
  // IEND chunk
  const iend = createChunk('IEND', Buffer.alloc(0));
  
  return Buffer.concat([signature, ihdr, idat, iend]);
}

function createChunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  
  const typeBuffer = Buffer.from(type, 'ascii');
  const crcData = Buffer.concat([typeBuffer, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(crcData), 0);
  
  return Buffer.concat([length, typeBuffer, data, crc]);
}

function crc32(buf) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xEDB88320 : 0);
    }
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

// ---- Health Check ----
function checkHealth(host, port) {
  return new Promise((resolve) => {
    const req = http.get({ hostname: host, port, path: '/health', timeout: 5000 }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch { resolve(null); }
      });
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
  });
}

async function checkPort(port) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(2000);
    socket.on('connect', () => { socket.destroy(); resolve(true); });
    socket.on('timeout', () => { socket.destroy(); resolve(false); });
    socket.on('error', () => resolve(false));
    socket.connect(port, '127.0.0.1');
  });
}

async function updateStatusAndTray() {
  const prevJarvis = jarvisStatus;
  const prevLlm = llmStatus;

  // Check JARVIS API
  const apiUp = await checkPort(3001);
  if (jarvisStatus === 'starting') {
    if (apiUp) {
      jarvisStatus = 'running';
      showNotification('JARVIS Activated', 'The JARVIS API server is now running.');
    }
  } else if (jarvisStatus === 'running') {
    if (!apiUp) {
      jarvisStatus = 'stopped';
    }
  }

  // Check Local LLM
  const llmUp = await checkPort(11434);
  if (llmStatus === 'starting') {
    if (llmUp) {
      llmStatus = 'running';
      showNotification('Local LLM Started', 'The local LLM server is now running.');
    }
  } else if (llmStatus === 'running') {
    if (!llmUp) {
      llmStatus = 'stopped';
    }
  }

  // Rebuild tray if status changed
  if (prevJarvis !== jarvisStatus || prevLlm !== llmStatus) {
    rebuildTray();
  }
}

function startHealthChecks() {
  if (healthCheckTimer) clearInterval(healthCheckTimer);
  healthCheckTimer = setInterval(updateStatusAndTray, CONFIG.healthCheckInterval);
  // Run immediately
  updateStatusAndTray();
}

// ---- Notifications ----
function showNotification(title, body) {
  if (Notification.isSupported()) {
    const notif = new Notification({ title, body, silent: false });
    notif.show();
  }
}

// ---- Process Management ----
function startJarvis() {
  if (jarvisProcess) {
    showNotification('JARVIS', 'JARVIS is already running or starting.');
    return;
  }

  jarvisStatus = 'starting';
  rebuildTray();

  const apiDir = CONFIG.apiDir;
  const isWin = process.platform === 'win32';
  const cmd = isWin ? 'cmd' : 'bash';
  const args = isWin ? ['/c', 'bun', 'run', 'dev'] : ['-c', 'bun run dev'];

  jarvisProcess = spawn(cmd, args, {
    cwd: apiDir,
    stdio: ['pipe', 'pipe', 'pipe'],
    shell: false,
    env: { ...process.env },
  });

  jarvisProcess.stdout?.on('data', (data) => {
    console.log(`[JARVIS] ${data.toString().trim()}`);
  });

  jarvisProcess.stderr?.on('data', (data) => {
    console.error(`[JARVIS:ERR] ${data.toString().trim()}`);
  });

  jarvisProcess.on('exit', (code) => {
    console.log(`JARVIS process exited with code ${code}`);
    if (jarvisStatus === 'running' || jarvisStatus === 'starting') {
      jarvisStatus = 'stopped';
      showNotification('JARVIS Stopped', 'The JARVIS API server has stopped.');
    }
    jarvisProcess = null;
    rebuildTray();
  });

  jarvisProcess.on('error', (err) => {
    console.error(`JARVIS process error: ${err.message}`);
    jarvisStatus = 'error';
    jarvisProcess = null;
    rebuildTray();
  });
}

function stopJarvis() {
  if (!jarvisProcess) return;

  console.log('Stopping JARVIS...');
  if (process.platform === 'win32') {
    // On Windows, kill the process tree
    execSync(`taskkill /pid ${jarvisProcess.pid} /T /F`, { stdio: 'pipe' });
  } else {
    jarvisProcess.kill('SIGTERM');
  }
  jarvisProcess = null;
  jarvisStatus = 'stopped';
  showNotification('JARVIS Stopped', 'The JARVIS API server has been stopped.');
  rebuildTray();
}

function startLlm() {
  if (llmProcess) {
    showNotification('Local LLM', 'Local LLM is already running or starting.');
    return;
  }

  llmStatus = 'starting';
  rebuildTray();

  const llmDir = CONFIG.llmDir;
  const startScript = path.join(llmDir, 'start-server.ps1');

  if (process.platform === 'win32') {
    llmProcess = spawn('powershell', ['-ExecutionPolicy', 'Bypass', '-File', startScript], {
      cwd: llmDir,
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: false,
      env: { ...process.env },
    });
  } else {
    llmProcess = spawn('bash', ['start-server.sh'], {
      cwd: llmDir,
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: false,
      env: { ...process.env },
    });
  }

  llmProcess.stdout?.on('data', (data) => {
    console.log(`[LLM] ${data.toString().trim()}`);
  });

  llmProcess.stderr?.on('data', (data) => {
    console.error(`[LLM:ERR] ${data.toString().trim()}`);
  });

  llmProcess.on('exit', (code) => {
    console.log(`LLM process exited with code ${code}`);
    if (llmStatus === 'running' || llmStatus === 'starting') {
      llmStatus = 'stopped';
      showNotification('Local LLM Stopped', 'The local LLM server has stopped.');
    }
    llmProcess = null;
    rebuildTray();
  });

  llmProcess.on('error', (err) => {
    console.error(`LLM process error: ${err.message}`);
    llmStatus = 'error';
    llmProcess = null;
    rebuildTray();
  });
}

function stopLlm() {
  if (!llmProcess) return;

  console.log('Stopping Local LLM...');
  if (process.platform === 'win32') {
    execSync(`taskkill /pid ${llmProcess.pid} /T /F`, { stdio: 'pipe' });
  } else {
    llmProcess.kill('SIGTERM');
  }
  llmProcess = null;
  llmStatus = 'stopped';
  showNotification('Local LLM Stopped', 'The local LLM server has been stopped.');
  rebuildTray();
}

// ---- Tray Menu ----
function getStatusLabel(status) {
  const labels = {
    stopped: '● Stopped',
    starting: '● Starting...',
    running: '● Running',
    error: '● Error',
  };
  return labels[status] || '● Unknown';
}

function buildMenu() {
  const statusIcon = jarvisStatus === 'running' ? '🟢' : jarvisStatus === 'starting' ? '🟡' : '🔴';

  return Menu.buildFromTemplate([
    {
      label: `${statusIcon} JARVIS: ${getStatusLabel(jarvisStatus)}`,
      enabled: false,
    },
    {
      label: `${llmStatus === 'running' ? '🟢' : llmStatus === 'starting' ? '🟡' : '🔴'} Local LLM: ${getStatusLabel(llmStatus)}`,
      enabled: false,
    },
    { type: 'separator' },
    {
      label: 'Open Dashboard',
      click: () => {
        const { shell } = require('electron');
        shell.openExternal(CONFIG.dashboardUrl);
      },
    },
    {
      label: 'Open API',
      click: () => {
        const { shell } = require('electron');
        shell.openExternal(CONFIG.apiUrl + '/health');
      },
    },
    { type: 'separator' },
    {
      label: jarvisStatus === 'running' ? 'Stop JARVIS' : 'Start JARVIS',
      click: () => {
        if (jarvisStatus === 'running' || jarvisStatus === 'starting') {
          stopJarvis();
        } else {
          startJarvis();
        }
      },
    },
    {
      label: llmStatus === 'running' ? 'Stop Local LLM' : 'Start Local LLM',
      click: () => {
        if (llmStatus === 'running' || llmStatus === 'starting') {
          stopLlm();
        } else {
          startLlm();
        }
      },
    },
    { type: 'separator' },
    {
      label: 'Install Auto-Start',
      click: () => {
        const { fork } = require('child_process');
        fork(path.join(__dirname, 'install-autostart.js'));
        showNotification('Auto-Start', 'Installing auto-start shortcut...');
      },
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        stopJarvis();
        stopLlm();
        if (healthCheckTimer) clearInterval(healthCheckTimer);
        app.quit();
      },
    },
  ]);
}

function rebuildTray() {
  if (!tray) return;
  const icon = createTrayIcon(jarvisStatus);
  tray.setImage(icon);
  tray.setToolTip(`OpenJARVIS — JARVIS: ${jarvisStatus}, LLM: ${llmStatus}`);
  tray.setContextMenu(buildMenu());
}

// ---- App Lifecycle ----
app.whenReady().then(() => {
  // Determine overall status for the initial icon
  const icon = createTrayIcon('stopped');
  tray = new Tray(icon);
  tray.setToolTip('OpenJARVIS — Initializing...');
  tray.setContextMenu(buildMenu());

  // Check initial status
  checkPort(3001).then((up) => {
    jarvisStatus = up ? 'running' : 'stopped';
    return checkPort(11434);
  }).then((up) => {
    llmStatus = up ? 'running' : 'stopped';
    rebuildTray();
    startHealthChecks();
  });

  // Prevent app from closing when all windows are closed (tray-only app)
  app.on('window-all-closed', () => {});
});

app.on('before-quit', () => {
  stopJarvis();
  stopLlm();
  if (healthCheckTimer) clearInterval(healthCheckTimer);
});

// Don't show dock icon on macOS
app.dock?.hide?.();
