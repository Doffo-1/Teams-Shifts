import fs from 'fs';
import path from 'path';

/**
 * Resolves the root application directory where TeamsShifts.exe lives.
 */
export function getAppDir(): string {
  if (process.env.TEAMS_SHIFTS_APP_DIR && fs.existsSync(process.env.TEAMS_SHIFTS_APP_DIR)) {
    return process.env.TEAMS_SHIFTS_APP_DIR;
  }
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

/**
 * Determines whether the current running app is the Full Installed Version (via Setup.exe)
 * or the Portable Edition (extracted from ZIP).
 */
export function isAppInstalled(): boolean {
  if (process.env.TEAMS_SHIFTS_EDITION === 'installed') return true;
  if (process.env.TEAMS_SHIFTS_EDITION === 'portable') return false;

  const appDir = getAppDir();
  // Inno Setup installer creates unins000.exe (or unins001.exe) and installed.marker in {app}
  if (
    fs.existsSync(path.join(appDir, 'unins000.exe')) ||
    fs.existsSync(path.join(appDir, 'unins001.exe')) ||
    fs.existsSync(path.join(appDir, 'installed.marker'))
  ) {
    return true;
  }

  return false;
}

