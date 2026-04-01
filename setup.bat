@echo off
chcp 65001 >nul 2>&1
title RemoteAdmin v4 - Установка

echo.
echo ╔══════════════════════════════════════════════════╗
echo ║       RemoteAdmin v4 - Автоматическая установка  ║
echo ╚══════════════════════════════════════════════════╝
echo.

:: Check Node.js
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo [ОШИБКА] Node.js не установлен!
    echo Установите Node.js: https://nodejs.org/
    pause
    exit /b 1
)

for /f "tokens=*" %%v in ('node -v') do set NODE_VER=%%v
echo [OK] Node.js %NODE_VER%

:: Check npm
where npm >nul 2>&1
if %errorlevel% neq 0 (
    echo [ОШИБКА] npm не установлен!
    pause
    exit /b 1
)

for /f "tokens=*" %%v in ('npm -v') do set NPM_VER=%%v
echo [OK] npm %NPM_VER%

echo.
echo [1/3] Установка зависимостей...
call npm install
if %errorlevel% neq 0 (
    echo [ОШИБКА] Не удалось установить зависимости!
    pause
    exit /b 1
)

echo.
echo [2/3] Инициализация базы данных...
call npx prisma db push
if %errorlevel% neq 0 (
    echo [ОШИБКА] Не удалось инициализировать БД!
    pause
    exit /b 1
)

echo.
echo [3/3] Заполнение тестовыми данными...
call npx prisma db seed
if %errorlevel% neq 0 (
    echo [ПРЕДУПРЕЖДЕНИЕ] Seed пропущен (необязательно)
)

echo.
echo ══════════════════════════════════════════════════
echo  ✅ Установка завершена!
echo ══════════════════════════════════════════════════
echo.
echo Запустите сервер:
echo   npm run dev
echo.
echo Откройте: http://localhost:3000
echo Логин: admin  |  Пароль: admin123
echo.
pause
