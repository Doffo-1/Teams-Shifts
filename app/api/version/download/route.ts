import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { APP_VERSION, DEFAULT_GITHUB_REPO } from '@/lib/version';
import { isAppInstalled } from '@/lib/edition';

interface DownloadState {
  status: 'idle' | 'downloading' | 'completed' | 'error';
  progress: number;
  downloadedBytes: number;
  totalBytes: number;
  speed: string;
  fileName: string;
  version: string;
  filePath: string;
  assetType: 'installer' | 'portable';
  error: string | null;
}

const globalForDownload = global as unknown as {
  downloadState?: DownloadState;
  abortController?: AbortController;
};

if (!globalForDownload.downloadState) {
  globalForDownload.downloadState = {
    status: 'idle',
    progress: 0,
    downloadedBytes: 0,
    totalBytes: 0,
    speed: '',
    fileName: '',
    version: '',
    filePath: '',
    assetType: 'installer',
    error: null,
  };
}

function getUpdatesDir(): string {
  const baseDir =
    process.env.LOCALAPPDATA ||
    (process.platform === 'win32' ? 'C:\\ProgramData' : os.tmpdir());
  const dir = path.join(baseDir, 'TeamsShifts', 'updates');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function parseSemver(v: string): number[] {
  const cleaned = v.trim().replace(/^v/i, '').split('-')[0];
  const parts = cleaned.split('.').map(p => {
    const num = parseInt(p, 10);
    return isNaN(num) ? 0 : num;
  });
  while (parts.length < 3) parts.push(0);
  return parts;
}

function isNewerVersion(latest: string, current: string): boolean {
  const [lMajor, lMinor, lPatch] = parseSemver(latest);
  const [cMajor, cMinor, cPatch] = parseSemver(current);

  if (lMajor > cMajor) return true;
  if (lMajor < cMajor) return false;
  if (lMinor > cMinor) return true;
  if (lMinor < cMinor) return false;
  return lPatch > cPatch;
}

// GET: Check download status or stream downloaded file to browser
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const streamParam = searchParams.get('stream');

  const updatesDir = getUpdatesDir();
  const state = globalForDownload.downloadState!;

  // Check if a completed file already exists on disk if state is idle
  if (state.status === 'idle') {
    const metaPath = path.join(updatesDir, 'download-info.json');
    const defaultSetup = path.join(updatesDir, 'TeamsShifts-Setup.exe');

    let meta: any = null;
    if (fs.existsSync(metaPath)) {
      try {
        meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
      } catch {}
    }

    if (meta && meta.completed && meta.version && isNewerVersion(meta.version, APP_VERSION) && fs.existsSync(defaultSetup)) {
      const stats = fs.statSync(defaultSetup);
      if (stats.size > 10 * 1024 * 1024) {
        state.status = 'completed';
        state.progress = 100;
        state.downloadedBytes = stats.size;
        state.totalBytes = stats.size;
        state.fileName = 'TeamsShifts-Setup.exe';
        state.version = meta.version;
        state.filePath = defaultSetup;
        state.assetType = 'installer';
      }
    } else if (fs.existsSync(defaultSetup)) {
      // File on disk is from an older or current version, clean it up
      try {
        fs.unlinkSync(defaultSetup);
        if (fs.existsSync(metaPath)) fs.unlinkSync(metaPath);
      } catch {}
    }
  }

  // If streaming requested, send the file back to client browser
  if (streamParam && state.filePath && fs.existsSync(state.filePath)) {
    try {
      const fileBuffer = fs.readFileSync(state.filePath);
      return new Response(new Uint8Array(fileBuffer), {
        status: 200,
        headers: {
          'Content-Type': state.assetType === 'installer' ? 'application/vnd.microsoft.portable-executable' : 'application/zip',
          'Content-Disposition': `attachment; filename="${state.fileName}"`,
          'Content-Length': fileBuffer.length.toString(),
        },
      });
    } catch (err: any) {
      return NextResponse.json({ error: 'Failed to stream file: ' + err.message }, { status: 500 });
    }
  }

  return NextResponse.json({
    ...state,
    downloadedFormatted: formatBytes(state.downloadedBytes),
    totalFormatted: formatBytes(state.totalBytes),
  });
}

// POST: Start in-app download (Full Installed Edition only)
export async function POST(request: Request) {
  try {
    if (!isAppInstalled()) {
      return NextResponse.json(
        { error: 'In-app update downloading is only available for the full installed version of Teams Shifts.' },
        { status: 400 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const assetType: 'installer' = 'installer';
    const version: string = body.version || 'latest';
    let downloadUrl: string = body.downloadUrl || '';

    const updatesDir = getUpdatesDir();
    const fileName = 'TeamsShifts-Setup.exe';
    const targetFilePath = path.join(updatesDir, fileName);
    const tempFilePath = targetFilePath + '.part';

    // If currently downloading this file, return current status
    if (globalForDownload.downloadState?.status === 'downloading') {
      return NextResponse.json(globalForDownload.downloadState);
    }

    // Resolve URL if not provided
    if (!downloadUrl) {
      const repo = body.repo || DEFAULT_GITHUB_REPO;
      if (version === 'latest' || !version) {
        downloadUrl = `https://github.com/${repo}/releases/latest/download/${fileName}`;
      } else {
        const tag = version.startsWith('v') ? version : `v${version}`;
        downloadUrl = `https://github.com/${repo}/releases/download/${tag}/${fileName}`;
      }
    }

    // Cancel any previous download
    if (globalForDownload.abortController) {
      try {
        globalForDownload.abortController.abort();
      } catch {}
    }
    const controller = new AbortController();
    globalForDownload.abortController = controller;

    // Reset state
    globalForDownload.downloadState = {
      status: 'downloading',
      progress: 0,
      downloadedBytes: 0,
      totalBytes: 0,
      speed: '0 KB/s',
      fileName,
      version,
      filePath: targetFilePath,
      assetType,
      error: null,
    };

    // Clean up partial file if exists
    try {
      if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
    } catch {}

    // Start background download stream
    (async () => {
      let fileStream: fs.WriteStream | null = null;
      try {
        const res = await fetch(downloadUrl, {
          headers: {
            'User-Agent': 'TeamsShifts-InApp-Downloader',
            'Accept': '*/*',
          },
          redirect: 'follow',
          signal: controller.signal,
        });

        if (!res.ok) {
          throw new Error(`Download server responded with status ${res.status}: ${res.statusText}`);
        }

        const totalHeader = res.headers.get('content-length');
        const total = totalHeader ? parseInt(totalHeader, 10) : 0;
        if (globalForDownload.downloadState) {
          globalForDownload.downloadState.totalBytes = total;
        }

        if (!res.body) {
          throw new Error('Download response body is empty');
        }

        fileStream = fs.createWriteStream(tempFilePath);
        const reader = res.body.getReader();
        let received = 0;
        let lastReportTime = Date.now();
        let bytesSinceReport = 0;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          if (value) {
            received += value.length;
            bytesSinceReport += value.length;
            fileStream.write(Buffer.from(value));

            const now = Date.now();
            const elapsed = (now - lastReportTime) / 1000;
            if (elapsed >= 0.5) {
              const speedBytesPerSec = bytesSinceReport / elapsed;
              const speedStr = `${formatBytes(speedBytesPerSec)}/s`;
              const progress = total > 0 ? Math.min(99, Math.round((received / total) * 100)) : 50;

              if (globalForDownload.downloadState) {
                globalForDownload.downloadState.downloadedBytes = received;
                globalForDownload.downloadState.progress = progress;
                globalForDownload.downloadState.speed = speedStr;
              }

              lastReportTime = now;
              bytesSinceReport = 0;
            }
          }
        }

        await new Promise<void>((resolve, reject) => {
          if (!fileStream) return resolve();
          fileStream.end((err?: Error | null) => {
            if (err) reject(err);
            else resolve();
          });
        });

        // Atomic replace into final target file
        if (fs.existsSync(targetFilePath)) {
          try {
            fs.unlinkSync(targetFilePath);
          } catch {}
        }
        fs.renameSync(tempFilePath, targetFilePath);

        // Update state to completed
        if (globalForDownload.downloadState) {
          globalForDownload.downloadState.status = 'completed';
          globalForDownload.downloadState.progress = 100;
          globalForDownload.downloadState.downloadedBytes = received;
          globalForDownload.downloadState.totalBytes = received;
          globalForDownload.downloadState.speed = 'Finished';
          globalForDownload.downloadState.filePath = targetFilePath;
          globalForDownload.downloadState.version = version;
        }

        try {
          const metaPath = path.join(updatesDir, 'download-info.json');
          fs.writeFileSync(metaPath, JSON.stringify({
            version,
            completed: true,
            timestamp: Date.now(),
            filePath: targetFilePath,
          }), 'utf8');
        } catch {}
      } catch (err: any) {
        if (controller.signal.aborted) {
          if (globalForDownload.downloadState) {
            globalForDownload.downloadState.status = 'idle';
            globalForDownload.downloadState.error = 'Download cancelled';
          }
        } else {
          console.error('[AutoUpdate] Download error:', err);
          if (globalForDownload.downloadState) {
            globalForDownload.downloadState.status = 'error';
            globalForDownload.downloadState.error = err?.message || 'Download failed';
          }
        }
        try {
          if (fileStream) fileStream.close();
          if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
        } catch {}
      }
    })();

    return NextResponse.json({
      status: 'downloading',
      message: 'Download started successfully',
      targetFile: fileName,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed to initiate download' }, { status: 500 });
  }
}

// DELETE: Cancel active download
export async function DELETE() {
  if (globalForDownload.abortController) {
    try {
      globalForDownload.abortController.abort();
    } catch {}
  }
  const updatesDir = getUpdatesDir();
  try {
    const metaPath = path.join(updatesDir, 'download-info.json');
    if (fs.existsSync(metaPath)) fs.unlinkSync(metaPath);
    const defaultSetup = path.join(updatesDir, 'TeamsShifts-Setup.exe');
    if (fs.existsSync(defaultSetup)) fs.unlinkSync(defaultSetup);
  } catch {}
  globalForDownload.downloadState = {
    status: 'idle',
    progress: 0,
    downloadedBytes: 0,
    totalBytes: 0,
    speed: '',
    fileName: '',
    version: '',
    filePath: '',
    assetType: 'installer',
    error: null,
  };
  return NextResponse.json({ status: 'idle', message: 'Download cancelled' });
}

