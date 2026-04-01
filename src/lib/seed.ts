import { db } from './db';
import { hashPassword, generateTOTPSecret } from './crypto';

async function seed() {
  console.log('Seeding database...');

  // Create default superadmin
  const adminPass = hashPassword('admin123');
  const admin = await db.adminUser.upsert({
    where: { username: 'admin' },
    update: {},
    create: {
      username: 'admin',
      passwordHash: adminPass,
      role: 'superadmin',
      totpSecret: generateTOTPSecret(),
      totpEnabled: false,
    },
  });

  // Create additional demo users
  const viewerPass = hashPassword('viewer123');
  await db.adminUser.upsert({
    where: { username: 'viewer' },
    update: {},
    create: {
      username: 'viewer',
      passwordHash: viewerPass,
      role: 'viewer',
    },
  });

  const operPass = hashPassword('oper123');
  await db.adminUser.upsert({
    where: { username: 'operator' },
    update: {},
    create: {
      username: 'operator',
      passwordHash: operPass,
      role: 'admin',
    },
  });

  // Create demo agents
  const agents = [
    { hostname: 'DESKTOP-WIN01', os: 'Windows 11 Pro', platform: 'win32', ip: '192.168.1.101', version: '4.0.0', status: 'online' },
    { hostname: 'DESKTOP-WIN02', os: 'Windows 10 Enterprise', platform: 'win32', ip: '192.168.1.102', version: '4.0.0', status: 'online' },
    { hostname: 'SRV-LINUX01', os: 'Ubuntu 22.04 LTS', platform: 'linux', ip: '192.168.1.201', version: '4.0.0', status: 'online' },
    { hostname: 'LAPTOP-DEV01', os: 'Windows 11 Pro', platform: 'win32', ip: '192.168.1.150', version: '3.9.2', status: 'offline' },
    { hostname: 'SRV-LINUX02', os: 'Debian 12', platform: 'linux', ip: '192.168.1.202', version: '4.0.0', status: 'offline' },
  ];

  const createdAgents = [];
  for (const a of agents) {
    const agent = await db.agent.create({ data: a });
    createdAgents.push(agent);
  }

  // Create metrics for online agents
  for (let i = 0; i < 3; i++) {
    const agent = createdAgents[i];
    for (let j = 0; j < 24; j++) {
      const cpu = 20 + Math.random() * 60;
      const mem = 40 + Math.random() * 40;
      const diskTotal = agent.platform === 'win32' ? 500 : 1000;
      const diskUsed = diskTotal * (0.3 + Math.random() * 0.5);
      await db.agentMetric.create({
        data: {
          agentId: agent.id,
          cpu: Math.round(cpu * 10) / 10,
          memory: Math.round(mem * 10) / 10,
          diskTotal,
          diskUsed: Math.round(diskUsed * 10) / 10,
          uptime: Math.floor(Math.random() * 864000),
          timestamp: new Date(Date.now() - j * 3600000),
        },
      });
    }
  }

  // Create store apps
  const apps = [
    { name: 'VS Code', description: 'Visual Studio Code editor', category: 'Development', icon: '💻', installCmd: 'winget install Microsoft.VisualStudioCode', uninstallCmd: 'winget uninstall Microsoft.VisualStudioCode', platform: 'windows', version: '1.96.2', featured: true },
    { name: 'Firefox', description: 'Mozilla Firefox browser', category: 'Browsers', icon: '🦊', installCmd: 'winget install Mozilla.Firefox', uninstallCmd: 'winget uninstall Mozilla.Firefox', platform: 'windows', version: '133.0', featured: true },
    { name: 'Chrome', description: 'Google Chrome browser', category: 'Browsers', icon: '🌐', installCmd: 'winget install Google.Chrome', uninstallCmd: 'winget uninstall Google.Chrome', platform: 'windows', version: '131.0', featured: false },
    { name: '7-Zip', description: 'File archiver with high compression', category: 'Utilities', icon: '📦', installCmd: 'winget install 7zip.7zip', uninstallCmd: 'winget uninstall 7zip.7zip', platform: 'windows', version: '24.09', featured: false },
    { name: 'VLC', description: 'VLC media player', category: 'Media', icon: '🎬', installCmd: 'winget install VideoLAN.VLC', uninstallCmd: 'winget uninstall VideoLAN.VLC', platform: 'both', version: '3.0.21', featured: true },
    { name: 'Git', description: 'Distributed version control', category: 'Development', icon: '🔀', installCmd: 'winget install Git.Git', uninstallCmd: 'winget uninstall Git.Git', platform: 'both', version: '2.47.1', featured: false },
    { name: 'Node.js', description: 'JavaScript runtime', category: 'Development', icon: '🟢', installCmd: 'winget install OpenJS.NodeJS.LTS', uninstallCmd: 'winget uninstall OpenJS.NodeJS.LTS', platform: 'both', version: '22.12.0', featured: true },
    { name: 'Python', description: 'Python programming language', category: 'Development', icon: '🐍', installCmd: 'winget install Python.Python.3.12', uninstallCmd: 'winget uninstall Python.Python.3.12', platform: 'both', version: '3.12.8', featured: false },
    { name: 'Notepad++', description: 'Source code editor', category: 'Development', icon: '📝', installCmd: 'winget install Notepad++.Notepad++', uninstallCmd: 'winget uninstall Notepad++.Notepad++', platform: 'windows', version: '8.7.4', featured: false },
    { name: 'Docker Desktop', description: 'Container platform', category: 'DevOps', icon: '🐳', installCmd: 'winget install Docker.DockerDesktop', uninstallCmd: 'winget uninstall Docker.DockerDesktop', platform: 'windows', version: '4.37.0', featured: true },
    { name: 'Nginx', description: 'Web server and reverse proxy', category: 'Servers', icon: '⚙️', installCmd: 'apt install nginx -y', uninstallCmd: 'apt remove nginx -y', platform: 'linux', version: '1.24.0', featured: false },
    { name: 'PostgreSQL', description: 'Advanced database', category: 'Databases', icon: '🐘', installCmd: 'apt install postgresql -y', uninstallCmd: 'apt remove postgresql -y', platform: 'linux', version: '16.1', featured: true },
  ];

  const createdApps = [];
  for (const app of apps) {
    const created = await db.storeApp.create({ data: app });
    createdApps.push(created);
  }

  // Create some installations
  for (let i = 0; i < 4; i++) {
    await db.installation.create({
      data: {
        appId: createdApps[0].id,
        agentId: createdAgents[i].id,
        installedBy: 'admin',
        status: 'installed',
      },
    });
    if (i < 2) {
      await db.installation.create({
        data: {
          appId: createdApps[1].id,
          agentId: createdAgents[i].id,
          installedBy: 'admin',
          status: 'installed',
        },
      });
    }
  }

  // Create tickets
  const tickets = [
    { agentId: createdAgents[0].id, subject: 'Не работает VPN', message: 'После обновления Windows VPN клиент перестал подключаться. Пробовал переустановить — не помогает.', priority: 'high', status: 'in_progress' },
    { agentId: createdAgents[1].id, subject: 'Нужен Photoshop', message: 'Для работы дизайн-отдела необходимо установить Adobe Photoshop на рабочий компьютер.', priority: 'normal', status: 'open' },
    { agentId: createdAgents[2].id, subject: 'Обновление ОС', message: 'Сервер просит обновить пакеты безопасности. Можно ли запустить обновление в нерабочее время?', priority: 'low', status: 'resolved' },
    { agentId: createdAgents[0].id, subject: 'Тормозит компьютер', message: 'Компьютер стал очень медленно работать, особенно при открытии браузера. RAM загружена на 95%.', priority: 'critical', status: 'open' },
    { agentId: createdAgents[2].id, subject: 'Настроить бэкапы', message: 'Нужно настроить автоматическое резервное копирование базы данных на внешний сервер.', priority: 'normal', status: 'in_progress' },
  ];

  for (const t of tickets) {
    const ticket = await db.ticket.create({
      data: {
        agentId: t.agentId,
        subject: t.subject,
        message: t.message,
        priority: t.priority,
        status: t.status,
      },
    });

    // Add some replies
    if (t.status !== 'open') {
      await db.ticketReply.create({
        data: {
          ticketId: ticket.id,
          authorId: admin.id,
          isAdmin: true,
          message: 'Принято в работу. Начинаю диагностику.',
        },
      });
    }
    if (t.status === 'resolved') {
      await db.ticketReply.create({
        data: {
          ticketId: ticket.id,
          authorId: admin.id,
          isAdmin: true,
          message: 'Обновление выполнено успешно. Все пакеты безопасности установлены.',
        },
      });
    }
  }

  // Create audit logs
  await db.auditLog.createMany({
    data: [
      { userId: admin.id, action: 'login', detail: 'Вход в систему', ip: '192.168.1.1' },
      { userId: admin.id, action: 'user_create', detail: 'Создан пользователь operator', ip: '192.168.1.1' },
      { userId: admin.id, action: 'app_install', detail: 'VS Code установлен на DESKTOP-WIN01', ip: '192.168.1.1' },
      { userId: admin.id, action: 'ticket_reply', detail: 'Ответ на тикет #1', ip: '192.168.1.1' },
      { userId: admin.id, action: 'settings_update', detail: 'Изменены настройки безопасности', ip: '192.168.1.1' },
    ],
  });

  // Create default settings
  await db.adminSetting.createMany({
    data: [
      { key: 'accent_color', value: '#6366f1' },
      { key: 'sidebar_width', value: '260' },
      { key: 'layout', value: 'default' },
      { key: 'bruteforce_max_attempts', value: '5' },
      { key: 'bruteforce_lockout_minutes', value: '15' },
      { key: 'log_auth', value: 'true' },
      { key: 'log_api', value: 'true' },
    ],
  });

  console.log('Seed complete!');
  console.log('Default admin: admin / admin123');
}

seed().catch(console.error);
