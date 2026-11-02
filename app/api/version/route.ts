import { NextResponse } from 'next/server';
import { APP_VERSION, DEFAULT_GITHUB_REPO } from '@/lib/version';

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

async function checkViaWebRedirect(repo: string) {
  try {
    const webRes = await fetch(`https://github.com/${repo}/releases/latest`, {
      redirect: 'manual',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        'Accept': 'text/html',
      },
      cache: 'no-store',
    });
    const location = webRes.headers.get('location');
    if (location && location.includes('/releases/tag/')) {
      const rawTag = location.split('/releases/tag/')[1]?.split('?')[0]?.trim() || '';
      const cleanTag = rawTag.replace(/^v/i, '').trim();
      if (cleanTag) {
        return {
          latestVersion: cleanTag,
          releaseName: `Release ${rawTag}`,
          releaseUrl: location,
          downloadUrl: `https://github.com/${repo}/releases/download/${rawTag}/TeamsShifts-Setup.exe`,
        };
      }
    }
  } catch {}
  return null;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const repo = searchParams.get('repo') || process.env.GITHUB_REPO || DEFAULT_GITHUB_REPO;

  const responseData = {
    currentVersion: APP_VERSION,
    latestVersion: APP_VERSION,
    hasUpdate: false,
    releaseName: '',
    releaseNotes: '',
    releaseUrl: '',
    downloadUrl: '',
    publishedAt: '',
    repo: repo,
    lastChecked: new Date().toISOString(),
    error: null as string | null,
  };

  if (!repo || repo === 'your-username/teams-shifts') {
    return NextResponse.json(responseData);
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);

    const headers: Record<string, string> = {
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'TeamsShifts-DesktopApp',
    };

    if (process.env.GITHUB_TOKEN) {
      headers['Authorization'] = `Bearer ${process.env.GITHUB_TOKEN}`;
    }

    const res = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, {
      headers,
      signal: controller.signal,
      next: { revalidate: 300 }, // Cache check for 5 minutes
    });

    clearTimeout(timeoutId);

    if (res.ok) {
      const release = await res.json();
      const rawTag = release.tag_name || release.name || '';
      const cleanTag = rawTag.replace(/^v/i, '').trim();

      responseData.latestVersion = cleanTag || APP_VERSION;
      responseData.hasUpdate = isNewerVersion(responseData.latestVersion, APP_VERSION);
      responseData.releaseName = release.name || release.tag_name || `Version ${cleanTag}`;
      responseData.releaseNotes = release.body || '';
      responseData.releaseUrl = release.html_url || `https://github.com/${repo}/releases`;
      responseData.publishedAt = release.published_at || '';

      // Locate standalone zip or exe asset
      if (Array.isArray(release.assets)) {
        const zipAsset = release.assets.find((a: any) =>
          typeof a.name === 'string' && (a.name.endsWith('.zip') || a.name.endsWith('.exe'))
        );
        if (zipAsset && zipAsset.browser_download_url) {
          responseData.downloadUrl = zipAsset.browser_download_url;
        }
      }

      if (!responseData.downloadUrl) {
        responseData.downloadUrl = responseData.releaseUrl;
      }
    } else {
      // If GitHub REST API is rate limited (403) or returns an error, use zero-rate-limit web redirect fallback
      const fallback = await checkViaWebRedirect(repo);
      if (fallback) {
        responseData.latestVersion = fallback.latestVersion;
        responseData.hasUpdate = isNewerVersion(responseData.latestVersion, APP_VERSION);
        responseData.releaseName = fallback.releaseName;
        responseData.releaseUrl = fallback.releaseUrl;
        responseData.downloadUrl = fallback.downloadUrl;
        responseData.error = null;
      } else if (res.status === 404) {
        responseData.error = 'No releases published yet on this repository.';
      } else if (res.status === 403) {
        responseData.error = 'GitHub API rate limit temporarily reached. Use "View on GitHub" to download.';
      } else {
        responseData.error = `GitHub returned status ${res.status}`;
      }
    }
  } catch (err: any) {
    // Attempt web redirect fallback on network or abort errors
    const fallback = await checkViaWebRedirect(repo);
    if (fallback) {
      responseData.latestVersion = fallback.latestVersion;
      responseData.hasUpdate = isNewerVersion(responseData.latestVersion, APP_VERSION);
      responseData.releaseName = fallback.releaseName;
      responseData.releaseUrl = fallback.releaseUrl;
      responseData.downloadUrl = fallback.downloadUrl;
      responseData.error = null;
    } else if (err.name === 'AbortError') {
      responseData.error = 'Update check timed out. Please check your internet connection.';
    } else {
      responseData.error = err.message || 'Unable to contact GitHub.';
    }
  }

  return NextResponse.json(responseData);
}

