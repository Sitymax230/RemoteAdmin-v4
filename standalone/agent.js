/**
 * RemoteAdmin v4 - Agent
 * A comprehensive Node.js agent that connects to a RemoteAdmin server.
 * Features: system monitoring, remote control, app management, screen streaming,
 * auto-start, stealth mode, and local HTTP server for store/tickets.
 *
 * Usage: node agent.js --server ws://hostname:3000/ws/agent [--stealth] [--local-port 8475]
 */

const http = require('http');
const https = require('https');
const os = require('os');
const fs = require('fs');
const path = require('path');
const { exec, execSync, spawn } = require('child_process');
const net = require('net');
const crypto = require('crypto');
const WebSocket = require('ws');

// ============================================================
// Configuration
// ============================================================
const CONFIG = {
  serverUrl: process.argv.find((a, i) => process.argv[i + 1]?.startsWith('ws')) || process.env.RA_SERVER || 'ws://localhost:3000/ws/agent',
  stealth: process.argv.includes('--stealth') || process.env.RA_STEALTH === 'true',
  localPort: parseInt(process.env.RA_LOCAL_PORT || '8475', 10),
  agentId: process.env.RA_AGENT_ID || null,
  version: '4.0.0',
  metricInterval: 5000,
  reconnectBaseDelay: 1000,
  reconnectMaxDelay: 60000,
  dataDir: process.env.RA_DATA_DIR || path.join(os.homedir(), '.remoteadmin'),
};

// ============================================================
// Platform Detection
// ============================================================
const PLATFORM = os.platform();
const IS_WINDOWS = PLATFORM === 'win32';
const IS_LINUX = PLATFORM === 'linux';
const IS_MAC = PLATFORM === 'darwin';

// ============================================================
// State
// ============================================================
let ws = null;
let agentId = CONFIG.agentId;
let isConnected = false;
let isStreaming = false;
let streamInterval = null;
let reconnectAttempts = 0;
let lastPing = Date.now();

// Load or generate agent ID
function ensureAgentId() {
  const idFile = path.join(CONFIG.dataDir, 'agent.id');
  try {
    if (!fs.existsSync(CONFIG.dataDir)) {
      fs.mkdirSync(CONFIG.dataDir, { recursive: true });
    }
    if (agentId && fs.existsSync(idFile)) {
      fs.writeFileSync(idFile, agentId, 'utf8');
    } else if (fs.existsSync(idFile)) {
      agentId = fs.readFileSync(idFile, 'utf8').trim();
    } else {
      agentId = crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = crypto.randomBytes(1)[0] % 16;
        const v = c === 'x' ? r : (r & 0x3) | 0x8;
        return v.toString(16);
      });
      fs.writeFileSync(idFile, agentId, 'utf8');
    }
  } catch (e) {
    agentId = agentId || crypto.randomBytes(16).toString('hex');
  }
}

// ============================================================
// System Info
// ============================================================
function getSystemInfo() {
  return {
    hostname: os.hostname(),
    os: `${os.type()} ${os.release()}`,
    platform: PLATFORM,
    ip: getLocalIp(),
    version: CONFIG.version,
    cpuCores: os.cpus().length,
    cpuModel: os.cpus()[0]?.model || 'Unknown',
    totalMemory: os.totalmem(),
    arch: os.arch(),
  };
}

function getLocalIp() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (!iface.internal && iface.family === 'IPv4') {
        return iface.address;
      }
    }
  }
  return '127.0.0.1';
}

// ============================================================
// Metrics Collection
// ============================================================
function getMetrics() {
  const cpus = os.cpus();
  const totalCpu = cpus.reduce((acc, cpu) => {
    const total = cpu.times.user + cpu.times.nice + cpu.times.sys + cpu.times.idle + cpu.times.irq;
    return acc + total;
  }, 0);
  const idleCpu = cpus.reduce((acc, cpu) => acc + cpu.times.idle, 0);
  const cpuUsage = totalCpu > 0 ? ((totalCpu - idleCpu) / totalCpu) * 100 : 0;

  const totalMemory = os.totalmem();
  const freeMemory = os.freemem();
  const usedMemory = totalMemory - freeMemory;
  const memoryUsage = (usedMemory / totalMemory) * 100;

  let diskTotal = 0;
  let diskUsed = 0;

  if (IS_WINDOWS) {
    try {
      const drive = path.parse(process.cwd()).root || 'C:';
      const out = execSync(`wmic logicaldisk where "DeviceID='${drive.replace('\\', '')}'" get Size,FreeSpace /format:list`, { encoding: 'utf8', timeout: 5000 });
      const lines = out.trim().split('\n').filter(l => l.includes('='));
      for (const line of lines) {
        const [key, val] = line.split('=');
        if (key.trim() === 'Size') diskTotal = parseInt(val.trim()) || 0;
        if (key.trim() === 'FreeSpace') diskUsed = parseInt(val.trim()) || 0;
      }
      if (diskTotal > 0 && diskUsed > 0) {
        diskUsed = diskTotal - diskUsed;
      }
    } catch (e) {
      // fallback
      try {
        const out = execSync('fsutil volume diskfree C:', { encoding: 'utf8', timeout: 5000 });
        const totalMatch = out.match(/Total\s+# of bytes\s*:\s*(\d+)/);
        const availMatch = out.match(/Avail\s+# of bytes\s*:\s*(\d+)/);
        if (totalMatch && availMatch) {
          diskTotal = parseInt(totalMatch[1]) || 0;
          diskUsed = diskTotal - (parseInt(availMatch[1]) || 0);
        }
      } catch (e2) {
        // ignore
      }
    }
  } else {
    try {
      const out = execSync("df -k / | tail -1 | awk '{print $2,$3}'", { encoding: 'utf8', timeout: 5000 });
      const parts = out.trim().split(/\s+/);
      if (parts.length >= 2) {
        diskTotal = (parseInt(parts[0]) || 0) * 1024;
        diskUsed = (parseInt(parts[1]) || 0) * 1024;
      }
    } catch (e) {
      // ignore
    }
  }

  return {
    cpu: Math.round(cpuUsage * 100) / 100,
    memory: Math.round(memoryUsage * 100) / 100,
    memoryUsed: usedMemory,
    memoryTotal: totalMemory,
    diskTotal,
    diskUsed,
    uptime: Math.floor(os.uptime()),
    timestamp: new Date().toISOString(),
  };
}

// ============================================================
// WebSocket Connection
// ============================================================
function connect() {
  ensureAgentId();
  const info = getSystemInfo();

  try {
    ws = new WebSocket(CONFIG.serverUrl, {
      handshakeTimeout: 10000,
      perMessageDeflate: false,
    });
  } catch (err) {
    log('ERROR', `Failed to create WebSocket: ${err.message}`);
    scheduleReconnect();
    return;
  }

  ws.on('open', () => {
    isConnected = true;
    reconnectAttempts = 0;
    log('INFO', `Connected to server: ${CONFIG.serverUrl}`);

    // Register with server
    ws.send(JSON.stringify({
      type: 'register',
      agentId,
      hostname: info.hostname,
      os: info.os,
      platform: info.platform,
      ip: info.ip,
      version: CONFIG.version,
    }));
  });

  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString());
      handleMessage(msg);
    } catch (err) {
      log('ERROR', `Failed to parse message: ${err.message}`);
    }
  });

  ws.on('close', (code, reason) => {
    isConnected = false;
    log('INFO', `Disconnected from server (code: ${code})`);
    stopStreaming();
    scheduleReconnect();
  });

  ws.on('error', (err) => {
    isConnected = false;
    log('ERROR', `WebSocket error: ${err.message}`);
  });

  ws.on('ping', () => {
    lastPing = Date.now();
  });
}

function scheduleReconnect() {
  if (reconnectAttempts >= 50) {
    log('ERROR', 'Max reconnect attempts reached. Waiting 5 minutes.');
    setTimeout(() => {
      reconnectAttempts = 0;
      scheduleReconnect();
    }, 300000);
    return;
  }

  const delay = Math.min(
    CONFIG.reconnectBaseDelay * Math.pow(2, reconnectAttempts) + Math.random() * 1000,
    CONFIG.reconnectMaxDelay
  );
  reconnectAttempts++;

  log('INFO', `Reconnecting in ${Math.round(delay / 1000)}s (attempt ${reconnectAttempts})`);
  setTimeout(connect, delay);
}

function send(data) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
  }
}

// ============================================================
// Message Handler
// ============================================================
function handleMessage(msg) {
  switch (msg.type) {
    case 'registered':
      if (msg.agentId && !agentId) {
        agentId = msg.agentId;
        const idFile = path.join(CONFIG.dataDir, 'agent.id');
        try {
          if (!fs.existsSync(CONFIG.dataDir)) fs.mkdirSync(CONFIG.dataDir, { recursive: true });
          fs.writeFileSync(idFile, agentId, 'utf8');
        } catch (e) { /* ignore */ }
      }
      log('INFO', `Registered with agent ID: ${msg.agentId}`);
      break;

    case 'command':
      handleCommand(msg.command, msg.params || {});
      break;

    case 'app_install':
      handleAppInstall(msg);
      break;

    case 'app_uninstall':
      handleAppUninstall(msg);
      break;

    case 'update_available':
      log('INFO', `Update available: v${msg.version} (${msg.filename})`);
      handleUpdate(msg);
      break;

    case 'update_not_available':
      log('INFO', 'Agent is up to date');
      break;

    case 'ticket_reply':
      log('INFO', `Ticket reply from ${msg.username}: ${msg.message}`);
      showNotification(`Reply from ${msg.username}`, msg.message);
      break;

    default:
      log('WARN', `Unknown message type: ${msg.type}`);
  }
}

// ============================================================
// Command Handler
// ============================================================
function handleCommand(command, params) {
  log('INFO', `Received command: ${command}`);

  switch (command) {
    case 'screenshot':
      takeScreenshot();
      break;

    case 'stream':
      if (params.enable !== false) {
        startStreaming(params.interval || 1000);
      } else {
        stopStreaming();
      }
      break;

    case 'mouse_move':
      mouseMove(params.x, params.y);
      break;

    case 'mouse_click':
      mouseClick(params.button || 'left');
      break;

    case 'mouse_right_click':
      mouseClick('right');
      break;

    case 'mouse_dblclick':
      mouseDblClick();
      break;

    case 'mouse_scroll':
      mouseScroll(params.x || 0, params.y || -120);
      break;

    case 'key_press':
      keyPress(params.key, params.modifiers || []);
      break;

    case 'key_type':
      keyType(params.text || '');
      break;

    case 'screensaver':
      if (params.enable !== false) {
        showScreensaver(params.message || 'System Update in Progress...');
      } else {
        hideScreensaver();
      }
      break;

    case 'app_list':
      listApps();
      break;

    case 'exec':
      executeCommand(params.command, params.timeout || 30000);
      break;

    case 'download_execute':
      downloadAndExecute(params.url, params.filename);
      break;

    case 'update':
      checkForUpdates();
      break;

    case 'ping':
      send({ type: 'pong', agentId, timestamp: new Date().toISOString() });
      break;

    default:
      send({ type: 'command_result', agentId, command, error: `Unknown command: ${command}` });
  }
}

// ============================================================
// Screenshot
// ============================================================
function takeScreenshot() {
  let cmd = '';
  let args = [];
  let outputFile = path.join(CONFIG.dataDir, `screenshot_${Date.now()}.png`);

  if (IS_WINDOWS) {
    // Use PowerShell to take screenshot via .NET
    const psScript = `
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$screen = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
$bitmap = New-Object System.Drawing.Bitmap($screen.Width, $screen.Height)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.CopyFromScreen($screen.Location, [System.Drawing.Point]::Empty, $screen.Size)
$bitmap.Save('${outputFile.replace(/\\/g, '\\\\')}')
$graphics.Dispose()
$bitmap.Dispose()
Write-Output '${outputFile}'
`;
    const psFile = path.join(CONFIG.dataDir, 'screenshot.ps1');
    fs.writeFileSync(psFile, psScript, 'utf8');
    cmd = 'powershell';
    args = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', psFile];
  } else if (IS_LINUX) {
    // Try import (ImageMagick), then gnome-screenshot, then scrot
    cmd = 'bash';
    args = ['-c', `import -window root "${outputFile}" 2>/dev/null || gnome-screenshot -f "${outputFile}" 2>/dev/null || scrot "${outputFile}" 2>/dev/null || echo "FAILED"`];
  } else if (IS_MAC) {
    cmd = 'screencapture';
    args = ['-x', outputFile];
  }

  execFile(cmd, args, (error, stdout, stderr) => {
    if (error || !fs.existsSync(outputFile)) {
      // Try alternative method for Windows
      if (IS_WINDOWS) {
        const altOutput = path.join(CONFIG.dataDir, `screenshot_${Date.now()}.png`);
        const nircmd = path.join(CONFIG.dataDir, 'nircmd.exe');
        exec(`nircmd savescreenshot "${altOutput}"`, { timeout: 10000 }, (err2, out2) => {
          if (!err2 && fs.existsSync(altOutput)) {
            sendScreenshot(altOutput);
          } else {
            send({ type: 'screenshot_result', agentId, error: 'Failed to take screenshot', data: null });
          }
        });
        return;
      }
      send({ type: 'screenshot_result', agentId, error: 'Failed to take screenshot', data: null });
      return;
    }

    sendScreenshot(outputFile);
  });
}

function sendScreenshot(filePath) {
  try {
    const imageData = fs.readFileSync(filePath);
    const base64 = imageData.toString('base64');
    send({ type: 'screenshot_result', agentId, data: base64 });

    // Clean up
    try { fs.unlinkSync(filePath); } catch (e) { /* ignore */ }
  } catch (err) {
    send({ type: 'screenshot_result', agentId, error: err.message, data: null });
  }
}

function execFile(cmd, args, callback) {
  const child = spawn(cmd, args, { timeout: 15000, windowsHide: true });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (d) => { stdout += d.toString(); });
  child.stderr.on('data', (d) => { stderr += d.toString(); });
  child.on('close', (code) => { callback(code !== 0 ? new Error(stderr) : null, stdout, stderr); });
  child.on('error', (err) => { callback(err, '', ''); });
}

// ============================================================
// Screen Streaming
// ============================================================
function startStreaming(interval) {
  if (isStreaming) return;
  isStreaming = true;
  log('INFO', 'Starting screen stream');

  streamInterval = setInterval(() => {
    if (!isStreaming || !isConnected) {
      stopStreaming();
      return;
    }
    takeScreenshot();
  }, interval || 1000);
}

function stopStreaming() {
  if (streamInterval) {
    clearInterval(streamInterval);
    streamInterval = null;
  }
  isStreaming = false;
  log('INFO', 'Screen stream stopped');
}

// ============================================================
// Mouse Control
// ============================================================
function mouseMove(x, y) {
  if (IS_WINDOWS) {
    const psScript = `
Add-Type -AssemblyName System.Windows.Forms
[System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point(${x}, ${y})
`;
    runPowerShell(psScript);
  } else if (IS_LINUX) {
    exec(`xdotool mousemove ${x} ${y}`, { timeout: 5000 }).catch(() => {});
  } else if (IS_MAC) {
    exec(`cliclick m:${x},${y}`, { timeout: 5000 }).catch(() => {});
  }
}

function mouseClick(button) {
  if (IS_WINDOWS) {
    const psScript = `
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Runtime.InteropServices
$signature = '[DllImport("user32.dll")] public static extern void mouse_event(uint flags, uint dx, uint dy, uint cButtons, uint dwExtraInfo);'
$type = Add-Type -MemberDefinition $signature -Name 'Win32' -Namespace 'API' -PassThru
$leftDown = 0x02; $leftUp = 0x04; $rightDown = 0x08; $rightUp = 0x10
if ('${button}' -eq 'right') {
  $type::mouse_event($rightDown, 0, 0, 0, 0)
  $type::mouse_event($rightUp, 0, 0, 0, 0)
} else {
  $type::mouse_event($leftDown, 0, 0, 0, 0)
  $type::mouse_event($leftUp, 0, 0, 0, 0)
}
`;
    runPowerShell(psScript);
  } else if (IS_LINUX) {
    const btn = button === 'right' ? 3 : 1;
    exec(`xdotool click ${btn}`, { timeout: 5000 }).catch(() => {});
  } else if (IS_MAC) {
    const btn = button === 'right' ? 'rc' : 'c';
    exec(`cliclick ${btn}`, { timeout: 5000 }).catch(() => {});
  }
}

function mouseDblClick() {
  if (IS_WINDOWS) {
    const psScript = `
Add-Type -AssemblyName System.Windows.Forms
[System.Windows.Forms.SendKeys]::SendWait("")
Add-Type -AssemblyName System.Runtime.InteropServices
$signature = '[DllImport("user32.dll")] public static extern void mouse_event(uint flags, uint dx, uint dy, uint cButtons, uint dwExtraInfo);'
$type = Add-Type -MemberDefinition $signature -Name 'Win32' -Namespace 'API' -PassThru
$leftDown = 0x02; $leftUp = 0x04
$type::mouse_event($leftDown, 0, 0, 0, 0)
$type::mouse_event($leftUp, 0, 0, 0, 0)
Start-Sleep -Milliseconds 50
$type::mouse_event($leftDown, 0, 0, 0, 0)
$type::mouse_event($leftUp, 0, 0, 0, 0)
`;
    runPowerShell(psScript);
  } else if (IS_LINUX) {
    exec('xdotool click --repeat 2 1', { timeout: 5000 }).catch(() => {});
  } else if (IS_MAC) {
    exec('cliclick c:c', { timeout: 5000 }).catch(() => {});
  }
}

function mouseScroll(x, y) {
  if (IS_WINDOWS) {
    const psScript = `
Add-Type -AssemblyName System.Windows.Forms
[System.Windows.Forms.SendKeys]::SendWait("{${y > 0 ? 'PGDN' : 'PGUP'}}")
`;
    runPowerShell(psScript);
  } else if (IS_LINUX) {
    const button = y > 0 ? 5 : 4;
    exec(`xdotool click --repeat ${Math.abs(Math.floor(y / 120))} ${button}`, { timeout: 5000 }).catch(() => {});
  } else if (IS_MAC) {
    exec(`cliclick kd:shift m:${x || 400},${y > 0 ? 500 : 100} ku:shift`, { timeout: 5000 }).catch(() => {});
  }
}

// ============================================================
// Keyboard Control
// ============================================================
function keyPress(key, modifiers) {
  if (IS_WINDOWS) {
    let psKey = key;
    const keyMap = {
      'enter': '~', 'tab': '{TAB}', 'escape': '{ESC}', 'backspace': '{BACKSPACE}',
      'delete': '{DELETE}', 'up': '{UP}', 'down': '{DOWN}', 'left': '{LEFT}', 'right': '{RIGHT}',
      'home': '{HOME}', 'end': '{END}', 'pageup': '{PGUP}', 'pagedown': '{PGDN}',
      'f1': '{F1}', 'f2': '{F2}', 'f3': '{F3}', 'f4': '{F4}', 'f5': '{F5}', 'f6': '{F6}',
      'f7': '{F7}', 'f8': '{F8}', 'f9': '{F9}', 'f10': '{F10}', 'f11': '{F11}', 'f12': '{F12}',
    };
    if (keyMap[key.toLowerCase()]) psKey = keyMap[key.toLowerCase()];

    let prefix = '';
    if (modifiers.includes('ctrl')) prefix += '^';
    if (modifiers.includes('alt')) prefix += '%';
    if (modifiers.includes('shift')) prefix += '+';

    const psScript = `
Add-Type -AssemblyName System.Windows.Forms
[System.Windows.Forms.SendKeys]::SendWait("${prefix}${psKey}")
`;
    runPowerShell(psScript);
  } else if (IS_LINUX) {
    let xdoKey = key;
    const keyMap = {
      'enter': 'Return', 'tab': 'Tab', 'escape': 'Escape', 'backspace': 'BackSpace',
      'delete': 'Delete', 'up': 'Up', 'down': 'Down', 'left': 'Left', 'right': 'Right',
      'home': 'Home', 'end': 'End', 'pageup': 'Page_Up', 'pagedown': 'Page_Down',
      ' ': 'space',
    };
    if (keyMap[key.toLowerCase()]) xdoKey = keyMap[key.toLowerCase()];

    let cmd = 'xdotool key';
    if (modifiers.includes('ctrl')) cmd += ' ctrl';
    if (modifiers.includes('alt')) cmd += ' alt';
    if (modifiers.includes('shift')) cmd += ' shift';
    cmd += ` ${xdoKey}`;
    exec(cmd, { timeout: 5000 }).catch(() => {});
  } else if (IS_MAC) {
    let macKey = key;
    const keyMap = {
      'enter': 'return', 'tab': 'tab', 'escape': 'escape', 'backspace': 'del',
      'delete': 'forwarddelete', 'up': 'up', 'down': 'down', 'left': 'left', 'right': 'right',
    };
    if (keyMap[key.toLowerCase()]) macKey = keyMap[key.toLowerCase()];

    let cmd = 'cliclick';
    if (modifiers.includes('ctrl')) cmd += ' kd:command';
    if (modifiers.includes('alt')) cmd += ' kd:option';
    if (modifiers.includes('shift')) cmd += ' kd:shift';
    cmd += ` k:${macKey}`;
    if (modifiers.includes('ctrl')) cmd += ' ku:command';
    if (modifiers.includes('alt')) cmd += ' ku:option';
    if (modifiers.includes('shift')) cmd += ' ku:shift';
    exec(cmd, { timeout: 5000 }).catch(() => {});
  }
}

function keyType(text) {
  if (IS_WINDOWS) {
    const escaped = text.replace(/[{}+^~()%]/g, (c) => `{${c}}`);
    const psScript = `
Add-Type -AssemblyName System.Windows.Forms
[System.Windows.Forms.SendKeys]::SendWait("${escaped}")
`;
    runPowerShell(psScript);
  } else if (IS_LINUX) {
    const escaped = text.replace(/'/g, "'\\''");
    exec(`xdotool type '${escaped}'`, { timeout: 10000 }).catch(() => {});
  } else if (IS_MAC) {
    const escaped = text.replace(/'/g, "'\\''");
    exec(`cliclick t:'${escaped}'`, { timeout: 10000 }).catch(() => {});
  }
}

// ============================================================
// Screensaver Overlay
// ============================================================
let screensaverProcess = null;

function showScreensaver(message) {
  hideScreensaver();

  if (IS_WINDOWS) {
    const html = buildScreensaverHTML(message);
    const htmlFile = path.join(CONFIG.dataDir, 'screensaver.html');
    fs.writeFileSync(htmlFile, html, 'utf8');

    const psScript = `
Add-Type -AssemblyName System.Windows.Forms
$form = New-Object System.Windows.Forms.Form
$form.FormBorderStyle = [System.Windows.Forms.FormBorderStyle]::None
$form.WindowState = [System.Windows.Forms.FormWindowState]::Maximized
$form.TopMost = $true
$form.BackColor = [System.Drawing.Color]::Black
$web = New-Object System.Windows.Forms.WebBrowser
$web.Dock = [System.Windows.Forms.DockStyle]::Fill
$web.Navigate("${htmlFile.replace(/\\/g, '\\\\')}")
$form.Controls.Add($web)
$form.Add_KeyDown({ param $sender, $e
  if ($e.KeyCode -eq [System.Windows.Forms.Keys]::Escape) {
    $form.Close()
  }
})
$form.Show()
[Console]::WriteLine("SCREENSAVER_STARTED")
while ($form.Visible) { Start-Sleep -Milliseconds 500 }
[Console]::WriteLine("SCREENSAVER_ENDED")
`;
    const psFile = path.join(CONFIG.dataDir, 'screensaver.ps1');
    fs.writeFileSync(psFile, psScript, 'utf8');
    screensaverProcess = spawn('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', psFile], { windowsHide: false, detached: true });
    screensaverProcess.unref();
  } else if (IS_LINUX) {
    const html = buildScreensaverHTML(message);
    const htmlFile = path.join(CONFIG.dataDir, 'screensaver.html');
    fs.writeFileSync(htmlFile, html, 'utf8');
    screensaverProcess = spawn('zenity', ['--html', '--fullscreen', htmlFile], { detached: true });
    screensaverProcess.unref();
  }
}

function hideScreensaver() {
  if (screensaverProcess) {
    try {
      screensaverProcess.kill('SIGTERM');
    } catch (e) { /* ignore */ }
    screensaverProcess = null;
  }
  if (IS_WINDOWS) {
    exec('taskkill /f /im powershell.exe /fi "WINDOWTITLE eq screensaver*" 2>nul', { timeout: 5000 }).catch(() => {});
  }
}

function buildScreensaverHTML(message) {
  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><title>System Update</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{background:#000;display:flex;align-items:center;justify-content:center;height:100vh;font-family:-apple-system,sans-serif;color:#fff;overflow:hidden}
.container{text-align:center;max-width:600px;padding:40px}
.spinner{width:60px;height:60px;border:4px solid rgba(255,255,255,0.1);border-top-color:#f97316;border-radius:50%;animation:spin 1s linear infinite;margin:0 auto 30px}
@keyframes spin{to{transform:rotate(360deg)}}
h1{font-size:24px;margin-bottom:16px;font-weight:600}
p{font-size:16px;color:#a1a1aa;line-height:1.6}
.progress{width:100%;height:4px;background:#27272a;border-radius:2px;margin-top:30px;overflow:hidden}
.progress-bar{height:100%;background:linear-gradient(90deg,#f97316,#ea580c);border-radius:2px;animation:progress 8s ease-in-out infinite}
@keyframes progress{0%{width:0}50%{width:80%}100%{width:100%}}
</style></head>
<body>
<div class="container">
  <div class="spinner"></div>
  <h1>${message}</h1>
  <p>Please do not turn off your computer.<br>This process may take a few minutes.</p>
  <div class="progress"><div class="progress-bar"></div></div>
</div>
</body>
</html>`;
}

// ============================================================
// App Management
// ============================================================
function listApps() {
  let cmd = '';
  if (IS_WINDOWS) {
    cmd = 'powershell -NoProfile -Command "Get-ItemProperty HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*,HKLM:\\Software\\Wow6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\* | Where-Object { $_.DisplayName } | Select-Object DisplayName,DisplayVersion,Publisher | ConvertTo-Json -Depth 2"';
  } else if (IS_LINUX) {
    cmd = "dpkg-query -W -f='${Package}|${Version}|${Maintainer}\\n' 2>/dev/null || rpm -qa --queryformat '%{NAME}|%{VERSION}|%{VENDOR}\\n' 2>/dev/null || echo 'NO_PKG_MANAGER'";
  }

  exec(cmd, { timeout: 30000, maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
    let apps = [];

    if (IS_WINDOWS) {
      try {
        const parsed = JSON.parse(stdout);
        const list = Array.isArray(parsed) ? parsed : [parsed];
        apps = list.map((item) => ({
          name: item.DisplayName || 'Unknown',
          version: item.DisplayVersion || '',
          publisher: item.Publisher || '',
        })).filter(a => a.name && a.name !== 'Unknown');
      } catch (e) {
        apps = [{ name: 'Parse Error', version: '', publisher: e.message }];
      }
    } else if (IS_LINUX) {
      const lines = stdout.trim().split('\n').filter(l => l && l !== 'NO_PKG_MANAGER');
      apps = lines.map((line) => {
        const [name, version, publisher] = line.split('|');
        return { name: name || '', version: version || '', publisher: publisher || '' };
      }).filter(a => a.name);
    }

    send({ type: 'app_list_result', agentId, apps });
  });
}

function handleAppInstall(msg) {
  const { name, installCmd, platform } = msg;
  log('INFO', `Installing ${name}: ${installCmd}`);

  // Map install commands for agent platform
  let finalCmd = installCmd;
  if (IS_WINDOWS) {
    // Add --accept-package-agreements and --accept-source-agreements for winget
    if (finalCmd.includes('winget install')) {
      finalCmd += ' --accept-package-agreements --accept-source-agreements --silent';
    } else if (finalCmd.includes('choco install')) {
      finalCmd += ' -y';
    }
  } else if (IS_LINUX) {
    // Add -y for apt
    if (finalCmd.includes('apt install') && !finalCmd.includes('-y')) {
      finalCmd += ' -y';
    }
  }

  exec(finalCmd, { timeout: 300000, windowsHide: true }, (error, stdout, stderr) => {
    const success = !error;
    const resultMsg = success ? `${name} installed successfully` : `Failed to install ${name}: ${stderr || error.message}`;
    log('INFO', resultMsg);

    send({
      type: 'install_result',
      agentId,
      appId: msg.appId,
      success,
      message: resultMsg,
      stdout: stdout ? stdout.substring(0, 1000) : '',
      stderr: stderr ? stderr.substring(0, 1000) : '',
    });
  });
}

function handleAppUninstall(msg) {
  const { name, uninstallCmd } = msg;
  log('INFO', `Uninstalling ${name}: ${uninstallCmd}`);

  let finalCmd = uninstallCmd || '';
  if (!finalCmd) {
    send({ type: 'install_result', agentId, appId: msg.appId, success: false, message: 'No uninstall command provided' });
    return;
  }

  if (IS_WINDOWS) {
    if (finalCmd.includes('winget uninstall')) {
      finalCmd += ' --silent';
    } else if (finalCmd.includes('choco uninstall')) {
      finalCmd += ' -y';
    }
  }

  exec(finalCmd, { timeout: 300000, windowsHide: true }, (error, stdout, stderr) => {
    const success = !error;
    send({
      type: 'install_result',
      agentId,
      appId: msg.appId,
      success,
      message: success ? `${name} uninstalled successfully` : `Failed to uninstall ${name}: ${stderr || error.message}`,
    });
  });
}

// ============================================================
// Command Execution
// ============================================================
function executeCommand(command, timeout) {
  log('INFO', `Executing: ${command}`);
  const commandId = crypto.randomBytes(8).toString('hex');

  const child = spawn(IS_WINDOWS ? 'cmd.exe' : 'bash', IS_WINDOWS ? ['/c', command] : ['-c', command], {
    timeout: timeout || 30000,
    windowsHide: true,
    cwd: os.homedir(),
    env: { ...process.env },
  });

  let stdout = '';
  let stderr = '';

  child.stdout.on('data', (d) => { stdout += d.toString(); });
  child.stderr.on('data', (d) => { stderr += d.toString(); });

  child.on('close', (exitCode) => {
    send({
      type: 'exec_result',
      agentId,
      commandId,
      command,
      stdout: stdout.substring(0, 100000),
      stderr: stderr.substring(0, 100000),
      exitCode,
    });
  });

  child.on('error', (err) => {
    send({
      type: 'exec_result',
      agentId,
      commandId,
      command,
      stdout: '',
      stderr: err.message,
      exitCode: -1,
    });
  });
}

// ============================================================
// Download & Execute
// ============================================================
function downloadAndExecute(fileUrl, filename) {
  log('INFO', `Downloading: ${fileUrl}`);

  const protocol = fileUrl.startsWith('https') ? https : http;
  const destPath = path.join(CONFIG.dataDir, filename || path.basename(fileUrl) || 'download.exe');

  const file = fs.createWriteStream(destPath);
  protocol.get(fileUrl, (response) => {
    if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
      file.close();
      try { fs.unlinkSync(destPath); } catch (e) { /* ignore */ }
      downloadAndExecute(response.headers.location, filename);
      return;
    }

    response.pipe(file);
    file.on('finish', () => {
      file.close();
      log('INFO', `Downloaded to ${destPath}. Executing...`);

      const child = spawn(destPath, { detached: true, windowsHide: true, stdio: 'ignore' });
      child.unref();

      send({
        type: 'exec_result',
        agentId,
        commandId: crypto.randomBytes(8).toString('hex'),
        command: `download_execute: ${fileUrl}`,
        stdout: `File downloaded and executed: ${destPath}`,
        stderr: '',
        exitCode: 0,
      });
    });
  }).on('error', (err) => {
    file.close();
    try { fs.unlinkSync(destPath); } catch (e) { /* ignore */ }
    send({
      type: 'exec_result',
      agentId,
      commandId: crypto.randomBytes(8).toString('hex'),
      command: `download_execute: ${fileUrl}`,
      stdout: '',
      stderr: err.message,
      exitCode: -1,
    });
  });
}

// ============================================================
// Self-Update
// ============================================================
function checkForUpdates() {
  send({ type: 'update_check' });
}

function handleUpdate(msg) {
  const { version, filename, downloadUrl, fileSize } = msg;
  log('INFO', `Updating to v${version}: ${filename}`);

  const protocol = downloadUrl.startsWith('https') ? https : http;
  const destPath = path.join(CONFIG.dataDir, filename);

  const file = fs.createWriteStream(destPath);
  protocol.get(downloadUrl, (response) => {
    response.pipe(file);
    file.on('finish', () => {
      file.close();
      log('INFO', `Update downloaded to ${destPath}`);

      // On Windows, create a batch script to replace the agent
      if (IS_WINDOWS) {
        const batchScript = `
@echo off
timeout /t 3 /nobreak >nul
copy /y "${destPath}" "%~dp0agent.exe"
del "${destPath}"
start "" "%~dp0agent.exe"
del "%~f0"
`;
        const batchFile = path.join(CONFIG.dataDir, 'update_agent.bat');
        fs.writeFileSync(batchFile, batchScript, 'utf8');
        spawn(batchFile, { detached: true, windowsHide: true, stdio: 'ignore' }).unref();
      } else {
        const shellScript = `#!/bin/bash
sleep 3
cp "${destPath}" "$(dirname "$0")/agent"
chmod +x "$(dirname "$0")/agent"
rm -f "${destPath}"
nohup "$(dirname "$0")/agent" &
rm -f "$0"
`;
        const scriptFile = path.join(CONFIG.dataDir, 'update_agent.sh');
        fs.writeFileSync(scriptFile, shellScript, 'utf8');
        spawn('bash', [scriptFile], { detached: true, stdio: 'ignore' }).unref();
      }

      log('INFO', 'Update will be applied on restart. Shutting down...');
      setTimeout(() => {
        process.exit(0);
      }, 2000);
    });
  }).on('error', (err) => {
    log('ERROR', `Update download failed: ${err.message}`);
  });
}

// ============================================================
// PowerShell Helper
// ============================================================
function runPowerShell(script) {
  const psFile = path.join(CONFIG.dataDir, `cmd_${Date.now()}.ps1`);
  fs.writeFileSync(psFile, script, 'utf8');

  spawn('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', psFile, '-WindowStyle', 'Hidden'], {
    windowsHide: true,
    detached: true,
    stdio: 'ignore',
  }).unref();

  // Clean up after a delay
  setTimeout(() => {
    try { fs.unlinkSync(psFile); } catch (e) { /* ignore */ }
  }, 5000);
}

// ============================================================
// Notification (Desktop)
// ============================================================
function showNotification(title, body) {
  if (IS_WINDOWS) {
    const psScript = `
[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null
[Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime] | Out-Null
$template = @"
<toast>
  <visual>
    <binding template="ToastGeneric">
      <text>${title}</text>
      <text>${body}</text>
    </binding>
  </visual>
</toast>
"@
$xml = New-Object Windows.Data.Xml.Dom.XmlDocument
$xml.LoadXml($template)
$toast = [Windows.UI.Notifications.ToastNotification]::new($xml)
[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier("RemoteAdmin").Show($toast)
`;
    runPowerShell(psScript);
  } else if (IS_LINUX) {
    exec(`notify-send "${title}" "${body}"`, { timeout: 5000 }).catch(() => {});
  } else if (IS_MAC) {
    exec(`osascript -e 'display notification "${body}" with title "${title}"'`, { timeout: 5000 }).catch(() => {});
  }
}

// ============================================================
// Auto-Start Setup
// ============================================================
function setupAutoStart() {
  const appName = 'RemoteAdmin Agent';

  if (IS_WINDOWS) {
    const startupFolder = path.join(os.homedir(), 'AppData', 'Roaming', 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup');
    const vbsFile = path.join(startupFolder, 'RemoteAdminAgent.vbs');
    const scriptPath = path.resolve(process.argv[1]);

    // Create a VBS wrapper to run hidden
    const vbsContent = `Set WshShell = CreateObject("WScript.Shell")
WshShell.Run "node ""${scriptPath}"" --server ${CONFIG.serverUrl}", 0, False
`;
    try {
      if (!fs.existsSync(startupFolder)) {
        fs.mkdirSync(startupFolder, { recursive: true });
      }
      fs.writeFileSync(vbsFile, vbsContent, 'utf8');
      log('INFO', `Auto-start entry created: ${vbsFile}`);
    } catch (err) {
      log('ERROR', `Failed to create auto-start: ${err.message}`);
    }
  } else if (IS_LINUX) {
    const autostartDir = path.join(os.homedir(), '.config', 'autostart');
    const desktopFile = path.join(autostartDir, 'remoteadmin-agent.desktop');
    const scriptPath = path.resolve(process.argv[1]);

    const desktopContent = `[Desktop Entry]
Type=Application
Name=RemoteAdmin Agent
Exec=node ${scriptPath} --server ${CONFIG.serverUrl}
Icon=system-monitor
Comment=RemoteAdmin v4 Agent
Terminal=false
Hidden=true
X-GNOME-Autostart-enabled=true
`;
    try {
      if (!fs.existsSync(autostartDir)) {
        fs.mkdirSync(autostartDir, { recursive: true });
      }
      fs.writeFileSync(desktopFile, desktopContent, 'utf8');
      log('INFO', `Auto-start entry created: ${desktopFile}`);
    } catch (err) {
      log('ERROR', `Failed to create auto-start: ${err.message}`);
    }
  } else if (IS_MAC) {
    const launchAgentsDir = path.join(os.homedir(), 'Library', 'LaunchAgents');
    const plistFile = path.join(launchAgentsDir, 'com.remoteadmin.agent.plist');
    const scriptPath = path.resolve(process.argv[1]);

    const plistContent = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.remoteadmin.agent</string>
  <key>ProgramArguments</key>
  <array>
    <string>node</string>
    <string>${scriptPath}</string>
    <string>--server</string>
    <string>${CONFIG.serverUrl}</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>${path.join(CONFIG.dataDir, 'agent.log')}</string>
  <key>StandardErrorPath</key>
  <string>${path.join(CONFIG.dataDir, 'agent-error.log')}</string>
</dict>
</plist>
`;
    try {
      if (!fs.existsSync(launchAgentsDir)) {
        fs.mkdirSync(launchAgentsDir, { recursive: true });
      }
      fs.writeFileSync(plistFile, plistContent, 'utf8');
      log('INFO', `Auto-start entry created: ${plistFile}`);
    } catch (err) {
      log('ERROR', `Failed to create auto-start: ${err.message}`);
    }
  }
}

// ============================================================
// Stealth Mode
// ============================================================
function enableStealth() {
  if (IS_WINDOWS) {
    // Set console window to hidden
    try {
      const { stdout: pid } = execSync('powershell -NoProfile -Command "(Get-Process -Id $PID).MainWindowHandle"', { encoding: 'utf8', timeout: 3000 });
    } catch (e) { /* ignore */ }

    // Hide the process window on Windows
    const kernel32 = process.binding('spawn_sync');
    if (process.stdout.isTTY) {
      try {
        const { default: ref } = require('ref-napi') || {};
      } catch (e) { /* ref-napi not available */ }
    }
  }
  // On Linux/Mac, daemonize by forking
  if (IS_LINUX || IS_MAC) {
    if (typeof process.stdin.setRawMode === 'function') {
      process.stdin.setRawMode(false);
    }
    if (process.stdout.isTTY) {
      process.stdout.destroy();
    }
    if (process.stderr.isTTY) {
      process.stderr.destroy();
    }
  }
}

// Open App Window (like a native Windows app)
function openAppWindow() {
  const url = `http://127.0.0.1:${CONFIG.localPort}`;

  if (IS_WINDOWS) {
    const edgePaths = [
      process.env.ProgramFiles + '\\Microsoft\\Edge\\Application\\msedge.exe',
      process.env['ProgramFiles(x86)'] + '\\Microsoft\\Edge\\Application\\msedge.exe',
    ];
    for (const ep of edgePaths) {
      if (fs.existsSync(ep)) {
        spawn(ep, [`--app=${url}`, '--window-size=960x680', '--window-position=center', '--disable-extensions'], { detached: true, stdio: 'ignore' });
        log('INFO', 'Opened app window in Edge (app mode)');
        return;
      }
    }
    const chromePaths = [
      process.env.ProgramFiles + '\\Google\\Chrome\\Application\\chrome.exe',
      process.env['ProgramFiles(x86)'] + '\\Google\\Chrome\\Application\\chrome.exe',
      process.env.LOCALAPPDATA + '\\Google\\Chrome\\Application\\chrome.exe',
    ];
    for (const cp of chromePaths) {
      if (fs.existsSync(cp)) {
        spawn(cp, [`--app=${url}`, '--window-size=960x680', '--window-position=center'], { detached: true, stdio: 'ignore' });
        log('INFO', 'Opened app window in Chrome (app mode)');
        return;
      }
    }
    exec(`start "" "${url}"`, () => {});
    log('INFO', 'Opened app in default browser');
  } else if (IS_LINUX) {
    exec('xdg-open ' + url + ' 2>/dev/null || gnome-open ' + url + ' 2>/dev/null &', () => {});
    log('INFO', 'Opened app window');
  } else {
    exec('open ' + url, () => {});
    log('INFO', 'Opened app window');
  }
}

// ============================================================
// Local HTTP Server (Store + Tickets)
// ============================================================
function startLocalServer() {
  const server = http.createServer((req, res) => {
    const parsed = url.parse(req.url, true);
    const pathname = parsed.pathname;

    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    // Main app page (Windows app-style dashboard)
    if (pathname === '/' || pathname === '/index.html') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(buildMainAppHTML());
      return;
    }

    // Store page
    if (pathname === '/store' || pathname === '/store/') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(buildStoreHTML());
      return;
    }

    // Store API - get apps
    if (pathname === '/api/store' && req.method === 'GET') {
      // Proxy to server
      proxyToServer('/api/agent/store', { agentId }, res);
      return;
    }

    // Store API - install app
    if (pathname === '/api/store/install' && req.method === 'POST') {
      let body = '';
      req.on('data', (chunk) => { body += chunk; });
      req.on('end', () => {
        try {
          const data = JSON.parse(body);
          if (isConnected) {
            send({
              type: 'command',
              command: 'app_install',
              params: data,
            });
          }
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, message: 'Install command sent' }));
        } catch (e) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invalid JSON' }));
        }
      });
      return;
    }

    // Tickets page
    if (pathname === '/tickets' || pathname === '/tickets/') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(buildTicketHTML());
      return;
    }

    // Tickets API - submit ticket
    if (pathname === '/api/tickets' && req.method === 'POST') {
      let body = '';
      req.on('data', (chunk) => { body += chunk; });
      req.on('end', () => {
        try {
          const data = JSON.parse(body);
          data.agentId = agentId;
          data.agentToken = agentId;

          if (isConnected) {
            send({
              type: 'ticket_created',
              agentId,
              subject: data.subject,
              message: data.message,
              priority: data.priority || 'normal',
            });
          }

          res.writeHead(201, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, message: 'Ticket submitted' }));
        } catch (e) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invalid JSON' }));
        }
      });
      return;
    }

    // Metrics endpoint (for local monitoring)
    if (pathname === '/api/metrics' && req.method === 'GET') {
      const metrics = getMetrics();
      const info = getSystemInfo();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ...info, ...metrics, agentId, connected: isConnected }));
      return;
    }

    res.writeHead(404, { 'Content-Type': 'text/html' });
    res.end('<h1>404 Not Found</h1>');
  });

  server.listen(CONFIG.localPort, '127.0.0.1', () => {
    log('INFO', `Local HTTP server running on http://127.0.0.1:${CONFIG.localPort}`);
    log('INFO', `  App:    http://127.0.0.1:${CONFIG.localPort}/`);
    log('INFO', `  Store:  http://127.0.0.1:${CONFIG.localPort}/store`);
    log('INFO', `  Tickets: http://127.0.0.1:${CONFIG.localPort}/tickets`);

    // Open app window (Windows: Edge/Chrome app mode, Linux: xdg-open)
    if (!CONFIG.stealth) {
      setTimeout(() => openAppWindow(), 1000);
    }
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      log('WARN', `Port ${CONFIG.localPort} already in use, trying ${CONFIG.localPort + 1}`);
      CONFIG.localPort++;
      startLocalServer();
    } else {
      log('ERROR', `Local server error: ${err.message}`);
    }
  });

  return server;
}

function proxyToServer(path, data, res) {
  if (!CONFIG.serverUrl) {
    res.writeHead(502, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Server URL not configured' }));
    return;
  }

  const httpUrl = CONFIG.serverUrl.replace('ws://', 'http://').replace('wss://', 'https://').replace(/\/ws\/agent$/, '');

  const postData = JSON.stringify(data);
  const parsedUrl = url.parse(httpUrl + path);

  const options = {
    hostname: parsedUrl.hostname,
    port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
    path: parsedUrl.pathname,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(postData),
    },
    rejectUnauthorized: false,
  };

  const req = http.request(options, (response) => {
    let body = '';
    response.on('data', (chunk) => { body += chunk; });
    response.on('end', () => {
      res.writeHead(response.statusCode, { 'Content-Type': 'application/json' });
      res.end(body);
    });
  });

  req.on('error', (err) => {
    res.writeHead(502, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: err.message }));
  });

  req.write(postData);
  req.end();
}

// ============================================================
// Local HTML Pages
// ============================================================
function buildMainAppHTML() {
  return `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>RemoteAdmin Agent</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Segoe UI',system-ui,-apple-system,sans-serif;background:#f0f2f5;color:#1a1a2e;min-height:100vh;overflow:hidden}
.app{display:flex;flex-direction:column;height:100vh}
.header{background:linear-gradient(135deg,#1e293b,#0f172a);color:white;padding:0;height:48px;display:flex;align-items:center;flex-shrink:0;user-select:none}
.header-icon{width:48px;height:48px;display:flex;align-items:center;justify-content:center;font-size:20px;background:linear-gradient(135deg,#f97316,#ea580c);flex-shrink:0}
.header h1{font-size:14px;font-weight:600;padding:0 16px;flex:1}
.header-status{display:flex;align-items:center;gap:8px;padding-right:16px}
.status-dot{width:8px;height:8px;border-radius:50%;background:#22c55e}
.status-dot.offline{background:#ef4444}
.status-text{font-size:12px;opacity:0.8}
.header-btn{background:rgba(255,255,255,0.1);border:none;color:white;padding:6px 12px;border-radius:6px;font-size:12px;cursor:pointer;transition:background 0.2s}
.header-btn:hover{background:rgba(255,255,255,0.2)}
.tabs{display:flex;background:white;border-bottom:1px solid #e2e8f0;flex-shrink:0}
.tab{padding:12px 24px;font-size:13px;font-weight:600;color:#64748b;cursor:pointer;border-bottom:2px solid transparent;transition:all 0.2s;user-select:none}
.tab:hover{color:#334155;background:#f8fafc}
.tab.active{color:#f97316;border-bottom-color:#f97316;background:#fff7ed}
.content{flex:1;overflow-y:auto;background:#f8fafc}
.page{display:none;height:100%}
.page.active{display:block}
.empty-state{text-align:center;padding:80px 20px;color:#94a3b8}
.empty-state .icon{font-size:48px;margin-bottom:16px}
.empty-state h2{font-size:18px;color:#64748b;margin-bottom:8px}
.empty-state p{font-size:14px;max-width:400px;margin:0 auto;line-height:1.6}
.metrics-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:16px;padding:20px}
.metric-card{background:white;border-radius:12px;padding:20px;box-shadow:0 1px 3px rgba(0,0,0,0.06)}
.metric-label{font-size:12px;color:#94a3b8;font-weight:500;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px}
.metric-value{font-size:28px;font-weight:700;color:#1e293b}
.metric-sub{font-size:12px;color:#64748b;margin-top:4px}
.metric-icon{float:right;width:32px;height:32px;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:16px}
.metric-icon.blue{background:#dbeafe;color:#3b82f6}
.metric-icon.green{background:#dcfce7;color:#22c55e}
.metric-icon.amber{background:#fef3c7;color:#f59e0b}
.metric-icon.purple{background:#ede9fe;color:#8b5cf6}
.info-section{padding:20px}
.info-section h3{font-size:14px;font-weight:600;color:#334155;margin-bottom:12px}
.info-card{background:white;border-radius:12px;padding:20px;box-shadow:0 1px 3px rgba(0,0,0,0.06)}
.info-row{display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid #f1f5f9;font-size:13px}
.info-row:last-child{border-bottom:none}
.info-key{color:#64748b}
.info-val{color:#1e293b;font-weight:500}
#storeContent,#ticketsContent{height:100%}
#storeContent iframe,#ticketsContent iframe{width:100%;height:100%;border:none}
.badge-updater{position:fixed;bottom:16px;right:16px;background:#f97316;color:white;padding:8px 16px;border-radius:8px;font-size:12px;font-weight:600;box-shadow:0 4px 12px rgba(249,115,22,0.4);z-index:100}
</style>
</head>
<body>
<div class="app">
  <div class="header">
    <div class="header-icon">🛡️</div>
    <h1>RemoteAdmin Agent</h1>
    <div class="header-status">
      <div class="status-dot" id="statusDot"></div>
      <span class="status-text" id="statusText">Проверка...</span>
    </div>
    <button class="header-btn" onclick="loadMetrics()">Обновить</button>
  </div>
  <div class="tabs">
    <div class="tab active" onclick="showTab('overview',this)">📊 Обзор</div>
    <div class="tab" onclick="showTab('store',this)">🛍️ Магазин</div>
    <div class="tab" onclick="showTab('tickets',this)">📋 Заявки</div>
  </div>
  <div class="content">
    <div class="page active" id="page-overview">
      <div id="metricsArea" class="metrics-grid">
        <div class="empty-state"><div class="icon">⏳</div><h2>Загрузка...</h2><p>Получаем информацию о системе</p></div>
      </div>
      <div class="info-section">
        <h3>Информация о системе</h3>
        <div class="info-card" id="sysInfoArea">Загрузка...</div>
      </div>
    </div>
    <div class="page" id="page-store"><div id="storeContent"></div></div>
    <div class="page" id="page-tickets"><div id="ticketsContent"></div></div>
  </div>
</div>
<script>
let currentTab='overview';
function showTab(tab,el){
  document.querySelectorAll('.tab').forEach(t=>t.classList.remove('active'));
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  el.classList.add('active');
  document.getElementById('page-'+tab).classList.add('active');
  currentTab=tab;
  if(tab==='store'&&!document.querySelector('#storeContent iframe')){
    document.getElementById('storeContent').innerHTML='<iframe src="/store"></iframe>';
  }
  if(tab==='tickets'&&!document.querySelector('#ticketsContent iframe')){
    document.getElementById('ticketsContent').innerHTML='<iframe src="/tickets"></iframe>';
  }
  if(tab==='overview') loadMetrics();
}
async function loadMetrics(){
  try{
    const d=await fetch('/api/metrics').then(r=>r.json());
    document.getElementById('statusDot').className=d.connected?'status-dot':'status-dot offline';
    document.getElementById('statusText').textContent=d.connected?'Подключён к серверу':'Не подключён';
    const cpuVal=d.cpu?.toFixed(1)||'?';
    const memVal=d.memory?.toFixed(1)||'?';
    const diskPct=d.diskTotal?Math.round(d.diskUsed/d.diskTotal*100):'?';
    const uptime=d.uptime?Math.floor(d.uptime/3600)+'ч '+Math.floor((d.uptime%3600)/60)+'м':'?';
    document.getElementById('metricsArea').innerHTML=\\`
      <div class="metric-card"><div class="metric-icon blue">💻</div><div class="metric-label">Процессор</div><div class="metric-value">${cpuVal}%</div><div class="metric-sub">Загрузка CPU</div></div>
      <div class="metric-card"><div class="metric-icon green">🧠</div><div class="metric-label">Оперативная память</div><div class="metric-value">${memVal}%</div><div class="metric-sub">Использование RAM</div></div>
      <div class="metric-card"><div class="metric-icon amber">💾</div><div class="metric-label">Диск</div><div class="metric-value">${diskPct}%</div><div class="metric-sub">${d.diskUsed?Math.round(d.diskUsed)+'/'+Math.round(d.diskTotal)+' ГБ':''}</div></div>
      <div class="metric-card"><div class="metric-icon purple">⏱️</div><div class="metric-label">Время работы</div><div class="metric-value" style="font-size:22px">${uptime}</div><div class="metric-sub">Uptime</div></div>
    \\`;
    document.getElementById('sysInfoArea').innerHTML=\\`
      <div class="info-row"><span class="info-key">Компьютер</span><span class="info-val">${d.hostname||'N/A'}</span></div>
      <div class="info-row"><span class="info-key">ОС</span><span class="info-val">${d.os||'N/A'}</span></div>
      <div class="info-row"><span class="info-key">Платформа</span><span class="info-val">${d.platform||'N/A'}</span></div>
      <div class="info-row"><span class="info-key">IP</span><span class="info-val">${d.ip||'N/A'}</span></div>
      <div class="info-row"><span class="info-key">Версия агента</span><span class="info-val">v${d.version||'4.0.0'}</span></div>
      <div class="info-row"><span class="info-key">ID агента</span><span class="info-val" style="font-family:monospace;font-size:11px">${d.agentId||'N/A'}</span></div>
    \\`;
  }catch(e){
    document.getElementById('metricsArea').innerHTML='<div class="empty-state"><div class="icon">❌</div><h2>Ошибка</h2><p>'+e.message+'</p></div>';
  }
}
loadMetrics();
setInterval(()=>{if(currentTab==='overview')loadMetrics()},10000);
</script>
</body>
</html>`;
}

function buildStoreHTML() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>App Store - RemoteAdmin</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#0f1117;color:#e4e4e7;min-height:100vh}
.header{background:linear-gradient(135deg,#18181b,#1f2937);padding:20px 30px;border-bottom:1px solid #27272a;display:flex;align-items:center;justify-content:space-between}
.header h1{font-size:22px;background:linear-gradient(135deg,#f97316,#ef4444);-webkit-background-clip:text;-webkit-text-fill-color:transparent}
.header span{color:#71717a;font-size:13px}
.container{max-width:900px;margin:0 auto;padding:30px}
.search{width:100%;padding:14px 20px;background:#18181b;border:1px solid #27272a;border-radius:10px;color:#e4e4e7;font-size:15px;margin-bottom:24px;outline:none;transition:border-color 0.2s}
.search:focus{border-color:#f97316}
.search::placeholder{color:#52525b}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:16px}
.card{background:#18181b;border:1px solid #27272a;border-radius:12px;padding:20px;transition:border-color 0.2s,transform 0.1s;cursor:default}
.card:hover{border-color:#3f3f46;transform:translateY(-2px)}
.card-icon{font-size:32px;margin-bottom:12px}
.card h3{font-size:16px;font-weight:600;margin-bottom:6px}
.card p{font-size:13px;color:#a1a1aa;line-height:1.5;margin-bottom:14px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.card-meta{display:flex;justify-content:space-between;align-items:center}
.badge{padding:3px 10px;border-radius:9999px;font-size:11px;font-weight:600;background:#27272a;color:#a1a1aa}
.btn{padding:8px 16px;border:none;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;transition:transform 0.1s,opacity 0.2s}
.btn:hover{transform:scale(1.02)}
.btn-primary{background:linear-gradient(135deg,#f97316,#ea580c);color:white}
.btn-success{background:#16a34a;color:white}
.btn-disabled{background:#27272a;color:#52525b;cursor:not-allowed}
.empty{text-align:center;padding:60px;color:#52525b}
.empty-icon{font-size:48px;margin-bottom:16px}
#status{position:fixed;top:16px;right:16px;padding:8px 16px;border-radius:8px;font-size:13px;font-weight:500;z-index:100}
.status-connected{background:#16a34a22;color:#4ade80;border:1px solid #16a34a44}
.status-disconnected{background:#dc262622;color:#f87171;border:1px solid #dc262644}
</style>
</head>
<body>
<div class="header">
  <h1>&#x1F6D2; App Store</h1>
  <span id="agentInfo">Loading...</span>
</div>
<div id="status" class="status-disconnected">Checking connection...</div>
<div class="container">
  <input type="text" class="search" id="searchInput" placeholder="Search applications...">
  <div class="grid" id="appGrid"></div>
</div>
<script>
let apps=[];
let connected=false;
const grid=document.getElementById('appGrid');
const searchInput=document.getElementById('searchInput');
const statusEl=document.getElementById('status');
const agentInfo=document.getElementById('agentInfo');

async function loadApps(){
  try{
    const metrics=await fetch('/api/metrics').then(r=>r.json());
    agentInfo.textContent=metrics.hostname+' | '+metrics.os;
    connected=metrics.connected;
    statusEl.className=connected?'status-connected':'status-disconnected';
    statusEl.textContent=connected?'Connected to server':'Disconnected';
  }catch(e){}

  try{
    const r=await fetch('/api/store?agentId=${agentId}');
    apps=await r.json();
    renderApps(apps);
  }catch(e){
    grid.innerHTML='<div class="empty"><div class="empty-icon">&#x1F50D;</div><p>Could not load apps. Check server connection.</p></div>';
  }
}

function renderApps(list){
  grid.innerHTML=list.map(a=>\`
    <div class="card" data-name="\${a.name.toLowerCase()}">
      <div class="card-icon">\${a.icon||'&#x1F4E6;'}</div>
      <h3>\${a.name}</h3>
      <p>\${a.description||''}</p>
      <div class="card-meta">
        <span class="badge">\${a.category||'General'}</span>
        <button class="btn btn-primary" onclick="installApp('\${a.id}','\${a.name}','\${a.install_cmd.replace(/'/g,"\\\\'")}')">Install</button>
      </div>
    </div>
  \`).join('');
  if(list.length===0){
    grid.innerHTML='<div class="empty"><div class="empty-icon">&#x1F4E6;</div><p>No applications found</p></div>';
  }
}

async function installApp(id,name,cmd){
  if(!connected)return alert('Not connected to server');
  const btn=event.target;
  btn.textContent='Installing...';
  btn.className='btn btn-disabled';
  try{
    await fetch('/api/store/install',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({appId:id,name,installCmd:cmd})
    });
    btn.textContent='Queued';
    btn.className='btn btn-success';
    setTimeout(()=>{btn.textContent='Install';btn.className='btn btn-primary'},3000);
  }catch(e){
    alert('Failed to install: '+e.message);
    btn.textContent='Install';
    btn.className='btn btn-primary';
  }
}

searchInput.addEventListener('input',()=>{
  const q=searchInput.value.toLowerCase();
  renderApps(apps.filter(a=>a.name.toLowerCase().includes(q)||(a.description||'').toLowerCase().includes(q)));
});

loadApps();
setInterval(loadApps,60000);
</script>
</body>
</html>`;
}

function buildTicketHTML() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Submit Ticket - RemoteAdmin</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#0f1117;color:#e4e4e7;min-height:100vh;display:flex;align-items:center;justify-content:center}
.card{background:#18181b;border:1px solid #27272a;border-radius:16px;padding:40px;width:500px;max-width:90vw}
.card h1{font-size:24px;margin-bottom:8px;background:linear-gradient(135deg,#f97316,#ef4444);-webkit-background-clip:text;-webkit-text-fill-color:transparent}
.card>p{color:#71717a;font-size:14px;margin-bottom:28px}
.form-group{margin-bottom:20px}
.form-group label{display:block;font-size:13px;color:#a1a1aa;margin-bottom:6px;font-weight:500}
.form-group input,.form-group textarea,.form-group select{width:100%;padding:12px 16px;background:#0f1117;border:1px solid #27272a;border-radius:8px;color:#e4e4e7;font-size:15px;outline:none;transition:border-color 0.2s;font-family:inherit}
.form-group input:focus,.form-group textarea:focus,.form-group select:focus{border-color:#f97316}
.form-group textarea{min-height:120px;resize:vertical}
.form-group select{cursor:pointer}
.btn{width:100%;padding:12px;background:linear-gradient(135deg,#f97316,#ea580c);color:white;border:none;border-radius:8px;font-size:15px;font-weight:600;cursor:pointer;transition:transform 0.1s}
.btn:hover{transform:translateY(-1px)}
.btn:disabled{opacity:0.5;cursor:not-allowed;transform:none}
.msg{padding:12px;border-radius:8px;font-size:14px;margin-top:16px;display:none}
.msg-success{background:#16a34a22;color:#4ade80;border:1px solid #16a34a44;display:block}
.msg-error{background:#dc262622;color:#f87171;border:1px solid #dc262644;display:block}
</style>
</head>
<body>
<div class="card">
  <h1>&#x1F4CB; Submit Ticket</h1>
  <p>Need help? Submit a support ticket and our team will respond.</p>
  <form id="ticketForm" onsubmit="submitTicket(event)">
    <div class="form-group">
      <label>Subject</label>
      <input type="text" id="subject" placeholder="Brief description of the issue" required>
    </div>
    <div class="form-group">
      <label>Priority</label>
      <select id="priority">
        <option value="low">Low</option>
        <option value="normal" selected>Normal</option>
        <option value="high">High</option>
        <option value="critical">Critical</option>
      </select>
    </div>
    <div class="form-group">
      <label>Message</label>
      <textarea id="message" placeholder="Describe the issue in detail..." required></textarea>
    </div>
    <button type="submit" class="btn" id="submitBtn">Submit Ticket</button>
    <div id="resultMsg" class="msg"></div>
  </form>
</div>
<script>
async function submitTicket(e){
  e.preventDefault();
  const btn=document.getElementById('submitBtn');
  const msg=document.getElementById('resultMsg');
  btn.disabled=true;
  btn.textContent='Submitting...';
  msg.className='msg';
  try{
    const r=await fetch('/api/tickets',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({
        subject:document.getElementById('subject').value,
        message:document.getElementById('message').value,
        priority:document.getElementById('priority').value
      })
    });
    const data=await r.json();
    if(data.success){
      msg.textContent='Ticket submitted successfully! Our team will review it shortly.';
      msg.className='msg msg-success';
      document.getElementById('ticketForm').reset();
    }else{
      msg.textContent=data.error||'Failed to submit ticket';
      msg.className='msg msg-error';
    }
  }catch(err){
    msg.textContent='Network error: '+err.message;
    msg.className='msg msg-error';
  }
  btn.disabled=false;
  btn.textContent='Submit Ticket';
}
</script>
</body>
</html>`;
}

// ============================================================
// Logging
// ============================================================
function log(level, message) {
  const timestamp = new Date().toISOString();
  const prefix = `[${timestamp}] [${level}]`;
  const line = `${prefix} ${message}`;

  // Write to log file
  try {
    if (!fs.existsSync(CONFIG.dataDir)) {
      fs.mkdirSync(CONFIG.dataDir, { recursive: true });
    }
    fs.appendFileSync(path.join(CONFIG.dataDir, 'agent.log'), line + '\n');
  } catch (e) { /* ignore */ }

  // Write to console (unless in stealth mode)
  if (!CONFIG.stealth) {
    switch (level) {
      case 'ERROR': console.error(line); break;
      case 'WARN': console.warn(line); break;
      default: console.log(line); break;
    }
  }
}

// ============================================================
// Metrics Reporter
// ============================================================
function startMetricsReporter() {
  setInterval(() => {
    if (!isConnected) return;

    const metrics = getMetrics();
    const info = getSystemInfo();

    send({
      type: 'metrics',
      agentId,
      hostname: info.hostname,
      os: info.os,
      platform: info.platform,
      ip: info.ip,
      version: CONFIG.version,
      cpu: metrics.cpu,
      memory: metrics.memory,
      diskTotal: metrics.diskTotal,
      diskUsed: metrics.diskUsed,
      uptime: metrics.uptime,
    });
  }, CONFIG.metricInterval);
}

// ============================================================
// Main Entry Point
// ============================================================
function main() {
  log('INFO', '=== RemoteAdmin v4 Agent Starting ===');
  log('INFO', `Platform: ${PLATFORM} (${os.arch()})`);
  log('INFO', `Node.js: ${process.version}`);
  log('INFO', `Server: ${CONFIG.serverUrl}`);
  log('INFO', `Version: ${CONFIG.version}`);
  log('INFO', `Stealth: ${CONFIG.stealth}`);

  ensureAgentId();
  log('INFO', `Agent ID: ${agentId}`);

  // Setup auto-start
  try {
    setupAutoStart();
  } catch (err) {
    log('WARN', `Auto-start setup failed: ${err.message}`);
  }

  // Enable stealth mode if requested
  if (CONFIG.stealth) {
    enableStealth();
  }

  // Start local HTTP server
  try {
    startLocalServer();
  } catch (err) {
    log('WARN', `Local server failed: ${err.message}`);
  }

  // Start metrics reporter
  startMetricsReporter();

  // Connect to server
  connect();

  // Graceful shutdown
  process.on('SIGINT', () => {
    log('INFO', 'Shutting down...');
    stopStreaming();
    hideScreensaver();
    if (ws) ws.close();
    setTimeout(() => process.exit(0), 1000);
  });

  process.on('SIGTERM', () => {
    log('INFO', 'Received SIGTERM. Shutting down...');
    stopStreaming();
    hideScreensaver();
    if (ws) ws.close();
    setTimeout(() => process.exit(0), 1000);
  });

  process.on('uncaughtException', (err) => {
    log('ERROR', `Uncaught exception: ${err.message}`);
  });

  process.on('unhandledRejection', (err) => {
    log('ERROR', `Unhandled rejection: ${err}`);
  });
}

main();
