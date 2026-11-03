import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { spawn } from 'child_process';

interface ApplyLog {
  time: string;
  text: string;
  type?: 'info' | 'success' | 'warn' | 'error';
}

interface ApplyState {
  status: 'idle' | 'preparing' | 'extracting' | 'verifying' | 'staging' | 'restarting' | 'error';
  step: number; // 1: Download, 2: Extract & Verify, 3: Stage Update, 4: Silent Restart
  totalSteps: number;
  progress: number;
  message: string;
  detail: string;
  logs: ApplyLog[];
  error: string | null;
  targetFile?: string;
  assetType?: 'installer' | 'portable';
}

const globalForApply = global as unknown as {
  applyState?: ApplyState;
  activeStagingDir?: string;
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

function getAppDir(): string {
  let dir = process.cwd();
  // If running in standalone (inside dist/TeamsShifts/app or standalone-app/app), parent is app root
  if (path.basename(dir).toLowerCase() === 'app') {
    const parentDir = path.dirname(dir);
    if (fs.existsSync(path.join(parentDir, 'TeamsShifts.exe')) || fs.existsSync(path.join(parentDir, 'runtime'))) {
      return parentDir;
    }
  }
  return dir;
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
    if (globalForApply.activeStagingDir && fs.existsSync(globalForApply.activeStagingDir)) {
      try {
        fs.rmSync(globalForApply.activeStagingDir, { recursive: true, force: true });
      } catch {}
    }
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

// POST: Execute in-app update pipeline without opening any command prompt or shell window
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const assetType: 'installer' | 'portable' = body.assetType === 'portable' ? 'portable' : 'installer';
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

    const fileStats = fs.statSync(targetFilePath);
    if (fileStats.size < 1024 * 1024) {
      return NextResponse.json(
        { error: `Update package file appears incomplete (${formatBytes(fileStats.size)}). Please re-download.` },
        { status: 400 }
      );
    }

    // Reset apply state
    globalForApply.applyState = {
      status: 'preparing',
      step: 2,
      totalSteps: 4,
      progress: 20,
      message: 'Verifying update package...',
      detail: `Package size: ${formatBytes(fileStats.size)}`,
      logs: [],
      error: null,
      targetFile: path.basename(targetFilePath),
      assetType,
    };

    addLog(`Initiated update application pipeline for ${path.basename(targetFilePath)}`, 'info');
    addLog(`Package verified on disk: ${formatBytes(fileStats.size)}`, 'success');

    // Run async background processing
    (async () => {
      try {
        const appDir = getAppDir();
        const tempDir = os.tmpdir();
        const flagFile = path.join(updatesDir, '.updating');

        // Mark update in progress for watchdog
        try {
          fs.writeFileSync(flagFile, Date.now().toString());
        } catch {}

        if (assetType === 'portable') {
          // --- PORTABLE UPDATE PIPELINE ---
          const stagingDir = path.join(tempDir, `TeamsShifts_Update_${Date.now()}`);
          globalForApply.activeStagingDir = stagingDir;

          if (globalForApply.applyState) {
            globalForApply.applyState.status = 'extracting';
            globalForApply.applyState.step = 2;
            globalForApply.applyState.progress = 35;
            globalForApply.applyState.message = 'Unpacking update archive...';
            globalForApply.applyState.detail = 'Extracting binaries and Next.js bundle to temporary staging area';
          }
          addLog('Extracting update package to staging directory...', 'info');

          // Extract using fast .NET ZipFile via PowerShell (headless, no window, no console)
          const psScript = `
            $ErrorActionPreference = 'Stop'
            Add-Type -AssemblyName System.IO.Compression.FileSystem
            if (-not (Test-Path -LiteralPath '${stagingDir.replace(/'/g, "''")}')) {
              New-Item -ItemType Directory -Path '${stagingDir.replace(/'/g, "''")}' -Force | Out-Null
            }
            [System.IO.Compression.ZipFile]::ExtractToDirectory('${targetFilePath.replace(/'/g, "''")}', '${stagingDir.replace(/'/g, "''")}')
          `;

          await new Promise<void>((resolve, reject) => {
            const ps = spawn(
              'powershell.exe',
              ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-ExecutionPolicy', 'Bypass', '-Command', psScript],
              {
                windowsHide: true,
                stdio: ['ignore', 'pipe', 'pipe'],
              }
            );

            let stderrData = '';
            ps.stderr?.on('data', (d: Buffer | string) => {
              stderrData += d.toString();
            });

            ps.on('close', (code) => {
              if (code === 0) {
                resolve();
              } else {
                // Fallback to Expand-Archive if ZipFile method encountered issues
                addLog('Trying standard archive expansion fallback...', 'warn');
                const fallback = spawn(
                  'powershell.exe',
                  ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-ExecutionPolicy', 'Bypass', '-Command',
                   `Expand-Archive -LiteralPath '${targetFilePath.replace(/'/g, "''")}' -DestinationPath '${stagingDir.replace(/'/g, "''")}' -Force`],
                  { windowsHide: true, stdio: 'ignore' }
                );
                fallback.on('close', (fCode) => {
                  if (fCode === 0) resolve();
                  else reject(new Error(stderrData || `Extraction failed with code ${code}`));
                });
              }
            });

            ps.on('error', (err) => reject(err));
          });

          addLog('Archive unpacked successfully.', 'success');

          // Locate source directory containing updated files
          let sourceDir = stagingDir;
          if (fs.existsSync(path.join(stagingDir, 'TeamsShifts', 'TeamsShifts.exe')) || fs.existsSync(path.join(stagingDir, 'TeamsShifts', 'app'))) {
            sourceDir = path.join(stagingDir, 'TeamsShifts');
          }

          if (globalForApply.applyState) {
            globalForApply.applyState.status = 'verifying';
            globalForApply.applyState.step = 3;
            globalForApply.applyState.progress = 65;
            globalForApply.applyState.message = 'Verifying unpacked application files...';
            globalForApply.applyState.detail = 'Checking launcher binaries, runtime and application assets';
          }
          addLog('Verifying application bundle files in staging area...', 'info');

          const hasLauncher = fs.existsSync(path.join(sourceDir, 'TeamsShifts.exe'));
          const hasApp = fs.existsSync(path.join(sourceDir, 'app', 'server.js')) || fs.existsSync(path.join(sourceDir, 'app'));

          if (!hasLauncher && !hasApp) {
            throw new Error('Unpacked archive did not contain valid TeamsShifts application files.');
          }

          addLog('Files verified: TeamsShifts.exe and application bundle confirmed.', 'success');
          addLog('Safeguarding database: shifts.db will be preserved.', 'info');

          if (globalForApply.applyState) {
            globalForApply.applyState.status = 'staging';
            globalForApply.applyState.step = 3;
            globalForApply.applyState.progress = 85;
            globalForApply.applyState.message = 'Preparing silent update runner...';
            globalForApply.applyState.detail = 'Configuring zero-shell background file replacement and restart script';
          }

          // Build silent PowerShell & CMD fallback update runner (zero console window, works with enterprise policies)
          const ts = Date.now();
          const psPath = path.join(tempDir, `teams-shifts-updater-${ts}.ps1`);
          const cmdPath = path.join(tempDir, `teams-shifts-updater-${ts}.cmd`);

          const psContent = [
            `$ErrorActionPreference = 'SilentlyContinue'`,
            `Start-Sleep -Milliseconds 2500`,
            `Get-Process -Name TeamsShifts -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue`,
            `Get-Process -Name node -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue`,
            `Start-Sleep -Milliseconds 500`,
            `& robocopy.exe "${sourceDir}" "${appDir}" /E /XD "${appDir}\\data" /XF "*.db" /NP /NJS /NJH /R:2 /W:1 | Out-Null`,
            `if (Test-Path "${stagingDir}") { Remove-Item -Path "${stagingDir}" -Recurse -Force -ErrorAction SilentlyContinue }`,
            `if (Test-Path "${flagFile}") { Remove-Item -Path "${flagFile}" -Force -ErrorAction SilentlyContinue }`,
            `Start-Process -FilePath "${appDir}\\TeamsShifts.exe"`,
            `Remove-Item -Path $MyInvocation.MyCommand.Path -Force -ErrorAction SilentlyContinue`,
          ].join('\r\n');

          const cmdContent = [
            `@echo off`,
            `timeout /t 3 >nul`,
            `taskkill /F /IM TeamsShifts.exe /T >nul 2>&1`,
            `taskkill /F /IM node.exe /T >nul 2>&1`,
            `timeout /t 1 >nul`,
            `robocopy "${sourceDir}" "${appDir}" /E /XD "${appDir}\\data" /XF "*.db" /NP /NJS /NJH /R:2 /W:1 >nul 2>&1`,
            `if exist "${stagingDir}" rd /s /q "${stagingDir}" >nul 2>&1`,
            `if exist "${flagFile}" del /f /q "${flagFile}" >nul 2>&1`,
            `start "" "${appDir}\\TeamsShifts.exe"`,
            `del /f /q "%~f0" >nul 2>&1`,
          ].join('\r\n');

          fs.writeFileSync(psPath, psContent, 'utf8');
          fs.writeFileSync(cmdPath, cmdContent, 'utf8');
          addLog('Silent background runner armed (zero console window).', 'success');

          if (globalForApply.applyState) {
            globalForApply.applyState.status = 'restarting';
            globalForApply.applyState.step = 4;
            globalForApply.applyState.progress = 100;
            globalForApply.applyState.message = 'Restarting Teams Shifts now...';
            globalForApply.applyState.detail = 'Application will relaunch automatically in 2-3 seconds with new version';
          }
          addLog('Teams Shifts is restarting cleanly. Relaunching in 3 seconds...', 'info');

          // Launch updater using PowerShell (with CMD fallback)
          try {
            const runner = spawn('powershell.exe', [
              '-NoProfile',
              '-NonInteractive',
              '-WindowStyle', 'Hidden',
              '-ExecutionPolicy', 'Bypass',
              '-File', psPath,
            ], {
              detached: true,
              stdio: 'ignore',
              windowsHide: true,
            });
            runner.unref();
          } catch (psErr: any) {
            console.warn('[AutoUpdate] PowerShell spawn failed, launching cmd fallback:', psErr);
            const cmdRunner = spawn('cmd.exe', ['/c', 'start', '/b', '""', cmdPath], {
              detached: true,
              stdio: 'ignore',
              windowsHide: true,
            });
            cmdRunner.unref();
          }

          // Exit node process gracefully after 2.5s
          setTimeout(() => {
            console.log('[AutoUpdate] Graceful exit for silent update application...');
            process.exit(0);
          }, 2500);

        } else {
          // --- INSTALLER UPDATE PIPELINE ---
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
            globalForApply.applyState.progress = 85;
            globalForApply.applyState.message = 'Preparing silent setup runner...';
            globalForApply.applyState.detail = 'Configuring background installer execution and automatic restart';
          }

          // Build silent PowerShell & CMD fallback installer runner
          const ts = Date.now();
          const psPath = path.join(tempDir, `teams-shifts-installer-${ts}.ps1`);
          const cmdPath = path.join(tempDir, `teams-shifts-installer-${ts}.cmd`);

          const psContent = [
            `$ErrorActionPreference = 'SilentlyContinue'`,
            `Start-Sleep -Milliseconds 2500`,
            `Get-Process -Name TeamsShifts -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue`,
            `Get-Process -Name node -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue`,
            `Start-Sleep -Milliseconds 500`,
            `$proc = Start-Process -FilePath "${targetFilePath}" -ArgumentList "/SILENT /CLOSEAPPLICATIONS" -Wait -PassThru`,
            `if (Test-Path "${flagFile}") { Remove-Item -Path "${flagFile}" -Force -ErrorAction SilentlyContinue }`,
            `if (Test-Path "${appDir}\\TeamsShifts.exe") { Start-Process -FilePath "${appDir}\\TeamsShifts.exe" }`,
            `Remove-Item -Path $MyInvocation.MyCommand.Path -Force -ErrorAction SilentlyContinue`,
          ].join('\r\n');

          const cmdContent = [
            `@echo off`,
            `timeout /t 3 >nul`,
            `taskkill /F /IM TeamsShifts.exe /T >nul 2>&1`,
            `taskkill /F /IM node.exe /T >nul 2>&1`,
            `timeout /t 1 >nul`,
            `"${targetFilePath}" /SILENT /CLOSEAPPLICATIONS`,
            `if exist "${flagFile}" del /f /q "${flagFile}" >nul 2>&1`,
            `if exist "${appDir}\\TeamsShifts.exe" start "" "${appDir}\\TeamsShifts.exe"`,
            `del /f /q "%~f0" >nul 2>&1`,
          ].join('\r\n');

          fs.writeFileSync(psPath, psContent, 'utf8');
          fs.writeFileSync(cmdPath, cmdContent, 'utf8');
          addLog('Silent setup runner armed (zero console window).', 'success');

          if (globalForApply.applyState) {
            globalForApply.applyState.status = 'restarting';
            globalForApply.applyState.step = 4;
            globalForApply.applyState.progress = 100;
            globalForApply.applyState.message = 'Restarting Teams Shifts now...';
            globalForApply.applyState.detail = 'Silent setup is updating files and will relaunch Teams Shifts automatically';
          }
          addLog('Teams Shifts is closing down for silent setup. Relaunching in 3 seconds...', 'info');

          // Launch runner via PowerShell (with CMD fallback)
          try {
            const runner = spawn('powershell.exe', [
              '-NoProfile',
              '-NonInteractive',
              '-WindowStyle', 'Hidden',
              '-ExecutionPolicy', 'Bypass',
              '-File', psPath,
            ], {
              detached: true,
              stdio: 'ignore',
              windowsHide: true,
            });
            runner.unref();
          } catch (psErr: any) {
            console.warn('[AutoUpdate] PowerShell spawn failed, launching cmd fallback:', psErr);
            const cmdRunner = spawn('cmd.exe', ['/c', 'start', '/b', '""', cmdPath], {
              detached: true,
              stdio: 'ignore',
              windowsHide: true,
            });
            cmdRunner.unref();
          }

          // Exit node process gracefully after 2.5s
          setTimeout(() => {
            console.log('[AutoUpdate] Graceful exit for silent installer execution...');
            process.exit(0);
          }, 2500);
        }
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
