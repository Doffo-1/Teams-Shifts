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
        private static NotifyIcon trayIcon;
        private static int activePort = 3000;
        private static string appUrl = "";
        private static string appDir = "";
        private static string dataDir = "";
        private static string logFile = "";
        private static Mutex appMutex;
        private static IntPtr jobHandle = IntPtr.Zero;

        [STAThread]
        static void Main()
        {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);

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
            if (!Directory.Exists(dataDir))
            {
                Directory.CreateDirectory(dataDir);
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
                return;
            }

            // Setup Tray Icon
            SetupTrayIcon();

            // Wait for server readiness in background, then open window
            ThreadPool.QueueUserWorkItem(delegate
            {
                if (WaitForServerReady(30000))
                {
                    OpenApplicationWindow();
                    try
                    {
                        Thread.Sleep(3000);
                        HttpWebRequest vReq = (HttpWebRequest)WebRequest.Create(appUrl + "/api/version");
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
                                        if (trayIcon != null)
                                        {
                                            trayIcon.ShowBalloonTip(7000, "Teams Shifts Update Available", "A new update is available! Click here or open the app to download.", ToolTipIcon.Info);
                                        }
                                    }
                                }
                            }
                        }
                    }
                    catch { }
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

            // Cleanup
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
                psi.EnvironmentVariables["DEV_USER_USERNAME"] = "developer";
                psi.EnvironmentVariables["DEV_USER_NAME"] = "Developer";
                psi.EnvironmentVariables["DEV_USER_EMAIL"] = "developer@example.com";

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
            int interval = 250;

            while (elapsed < timeoutMs)
            {
                if (nodeProcess == null || nodeProcess.HasExited)
                {
                    return false;
                }

                try
                {
                    HttpWebRequest request = (HttpWebRequest)WebRequest.Create(appUrl);
                    request.Timeout = 1000;
                    request.Method = "GET";

                    using (HttpWebResponse response = (HttpWebResponse)request.GetResponse())
                    {
                        if (response.StatusCode == HttpStatusCode.OK ||
                            response.StatusCode == HttpStatusCode.Found)
                        {
                            return true;
                        }
                    }
                }
                catch
                {
                    // Server not ready yet
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
                // Check for Microsoft Edge
                string edgePath = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86), @"Microsoft\Edge\Application\msedge.exe");
                if (!File.Exists(edgePath))
                {
                    edgePath = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), @"Microsoft\Edge\Application\msedge.exe");
                }

                if (File.Exists(edgePath))
                {
                    string profileDir = Path.Combine(dataDir, "webview_profile");
                    string edgeArgs = string.Format("--app=\"{0}\" --user-data-dir=\"{1}\" --window-size=1380,880", appUrl, profileDir);
                    Process.Start(edgePath, edgeArgs);
                    return;
                }

                // Check for Google Chrome
                string chromePath = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), @"Google\Chrome\Application\chrome.exe");
                if (!File.Exists(chromePath))
                {
                    chromePath = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86), @"Google\Chrome\Application\chrome.exe");
                }

                if (File.Exists(chromePath))
                {
                    string profileDir = Path.Combine(dataDir, "webview_profile");
                    string chromeArgs = string.Format("--app=\"{0}\" --user-data-dir=\"{1}\" --window-size=1380,880", appUrl, profileDir);
                    Process.Start(chromePath, chromeArgs);
                    return;
                }

                // Fallback to default browser
                Process.Start(appUrl);
            }
            catch (Exception ex)
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

            MenuItem versionItem = new MenuItem("✨ Version 1.0.0 (Check Updates)", (s, e) => OpenApplicationWindow());
            contextMenu.MenuItems.Add(versionItem);
            contextMenu.MenuItems.Add("-");

            MenuItem exitItem = new MenuItem("❌ Exit Teams Shifts", (s, e) =>
            {
                Application.Exit();
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

        private static void Cleanup()
        {
            if (trayIcon != null)
            {
                trayIcon.Visible = false;
                trayIcon.Dispose();
                trayIcon = null;
            }

            if (nodeProcess != null && !nodeProcess.HasExited)
            {
                try
                {
                    nodeProcess.Kill();
                    nodeProcess.WaitForExit(2000);
                }
                catch { }
                nodeProcess = null;
            }

            if (jobHandle != IntPtr.Zero)
            {
                CloseHandle(jobHandle);
                jobHandle = IntPtr.Zero;
            }

            if (appMutex != null)
            {
                appMutex.ReleaseMutex();
                appMutex.Dispose();
                appMutex = null;
            }
        }

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
                info.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;

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
