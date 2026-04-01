<div align="center">

# 🖥️ RemoteAdmin v4

**Полная система удалённого администрирования**

[![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript)](https://www.typescriptlang.org/)
[![Prisma](https://img.shields.io/badge/Prisma-6.x-2D3748?logo=prisma)](https://prisma.io/)
[![SQLite](https://img.shields.io/badge/SQLite-3-003B57?logo=sqlite)](https://sqlite.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

[Установка](#-quick-start) · [API](#-api-endpoints) · [Скриншоты](#-скриншот) · [Лицензия](#-лицензия)

</div>

---

## 📋 Описание

**RemoteAdmin v4** — это комплексная система удалённого администрирования, предназначенная для централизованного управления компьютерами и серверами. Позволяет контролировать устройства через веб-интерфейс в режиме реального времени, выполнять команды, устанавливать приложения и отслеживать состояние каждого подключённого агента.

Система состоит из **Next.js веб-панели** (frontend + API backend) и **standalone-сервера** с WebSocket-подключениями для агентов. Поддерживаются как Windows, так и Linux агенты.

![RemoteAdmin v4](public/logo.svg)

---

## ✨ Возможности

| # | Возможность | Описание |
|---|-------------|----------|
| 🔐 | **Авторизация с TOTP 2FA** | Двухфакторная аутентификация через TOTP (как в Webmin) — Google Authenticator, Authy и др. |
| 👥 | **Мультипользовательское управление** | Три роли: `superadmin`, `admin`, `viewer` — гибкий контроль доступа |
| 🖥️ | **Удалённый рабочий стол** | Скриншоты, live-трансляция экрана, управление мышью и клавиатурой через WebSocket |
| 📊 | **Мониторинг в реальном времени** | CPU, RAM, диск, uptime — данные через WebSocket с графиками |
| 🛒 | **App Store** | Каталог приложений для удалённой установки на агенты (winget, apt и др.) |
| 🎫 | **Система тикетов** | Пользователи создают запросы → администраторы отвечают и решают |
| 🖥️ | **Заставка «Обновление системы»** | Блокировка экрана агента с сообщением об обновлении |
| 📈 | **Дашборды с аналитикой** | Графики, метрики, статистика по всем агентам и системе в целом |
| 🔧 | **Терминал** | Удалённое выполнение команд на агенте через веб-консоль |
| 🔄 | **Автообновление агента** | Загрузка и применение обновлений агента с сервера |
| 👁️ | **Стелс-режим** | Скрытый запуск агента без консольного окна (для Windows — VBS-скрипты) |
| 📁 | **Файловый менеджер** | Просмотр и навигация по файловой системе удалённого сервера |
| 🔒 | **Защита от перебора** | Brute-force protection — блокировка после N неудачных попыток входа |
| 📋 | **Аудит-лог** | Полный журнал всех действий пользователей и администраторов |
| 🎨 | **Кастомизация интерфейса** | Настройка акцентного цвета, ширины сайдбара и макета |

---

## 🛠 Технологический стек

| Технология | Версия | Назначение |
|-----------|--------|------------|
| **Next.js** | 16.x | Full-stack React-фреймворк (App Router) |
| **React** | 19.x | UI-библиотека |
| **TypeScript** | 5.x | Типобезопасная разработка |
| **Tailwind CSS** | 4.x | Utility-first CSS-фреймворк |
| **shadcn/ui** | latest | Компонентная библиотека на Radix UI |
| **Prisma** | 6.x | ORM для работы с базой данных |
| **SQLite** | 3.x | Встраиваемая СУБД (нулевая конфигурация) |
| **better-sqlite3** | 11.x | SQLite-драйвер для standalone-сервера |
| **WebSocket (ws)** | 8.x | Двунаправленная связь с агентами в реальном времени |
| **otplib** | 12.x | Генерация и верификация TOTP-кодов |
| **Recharts** | 2.x | Графики и визуализация данных |
| **Zustand** | 5.x | Управление состоянием на клиенте |
| **React Query** | 5.x | Кэширование и синхронизация серверных данных |
| **Framer Motion** | 12.x | Анимации интерфейса |
| **Lucide React** | latest | Иконки |

---

## 📁 Структура проекта

```
RemoteAdmin-v4/
├── 📁 src/
│   ├── 📁 app/
│   │   ├── 📁 api/
│   │   │   ├── route.ts              # API root
│   │   │   ├── 📁 auth/
│   │   │   │   ├── login/route.ts    # POST /api/auth/login
│   │   │   │   ├── totp/route.ts     # POST /api/auth/totp
│   │   │   │   └── setup-totp/route.ts # POST /api/auth/setup-totp
│   │   │   ├── 📁 agents/
│   │   │   │   ├── route.ts          # GET/DELETE /api/agents
│   │   │   │   └── 📁 [id]/route.ts  # GET/DELETE /api/agents/:id
│   │   │   ├── 📁 tickets/
│   │   │   │   ├── route.ts          # GET/POST /api/tickets
│   │   │   │   └── 📁 [id]/route.ts  # GET/PUT/DELETE /api/tickets/:id
│   │   │   ├── 📁 store/route.ts     # GET/POST /api/store
│   │   │   ├── 📁 files/route.ts     # GET /api/files
│   │   │   ├── 📁 dashboard/route.ts # GET /api/dashboard
│   │   │   ├── 📁 users/route.ts     # GET/POST/PUT/DELETE /api/users
│   │   │   ├── 📁 settings/route.ts  # GET/PUT /api/settings
│   │   │   ├── 📁 audit/route.ts     # GET /api/audit
│   │   │   └── 📁 updates/route.ts   # GET/POST/DELETE /api/updates
│   │   ├── layout.tsx                 # Root layout
│   │   ├── page.tsx                   # Main page
│   │   └── globals.css                # Global styles
│   ├── 📁 components/
│   │   └── 📁 ui/                     # shadcn/ui компоненты
│   ├── 📁 hooks/                      # Custom React hooks
│   └── 📁 lib/
│       ├── db.ts                      # Prisma client
│       ├── crypto.ts                  # Хэширование, TOTP
│       ├── store.ts                   # Zustand store
│       ├── seed.ts                    # Database seeder
│       └── utils.ts                   # Утилиты
├── 📁 prisma/
│   └── schema.prisma                  # Схема базы данных
├── 📁 standalone/
│   ├── server.js                      # Standalone Node.js сервер
│   ├── agent.js                       # Агент для удалённых машин
│   ├── builder.js                     # Сборка EXE (pkg)
│   ├── start-hidden.bat               # Windows: скрытый запуск
│   ├── start-silent.vbs               # Windows: VBS-обёртка
│   └── package.json                   # Зависимости standalone
├── 📁 public/
│   ├── logo.svg                       # Логотип проекта
│   └── download/                      # Готовые сборки для скачивания
├── package.json
├── next.config.ts
├── tailwind.config.ts
├── tsconfig.json
└── README.md
```

---

## 🚀 Quick Start

### Требования

- **Node.js** ≥ 18.x (рекомендуется 20+)
- **npm** ≥ 9.x или **bun** ≥ 1.x
- **Git**

### Установка и запуск

```bash
# 1. Клонируйте репозиторий
git clone https://github.com/Sitymax230/RemoteAdmin-v4.git
cd RemoteAdmin-v4

# 2. Установите зависимости
npm install
# или
bun install

# 3. Инициализируйте базу данных
npx prisma db push

# 4. Заполните тестовыми данными
npx prisma db seed

# 5. Запустите сервер разработки
npm run dev
```

Откройте [http://localhost:3000](http://localhost:3000) в браузере.

> **Учётные данные по умолчанию:**
> - 🔑 Логин: `admin`
> - 🔑 Пароль: `admin123`
> - 👁️ Роль: `superadmin`

<details>
<summary><b>👤 Дополнительные тестовые аккаунты</b></summary>

| Логин | Пароль | Роль |
|-------|--------|------|
| `admin` | `admin123` | `superadmin` |
| `operator` | `oper123` | `admin` |
| `viewer` | `viewer123` | `viewer` |

</details>

---

## 🖧 Standalone Server

Standalone-сервер — это полностью автономный Node.js-сервер без зависимости от Next.js. Использует `http`, `ws`, `better-sqlite3` и `otplib`.

```bash
# Перейдите в директорию standalone
cd standalone

# Установите зависимости
npm install

# Запустите сервер
node server.js
```

Сервер будет доступен на `http://localhost:3000`. При первом запуске автоматически создаётся:
- База данных SQLite в `data/remoteadmin.db`
- Аккаунт `admin / admin123`
- 10 предустановленных приложений в App Store

---

## 🤖 Настройка агента

Агент подключается к серверу через WebSocket и выполняет команды удалённо.

### Базовый запуск

```bash
node agent.js --server ws://your-server:3000
```

### Стелс-режим (Windows)

В стелс-режиме агент запускается **без видимого консольного окна**:

```bash
# Через VBS-обёртку (рекомендуется)
start-silent.vbs

# Через BAT-файл
start-hidden.bat

# Или напрямую с флагом --stealth
node agent.js --server ws://your-server:3000 --stealth
```

### Параметры командной строки

| Параметр | Описание | По умолчанию |
|----------|----------|--------------|
| `--server` | WebSocket URL сервера | `ws://localhost:3000` |
| `--stealth` | Скрытый запуск без консоли | `false` |
| `--reconnect` | Интервал реконнекта (мс) | `5000` |

---

## 📡 API Endpoints

### Аутентификация

| Метод | Путь | Описание |
|-------|------|----------|
| `POST` | `/api/auth/login` | Вход в систему (возвращает JWT-токен) |
| `POST` | `/api/auth/totp` | Верификация TOTP-кода |
| `POST` | `/api/auth/setup-totp` | Включение двухфакторной аутентификации |

### Агенты

| Метод | Путь | Описание |
|-------|------|----------|
| `GET` | `/api/agents` | Список всех агентов с текущими метриками |
| `GET` | `/api/agents/:id` | Информация об агенте + история метрик |
| `DELETE` | `/api/agents/:id` | Удаление агента |

### Тикеты

| Метод | Путь | Описание |
|-------|------|----------|
| `GET` | `/api/tickets` | Список всех тикетов |
| `POST` | `/api/tickets` | Создание тикета (от агента) |
| `GET` | `/api/tickets/:id` | Тикет с ответами |
| `PUT` | `/api/tickets/:id` | Обновление статуса тикета |

### Приложения и файлы

| Метод | Путь | Описание |
|-------|------|----------|
| `GET` | `/api/store` | Каталог приложений App Store |
| `GET` | `/api/files` | Файловый менеджер сервера |

### Система

| Метод | Путь | Описание |
|-------|------|----------|
| `GET` | `/api/dashboard` | Данные для дашборда (агрегированная статистика) |
| `GET` | `/api/users` | Список пользователей |
| `GET` | `/api/settings` | Настройки системы |
| `GET` | `/api/audit` | Аудит-лог (с пагинацией) |
| `GET` | `/api/updates` | Доступные обновления агента |

> **Авторизация:** Все эндпоинты (кроме `/api/auth/login`) требуют заголовок `Authorization: Bearer <token>`.

---

## 🔐 Настройка TOTP 2FA

Двухфакторная аутентификация повышает безопасность аккаунта, требуя одноразовый код при каждом входе.

### Включение 2FA

1. Войдите в систему под своим аккаунтом
2. Перейдите в **Настройки профиля** → **Безопасность**
3. Нажмите **«Включить 2FA»**
4. Система покажет **QR-код** и **секретный ключ**
5. Отсканируйте QR-код в приложении-аутентификаторе:
   - **Google Authenticator** (iOS / Android)
   - **Authy**
   - **Microsoft Authenticator**
   - **1Password**
6. Введите 6-значный код для подтверждения

### Как это работает

```
Вход → Логин + Пароль → (если 2FA включена) → Ввод TOTP-кода → Доступ
```

- TOTP-код обновляется каждые 30 секунд
- Коды генерируются **оффлайн** на устройстве
- Совместим со стандартом **RFC 6238**

### Отключение 2FA

Для отключения потребуется ввести текущий TOTP-код — это защищает от несанкционированного отключения.

---

## 📦 Сборка EXE

Для создания standalone-исполнимого файла агента (без необходимости установки Node.js):

```bash
cd standalone

# Установите зависимости
npm install

# Соберите EXE
node builder.js --exe
```

Результат: `dist/remoteadmin-agent.exe` — готовый к распространению файл.

<details>
<summary><b>⚙️ Параметры сборки</b></summary>

| Параметр | Описание | По умолчанию |
|----------|----------|--------------|
| `--exe` | Собрать Windows EXE | — |
| `--target` | Целевая платформа | `node18-win-x64` |
| `--output` | Путь вывода | `dist/` |

</details>

---

## ⚙️ Переменные окружения

| Переменная | Описание | По умолчанию |
|-----------|----------|--------------|
| `DATABASE_URL` | Путь к SQLite базе данных | `file:./dev.db` |
| `PORT` | Порт сервера | `3000` |
| `HOST` | Хост для прослушивания | `0.0.0.0` |
| `JWT_SECRET` | Секретный ключ для JWT-токенов | Автогенерация |
| `CORS_ORIGIN` | Разрешённый CORS- origins | `*` |
| `DB_PATH` | Путь к БД (standalone) | `./data/remoteadmin.db` |
| `NODE_ENV` | Окружение | `development` |

### Пример `.env` файла

```env
DATABASE_URL="file:./dev.db"
PORT=3000
JWT_SECRET="your-super-secret-key-change-this"
CORS_ORIGIN="https://yourdomain.com"
NODE_ENV="production"
```

---

## 🗄 Схема базы данных

<details>
<summary><b>Перечень таблиц Prisma Schema</b></summary>

| Модель | Описание |
|--------|----------|
| `AdminUser` | Пользователи системы (superadmin / admin / viewer) |
| `Agent` | Подключённые удалённые устройства |
| `AgentMetric` | Метрики агентов (CPU, RAM, диск) |
| `StoreApp` | Приложения в App Store |
| `Installation` | Установленные приложения на агентах |
| `Ticket` | Тикеты поддержки |
| `TicketReply` | Ответы на тикеты |
| `AuditLog` | Журнал действий |
| `AdminSetting` | Системные настройки |
| `AgentUpdate` | Доступные обновления агента |

</details>

---

## 🌐 WebSocket Протокол

Агенты подключаются к серверу по WebSocket и обмениваются JSON-сообщениями:

```jsonc
// От агента → Сервер
{ "type": "register", "hostname": "PC-01", "os": "Windows 11", "platform": "win32" }
{ "type": "metrics", "cpu": 45.2, "memory": 62.1, "diskTotal": 500, "diskUsed": 280, "uptime": 86400 }

// От сервера → Агент
{ "type": "screenshot" }
{ "type": "command", "command": "install_app", "params": { "name": "VS Code" } }
{ "type": "lock_screen", "message": "Идёт обновление системы..." }
```

---

## 📄 Лицензия

本项目采用 [MIT License](LICENSE) 开源。

```
MIT License

Copyright (c) 2025 RemoteAdmin v4

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
```

---

<div align="center">

**Сделано с ❤️ командой RemoteAdmin**

[GitHub](https://github.com/Sitymax230/RemoteAdmin-v4) · [Issues](https://github.com/Sitymax230/RemoteAdmin-v4/issues) · [Документация](#)

</div>
