using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Windows.Forms;

namespace TeamsShiftsLauncher
{
    static class Program
    {
        private static Process nodeProcess;
        private static Process browserProcess;
        private static NotifyIcon trayIcon;
        private static int activePort = 3000;
        private static string appUrl = "";
        private static string appDir = "";
        private static string dataDir = "";
        private static string logFile = "";
        private static Mutex appMutex;
        private static IntPtr jobHandle = IntPtr.Zero;
        private static readonly object cleanupLock = new object();
        private static bool isCleanedUp = false;
        private static bool exitOnWindowClose = true;

        [STAThread]
        static void Main()
        {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);

            // Disable proxy resolution on loopback requests for maximum speed
            try
            {
                WebRequest.DefaultWebProxy = null;
            }
            catch { }

            // Register global exit handlers to guarantee Cleanup() always runs
            Application.ApplicationExit += delegate { Cleanup(); };
            AppDomain.CurrentDomain.ProcessExit += delegate { Cleanup(); };
            Microsoft.Win32.SystemEvents.SessionEnding += delegate { Cleanup(); };

            bool isNewInstance;
            appMutex = new Mutex(true, "TeamsShifts_SingleInstance_Mutex", out isNewInstance);
            if (!isNewInstance)
            {
                MessageBox.Show(
                    "Teams Shifts Generator is already running.\nCheck your system tray or open http://localhost:3000 in your browser.",
                    "Teams Shifts",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Information);
                return;
            }

            appDir = AppDomain.CurrentDomain.BaseDirectory.TrimEnd('\\', '/');
            dataDir = Path.Combine(appDir, "data");

            // Test if dataDir in appDir is writable (in Program Files without elevation it might be protected)
            bool canWriteToAppDir = false;
            try
            {
                if (!Directory.Exists(dataDir))
                {
                    Directory.CreateDirectory(dataDir);
                }
                string testFile = Path.Combine(dataDir, ".write_test_" + Guid.NewGuid().ToString("N"));
                File.WriteAllText(testFile, "ok");
                File.Delete(testFile);
                canWriteToAppDir = true;
            }
            catch { }

            // If installed in Program Files and appDir is not writable, fallback to LocalAppData
            if (!canWriteToAppDir)
            {
                try
                {
                    string localAppData = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
                    string userDir = Path.Combine(localAppData, "TeamsShifts", "data");
                    if (!Directory.Exists(userDir))
                    {
                        Directory.CreateDirectory(userDir);
                    }

                    // Copy template database if user database does not exist yet
                    string templateDb = Path.Combine(dataDir, "shifts.db");
                    string userDb = Path.Combine(userDir, "shifts.db");
                    if (File.Exists(templateDb) && !File.Exists(userDb))
                    {
                        try { File.Copy(templateDb, userDb, false); } catch { }
                    }

                    dataDir = userDir;
                }
                catch { }
            }

            logFile = Path.Combine(dataDir, "server.log");

            // Setup Job Object to auto-terminate child node process when launcher exits
            SetupJobObject();

            // Find an open port
            activePort = FindFreeTcpPort(3000, 3050);
            appUrl = "http://127.0.0.1:" + activePort;

            // Start background Node server
            if (!StartNodeServer())
            {
                Cleanup();
                return;
            }

            // Setup Tray Icon
            SetupTrayIcon();

            // Instant Window Launch: open browser immediately on double-click
            OpenApplicationWindow();

            // Background worker to monitor server readiness and check for updates
            ThreadPool.QueueUserWorkItem(delegate
            {
                if (WaitForServerReady(30000))
                {
                    // Background updater: checks on startup and continuously every 2 minutes
                    bool balloonShown = false;
                    while (!isCleanedUp)
                    {
                        try
                        {
                            HttpWebRequest vReq = (HttpWebRequest)WebRequest.Create(appUrl + "/api/version?t=" + DateTime.UtcNow.Ticks);
                            vReq.Proxy = null;
                            vReq.Timeout = 5000;
                            using (HttpWebResponse vResp = (HttpWebResponse)vReq.GetResponse())
                            {
                                if (vResp.StatusCode == HttpStatusCode.OK)
                                {
                                    using (StreamReader reader = new StreamReader(vResp.GetResponseStream()))
                                    {
                                        string json = reader.ReadToEnd();
                                        if (json.Contains("\"hasUpdate\":true") || json.Contains("\"hasUpdate\": true"))
                                        {
                                            if (trayIcon != null && !balloonShown)
                                            {
                                                balloonShown = true;
                                                trayIcon.ShowBalloonTip(7000, "Teams Shifts Update Available", "A new update is available! Click here or open the app to download.", ToolTipIcon.Info);
                                            }
                                        }
                                    }
                                }
                            }
                        }
                        catch { }

                        // Re-check every 2 minutes while app is running
                        for (int i = 0; i < 120 && !isCleanedUp; i++)
                        {
                            Thread.Sleep(1000);
                        }
                    }
                }
                else
                {
                    MessageBox.Show(
                        "The Teams Shifts server took too long to start.\nPlease check the log file at:\n" + logFile,
                        "Startup Timeout",
                        MessageBoxButtons.OK,
                        MessageBoxIcon.Warning);
                }
            });

            // Run message loop for system tray
            Application.Run();

            // Final cleanup when message loop exits
            Cleanup();
        }

        private static int FindFreeTcpPort(int startPort, int endPort)
        {
            for (int port = startPort; port <= endPort; port++)
            {
                TcpListener listener = null;
                try
                {
                    listener = new TcpListener(IPAddress.Loopback, port);
                    listener.Start();
                    listener.Stop();
                    return port;
                }
                catch
                {
                    // Port in use, try next
                }
            }
            return startPort;
        }

        private static bool StartNodeServer()
        {
            try
            {
                // Resolve node executable
                string nodeExe = Path.Combine(appDir, "runtime", "node.exe");
                if (!File.Exists(nodeExe))
                {
                    nodeExe = Path.Combine(appDir, "node.exe");
                }
                if (!File.Exists(nodeExe))
                {
                    nodeExe = "node.exe"; // Fallback to system PATH
                }

                // Resolve server.js
                string serverJs = Path.Combine(appDir, "app", "server.js");
                if (!File.Exists(serverJs))
                {
                    serverJs = Path.Combine(appDir, "server.js");
                }

                if (!File.Exists(serverJs))
                {
                    MessageBox.Show(
                        "Application server files not found:\n" + serverJs,
                        "Missing Files",
                        MessageBoxButtons.OK,
                        MessageBoxIcon.Error);
                    return false;
                }

                // SQLite database path
                string dbPath = Path.Combine(dataDir, "shifts.db");
                string dbUrl = "file:" + Path.GetFullPath(dbPath).Replace('\\', '/');

                ProcessStartInfo psi = new ProcessStartInfo
                {
                    FileName = nodeExe,
                    Arguments = "\"" + serverJs + "\"",
                    WorkingDirectory = Path.GetDirectoryName(serverJs),
                    UseShellExecute = false,
                    CreateNoWindow = true,
                    WindowStyle = ProcessWindowStyle.Hidden,
                    RedirectStandardOutput = true,
                    RedirectStandardError = true
                };

                // Environment variables
                psi.EnvironmentVariables["PORT"] = activePort.ToString();
                psi.EnvironmentVariables["HOSTNAME"] = "127.0.0.1";
                psi.EnvironmentVariables["DATABASE_URL"] = dbUrl;
                psi.EnvironmentVariables["NODE_ENV"] = "production";
                psi.EnvironmentVariables["NEXT_TELEMETRY_DISABLED"] = "1";
                psi.EnvironmentVariables["TZ"] = "Europe/Amsterdam";
                psi.EnvironmentVariables["NODE_TLS_REJECT_UNAUTHORIZED"] = "0";

                // Detect if running as full installed version or portable edition
                bool isInstalled = File.Exists(Path.Combine(appDir, "unins000.exe")) ||
                                   File.Exists(Path.Combine(appDir, "unins001.exe")) ||
                                   File.Exists(Path.Combine(appDir, "installed.marker"));
                psi.EnvironmentVariables["TEAMS_SHIFTS_EDITION"] = isInstalled ? "installed" : "portable";
                psi.EnvironmentVariables["TEAMS_SHIFTS_APP_DIR"] = appDir;

                nodeProcess = new Process { StartInfo = psi, EnableRaisingEvents = true };

                // Log output to file
                File.WriteAllText(logFile, string.Format("=== Teams Shifts Server Starting on {0} at {1} ===\r\n", appUrl, DateTime.Now));

                nodeProcess.OutputDataReceived += (s, e) =>
                {
                    if (!string.IsNullOrEmpty(e.Data))
                    {
                        try { File.AppendAllText(logFile, "[OUT] " + e.Data + "\r\n"); } catch { }
                    }
                };

                nodeProcess.ErrorDataReceived += (s, e) =>
                {
                    if (!string.IsNullOrEmpty(e.Data))
                    {
                        try { File.AppendAllText(logFile, "[ERR] " + e.Data + "\r\n"); } catch { }
                    }
                };

                nodeProcess.Exited += (s, e) =>
                {
                    try { File.AppendAllText(logFile, string.Format("=== Server Exited at {0} with code {1} ===\r\n", DateTime.Now, nodeProcess.ExitCode)); } catch { }
                    
                    // When server terminates, automatically stop all services and exit application
                    try
                    {
                        ExitApplication();
                    }
                    catch { }
                };

                nodeProcess.Start();
                nodeProcess.BeginOutputReadLine();
                nodeProcess.BeginErrorReadLine();

                // Assign to Job Object
                if (jobHandle != IntPtr.Zero)
                {
                    AssignProcessToJob(jobHandle, nodeProcess.Handle);
                }

                return true;
            }
            catch (Exception ex)
            {
                MessageBox.Show(
                    "Failed to start backend server:\n" + ex.Message,
                    "Startup Error",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Error);
                return false;
            }
        }

        private static bool WaitForServerReady(int timeoutMs)
        {
            int elapsed = 0;
            int interval = 50;

            while (elapsed < timeoutMs)
            {
                if (nodeProcess == null || nodeProcess.HasExited)
                {
                    return false;
                }

                // Check TCP port binding directly for sub-millisecond detection
                try
                {
                    using (TcpClient tcp = new TcpClient())
                    {
                        IAsyncResult ar = tcp.BeginConnect("127.0.0.1", activePort, null, null);
                        if (ar.AsyncWaitHandle.WaitOne(100, false))
                        {
                            tcp.EndConnect(ar);
                            if (tcp.Connected)
                            {
                                // Port is accepting connections! Kick off warmup request in background
                                try
                                {
                                    HttpWebRequest warmup = (HttpWebRequest)WebRequest.Create(appUrl);
                                    warmup.Proxy = null;
                                    warmup.Timeout = 1000;
                                    warmup.BeginGetResponse(null, null);
                                }
                                catch { }
                                return true;
                            }
                        }
                    }
                }
                catch
                {
                    // Port not ready yet
                }

                Thread.Sleep(interval);
                elapsed += interval;
            }

            return false;
        }

        private static void OpenApplicationWindow()
        {
            try
            {
                string browserExe = null;

                // 1. Check for Google Chrome
                string chromePath = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), @"Google\Chrome\Application\chrome.exe");
                if (!File.Exists(chromePath))
                {
                    chromePath = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86), @"Google\Chrome\Application\chrome.exe");
                }
                if (File.Exists(chromePath))
                {
                    browserExe = chromePath;
                }

                // 2. Check for Microsoft Edge
                if (browserExe == null)
                {
                    string edgePath = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86), @"Microsoft\Edge\Application\msedge.exe");
                    if (!File.Exists(edgePath))
                    {
                        edgePath = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), @"Microsoft\Edge\Application\msedge.exe");
                    }
                    if (!File.Exists(edgePath))
                    {
                        string edgeCoreBase = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86), @"Microsoft\EdgeCore");
                        if (Directory.Exists(edgeCoreBase))
                        {
                            string[] files = Directory.GetFiles(edgeCoreBase, "msedge.exe", SearchOption.AllDirectories);
                            if (files.Length > 0) edgePath = files[0];
                        }
                    }
                    if (File.Exists(edgePath))
                    {
                        browserExe = edgePath;
                    }
                }

                // Determine target URL: loading.html if server is still starting, or appUrl directly if ready
                string targetLaunchUrl = appUrl;
                string loadingHtmlPath = Path.Combine(appDir, "loading.html");
                if (File.Exists(loadingHtmlPath) && !WaitForServerReady(30))
                {
                    targetLaunchUrl = "file:///" + loadingHtmlPath.Replace('\\', '/') + "?url=" + Uri.EscapeDataString(appUrl);
                }

                // If app browser is found, run in dedicated standalone app-window mode
                if (browserExe != null)
                {
                    // Use fast local SSD directory (%LOCALAPPDATA%) instead of network SMB share
                    string localAppData = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
                    string profileDir = Path.Combine(localAppData, "TeamsShifts", "profile");
                    if (!Directory.Exists(profileDir))
                    {
                        try { Directory.CreateDirectory(profileDir); } catch { }
                    }

                    // Optimized flags to eliminate background checks and launch instantaneously
                    string browserArgs = string.Format(
                        "--app=\"{0}\" --user-data-dir=\"{1}\" --window-size=1380,880 " +
                        "--no-first-run --no-default-browser-check --disable-background-networking " +
                        "--disable-background-mode --no-service-autorun " +
                        "--disable-sync --disable-translate --disable-extensions --disable-component-update " +
                        "--disable-default-apps --disable-features=Translate,OptimizationHints,MediaRouter,StartupBoost --allow-file-access-from-files",
                        targetLaunchUrl, profileDir);

                    ProcessStartInfo bPsi = new ProcessStartInfo
                    {
                        FileName = browserExe,
                        Arguments = browserArgs,
                        UseShellExecute = false
                    };

                    browserProcess = Process.Start(bPsi);
                    if (browserProcess != null)
                    {
                        browserProcess.EnableRaisingEvents = true;
                        browserProcess.Exited += delegate
                        {
                            if (exitOnWindowClose)
                            {
                                HandleBrowserExit();
                            }
                        };

                        // Additional watchdog thread to guarantee exit when window closes
                        ThreadPool.QueueUserWorkItem(delegate
                        {
                            try
                            {
                                browserProcess.WaitForExit();
                            }
                            catch { }
                            if (exitOnWindowClose)
                            {
                                HandleBrowserExit();
                            }
                        });
                    }
                    return;
                }

                // Fallback to default browser
                Process.Start(targetLaunchUrl);
            }
            catch (Exception)
            {
                try { Process.Start(appUrl); } catch { }
            }
        }

        private static void SetupTrayIcon()
        {
            ContextMenu contextMenu = new ContextMenu();

            MenuItem headerItem = new MenuItem(string.Format("📅 Teams Shifts ({0})", activePort));
            headerItem.Enabled = false;
            contextMenu.MenuItems.Add(headerItem);
            contextMenu.MenuItems.Add("-");

            MenuItem openItem = new MenuItem("🚀 Open Teams Shifts", (s, e) => OpenApplicationWindow());
            openItem.DefaultItem = true;
            contextMenu.MenuItems.Add(openItem);

            MenuItem browserItem = new MenuItem("🌐 Open in Default Browser", (s, e) =>
            {
                try { Process.Start(appUrl); } catch { }
            });
            contextMenu.MenuItems.Add(browserItem);

            contextMenu.MenuItems.Add("-");

            MenuItem autoExitItem = new MenuItem("⚡ Stop services on window close", (s, e) =>
            {
                MenuItem item = (MenuItem)s;
                exitOnWindowClose = !exitOnWindowClose;
                item.Checked = exitOnWindowClose;
            });
            autoExitItem.Checked = exitOnWindowClose;
            contextMenu.MenuItems.Add(autoExitItem);

            contextMenu.MenuItems.Add("-");

            MenuItem dataFolderItem = new MenuItem("📁 Open Data Folder", (s, e) =>
            {
                try { Process.Start("explorer.exe", dataDir); } catch { }
            });
            contextMenu.MenuItems.Add(dataFolderItem);

            MenuItem logItem = new MenuItem("📜 View Server Logs", (s, e) =>
            {
                try
                {
                    if (!File.Exists(logFile)) { File.WriteAllText(logFile, ""); }
                    Process.Start("notepad.exe", logFile);
                }
                catch { }
            });
            contextMenu.MenuItems.Add(logItem);

            contextMenu.MenuItems.Add("-");

            string appVer = "1.0.0";
            try
            {
                Version v = System.Reflection.Assembly.GetExecutingAssembly().GetName().Version;
                if (v != null)
                {
                    appVer = v.Major + "." + v.Minor + "." + Math.Max(0, v.Build);
                }
            }
            catch { }
            MenuItem versionItem = new MenuItem("✨ Version " + appVer + " (Check Updates)", (s, e) => OpenApplicationWindow());
            contextMenu.MenuItems.Add(versionItem);
            contextMenu.MenuItems.Add("-");

            MenuItem exitItem = new MenuItem("❌ Stop All Services & Exit", (s, e) =>
            {
                ExitApplication();
            });
            contextMenu.MenuItems.Add(exitItem);

            // Tray icon
            Icon icon = null;
            string iconPath = Path.Combine(appDir, "app.ico");
            if (File.Exists(iconPath))
            {
                try { icon = new Icon(iconPath); } catch { }
            }
            if (icon == null)
            {
                icon = SystemIcons.Application;
            }

            trayIcon = new NotifyIcon
            {
                Icon = icon,
                ContextMenu = contextMenu,
                Text = "Teams Shifts Generator (" + appUrl + ")",
                Visible = true
            };

            trayIcon.DoubleClick += (s, e) => OpenApplicationWindow();
            trayIcon.BalloonTipClicked += (s, e) => OpenApplicationWindow();
        }

                private static void ExitApplication()
        {
            try
            {
                Cleanup();
            }
            catch { }
            try
            {
                Application.ExitThread();
            }
            catch { }
            Environment.Exit(0);
        }

        private static void Cleanup()
        {
            lock (cleanupLock)
            {
                if (isCleanedUp) return;
                isCleanedUp = true;

                // 1. Remove tray icon immediately
                if (trayIcon != null)
                {
                    try
                    {
                        trayIcon.Visible = false;
                        trayIcon.Dispose();
                    }
                    catch { }
                    trayIcon = null;
                }

                // 2. Terminate the browser app window if still open
                if (browserProcess != null)
                {
                    try
                    {
                        if (!browserProcess.HasExited)
                        {
                            browserProcess.CloseMainWindow();
                            if (!browserProcess.WaitForExit(1000))
                            {
                                SafeKillProcess(browserProcess);
                            }
                        }
                    }
                    catch { }
                    browserProcess = null;
                }

                // Terminate any remaining browser processes running with our profile directory
                KillAppBrowserProcesses();

                // 3. Terminate the background Node server
                if (nodeProcess != null)
                {
                    SafeKillProcess(nodeProcess);
                    nodeProcess = null;
                }

                // 4. Terminate any lingering node.exe instances running under this app directory
                KillAppNodeProcesses();

                // 6. Close Windows Job Object handle
                if (jobHandle != IntPtr.Zero)
                {
                    try
                    {
                        CloseHandle(jobHandle);
                    }
                    catch { }
                    jobHandle = IntPtr.Zero;
                }

                // 7. Release single instance mutex
                if (appMutex != null)
                {
                    try
                    {
                        appMutex.ReleaseMutex();
                        appMutex.Dispose();
                    }
                    catch { }
                    appMutex = null;
                }
            }
        }

        private static void SafeKillProcess(Process p)
        {
            if (p == null) return;
            try
            {
                if (!p.HasExited)
                {
                    p.Kill();
                }
            }
            catch { }
        }

        private static void KillAppNodeProcesses()
        {
            try
            {
                string localRuntime = Path.Combine(appDir, "runtime", "node.exe");
                Process[] nodes = Process.GetProcessesByName("node");
                foreach (Process p in nodes)
                {
                    try
                    {
                        bool isOurNode = false;
                        if (nodeProcess != null && p.Id == nodeProcess.Id)
                        {
                            isOurNode = true;
                        }
                        else
                        {
                            try
                            {
                                string mainMod = p.MainModule.FileName;
                                if (!string.IsNullOrEmpty(mainMod) &&
                                    (string.Equals(mainMod, localRuntime, StringComparison.OrdinalIgnoreCase) ||
                                     mainMod.StartsWith(appDir, StringComparison.OrdinalIgnoreCase)))
                                {
                                    isOurNode = true;
                                }
                            }
                            catch { }
                        }

                        if (isOurNode)
                        {
                            SafeKillProcess(p);
                        }
                    }
                    catch { }
                }
            }
            catch { }
        }

        private static void KillAppBrowserProcesses()
        {
            try
            {
                ProcessStartInfo psi = new ProcessStartInfo
                {
                    FileName = "powershell.exe",
                    Arguments = "-NoProfile -ExecutionPolicy Bypass -Command \"Get-CimInstance Win32_Process -Filter 'Name = ''msedge.exe'' or Name = ''chrome.exe''' -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -like '*TeamsShifts*profile*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }\"",
                    CreateNoWindow = true,
                    WindowStyle = ProcessWindowStyle.Hidden,
                    UseShellExecute = false
                };
                using (Process p = Process.Start(psi))
                {
                    if (p != null) p.WaitForExit(3000);
                }
            }
            catch { }
        }

        #region Windows Window Detection Interop
        [DllImport("user32.dll", SetLastError = true)]
        static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);
        delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

        [DllImport("user32.dll", CharSet = CharSet.Auto, SetLastError = true)]
        static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);

        [DllImport("user32.dll")]
        [return: MarshalAs(UnmanagedType.Bool)]
        static extern bool IsWindowVisible(IntPtr hWnd);

        private static bool HasActiveAppWindows()
        {
            bool found = false;
            try
            {
                EnumWindows(delegate(IntPtr hWnd, IntPtr lParam)
                {
                    try
                    {
                        if (IsWindowVisible(hWnd))
                        {
                            StringBuilder sb = new StringBuilder(256);
                            GetWindowText(hWnd, sb, 256);
                            string title = sb.ToString();
                            if (!string.IsNullOrEmpty(title) && title.IndexOf("Teams Shifts", StringComparison.OrdinalIgnoreCase) >= 0)
                            {
                                found = true;
                                return false; // Stop enumeration
                            }
                        }
                    }
                    catch { }
                    return true;
                }, IntPtr.Zero);
            }
            catch { }
            return found;
        }

        private static void HandleBrowserExit()
        {
            try
            {
                string localAppData = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
                string flagFile = Path.Combine(localAppData, "TeamsShifts", "updates", ".updating");
                if (File.Exists(flagFile))
                {
                    Thread.Sleep(3000);
                    try { File.Delete(flagFile); } catch { }
                    ExitApplication();
                    return;
                }
            }
            catch { }

            Thread.Sleep(1500);

            // While any Teams Shifts window is still open (e.g. popout Version window), wait
            while (HasActiveAppWindows())
            {
                Thread.Sleep(1500);
            }

            if (exitOnWindowClose)
            {
                ExitApplication();
            }
        }
        #endregion

        #region Windows Job Object Interop
        [DllImport("kernel32.dll", CharSet = CharSet.Unicode)]
        static extern IntPtr CreateJobObject(IntPtr lpJobAttributes, string lpName);

        [DllImport("kernel32.dll")]
        static extern bool SetInformationJobObject(IntPtr hJob, int JobObjectInfoClass, IntPtr lpJobObjectInfo, uint cbJobObjectInfoLength);

        [DllImport("kernel32.dll", SetLastError = true)]
        static extern bool AssignProcessToJobObject(IntPtr hJob, IntPtr hProcess);

        [DllImport("kernel32.dll", SetLastError = true)]
        [return: MarshalAs(UnmanagedType.Bool)]
        static extern bool CloseHandle(IntPtr hObject);

        private const int JobObjectExtendedLimitInformation = 9;
        private const uint JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE = 0x2000;
        private const uint JOB_OBJECT_LIMIT_BREAKAWAY_OK = 0x0800;

        [StructLayout(LayoutKind.Sequential)]
        struct IO_COUNTERS
        {
            public ulong ReadOperationCount;
            public ulong WriteOperationCount;
            public ulong OtherOperationCount;
            public ulong ReadTransferCount;
            public ulong WriteTransferCount;
            public ulong OtherTransferCount;
        }

        [StructLayout(LayoutKind.Sequential)]
        struct JOBOBJECT_BASIC_LIMIT_INFORMATION
        {
            public long PerProcessUserTimeLimit;
            public long PerJobUserTimeLimit;
            public uint LimitFlags;
            public UIntPtr MinimumWorkingSetSize;
            public UIntPtr MaximumWorkingSetSize;
            public uint ActiveProcessLimit;
            public UIntPtr Affinity;
            public uint PriorityClass;
            public uint SchedulingClass;
        }

        [StructLayout(LayoutKind.Sequential)]
        struct JOBOBJECT_EXTENDED_LIMIT_INFORMATION
        {
            public JOBOBJECT_BASIC_LIMIT_INFORMATION BasicLimitInformation;
            public IO_COUNTERS IoInfo;
            public UIntPtr ProcessMemoryLimit;
            public UIntPtr JobMemoryLimit;
            public UIntPtr PeakProcessMemoryLimit;
            public UIntPtr PeakJobMemoryLimit;
        }

        private static void SetupJobObject()
        {
            try
            {
                jobHandle = CreateJobObject(IntPtr.Zero, null);
                var info = new JOBOBJECT_EXTENDED_LIMIT_INFORMATION();
                info.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE | JOB_OBJECT_LIMIT_BREAKAWAY_OK;

                int length = Marshal.SizeOf(typeof(JOBOBJECT_EXTENDED_LIMIT_INFORMATION));
                IntPtr extendedInfoPtr = Marshal.AllocHGlobal(length);
                Marshal.StructureToPtr(info, extendedInfoPtr, false);

                SetInformationJobObject(jobHandle, JobObjectExtendedLimitInformation, extendedInfoPtr, (uint)length);
                Marshal.FreeHGlobal(extendedInfoPtr);
            }
            catch
            {
                jobHandle = IntPtr.Zero;
            }
        }

        private static void AssignProcessToJob(IntPtr job, IntPtr process)
        {
            try
            {
                AssignProcessToJobObject(job, process);
            }
            catch { }
        }
        #endregion
    }
}
