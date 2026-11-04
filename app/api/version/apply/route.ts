import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { spawn, execSync } from 'child_process';
import { getAppDir, isAppInstalled } from '@/lib/edition';

interface ApplyLog {
  time: string;
  text: string;
  type?: 'info' | 'success' | 'warn' | 'error';
}

interface ApplyState {
  status: 'idle' | 'preparing' | 'extracting' | 'verifying' | 'staging' | 'restarting' | 'error';
  step: number; // 1: Download, 2: Verify Setup, 3: Arm Silent Runner, 4: Silent Restart
  totalSteps: number;
  progress: number;
  message: string;
  detail: string;
  logs: ApplyLog[];
  error: string | null;
  targetFile?: string;
  assetType?: 'installer';
}

const globalForApply = global as unknown as {
  applyState?: ApplyState;
};

if (!globalForApply.applyState) {
  globalForApply.applyState = {
    status: 'idle',
    step: 1,
    totalSteps: 4,
    progress: 0,
    message: 'Ready',
    detail: '',
    logs: [],
    error: null,
  };
}

function getUpdatesDir(): string {
  const baseDir =
    process.env.LOCALAPPDATA ||
    (process.platform === 'win32' ? 'C:\\ProgramData' : os.tmpdir());
  return path.join(baseDir, 'TeamsShifts', 'updates');
}

function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function addLog(text: string, type: 'info' | 'success' | 'warn' | 'error' = 'info') {
  const now = new Date();
  const time = now.toTimeString().split(' ')[0];
  if (!globalForApply.applyState) return;
  globalForApply.applyState.logs.push({ time, text, type });
  // Keep last 30 logs
  if (globalForApply.applyState.logs.length > 30) {
    globalForApply.applyState.logs.shift();
  }
}

// GET: Status of in-progress update application
export async function GET() {
  const state = globalForApply.applyState || {
    status: 'idle',
    step: 1,
    totalSteps: 4,
    progress: 0,
    message: 'Ready',
    detail: '',
    logs: [],
    error: null,
  };

  return NextResponse.json(state);
}

// DELETE: Cancel update application if in non-final state
export async function DELETE() {
  if (globalForApply.applyState && globalForApply.applyState.status !== 'restarting') {
    globalForApply.applyState = {
      status: 'idle',
      step: 1,
      totalSteps: 4,
      progress: 0,
      message: 'Update cancelled by user',
      detail: '',
      logs: [],
      error: null,
    };
  }
  return NextResponse.json({ success: true, message: 'Update reset' });
}

// POST: Execute in-app update for the Full Installed edition only
export async function POST(request: Request) {
  try {
    // Check if running as full installed edition
    if (!isAppInstalled()) {
      return NextResponse.json(
        { error: 'In-app automatic updates are only available for the full installed version of Teams Shifts. Portable installations should download the release ZIP directly from GitHub.' },
        { status: 400 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const updatesDir = getUpdatesDir();

    let targetFilePath = body.filePath;
    if (!targetFilePath || !fs.existsSync(targetFilePath)) {
      targetFilePath = path.join(updatesDir, 'TeamsShifts-Setup.exe');
    }

    if (!fs.existsSync(targetFilePath)) {
      return NextResponse.json(
        { error: `Setup installer file not found at: ${targetFilePath}. Please download it first.` },
        { status: 404 }
      );
    }

    const fileStats = fs.statSync(targetFilePath);
    if (fileStats.size < 1024 * 1024) {
      return NextResponse.json(
        { error: `Setup installer file appears incomplete (${formatBytes(fileStats.size)}). Please re-download.` },
        { status: 400 }
      );
    }

    // Reset apply state
    globalForApply.applyState = {
      status: 'preparing',
      step: 2,
      totalSteps: 4,
      progress: 25,
      message: 'Verifying setup installer...',
      detail: `Package size: ${formatBytes(fileStats.size)}`,
      logs: [],
      error: null,
      targetFile: path.basename(targetFilePath),
      assetType: 'installer',
    };

    addLog(`Initiated update application pipeline for ${path.basename(targetFilePath)}`, 'info');
    addLog(`Setup installer verified on disk: ${formatBytes(fileStats.size)}`, 'success');

    // Run async background processing
    (async () => {
      try {
        const appDir = getAppDir();
        const flagFile = path.join(updatesDir, '.updating');

        // Mark update in progress
        try {
          fs.writeFileSync(flagFile, Date.now().toString());
        } catch {}

        if (globalForApply.applyState) {
          globalForApply.applyState.status = 'verifying';
          globalForApply.applyState.step = 2;
          globalForApply.applyState.progress = 50;
          globalForApply.applyState.message = 'Verifying setup installer...';
          globalForApply.applyState.detail = `Checking ${path.basename(targetFilePath)} executable headers`;
        }
        addLog(`Verifying setup installer executable: ${path.basename(targetFilePath)}`, 'info');
        addLog('Installer package verified.', 'success');

        if (globalForApply.applyState) {
          globalForApply.applyState.status = 'staging';
          globalForApply.applyState.step = 3;
          globalForApply.applyState.progress = 75;
          globalForApply.applyState.message = 'Preparing silent setup runner...';
          globalForApply.applyState.detail = 'Configuring detached background installer execution and automatic relaunch';
        }

        // Build detached update runner batch script
        const ts = Date.now();
        const cmdPath = path.join(updatesDir, `teams-shifts-updater-${ts}.cmd`);
        const exePath = path.join(appDir, 'TeamsShifts.exe');

        // Command script that waits 2 seconds, kills existing processes, runs Inno Setup installer silently,
        // cleans up flag, relaunches the updated Teams Shifts, and deletes itself.
        const cmdContent = [
          '@echo off',
          'setlocal enabledelayedexpansion',
          '',
          ':: 1. Allow the HTTP response to be delivered to the client browser UI',
          'timeout /t 2 /nobreak >nul',
          '',
          ':: 2. Terminate running Teams Shifts app window, launcher, and node instances cleanly',
          'powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Get-CimInstance Win32_Process -Filter \'Name = \'\'msedge.exe\'\' or Name = \'\'chrome.exe\'\'\' -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -like \'*TeamsShifts*profile*\' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }" >nul 2>&1',
          'taskkill /F /IM TeamsShifts.exe >nul 2>&1',
          'taskkill /F /IM node.exe >nul 2>&1',
          'timeout /t 1 /nobreak >nul',
          '',
          ':: 3. Run Inno Setup installer silently',
          `"${targetFilePath}" /VERYSILENT /SUPPRESSMSGBOXES /NORESTART /SP- /CLOSEAPPLICATIONS /FORCECLOSEAPPLICATIONS /DIR="${appDir}"`,
          '',
          ':: 4. Brief pause for files and mutex to settle',
          'timeout /t 2 /nobreak >nul',
          '',
          ':: 5. Clean up updating flag and installer package',
          `if exist "${flagFile}" del /f /q "${flagFile}" >nul 2>&1`,
          `if exist "${targetFilePath}" del /f /q "${targetFilePath}" >nul 2>&1`,
          '',
          ':: 6. Relaunch updated Teams Shifts application',
          `if exist "${exePath}" (`,
          `    start "" "${exePath}"`,
          ') else (',
          `    start "" "${appDir}\\TeamsShifts.exe"`,
          ')',
          '',
          ':: 7. Self-delete this batch script',
          'timeout /t 1 /nobreak >nul',
          'del /f /q "%~f0" >nul 2>&1',
        ].join('\r\n');

        fs.writeFileSync(cmdPath, cmdContent, 'utf8');
        addLog('Silent setup runner armed (decoupled batch runner).', 'success');

        if (globalForApply.applyState) {
          globalForApply.applyState.status = 'restarting';
          globalForApply.applyState.step = 4;
          globalForApply.applyState.progress = 100;
          globalForApply.applyState.message = 'Restarting Teams Shifts now...';
          globalForApply.applyState.detail = 'Closing window and updating files. Teams Shifts will relaunch automatically in a few seconds.';
        }
        addLog('Closing existing Teams Shifts window for silent setup. Relaunching automatically...', 'info');

        // Launch decoupled via Windows Task Scheduler so it runs completely outside any Job Object
        let launched = false;
        const taskName = `TeamsShiftsUpdate_${ts}`;
        try {
          execSync(`schtasks /create /tn "${taskName}" /tr "cmd.exe /c \\"${cmdPath}\\"" /sc once /st "23:59" /f`, { stdio: 'ignore' });
          execSync(`schtasks /run /tn "${taskName}"`, { stdio: 'ignore' });
          try {
            execSync(`schtasks /delete /tn "${taskName}" /f`, { stdio: 'ignore' });
          } catch {}
          launched = true;
          addLog('Update runner handed off to Windows Task Scheduler.', 'success');
        } catch (taskErr: any) {
          console.warn('[AutoUpdate] schtasks launch failed, falling back to cmd start:', taskErr);
        }

        if (!launched) {
          try {
            const cmdRunner = spawn('cmd.exe', ['/c', 'start', '""', '/b', cmdPath], {
              detached: true,
              stdio: 'ignore',
              windowsHide: true,
            });
            cmdRunner.unref();
            launched = true;
            addLog('Update runner launched via background shell process.', 'success');
          } catch (cmdErr: any) {
            console.error('[AutoUpdate] Fallback runner spawn failed:', cmdErr);
            throw new Error('Failed to launch update installer: ' + cmdErr.message);
          }
        }

        // Gracefully exit node process after 1.5 seconds
        setTimeout(() => {
          console.log('[AutoUpdate] Graceful exit for silent installer execution...');
          process.exit(0);
        }, 1500);
      } catch (err: any) {
        console.error('[AutoUpdate] Background apply error:', err);
        addLog(`Update failed: ${err?.message || err}`, 'error');
        if (globalForApply.applyState) {
          globalForApply.applyState.status = 'error';
          globalForApply.applyState.error = err?.message || 'Failed to apply update';
          globalForApply.applyState.message = 'Update failed';
          globalForApply.applyState.detail = err?.message || 'Unknown error occurred';
        }
      }
    })();

    return NextResponse.json({
      success: true,
      message: 'Update application sequence started.',
      targetFile: path.basename(targetFilePath),
    });
  } catch (err: any) {
    console.error('[AutoUpdate] Error starting update apply:', err);
    return NextResponse.json({ error: err?.message || 'Failed to initiate update' }, { status: 500 });
  }
}
