@echo off
title Teams Shifts Generator (Console Debug Mode)
cd /d "%~dp0"

echo ========================================================
echo        Teams Shifts Generator - Standalone App
echo ========================================================
echo.

:: 1. Ensure any stale process on port 3000 is stopped first
for /f "tokens=5" %%a in ('netstat -aon 2^>nul ^| findstr /r ":3000 "') do (
    if not "%%a"=="" taskkill /F /PID %%a >nul 2>&1
)

echo Starting background server on http://127.0.0.1:3000 ...
echo SQLite Database: data\shifts.db
echo.
echo NOTE: Pressing Ctrl+C or closing this console will stop all
echo       services and release port 3000 immediately.
echo ========================================================
echo.

set PORT=3000
set HOSTNAME=127.0.0.1
set DATABASE_URL=file:%~dp0data\shifts.db
set NODE_ENV=production
set NEXT_TELEMETRY_DISABLED=1
set TZ=Europe/Amsterdam
set DEV_USER_USERNAME=developer
set DEV_USER_NAME=Developer
set DEV_USER_EMAIL=developer@example.com

ping 127.0.0.1 -n 3 >nul
start "" "http://127.0.0.1:3000"

"%~dp0runtime\node.exe" "%~dp0app\server.js"

:: 2. When server exits (via Ctrl+C or process exit), stop all related services
echo.
echo ========================================================
echo Stopping all Teams Shifts services...
echo ========================================================
for /f "tokens=5" %%a in ('netstat -aon 2^>nul ^| findstr /r ":3000 "') do (
    if not "%%a"=="" taskkill /F /PID %%a >nul 2>&1
)
taskkill /F /IM TeamsShifts.exe >nul 2>&1
echo [OK] All services have been stopped.
echo ========================================================
pause
