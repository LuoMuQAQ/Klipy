@echo off
chcp 65001 >nul
title 正在启动 Vouch...
cd /d "%~dp0"

echo ==============================================
echo   Vouch (HeroUI + Electron + C#)
echo ==============================================
echo.
echo 正在检查并启动程序...

call npm start
pause
