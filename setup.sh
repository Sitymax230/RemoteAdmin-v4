#!/bin/bash

# ============================================================
#  RemoteAdmin v4 - Auto Setup Script (Linux / macOS)
#  Запуск: chmod +x setup.sh && ./setup.sh
# ============================================================

set -e

echo ""
echo "╔══════════════════════════════════════════════════╗"
echo "║       RemoteAdmin v4 - Автоматическая установка  ║"
echo "╚══════════════════════════════════════════════════╝"
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Check Node.js
if ! command -v node &> /dev/null; then
    echo -e "${RED}❌ Node.js не установлен!${NC}"
    echo "Установите Node.js: https://nodejs.org/"
    exit 1
fi

NODE_VERSION=$(node -v)
echo -e "${GREEN}✓ Node.js${NC} $NODE_VERSION"

# Check npm
if ! command -v npm &> /dev/null; then
    echo -e "${RED}❌ npm не установлен!${NC}"
    exit 1
fi

NPM_VERSION=$(npm -v)
echo -e "${GREEN}✓ npm${NC} $NPM_VERSION"

echo ""
echo -e "${YELLOW}📦 Установка зависимостей...${NC}"
npm install

echo ""
echo -e "${YELLOW}🗄 Инициализация базы данных...${NC}"
npx prisma db push

echo ""
echo -e "${YELLOW}🌱 Заполнение тестовыми данными...${NC}"
npx prisma db seed || echo -e "${YELLOW}⚠ Seed пропущен (необязательно)${NC}"

echo ""
echo -e "${GREEN}✅ Установка завершена!${NC}"
echo ""
echo "Запустите сервер:"
echo "  npm run dev"
echo ""
echo "Откройте: http://localhost:3000"
echo "Логин: admin | Пароль: admin123"
echo ""
