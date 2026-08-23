#!/usr/bin/env node
/**
 * OpenJARVIS Agent Daemon
 *
 * Runs on a user's machine, connects to the OpenJARVIS cloud dashboard,
 * receives hardware-control commands, executes them locally, and reports results.
 *
 * Environment variables:
 *   DAEMON_WS_URL          - Server WebSocket URL (default: ws://localhost:3001)
 *   DAEMON_SERVER_URL      - Server HTTP base URL (derived from WS_URL or explicit)
 *   DAEMON_AUTH_TOKEN      - Authentication token
 *   DAEMON_DEVICE_NAME     - Custom device name (default: os.hostname())
 *   DAEMON_POLL_INTERVAL   - Command poll interval in ms (default: 2000)
 *   DAEMON_HEARTBEAT_MS    - Heartbeat interval in ms (default: 30000)
 */

'use strict';

const os = require('os');
const { exec, execFile, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const crypto = require('crypto');

// ─── Configuration ───────────────────────────────────────────────────────────

const CONFIG = {
  wsUrl: process.env.DAEMON_WS_URL || 'ws://localhost:3001',
  authToken: process.env.DAEMON_AUTH_TOKEN || '',
  deviceName: process.env.DAEMON_DEVICE_NAME || os.hostname(),
  pollInterval: parseInt(process.env.DAEMON_POLL_INTERVAL || '2000', 10),
  heartbeatMs: parseInt(process.env.DAEMON_HEARTBEAT_MS || '30000', 10),
  version: '1.0.0',
};

// Derive HTTP base URL from WS URL
let serverUrl = process.env.DAEMON_SERVER_URL;
if (!serverUrl) {
  serverUrl = CONFIG.wsUrl
    .replace(/^ws(s?):\/\//, 'http$1://')
    .replace(/:\/\/$/, ''); // strip trailing slash
}
CONFIG.serverUrl = serverUrl;

// ─── State ───────────────────────────────────────────────────────────────────

let deviceId = null;
let isShuttingDown = false;
let wsConnection = null;
let pollTimer = null;
let heartbeatTimer = null;
let reconnectAttempts = 0;
const MAX_RECONNECT_BACKOFF = 60000;

// ─── Logging ─────────────────────────────────────────────────────────────────

function log(level, msg, meta) {
  const ts = new Date().toISOString();
  const prefix = `[${ts}] [${level.toUpperCase()}] [daemon]`;
  if (level === 'error') {
    console.error(meta ? `${prefix} ${msg}`, meta : `${prefix} ${msg}`);
  } else {
    console.log(meta ? `${prefix} ${msg}` : `${prefix} ${msg}`, meta || '');
  }
}

// ─── HTTP helpers ────────────────────────────────────────────────────────────

function httpRequest(method, urlPath, body) {
  return new Promise((resolve, reject) => {
    const fullUrl = CONFIG.serverUrl + urlPath;
    const parsed = new URL(fullUrl);
    const isHttps = parsed.protocol === 'https:';
    const transport = isHttps ? https : http;

    const headers = { 'Content-Type': 'application/json' };
    if (CONFIG.authToken) {
      headers['Authorization'] = `Bearer ${CONFIG.authToken}`;
    }

    const options = {
      hostname: parsed.hostname,
      port: parsed.port || (isHttps ? 443 : 80),
      path: parsed.pathname + parsed.search,
      method,
      headers,
      timeout: 30000,
    };

    const req = transport.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve({ status: res.statusCode, body: json });
        } catch {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Request timeout')); });

    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

// ─── System info ─────────────────────────────────────────────────────────────

function getSystemInfo() {
  const cpus = os.cpus();
  const totalMem = os.totalmem();
  const freeMem = os.freemem();

  return {
    hostname: os.hostname(),
    platform: os.platform(),
    osType: os.type(),
    osRelease: os.release(),
    osVersion: os.version(),
    arch: os.arch(),
    cpuModel: cpus.length > 0 ? cpus[0].model : 'unknown',
    cpuCores: cpus.length,
    cpuSpeed: cpus.length > 0 ? cpus[0].speed : 0,
    totalMemoryBytes: totalMem,
    freeMemoryBytes: freeMem,
    totalMemoryGB: (totalMem / (1024 ** 3)).toFixed(2),
    freeMemoryGB: (freeMem / (1024 ** 3)).toFixed(2),
    uptimeSeconds: os.uptime(),
    homeDir: os.homedir(),
    tmpDir: os.tmpdir(),
    nodeVersion: process.version,
    daemonVersion: CONFIG.version,
    networkInterfaces: os.networkInterfaces(),
  };
}

function getCapabilities() {
  const platform = os.platform();
  const caps = ['shell.exec', 'shell.which', 'file.read', 'file.write', 'file.list', 'file.delete', 'system.info', 'process.list', 'process.kill', 'network.info', 'notification.send'];

  if (platform === 'darwin') {
    caps.push('clipboard.get', 'clipboard.set', 'screenshot.capture', 'app.launch');
  } else if (platform === 'linux') {
    caps.push('app.launch', 'notification.send');
    // clipboard and screenshot require xclip / import (ImageMagick)
    caps.push('clipboard.get', 'clipboard.set', 'screenshot.capture');
  } else if (platform === 'win32') {
    caps.push('clipboard.get', 'clipboard.set', 'screenshot.capture', 'app.launch', 'notification.send');
  }

  // nut.js stubs
  caps.push('mouse.move', 'mouse.click', 'mouse.scroll', 'keyboard.type', 'keyboard.press');

  return caps;
}

// ─── Command handlers ────────────────────────────────────────────────────────

const handlers = {

  // ── Shell ────────────────────────────────────────────────────────────────

  async 'shell.exec'({ command, timeout, cwd, env: extraEnv }) {
    return new Promise((resolve, reject) => {
      const maxTimeout = Math.min(parseInt(timeout, 10) || 30000, 120000);
      const opts = {
        timeout: maxTimeout,
        maxBuffer: 10 * 1024 * 1024, // 10 MB
        encoding: 'utf-8',
        cwd: cwd || undefined,
        env: extraEnv ? { ...process.env, ...extraEnv } : undefined,
      };
      exec(command, opts, (error, stdout, stderr) => {
        resolve({
          exitCode: error ? (error.code || 1) : 0,
          stdout: (stdout || '').trim(),
          stderr: (stderr || '').trim(),
          error: error ? error.message : null,
        });
      });
    });
  },

  async 'shell.which'(params) {
    const cmd = params.command;
    if (!cmd) return { found: false, error: 'command parameter required' };
    return new Promise((resolve) => {
      const isWin = os.platform() === 'win32';
      exec(isWin ? `where ${cmd}` : `which ${cmd}`, (error, stdout) => {
        if (error || !stdout.trim()) {
          resolve({ found: false, command: cmd });
        } else {
          resolve({ found: true, command: cmd, path: stdout.trim() });
        }
      });
    });
  },

  // ── File operations ──────────────────────────────────────────────────────

  async 'file.read'(params) {
    const filePath = params.path;
    if (!filePath) return { error: 'path parameter required' };
    const encoding = params.encoding || 'utf-8';
    try {
      const stat = fs.statSync(filePath);
      if (stat.size > 10 * 1024 * 1024) {
        return { error: `File too large (${stat.size} bytes). Max 10MB.` };
      }
      const content = fs.readFileSync(filePath, encoding);
      return { content, size: stat.size, encoding };
    } catch (err) {
      return { error: err.message };
    }
  },

  async 'file.write'(params) {
    const filePath = params.path;
    const content = params.content;
    if (!filePath) return { error: 'path parameter required' };
    if (content === undefined) return { error: 'content parameter required' };
    try {
      // Ensure directory exists
      const dir = path.dirname(filePath);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(filePath, content, params.encoding || 'utf-8');
      return { success: true, path: filePath, bytesWritten: Buffer.byteLength(content) };
    } catch (err) {
      return { error: err.message };
    }
  },

  async 'file.list'(params) {
    const dirPath = params.path || '.';
    try {
      const entries = fs.readdirSync(dirPath, { withFileTypes: true });
      const items = entries.map((entry) => ({
        name: entry.name,
        type: entry.isDirectory() ? 'directory' : (entry.isFile() ? 'file' : 'other'),
        size: entry.isFile() ? fs.statSync(path.join(dirPath, entry.name)).size : null,
      }));
      return { path: dirPath, items, count: items.length };
    } catch (err) {
      return { error: err.message };
    }
  },

  async 'file.delete'(params) {
    const filePath = params.path;
    if (!filePath) return { error: 'path parameter required' };
    try {
      const stat = fs.statSync(filePath);
      if (stat.isDirectory()) {
        fs.rmSync(filePath, { recursive: true, force: true });
      } else {
        fs.unlinkSync(filePath);
      }
      return { success: true, deleted: filePath };
    } catch (err) {
      return { error: err.message };
    }
  },

  // ── System ───────────────────────────────────────────────────────────────

  async 'system.info'() {
    return getSystemInfo();
  },

  // ── Clipboard ────────────────────────────────────────────────────────────

  async 'clipboard.get'() {
    const platform = os.platform();
    return new Promise((resolve) => {
      let cmd;
      if (platform === 'darwin') cmd = 'pbpaste';
      else if (platform === 'linux') cmd = 'xclip -selection clipboard -o 2>/dev/null || xsel --clipboard --output 2>/dev/null';
      else if (platform === 'win32') cmd = 'powershell -command Get-Clipboard';
      else return resolve({ error: `Unsupported platform: ${platform}` });

      exec(cmd, { maxBuffer: 5 * 1024 * 1024 }, (error, stdout) => {
        resolve({ content: error ? '' : stdout });
      });
    });
  },

  async 'clipboard.set'(params) {
    const content = params.content;
    if (content === undefined) return { error: 'content parameter required' };
    const platform = os.platform();
    return new Promise((resolve) => {
      let cmd;
      if (platform === 'darwin') cmd = 'pbcopy';
      else if (platform === 'linux') cmd = 'xclip -selection clipboard';
      else if (platform === 'win32') cmd = 'powershell -command "Set-Clipboard -Value \'" + content.replace(/'/g, "'") + "\'"';
      else return resolve({ error: `Unsupported platform: ${platform}` });

      const child = exec(cmd, (error) => {
        resolve({ success: !error, error: error ? error.message : null });
      });
      child.stdin.write(content);
      child.stdin.end();
    });
  },

  // ── Screenshot ───────────────────────────────────────────────────────────

  async 'screenshot.capture'(params) {
    const outputPath = params.outputPath || path.join(os.tmpdir(), `openjarvis-screenshot-${Date.now()}.png`);
    const platform = os.platform();
    return new Promise((resolve) => {
      let cmd;
      if (platform === 'darwin') {
        cmd = `screencapture -x "${outputPath}"`;
      } else if (platform === 'linux') {
        cmd = `import -window root "${outputPath}" 2>/dev/null || gnome-screenshot -f "${outputPath}" 2>/dev/null || scrot "${outputPath}" 2>/dev/null`;
      } else if (platform === 'win32') {
        cmd = `powershell -command "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.Screen]::PrimaryScreen | ForEach-Object { \$bitmap = New-Object System.Drawing.Bitmap(\$_.Bounds.Width, \$_.Bounds.Height); \$graphics = [System.Drawing.Graphics]::FromImage(\$bitmap); \$graphics.CopyFromScreen(\$_.Bounds.Location, [System.Drawing.Point]::Empty, \$_.Bounds.Size); \$bitmap.Save('${outputPath.replace(/\\/g, '\\\\')}'); \$graphics.Dispose(); \$bitmap.Dispose() }"`;
      } else {
        return resolve({ error: `Unsupported platform: ${platform}` });
      }

      exec(cmd, { timeout: 15000 }, (error) => {
        if (error) {
          resolve({ error: `Screenshot failed: ${error.message}` });
          return;
        }
        try {
          const data = fs.readFileSync(outputPath);
          const base64 = data.toString('base64');
          resolve({
            success: true,
            path: outputPath,
            size: data.length,
            format: 'png',
            base64,
          });
        } catch (err) {
          resolve({ error: `Failed to read screenshot: ${err.message}` });
        }
      });
    });
  },

  // ── Process ──────────────────────────────────────────────────────────────

  async 'process.list'() {
    return new Promise((resolve) => {
      const isWin = os.platform() === 'win32';
      const cmd = isWin
        ? 'powershell -command "Get-Process | Select-Object Id,ProcessName,CPU,WorkingSet -AutoSize | ConvertTo-Json -Depth 1"'
        : 'ps aux --no-headers';

      exec(cmd, { timeout: 10000, maxBuffer: 5 * 1024 * 1024 }, (error, stdout) => {
        if (error) {
          resolve({ error: error.message, processes: [] });
          return;
        }
        if (isWin) {
          try {
            const procs = JSON.parse(stdout);
            resolve({ processes: (Array.isArray(procs) ? procs : [procs]).map(p => ({
              pid: p.Id,
              name: p.ProcessName,
              cpu: p.CPU,
              memoryMB: Math.round((p.WorkingSet || 0) / (1024 * 1024)),
            })) });
          } catch {
            resolve({ processes: [], raw: stdout });
          }
        } else {
          // Parse ps aux output
          const processes = stdout.trim().split('\n').map(line => {
            const parts = line.trim().split(/\s+/);
            if (parts.length < 11) return null;
            return {
              user: parts[0],
              pid: parseInt(parts[1], 10),
              cpu: parseFloat(parts[2]),
              memory: parseFloat(parts[3]),
              vsz: parseInt(parts[4], 10),
              rss: parseInt(parts[5], 10),
              tty: parts[6],
              stat: parts[7],
              start: parts[8],
              time: parts[9],
              command: parts.slice(11).join(' '),
            };
          }).filter(Boolean);
          resolve({ processes, count: processes.length });
        }
      });
    });
  },

  async 'process.kill'(params) {
    const pid = params.pid;
    const signal = params.signal || 'SIGTERM';
    if (!pid) return { error: 'pid parameter required' };
    try {
      process.kill(parseInt(pid, 10), signal);
      return { success: true, pid, signal };
    } catch (err) {
      return { error: err.message };
    }
  },

  // ── Network ──────────────────────────────────────────────────────────────

  async 'network.info'() {
    const interfaces = os.networkInterfaces();
    const result = {};
    for (const [name, addrs] of Object.entries(interfaces)) {
      result[name] = addrs.map(a => ({
        address: a.address,
        netmask: a.netmask,
        family: a.family,
        mac: a.mac,
        internal: a.internal,
        cidr: a.cidr,
      }));
    }
    return { interfaces: result };
  },

  // ── App launch ───────────────────────────────────────────────────────────

  async 'app.launch'(params) {
    const app = params.app || params.application;
    if (!app) return { error: 'app parameter required' };
    const platform = os.platform();
    return new Promise((resolve) => {
      let cmd;
      if (platform === 'darwin') {
        cmd = `open -a "${app}"`;
      } else if (platform === 'linux') {
        cmd = `which "${app}" && "${app}" &`;
      } else if (platform === 'win32') {
        cmd = `start "" "${app}"`;
      } else {
        return resolve({ error: `Unsupported platform: ${platform}` });
      }
      exec(cmd, (error) => {
        resolve({ success: !error, error: error ? error.message : null, app });
      });
    });
  },

  // ── Notification ─────────────────────────────────────────────────────────

  async 'notification.send'(params) {
    const title = params.title || 'OpenJARVIS';
    const body = params.body || params.message || '';
    const platform = os.platform();
    return new Promise((resolve) => {
      let cmd;
      if (platform === 'darwin') {
        cmd = `osascript -e 'display notification "${body.replace(/"/g, '\\"')}" with title "${title.replace(/"/g, '\\"')}"'`;
      } else if (platform === 'linux') {
        cmd = `notify-send "${title.replace(/"/g, '\\"')}" "${body.replace(/"/g, '\\"')}"`;
      } else if (platform === 'win32') {
        cmd = `powershell -command "[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null; [Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime] | Out-Null; \$template = [Windows.UI.Notifications.ToastNotificationManager]::GetTemplateContent([Windows.UI.Notifications.ToastTemplateType]::ToastText02); \$textNodes = \$template.GetElementsByTagName('text'); \$textNodes.Item(0).AppendChild(\$template.CreateTextNode('${title.replace(/'/g, "''")}')) | Out-Null; \$textNodes.Item(1).AppendChild(\$template.CreateTextNode('${body.replace(/'/g, "''")}')) | Out-Null; \$toast = [Windows.UI.Notifications.ToastNotification]::new(\$template); [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('OpenJARVIS').Show(\$toast)"`;
      } else {
        return resolve({ error: `Unsupported platform: ${platform}` });
      }
      exec(cmd, (error) => {
        resolve({ success: !error, error: error ? error.message : null });
      });
    });
  },

  // ── Mouse stubs (nut.js required) ────────────────────────────────────────

  async 'mouse.move'(params) {
    log('warn', 'mouse.move: nut.js required for full hardware control');
    return { error: 'nut.js native module required for mouse control. Install @nut-tree/nut-js for hardware access.', stub: true, requested: params };
  },

  async 'mouse.click'(params) {
    log('warn', 'mouse.click: nut.js required for full hardware control');
    return { error: 'nut.js native module required for mouse control. Install @nut-tree/nut-js for hardware access.', stub: true, requested: params };
  },

  async 'mouse.scroll'(params) {
    log('warn', 'mouse.scroll: nut.js required for full hardware control');
    return { error: 'nut.js native module required for mouse control. Install @nut-tree/nut-js for hardware access.', stub: true, requested: params };
  },

  // ── Keyboard stubs (nut.js required) ─────────────────────────────────────

  async 'keyboard.type'(params) {
    log('warn', 'keyboard.type: nut.js required for full hardware control');
    return { error: 'nut.js native module required for keyboard control. Install @nut-tree/nut-js for hardware access.', stub: true, requested: params };
  },

  async 'keyboard.press'(params) {
    log('warn', 'keyboard.press: nut.js required for full hardware control');
    return { error: 'nut.js native module required for keyboard control. Install @nut-tree/nut-js for hardware access.', stub: true, requested: params };
  },

};

// ─── Command dispatch ─────────────────────────────────────────────────────────

async function executeCommand(command, params) {
  const handler = handlers[command];
  if (!handler) {
    return { error: `Unknown command: ${command}. Available: ${Object.keys(handlers).join(', ')}` };
  }
  try {
    log('info', `Executing: ${command}`);
    const startTime = Date.now();
    const result = await handler(params || {});
    const duration = Date.now() - startTime;
    log('info', `Completed: ${command} (${duration}ms)`);
    return { ...result, _duration: duration, _command: command };
  } catch (err) {
    log('error', `Command failed: ${command}`, err.message);
    return { error: err.message, _command: command };
  }
}

// ─── Registration ─────────────────────────────────────────────────────────────

async function registerDevice() {
  const sysInfo = getSystemInfo();
  const capabilities = getCapabilities();

  const payload = {
    name: CONFIG.deviceName,
    hostname: sysInfo.hostname,
    os: `${sysInfo.osType} ${sysInfo.osRelease} (${sysInfo.arch})`,
    arch: sysInfo.arch,
    status: 'online',
    daemonVersion: CONFIG.version,
    capabilities,
  };

  log('info', 'Registering device...', { name: payload.name, hostname: payload.hostname });

  try {
    const res = await httpRequest('POST', '/api/devices', payload);
    if (res.status === 201 && res.body.id) {
      deviceId = res.body.id;
      log('info', `Device registered: ${deviceId}`);
      return deviceId;
    } else {
      log('error', 'Registration failed', { status: res.status, body: res.body });
      throw new Error(`Registration failed: ${res.status}`);
    }
  } catch (err) {
    log('error', 'Failed to register device', err.message);
    throw err;
  }
}

// ─── Command polling ──────────────────────────────────────────────────────────

async function pollCommands() {
  if (!deviceId || isShuttingDown) return;

  try {
    const res = await httpRequest('GET', `/api/daemon/ws?deviceId=${deviceId}`);
    if (res.status === 200 && res.body.commands && res.body.commands.length > 0) {
      for (const cmd of res.body.commands) {
        log('info', `Received command: ${cmd.command}`, { id: cmd.id });
        // Execute in background, don't block the poll loop
        executeAndReport(cmd).catch(err => {
          log('error', `Unhandled command error: ${cmd.id}`, err.message);
        });
      }
    }
  } catch (err) {
    log('error', 'Poll error', err.message);
  }
}

async function executeAndReport(cmd) {
  const result = await executeCommand(cmd.command, cmd.params);

  try {
    await httpRequest('POST', '/api/daemon/result', {
      commandId: cmd.id,
      deviceId: deviceId,
      result,
      error: result.error || null,
    });
    log('info', `Result reported for: ${cmd.id}`);
  } catch (err) {
    log('error', `Failed to report result: ${cmd.id}`, err.message);
  }
}

// ─── Heartbeat ────────────────────────────────────────────────────────────────

async function sendHeartbeat() {
  if (!deviceId || isShuttingDown) return;
  try {
    await httpRequest('PATCH', `/api/devices/${deviceId}`, { status: 'idle' });
  } catch (err) {
    log('error', 'Heartbeat failed', err.message);
  }
}

// ─── WebSocket connection (preferred) ────────────────────────────────────────

function connectWebSocket() {
  try {
    const WebSocket = require('ws');
    const wsUrl = `${CONFIG.wsUrl}/?deviceId=${deviceId || ''}&token=${CONFIG.authToken}`;

    log('info', `Connecting WebSocket: ${CONFIG.wsUrl}`);

    wsConnection = new WebSocket(wsUrl);

    wsConnection.on('open', () => {
      log('info', 'WebSocket connected');
      reconnectAttempts = 0;
    });

    wsConnection.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.command && msg.id) {
          log('info', `WS command received: ${msg.command}`);
          executeAndReport(msg).catch(err => {
            log('error', `WS command error`, err.message);
          });
        }
      } catch (err) {
        log('error', 'WS message parse error', err.message);
      }
    });

    wsConnection.on('close', (code, reason) => {
      log('warn', `WebSocket closed: ${code} ${reason}`);
      wsConnection = null;
      if (!isShuttingDown) {
        scheduleReconnect();
      }
    });

    wsConnection.on('error', (err) => {
      log('error', 'WebSocket error', err.message);
      wsConnection = null;
    });
  } catch (err) {
    log('warn', 'WebSocket unavailable, falling back to HTTP polling', err.message);
    wsConnection = null;
  }
}

function scheduleReconnect() {
  const backoff = Math.min(1000 * Math.pow(2, reconnectAttempts), MAX_RECONNECT_BACKOFF);
  const jitter = Math.random() * 1000;
  reconnectAttempts++;
  const delay = backoff + jitter;

  log('info', `Reconnecting in ${Math.round(delay)}ms (attempt ${reconnectAttempts})`);
  setTimeout(() => {
    if (!isShuttingDown) {
      connectWebSocket();
    }
  }, delay);
}

// ─── Graceful shutdown ────────────────────────────────────────────────────────

async function shutdown(signal) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  log('info', `Shutting down (${signal})...`);

  // Stop polling
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
  if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null; }

  // Close WebSocket
  if (wsConnection) {
    try { wsConnection.close(); } catch { /* ignore */ }
    wsConnection = null;
  }

  // Mark device offline
  if (deviceId) {
    try {
      await httpRequest('PATCH', `/api/devices/${deviceId}`, { status: 'offline' });
      log('info', 'Device marked offline');
    } catch (err) {
      log('error', 'Failed to mark device offline', err.message);
    }
  }

  log('info', 'Goodbye!');
  process.exit(0);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('');
  console.log('  ╔══════════════════════════════════════════════╗');
  console.log('  ║        OpenJARVIS Agent Daemon v1.0.0       ║');
  console.log('  ╚══════════════════════════════════════════════╝');
  console.log('');

  log('info', `Platform: ${os.platform()} ${os.arch()}`);
  log('info', `Server:  ${CONFIG.serverUrl}`);
  log('info', `Device:  ${CONFIG.deviceName}`);
  log('info', `Poll:    ${CONFIG.pollInterval}ms`);
  log('info', 'Capabilities: ' + getCapabilities().join(', '));
  console.log('');

  // Register device
  await registerDevice();

  // Start HTTP polling (always, as fallback or primary)
  pollTimer = setInterval(pollCommands, CONFIG.pollInterval);
  // Run first poll immediately
  pollCommands();

  // Try WebSocket connection
  connectWebSocket();

  // Heartbeat
  heartbeatTimer = setInterval(sendHeartbeat, CONFIG.heartbeatMs);
  sendHeartbeat();

  // Graceful shutdown handlers
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGHUP', () => shutdown('SIGHUP'));

  // Uncaught exception handling
  process.on('uncaughtException', (err) => {
    log('error', 'Uncaught exception', err);
  });
  process.on('unhandledRejection', (reason) => {
    log('error', 'Unhandled rejection', reason);
  });

  log('info', 'Daemon is running. Press Ctrl+C to stop.');
}

main().catch((err) => {
  log('error', 'Fatal error during startup', err);
  process.exit(1);
});
