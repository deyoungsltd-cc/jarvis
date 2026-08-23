# OpenJARVIS Desktop Tray App

A Windows system tray application for managing OpenJARVIS services.

## Features

- **System tray icon** with color-coded status (green = running, yellow = starting, red = stopped)
- **Quick actions**: Open Dashboard, Open API docs
- **Process management**: Start/Stop JARVIS API server, Start/Stop Local LLM
- **System notifications** when services start/stop
- **Auto-start on boot** support

## Prerequisites

- **Windows 10/11** (primary target)
- **Node.js 18+** (for development)
- **Bun** runtime installed (for running the API server)
- **PowerShell** (for local LLM management)

## Installation

### 1. Install dependencies

```bash
cd mini-services/desktop-tray
npm install
```

### 2. Run in development mode

```bash
npm start
```

### 3. Build for production

```bash
npm run build
```

This creates a packaged `.exe` in the `dist/` folder.

## Setup Auto-Start

### Option A: Via tray menu
Right-click the tray icon → **Install Auto-Start**

### Option B: Via command line

```bash
# Install
node install-autostart.js

# Remove
node install-autostart.js --remove
```

This creates a startup shortcut (`.vbs` script) in:
`%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup`

## Tray Menu

| Menu Item | Description |
|-----------|-------------|
| **Status indicators** | Shows JARVIS and LLM status with colored dots |
| Open Dashboard | Opens http://localhost:3000 in browser |
| Open API | Opens http://localhost:3001/health in browser |
| Start/Stop JARVIS | Spawns/kills the API server (`bun run dev`) |
| Start/Stop Local LLM | Runs `start-server.ps1` / kills the process |
| Install Auto-Start | Creates boot startup shortcut |
| Quit | Stops all services and exits |

## How It Works

1. **Health checks** every 15 seconds probe ports 3001 (API) and 11434 (LLM)
2. **Status icons** are generated programmatically as 16×16 PNG circles
3. **Process spawning** uses `child_process.spawn` with proper Windows support
4. **Notifications** use Electron's `Notification` API
5. **Auto-start** creates a VBS script in the Windows Startup folder that launches the tray app silently

## Configuration

Edit `CONFIG` at the top of `index.js` to change:

```js
const CONFIG = {
  dashboardUrl: 'http://localhost:3000',  // Next.js frontend
  apiUrl: 'http://localhost:3001',         // Express API
  wsUrl: 'http://localhost:3002',          // WebSocket server
  healthCheckInterval: 15000,              // ms between status checks
  apiDir: path.resolve(__dirname, '..', 'openjarvis-api'),
  llmDir: path.resolve(__dirname, '..', 'local-llm'),
};
```

## Troubleshooting

**Tray icon doesn't appear:**
- Make sure Electron installed correctly: `npm install`
- Try running with `npx electron .`

**"Start JARVIS" doesn't work:**
- Ensure Bun is installed and in your PATH
- Check that `mini-services/openjarvis-api/` exists
- Look at the console output for errors

**Status always shows "Stopped":**
- The API server may be on a different port
- Check `CONFIG.apiUrl` matches your actual API port
- Ensure no firewall is blocking localhost connections

**Auto-start doesn't work:**
- Run `node install-autostart.js` manually
- Check the Startup folder: `shell:startup`
- Ensure the `.vbs` file exists and the path in it is correct
