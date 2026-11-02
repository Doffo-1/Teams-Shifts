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

async function checkViaAtomFeed(repo: string) {
  try {
    const res = await fetch(`https://github.com/${repo}/releases.atom`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
      cache: 'no-store',
    });
    if (res.ok) {
      const xml = await res.text();
      const tagMatch = xml.match(/<id>tag:github.com,2008:Repository\/\d+\/(v?[0-9.]+)<\/id>/);
      const titleMatch = xml.match(/<entry>[\s\S]*?<title>([^<]+)<\/title>[\s\S]*?<updated>([^<]+)<\/updated>/);
      if (tagMatch) {
        const rawTag = tagMatch[1];
        const cleanTag = rawTag.replace(/^v/i, '').trim();
        return {
          latestVersion: cleanTag,
          releaseName: titleMatch ? titleMatch[1] : `Release ${rawTag}`,
          releaseUrl: `https://github.com/${repo}/releases/tag/${rawTag}`,
          downloadUrl: `https://github.com/${repo}/releases/download/${rawTag}/TeamsShifts-Setup.exe`,
          portableUrl: `https://github.com/${repo}/releases/download/${rawTag}/TeamsShifts-Standalone.zip`,
        };
      }
    }
  } catch {}
  return null;
}

async function checkViaWebRedirect(repo: string) {
  try {
    const webRes = await fetch(`https://github.com/${repo}/releases/latest`, {
      redirect: 'manual',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
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
          portableUrl: `https://github.com/${repo}/releases/download/${rawTag}/TeamsShifts-Standalone.zip`,
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
    portableUrl: '',
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
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    const headers: Record<string, string> = {
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) TeamsShifts',
    };

    if (process.env.GITHUB_TOKEN) {
      headers['Authorization'] = `Bearer ${process.env.GITHUB_TOKEN}`;
    }

    const res = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, {
      headers,
      signal: controller.signal,
      next: { revalidate: 300 },
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

      if (Array.isArray(release.assets)) {
        const exeAsset = release.assets.find((a: any) =>
          typeof a.name === 'string' && a.name.endsWith('.exe')
        );
        const zipAsset = release.assets.find((a: any) =>
          typeof a.name === 'string' && a.name.endsWith('.zip')
        );
        if (exeAsset?.browser_download_url) {
          responseData.downloadUrl = exeAsset.browser_download_url;
        }
        if (zipAsset?.browser_download_url) {
          responseData.portableUrl = zipAsset.browser_download_url;
        }
      }

      if (!responseData.downloadUrl) {
        responseData.downloadUrl = responseData.releaseUrl;
      }
    } else {
      // Fallback 1: Public Atom feed (Zero rate limits)
      const atomFallback = await checkViaAtomFeed(repo);
      if (atomFallback) {
        responseData.latestVersion = atomFallback.latestVersion;
        responseData.hasUpdate = isNewerVersion(responseData.latestVersion, APP_VERSION);
        responseData.releaseName = atomFallback.releaseName;
        responseData.releaseUrl = atomFallback.releaseUrl;
        responseData.downloadUrl = atomFallback.downloadUrl;
        responseData.portableUrl = atomFallback.portableUrl;
        responseData.error = null;
      } else {
        // Fallback 2: Web location redirect
        const webFallback = await checkViaWebRedirect(repo);
        if (webFallback) {
          responseData.latestVersion = webFallback.latestVersion;
          responseData.hasUpdate = isNewerVersion(responseData.latestVersion, APP_VERSION);
          responseData.releaseName = webFallback.releaseName;
          responseData.releaseUrl = webFallback.releaseUrl;
          responseData.downloadUrl = webFallback.downloadUrl;
          responseData.portableUrl = webFallback.portableUrl;
          responseData.error = null;
        } else if (res.status === 404) {
          responseData.error = 'No releases published yet on this repository.';
        } else {
          responseData.error = `GitHub status ${res.status}`;
        }
      }
    }
  } catch (err: any) {
    // If API fetch throws/aborts, try fallback!
    try {
      const atomFallback = await checkViaAtomFeed(repo);
      if (atomFallback) {
        responseData.latestVersion = atomFallback.latestVersion;
        responseData.hasUpdate = isNewerVersion(responseData.latestVersion, APP_VERSION);
        responseData.releaseName = atomFallback.releaseName;
        responseData.releaseUrl = atomFallback.releaseUrl;
        responseData.downloadUrl = atomFallback.downloadUrl;
        responseData.portableUrl = atomFallback.portableUrl;
        responseData.error = null;
      } else {
        const webFallback = await checkViaWebRedirect(repo);
        if (webFallback) {
          responseData.latestVersion = webFallback.latestVersion;
          responseData.hasUpdate = isNewerVersion(responseData.latestVersion, APP_VERSION);
          responseData.releaseName = webFallback.releaseName;
          responseData.releaseUrl = webFallback.releaseUrl;
          responseData.downloadUrl = webFallback.downloadUrl;
          responseData.portableUrl = webFallback.portableUrl;
          responseData.error = null;
        } else {
          responseData.error = err?.message || 'Failed to check GitHub releases.';
        }
      }
    } catch {
      responseData.error = err?.message || 'Failed to check GitHub releases.';
    }
  }

  return NextResponse.json(responseData);
}
