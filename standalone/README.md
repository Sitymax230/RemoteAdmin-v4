# RemoteAdmin v4 - Remote Administration System

## Quick Start

### Server
```bash
# Install dependencies
npm install

# Start the server (default port 3000)
npm start

# Or with custom port
PORT=8080 npm start
```

The web admin panel is available at: http://localhost:3000
Default login: **admin** / **admin123**

### Agent
```bash
# Start the agent (connects to default localhost:3000)
node agent.js

# Connect to a remote server
node agent.js --server ws://yourserver.com:3000/ws/agent

# Run in stealth mode (minimal logging, no console output)
node agent.js --server ws://yourserver.com:3000/ws/agent --stealth

# Custom local port for store/tickets
node agent.js --server ws://yourserver.com:3000/ws/agent --local-port 9000
```

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
- `POST /api/auth/login` - Login (username, password)
- `POST /api/auth/totp` - Verify 2FA code
- `POST /api/auth/setup-totp` - Setup 2FA
- `POST /api/auth/logout` - Logout

### Users (Admin)
- `GET /api/users` - List users
- `POST /api/users` - Create user
- `PUT /api/users/:id` - Update user
- `DELETE /api/users/:id` - Delete user

### Agents
- `GET /api/agents` - List agents
- `GET /api/agents/:id` - Get agent details
- `DELETE /api/agents/:id` - Remove agent

### Store
- `GET /api/store` - List apps
- `POST /api/store` - Create app
- `PUT /api/store/:id` - Update app
- `DELETE /api/store/:id` - Delete app

### Tickets
- `GET /api/tickets` - List tickets
- `GET /api/tickets/:id` - Get ticket with replies
- `POST /api/tickets` - Create ticket
- `PUT /api/tickets/:id` - Update ticket status
- `PUT /api/tickets/:id/reply` - Reply to ticket

### Dashboard
- `GET /api/dashboard` - Dashboard statistics

### Settings
- `GET /api/settings` - Get all settings
- `PUT /api/settings` - Update settings

### Audit
- `GET /api/audit` - List audit logs

### Commands
- `POST /api/commands/send` - Send command to agent

### Installations
- `GET /api/installations` - List installations
- `POST /api/installations/install` - Trigger install
- `POST /api/installations/uninstall` - Trigger uninstall

### Updates
- `GET /api/updates` - List updates
- `POST /api/updates` - Upload update
- `DELETE /api/updates/:id` - Delete update
- `GET /api/updates/download` - Download update (agent)

## WebSocket Protocol

### Agent Connection
Connect to `ws://server:port/ws/agent`

### Agent Messages
- `register` - Register with server (hostname, os, platform, ip, version)
- `metrics` - Send system metrics (cpu, memory, diskTotal, diskUsed, uptime)
- `screenshot_result` - Screenshot data (base64)
- `stream_frame` - Streaming frame (base64)
- `command_result` - Command execution result
- `exec_result` - Shell command result
- `app_list_result` - Installed apps list
- `install_result` - App install/uninstall result
- `ticket_created` - New ticket from agent
- `update_check` - Check for agent updates

### Server Messages to Agent
- `registered` - Registration confirmation
- `command` - Execute command (screenshot, stream, mouse_*, key_*, etc.)
- `app_install` - Install application
- `app_uninstall` - Uninstall application
- `update_available` - New version available
- `ticket_reply` - Admin replied to ticket

## Architecture

```
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
```

## Security Notes

- Change the default admin password immediately after first login
- Enable 2FA (TOTP) for all admin accounts
- Use HTTPS in production (reverse proxy recommended)
- Restrict CORS_ORIGIN to your admin panel domain
- Set a strong JWT_SECRET environment variable

## License

MIT
