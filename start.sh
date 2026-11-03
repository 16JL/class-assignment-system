#!/usr/bin/env bash
set -e

cd "$(dirname "$0")"

echo "=========================================="
echo "  分班志愿填报系统 - 一键启动"
echo "=========================================="
echo

if ! command -v node >/dev/null 2>&1; then
    echo "[错误] 未检测到 Node.js"
    echo "请先安装 Node.js (>= 18): https://nodejs.org/"
    exit 1
fi

echo "[1/3] Node.js 版本: $(node --version)"
echo

echo "[2/3] 安装后端依赖（首次运行较慢）..."
cd backend
npm install
echo

echo "[3/3] 启动服务..."
echo
node server.js
