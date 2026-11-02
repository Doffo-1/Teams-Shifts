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

export default function VersionPage() {
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [versionTab, setVersionTab] = useState<'overview' | 'changelog' | 'diagnostics'>('overview');

  const checkForUpdates = async () => {
    setCheckingUpdate(true);
    try {
      const res = await fetch('/api/version');
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

  useEffect(() => {
    checkForUpdates();
  }, []);

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
                  v{updateInfo?.currentVersion || '1.0.7'}
                </span>
              </div>
              <div style={{ fontSize: '0.8rem', color: 'var(--slate-400)', marginTop: 2 }}>
                Teams Shifts Standalone Application & Release Hub
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
              <Sparkles size={15} /> Overview & Downloads
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

          {/* TAB 1: OVERVIEW & DOWNLOADS */}
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
                      v{updateInfo?.currentVersion || '1.0.7'}
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
                      v{updateInfo?.latestVersion || updateInfo?.currentVersion || '1.0.7'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Dual Download Action Cards */}
              <div style={{ marginBottom: '1.25rem' }}>
                <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--slate-300)', marginBottom: '0.6rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  {updateInfo?.hasUpdate ? 'Choose Installation Package' : 'Available Downloads & Reinstalls'}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                  {/* Windows Installer Setup.exe */}
                  <a
                    href={updateInfo?.downloadUrl || `https://github.com/${updateInfo?.repo || 'Doffo-1/Teams-Shifts'}/releases/latest/download/TeamsShifts-Setup.exe`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn version-btn-glow"
                    style={{ padding: '0.85rem 1rem', display: 'flex', flexDirection: 'column', alignItems: 'flex-start', textAlign: 'left', textDecoration: 'none', borderRadius: 10 }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', marginBottom: 4 }}>
                      <span style={{ fontSize: '0.9rem', fontWeight: 700 }}>Windows Setup (.exe)</span>
                      <Download size={16} />
                    </div>
                    <span style={{ fontSize: '0.72rem', color: 'rgba(255, 255, 255, 0.85)', fontWeight: 400 }}>
                      Recommended • Desktop installer with Start Menu & Shortcuts
                    </span>
                  </a>

                  {/* Standalone Portable ZIP */}
                  <a
                    href={updateInfo?.portableUrl || `https://github.com/${updateInfo?.repo || 'Doffo-1/Teams-Shifts'}/releases/latest/download/TeamsShifts-Standalone.zip`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-secondary"
                    style={{ padding: '0.85rem 1rem', display: 'flex', flexDirection: 'column', alignItems: 'flex-start', textAlign: 'left', textDecoration: 'none', borderRadius: 10, background: 'rgba(30, 41, 59, 0.8)', borderColor: 'rgba(71, 85, 105, 0.6)' }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', marginBottom: 4 }}>
                      <span style={{ fontSize: '0.9rem', fontWeight: 700, color: 'white' }}>Portable Edition (.zip)</span>
                      <Download size={16} />
                    </div>
                    <span style={{ fontSize: '0.72rem', color: 'var(--slate-400)', fontWeight: 400 }}>
                      Zero installation • Extract and launch anywhere
                    </span>
                  </a>
                </div>
              </div>

              {/* Highlights */}
              <div style={{ background: 'rgba(15, 23, 42, 0.6)', border: '1px solid rgba(51, 65, 85, 0.5)', borderRadius: 12, padding: '1rem 1.15rem' }}>
                <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--slate-300)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.5rem' }}>
                  Recent Release Highlights
                </div>
                <div className="version-feature-item">
                  <span className="version-feature-tag tag-fix">FIX</span>
                  <div>
                    <strong>Clean Process Termination:</strong> Fully eliminated lingering background processes on window close and file lock errors during updates.
                  </div>
                </div>
                <div className="version-feature-item">
                  <span className="version-feature-tag tag-feat">FEAT</span>
                  <div>
                    <strong>Pop-Out Updates Screen:</strong> Centered floating modal overlay with dedicated pop-out window capability.
                  </div>
                </div>
                <div className="version-feature-item">
                  <span className="version-feature-tag tag-perf">PERF</span>
                  <div>
                    <strong>Zero-Rate-Limit Updates:</strong> Resilient GitHub Atom feed resolver ensures seamless update notifications.
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: RELEASE NOTES & CHANGELOG */}
          {versionTab === 'changelog' && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                <div>
                  <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, color: 'white' }}>
                    {updateInfo?.releaseName || `Release v${updateInfo?.latestVersion || updateInfo?.currentVersion || '1.0.7'}`}
                  </h4>
                  {updateInfo?.publishedAt && (
                    <div style={{ fontSize: '0.75rem', color: 'var(--slate-400)' }}>
                      Published on {new Date(updateInfo.publishedAt).toLocaleDateString()}
                    </div>
                  )}
                </div>
                <a
                  href={updateInfo?.releaseUrl || `https://github.com/${updateInfo?.repo || 'Doffo-1/Teams-Shifts'}/releases`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-sm btn-secondary"
                  style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.75rem' }}
                >
                  <ExternalLink size={13} /> View on GitHub
                </a>
              </div>

              <div className="version-notes-box" style={{ maxHeight: 280, minHeight: 180, overflowY: 'auto', background: 'rgba(15, 23, 42, 0.7)', border: '1px solid rgba(51, 65, 85, 0.5)', borderRadius: 10, padding: '1rem', fontSize: '0.82rem', lineHeight: 1.6, color: 'var(--slate-300)' }}>
                {updateInfo?.releaseNotes ? (
                  <div style={{ whiteSpace: 'pre-wrap' }}>
                    {updateInfo.releaseNotes}
                  </div>
                ) : (
                  <div style={{ color: 'var(--slate-400)', fontStyle: 'italic', padding: '1rem 0', textAlign: 'center' }}>
                    No extended notes provided for this release. Check GitHub releases for commits.
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 3: SYSTEM & DIAGNOSTICS */}
          {versionTab === 'diagnostics' && (
            <div>
              <div className="version-info-card" style={{ marginBottom: 0 }}>
                <div className="version-status-row">
                  <span style={{ color: 'var(--slate-400)', fontSize: '0.85rem' }}>Application Runtime</span>
                  <span style={{ fontWeight: 600, color: 'white', fontSize: '0.85rem' }}>
                    Node.js 22.x + Microsoft WebView2 (Edge Chromium)
                  </span>
                </div>

                <div className="version-status-row">
                  <span style={{ color: 'var(--slate-400)', fontSize: '0.85rem' }}>Architecture & Launcher</span>
                  <span style={{ color: '#93c5fd', fontSize: '0.85rem', fontWeight: 600 }}>
                    x64 Windows Desktop Native (Zero-Dependency C# Launcher)
                  </span>
                </div>

                <div className="version-status-row">
                  <span style={{ color: 'var(--slate-400)', fontSize: '0.85rem' }}>Local Database</span>
                  <span style={{ color: 'var(--slate-200)', fontSize: '0.85rem', fontFamily: 'monospace' }}>
                    SQLite 3 (Prisma ORM in AppData / data folder)
                  </span>
                </div>

                <div className="version-status-row">
                  <span style={{ color: 'var(--slate-400)', fontSize: '0.85rem' }}>GitHub Repository</span>
                  <span style={{ color: '#60a5fa', fontSize: '0.85rem', fontFamily: 'monospace' }}>
                    {updateInfo?.repo || 'Doffo-1/Teams-Shifts'}
                  </span>
                </div>

                <div className="version-status-row">
                  <span style={{ color: 'var(--slate-400)', fontSize: '0.85rem' }}>Update Protocol</span>
                  <span style={{ color: 'var(--slate-300)', fontSize: '0.85rem' }}>
                    Zero-Rate-Limit Public Atom Feed + Web Redirect
                  </span>
                </div>

                <div className="version-status-row">
                  <span style={{ color: 'var(--slate-400)', fontSize: '0.85rem' }}>Last Update Verification</span>
                  <span style={{ color: 'var(--slate-400)', fontSize: '0.8rem' }}>
                    {updateInfo?.lastChecked ? new Date(updateInfo.lastChecked).toLocaleString() : 'Not checked yet'}
                  </span>
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
