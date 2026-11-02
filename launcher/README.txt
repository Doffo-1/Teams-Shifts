========================================================================
                 📅 TEAMS SHIFTS GENERATOR (STANDALONE)
========================================================================

A fully self-contained desktop edition of the Teams Shifts Generator web
application for Windows.

✨ KEY FEATURES:
----------------
• NO ADMIN REQUIRED: Does not require administrator privileges or UAC elevation.
• 100% SELF-CONTAINED: Includes its own portable Node.js runtime and SQLite database.
  No external installations (Node.js, Git, or dependencies) are needed.
• ZERO CONFIGURATION: Double-click TeamsShifts.exe and it immediately launches.
• NATIVE DESKTOP EXPERIENCE: Opens in dedicated Chromium App Mode window via
  Microsoft Edge / Google Chrome (frameless, no browser URL bar or tabs).
• SYSTEM TRAY INTEGRATION: Runs quietly in the Windows system tray with quick
  shortcuts to reopen the window, open in browser, view logs, or exit.
• SAFE SHUTDOWN: Gracefully stops the background server when you exit the app.

🚀 HOW TO RUN:
--------------
1. Double-click "TeamsShifts.exe" in this folder.
2. The application will start and automatically open the Teams Shifts interface.
3. An icon appears in your Windows System Tray (near the clock). Right-click it
   anytime to access quick settings or click "Exit" to close the app.

📁 DATA & BACKUPS:
------------------
• All your teams, employees, constraints, and shift data are stored in:
    data\shifts.db
• To back up your data, simply copy the "data\shifts.db" file.
• Server logs can be viewed in "data\server.log".

🛠️ TROUBLESHOOTING:
-------------------
• If you want to see detailed console output for debugging, run "run-console.bat".
• If port 3000 is occupied, TeamsShifts.exe automatically finds the next open port.
========================================================================
