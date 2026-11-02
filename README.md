# 📅 Teams Shifts (Standalone Desktop Edition)

[![Platform: Windows](https://img.shields.io/badge/Platform-Windows_10%2B-blue?logo=windows)](https://microsoft.com/windows)
[![Admin: None](https://img.shields.io/badge/Admin_Rights-Not_Required-brightgreen)](https://microsoft.com)
[![Runtime: Node.js](https://img.shields.io/badge/Runtime-Node.js_Bundled-green?logo=node.js)](https://nodejs.org)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![CI/CD: GitHub Actions](https://img.shields.io/badge/CI%2FCD-Automated_Release-purple?logo=githubactions)](.github/workflows/release.yml)

An intelligent, multi-team shift scheduler and Microsoft Teams Shifts export/import platform packaged as a standalone desktop application for Windows with in-app version control and automated GitHub release pipelines.

---

## 🚀 Quick Start

### Option 1: Windows Installer (Setup.exe - Recommended)
1. Download **`TeamsShifts-Setup.exe`** from [GitHub Releases](https://github.com/Doffo-1/Teams-Shifts/releases) or the `dist/` directory.
2. Run the setup wizard to install into **`C:\Program Files\Teams Shifts`**.
3. Launch from your Start Menu or Desktop shortcut.

### Option 2: Portable ZIP Archive
1. Download `TeamsShifts-Standalone.zip` from [GitHub Releases](https://github.com/Doffo-1/Teams-Shifts/releases).
2. Extract anywhere (Desktop, Documents, or local SSD).
3. Double-click **`TeamsShifts.exe`**.

### Option 3: Run directly from `standalone-app` folder
1. Open the [`standalone-app`](standalone-app) folder.
2. Double-click **`TeamsShifts.exe`**.

---

## ✨ Features

- **No Administrator Required**: Standard Windows executable requiring zero elevation or UAC prompts.
- **Embedded Portable Runtime**: Includes its own isolated Node.js engine and pre-configured SQLite database.
- **Frameless App Mode**: Automatically launches a native-feel desktop window via Microsoft Edge or Google Chrome Chromium App Mode (`--app=http://127.0.0.1:<port>`).
- **System Tray Integration**: Operates quietly from the Windows System Tray with menu shortcuts to reopen the window, open in your default browser, access data files, view logs, check for updates, or exit cleanly.
- **In-App Version Control & Update Notifications**:
  - Live version pill (`v1.0.0`) in the header with connection status dot.
  - Automatic update check against GitHub Releases on launch and every 5 minutes.
  - Desktop balloon notification and in-app glassmorphic banner when a newer version is released.
  - Interactive "Version Control & Updates" modal with release notes, changelog, and one-click download.
- **Zero Teams on First Startup**: Starts with a clean, empty state so you can define your first team or import an existing Excel schedule.
- **Multi-Team Architecture**: Create and isolate multiple independent teams with their own rules, members, and shift configurations.
- **Configurable Rules Engine**:
  - Weekly office day and late shift limits.
  - Daily attendance percentage targets (e.g. 100% office presence on Thursdays, 50% on others).
  - Priority day scheduling to optimize office capacity without understaffing.
  - Per-member constraints (Flexible, Home Only, Office Only, fixed weekly days off).
- **Microsoft Teams Shifts Import & Export**:
  - One-click export to official Microsoft Teams Shifts `.xlsx` templates (preserves green/blue/pink shift themes, breaks, and notes).
  - Flexible import supporting both Dutch (*Diensten*) and English (*Shifts*) Excel files.

---

## 🔄 Automated Updates to GitHub

This repository is configured with a fully automated CI/CD pipeline via GitHub Actions ([`.github/workflows/release.yml`](.github/workflows/release.yml)).

### How to Release an Update in 1 Click (`publish.bat`):
Whenever you make updates to the code:
1. Double-click **`publish.bat`**.
2. Enter a description and new version tag (e.g. `1.0.1`).
3. The script automatically stages, commits, tags, and pushes to GitHub.
4. GitHub Actions builds the standalone package in the cloud, compiles `TeamsShifts.exe`, and attaches `TeamsShifts-Standalone.zip` to a new GitHub Release.
5. All users running the desktop app will receive the update notification!

---

## 📁 Data Storage & Backups

All application data, teams, employee constraints, and generated schedules are stored in a single SQLite database file:

```text
data\shifts.db
```

- **Backing up**: To back up your data, simply copy `data\shifts.db` to a safe location.
- **Restoring**: Replace `data\shifts.db` with your backup copy while the app is closed.
- **Logs**: Application server logs are written to `data\server.log`.

---

## 🛠️ Console / Debug Mode

If you need to view raw server logs or run in a headless environment, run **`run-console.bat`** instead of `TeamsShifts.exe`.

---

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
