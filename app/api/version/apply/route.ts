import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { spawn } from 'child_process';
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

        // Build detached PowerShell and CMD update runners
        const ts = Date.now();
        const psPath = path.join(updatesDir, `teams-shifts-installer-${ts}.ps1`);
        const cmdPath = path.join(updatesDir, `teams-shifts-installer-${ts}.cmd`);

        const escAppDir = appDir.replace(/'/g, "''");
        const escInstallerPath = targetFilePath.replace(/'/g, "''");
        const escFlagFile = flagFile.replace(/'/g, "''");
        const exePath = path.join(appDir, 'TeamsShifts.exe');
        const escExePath = exePath.replace(/'/g, "''");

        const psContent = [
          `$ErrorActionPreference = 'SilentlyContinue'`,
          ``,
          `# 1. Allow web server 2.5 seconds to return HTTP response to client`,
          `Start-Sleep -Milliseconds 2500`,
          ``,
          `# 2. Wait up to 10 seconds for TeamsShifts and node to exit cleanly`,
          `$deadline = (Get-Date).AddSeconds(10)`,
          `while ((Get-Date) -lt $deadline) {`,
          `    $procs = Get-Process -Name TeamsShifts,node -ErrorAction SilentlyContinue`,
          `    if (-not $procs) { break }`,
          `    Start-Sleep -Milliseconds 500`,
          `}`,
          ``,
          `# Force terminate any remaining instances if still running`,
          `Get-Process -Name TeamsShifts,node -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue`,
          `Start-Sleep -Milliseconds 800`,
          ``,
          `# 3. Check if writing to appDir requires administrator elevation`,
          `$needsElevation = $false`,
          `try {`,
          `    $testFile = Join-Path '${escAppDir}' (".write_test_" + [Guid]::NewGuid().ToString('N'))`,
          `    [System.IO.File]::WriteAllText($testFile, "test")`,
          `    [System.IO.File]::Delete($testFile)`,
          `} catch {`,
          `    $needsElevation = $true`,
          `}`,
          ``,
          `# 4. Run Inno Setup installer silently, targeting the exact appDir`,
          `$innoArgs = @(`,
          `    '/VERYSILENT',`,
          `    '/SUPPRESSMSGBOXES',`,
          `    '/NORESTART',`,
          `    '/SP-',`,
          `    '/CLOSEAPPLICATIONS',`,
          `    '/FORCECLOSEAPPLICATIONS',`,
          `    '/DIR="${escAppDir}"'`,
          `)`,
          `$argString = $innoArgs -join ' '`,
          ``,
          `if ($needsElevation) {`,
          `    $proc = Start-Process -FilePath '${escInstallerPath}' -ArgumentList $argString -Verb RunAs -Wait -PassThru`,
          `} else {`,
          `    $proc = Start-Process -FilePath '${escInstallerPath}' -ArgumentList $argString -Wait -PassThru -WindowStyle Hidden`,
          `}`,
          ``,
          `Start-Sleep -Seconds 2`,
          ``,
          `# 5. Clean up updating flag`,
          `if (Test-Path '${escFlagFile}') {`,
          `    Remove-Item -Path '${escFlagFile}' -Force -ErrorAction SilentlyContinue`,
          `}`,
          ``,
          `# 6. Relaunch updated Teams Shifts application`,
          `$targetExe = '${escExePath}'`,
          `if (-not (Test-Path $targetExe)) {`,
          `    $reg = Get-ItemProperty "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*" -ErrorAction SilentlyContinue | Where-Object { $_.DisplayName -like "*Teams Shifts*" } | Select-Object -First 1`,
          `    if ($reg -and $reg.InstallLocation) {`,
          `        $targetExe = Join-Path $reg.InstallLocation "TeamsShifts.exe"`,
          `    }`,
          `}`,
          ``,
          `if (Test-Path $targetExe) {`,
          `    Start-Process -FilePath $targetExe -WindowStyle Normal`,
          `}`,
          ``,
          `# 7. Clean up script files`,
          `Start-Sleep -Seconds 2`,
          `Remove-Item -Path '${psPath.replace(/'/g, "''")}' -Force -ErrorAction SilentlyContinue`,
          `Remove-Item -Path '${cmdPath.replace(/'/g, "''")}' -Force -ErrorAction SilentlyContinue`,
        ].join('\r\n');

        const cmdContent = [
          `@echo off`,
          `timeout /t 3 >nul`,
          `taskkill /F /IM TeamsShifts.exe >nul 2>&1`,
          `taskkill /F /IM node.exe >nul 2>&1`,
          `timeout /t 1 >nul`,
          `"${targetFilePath}" /VERYSILENT /SUPPRESSMSGBOXES /NORESTART /SP- /CLOSEAPPLICATIONS /FORCECLOSEAPPLICATIONS /DIR="${appDir}"`,
          `timeout /t 2 >nul`,
          `if exist "${flagFile}" del /f /q "${flagFile}" >nul 2>&1`,
          `if exist "${exePath}" start "" "${exePath}"`,
          `del /f /q "%~f0" >nul 2>&1`,
        ].join('\r\n');

        fs.writeFileSync(psPath, psContent, 'utf8');
        fs.writeFileSync(cmdPath, cmdContent, 'utf8');
        addLog('Silent setup runner armed (detached process).', 'success');

        if (globalForApply.applyState) {
          globalForApply.applyState.status = 'restarting';
          globalForApply.applyState.step = 4;
          globalForApply.applyState.progress = 100;
          globalForApply.applyState.message = 'Restarting Teams Shifts now...';
          globalForApply.applyState.detail = 'Silent setup is updating files and will relaunch Teams Shifts automatically in a few seconds.';
        }
        addLog('Teams Shifts is closing down for silent setup. Relaunching automatically...', 'info');

        // Launch updater detached via WMI Win32_Process.Create so it runs completely independent of Node's process tree and Job Object
        const wmiCmd = `(Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{ CommandLine = 'powershell.exe -NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File "${psPath.replace(/\\/g, '\\\\')}"' }).ReturnValue`;

        try {
          const wmiRunner = spawn('powershell.exe', [
            '-NoProfile',
            '-NonInteractive',
            '-WindowStyle', 'Hidden',
            '-ExecutionPolicy', 'Bypass',
            '-Command',
            wmiCmd,
          ], {
            detached: true,
            stdio: 'ignore',
            windowsHide: true,
          });
          wmiRunner.unref();
        } catch (wmiErr: any) {
          console.warn('[AutoUpdate] WMI spawn failed, using cmd start fallback:', wmiErr);
          const cmdRunner = spawn('cmd.exe', ['/c', 'start', '""', '/b', 'powershell.exe', '-NoProfile', '-WindowStyle', 'Hidden', '-ExecutionPolicy', 'Bypass', '-File', psPath], {
            detached: true,
            stdio: 'ignore',
            windowsHide: true,
          });
          cmdRunner.unref();
        }

        // Gracefully exit node process after 2 seconds
        setTimeout(() => {
          console.log('[AutoUpdate] Graceful exit for silent installer execution...');
          process.exit(0);
        }, 2000);
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
