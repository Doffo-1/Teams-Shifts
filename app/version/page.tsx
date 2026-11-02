'use client';

import { useState, useEffect } from 'react';
import {
  Package,
  Sparkles,
  FileText,
  HardDrive,
  Download,
  RefreshCw,
  ExternalLink,
  AlertCircle,
  CheckCircle2,
  ArrowRight,
  X,
  Play,
  RotateCcw,
} from 'lucide-react';

interface UpdateInfo {
  currentVersion: string;
  latestVersion: string;
  hasUpdate: boolean;
  releaseName: string;
  releaseNotes: string;
  releaseUrl: string;
  downloadUrl: string;
  portableUrl?: string;
  publishedAt: string;
  repo: string;
  lastChecked: string;
  error: string | null;
}

interface DownloadProgress {
  status: 'idle' | 'downloading' | 'completed' | 'error';
  progress: number;
  downloadedBytes: number;
  totalBytes: number;
  downloadedFormatted?: string;
  totalFormatted?: string;
  speed: string;
  fileName: string;
  version: string;
  filePath: string;
  assetType: 'installer' | 'portable';
  error: string | null;
}

export default function VersionPage() {
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [versionTab, setVersionTab] = useState<'overview' | 'changelog' | 'diagnostics'>('overview');

  // In-App Download State
  const [downloadProgress, setDownloadProgress] = useState<DownloadProgress | null>(null);
  const [isApplying, setIsApplying] = useState(false);
  const [applySuccess, setApplySuccess] = useState(false);

  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.title = 'Teams Shifts - Version Control & Updates';
    }
  }, []);

  const checkForUpdates = async () => {
    setCheckingUpdate(true);
    try {
      const res = await fetch(`/api/version?t=${Date.now()}`, {
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache, no-store' },
      });
      if (res.ok) {
        const data = await res.json();
        setUpdateInfo(data);
      }
    } catch (err) {
      console.error('Failed to check for updates:', err);
    } finally {
      setCheckingUpdate(false);
    }
  };

  const pollDownloadStatus = async (): Promise<DownloadProgress | null> => {
    try {
      const res = await fetch('/api/version/download');
      if (res.ok) {
        const data: DownloadProgress = await res.json();
        setDownloadProgress(data);
        return data;
      }
    } catch {}
    return null;
  };

  const startInAppDownload = async (assetType: 'installer' | 'portable') => {
    try {
      const res = await fetch('/api/version/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          assetType,
          version: updateInfo?.latestVersion || 'latest',
          downloadUrl: assetType === 'portable' ? updateInfo?.portableUrl : updateInfo?.downloadUrl,
          repo: updateInfo?.repo,
        }),
      });
      if (res.ok) {
        setDownloadProgress({
          status: 'downloading',
          progress: 0,
          downloadedBytes: 0,
          totalBytes: 0,
          speed: 'Starting...',
          fileName: assetType === 'portable' ? 'TeamsShifts-Standalone.zip' : 'TeamsShifts-Setup.exe',
          version: updateInfo?.latestVersion || '',
          filePath: '',
          assetType,
          error: null,
        });
      }
    } catch (err) {
      console.error('Failed to start in-app download:', err);
    }
  };

  const cancelInAppDownload = async () => {
    try {
      await fetch('/api/version/download', { method: 'DELETE' });
      setDownloadProgress(null);
    } catch (err) {
      console.error('Failed to cancel download:', err);
    }
  };

  const applyUpdate = async (assetType: 'installer' | 'portable') => {
    setIsApplying(true);
    try {
      const res = await fetch('/api/version/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          assetType,
          filePath: downloadProgress?.filePath,
        }),
      });
      if (res.ok) {
        setApplySuccess(true);
      } else {
        const data = await res.json().catch(() => ({}));
        alert(data.error || 'Failed to start update installer');
        setIsApplying(false);
      }
    } catch (err: any) {
      alert(err?.message || 'Failed to apply update');
      setIsApplying(false);
    }
  };

  useEffect(() => {
    checkForUpdates();
    pollDownloadStatus();

    // Background check every 45s while version page is open
    const interval = setInterval(() => {
      checkForUpdates();
    }, 45000);

    const handleFocus = () => {
      checkForUpdates();
    };
    window.addEventListener('focus', handleFocus);

    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', handleFocus);
    };
  }, []);

  // Polling loop while downloading
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (downloadProgress?.status === 'downloading') {
      timer = setInterval(async () => {
        const data = await pollDownloadStatus();
        if (data && (data.status === 'completed' || data.status === 'error')) {
          clearInterval(timer);
        }
      }, 500);
    }
    return () => clearInterval(timer);
  }, [downloadProgress?.status]);

  return (
    <div style={{ minHeight: '100vh', background: 'var(--slate-950)', color: 'white', padding: '1.5rem', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
      <div className="version-modal-card" style={{ maxWidth: 760, width: '100%', animation: 'fadeIn 0.2s ease-out' }}>
        {/* Header */}
        <div className="modal-header" style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid rgba(51, 65, 85, 0.4)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.9rem' }}>
            <div className="brand-icon" style={{ width: '2.6rem', height: '2.6rem', borderRadius: 12, background: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)', boxShadow: '0 0 15px rgba(59, 130, 246, 0.4)' }}>
              <Package size={22} color="white" />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <h2 style={{ fontSize: '1.25rem', fontWeight: 800, margin: 0, letterSpacing: '-0.02em', color: 'white' }}>
                  Version Control & Software Updates
                </h2>
                <span className="badge" style={{ fontSize: '0.7rem', padding: '0.15rem 0.5rem', background: 'rgba(59, 130, 246, 0.2)', color: '#93c5fd', border: '1px solid rgba(59, 130, 246, 0.3)' }}>
                  v{updateInfo?.currentVersion || '1.0.11'}
                </span>
              </div>
              <div style={{ fontSize: '0.8rem', color: 'var(--slate-400)', marginTop: 2 }}>
                Teams Shifts Standalone Application & In-App Release Hub
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <button
              className="btn btn-sm btn-secondary"
              onClick={() => {
                if (typeof window !== 'undefined') window.close();
              }}
              style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.78rem' }}
            >
              <X size={14} /> Close
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="modal-body" style={{ padding: '1.5rem' }}>
          {/* Navigation Tabs */}
          <div className="version-tab-nav">
            <button
              className={`version-tab-item ${versionTab === 'overview' ? 'active' : ''}`}
              onClick={() => setVersionTab('overview')}
            >
              <Sparkles size={15} /> Overview & In-App Updates
            </button>
            <button
              className={`version-tab-item ${versionTab === 'changelog' ? 'active' : ''}`}
              onClick={() => setVersionTab('changelog')}
            >
              <FileText size={15} /> Release Notes
            </button>
            <button
              className={`version-tab-item ${versionTab === 'diagnostics' ? 'active' : ''}`}
              onClick={() => setVersionTab('diagnostics')}
            >
              <HardDrive size={15} /> System & Diagnostics
            </button>
          </div>

          {/* TAB 1: OVERVIEW & IN-APP UPDATES */}
          {versionTab === 'overview' && (
            <div>
              {/* Hero Leap Card */}
              <div className="version-hero-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#93c5fd' }}>
                      SOFTWARE UPDATE STATUS
                    </div>
                    <div style={{ fontSize: '1.05rem', fontWeight: 700, color: 'white', marginTop: 3 }}>
                      {checkingUpdate ? (
                        'Querying GitHub Releases...'
                      ) : updateInfo?.hasUpdate ? (
                        `Newer Release Available: ${updateInfo.latestVersion}`
                      ) : (
                        'Teams Shifts is Completely Up to Date'
                      )}
                    </div>
                  </div>

                  {checkingUpdate ? (
                    <div className="version-badge-pill" style={{ background: 'rgba(59, 130, 246, 0.15)', color: '#60a5fa', border: '1px solid rgba(59, 130, 246, 0.3)' }}>
                      <RefreshCw size={12} className="spin-icon" /> Checking...
                    </div>
                  ) : updateInfo?.hasUpdate ? (
                    <div className="version-badge-pill version-badge-update">
                      <AlertCircle size={13} /> Update Available
                    </div>
                  ) : (
                    <div className="version-badge-pill version-badge-success">
                      <CheckCircle2 size={13} /> Current Active
                    </div>
                  )}
                </div>

                {/* Version Leap Row */}
                <div className="version-leap-row">
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <span style={{ fontSize: '0.72rem', color: 'var(--slate-400)', textTransform: 'uppercase', fontWeight: 600 }}>Installed Edition</span>
                    <span style={{ fontSize: '1.15rem', fontWeight: 800, color: 'white', fontFamily: 'monospace' }}>
                      v{updateInfo?.currentVersion || '1.0.11'}
                    </span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: updateInfo?.hasUpdate ? '#fbbf24' : 'var(--slate-500)' }}>
                    <div style={{ height: 1, width: 32, background: 'currentColor' }} />
                    <ArrowRight size={18} />
                    <div style={{ height: 1, width: 32, background: 'currentColor' }} />
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', textAlign: 'right' }}>
                    <span style={{ fontSize: '0.72rem', color: 'var(--slate-400)', textTransform: 'uppercase', fontWeight: 600 }}>Latest Release</span>
                    <span style={{ fontSize: '1.15rem', fontWeight: 800, color: updateInfo?.hasUpdate ? '#60a5fa' : '#34d399', fontFamily: 'monospace' }}>
                      v{updateInfo?.latestVersion || updateInfo?.currentVersion || '1.0.11'}
                    </span>
                  </div>
                </div>
              </div>

              {/* SECTION: IN-APP DOWNLOADING & APPLYING WORKFLOW */}
              {applySuccess ? (
                <div className="in-app-download-ready-card" style={{ textAlign: 'center', padding: '1.75rem 1.5rem', marginBottom: '1.25rem' }}>
                  <CheckCircle2 size={36} color="#34d399" style={{ margin: '0 auto 0.75rem auto' }} />
                  <h3 style={{ fontSize: '1.15rem', fontWeight: 800, color: 'white', marginBottom: '0.35rem' }}>
                    Update Starting Now!
                  </h3>
                  <p style={{ fontSize: '0.85rem', color: 'var(--slate-300)', maxWidth: 480, margin: '0 auto' }}>
                    Teams Shifts is closing down gracefully so the setup installer can update all files without file locks. The application will relaunch automatically after installation.
                  </p>
                </div>
              ) : downloadProgress?.status === 'downloading' ? (
                /* IN-APP DOWNLOADING PROGRESS CARD */
                <div className="in-app-download-card">
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ width: 34, height: 34, borderRadius: 8, background: 'rgba(56, 189, 248, 0.2)', border: '1px solid rgba(56, 189, 248, 0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#38bdf8' }}>
                        <Download size={18} className="pulse-icon" />
                      </div>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'white' }}>
                          Downloading {downloadProgress.fileName} In-App...
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--slate-400)' }}>
                          {downloadProgress.downloadedFormatted || '0 B'} / {downloadProgress.totalFormatted || '...'} {downloadProgress.speed ? `• ${downloadProgress.speed}` : ''}
                        </div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <span style={{ fontFamily: 'monospace', fontWeight: 800, color: '#38bdf8', fontSize: '1.1rem' }}>
                        {downloadProgress.progress}%
                      </span>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        style={{ padding: '0.25rem 0.6rem', fontSize: '0.72rem' }}
                        onClick={cancelInAppDownload}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                  <div className="download-progress-track">
                    <div className="download-progress-bar" style={{ width: `${Math.max(4, downloadProgress.progress)}%` }} />
                  </div>
                </div>
              ) : downloadProgress?.status === 'completed' ? (
                /* IN-APP READY TO APPLY CARD */
                <div className="in-app-download-ready-card">
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div style={{ width: 40, height: 40, borderRadius: 10, background: 'rgba(16, 185, 129, 0.2)', border: '1px solid rgba(16, 185, 129, 0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#34d399' }}>
                        <CheckCircle2 size={22} />
                      </div>
                      <div>
                        <div style={{ fontWeight: 800, fontSize: '0.95rem', color: 'white', display: 'flex', alignItems: 'center', gap: 8 }}>
                          {downloadProgress.fileName} Downloaded & Ready
                          <span className="badge" style={{ background: 'rgba(16, 185, 129, 0.2)', color: '#6ee7b7', border: '1px solid rgba(16, 185, 129, 0.3)', fontSize: '0.7rem' }}>
                            {downloadProgress.version || updateInfo?.latestVersion}
                          </span>
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--slate-300)', marginTop: 2 }}>
                          Downloaded completely in-app. Ready to apply cleanly without file locks.
                        </div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <button
                        type="button"
                        className="btn"
                        style={{ padding: '0.65rem 1.25rem', fontWeight: 700, fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: 8, background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', color: 'white', borderRadius: 8, border: '1px solid #059669', boxShadow: '0 4px 15px rgba(16, 185, 129, 0.3)' }}
                        onClick={() => applyUpdate(downloadProgress.assetType)}
                        disabled={isApplying}
                      >
                        <Play size={16} className={isApplying ? 'spin-icon' : ''} />
                        {isApplying
                          ? 'Closing app & launching setup...'
                          : downloadProgress.assetType === 'portable'
                          ? '⚡ Apply Portable Update & Restart'
                          : '🚀 Install & Restart (Closes App & Runs Setup)'}
                      </button>

                      <button
                        type="button"
                        className="btn btn-secondary"
                        style={{ padding: '0.65rem 0.8rem', fontSize: '0.8rem' }}
                        onClick={cancelInAppDownload}
                        title="Download different version or package"
                      >
                        <RotateCcw size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                /* IN-APP PACKAGE SELECTION CARDS */
                <div style={{ marginBottom: '1.25rem' }}>
                  <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--slate-300)', marginBottom: '0.6rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    {updateInfo?.hasUpdate ? 'Choose Installation Package' : 'Available Downloads & Reinstalls'}
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                    {/* Windows Setup Card */}
                    <div style={{ background: 'rgba(30, 41, 59, 0.6)', border: '1px solid rgba(59, 130, 246, 0.3)', borderRadius: 10, padding: '1rem', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                          <span style={{ fontSize: '0.92rem', fontWeight: 700, color: 'white' }}>Windows Setup (.exe)</span>
                          <span className="badge" style={{ background: 'rgba(59, 130, 246, 0.2)', color: '#93c5fd', border: '1px solid rgba(59, 130, 246, 0.3)', fontSize: '0.65rem' }}>Recommended</span>
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--slate-300)', marginBottom: '0.85rem' }}>
                          Installs to Program Files with desktop and Start Menu shortcuts.
                        </div>
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <button
                          type="button"
                          className="btn version-btn-glow"
                          onClick={() => startInAppDownload('installer')}
                          style={{ padding: '0.55rem 0.8rem', fontSize: '0.8rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                        >
                          <Download size={14} /> Download In-App
                        </button>
                        <a
                          href={updateInfo?.downloadUrl || `https://github.com/${updateInfo?.repo || 'Doffo-1/Teams-Shifts'}/releases/latest/download/TeamsShifts-Setup.exe`}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ fontSize: '0.68rem', color: 'var(--slate-400)', textAlign: 'center', textDecoration: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}
                        >
                          <ExternalLink size={11} /> Save via browser instead
                        </a>
                      </div>
                    </div>

                    {/* Portable Edition Card */}
                    <div style={{ background: 'rgba(30, 41, 59, 0.6)', border: '1px solid rgba(71, 85, 105, 0.5)', borderRadius: 10, padding: '1rem', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                          <span style={{ fontSize: '0.92rem', fontWeight: 700, color: 'white' }}>Portable Edition (.zip)</span>
                          <span className="badge" style={{ background: 'rgba(148, 163, 184, 0.15)', color: '#cbd5e1', border: '1px solid rgba(148, 163, 184, 0.25)', fontSize: '0.65rem' }}>Zero Install</span>
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--slate-300)', marginBottom: '0.85rem' }}>
                          Standalone zip folder. Extract anywhere and launch TeamsShifts.exe directly.
                        </div>
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <button
                          type="button"
                          className="btn btn-secondary"
                          onClick={() => startInAppDownload('portable')}
                          style={{ padding: '0.55rem 0.8rem', fontSize: '0.8rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, borderColor: 'rgba(71, 85, 105, 0.6)' }}
                        >
                          <Download size={14} /> Download In-App
                        </button>
                        <a
                          href={updateInfo?.portableUrl || `https://github.com/${updateInfo?.repo || 'Doffo-1/Teams-Shifts'}/releases/latest/download/TeamsShifts-Standalone.zip`}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ fontSize: '0.68rem', color: 'var(--slate-400)', textAlign: 'center', textDecoration: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}
                        >
                          <ExternalLink size={11} /> Save via browser instead
                        </a>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Highlights */}
              <div style={{ background: 'rgba(15, 23, 42, 0.6)', border: '1px solid rgba(51, 65, 85, 0.5)', borderRadius: 12, padding: '1rem 1.15rem' }}>
                <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--slate-300)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.5rem' }}>
                  Release Highlights
                </div>
                <div className="version-feature-item">
                  <span className="version-feature-tag tag-feat">FEAT</span>
                  <div>
                    <strong>In-App Downloading:</strong> Real-time progress bar downloads update assets directly inside the application without opening external browser windows.
                  </div>
                </div>
                <div className="version-feature-item">
                  <span className="version-feature-tag tag-fix">FIX</span>
                  <div>
                    <strong>Zero File-Lock Updates:</strong> Automatically initiates graceful shutdown before starting setup, preventing application conflicts.
                  </div>
                </div>
                <div className="version-feature-item">
                  <span className="version-feature-tag tag-perf">PERF</span>
                  <div>
                    <strong>Multi-Window Window Watchdog:</strong> Keeps background services running when secondary windows like updates are active.
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: RELEASE NOTES & CHANGELOG */}
          {versionTab === 'changelog' && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'white' }}>
                  {updateInfo?.releaseName || 'Latest Release Changelog'}
                </span>
                {updateInfo?.publishedAt && (
                  <span style={{ fontSize: '0.75rem', color: 'var(--slate-400)' }}>
                    Published {new Date(updateInfo.publishedAt).toLocaleDateString()}
                  </span>
                )}
              </div>

              <div className="version-changelog-box" style={{ maxHeight: 320, overflowY: 'auto' }}>
                {updateInfo?.releaseNotes ? (
                  <pre style={{ margin: 0, whiteSpace: 'pre-wrap', fontFamily: 'inherit', fontSize: '0.82rem', lineHeight: 1.6, color: '#e2e8f0' }}>
                    {updateInfo.releaseNotes}
                  </pre>
                ) : (
                  <div style={{ color: 'var(--slate-400)', textAlign: 'center', padding: '2rem 0', fontSize: '0.85rem' }}>
                    No release notes available for this build.
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 3: DIAGNOSTICS & SYSTEM */}
          {versionTab === 'diagnostics' && (
            <div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div className="version-diag-card">
                  <div className="version-diag-label">Active Channel</div>
                  <div className="version-diag-value">GitHub Production Stable</div>
                </div>
                <div className="version-diag-card">
                  <div className="version-diag-label">Target Repository</div>
                  <div className="version-diag-value">{updateInfo?.repo || 'Doffo-1/Teams-Shifts'}</div>
                </div>
                <div className="version-diag-card">
                  <div className="version-diag-label">Installed Version</div>
                  <div className="version-diag-value">v{updateInfo?.currentVersion || '1.0.11'}</div>
                </div>
                <div className="version-diag-card">
                  <div className="version-diag-label">Latest Cloud Version</div>
                  <div className="version-diag-value">v{updateInfo?.latestVersion || updateInfo?.currentVersion || '1.0.11'}</div>
                </div>
                <div className="version-diag-card" style={{ gridColumn: 'span 2' }}>
                  <div className="version-diag-label">Last Successful Update Check</div>
                  <div className="version-diag-value">
                    {updateInfo?.lastChecked ? new Date(updateInfo.lastChecked).toLocaleString() : 'Just now'}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Error Banner */}
          {updateInfo?.error && (
            <div style={{ marginTop: '1rem', background: 'rgba(239, 68, 68, 0.12)', border: '1px solid rgba(239, 68, 68, 0.35)', borderRadius: 10, padding: '0.75rem 1rem', color: '#fca5a5', fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <AlertCircle size={16} />
              <span>{updateInfo.error}</span>
            </div>
          )}

          {/* Bottom Action Footer */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', marginTop: '1.25rem', paddingTop: '1rem', borderTop: '1px solid rgba(51, 65, 85, 0.4)' }}>
            <button
              className="btn btn-secondary"
              onClick={checkForUpdates}
              disabled={checkingUpdate}
              style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem' }}
            >
              <RefreshCw size={15} className={checkingUpdate ? 'spin-icon' : ''} />
              {checkingUpdate ? 'Checking GitHub...' : 'Check for Updates Now'}
            </button>

            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <a
                href={`https://github.com/${updateInfo?.repo || 'Doffo-1/Teams-Shifts'}`}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-secondary"
                style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.85rem' }}
              >
                <ExternalLink size={15} /> GitHub Repo
              </a>
              <button
                className="btn btn-secondary"
                onClick={() => {
                  if (typeof window !== 'undefined') window.close();
                }}
                style={{ fontSize: '0.85rem' }}
              >
                Close Window
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
