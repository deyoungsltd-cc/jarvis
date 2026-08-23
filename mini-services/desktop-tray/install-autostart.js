/**
 * install-autostart.js — Creates a Windows scheduled task or startup shortcut
 * for auto-booting the OpenJARVIS tray app.
 * 
 * Usage:
 *   node install-autostart.js          # Install
 *   node install-autostart.js --remove # Remove
 */

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const APP_NAME = 'OpenJARVIS';
const TASK_NAME = 'OpenJARVIS Tray';
const isRemove = process.argv.includes('--remove') || process.argv.includes('-r');

// Determine the path to the executable
// When running as a packaged app, process.execPath points to the exe
// When running in dev, point to the electron command
function getAppPath() {
  const execPath = process.execPath;
  
  // If running in packaged Electron app
  if (execPath.endsWith('openjarvis-tray.exe') || execPath.endsWith('OpenJARVIS.exe')) {
    return `"${execPath}"`;
  }
  
  // Dev mode - point to the directory and use npm start
  const appDir = path.resolve(__dirname);
  return `"${process.execPath}" "${path.join(appDir, 'index.js')}"`;
}

// Get the startup folder path on Windows
function getStartupFolder() {
  const appData = process.env.APPDATA || path.join(process.env.USERPROFILE || '', 'AppData', 'Roaming');
  return path.join(appData, 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup');
}

function createShortcut() {
  const startupDir = getStartupFolder();
  
  if (!fs.existsSync(startupDir)) {
    console.error(`Startup folder not found: ${startupDir}`);
    console.log('Falling back to scheduled task approach.');
    createScheduledTask();
    return;
  }

  // Create a .vbs script that launches the app without a visible window
  const appPath = getAppPath();
  const shortcutPath = path.join(startupDir, `${APP_NAME}.vbs`);
  const vbsContent = `
' OpenJARVIS Auto-Start
Set WshShell = CreateObject("WScript.Shell")
WshShell.Run ${appPath}, 0, False
`;

  try {
    fs.writeFileSync(shortcutPath, vbsContent, 'utf8');
    console.log(`✅ Auto-start shortcut created: ${shortcutPath}`);
    console.log(`   Launches: ${appPath}`);
  } catch (err) {
    console.error(`Failed to create shortcut: ${err.message}`);
    console.log('Falling back to scheduled task approach.');
    createScheduledTask();
  }
}

function createScheduledTask() {
  const appPath = getAppPath();
  const cmd = `schtasks /create /tn "${TASK_NAME}" /tr ${appPath} /sc onlogon /rl highest /f`;

  try {
    execSync(cmd, { stdio: 'pipe' });
    console.log(`✅ Scheduled task "${TASK_NAME}" created.`);
    console.log(`   Triggers: on user logon`);
    console.log(`   Command: ${appPath}`);
  } catch (err) {
    console.error(`Failed to create scheduled task: ${err.message?.toString() || err}`);
    console.log('\nYou can manually create a shortcut in:');
    console.log(`  ${getStartupFolder()}`);
  }
}

function removeShortcut() {
  const startupDir = getStartupFolder();
  const shortcutPath = path.join(startupDir, `${APP_NAME}.vbs`);

  if (fs.existsSync(shortcutPath)) {
    fs.unlinkSync(shortcutPath);
    console.log(`✅ Removed auto-start shortcut: ${shortcutPath}`);
  }

  // Also try to remove scheduled task
  try {
    execSync(`schtasks /delete /tn "${TASK_NAME}" /f`, { stdio: 'pipe' });
    console.log(`✅ Removed scheduled task "${TASK_NAME}"`);
  } catch {
    // Task may not exist
  }
}

// ---- Main ----

if (isRemove) {
  console.log(`Removing ${APP_NAME} auto-start...`);
  removeShortcut();
} else {
  console.log(`Installing ${APP_NAME} auto-start...`);
  console.log(`Platform: ${process.platform}`);
  console.log(`App path: ${getAppPath()}`);
  console.log('');

  if (process.platform === 'win32') {
    createShortcut();
  } else {
    console.warn('Auto-start installation is designed for Windows.');
    console.log('On Linux/macOS, add to your session autostart manually.');
    console.log(`  App path: ${getAppPath()}`);
  }
}
