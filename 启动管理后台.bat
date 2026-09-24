@echo off
chcp 65001 >nul
title 个人作品集管理后台
cd /d "%~dp0"

echo ========================================================
echo       张宁 - 个人作品集管理控制台 (Portfolio Admin)
echo ========================================================
echo.
echo 正在启动本地服务并自动在默认浏览器中打开管理后台...
echo.

node -v >nul 2>&1
if errorlevel 1 (
    echo [错误] 系统中未检测到 Node.js 环境，请先安装 Node.js 后再运行。
    pause
    exit /b 1
)

node scripts\server.js

if errorlevel 1 (
    echo.
    echo [提示] 服务出现异常退出。
    pause
)