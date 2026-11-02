# ==============================================================================
# Teams Shifts - GitHub Release & Deployment Tool
# ==============================================================================
# Usage:
#   .\push-release.ps1
#   .\push-release.ps1 -Version "1.0.1" -Message "Added new scheduling rule"
# ==============================================================================

param (
    [string]$Version,
    [string]$Message
)

$ErrorActionPreference = "Stop"
$scriptDir = $PSScriptRoot
if (-not $scriptDir) { $scriptDir = "Z:\shifts" }
Set-Location $scriptDir

Write-Host "===================================================" -ForegroundColor Cyan
Write-Host "     Teams Shifts - Push Release to GitHub" -ForegroundColor White
Write-Host "===================================================" -ForegroundColor Cyan
Write-Host ""

# 1. Resolve Git executable
$gitExe = "git"
if (Test-Path "C:\Program Files\Git\cmd\git.exe") {
    $gitExe = "C:\Program Files\Git\cmd\git.exe"
} elseif (Get-Command git -ErrorAction SilentlyContinue) {
    $gitExe = (Get-Command git).Source
}

Write-Host "[1/6] Verifying Git environment..." -ForegroundColor Yellow
try {
    $gitVer = & $gitExe --version
    Write-Host "      Found Git: $gitVer" -ForegroundColor Green
} catch {
    Write-Host "[ERROR] Git was not found! Please ensure Git for Windows is installed." -ForegroundColor Red
    pause
    exit 1
}

# 2. Ensure Git repository configuration and pointer
if (-not (Test-Path (Join-Path $scriptDir ".git"))) {
    Write-Host "      Initializing Git repository..." -ForegroundColor Yellow
    $localGitDir = "$env:USERPROFILE\.git-repos\teams-shifts"
    if (-not (Test-Path $localGitDir)) {
        New-Item -ItemType Directory -Path $localGitDir -Force | Out-Null
    }
    & $gitExe init -b main --separate-git-dir="$localGitDir" $scriptDir | Out-Null
    & $gitExe remote add origin https://github.com/Doffo-1/Teams-Shifts.git
}

# Ensure remote is set correctly
$remotes = & $gitExe remote -v
if ($remotes -notmatch "Doffo-1/Teams-Shifts") {
    & $gitExe remote set-url origin https://github.com/Doffo-1/Teams-Shifts.git
}

# 3. Determine current version
$pkgJsonPath = Join-Path $scriptDir "package.json"
$currentVer = "1.0.0"
if (Test-Path $pkgJsonPath) {
    try {
        $pkg = Get-Content $pkgJsonPath -Raw | ConvertFrom-Json
        if ($pkg.version) { $currentVer = $pkg.version }
    } catch {}
}

# Prompt for Version if not provided
if (-not $Version) {
    Write-Host "Current version: $currentVer" -ForegroundColor Gray
    $promptVer = Read-Host "Enter release version (e.g. 1.0.1) [Enter to keep $currentVer]"
    if ($promptVer) {
        $Version = $promptVer.Trim()
    } else {
        $Version = $currentVer
    }
}
$cleanVer = $Version.TrimStart('v', 'V')
$tagVer = "v$cleanVer"

# Prompt for Message if not provided
if (-not $Message) {
    $promptMsg = Read-Host "Enter release description (e.g. Added employee priority rules)"
    if ($promptMsg) {
        $Message = $promptMsg.Trim()
    } else {
        $Message = "Release $tagVer"
    }
}

# 4. Synchronize version in source files
Write-Host ""
Write-Host "[2/6] Updating version tokens to $cleanVer..." -ForegroundColor Yellow
if (Test-Path $pkgJsonPath) {
    $content = Get-Content $pkgJsonPath -Raw
    $content = $content -replace '"version":\s*"[^"]+"', "`"version`": `"$cleanVer`""
    Set-Content -Path $pkgJsonPath -Value $content -NoNewline
}

$versionTsPath = Join-Path $scriptDir "lib\version.ts"
if (Test-Path $versionTsPath) {
    $vTs = "export const APP_VERSION = '$cleanVer';`r`nexport const DEFAULT_GITHUB_REPO = 'Doffo-1/Teams-Shifts';`r`n"
    Set-Content -Path $versionTsPath -Value $vTs -NoNewline
}
Write-Host "      Updated package.json and lib/version.ts." -ForegroundColor Green

# 5. Compile C# Launcher executable if csc.exe is available
$csc = "C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe"
$programCs = Join-Path $scriptDir "launcher\Program.cs"
$iconPath = Join-Path $scriptDir "launcher\app.ico"
$manifestPath = Join-Path $scriptDir "launcher\app.manifest"
$standaloneExe = Join-Path $scriptDir "standalone-app\TeamsShifts.exe"
$launcherExe = Join-Path $scriptDir "launcher\TeamsShifts.exe"

if ((Test-Path $csc) -and (Test-Path $programCs)) {
    Write-Host ""
    Write-Host "[3/6] Compiling TeamsShifts.exe launcher..." -ForegroundColor Yellow
    try {
        & $csc /target:winexe /optimize+ /platform:anycpu "/win32icon:$iconPath" "/win32manifest:$manifestPath" /r:System.dll /r:System.Windows.Forms.dll /r:System.Drawing.dll "/out:$standaloneExe" $programCs | Out-Null
        Copy-Item $standaloneExe $launcherExe -Force -ErrorAction SilentlyContinue
        Write-Host "      Compiled TeamsShifts.exe successfully." -ForegroundColor Green
    } catch {
        Write-Host "      Skipping local C# compilation: $_" -ForegroundColor Gray
    }
} else {
    Write-Host ""
    Write-Host "[3/6] Skipping local compilation (GitHub Actions handles release build)." -ForegroundColor Gray
}

# 6. Stage and commit
Write-Host ""
Write-Host "[4/6] Staging source files..." -ForegroundColor Yellow
& $gitExe add .
& $gitExe status -s

Write-Host ""
Write-Host "[5/6] Creating commit and tag $tagVer..." -ForegroundColor Yellow
try {
    & $gitExe commit -m "$Message ($tagVer)" | Out-Null
} catch {
    Write-Host "      (No new changes to commit)" -ForegroundColor Gray
}

# Check if tag already exists, delete if recreating
$existingTag = & $gitExe tag -l $tagVer
if ($existingTag) {
    Write-Host "      Replacing existing local tag $tagVer..." -ForegroundColor Gray
    & $gitExe tag -d $tagVer | Out-Null
}
& $gitExe tag -a "$tagVer" -m "$Message"
Write-Host "      Tagged $tagVer" -ForegroundColor Green

# 7. Push to GitHub
Write-Host ""
Write-Host "[6/6] Pushing to GitHub (branch: main, tag: $tagVer)..." -ForegroundColor Yellow
& $gitExe push origin main
& $gitExe push origin "$tagVer" --force

Write-Host ""
Write-Host "===================================================" -ForegroundColor Green
Write-Host "  [SUCCESS] Successfully pushed to GitHub!" -ForegroundColor Green
Write-Host "===================================================" -ForegroundColor Green
Write-Host ""
Write-Host " GitHub Actions is now automatically:" -ForegroundColor White
Write-Host "   1. Compiling Next.js Standalone build" -ForegroundColor Gray
Write-Host "   2. Compiling TeamsShifts.exe launcher" -ForegroundColor Gray
Write-Host "   3. Generating blank SQLite shifts.db" -ForegroundColor Gray
Write-Host "   4. Packaging TeamsShifts-Standalone.zip" -ForegroundColor Gray
Write-Host "   5. Publishing Release $tagVer" -ForegroundColor Gray
Write-Host ""
Write-Host " View build progress at: " -NoNewline
Write-Host "https://github.com/Doffo-1/Teams-Shifts/actions" -ForegroundColor Cyan
Write-Host " View releases at:       " -NoNewline
Write-Host "https://github.com/Doffo-1/Teams-Shifts/releases" -ForegroundColor Cyan
Write-Host ""

