'use client';

import { useState, useEffect, useRef } from 'react';
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
  Check,
  Shield,
  Layers,
  Clock,
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
  isInstalled?: boolean;
  edition?: 'installed' | 'portable';
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

interface ApplyLog {
  time: string;
  text: string;
  type?: 'info' | 'success' | 'warn' | 'error';
}

interface ApplyState {
  status: 'idle' | 'preparing' | 'extracting' | 'verifying' | 'staging' | 'restarting' | 'error';
  step: number;
  totalSteps: number;
  progress: number;
  message: string;
  detail: string;
  logs: ApplyLog[];
  error: string | null;
  targetFile?: string;
  assetType?: 'installer' | 'portable';
}

export default function VersionPage() {
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [versionTab, setVersionTab] = useState<'overview' | 'changelog' | 'diagnostics'>('overview');

  // In-App Download & Apply State
  const [downloadProgress, setDownloadProgress] = useState<DownloadProgress | null>(null);
  const [applyState, setApplyState] = useState<ApplyState | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [selectedAssetType, setSelectedAssetType] = useState<'installer'>('installer');
  const [localLogs, setLocalLogs] = useState<ApplyLog[]>([]);

  const terminalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.title = 'Teams Shifts - Version Control & Updates';
    }
  }, []);

  const addLocalLog = (text: string, type: 'info' | 'success' | 'warn' | 'error' = 'info') => {
    const time = new Date().toTimeString().split(' ')[0];
    setLocalLogs(prev => [...prev.slice(-30), { time, text, type }]);
  };

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

  const pollApplyStatus = async (): Promise<ApplyState | null> => {
    try {
      const res = await fetch('/api/version/apply');
      if (res.ok) {
        const data: ApplyState = await res.json();
        setApplyState(data);
        return data;
      }
    } catch {}
    return null;
  };

  const startInAppDownload = async (assetType: 'installer' = 'installer') => {
    setSelectedAssetType('installer');
    setIsUpdating(true);
    addLocalLog('Starting download of TeamsShifts-Setup.exe...', 'info');
    try {
      const res = await fetch('/api/version/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          assetType: 'installer',
          version: updateInfo?.latestVersion || 'latest',
          downloadUrl: updateInfo?.downloadUrl,
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
          fileName: 'TeamsShifts-Setup.exe',
          version: updateInfo?.latestVersion || '',
          filePath: '',
          assetType: 'installer',
          error: null,
        });
      }
    } catch (err) {
      console.error('Failed to start in-app download:', err);
      addLocalLog('Failed to start download stream', 'error');
    }
  };

  const cancelUpdate = async () => {
    try {
      await fetch('/api/version/download', { method: 'DELETE' });
      await fetch('/api/version/apply', { method: 'DELETE' });
      setDownloadProgress(null);
      setApplyState(null);
      setIsUpdating(false);
      addLocalLog('Update cancelled by user', 'warn');
    } catch (err) {
      console.error('Failed to cancel update:', err);
    }
  };

  const applyUpdate = async (assetType: 'installer' | 'portable' = 'installer') => {
    setIsUpdating(true);
    addLocalLog('Initializing zero-shell silent updater...', 'info');
    try {
      const res = await fetch('/api/version/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          assetType: 'installer',
          filePath: downloadProgress?.filePath,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        addLocalLog(`Update error: ${data.error || 'Failed to apply update'}`, 'error');
      } else {
        addLocalLog('Update pipeline running in background (zero console window)...', 'success');
      }
    } catch (err: any) {
      addLocalLog(`Apply request failed: ${err?.message || err}`, 'error');
    }
  };

  // Full 1-Click Update action (Downloads then automatically applies without shell)
  const triggerOneClickUpdate = (assetType: 'installer' | 'portable' = 'installer') => {
    setSelectedAssetType('installer');
    setIsUpdating(true);
    if (downloadProgress?.status === 'completed' && downloadProgress?.assetType === 'installer') {
      applyUpdate('installer');
    } else {
      startInAppDownload('installer');
    }
  };

  useEffect(() => {
    checkForUpdates();
    pollDownloadStatus();
    pollApplyStatus();

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
        if (data?.status === 'completed') {
          addLocalLog(`Package ${data.fileName} downloaded successfully (${data.totalFormatted}).`, 'success');
          // Automatically trigger apply if user initiated 1-click update
          if (isUpdating && (!applyState || applyState.status === 'idle')) {
            applyUpdate(data.assetType);
          }
          clearInterval(timer);
        } else if (data?.status === 'error') {
          addLocalLog(`Download error: ${data.error}`, 'error');
          clearInterval(timer);
        }
      }, 500);
    }
    return () => clearInterval(timer);
  }, [downloadProgress?.status, isUpdating, applyState?.status]);

  // Polling loop while applying update
  useEffect(() => {
    let timer: NodeJS.Timeout;
    const isApplyingActive =
      applyState &&
      applyState.status !== 'idle' &&
      applyState.status !== 'error';

    if (isApplyingActive || isUpdating) {
      timer = setInterval(async () => {
        const data = await pollApplyStatus();
        if (data?.status === 'restarting') {
          // Restart is imminent
          clearInterval(timer);
        } else if (data?.status === 'error') {
          clearInterval(timer);
        }
      }, 400);
    }
    return () => clearInterval(timer);
  }, [applyState?.status, isUpdating]);

  // Auto-scroll terminal log to bottom
  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [applyState?.logs, localLogs]);

  // Calculate master progress & active stages
  const isUpdatingActive = Boolean(
    isUpdating ||
    downloadProgress?.status === 'downloading' ||
    (applyState && applyState.status !== 'idle' && applyState.status !== 'error')
  );

  const downloadPct = downloadProgress?.progress || 0;
  let masterProgress = 0;
  let currentStep = 1;
  let currentStepTitle = 'Checking Update Status';
  let currentStepDetail = 'Ready to begin in-app update';

  if (downloadProgress?.status === 'downloading') {
    currentStep = 1;
    masterProgress = Math.round(downloadPct * 0.4); // 0-40%
    currentStepTitle = `Step 1 of 4: Downloading ${downloadProgress.fileName}`;
    currentStepDetail = `${downloadProgress.downloadedFormatted || '0 B'} / ${downloadProgress.totalFormatted || '...'} • ${downloadProgress.speed || 'Downloading...'}`;
  } else if (applyState && applyState.status !== 'idle') {
    if (applyState.status === 'extracting') {
      currentStep = 2;
      masterProgress = 40 + Math.round((applyState.progress / 100) * 25); // 40-65%
      currentStepTitle = 'Step 2 of 4: Unpacking Application Archive';
      currentStepDetail = applyState.detail || 'Extracting binaries and Next.js bundle to temporary staging area';
    } else if (applyState.status === 'verifying') {
      currentStep = 3;
      masterProgress = 65 + Math.round((applyState.progress / 100) * 15); // 65-80%
      currentStepTitle = 'Step 3 of 4: Verifying Application Files';
      currentStepDetail = applyState.detail || 'Checking launcher binaries and securing database (shifts.db)';
    } else if (applyState.status === 'staging') {
      currentStep = 3;
      masterProgress = 80 + Math.round((applyState.progress / 100) * 15); // 80-95%
      currentStepTitle = 'Step 3 of 4: Arming Zero-Shell Silent Runner';
      currentStepDetail = applyState.detail || 'Preparing silent background replacement script';
    } else if (applyState.status === 'restarting') {
      currentStep = 4;
      masterProgress = 100;
      currentStepTitle = 'Step 4 of 4: Restarting Teams Shifts';
      currentStepDetail = 'Application will relaunch automatically in 2-3 seconds with new version';
    } else if (applyState.status === 'error') {
      currentStepTitle = 'Update Failed';
      currentStepDetail = applyState.error || 'An error occurred during update';
    }
  } else if (downloadProgress?.status === 'completed') {
    currentStep = 2;
    masterProgress = 40;
    currentStepTitle = 'Package Downloaded & Verified';
    currentStepDetail = `${downloadProgress.fileName} is ready to be applied.`;
  }

  // Combine local logs and backend logs
  const combinedLogs = [...localLogs];
  if (applyState?.logs && applyState.logs.length > 0) {
    applyState.logs.forEach(l => {
      if (!combinedLogs.some(existing => existing.text === l.text && existing.time === l.time)) {
        combinedLogs.push(l);
      }
    });
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--slate-950)', color: 'white', padding: '1.5rem', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
      <div className="version-modal-card" style={{ maxWidth: 800, width: '100%', animation: 'fadeIn 0.2s ease-out' }}>
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
                  v{updateInfo?.currentVersion || '1.0.13'}
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
              {/* DEDICATED IN-APP UPDATE PROGRESS SCREEN */}
              {isUpdatingActive ? (
                <div className="update-screen-card">
                  {/* Status Top Row */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.85rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ width: 38, height: 38, borderRadius: 10, background: 'rgba(59, 130, 246, 0.2)', border: '1px solid rgba(59, 130, 246, 0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#60a5fa' }}>
                        {applyState?.status === 'restarting' ? (
                          <CheckCircle2 size={22} color="#34d399" />
                        ) : (
                          <RefreshCw size={20} className="spin-icon" />
                        )}
                      </div>
                      <div>
                        <div style={{ fontWeight: 800, fontSize: '1.05rem', color: 'white', display: 'flex', alignItems: 'center', gap: 8 }}>
                          {currentStepTitle}
                          <span className="badge" style={{ background: 'rgba(59, 130, 246, 0.2)', color: '#93c5fd', border: '1px solid rgba(59, 130, 246, 0.3)', fontSize: '0.72rem' }}>
                            {masterProgress}%
                          </span>
                        </div>
                        <div style={{ fontSize: '0.78rem', color: 'var(--slate-300)', marginTop: 2 }}>
                          {currentStepDetail}
                        </div>
                      </div>
                    </div>

                    {applyState?.status !== 'restarting' && (
                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={cancelUpdate}
                        style={{ padding: '0.35rem 0.75rem', fontSize: '0.75rem' }}
                      >
                        Cancel
                      </button>
                    )}
                  </div>

                  {/* Master Progress Track */}
                  <div className="download-progress-track" style={{ height: 10, marginBottom: '1.25rem' }}>
                    <div
                      className="download-progress-bar"
                      style={{
                        width: `${Math.max(4, masterProgress)}%`,
                        background: applyState?.status === 'restarting'
                          ? 'linear-gradient(90deg, #10b981, #34d399)'
                          : 'linear-gradient(90deg, #3b82f6, #38bdf8)',
                      }}
                    />
                  </div>

                  {/* 4-Stage Visual Stepper */}
                  <div className="update-stage-grid">
                    {/* Stage 1 */}
                    <div className={`update-stage-card ${currentStep === 1 ? 'active' : currentStep > 1 ? 'completed' : 'pending'}`}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#93c5fd' }}>STAGE 1</span>
                        {currentStep > 1 ? (
                          <Check size={14} color="#34d399" />
                        ) : currentStep === 1 ? (
                          <RefreshCw size={12} className="spin-icon" color="#60a5fa" />
                        ) : (
                          <Clock size={12} color="#64748b" />
                        )}
                      </div>
                      <div style={{ fontWeight: 700, fontSize: '0.8rem', color: 'white' }}>Download Package</div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--slate-400)' }}>
                        {downloadPct > 0 ? `${downloadPct}% • In-App` : 'Release Asset'}
                      </div>
                    </div>

                    {/* Stage 2 */}
                    <div className={`update-stage-card ${currentStep === 2 ? 'active' : currentStep > 2 ? 'completed' : 'pending'}`}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#93c5fd' }}>STAGE 2</span>
                        {currentStep > 2 ? (
                          <Check size={14} color="#34d399" />
                        ) : currentStep === 2 ? (
                          <RefreshCw size={12} className="spin-icon" color="#60a5fa" />
                        ) : (
                          <Clock size={12} color="#64748b" />
                        )}
                      </div>
                      <div style={{ fontWeight: 700, fontSize: '0.8rem', color: 'white' }}>Unpack & Stage</div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--slate-400)' }}>
                        {currentStep >= 2 ? 'Staging payload' : 'Pending'}
                      </div>
                    </div>

                    {/* Stage 3 */}
                    <div className={`update-stage-card ${currentStep === 3 ? 'active' : currentStep > 3 ? 'completed' : 'pending'}`}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#93c5fd' }}>STAGE 3</span>
                        {currentStep > 3 ? (
                          <Check size={14} color="#34d399" />
                        ) : currentStep === 3 ? (
                          <RefreshCw size={12} className="spin-icon" color="#60a5fa" />
                        ) : (
                          <Clock size={12} color="#64748b" />
                        )}
                      </div>
                      <div style={{ fontWeight: 700, fontSize: '0.8rem', color: 'white' }}>Verify & Secure DB</div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--slate-400)' }}>
                        {currentStep >= 3 ? 'shifts.db preserved' : 'Pending'}
                      </div>
                    </div>

                    {/* Stage 4 */}
                    <div className={`update-stage-card ${currentStep === 4 ? 'active completed' : 'pending'}`}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#93c5fd' }}>STAGE 4</span>
                        {currentStep === 4 ? (
                          <Check size={14} color="#34d399" />
                        ) : (
                          <Clock size={12} color="#64748b" />
                        )}
                      </div>
                      <div style={{ fontWeight: 700, fontSize: '0.8rem', color: 'white' }}>Silent Relaunch</div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--slate-400)' }}>
                        {currentStep === 4 ? 'Restarting in 3s' : 'Zero console window'}
                      </div>
                    </div>
                  </div>

                  {/* Terminal Live Event Log */}
                  <div style={{ marginBottom: '0.85rem' }}>
                    <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--slate-400)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.35rem', display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Layers size={13} /> Update Progress Event Log
                    </div>
                    <div className="update-terminal-box" ref={terminalRef}>
                      {combinedLogs.length === 0 ? (
                        <div style={{ color: '#64748b', fontStyle: 'italic' }}>Initializing updater sequence...</div>
                      ) : (
                        combinedLogs.map((log, idx) => (
                          <div key={idx} className="update-terminal-log">
                            <span className="update-terminal-time">[{log.time}]</span>
                            <span className={`update-terminal-text ${log.type || 'info'}`}>
                              {log.type === 'success' ? '✓ ' : log.type === 'error' ? '✗ ' : '› '}
                              {log.text}
                            </span>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  {/* Zero-Shell Reassurance Banner */}
                  <div className="update-reassurance-box">
                    <Shield size={18} color="#38bdf8" style={{ flexShrink: 0 }} />
                    <div>
                      <strong>Zero Shell Window:</strong> No command prompt or console window will open. Teams Shifts updates completely silently in the background and will relaunch automatically with your shifts database (<code style={{ color: '#93c5fd' }}>shifts.db</code>) intact.
                    </div>
                  </div>
                </div>
              ) : (
                /* HERO LEAP CARD */
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
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                        <span style={{ fontSize: '0.72rem', color: 'var(--slate-400)', textTransform: 'uppercase', fontWeight: 600 }}>Active Edition</span>
                        {updateInfo?.isInstalled ? (
                          <span className="badge" style={{ background: 'rgba(59, 130, 246, 0.2)', color: '#93c5fd', border: '1px solid rgba(59, 130, 246, 0.3)', fontSize: '0.62rem' }}>
                            Full Installed
                          </span>
                        ) : (
                          <span className="badge" style={{ background: 'rgba(245, 158, 11, 0.2)', color: '#fcd34d', border: '1px solid rgba(245, 158, 11, 0.3)', fontSize: '0.62rem' }}>
                            Portable
                          </span>
                        )}
                      </div>
                      <span style={{ fontSize: '1.15rem', fontWeight: 800, color: 'white', fontFamily: 'monospace' }}>
                        v{updateInfo?.currentVersion || '1.1.7'}
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
                        v{updateInfo?.latestVersion || updateInfo?.currentVersion || '1.1.7'}
                      </span>
                    </div>
                  </div>

                  {/* Update Area if Update Available */}
                  {updateInfo?.hasUpdate && (
                    updateInfo?.isInstalled ? (
                      /* Full Installed Edition: In-app 1-click update with auto-restart */
                      <div style={{ marginTop: '1.25rem', paddingTop: '1rem', borderTop: '1px solid rgba(59, 130, 246, 0.25)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(16, 185, 129, 0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#34d399' }}>
                            <Sparkles size={18} />
                          </div>
                          <div>
                            <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'white' }}>
                              1-Click In-App Update Ready
                            </div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--slate-300)' }}>
                              Closes cleanly, runs installer silently, and relaunches automatically with the new version.
                            </div>
                          </div>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <button
                            type="button"
                            className="btn"
                            onClick={() => triggerOneClickUpdate('installer')}
                            style={{
                              padding: '0.65rem 1.25rem',
                              fontWeight: 700,
                              fontSize: '0.85rem',
                              display: 'flex',
                              alignItems: 'center',
                              gap: 8,
                              background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                              color: 'white',
                              borderRadius: 8,
                              border: '1px solid #059669',
                              boxShadow: '0 4px 15px rgba(16, 185, 129, 0.3)',
                            }}
                          >
                            <Play size={16} /> ⚡ 1-Click Update & Restart
                          </button>
                        </div>
                      </div>
                    ) : (
                      /* Portable Edition: Notification banner and download links (No in-app update runner) */
                      <div style={{
                        marginTop: '1.25rem',
                        padding: '1rem 1.15rem',
                        background: 'rgba(245, 158, 11, 0.08)',
                        border: '1px solid rgba(245, 158, 11, 0.3)',
                        borderRadius: 10,
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: '0.5rem' }}>
                          <AlertCircle size={18} style={{ color: '#fbbf24', flexShrink: 0 }} />
                          <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#fef3c7' }}>
                            Portable Edition Update Available (v{updateInfo?.latestVersion})
                          </div>
                        </div>
                        <div style={{ fontSize: '0.78rem', color: '#fde68a', lineHeight: 1.5, marginBottom: '0.85rem' }}>
                          You are currently using the <strong>Portable Edition</strong> of Teams Shifts.
                          Automatic in-app updating is exclusive to the <strong>Full Installed Version</strong>.
                          To update your portable edition, download the latest standalone ZIP below and extract the files to your folder. Your database in <code>shifts.db</code> is kept safe.
                        </div>
                        <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
                          <a
                            href={updateInfo?.portableUrl || `https://github.com/${updateInfo?.repo || 'Doffo-1/Teams-Shifts'}/releases/latest/download/TeamsShifts-Standalone.zip`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="btn btn-primary"
                            style={{ padding: '0.5rem 0.9rem', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: 6, textDecoration: 'none' }}
                          >
                            <Download size={14} /> Download Portable ZIP (v{updateInfo?.latestVersion})
                          </a>
                          <a
                            href={updateInfo?.downloadUrl || `https://github.com/${updateInfo?.repo || 'Doffo-1/Teams-Shifts'}/releases/latest/download/TeamsShifts-Setup.exe`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="btn btn-secondary"
                            style={{ padding: '0.5rem 0.9rem', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: 6, textDecoration: 'none' }}
                          >
                            <Package size={14} /> Switch to Full Version (Setup.exe)
                          </a>
                          <a
                            href={updateInfo?.releaseUrl || `https://github.com/${updateInfo?.repo || 'Doffo-1/Teams-Shifts'}/releases`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="btn btn-secondary"
                            style={{ padding: '0.5rem 0.9rem', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: 6, textDecoration: 'none' }}
                          >
                            <ExternalLink size={14} /> View GitHub Release
                          </a>
                        </div>
                      </div>
                    )
                  )}
                </div>
              )}

              {/* PACKAGE SELECTION CARDS (When not updating) */}
              {!isUpdatingActive && (
                <div style={{ marginBottom: '1.25rem' }}>
                  <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--slate-300)', marginBottom: '0.6rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    Available Packages
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                    {/* Windows Setup Card (Full Version) */}
                    <div style={{ background: 'rgba(30, 41, 59, 0.6)', border: '1px solid rgba(59, 130, 246, 0.3)', borderRadius: 10, padding: '1rem', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                          <span style={{ fontSize: '0.92rem', fontWeight: 700, color: 'white' }}>Windows Setup (.exe)</span>
                          <span className="badge" style={{ background: 'rgba(59, 130, 246, 0.2)', color: '#93c5fd', border: '1px solid rgba(59, 130, 246, 0.3)', fontSize: '0.65rem' }}>
                            Full Version
                          </span>
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--slate-300)', marginBottom: '0.85rem' }}>
                          Standard Windows installer with Start Menu integration, desktop shortcuts, and seamless in-app automatic updates.
                        </div>
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {updateInfo?.isInstalled && (
                          <button
                            type="button"
                            className="btn version-btn-glow"
                            onClick={() => triggerOneClickUpdate('installer')}
                            style={{ padding: '0.55rem 0.8rem', fontSize: '0.8rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                          >
                            <Download size={14} /> 🚀 Update via Setup In-App
                          </button>
                        )}
                        <a
                          href={updateInfo?.downloadUrl || `https://github.com/${updateInfo?.repo || 'Doffo-1/Teams-Shifts'}/releases/latest/download/TeamsShifts-Setup.exe`}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ fontSize: '0.68rem', color: 'var(--slate-400)', textAlign: 'center', textDecoration: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}
                        >
                          <ExternalLink size={11} /> Save exe via browser
                        </a>
                      </div>
                    </div>

                    {/* Portable Edition Card */}
                    <div style={{ background: 'rgba(30, 41, 59, 0.6)', border: '1px solid rgba(71, 85, 105, 0.5)', borderRadius: 10, padding: '1rem', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                          <span style={{ fontSize: '0.92rem', fontWeight: 700, color: 'white' }}>Portable Edition (.zip)</span>
                          <span className="badge" style={{ background: 'rgba(100, 116, 139, 0.2)', color: '#cbd5e1', border: '1px solid rgba(100, 116, 139, 0.3)', fontSize: '0.65rem' }}>Portable</span>
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--slate-300)', marginBottom: '0.85rem' }}>
                          Standalone portable ZIP. Requires zero installation. Updates are applied manually by extracting over your folder.
                        </div>
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <a
                          href={updateInfo?.portableUrl || `https://github.com/${updateInfo?.repo || 'Doffo-1/Teams-Shifts'}/releases/latest/download/TeamsShifts-Standalone.zip`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn btn-secondary"
                          style={{ padding: '0.55rem 0.8rem', fontSize: '0.8rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, textDecoration: 'none' }}
                        >
                          <Download size={14} /> Save Portable ZIP via browser
                        </a>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Release Features */}
              <div style={{ background: 'rgba(15, 23, 42, 0.6)', border: '1px solid rgba(51, 65, 85, 0.5)', borderRadius: 12, padding: '1rem 1.15rem' }}>
                <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--slate-300)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.5rem' }}>
                  Release Highlights
                </div>
                <div className="version-feature-item">
                  <span className="version-feature-tag tag-feat">FEAT</span>
                  <div>
                    <strong>In-App Progress Tracking Screen:</strong> Track download, archive unpacking, file staging, and silent relaunch in real-time inside the application without any shell or command prompt window.
                  </div>
                </div>
                <div className="version-feature-item">
                  <span className="version-feature-tag tag-fix">FIX</span>
                  <div>
                    <strong>Zero-Shell Silent Updates:</strong> Windows Scripting Host runs file updates headlessly with zero black command prompt windows, eliminating prompt flashes.
                  </div>
                </div>
                <div className="version-feature-item">
                  <span className="version-feature-tag tag-perf">PERF</span>
                  <div>
                    <strong>Database Safeguard:</strong> Automatically preserves your SQLite database (<code style={{ color: '#93c5fd' }}>shifts.db</code>) and settings across all updates.
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
                  <div className="version-diag-value">v{updateInfo?.currentVersion || '1.0.13'}</div>
                </div>
                <div className="version-diag-card">
                  <div className="version-diag-label">Latest Cloud Version</div>
                  <div className="version-diag-value">v{updateInfo?.latestVersion || updateInfo?.currentVersion || '1.0.13'}</div>
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
              disabled={Boolean(checkingUpdate || isUpdatingActive)}
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
