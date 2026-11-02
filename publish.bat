@echo off
setlocal enabledelayedexpansion

title Teams Shifts - Push Release to GitHub
cd /d "%~dp0"

echo ===================================================
echo     Teams Shifts - Automatic GitHub Release Tool
echo ===================================================
echo.

:: Try running PowerShell release script if available
where powershell >nul 2>&1
if %errorlevel% equ 0 (
    powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0push-release.ps1"
    if %errorlevel% equ 0 goto done
)

:: Fallback if PowerShell failed
set "GIT_EXE=git"
if exist "C:\Program Files\Git\cmd\git.exe" (
    set "GIT_EXE=C:\Program Files\Git\cmd\git.exe"
)

where %GIT_EXE% >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Git was not found! Please install Git for Windows.
    pause
    exit /b 1
)

:: Get commit message
set /p MSG="Enter update description (e.g. Added new shift rules): "
if "%MSG%"=="" set "MSG=Update Teams Shifts application"

:: Get version tag
set /p VER="Enter new version (e.g. 1.0.1 or 1.1.0): "
if "%VER%"=="" (
    echo [!] No version entered, committing changes to main without a new release tag.
    "%GIT_EXE%" add .
    "%GIT_EXE%" commit -m "%MSG%"
    "%GIT_EXE%" push origin main
    echo.
    echo [OK] Changes pushed to GitHub successfully!
    goto done
)

:: Format tag with leading v if missing
if not "%VER:~0,1%"=="v" set "VER=v%VER%"

echo.
echo [*] Staging files...
"%GIT_EXE%" add .

echo [*] Committing: %MSG%...
"%GIT_EXE%" commit -m "%MSG% (%VER%)"

echo [*] Creating release tag %VER%...
"%GIT_EXE%" tag -a "%VER%" -m "%MSG%"

echo [*] Pushing to GitHub...
"%GIT_EXE%" push origin main
"%GIT_EXE%" push origin "%VER%" --force

echo.
echo ===================================================
echo [SUCCESS] Pushed to GitHub!
echo GitHub Actions is now automatically:
echo  1. Building the Windows standalone package
echo  2. Compiling TeamsShifts.exe
echo  3. Publishing Release %VER% with TeamsShifts-Standalone.zip
echo ===================================================
echo.

:done
pause
