import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { spawn } from 'child_process';

function getUpdatesDir(): string {
  const baseDir =
    process.env.LOCALAPPDATA ||
    (process.platform === 'win32' ? 'C:\\ProgramData' : os.tmpdir());
  return path.join(baseDir, 'TeamsShifts', 'updates');
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const assetType = body.assetType === 'portable' ? 'portable' : 'installer';
    const updatesDir = getUpdatesDir();

    let targetFilePath = body.filePath;
    if (!targetFilePath || !fs.existsSync(targetFilePath)) {
      const fileName = assetType === 'portable' ? 'TeamsShifts-Standalone.zip' : 'TeamsShifts-Setup.exe';
      targetFilePath = path.join(updatesDir, fileName);
    }

    if (!fs.existsSync(targetFilePath)) {
      return NextResponse.json(
        { error: `Update package file not found at: ${targetFilePath}. Please download it first.` },
        { status: 404 }
      );
    }

    // Mark update in progress so launcher watchdog knows an update is active
    try {
      const flagFile = path.join(updatesDir, '.updating');
      fs.writeFileSync(flagFile, Date.now().toString());
    } catch {}

    const tempDir = os.tmpdir();
    const batPath = path.join(tempDir, `teams-shifts-update-${Date.now()}.bat`);

    // Determine application directory
    let appDir = process.cwd();
    // If running in standalone (inside dist/TeamsShifts/app or standalone-app/app), parent is app root
    if (path.basename(appDir).toLowerCase() === 'app') {
      const parentDir = path.dirname(appDir);
      if (fs.existsSync(path.join(parentDir, 'TeamsShifts.exe'))) {
        appDir = parentDir;
      }
    }

    let batContent = '';
    if (assetType === 'installer') {
      batContent = `@echo off
title Teams Shifts Setup
echo ========================================================
echo Teams Shifts Desktop Update
echo ========================================================
echo Preparing update...
timeout /t 2 /nobreak >nul

:: Gracefully terminate any remaining app and node instances
taskkill /F /IM TeamsShifts.exe >nul 2>&1
taskkill /F /IM node.exe >nul 2>&1
timeout /t 1 /nobreak >nul

echo Launching installer...
start "" "${targetFilePath.replace(/\\/g, '\\\\')}"
del "%~f0" >nul 2>&1
exit
`;
    } else {
      batContent = `@echo off
title Teams Shifts Portable Updater
echo ========================================================
echo Updating Teams Shifts Portable Edition...
echo ========================================================
echo Waiting for application to exit...
timeout /t 2 /nobreak >nul

taskkill /F /IM TeamsShifts.exe >nul 2>&1
taskkill /F /IM node.exe >nul 2>&1
timeout /t 1 /nobreak >nul

set "EXTRACT_DIR=%TEMP%\\TeamsShifts_Extract_%RANDOM%"
echo Extracting update archive to %EXTRACT_DIR%...
powershell -NoProfile -ExecutionPolicy Bypass -Command "Expand-Archive -LiteralPath '${targetFilePath.replace(/\\/g, '\\\\')}' -DestinationPath '%EXTRACT_DIR%' -Force"

echo Updating application files...
robocopy "%EXTRACT_DIR%\\TeamsShifts" "${appDir.replace(/\\/g, '\\\\')}" /E /XD "${appDir.replace(/\\/g, '\\\\')}\\data" /XF "*.db" /NP /NJS /NJH

rmdir /S /Q "%EXTRACT_DIR%" >nul 2>&1

echo Update applied successfully! Relaunching Teams Shifts...
cd /d "${appDir.replace(/\\/g, '\\\\')}"
start "" "${path.join(appDir, 'TeamsShifts.exe').replace(/\\/g, '\\\\')}"
del "%~f0" >nul 2>&1
exit
`;
    }

    fs.writeFileSync(batPath, batContent);

    // Spawn detached process
    const child = spawn('cmd.exe', ['/c', batPath], {
      detached: true,
      stdio: 'ignore',
      windowsHide: false,
    });
    child.unref();

    // Trigger graceful exit of Node process after 1.5 seconds
    setTimeout(() => {
      console.log('[AutoUpdate] Shutting down Node server for installer execution...');
      process.exit(0);
    }, 1500);

    return NextResponse.json({
      success: true,
      message: 'Update runner initiated. Application will shut down cleanly in 1-2 seconds.',
      filePath: targetFilePath,
    });
  } catch (err: any) {
    console.error('[AutoUpdate] Error applying update:', err);
    return NextResponse.json({ error: err?.message || 'Failed to apply update' }, { status: 500 });
  }
}
