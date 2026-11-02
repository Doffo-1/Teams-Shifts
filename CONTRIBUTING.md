# Contributing to Teams Shifts

Thank you for your interest in contributing to Teams Shifts!

## Development Setup

1. **Prerequisites**:
   - [Node.js](https://nodejs.org) v20+
   - [pnpm](https://pnpm.io) v9+
   - Windows 10/11 with .NET Framework 4.5+ (for launcher compilation)
   - [Inno Setup 6](https://jrsoftware.org/isdl.php) (optional, for installer builds)

2. **Install Dependencies**:
   ```powershell
   pnpm install
   pnpm exec prisma generate
   ```

3. **Run Development Server**:
   ```powershell
   pnpm run dev
   ```
   Open [http://localhost:3000](http://localhost:3000) in your browser.

4. **Run Type Checking & Build**:
   ```powershell
   pnpm exec tsc --noEmit
   pnpm run build
   ```

## Creating a Release

To release a new version:
```powershell
.\push-release.ps1 -Version "1.0.1" -Message "Added feature XYZ"
```
Or simply double-click `publish.bat`.
GitHub Actions will automatically build the standalone package, compile the installer, and publish the release.
