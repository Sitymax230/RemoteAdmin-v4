/**
 * RemoteAdmin v4 - Standalone Server
 * A comprehensive Node.js server for remote administration.
 * Uses plain http module, better-sqlite3, otplib, and ws.
 */

const http = require('http');
const https = require('https');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const url = require('url');
const { exec, execSync, spawn } = require('child_process');
const os = require('os');
const WebSocket = require('ws');
const Database = require('better-sqlite3');
const { authenticator } = require('otplib');

// ============================================================
// Configuration
// ============================================================
const CONFIG = {
  port: parseInt(process.env.PORT || '3000', 10),
  host: process.env.HOST || '0.0.0.0',
  dbPath: process.env.DB_PATH || path.join(__dirname, 'data', 'remoteadmin.db'),
  jwtSecret: process.env.JWT_SECRET || crypto.randomBytes(64).toString('hex'),
  tokenExpiry: 24 * 60 * 60 * 1000, // 24 hours
  corsOrigin: process.env.CORS_ORIGIN || '*',
  publicDir: path.join(__dirname, 'public'),
};

// ============================================================
// Database Setup
// ============================================================
const dataDir = path.dirname(CONFIG.dbPath);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const db = new Database(CONFIG.dbPath);

// Enable WAL mode for better concurrency
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS admin_users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT DEFAULT 'viewer',
    totp_secret TEXT,
    totp_enabled INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS agents (
    id TEXT PRIMARY KEY,
    hostname TEXT NOT NULL,
    os TEXT NOT NULL,
    platform TEXT NOT NULL,
    ip TEXT,
    version TEXT DEFAULT '1.0.0',
    last_seen TEXT DEFAULT (datetime('now')),
    status TEXT DEFAULT 'online',
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS agent_metrics (
    id TEXT PRIMARY KEY,
    agent_id TEXT NOT NULL,
    cpu REAL,
    memory REAL,
    disk_total REAL,
    disk_used REAL,
    uptime INTEGER,
    timestamp TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS store_apps (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    category TEXT DEFAULT 'General',
    icon TEXT DEFAULT '📦',
    install_cmd TEXT NOT NULL,
    uninstall_cmd TEXT DEFAULT '',
    platform TEXT DEFAULT 'windows',
    version TEXT DEFAULT '1.0.0',
    featured INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS installations (
    id TEXT PRIMARY KEY,
    app_id TEXT NOT NULL,
    agent_id TEXT NOT NULL,
    installed_by TEXT,
    status TEXT DEFAULT 'installed',
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (app_id) REFERENCES store_apps(id) ON DELETE CASCADE,
    FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS tickets (
    id TEXT PRIMARY KEY,
    agent_id TEXT NOT NULL,
    subject TEXT NOT NULL,
    message TEXT NOT NULL,
    status TEXT DEFAULT 'open',
    priority TEXT DEFAULT 'normal',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS ticket_replies (
    id TEXT PRIMARY KEY,
    ticket_id TEXT NOT NULL,
    author_id TEXT,
    is_admin INTEGER DEFAULT 0,
    message TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE,
    FOREIGN KEY (author_id) REFERENCES admin_users(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS audit_logs (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    action TEXT NOT NULL,
    detail TEXT DEFAULT '',
    ip TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES admin_users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS admin_settings (
    id TEXT PRIMARY KEY,
    key TEXT UNIQUE NOT NULL,
    value TEXT NOT NULL,
    user_id TEXT,
    FOREIGN KEY (user_id) REFERENCES admin_users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    expires_at TEXT,
    FOREIGN KEY (user_id) REFERENCES admin_users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS agent_updates (
    id TEXT PRIMARY KEY,
    version TEXT NOT NULL,
    filename TEXT NOT NULL,
    file_path TEXT NOT NULL,
    platform TEXT DEFAULT 'windows',
    file_size INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  );
`);

// Prepared statements
const stmts = {
  // Users
  createUser: db.prepare('INSERT INTO admin_users (id, username, password_hash, role) VALUES (?, ?, ?, ?)'),
  getUserById: db.prepare('SELECT id, username, role, totp_secret, totp_enabled, created_at, updated_at FROM admin_users WHERE id = ?'),
  getUserByUsername: db.prepare('SELECT * FROM admin_users WHERE username = ?'),
  getUserByUsernameSafe: db.prepare('SELECT id, username, role, totp_enabled, created_at, updated_at FROM admin_users WHERE username = ?'),
  listUsers: db.prepare('SELECT id, username, role, totp_enabled, created_at, updated_at FROM admin_users ORDER BY created_at DESC'),
  updateUser: db.prepare('UPDATE admin_users SET username = ?, role = ?, totp_secret = ?, totp_enabled = ?, updated_at = datetime(\'now\') WHERE id = ?'),
  updateUserPassword: db.prepare('UPDATE admin_users SET password_hash = ?, updated_at = datetime(\'now\') WHERE id = ?'),
  deleteUser: db.prepare('DELETE FROM admin_users WHERE id = ?'),
  enableTotp: db.prepare('UPDATE admin_users SET totp_secret = ?, totp_enabled = 1, updated_at = datetime(\'now\') WHERE id = ?'),
  disableTotp: db.prepare('UPDATE admin_users SET totp_secret = NULL, totp_enabled = 0, updated_at = datetime(\'now\') WHERE id = ?'),

  // Sessions
  createSession: db.prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)'),
  getSession: db.prepare('SELECT s.*, u.username, u.role FROM sessions s JOIN admin_users u ON s.user_id = u.id WHERE s.token = ?'),
  deleteSession: db.prepare('DELETE FROM sessions WHERE token = ?'),
  deleteExpiredSessions: db.prepare('DELETE FROM sessions WHERE expires_at < datetime(\'now\')'),

  // Agents
  createAgent: db.prepare('INSERT INTO agents (id, hostname, os, platform, ip, version) VALUES (?, ?, ?, ?, ?, ?)'),
  getAgent: db.prepare('SELECT * FROM agents WHERE id = ?'),
  getAgentByHostname: db.prepare('SELECT * FROM agents WHERE hostname = ?'),
  listAgents: db.prepare('SELECT * FROM agents ORDER BY last_seen DESC'),
  updateAgent: db.prepare('UPDATE agents SET hostname = ?, os = ?, platform = ?, ip = ?, version = ?, last_seen = datetime(\'now\'), status = ? WHERE id = ?'),
  updateAgentStatus: db.prepare('UPDATE agents SET status = ?, last_seen = datetime(\'now\') WHERE id = ?'),
  deleteAgent: db.prepare('DELETE FROM agents WHERE id = ?'),
  upsertAgent: db.prepare(`
    INSERT INTO agents (id, hostname, os, platform, ip, version, status, last_seen)
    VALUES (?, ?, ?, ?, ?, ?, 'online', datetime('now'))
    ON CONFLICT(id) DO UPDATE SET
      hostname = excluded.hostname,
      os = excluded.os,
      platform = excluded.platform,
      ip = excluded.ip,
      version = excluded.version,
      status = 'online',
      last_seen = datetime('now')
  `),

  // Metrics
  createMetric: db.prepare('INSERT INTO agent_metrics (id, agent_id, cpu, memory, disk_total, disk_used, uptime) VALUES (?, ?, ?, ?, ?, ?, ?)'),
  getLatestMetrics: db.prepare('SELECT * FROM agent_metrics WHERE agent_id = ? ORDER BY timestamp DESC LIMIT 1'),
  getMetricHistory: db.prepare('SELECT * FROM agent_metrics WHERE agent_id = ? ORDER BY timestamp DESC LIMIT ?'),
  deleteOldMetrics: db.prepare('DELETE FROM agent_metrics WHERE timestamp < datetime(\'now\', ?)'),

  // Store
  createApp: db.prepare('INSERT INTO store_apps (id, name, description, category, icon, install_cmd, uninstall_cmd, platform, version, featured) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'),
  getApp: db.prepare('SELECT * FROM store_apps WHERE id = ?'),
  listApps: db.prepare('SELECT * FROM store_apps ORDER BY featured DESC, name ASC'),
  updateApp: db.prepare('UPDATE store_apps SET name = ?, description = ?, category = ?, icon = ?, install_cmd = ?, uninstall_cmd = ?, platform = ?, version = ?, featured = ?, updated_at = datetime(\'now\') WHERE id = ?'),
  deleteApp: db.prepare('DELETE FROM store_apps WHERE id = ?'),

  // Installations
  createInstallation: db.prepare('INSERT INTO installations (id, app_id, agent_id, installed_by, status) VALUES (?, ?, ?, ?, ?)'),
  listInstallations: db.prepare('SELECT i.*, a.name as app_name, ag.hostname as agent_hostname FROM installations i JOIN store_apps a ON i.app_id = a.id JOIN agents ag ON i.agent_id = ag.id ORDER BY i.created_at DESC'),

  // Tickets
  createTicket: db.prepare('INSERT INTO tickets (id, agent_id, subject, message, priority) VALUES (?, ?, ?, ?, ?)'),
  getTicket: db.prepare('SELECT t.*, a.hostname, a.os, a.platform FROM tickets t JOIN agents a ON t.agent_id = a.id WHERE t.id = ?'),
  listTickets: db.prepare('SELECT t.*, a.hostname FROM tickets t JOIN agents a ON t.agent_id = a.id ORDER BY t.created_at DESC'),
  updateTicketStatus: db.prepare('UPDATE tickets SET status = ?, updated_at = datetime(\'now\') WHERE id = ?'),

  // Ticket Replies
  createReply: db.prepare('INSERT INTO ticket_replies (id, ticket_id, author_id, is_admin, message) VALUES (?, ?, ?, ?, ?)'),
  listReplies: db.prepare('SELECT r.*, u.username FROM ticket_replies r LEFT JOIN admin_users u ON r.author_id = u.id WHERE r.ticket_id = ? ORDER BY r.created_at ASC'),

  // Audit
  createAuditLog: db.prepare('INSERT INTO audit_logs (id, user_id, action, detail, ip) VALUES (?, ?, ?, ?, ?)'),
  listAuditLogs: db.prepare('SELECT l.*, u.username FROM audit_logs l JOIN admin_users u ON l.user_id = u.id ORDER BY l.created_at DESC LIMIT ? OFFSET ?'),
  countAuditLogs: db.prepare('SELECT COUNT(*) as total FROM audit_logs'),

  // Settings
  getSetting: db.prepare('SELECT * FROM admin_settings WHERE key = ?'),
  listSettings: db.prepare('SELECT * FROM admin_settings'),
  upsertSetting: db.prepare('INSERT INTO admin_settings (id, key, value) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'),
  deleteSetting: db.prepare('DELETE FROM admin_settings WHERE key = ?'),

  // Agent Updates
  createUpdate: db.prepare('INSERT INTO agent_updates (id, version, filename, file_path, platform, file_size) VALUES (?, ?, ?, ?, ?, ?)'),
  getLatestUpdate: db.prepare('SELECT * FROM agent_updates WHERE platform = ? ORDER BY created_at DESC LIMIT 1'),
  listUpdates: db.prepare('SELECT * FROM agent_updates ORDER BY created_at DESC'),
  deleteUpdate: db.prepare('DELETE FROM agent_updates WHERE id = ?'),
};

// ============================================================
// Default Admin Account
// ============================================================
function createDefaultAdmin() {
  const existing = stmts.getUserByUsername.get('admin');
  if (!existing) {
    const hash = hashPassword('admin123');
    stmts.createUser.run(generateId(), 'admin', hash, 'superadmin');
    console.log('[INIT] Default admin account created: admin / admin123');
    console.log('[INIT] IMPORTANT: Change the default password after first login!');
  }
}

// ============================================================
// Seed default store apps
// ============================================================
function seedStoreApps() {
  const count = db.prepare('SELECT COUNT(*) as c FROM store_apps').get().c;
  if (count === 0) {
    const defaultApps = [
      { name: 'Google Chrome', description: 'Fast, secure web browser', category: 'Browser', icon: '🌐', install_cmd: 'winget install Google.Chrome', uninstall_cmd: 'winget uninstall Google.Chrome', platform: 'windows', version: 'latest' },
      { name: 'Mozilla Firefox', description: 'Privacy-focused web browser', category: 'Browser', icon: '🦊', install_cmd: 'winget install Mozilla.Firefox', uninstall_cmd: 'winget uninstall Mozilla.Firefox', platform: 'windows', version: 'latest' },
      { name: 'VLC Media Player', description: 'Free and open source multimedia player', category: 'Media', icon: '🎬', install_cmd: 'winget install VideoLAN.VLC', uninstall_cmd: 'winget uninstall VideoLAN.VLC', platform: 'windows', version: 'latest' },
      { name: '7-Zip', description: 'File archiver with high compression ratio', category: 'Utilities', icon: '📦', install_cmd: 'winget install 7zip.7zip', uninstall_cmd: 'winget uninstall 7zip.7zip', platform: 'windows', version: 'latest' },
      { name: 'Notepad++', description: 'Free source code editor', category: 'Development', icon: '📝', install_cmd: 'winget install Notepad++.Notepad++', uninstall_cmd: 'winget uninstall Notepad++.Notepad++', platform: 'windows', version: 'latest' },
      { name: 'VS Code', description: 'Lightweight but powerful source code editor', category: 'Development', icon: '💻', install_cmd: 'winget install Microsoft.VisualStudioCode', uninstall_cmd: 'winget uninstall Microsoft.VisualStudioCode', platform: 'windows', version: 'latest' },
      { name: 'Spotify', description: 'Digital music streaming service', category: 'Media', icon: '🎵', install_cmd: 'winget install Spotify.Spotify', uninstall_cmd: 'winget uninstall Spotify.Spotify', platform: 'windows', version: 'latest' },
      { name: 'Discord', description: 'Voice, video, and text communication', category: 'Communication', icon: '💬', install_cmd: 'winget install Discord.Discord', uninstall_cmd: 'winget uninstall Discord.Discord', platform: 'windows', version: 'latest' },
      { name: 'Firefox', description: 'Web browser (Linux)', category: 'Browser', icon: '🦊', install_cmd: 'sudo apt install -y firefox', uninstall_cmd: 'sudo apt remove -y firefox', platform: 'linux', version: 'latest' },
      { name: 'VLC', description: 'Media player (Linux)', category: 'Media', icon: '🎬', install_cmd: 'sudo apt install -y vlc', uninstall_cmd: 'sudo apt remove -y vlc', platform: 'linux', version: 'latest' },
    ];
    for (const app of defaultApps) {
      stmts.createApp.run(generateId(), app.name, app.description, app.category, app.icon, app.install_cmd, app.uninstall_cmd, app.platform, app.version, 0);
    }
    console.log(`[INIT] Seeded ${defaultApps.length} default store apps`);
  }
}

// ============================================================
// Utility Functions
// ============================================================
function generateId() {
  return crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = crypto.randomBytes(1)[0] % 16;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, storedHash) {
  const [salt, hash] = storedHash.split(':');
  const verify = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
  return hash === verify;
}

function generateToken() {
  return crypto.randomBytes(48).toString('hex');
}

function getClientIp(req) {
  return req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress || 'unknown';
}

function cleanExpiredSessions() {
  try {
    stmts.deleteExpiredSessions.run();
  } catch (e) {
    // ignore
  }
}

// ============================================================
// HTTP Helpers
// ============================================================
function sendJSON(res, statusCode, data) {
  const body = JSON.stringify(data);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
    'Access-Control-Allow-Origin': CONFIG.corsOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  });
  res.end(body);
}

function sendError(res, statusCode, message) {
  sendJSON(res, statusCode, { error: message });
}

function sendHTML(res, html) {
  res.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
    'Access-Control-Allow-Origin': CONFIG.corsOrigin,
  });
  res.end(html);
}

function sendFile(res, filePath, contentType) {
  try {
    if (!fs.existsSync(filePath)) {
      sendError(res, 404, 'File not found');
      return;
    }
    const stat = fs.statSync(filePath);
    const stream = fs.createReadStream(filePath);
    res.writeHead(200, {
      'Content-Type': contentType || 'application/octet-stream',
      'Content-Length': stat.size,
      'Access-Control-Allow-Origin': CONFIG.corsOrigin,
    });
    stream.pipe(res);
  } catch (err) {
    sendError(res, 500, 'Failed to read file');
  }
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      try {
        resolve(JSON.parse(body));
      } catch (e) {
        resolve({});
      }
    });
    req.on('error', reject);
  });
}

function parseMultipart(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      resolve(Buffer.concat(chunks));
    });
    req.on('error', reject);
  });
}

function authenticate(req) {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  const token = authHeader.substring(7);
  const session = stmts.getSession.get(token);
  if (!session) return null;
  const now = new Date();
  const expires = new Date(session.expires_at);
  if (now > expires) {
    stmts.deleteSession.run(token);
    return null;
  }
  return { id: session.user_id, username: session.username, role: session.role };
}

function audit(userId, action, detail, ip) {
  try {
    stmts.createAuditLog.run(generateId(), userId, action, detail || '', ip || '');
  } catch (e) {
    // ignore
  }
}

// ============================================================
// Route Handlers
// ============================================================

// --- Auth ---
async function handleLogin(req, res, body) {
  const { username, password } = body;
  if (!username || !password) {
    return sendError(res, 400, 'Username and password are required');
  }
  const user = stmts.getUserByUsername.get(username);
  if (!user) {
    return sendError(res, 401, 'Invalid credentials');
  }
  if (!verifyPassword(password, user.password_hash)) {
    return sendError(res, 401, 'Invalid credentials');
  }

  const token = generateToken();
  const expiresAt = new Date(Date.now() + CONFIG.tokenExpiry).toISOString();
  stmts.createSession.run(token, user.id, expiresAt);

  audit(user.id, 'login', 'User logged in', getClientIp(req));

  sendJSON(res, 200, {
    token,
    user: {
      id: user.id,
      username: user.username,
      role: user.role,
      totpEnabled: !!user.totp_enabled,
    },
    requiresTotp: !!user.totp_enabled,
  });
}

async function handleTotpVerify(req, res, body) {
  const { token: authToken, code } = body;
  if (!authToken || !code) {
    return sendError(res, 400, 'Token and code are required');
  }
  const session = stmts.getSession.get(authToken);
  if (!session) {
    return sendError(res, 401, 'Invalid session');
  }
  const user = stmts.getUserById.get(session.user_id);
  if (!user || !user.totp_secret || !user.totp_enabled) {
    return sendError(res, 400, 'TOTP not configured for this user');
  }

  const isValid = authenticator.verify({ token: code, secret: user.totp_secret });
  if (!isValid) {
    return sendError(res, 401, 'Invalid TOTP code');
  }

  audit(user.id, 'totp_verify', 'TOTP verified', getClientIp(req));

  sendJSON(res, 200, { verified: true });
}

async function handleSetupTotp(req, res, body) {
  const user = authenticate(req);
  if (!user) return sendError(res, 401, 'Unauthorized');

  const existingUser = stmts.getUserById.get(user.id);
  if (existingUser.totp_enabled) {
    return sendError(res, 400, 'TOTP is already enabled. Disable it first.');
  }

  const secret = authenticator.generateSecret();
  const otpauth = authenticator.keyuri(user.username, 'RemoteAdmin v4', secret);

  stmts.enableTotp.run(user.id, secret);
  audit(user.id, 'totp_setup', 'TOTP setup initiated', getClientIp(req));

  sendJSON(res, 200, { secret, otpauth });
}

async function handleDisableTotp(req, res, body) {
  const user = authenticate(req);
  if (!user) return sendError(res, 401, 'Unauthorized');

  const { code } = body;
  if (!code) return sendError(res, 400, 'TOTP code required');

  const existingUser = stmts.getUserById.get(user.id);
  if (!existingUser.totp_enabled || !existingUser.totp_secret) {
    return sendError(res, 400, 'TOTP not enabled');
  }

  const isValid = authenticator.verify({ token: code, secret: existingUser.totp_secret });
  if (!isValid) {
    return sendError(res, 401, 'Invalid TOTP code');
  }

  stmts.disableTotp.run(user.id);
  audit(user.id, 'totp_disable', 'TOTP disabled', getClientIp(req));

  sendJSON(res, 200, { disabled: true });
}

async function handleLogout(req, res) {
  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    stmts.deleteSession.run(token);
  }
  sendJSON(res, 200, { success: true });
}

// --- Users CRUD ---
async function handleListUsers(req, res) {
  const user = authenticate(req);
  if (!user) return sendError(res, 401, 'Unauthorized');
  if (user.role !== 'superadmin' && user.role !== 'admin') return sendError(res, 403, 'Forbidden');

  const users = stmts.listUsers.all();
  sendJSON(res, 200, users);
}

async function handleCreateUser(req, res, body) {
  const user = authenticate(req);
  if (!user) return sendError(res, 401, 'Unauthorized');
  if (user.role !== 'superadmin') return sendError(res, 403, 'Forbidden');

  const { username, password, role } = body;
  if (!username || !password) return sendError(res, 400, 'Username and password required');

  const existing = stmts.getUserByUsernameSafe.get(username);
  if (existing) return sendError(res, 409, 'Username already exists');

  const hash = hashPassword(password);
  const id = generateId();
  stmts.createUser.run(id, username, hash, role || 'viewer');
  audit(user.id, 'create_user', `Created user: ${username}`, getClientIp(req));

  sendJSON(res, 201, { id, username, role: role || 'viewer' });
}

async function handleUpdateUser(req, res, body, id) {
  const user = authenticate(req);
  if (!user) return sendError(res, 401, 'Unauthorized');
  if (user.role !== 'superadmin') return sendError(res, 403, 'Forbidden');

  const { username, role, password } = body;
  const target = stmts.getUserById.get(id);
  if (!target) return sendError(res, 404, 'User not found');

  if (username) stmts.updateUser.run(username, role || target.role, target.totp_secret, target.totp_enabled ? 1 : 0, id);
  if (role) stmts.updateUser.run(username || target.username, role, target.totp_secret, target.totp_enabled ? 1 : 0, id);
  if (password) {
    const hash = hashPassword(password);
    stmts.updateUserPassword.run(hash, id);
  }

  audit(user.id, 'update_user', `Updated user: ${target.username}`, getClientIp(req));
  sendJSON(res, 200, { success: true });
}

async function handleDeleteUser(req, res, id) {
  const user = authenticate(req);
  if (!user) return sendError(res, 401, 'Unauthorized');
  if (user.role !== 'superadmin') return sendError(res, 403, 'Forbidden');
  if (user.id === id) return sendError(res, 400, 'Cannot delete yourself');

  const target = stmts.getUserById.get(id);
  if (!target) return sendError(res, 404, 'User not found');

  stmts.deleteUser.run(id);
  audit(user.id, 'delete_user', `Deleted user: ${target.username}`, getClientIp(req));
  sendJSON(res, 200, { success: true });
}

// --- Agents ---
async function handleListAgents(req, res) {
  const user = authenticate(req);
  if (!user) return sendError(res, 401, 'Unauthorized');

  const agents = stmts.listAgents.all();
  const result = agents.map((agent) => {
    const metric = stmts.getLatestMetrics.get(agent.id);
    return { ...agent, metrics: metric || null };
  });
  sendJSON(res, 200, result);
}

async function handleGetAgent(req, res, id) {
  const user = authenticate(req);
  if (!user) return sendError(res, 401, 'Unauthorized');

  const agent = stmts.getAgent.get(id);
  if (!agent) return sendError(res, 404, 'Agent not found');

  const metrics = stmts.getMetricHistory.all(id, 100);
  sendJSON(res, 200, { ...agent, metrics });
}

async function handleDeleteAgent(req, res, id) {
  const user = authenticate(req);
  if (!user) return sendError(res, 401, 'Unauthorized');
  if (user.role !== 'superadmin' && user.role !== 'admin') return sendError(res, 403, 'Forbidden');

  const agent = stmts.getAgent.get(id);
  if (!agent) return sendError(res, 404, 'Agent not found');

  stmts.deleteAgent.run(id);
  audit(user.id, 'delete_agent', `Deleted agent: ${agent.hostname}`, getClientIp(req));
  sendJSON(res, 200, { success: true });
}

// --- Store CRUD ---
async function handleListApps(req, res) {
  const user = authenticate(req);
  if (!user) return sendError(res, 401, 'Unauthorized');

  const apps = stmts.listApps.all();
  sendJSON(res, 200, apps);
}

async function handleCreateApp(req, res, body) {
  const user = authenticate(req);
  if (!user) return sendError(res, 401, 'Unauthorized');
  if (user.role !== 'superadmin' && user.role !== 'admin') return sendError(res, 403, 'Forbidden');

  const { name, description, category, icon, installCmd, uninstallCmd, platform, version, featured } = body;
  if (!name || !installCmd) return sendError(res, 400, 'Name and installCmd are required');

  const id = generateId();
  stmts.createApp.run(id, name, description || '', category || 'General', icon || '📦', installCmd, uninstallCmd || '', platform || 'windows', version || '1.0.0', featured ? 1 : 0);
  audit(user.id, 'create_app', `Created app: ${name}`, getClientIp(req));

  sendJSON(res, 201, { id, name });
}

async function handleUpdateApp(req, res, body, id) {
  const user = authenticate(req);
  if (!user) return sendError(res, 401, 'Unauthorized');
  if (user.role !== 'superadmin' && user.role !== 'admin') return sendError(res, 403, 'Forbidden');

  const existing = stmts.getApp.get(id);
  if (!existing) return sendError(res, 404, 'App not found');

  stmts.updateApp.run(
    body.name || existing.name,
    body.description !== undefined ? body.description : existing.description,
    body.category || existing.category,
    body.icon || existing.icon,
    body.installCmd || existing.install_cmd,
    body.uninstallCmd !== undefined ? body.uninstallCmd : existing.uninstall_cmd,
    body.platform || existing.platform,
    body.version || existing.version,
    body.featured !== undefined ? (body.featured ? 1 : 0) : existing.featured,
    id
  );
  audit(user.id, 'update_app', `Updated app: ${existing.name}`, getClientIp(req));
  sendJSON(res, 200, { success: true });
}

async function handleDeleteApp(req, res, id) {
  const user = authenticate(req);
  if (!user) return sendError(res, 401, 'Unauthorized');
  if (user.role !== 'superadmin' && user.role !== 'admin') return sendError(res, 403, 'Forbidden');

  const existing = stmts.getApp.get(id);
  if (!existing) return sendError(res, 404, 'App not found');

  stmts.deleteApp.run(id);
  audit(user.id, 'delete_app', `Deleted app: ${existing.name}`, getClientIp(req));
  sendJSON(res, 200, { success: true });
}

// --- Tickets ---
async function handleListTickets(req, res) {
  const user = authenticate(req);
  if (!user) return sendError(res, 401, 'Unauthorized');

  const tickets = stmts.listTickets.all();
  sendJSON(res, 200, tickets);
}

async function handleGetTicket(req, res, id) {
  const user = authenticate(req);
  if (!user) return sendError(res, 401, 'Unauthorized');

  const ticket = stmts.getTicket.get(id);
  if (!ticket) return sendError(res, 404, 'Ticket not found');

  const replies = stmts.listReplies.all(id);
  sendJSON(res, 200, { ...ticket, replies });
}

async function handleCreateTicket(req, res, body) {
  // Allow ticket creation from agents without auth
  const { agentId, agentKey, subject, message, priority } = body;
  if (!subject || !message) return sendError(res, 400, 'Subject and message required');

  let agent = null;
  if (agentId) {
    agent = stmts.getAgent.get(agentId);
  }
  if (!agent && agentKey) {
    agent = stmts.listAgents.all().find(a => a.id === agentKey);
  }
  if (!agent) {
    return sendError(res, 400, 'Valid agent ID required');
  }

  const id = generateId();
  stmts.createTicket.run(id, agent.id, subject, message, priority || 'normal');
  sendJSON(res, 201, { id, subject });
}

async function handleReplyTicket(req, res, body, ticketId) {
  const user = authenticate(req);
  if (!user) return sendError(res, 401, 'Unauthorized');

  const ticket = stmts.getTicket.get(ticketId);
  if (!ticket) return sendError(res, 404, 'Ticket not found');

  const { message } = body;
  if (!message) return sendError(res, 400, 'Message required');

  const id = generateId();
  stmts.createReply.run(id, ticketId, user.id, 1, message);
  stmts.updateTicketStatus.run('in_progress', ticketId);
  audit(user.id, 'reply_ticket', `Replied to ticket ${ticketId}`, getClientIp(req));

  // Notify connected agent
  const wsConn = connectedAgents.get(ticket.agent_id);
  if (wsConn && wsConn.readyState === WebSocket.OPEN) {
    wsConn.send(JSON.stringify({ type: 'ticket_reply', ticketId, message, username: user.username }));
  }

  sendJSON(res, 201, { id });
}

async function handleUpdateTicketStatus(req, res, body, ticketId) {
  const user = authenticate(req);
  if (!user) return sendError(res, 401, 'Unauthorized');

  const ticket = stmts.getTicket.get(ticketId);
  if (!ticket) return sendError(res, 404, 'Ticket not found');

  const { status } = body;
  if (!status || !['open', 'in_progress', 'resolved', 'closed'].includes(status)) {
    return sendError(res, 400, 'Invalid status');
  }

  stmts.updateTicketStatus.run(status, ticketId);
  audit(user.id, 'update_ticket_status', `Ticket ${ticketId} status changed to ${status}`, getClientIp(req));
  sendJSON(res, 200, { success: true });
}

// --- Dashboard ---
async function handleDashboard(req, res) {
  const user = authenticate(req);
  if (!user) return sendError(res, 401, 'Unauthorized');

  const totalAgents = db.prepare('SELECT COUNT(*) as c FROM agents').get().c;
  const onlineAgents = db.prepare("SELECT COUNT(*) as c FROM agents WHERE status = 'online'").get().c;
  const totalTickets = db.prepare('SELECT COUNT(*) as c FROM tickets').get().c;
  const openTickets = db.prepare("SELECT COUNT(*) as c FROM tickets WHERE status = 'open'").get().c;
  const criticalTickets = db.prepare("SELECT COUNT(*) as c FROM tickets WHERE priority = 'critical' AND status != 'closed'").get().c;
  const totalApps = db.prepare('SELECT COUNT(*) as c FROM store_apps').get().c;
  const totalInstallations = db.prepare('SELECT COUNT(*) as c FROM installations').get().c;
  const recentAudits = db.prepare('SELECT l.*, u.username FROM audit_logs l JOIN admin_users u ON l.user_id = u.id ORDER BY l.created_at DESC LIMIT 10').all();

  // Get latest metrics from all agents
  const agentMetrics = db.prepare(`
    SELECT a.id, a.hostname, a.os, a.status, a.last_seen,
           m.cpu, m.memory, m.disk_total, m.disk_used, m.uptime, m.timestamp
    FROM agents a
    LEFT JOIN agent_metrics m ON m.id = (SELECT id FROM agent_metrics WHERE agent_id = a.id ORDER BY timestamp DESC LIMIT 1)
    ORDER BY a.hostname
  `).all();

  // Average CPU/Memory across online agents
  const avgMetrics = db.prepare(`
    SELECT AVG(cpu) as avg_cpu, AVG(memory) as avg_memory
    FROM agent_metrics am
    WHERE am.timestamp > datetime('now', '-5 minutes')
  `).get();

  // Tickets by status
  const ticketsByStatus = db.prepare("SELECT status, COUNT(*) as count FROM tickets GROUP BY status").all();

  // Tickets by priority
  const ticketsByPriority = db.prepare("SELECT priority, COUNT(*) as count FROM tickets WHERE status != 'closed' GROUP BY priority").all();

  sendJSON(res, 200, {
    agents: {
      total: totalAgents,
      online: onlineAgents,
      offline: totalAgents - onlineAgents,
    },
    tickets: {
      total: totalTickets,
      open: openTickets,
      critical: criticalTickets,
      byStatus: ticketsByStatus,
      byPriority: ticketsByPriority,
    },
    store: {
      totalApps,
      totalInstallations,
    },
    metrics: {
      avgCpu: avgMetrics?.avg_cpu || 0,
      avgMemory: avgMetrics?.avg_memory || 0,
      agents: agentMetrics,
    },
    recentActivity: recentAudits,
  });
}

// --- Settings ---
async function handleListSettings(req, res) {
  const user = authenticate(req);
  if (!user) return sendError(res, 401, 'Unauthorized');

  const settings = stmts.listSettings.all();
  const result = {};
  for (const s of settings) {
    result[s.key] = s.value;
  }
  sendJSON(res, 200, result);
}

async function handleUpdateSettings(req, res, body) {
  const user = authenticate(req);
  if (!user) return sendError(res, 401, 'Unauthorized');
  if (user.role !== 'superadmin' && user.role !== 'admin') return sendError(res, 403, 'Forbidden');

  const entries = Object.entries(body);
  if (entries.length === 0) return sendError(res, 400, 'No settings provided');

  for (const [key, value] of entries) {
    stmts.upsertSetting.run(generateId(), key, String(value));
  }
  audit(user.id, 'update_settings', `Updated ${entries.length} settings`, getClientIp(req));
  sendJSON(res, 200, { success: true });
}

// --- Audit Logs ---
async function handleListAuditLogs(req, res) {
  const user = authenticate(req);
  if (!user) return sendError(res, 401, 'Unauthorized');

  const parsed = url.parse(req.url, true);
  const limit = Math.min(parseInt(parsed.query.limit || '50', 10), 500);
  const offset = parseInt(parsed.query.offset || '0', 10);

  const total = stmts.countAuditLogs.get().total;
  const logs = stmts.listAuditLogs.all(limit, offset);
  sendJSON(res, 200, { logs, total, limit, offset });
}

// --- Installations ---
async function handleListInstallations(req, res) {
  const user = authenticate(req);
  if (!user) return sendError(res, 401, 'Unauthorized');

  const installations = stmts.listInstallations.all();
  sendJSON(res, 200, installations);
}

async function handleTriggerInstall(req, res, body) {
  const user = authenticate(req);
  if (!user) return sendError(res, 401, 'Unauthorized');

  const { appId, agentId } = body;
  if (!appId || !agentId) return sendError(res, 400, 'appId and agentId required');

  const app = stmts.getApp.get(appId);
  if (!app) return sendError(res, 404, 'App not found');

  const agent = stmts.getAgent.get(agentId);
  if (!agent) return sendError(res, 404, 'Agent not found');

  const id = generateId();
  stmts.createInstallation.run(id, appId, agentId, user.username, 'pending');

  // Send command to agent via WebSocket
  const wsConn = connectedAgents.get(agentId);
  if (wsConn && wsConn.readyState === WebSocket.OPEN) {
    wsConn.send(JSON.stringify({
      type: 'app_install',
      appId,
      name: app.name,
      installCmd: app.install_cmd,
      platform: agent.platform,
    }));
  }

  audit(user.id, 'trigger_install', `Install ${app.name} on ${agent.hostname}`, getClientIp(req));
  sendJSON(res, 201, { id, status: 'pending' });
}

async function handleTriggerUninstall(req, res, body) {
  const user = authenticate(req);
  if (!user) return sendError(res, 401, 'Unauthorized');

  const { appId, agentId } = body;
  if (!appId || !agentId) return sendError(res, 400, 'appId and agentId required');

  const app = stmts.getApp.get(appId);
  if (!app) return sendError(res, 404, 'App not found');

  const agent = stmts.getAgent.get(agentId);
  if (!agent) return sendError(res, 404, 'Agent not found');

  const wsConn = connectedAgents.get(agentId);
  if (wsConn && wsConn.readyState === WebSocket.OPEN) {
    wsConn.send(JSON.stringify({
      type: 'app_uninstall',
      appId,
      name: app.name,
      uninstallCmd: app.uninstall_cmd,
    }));
  }

  audit(user.id, 'trigger_uninstall', `Uninstall ${app.name} on ${agent.hostname}`, getClientIp(req));
  sendJSON(res, 200, { success: true });
}

// --- Agent Updates ---
async function handleListUpdates(req, res) {
  const user = authenticate(req);
  if (!user) return sendError(res, 401, 'Unauthorized');

  const updates = stmts.listUpdates.all();
  sendJSON(res, 200, updates);
}

async function handleUploadUpdate(req, res) {
  const user = authenticate(req);
  if (!user) return sendError(res, 401, 'Unauthorized');
  if (user.role !== 'superadmin') return sendError(res, 403, 'Forbidden');

  const parsed = url.parse(req.url, true);
  const version = parsed.query.version || '1.0.0';
  const platform = parsed.query.platform || 'windows';
  const filename = parsed.query.filename || `agent-${platform}-${version}.exe`;

  const data = await parseMultipart(req);
  const updatesDir = path.join(__dirname, 'data', 'updates');
  if (!fs.existsSync(updatesDir)) fs.mkdirSync(updatesDir, { recursive: true });

  const filePath = path.join(updatesDir, filename);
  fs.writeFileSync(filePath, data);

  const id = generateId();
  stmts.createUpdate.run(id, version, filename, filePath, platform, data.length);
  audit(user.id, 'upload_update', `Uploaded update ${filename}`, getClientIp(req));

  sendJSON(res, 201, { id, version, filename, platform, fileSize: data.length });
}

async function handleDeleteUpdate(req, res, id) {
  const user = authenticate(req);
  if (!user) return sendError(res, 401, 'Unauthorized');
  if (user.role !== 'superadmin') return sendError(res, 403, 'Forbidden');

  const update = db.prepare('SELECT * FROM agent_updates WHERE id = ?').get(id);
  if (!update) return sendError(res, 404, 'Update not found');

  if (fs.existsSync(update.file_path)) fs.unlinkSync(update.file_path);
  stmts.deleteUpdate.run(id);
  audit(user.id, 'delete_update', `Deleted update ${update.filename}`, getClientIp(req));
  sendJSON(res, 200, { success: true });
}

// --- Agent Command Relay ---
async function handleSendCommand(req, res, body) {
  const user = authenticate(req);
  if (!user) return sendError(res, 401, 'Unauthorized');

  const { agentId, command, params } = body;
  if (!agentId || !command) return sendError(res, 400, 'agentId and command required');

  const agent = stmts.getAgent.get(agentId);
  if (!agent) return sendError(res, 404, 'Agent not found');

  const wsConn = connectedAgents.get(agentId);
  if (!wsConn || wsConn.readyState !== WebSocket.OPEN) {
    return sendError(res, 400, 'Agent is offline');
  }

  wsConn.send(JSON.stringify({ type: 'command', command, params: params || {} }));
  audit(user.id, 'send_command', `Sent ${command} to ${agent.hostname}`, getClientIp(req));
  sendJSON(res, 200, { success: true });
}

// --- Agent Download Update ---
async function handleAgentDownloadUpdate(req, res) {
  const parsed = url.parse(req.url, true);
  const platform = parsed.query.platform || 'windows';
  const token = parsed.query.token;

  if (!token) return sendError(res, 401, 'Agent token required');

  const agent = stmts.listAgents.all().find(a => a.id === token);
  if (!agent) return sendError(res, 401, 'Invalid agent token');

  const update = stmts.getLatestUpdate.get(platform);
  if (!update) return sendError(res, 404, 'No update available');

  if (!fs.existsSync(update.file_path)) return sendError(res, 404, 'Update file not found');

  sendFile(res, update.file_path, 'application/octet-stream');
}

// --- Agent Ticket Submit (no auth) ---
async function handleAgentTicketSubmit(req, res, body) {
  const { agentId, agentToken, subject, message, priority } = body;
  if (!agentId || !subject || !message) return sendError(res, 400, 'agentId, subject, and message required');

  const agent = stmts.getAgent.get(agentId);
  if (!agent) return sendError(res, 404, 'Agent not found');

  const id = generateId();
  stmts.createTicket.run(id, agent.id, subject, message, priority || 'normal');
  sendJSON(res, 201, { id, status: 'created' });
}

// --- Agent App Store (no auth, agent token) ---
async function handleAgentStoreList(req, res) {
  const parsed = url.parse(req.url, true);
  const agentId = parsed.query.agentId;
  if (!agentId) return sendError(res, 400, 'agentId required');

  const agent = stmts.getAgent.get(agentId);
  if (!agent) return sendError(res, 404, 'Agent not found');

  const platform = agent.platform === 'linux' ? 'linux' : 'windows';
  const apps = stmts.listApps.all().filter(a => a.platform === platform || a.platform === 'both');
  sendJSON(res, 200, apps);
}

// --- Serve Update File to Agent ---
async function handleServeUpdate(req, res) {
  const parsed = url.parse(req.url, true);
  const filename = parsed.query.file;
  if (!filename) return sendError(res, 400, 'filename required');

  const filePath = path.join(__dirname, 'data', 'updates', path.basename(filename));
  if (!fs.existsSync(filePath)) return sendError(res, 404, 'File not found');

  sendFile(res, filePath, 'application/octet-stream');
}

// ============================================================
// Admin HTML
// ============================================================
const ADMIN_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>RemoteAdmin v4</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#0f1117;color:#e4e4e7}
.login-container{display:flex;align-items:center;justify-content:center;min-height:100vh;background:linear-gradient(135deg,#0f1117 0%,#1a1b2e 50%,#0f1117 100%)}
.login-card{background:#18181b;border:1px solid #27272a;border-radius:16px;padding:40px;width:400px;box-shadow:0 25px 50px rgba(0,0,0,0.5)}
.login-card h1{text-align:center;font-size:28px;margin-bottom:8px;background:linear-gradient(135deg,#f97316,#ef4444);-webkit-background-clip:text;-webkit-text-fill-color:transparent}
.login-card p{text-align:center;color:#71717a;margin-bottom:32px;font-size:14px}
.form-group{margin-bottom:20px}
.form-group label{display:block;font-size:13px;color:#a1a1aa;margin-bottom:6px;font-weight:500}
.form-group input{width:100%;padding:12px 16px;background:#0f1117;border:1px solid #27272a;border-radius:8px;color:#e4e4e7;font-size:15px;transition:border-color 0.2s}
.form-group input:focus{outline:none;border-color:#f97316}
.btn{width:100%;padding:12px;background:linear-gradient(135deg,#f97316,#ea580c);color:white;border:none;border-radius:8px;font-size:15px;font-weight:600;cursor:pointer;transition:transform 0.1s,box-shadow 0.2s}
.btn:hover{transform:translateY(-1px);box-shadow:0 4px 12px rgba(249,115,22,0.4)}
.error{color:#ef4444;font-size:13px;text-align:center;margin-top:12px;display:none}
.badge{display:inline-block;padding:2px 8px;border-radius:9999px;font-size:11px;font-weight:600}
.badge-green{background:#16a34a22;color:#4ade80}
.badge-red{background:#dc262622;color:#f87171}
.info-box{background:#27272a;border-radius:8px;padding:16px;margin-top:20px;font-size:13px;color:#a1a1aa}
.info-box code{color:#f97316;background:#0f1117;padding:2px 6px;border-radius:4px;font-size:12px}
</style>
</head>
<body>
<div class="login-container">
  <div class="login-card">
    <h1>&#x1F310; RemoteAdmin v4</h1>
    <p>Remote Administration System</p>
    <div id="loginForm">
      <div class="form-group">
        <label>Username</label>
        <input type="text" id="username" placeholder="Enter username" value="admin" autofocus>
      </div>
      <div class="form-group">
        <label>Password</label>
        <input type="password" id="password" placeholder="Enter password">
      </div>
      <div class="form-group" id="totpGroup" style="display:none">
        <label>2FA Code</label>
        <input type="text" id="totpCode" placeholder="Enter 6-digit code" maxlength="6" inputmode="numeric">
      </div>
      <button class="btn" id="loginBtn" onclick="doLogin()">Sign In</button>
      <div class="error" id="error"></div>
    </div>
    <div id="dashboard" style="display:none">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:24px">
        <h2 style="font-size:20px">Dashboard</h2>
        <button class="btn" style="width:auto;padding:8px 16px;font-size:13px" onclick="doLogout()">Logout</button>
      </div>
      <div id="dashContent"></div>
    </div>
    <div class="info-box">
      <strong>API Endpoints:</strong><br>
      POST /api/auth/login<br>
      POST /api/auth/totp<br>
      POST /api/auth/setup-totp<br>
      WebSocket ws://host:port/ws/agent
    </div>
  </div>
</div>
<script>
let authToken='';
function showError(msg){const e=document.getElementById('error');e.textContent=msg;e.style.display='block'}
function hideError(){document.getElementById('error').style.display='none'}
async function api(path,body,method='POST'){
  const opts={method,headers:{'Content-Type':'application/json'}};
  if(authToken)opts.headers['Authorization']='Bearer '+authToken;
  if(body)opts.body=JSON.stringify(body);
  const r=await fetch('/api'+path,opts);
  return r.json();
}
async function doLogin(){
  hideError();
  const u=document.getElementById('username').value;
  const p=document.getElementById('password').value;
  if(!u||!p)return showError('Enter username and password');
  const r=await api('/auth/login',{username:u,password:p});
  if(r.error)return showError(r.error);
  authToken=r.token;
  if(r.requiresTotp){
    document.getElementById('totpGroup').style.display='block';
    document.getElementById('loginBtn').textContent='Verify 2FA';
    document.getElementById('loginBtn').onclick=async()=>{
      const code=document.getElementById('totpCode').value;
      if(!code)return showError('Enter 2FA code');
      const v=await api('/auth/totp',{token:authToken,code});
      if(v.error)return showError(v.error);
      showDashboard();
    };
    return;
  }
  showDashboard();
}
function doLogout(){
  authToken='';
  document.getElementById('loginForm').style.display='block';
  document.getElementById('dashboard').style.display='none';
  document.getElementById('totpGroup').style.display='none';
  document.getElementById('loginBtn').textContent='Sign In';
  document.getElementById('loginBtn').onclick=doLogin;
}
async function showDashboard(){
  document.getElementById('loginForm').style.display='none';
  document.getElementById('dashboard').style.display='block';
  const d=await api('/dashboard',null,'GET');
  if(d.error){doLogout();return;}
  const c=document.getElementById('dashContent');
  c.innerHTML=\`
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:20px">
      <div style="background:#0f1117;padding:16px;border-radius:8px;border:1px solid #27272a">
        <div style="font-size:13px;color:#71717a">Online Agents</div>
        <div style="font-size:28px;font-weight:700;color:#4ade80">\${d.agents.online}<span style="font-size:14px;color:#71717a">/\${d.agents.total}</span></div>
      </div>
      <div style="background:#0f1117;padding:16px;border-radius:8px;border:1px solid #27272a">
        <div style="font-size:13px;color:#71717a">Open Tickets</div>
        <div style="font-size:28px;font-weight:700;color:#f97316">\${d.tickets.open}<span style="font-size:14px;color:#71717a">/\${d.tickets.total}</span></div>
      </div>
      <div style="background:#0f1117;padding:16px;border-radius:8px;border:1px solid #27272a">
        <div style="font-size:13px;color:#71717a">Store Apps</div>
        <div style="font-size:28px;font-weight:700">\${d.store.totalApps}</div>
      </div>
      <div style="background:#0f1117;padding:16px;border-radius:8px;border:1px solid #27272a">
        <div style="font-size:13px;color:#71717a">Installations</div>
        <div style="font-size:28px;font-weight:700">\${d.store.totalInstallations}</div>
      </div>
    </div>
    <div style="background:#0f1117;padding:16px;border-radius:8px;border:1px solid #27272a">
      <div style="font-size:14px;font-weight:600;margin-bottom:12px">Connected Agents</div>
      \${d.metrics.agents.map(a=>\`
        <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid #27272a">
          <div>
            <span style="font-weight:500">\${a.hostname}</span>
            <span style="color:#71717a;font-size:12px;margin-left:8px">\${a.os}</span>
          </div>
          <span class="badge \${a.status==='online'?'badge-green':'badge-red'}">\${a.status}</span>
        </div>
      \`).join('')||'<div style="color:#71717a;font-size:13px">No agents connected</div>'}
    </div>
  \`;
}
document.getElementById('password').addEventListener('keydown',e=>{if(e.key==='Enter')doLogin()});
document.getElementById('totpCode')?.addEventListener('keydown',e=>{if(e.key==='Enter')document.getElementById('loginBtn').click()});
</script>
</body>
</html>`;

// ============================================================
// WebSocket Server
// ============================================================
const connectedAgents = new Map(); // agentId -> ws

function setupWebSocket(server) {
  const wss = new WebSocket.Server({ server, path: '/ws/agent' });

  wss.on('connection', (ws, req) => {
    const clientIp = req.socket.remoteAddress;
    let agentId = null;

    console.log(`[WS] New connection from ${clientIp}`);

    ws.on('message', async (data) => {
      try {
        const msg = JSON.parse(data.toString());

        switch (msg.type) {
          case 'register': {
            const { hostname, os, platform, ip, version } = msg;
            agentId = msg.agentId || generateId();

            stmts.upsertAgent.run(agentId, hostname || 'unknown', os || 'unknown', platform || 'unknown', ip || clientIp, version || '1.0.0');
            connectedAgents.set(agentId, ws);

            ws.send(JSON.stringify({
              type: 'registered',
              agentId,
              serverTime: new Date().toISOString(),
            }));

            console.log(`[WS] Agent registered: ${hostname} (${agentId})`);
            break;
          }

          case 'metrics': {
            if (!agentId) {
              agentId = msg.agentId;
            }
            if (!agentId) break;

            stmts.upsertAgent.run(agentId, msg.hostname || '', msg.os || '', msg.platform || '', msg.ip || '', msg.version || '1.0.0');
            stmts.createMetric.run(generateId(), agentId, msg.cpu || 0, msg.memory || 0, msg.diskTotal || 0, msg.diskUsed || 0, msg.uptime || 0);
            break;
          }

          case 'screenshot_result': {
            // Broadcast to admin dashboard if connected
            const screenshotEvent = { type: 'screenshot_result', agentId, data: msg.data };
            broadcastToAdmins(screenshotEvent);
            break;
          }

          case 'stream_frame': {
            const frameEvent = { type: 'stream_frame', agentId, data: msg.data };
            broadcastToAdmins(frameEvent);
            break;
          }

          case 'command_result': {
            const resultEvent = { type: 'command_result', agentId, command: msg.command, result: msg.result, error: msg.error };
            broadcastToAdmins(resultEvent);
            break;
          }

          case 'exec_result': {
            const execEvent = { type: 'exec_result', agentId, commandId: msg.commandId, stdout: msg.stdout, stderr: msg.stderr, exitCode: msg.exitCode };
            broadcastToAdmins(execEvent);
            break;
          }

          case 'app_list_result': {
            const appListEvent = { type: 'app_list_result', agentId, apps: msg.apps };
            broadcastToAdmins(appListEvent);
            break;
          }

          case 'install_result': {
            const instEvent = { type: 'install_result', agentId, appId: msg.appId, success: msg.success, message: msg.message };
            if (msg.appId) {
              const updateStatus = msg.success ? 'installed' : 'failed';
              db.prepare("UPDATE installations SET status = ? WHERE app_id = ? AND agent_id = ? ORDER BY created_at DESC LIMIT 1").run(updateStatus, msg.appId, agentId);
            }
            broadcastToAdmins(instEvent);
            break;
          }

          case 'ticket_created': {
            // Agent created a ticket
            if (msg.agentId) {
              const { subject, message, priority } = msg;
              if (subject && message) {
                stmts.createTicket.run(generateId(), msg.agentId, subject, message, priority || 'normal');
              }
            }
            break;
          }

          case 'update_check': {
            if (agentId) {
              const agent = stmts.getAgent.get(agentId);
              if (agent) {
                const platform = agent.platform === 'linux' ? 'linux' : 'windows';
                const update = stmts.getLatestUpdate.get(platform);
                if (update) {
                  ws.send(JSON.stringify({
                    type: 'update_available',
                    version: update.version,
                    filename: update.filename,
                    downloadUrl: `/api/updates/download?token=${agentId}&platform=${platform}`,
                    fileSize: update.file_size,
                  }));
                } else {
                  ws.send(JSON.stringify({ type: 'update_not_available' }));
                }
              }
            }
            break;
          }

          default:
            // Forward unknown messages to admin connections
            broadcastToAdmins({ type: 'agent_message', agentId, ...msg });
        }
      } catch (err) {
        console.error('[WS] Error processing message:', err.message);
      }
    });

    ws.on('close', () => {
      if (agentId) {
        stmts.updateAgentStatus.run('offline', agentId);
        connectedAgents.delete(agentId);
        console.log(`[WS] Agent disconnected: ${agentId}`);
      }
    });

    ws.on('error', (err) => {
      console.error('[WS] Connection error:', err.message);
      if (agentId) {
        stmts.updateAgentStatus.run('offline', agentId);
        connectedAgents.delete(agentId);
      }
    });

    // Send ping to keep alive
    const pingInterval = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.ping();
      } else {
        clearInterval(pingInterval);
      }
    }, 30000);
  });

  return wss;
}

function broadcastToAdmins(data) {
  const msgStr = JSON.stringify(data);
  for (const [, ws] of connectedAgents) {
    if (ws.readyState === WebSocket.OPEN && ws._isAdmin) {
      ws.send(msgStr);
    }
  }
}

// ============================================================
// Main HTTP Router
// ============================================================
async function handleRequest(req, res) {
  const parsed = url.parse(req.url, true);
  const pathname = parsed.pathname;
  const method = req.method;

  // CORS preflight
  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': CONFIG.corsOrigin,
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400',
    });
    res.end();
    return;
  }

  try {
    // Static files / Admin panel
    if (pathname === '/' || pathname === '/index.html') {
      sendHTML(res, ADMIN_HTML);
      return;
    }

    if (pathname.startsWith('/public/')) {
      const filePath = path.join(__dirname, pathname);
      const ext = path.extname(filePath);
      const contentTypes = {
        '.html': 'text/html',
        '.js': 'application/javascript',
        '.css': 'text/css',
        '.json': 'application/json',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.svg': 'image/svg+xml',
        '.ico': 'image/x-icon',
      };
      sendFile(res, filePath, contentTypes[ext] || 'application/octet-stream');
      return;
    }

    // API Routes
    if (pathname.startsWith('/api/')) {
      const body = method !== 'GET' && method !== 'DELETE' ? await parseBody(req) : {};

      // Auth routes
      if (pathname === '/api/auth/login' && method === 'POST') {
        return handleLogin(req, res, body);
      }
      if (pathname === '/api/auth/totp' && method === 'POST') {
        return handleTotpVerify(req, res, body);
      }
      if (pathname === '/api/auth/setup-totp' && method === 'POST') {
        return handleSetupTotp(req, res, body);
      }
      if (pathname === '/api/auth/disable-totp' && method === 'POST') {
        return handleDisableTotp(req, res, body);
      }
      if (pathname === '/api/auth/logout' && method === 'POST') {
        return handleLogout(req, res);
      }

      // User routes
      if (pathname === '/api/users' && method === 'GET') return handleListUsers(req, res);
      if (pathname === '/api/users' && method === 'POST') return handleCreateUser(req, res, body);
      if (pathname.startsWith('/api/users/') && method === 'PUT') {
        const id = pathname.split('/').pop();
        return handleUpdateUser(req, res, body, id);
      }
      if (pathname.startsWith('/api/users/') && method === 'DELETE') {
        const id = pathname.split('/').pop();
        return handleDeleteUser(req, res, id);
      }

      // Agent routes
      if (pathname === '/api/agents' && method === 'GET') return handleListAgents(req, res);
      if (pathname.startsWith('/api/agents/') && method === 'GET') {
        const id = pathname.split('/').pop();
        return handleGetAgent(req, res, id);
      }
      if (pathname.startsWith('/api/agents/') && method === 'DELETE') {
        const id = pathname.split('/').pop();
        return handleDeleteAgent(req, res, id);
      }

      // Store routes
      if (pathname === '/api/store' && method === 'GET') return handleListApps(req, res);
      if (pathname === '/api/store' && method === 'POST') return handleCreateApp(req, res, body);
      if (pathname.startsWith('/api/store/') && method === 'PUT') {
        const id = pathname.split('/').pop();
        return handleUpdateApp(req, res, body, id);
      }
      if (pathname.startsWith('/api/store/') && method === 'DELETE') {
        const id = pathname.split('/').pop();
        return handleDeleteApp(req, res, id);
      }

      // Ticket routes
      if (pathname === '/api/tickets' && method === 'GET') return handleListTickets(req, res);
      if (pathname === '/api/tickets' && method === 'POST') return handleCreateTicket(req, res, body);
      if (pathname.startsWith('/api/tickets/') && method === 'GET') {
        const id = pathname.split('/').pop();
        return handleGetTicket(req, res, id);
      }
      if (pathname.startsWith('/api/tickets/') && method === 'PUT') {
        const parts = pathname.split('/');
        const id = parts[3];
        if (parts.length === 5 && parts[4] === 'reply') return handleReplyTicket(req, res, body, id);
        return handleUpdateTicketStatus(req, res, body, id);
      }

      // Dashboard
      if (pathname === '/api/dashboard' && method === 'GET') return handleDashboard(req, res);

      // Settings
      if (pathname === '/api/settings' && method === 'GET') return handleListSettings(req, res);
      if (pathname === '/api/settings' && method === 'PUT') return handleUpdateSettings(req, res, body);

      // Audit
      if (pathname === '/api/audit' && method === 'GET') return handleListAuditLogs(req, res);

      // Installations
      if (pathname === '/api/installations' && method === 'GET') return handleListInstallations(req, res);
      if (pathname === '/api/installations/install' && method === 'POST') return handleTriggerInstall(req, res, body);
      if (pathname === '/api/installations/uninstall' && method === 'POST') return handleTriggerUninstall(req, res, body);

      // Updates
      if (pathname === '/api/updates' && method === 'GET') return handleListUpdates(req, res);
      if (pathname === '/api/updates' && method === 'POST') return handleUploadUpdate(req, res);
      if (pathname.startsWith('/api/updates/') && method === 'DELETE') {
        const id = pathname.split('/').pop();
        return handleDeleteUpdate(req, res, id);
      }
      if (pathname === '/api/updates/download' && method === 'GET') return handleAgentDownloadUpdate(req, res);
      if (pathname === '/api/updates/serve' && method === 'GET') return handleServeUpdate(req, res);

      // Commands
      if (pathname === '/api/commands/send' && method === 'POST') return handleSendCommand(req, res, body);

      // Agent-facing routes (no auth)
      if (pathname === '/api/agent/ticket' && method === 'POST') return handleAgentTicketSubmit(req, res, body);
      if (pathname === '/api/agent/store' && method === 'GET') return handleAgentStoreList(req, res);

      sendError(res, 404, 'API endpoint not found');
      return;
    }

    // Health check
    if (pathname === '/health') {
      sendJSON(res, 200, { status: 'ok', uptime: process.uptime(), timestamp: new Date().toISOString() });
      return;
    }

    sendError(res, 404, 'Not found');
  } catch (err) {
    console.error('[HTTP] Error:', err);
    sendError(res, 500, 'Internal server error');
  }
}

// ============================================================
// Server Startup
// ============================================================
function main() {
  createDefaultAdmin();
  seedStoreApps();
  cleanExpiredSessions();

  // Clean old metrics (older than 7 days) every hour
  setInterval(() => {
    try {
      stmts.deleteOldMetrics.run('-7 days');
    } catch (e) {
      // ignore
    }
  }, 3600000);

  const server = http.createServer(handleRequest);
  setupWebSocket(server);

  server.listen(CONFIG.port, CONFIG.host, () => {
    console.log('');
    console.log('╔═══════════════════════════════════════════════╗');
    console.log('║         RemoteAdmin v4 - Server              ║');
    console.log('╠═══════════════════════════════════════════════╣');
    console.log(`║  HTTP:     http://${CONFIG.host}:${CONFIG.port}`);
    console.log(`║  WebSocket: ws://${CONFIG.host}:${CONFIG.port}/ws/agent`);
    console.log('║  Database: ' + CONFIG.dbPath);
    console.log('║  Default:  admin / admin123');
    console.log('╚═══════════════════════════════════════════════╝');
    console.log('');
  });

  // Graceful shutdown
  process.on('SIGINT', () => {
    console.log('\n[SHUTDOWN] Closing server...');
    server.close(() => {
      db.close();
      process.exit(0);
    });
  });

  process.on('SIGTERM', () => {
    server.close(() => {
      db.close();
      process.exit(0);
    });
  });
}

main();
