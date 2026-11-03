@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo ==========================================
echo   分班志愿填报系统 - 一键启动
echo ==========================================
echo.

where node >nul 2>nul
if errorlevel 1 (
    echo [错误] 未检测到 Node.js
    echo 请先到 https://nodejs.org/ 下载并安装 LTS 版本，然后重新运行本脚本。
    echo.
    pause
    exit /b 1
)

echo [1/3] Node.js 版本:
node --version
echo.

echo [2/3] 安装后端依赖（首次运行较慢，请耐心等待）...
cd backend
call npm install
if errorlevel 1 (
    echo [错误] 依赖安装失败，请检查网络连接。
    pause
    exit /b 1
)
echo.

echo [3/3] 启动服务...
echo.
node server.js

pause
