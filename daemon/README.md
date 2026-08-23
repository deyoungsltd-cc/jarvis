# OpenJARVIS Agent Daemon

A lightweight Node.js process that runs on your machine, connects to the OpenJARVIS cloud dashboard, and executes hardware-control commands received from the server.

## How it works

1. **Startup** — gathers system info (OS, CPU, memory, network) and registers itself via `POST /api/devices`
2. **Command loop** — polls `GET /api/daemon/ws?deviceId=X` every 2 s (configurable) for pending commands
3. **Execution** — runs each command locally and POSTs the result back to `/api/daemon/result`
4. **Heartbeat** — sends a PATCH heartbeat every 30 s so the dashboard knows the device is alive
5. **Shutdown** — marks the device "offline" and exits cleanly on SIGINT/SIGTERM

## Install & Run

```bash
cd daemon
npm install          # or: bun install
node index.js        # or: npm start
```

For development with auto-reload:

```bash
npm run dev
```

## Configuration

| Variable | Default | Description |
|---|---|---|
| `DAEMON_WS_URL` | `ws://localhost:3001` | WebSocket URL of the OpenJARVIS server |
| `DAEMON_SERVER_URL` | derived from WS URL | HTTP base URL (auto-computed if not set) |
| `DAEMON_AUTH_TOKEN` | _(empty)_ | Bearer token sent with every request |
| `DAEMON_DEVICE_NAME` | `os.hostname()` | Display name shown in the dashboard |
| `DAEMON_POLL_INTERVAL` | `2000` | HTTP poll interval in milliseconds |
| `DAEMON_HEARTBEAT_MS` | `30000` | Heartbeat interval in milliseconds |

Example:

```bash
DAEMON_WS_URL=wss://jarvis.example.com \
DAEMON_AUTH_TOKEN=my-secret-token \
DAEMON_DEVICE_NAME="Living Room PC" \
node index.js
```

## Available Commands

### Shell
| Command | Params | Description |
|---|---|---|
| `shell.exec` | `command`, `timeout?`, `cwd?`, `env?` | Run a shell command (max 120 s) |
| `shell.which` | `command` | Check if a binary exists on PATH |

### File System
| Command | Params | Description |
|---|---|---|
| `file.read` | `path`, `encoding?` | Read file contents (max 10 MB) |
| `file.write` | `path`, `content`, `encoding?` | Write file (creates directories) |
| `file.list` | `path?` | List directory contents |
| `file.delete` | `path` | Delete file or directory recursively |

### System
| Command | Description |
|---|---|
| `system.info` | CPU, memory, OS, network, uptime |
| `network.info` | All network interfaces |

### Clipboard
| Command | Description |
|---|---|
| `clipboard.get` | Read clipboard text |
| `clipboard.set` | Write text to clipboard |

### Screenshot
| Command | Params | Description |
|---|---|---|
| `screenshot.capture` | `outputPath?` | Take a screenshot, return base64 PNG |

### Process
| Command | Params | Description |
|---|---|---|
| `process.list` | List running processes |
| `process.kill` | `pid`, `signal?` | Send signal to a process |

### Application
| Command | Params | Description |
|---|---|---|
| `app.launch` | `app` | Launch an application by name |
| `notification.send` | `title?`, `body` | Show a desktop notification |

### Mouse / Keyboard (stubs)

`mouse.move`, `mouse.click`, `mouse.scroll`, `keyboard.type`, `keyboard.press` are stubs that return an informational error. Full hardware control requires the native [`@nut-tree/nut-js`](https://nutjs.dev/) module.

## Security Considerations

> ⚠️ **This daemon has full shell access to your machine.**

- Only run this on machines you trust and control.
- Always set `DAEMON_AUTH_TOKEN` in production.
- Use HTTPS/WSS endpoints to prevent credential interception.
- The daemon executes arbitrary shell commands — treat it like SSH access.
- Consider running under a dedicated user with limited privileges.
- Review the OpenJARVIS server's command approval/permission system.

## Platform Support

| Feature | macOS | Linux | Windows |
|---|---|---|---|
| Shell / File / System | ✅ | ✅ | ✅ |
| Clipboard | ✅ pbpaste/pbcopy | ✅ xclip | ✅ PowerShell |
| Screenshot | ✅ screencapture | ✅ import/scrot | ✅ PowerShell |
| Notifications | ✅ osascript | ✅ notify-send | ✅ Toast |
| App launch | ✅ open -a | ✅ which & exec | ✅ start |
| Mouse / Keyboard | 🔌 nut.js | 🔌 nut.js | 🔌 nut.js |
