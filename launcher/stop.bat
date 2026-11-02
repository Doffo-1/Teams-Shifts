@echo off
title Stop Teams Shifts Services
cd /d "%~dp0"

echo ========================================================
echo        Stopping All Teams Shifts Services
echo ========================================================
echo.

:: 1. Terminate launcher process
echo [1/3] Stopping TeamsShifts.exe...
taskkill /F /IM TeamsShifts.exe >nul 2>&1

:: 2. Terminate any node.exe running from this directory or port
echo [2/3] Stopping background Node runtime services...
for /f "tokens=5" %%a in ('netstat -aon 2^>nul ^| findstr /r ":3000 "') do (
    if not "%%a"=="" taskkill /F /PID %%a >nul 2>&1
)
for /f "tokens=5" %%a in ('netstat -aon 2^>nul ^| findstr /r ":3065 "') do (
    if not "%%a"=="" taskkill /F /PID %%a >nul 2>&1
)

:: 3. Terminate local runtime node.exe if still active
taskkill /F /FI "IMAGENAME eq node.exe" /FI "WINDOWTITLE eq Teams Shifts Generator*" >nul 2>&1

echo [3/3] Releasing ports and file locks...
echo.
echo ========================================================
echo  [SUCCESS] All Teams Shifts services have been stopped.
echo ========================================================
echo.
timeout /t 3 >nul
