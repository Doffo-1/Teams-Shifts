'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import {
  format,
  addWeeks,
  subWeeks,
  startOfWeek,
  addDays,
  isSameDay,
  getISOWeek,
  getWeekOfMonth,
} from 'date-fns';
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  Download,
  Users,
  Plus,
  Minus,
  Search,
  Trash2,
  Wand2,
  X,
  Clock,
  FileText,
  Copy,
  ClipboardCopy,
  ClipboardPaste,
  ClipboardCheck,
  Sliders,
  Upload,
  Settings,
  Building,
  Building2,
  Home as HomeIcon,
  Check,
  Shield,
  Layers,
  ChevronDown,
  UserCheck,
  Briefcase,
  Sparkles,
  Edit2,
  AlertCircle,
  ExternalLink,
  RefreshCw,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  Package,
  HardDrive,
  CalendarCheck,
  CalendarDays,
  Repeat,
  Play,
  RotateCcw,
} from 'lucide-react';


interface TeamRule {
  id: string;
  teamId: string;
  maxOfficeDaysPerWeek: number;
  maxLateShiftsPerWeek: number;
  priorityDayOfWeek: number;
  dailyOfficeTargets: string;
  minOfficeEarlyPerDay: number;
  minLatePerDay: number;
  workingDays: string;
  autoBalanceShiftTypes?: boolean;
  autoBalanceLocations?: boolean;
}

interface ShiftTypeConfig {
  id: string;
  teamId: string;
  code: string;
  label: string;
  defaultStart: string;
  defaultEnd: string;
  themeColor: string;
  isSystem: boolean;
}

interface Team {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  exportGroupName: string;
  breakMinutes: number;
  groups?: string | null;
  rule?: TeamRule | null;
  shiftTypes?: ShiftTypeConfig[];
  _count?: { employees: number };
}

interface Employee {
  id: string;
  name: string;
  email: string;
  group: string;
  teamId?: string | null;
  isActive: boolean;
  allowedLocation: string; // 'ANY' | 'HOME_ONLY' | 'OFFICE_ONLY'
  fixedOffDays: string;    // JSON array of day numbers: e.g. [5] for Friday
  fixedDaySchedule?: string; // JSON map of day numbers to fixed schedule config
  breakMinutes?: number | null; // Custom break minutes override (null = use team default)
  maxOfficeDays?: number | null;
  maxLateShifts?: number | null;
  autoSchedule: boolean;
  preferredShift: string;  // 'ANY' | 'EARLY' | 'LATE'
}

interface Shift {
  id: string;
  employeeId: string;
  date: string;
  type: string;
  location: string;
  isManual: boolean;
  customStart?: string | null;
  customEnd?: string | null;
  notes?: string | null;
  color?: string | null;
}

interface ClientData {
  id: string;
  teamId: string;
  name: string;
  color?: string | null;
  location?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  frequency: 'EVERY_WEEK' | 'EVERY_OTHER_WEEK' | 'EVERY_MONTH';
  weekParity?: 'ALL' | 'EVEN' | 'ODD' | null;
  monthlyWeek?: number | null;
  days: number[];
  assignedEmployeeIds: string[];
  memberDayMap?: Record<string, any> | null;
  requiredMembersPerDay?: number;
  dailyRequirements?: Record<string, number> | string | null;
  notes?: string | null;
  isActive?: boolean;
}

export default function Home() {
  const [mounted, setMounted] = useState(false);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [teams, setTeams] = useState<Team[]>([]);
  const [selectedTeamId, setSelectedTeamId] = useState<string>('');
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [loading, setLoading] = useState(true);

  // Clients state
  const [teamClients, setTeamClients] = useState<ClientData[]>([]);
  const [clientDropdownOpen, setClientDropdownOpen] = useState(false);
  const [clientModalOpen, setClientModalOpen] = useState(false);
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [clientForm, setClientForm] = useState<{
    id?: string;
    name: string;
    color: string;
    location: string;
    startTime: string;
    endTime: string;
    frequency: 'EVERY_WEEK' | 'EVERY_OTHER_WEEK' | 'EVERY_MONTH';
    weekParity: 'ALL' | 'EVEN' | 'ODD';
    monthlyWeek: number;
    days: number[];
    assignedEmployeeIds: string[];
    memberDayMap: Record<string, any>;
    requiredMembersPerDay: number;
    dailyRequirements: Record<number, number>;
    notes: string;
    isActive: boolean;
  }>({
    name: '',
    color: 'PINK',
    location: '',
    startTime: '08:30',
    endTime: '17:00',
    frequency: 'EVERY_OTHER_WEEK',
    weekParity: 'ODD',
    monthlyWeek: 1,
    days: [1, 2, 3, 4, 5],
    assignedEmployeeIds: [],
    memberDayMap: {},
    requiredMembersPerDay: 1,
    dailyRequirements: { 1: 1, 2: 1, 3: 1, 4: 1, 5: 1 },
    notes: '',
    isActive: true,
  });
  const [clientMemberSearch, setClientMemberSearch] = useState('');
  const [applyingClient, setApplyingClient] = useState(false);

  useEffect(() => {
    console.log('[TeamsShifts] useEffect mount running on client!');
    setMounted(true);
  }, []);

  // Dropdowns & Modals
  const [teamDropdownOpen, setTeamDropdownOpen] = useState(false);
  const [teamSettingsModalOpen, setTeamSettingsModalOpen] = useState(false);
  const [newTeamModalOpen, setNewTeamModalOpen] = useState(false);
  const [rulesModalOpen, setRulesModalOpen] = useState(false);
  const [rulesTab, setRulesTab] = useState<'team' | 'members' | 'shifts' | 'groups'>('team');
  const [copyModalOpen, setCopyModalOpen] = useState(false);
  const [memberEditModalOpen, setMemberEditModalOpen] = useState<Employee | null>(null);

  // Shift Modal State
  const [selectedShift, setSelectedShift] = useState<{
    empId: string;
    date: Date;
    shift: Shift | undefined;
  } | null>(null);

  const [modalData, setModalData] = useState<{
    type: string;
    location: string;
    customStart: string;
    customEnd: string;
    notes: string;
    color: string;
    endDate: string;
  }>({
    type: 'EARLY',
    location: 'OFFICE',
    customStart: '',
    customEnd: '',
    notes: '',
    color: 'PINK',
    endDate: '',
  });

  // Shift copy/paste buffer & multi-assign
  const [copiedShiftData, setCopiedShiftData] = useState<typeof modalData | null>(null);
  const [copyToEmpIds, setCopyToEmpIds] = useState<string[]>([]);

  // Schedule Copy Modal State
  const [copyType, setCopyType] = useState<'WEEK' | 'DAY'>('WEEK');
  const [copySourceDate, setCopySourceDate] = useState('');
  const [copyTargetDate, setCopyTargetDate] = useState('');
  const [copying, setCopying] = useState(false);

  // Week Clipboard Buffer State
  interface WeekBuffer {
    sourceStart: string;
    count: number;
    teamId?: string;
  }
  const [copiedWeekBuffer, setCopiedWeekBuffer] = useState<WeekBuffer | null>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('teams_shifts_copied_week');
        if (saved) return JSON.parse(saved);
      } catch {}
    }
    return null;
  });

  // Calendar Picker State in Copy Modal
  const [calendarViewYear, setCalendarViewYear] = useState<number>(new Date().getFullYear());
  const [calendarViewMonth, setCalendarViewMonth] = useState<number>(new Date().getMonth());
  const [targetWeekDate, setTargetWeekDate] = useState<Date>(() => addWeeks(startOfWeek(new Date(), { weekStartsOn: 1 }), 1));
  const [jumpAfterCopy, setJumpAfterCopy] = useState<boolean>(true);

  // Inline member creation state
  const [addingMemberGroup, setAddingMemberGroup] = useState<string | null>(null);
  const [newEmpName, setNewEmpName] = useState('');
  const [newEmpEmail, setNewEmpEmail] = useState('');

  // Version Control & Update Notification State
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
    isInstalled?: boolean;
    edition?: 'installed' | 'portable';
  }
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [versionModalOpen, setVersionModalOpen] = useState(false);
  const [dismissedUpdate, setDismissedUpdate] = useState(false);
  const [customRepo, setCustomRepo] = useState('');
  const [versionTab, setVersionTab] = useState<'overview' | 'changelog' | 'diagnostics'>('overview');

  const checkForUpdates = async (repoOverride?: string) => {
    setCheckingUpdate(true);
    try {
      const ts = Date.now();
      const url = repoOverride
        ? `/api/version?repo=${encodeURIComponent(repoOverride)}&t=${ts}`
        : `/api/version?t=${ts}`;
      const res = await fetch(url, {
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache, no-store' },
      });
      if (res.ok) {
        const data = await res.json();
        setUpdateInfo(data);
        if (data.repo && !customRepo) {
          setCustomRepo(data.repo);
        }
      }
    } catch (err) {
      console.error('Failed to check for updates:', err);
    } finally {
      setCheckingUpdate(false);
    }
  };

  useEffect(() => {
    // 1. Initial check shortly after load
    const timer = setTimeout(() => {
      checkForUpdates();
    }, 1500);

    // 2. Periodic background check every 60 seconds so new updates appear automatically without refresh
    const interval = setInterval(() => {
      checkForUpdates();
    }, 60000);

    // 3. Instant check when window regains focus (switching back from another window/browser)
    const handleFocus = () => {
      checkForUpdates();
    };
    window.addEventListener('focus', handleFocus);

    return () => {
      clearTimeout(timer);
      clearInterval(interval);
      window.removeEventListener('focus', handleFocus);
    };
  }, []);

  interface DownloadProgress {
    status: 'idle' | 'downloading' | 'completed' | 'error';
    progress: number;
    downloadedBytes: number;
    totalBytes: number;
    downloadedFormatted?: string;
    totalFormatted?: string;
    speed: string;
    fileName: string;
    version: string;
    filePath: string;
    assetType: 'installer' | 'portable';
    error: string | null;
  }

  interface ApplyLog {
    time: string;
    text: string;
    type?: 'info' | 'success' | 'warn' | 'error';
  }

  interface ApplyState {
    status: 'idle' | 'preparing' | 'extracting' | 'verifying' | 'staging' | 'restarting' | 'error';
    step: number;
    totalSteps: number;
    progress: number;
    message: string;
    detail: string;
    logs: ApplyLog[];
    error: string | null;
    targetFile?: string;
    assetType?: 'installer' | 'portable';
  }

  const [downloadProgress, setDownloadProgress] = useState<DownloadProgress | null>(null);
  const [applyState, setApplyState] = useState<ApplyState | null>(null);
  const [isUpdatingModal, setIsUpdatingModal] = useState(false);
  const [selectedModalAssetType, setSelectedModalAssetType] = useState<'installer'>('installer');
  const [localModalLogs, setLocalModalLogs] = useState<ApplyLog[]>([]);
  const modalTerminalRef = useRef<HTMLDivElement>(null);
  const [exporting, setExporting] = useState(false);

  const addModalLog = (text: string, type: 'info' | 'success' | 'warn' | 'error' = 'info') => {
    const time = new Date().toTimeString().split(' ')[0];
    setLocalModalLogs(prev => [...prev.slice(-30), { time, text, type }]);
  };

  const pollDownloadStatus = async (): Promise<DownloadProgress | null> => {
    try {
      const res = await fetch('/api/version/download');
      if (res.ok) {
        const data: DownloadProgress = await res.json();
        setDownloadProgress(data);
        return data;
      }
    } catch {}
    return null;
  };

  const pollApplyStatus = async (): Promise<ApplyState | null> => {
    try {
      const res = await fetch('/api/version/apply');
      if (res.ok) {
        const data: ApplyState = await res.json();
        setApplyState(data);
        return data;
      }
    } catch {}
    return null;
  };

  const startInAppDownload = async (assetType: 'installer' = 'installer') => {
    setSelectedModalAssetType('installer');
    setIsUpdatingModal(true);
    addModalLog('Starting download of TeamsShifts-Setup.exe...', 'info');
    try {
      const res = await fetch('/api/version/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          assetType: 'installer',
          version: updateInfo?.latestVersion || 'latest',
          downloadUrl: updateInfo?.downloadUrl,
          repo: customRepo || updateInfo?.repo,
        }),
      });
      if (res.ok) {
        setDownloadProgress({
          status: 'downloading',
          progress: 0,
          downloadedBytes: 0,
          totalBytes: 0,
          speed: 'Starting...',
          fileName: 'TeamsShifts-Setup.exe',
          version: updateInfo?.latestVersion || '',
          filePath: '',
          assetType: 'installer',
          error: null,
        });
      }
    } catch (err) {
      console.error('Failed to start in-app download:', err);
      addModalLog('Failed to start download stream', 'error');
    }
  };

  const cancelModalUpdate = async () => {
    try {
      await fetch('/api/version/download', { method: 'DELETE' });
      await fetch('/api/version/apply', { method: 'DELETE' });
      setDownloadProgress(null);
      setApplyState(null);
      setIsUpdatingModal(false);
      addModalLog('Update cancelled by user', 'warn');
    } catch (err) {
      console.error('Failed to cancel update:', err);
    }
  };

  const applyUpdate = async (assetType: 'installer' | 'portable' = 'installer') => {
    setIsUpdatingModal(true);
    addModalLog('Initializing zero-shell silent updater...', 'info');
    try {
      const res = await fetch('/api/version/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          assetType: 'installer',
          filePath: downloadProgress?.filePath,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        addModalLog(`Update error: ${data.error || 'Failed to apply update'}`, 'error');
        showToast(data.error || 'Failed to apply update', 'error');
      } else {
        addModalLog('Update pipeline running in background (zero console window)...', 'success');
      }
    } catch (err: any) {
      addModalLog(`Apply request failed: ${err?.message || err}`, 'error');
      showToast(err?.message || 'Failed to apply update', 'error');
    }
  };

  const triggerOneClickUpdateModal = (assetType: 'installer' | 'portable' = 'installer') => {
    setSelectedModalAssetType('installer');
    setIsUpdatingModal(true);
    if (downloadProgress?.status === 'completed' && downloadProgress?.assetType === 'installer') {
      applyUpdate('installer');
    } else {
      startInAppDownload('installer');
    }
  };

  useEffect(() => {
    if (versionModalOpen) {
      checkForUpdates();
      pollDownloadStatus();
      pollApplyStatus();
    }
  }, [versionModalOpen]);

  // Polling loop while downloading
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (downloadProgress?.status === 'downloading') {
      timer = setInterval(async () => {
        const data = await pollDownloadStatus();
        if (data?.status === 'completed') {
          addModalLog(`Package ${data.fileName} downloaded successfully (${data.totalFormatted}).`, 'success');
          if (isUpdatingModal && (!applyState || applyState.status === 'idle')) {
            applyUpdate(data.assetType);
          }
          clearInterval(timer);
        } else if (data?.status === 'error') {
          addModalLog(`Download error: ${data.error}`, 'error');
          clearInterval(timer);
        }
      }, 500);
    }
    return () => clearInterval(timer);
  }, [downloadProgress?.status, isUpdatingModal, applyState?.status]);

  // Polling loop while applying
  useEffect(() => {
    let timer: NodeJS.Timeout;
    const isApplyingActive =
      applyState &&
      applyState.status !== 'idle' &&
      applyState.status !== 'error';

    if (isApplyingActive || isUpdatingModal) {
      timer = setInterval(async () => {
        const data = await pollApplyStatus();
        if (data?.status === 'restarting') {
          clearInterval(timer);
        } else if (data?.status === 'error') {
          clearInterval(timer);
        }
      }, 400);
    }
    return () => clearInterval(timer);
  }, [applyState?.status, isUpdatingModal]);

  // Auto-scroll modal terminal
  useEffect(() => {
    if (modalTerminalRef.current) {
      modalTerminalRef.current.scrollTop = modalTerminalRef.current.scrollHeight;
    }
  }, [applyState?.logs, localModalLogs]);

  // Master modal update calculations
  const isModalUpdatingActive = Boolean(
    isUpdatingModal ||
    downloadProgress?.status === 'downloading' ||
    (applyState && applyState.status !== 'idle' && applyState.status !== 'error')
  );

  const modalDownloadPct = downloadProgress?.progress || 0;
  let modalMasterProgress = 0;
  let modalStep = 1;
  let modalStepTitle = 'Checking Update Status';
  let modalStepDetail = 'Ready to begin in-app update';

  if (downloadProgress?.status === 'downloading') {
    modalStep = 1;
    modalMasterProgress = Math.round(modalDownloadPct * 0.4);
    modalStepTitle = `Step 1 of 4: Downloading ${downloadProgress.fileName}`;
    modalStepDetail = `${downloadProgress.downloadedFormatted || '0 B'} / ${downloadProgress.totalFormatted || '...'} • ${downloadProgress.speed || 'Downloading...'}`;
  } else if (applyState && applyState.status !== 'idle') {
    if (applyState.status === 'extracting') {
      modalStep = 2;
      modalMasterProgress = 40 + Math.round((applyState.progress / 100) * 25);
      modalStepTitle = 'Step 2 of 4: Unpacking Application Archive';
      modalStepDetail = applyState.detail || 'Extracting binaries and Next.js bundle to temporary staging area';
    } else if (applyState.status === 'verifying') {
      modalStep = 3;
      modalMasterProgress = 65 + Math.round((applyState.progress / 100) * 15);
      modalStepTitle = 'Step 3 of 4: Verifying Application Files';
      modalStepDetail = applyState.detail || 'Checking launcher binaries and securing database (shifts.db)';
    } else if (applyState.status === 'staging') {
      modalStep = 3;
      modalMasterProgress = 80 + Math.round((applyState.progress / 100) * 15);
      modalStepTitle = 'Step 3 of 4: Arming Zero-Shell Silent Runner';
      modalStepDetail = applyState.detail || 'Preparing silent background replacement script';
    } else if (applyState.status === 'restarting') {
      modalStep = 4;
      modalMasterProgress = 100;
      modalStepTitle = 'Step 4 of 4: Restarting Teams Shifts';
      modalStepDetail = 'Application will relaunch automatically in 2-3 seconds with new version';
    } else if (applyState.status === 'error') {
      modalStepTitle = 'Update Failed';
      modalStepDetail = applyState.error || 'An error occurred during update';
    }
  } else if (downloadProgress?.status === 'completed') {
    modalStep = 2;
    modalMasterProgress = 40;
    modalStepTitle = 'Package Downloaded & Verified';
    modalStepDetail = `${downloadProgress.fileName} is ready to be applied.`;
  }

  const combinedModalLogs = [...localModalLogs];
  if (applyState?.logs && applyState.logs.length > 0) {
    applyState.logs.forEach(l => {
      if (!combinedModalLogs.some(existing => existing.text === l.text && existing.time === l.time)) {
        combinedModalLogs.push(l);
      }
    });
  }

  const handleExport = async () => {
    const teamId = selectedTeamId || currentTeam?.id;
    setExporting(true);
    try {
      const res = await fetch(`/api/export?date=${start.toISOString()}&teamId=${teamId || ''}`);
      if (!res.ok) {
        let errMsg = 'Failed to generate Excel export';
        try {
          const errData = await res.json();
          if (errData?.error) errMsg = errData.error;
        } catch {}
        throw new Error(errMsg);
      }
      const blob = await res.blob();
      const disposition = res.headers.get('Content-Disposition') || '';
      let fileName = `shifts_${format(start, 'yyyy-MM-dd')}.xlsx`;
      const match = disposition.match(/filename="?([^";]+)"?/i);
      if (match && match[1]) fileName = match[1];

      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      showToast('Schedule exported successfully!', 'success');
    } catch (err: any) {
      console.error('Export error:', err);
      showToast(`Export failed: ${err.message || 'Unknown error'}`, 'error');
    } finally {
      setExporting(false);
    }
  };

  // Team creation / edit form
  const [teamFormName, setTeamFormName] = useState('');
  const [teamFormExportGroup, setTeamFormExportGroup] = useState('');
  const [teamFormBreak, setTeamFormBreak] = useState(30);
  const [teamFormEarlyStart, setTeamFormEarlyStart] = useState('07:30');
  const [teamFormEarlyEnd, setTeamFormEarlyEnd] = useState('16:00');
  const [teamFormLateStart, setTeamFormLateStart] = useState('09:30');
  const [teamFormLateEnd, setTeamFormLateEnd] = useState('18:00');
  const [applyingFixed, setApplyingFixed] = useState(false);

  // Toast State
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    setToastMessage({ text, type });
    setTimeout(() => setToastMessage(null), 4000);
  };

  const currentTeam = teams.find(t => t.id === selectedTeamId) || teams[0];
  const start = startOfWeek(currentDate, { weekStartsOn: 1 });
  const weekDays = Array.from({ length: 5 }).map((_, i) => addDays(start, i));

  // Dynamic Team Groups
  const teamGroups = useMemo<{ id: string; name: string }[]>(() => {
    let list: { id: string; name: string }[] = [];
    try {
      if (currentTeam?.groups) {
        list = JSON.parse(currentTeam.groups);
      }
    } catch {
      list = [];
    }
    if (!list || list.length === 0) {
      list = [
        { id: 'DEFAULT', name: 'Team Members' },
      ];
    }
    // Also include any groups that employees currently have if not yet listed
    for (const emp of employees) {
      const gId = (emp.group || '').trim();
      if (gId && !list.some(g => g.id.toLowerCase() === gId.toLowerCase())) {
        list.push({
          id: gId,
          name: gId === 'DEFAULT' ? 'Team Members' : gId,
        });
      }
    }
    return list;
  }, [currentTeam?.groups, employees]);

  // Group Management Modals State
  const [newGroupModalOpen, setNewGroupModalOpen] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [renameGroupModalOpen, setRenameGroupModalOpen] = useState<{ id: string; name: string } | null>(null);
  const [renameGroupName, setRenameGroupName] = useState('');
  const [deleteGroupModalOpen, setDeleteGroupModalOpen] = useState<{ id: string; name: string; memberCount: number } | null>(null);
  const [reassignTargetGroup, setReassignTargetGroup] = useState<string>('');
  const [deleteGroupMembersAction, setDeleteGroupMembersAction] = useState<'reassign' | 'delete'>('reassign');
  const [groupLoading, setGroupLoading] = useState(false);

  // Group Operations
  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    const teamId = selectedTeamId || currentTeam?.id;
    if (!newGroupName.trim() || !teamId) return;
    setGroupLoading(true);
    try {
      const res = await fetch(`/api/teams/${teamId}/groups`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newGroupName.trim() }),
      });
      const data = await res.json();
      if (res.ok) {
        await loadTeams();
        setNewGroupModalOpen(false);
        setNewGroupName('');
        showToast(`Group "${data.group?.name || newGroupName}" created!`);
      } else {
        showToast(data.error || 'Failed to create group', 'error');
      }
    } catch (err) {
      console.error(err);
      showToast('Error creating group', 'error');
    }
    setGroupLoading(false);
  };

  const handleRenameGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    const teamId = selectedTeamId || currentTeam?.id;
    if (!renameGroupModalOpen || !renameGroupName.trim() || !teamId) return;
    setGroupLoading(true);
    try {
      const res = await fetch(`/api/teams/${teamId}/groups`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: renameGroupModalOpen.id, name: renameGroupName.trim() }),
      });
      const data = await res.json();
      if (res.ok) {
        await loadTeams();
        setRenameGroupModalOpen(null);
        setRenameGroupName('');
        showToast('Group renamed successfully!');
      } else {
        showToast(data.error || 'Failed to rename group', 'error');
      }
    } catch (err) {
      console.error(err);
      showToast('Error renaming group', 'error');
    }
    setGroupLoading(false);
  };

  const handleDeleteGroup = async () => {
    const teamId = selectedTeamId || currentTeam?.id;
    if (!deleteGroupModalOpen || !teamId) return;
    setGroupLoading(true);
    try {
      const deleteMembersParam = deleteGroupMembersAction === 'delete';
      const targetParam = reassignTargetGroup || teamGroups.find(g => g.id !== deleteGroupModalOpen.id)?.id || '';
      const url = `/api/teams/${teamId}/groups?groupId=${encodeURIComponent(deleteGroupModalOpen.id)}&reassignTo=${encodeURIComponent(targetParam)}&deleteMembers=${deleteMembersParam}`;

      const res = await fetch(url, { method: 'DELETE' });
      const data = await res.json();
      if (res.ok) {
        await Promise.all([loadTeams(), loadData()]);
        setDeleteGroupModalOpen(null);
        showToast(`Group "${deleteGroupModalOpen.name}" deleted`);
      } else {
        showToast(data.error || 'Failed to delete group', 'error');
      }
    } catch (err) {
      console.error(err);
      showToast('Error deleting group', 'error');
    }
    setGroupLoading(false);
  };

  // Load Teams
  const loadTeams = async () => {
    console.log('[TeamsShifts] loadTeams called');
    try {
      const res = await fetch('/api/teams', { cache: 'no-store' });
      console.log('[TeamsShifts] fetch /api/teams status:', res.status);
      if (res.ok) {
        const data: Team[] = await res.json();
        console.log('[TeamsShifts] teams data count:', data.length);
        setTeams(data);
        if (data.length > 0) {
          const urlParam = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('teamId') : null;
          const stored = typeof window !== 'undefined' ? localStorage.getItem('shifts_selected_team_id') : null;
          let targetTeamId = data[0].id;
          if (urlParam && data.some(t => t.id === urlParam)) {
            targetTeamId = urlParam;
          } else if (selectedTeamId && data.some(t => t.id === selectedTeamId)) {
            targetTeamId = selectedTeamId;
          } else if (stored && data.some(t => t.id === stored)) {
            targetTeamId = stored;
          }
          console.log('[TeamsShifts] selecting team:', targetTeamId);
          setSelectedTeamId(targetTeamId);
          loadData(targetTeamId);
        } else {
          setSelectedTeamId('');
          setEmployees([]);
          setShifts([]);
          setLoading(false);
        }
      } else {
        setLoading(false);
      }
    } catch (err) {
      console.error('[TeamsShifts] Failed to load teams:', err);
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTeams();
  }, []);

  // Load Schedule, Employees & Clients for selected team and date
  const loadData = async (teamIdOverride?: string) => {
    const teamId = teamIdOverride || selectedTeamId || currentTeam?.id;
    if (!teamId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [empRes, shiftRes, clientRes] = await Promise.all([
        fetch(`/api/employees?teamId=${teamId}`, { cache: 'no-store' }),
        fetch(`/api/shifts?date=${start.toISOString()}&teamId=${teamId}`, { cache: 'no-store' }),
        fetch(`/api/clients?teamId=${teamId}`, { cache: 'no-store' }),
      ]);
      if (empRes.ok) setEmployees(await empRes.json());
      if (shiftRes.ok) setShifts(await shiftRes.json());
      if (clientRes.ok) {
        const clientData = await clientRes.json();
        const parsedClients: ClientData[] = (clientData.clients || []).map((c: any) => ({
          ...c,
          days: typeof c.days === 'string' ? JSON.parse(c.days) : (c.days || [1, 2, 3, 4, 5]),
          assignedEmployeeIds: typeof c.assignedEmployeeIds === 'string' ? JSON.parse(c.assignedEmployeeIds) : (c.assignedEmployeeIds || []),
          memberDayMap: typeof c.memberDayMap === 'string' ? JSON.parse(c.memberDayMap) : (c.memberDayMap || {}),
          dailyRequirements: typeof c.dailyRequirements === 'string' ? JSON.parse(c.dailyRequirements) : (c.dailyRequirements || {}),
        }));
        setTeamClients(parsedClients);
      }
    } catch (err) {
      console.error('Failed to load schedule data:', err);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (selectedTeamId) {
      localStorage.setItem('shifts_selected_team_id', selectedTeamId);
      loadData(selectedTeamId);
    }
  }, [selectedTeamId, currentDate]);

  useEffect(() => {
    if (copyModalOpen) {
      const nextWk = addWeeks(start, 1);
      setCopySourceDate(format(start, 'yyyy-MM-dd'));
      setTargetWeekDate(nextWk);
      setCopyTargetDate(format(nextWk, 'yyyy-MM-dd'));
      setCalendarViewYear(nextWk.getFullYear());
      setCalendarViewMonth(nextWk.getMonth());
    }
  }, [copyModalOpen, start]);

  // Team Selection
  const switchTeam = (teamId: string) => {
    setSelectedTeamId(teamId);
    setTeamDropdownOpen(false);
  };

  // Create Team
  const handleCreateTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!teamFormName.trim()) return;
    try {
      const res = await fetch('/api/teams', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: teamFormName.trim(),
          exportGroupName: teamFormExportGroup.trim() || teamFormName.trim(),
          breakMinutes: teamFormBreak,
          earlyStart: teamFormEarlyStart.trim(),
          earlyEnd: teamFormEarlyEnd.trim(),
          lateStart: teamFormLateStart.trim(),
          lateEnd: teamFormLateEnd.trim(),
        }),
      });
      if (res.ok) {
        const newTeam = await res.json();
        await loadTeams();
        setSelectedTeamId(newTeam.id);
        setNewTeamModalOpen(false);
        setTeamFormName('');
        setTeamFormExportGroup('');
        showToast(`Team "${newTeam.name}" created successfully!`);
      } else {
        const data = await res.json();
        showToast(data.error || 'Failed to create team', 'error');
      }
    } catch (err) {
      console.error(err);
      showToast('Error creating team', 'error');
    }
  };

  // Update Team Settings
  const handleUpdateTeamSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentTeam) return;
    try {
      const res = await fetch('/api/teams', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: currentTeam.id,
          name: teamFormName.trim(),
          exportGroupName: teamFormExportGroup.trim(),
          breakMinutes: teamFormBreak,
          earlyStart: teamFormEarlyStart.trim(),
          earlyEnd: teamFormEarlyEnd.trim(),
          lateStart: teamFormLateStart.trim(),
          lateEnd: teamFormLateEnd.trim(),
        }),
      });
      if (res.ok) {
        await loadTeams();
        setTeamSettingsModalOpen(false);
        showToast('Team settings updated!');
      }
    } catch (err) {
      console.error(err);
      showToast('Failed to update team settings', 'error');
    }
  };

  // Delete Team
  const handleDeleteTeam = async () => {
    if (!currentTeam) return;
    if (!confirm(`Are you sure you want to delete team "${currentTeam.name}" and all its members?`)) return;

    try {
      const res = await fetch(`/api/teams?id=${currentTeam.id}`, { method: 'DELETE' });
      if (res.ok) {
        setTeamSettingsModalOpen(false);
        setSelectedTeamId('');
        await loadTeams();
        showToast(`Team deleted.`);
      }
    } catch (err) {
      console.error(err);
      showToast('Error deleting team', 'error');
    }
  };

  // Client Management Handlers
  const openClientEditor = (client?: ClientData | null) => {
    setClientDropdownOpen(false);
    setClientMemberSearch('');
    if (client) {
      setSelectedClientId(client.id);

      let parsedMap: Record<string, any> = {};
      try {
        if (typeof client.memberDayMap === 'string') parsedMap = JSON.parse(client.memberDayMap);
        else if (client.memberDayMap && typeof client.memberDayMap === 'object') parsedMap = { ...client.memberDayMap };
      } catch {
        parsedMap = {};
      }

      const clientDays = Array.isArray(client.days) ? client.days : [1, 2, 3, 4, 5];
      const empIds = Array.isArray(client.assignedEmployeeIds) ? client.assignedEmployeeIds : [];

      // Ensure each assigned employee has an array of scheduled days
      for (const id of empIds) {
        if (!Array.isArray(parsedMap[id])) {
          const daysForEmp: number[] = [];
          for (let d = 1; d <= 5; d++) {
            if (parsedMap[d.toString()] === id || (Array.isArray(parsedMap[d.toString()]) && parsedMap[d.toString()].includes(id))) {
              daysForEmp.push(d);
            }
          }
          parsedMap[id] = daysForEmp.length > 0 ? daysForEmp : [...clientDays];
        }
      }

      let dailyReqs: Record<number, number> = { 1: 1, 2: 1, 3: 1, 4: 1, 5: 1 };
      try {
        let parsedReqs: any = {};
        if (typeof client.dailyRequirements === 'string') parsedReqs = JSON.parse(client.dailyRequirements);
        else if (client.dailyRequirements && typeof client.dailyRequirements === 'object') parsedReqs = client.dailyRequirements;
        const defaultReq = client.requiredMembersPerDay && client.requiredMembersPerDay > 0 ? client.requiredMembersPerDay : 1;
        for (let d = 1; d <= 5; d++) {
          if (parsedReqs[d] !== undefined || parsedReqs[d.toString()] !== undefined) {
            dailyReqs[d] = Number(parsedReqs[d] ?? parsedReqs[d.toString()]);
          } else {
            dailyReqs[d] = defaultReq;
          }
        }
      } catch {
        dailyReqs = { 1: 1, 2: 1, 3: 1, 4: 1, 5: 1 };
      }

      setClientForm({
        id: client.id,
        name: client.name,
        color: client.color || 'PINK',
        location: client.location || client.name,
        startTime: client.startTime || '08:30',
        endTime: client.endTime || '17:00',
        frequency: client.frequency || 'EVERY_OTHER_WEEK',
        weekParity: (client.weekParity as any) || 'ODD',
        monthlyWeek: client.monthlyWeek || 1,
        days: clientDays,
        assignedEmployeeIds: empIds,
        memberDayMap: parsedMap,
        requiredMembersPerDay: client.requiredMembersPerDay && client.requiredMembersPerDay > 0 ? client.requiredMembersPerDay : 1,
        dailyRequirements: dailyReqs,
        notes: client.notes || '',
        isActive: client.isActive !== false,
      });
    } else {
      setSelectedClientId(null);
      setClientForm({
        name: '',
        color: 'PINK',
        location: '',
        startTime: '08:30',
        endTime: '17:00',
        frequency: 'EVERY_OTHER_WEEK',
        weekParity: 'ODD',
        monthlyWeek: 1,
        days: [1, 2, 3, 4, 5],
        assignedEmployeeIds: [],
        memberDayMap: {},
        requiredMembersPerDay: 1,
        dailyRequirements: { 1: 1, 2: 1, 3: 1, 4: 1, 5: 1 },
        notes: '',
        isActive: true,
      });
    }
    setClientModalOpen(true);
  };

  const setDayRequirement = (dayNum: number, count: number) => {
    const safeCount = Math.max(0, count);
    const nextReqs = { ...clientForm.dailyRequirements, [dayNum]: safeCount };
    let nextDays = [...clientForm.days];
    if (safeCount > 0 && !nextDays.includes(dayNum)) {
      nextDays.push(dayNum);
      nextDays.sort();
    } else if (safeCount === 0 && nextDays.includes(dayNum)) {
      nextDays = nextDays.filter(d => d !== dayNum);
    }
    setClientForm({
      ...clientForm,
      dailyRequirements: nextReqs,
      days: nextDays,
    });
  };

  const bulkSetDayRequirements = (count: number) => {
    const safeCount = Math.max(1, count);
    const nextReqs: Record<number, number> = {};
    for (let d = 1; d <= 5; d++) {
      nextReqs[d] = safeCount;
    }
    setClientForm({
      ...clientForm,
      dailyRequirements: nextReqs,
      requiredMembersPerDay: safeCount,
    });
  };

  const getClientMemberDays = (empId: string): number[] => {
    const custom = clientForm.memberDayMap[empId];
    if (Array.isArray(custom)) return custom;
    return clientForm.days || [1, 2, 3, 4, 5];
  };

  const toggleClientMemberDay = (empId: string, dayNum: number) => {
    const curDays = getClientMemberDays(empId);
    const nextDays = curDays.includes(dayNum)
      ? curDays.filter(d => d !== dayNum)
      : [...curDays, dayNum].sort();
    setClientForm({
      ...clientForm,
      memberDayMap: {
        ...clientForm.memberDayMap,
        [empId]: nextDays,
      },
    });
  };

  const setClientMemberDaysAll = (empId: string, days: number[]) => {
    setClientForm({
      ...clientForm,
      memberDayMap: {
        ...clientForm.memberDayMap,
        [empId]: days,
      },
    });
  };

  const addMemberToClient = (empId: string) => {
    if (clientForm.assignedEmployeeIds.includes(empId)) return;
    setClientForm({
      ...clientForm,
      assignedEmployeeIds: [...clientForm.assignedEmployeeIds, empId],
      memberDayMap: {
        ...clientForm.memberDayMap,
        [empId]: clientForm.days.length > 0 ? [...clientForm.days] : [1, 2, 3, 4, 5],
      },
    });
    setClientMemberSearch('');
  };

  const removeMemberFromClient = (empId: string) => {
    const nextIds = clientForm.assignedEmployeeIds.filter(id => id !== empId);
    const nextMap = { ...clientForm.memberDayMap };
    delete nextMap[empId];
    setClientForm({
      ...clientForm,
      assignedEmployeeIds: nextIds,
      memberDayMap: nextMap,
    });
  };

  const saveClientForm = async () => {
    if (!clientForm.name.trim()) {
      showToast('Client name is required', 'error');
      return;
    }
    const teamId = selectedTeamId || currentTeam?.id;
    if (!teamId) {
      showToast('Please select a team first', 'error');
      return;
    }

    try {
      const isEdit = Boolean(selectedClientId);
      const url = '/api/clients';
      const method = isEdit ? 'PUT' : 'POST';
      const payload = {
        ...(isEdit ? { id: selectedClientId } : { teamId }),
        name: clientForm.name.trim(),
        color: clientForm.color,
        location: clientForm.location.trim() || clientForm.name.trim(),
        startTime: clientForm.startTime,
        endTime: clientForm.endTime,
        frequency: clientForm.frequency,
        weekParity: clientForm.weekParity,
        monthlyWeek: clientForm.monthlyWeek,
        days: clientForm.days,
        assignedEmployeeIds: clientForm.assignedEmployeeIds,
        memberDayMap: clientForm.memberDayMap,
        requiredMembersPerDay: clientForm.requiredMembersPerDay,
        dailyRequirements: clientForm.dailyRequirements,
        notes: clientForm.notes.trim() || null,
        isActive: clientForm.isActive,
      };

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        showToast(isEdit ? `Updated client "${clientForm.name}"` : `Created client "${clientForm.name}"`);
        await loadData();
        const data = await res.json();
        if (data.client?.id) {
          setSelectedClientId(data.client.id);
        }
      } else {
        const data = await res.json().catch(() => ({}));
        showToast(data.error || 'Failed to save client', 'error');
      }
    } catch (err: any) {
      showToast(err.message || 'Error saving client', 'error');
    }
  };

  const deleteClient = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to delete client "${name}"?`)) return;
    try {
      const res = await fetch(`/api/clients?id=${id}`, { method: 'DELETE' });
      if (res.ok) {
        showToast(`Deleted client "${name}"`);
        await loadData();
        setSelectedClientId(null);
        setClientModalOpen(false);
      } else {
        showToast('Failed to delete client', 'error');
      }
    } catch {
      showToast('Error deleting client', 'error');
    }
  };

  const applyClientToSchedule = async (clientId?: string) => {
    const teamId = selectedTeamId || currentTeam?.id;
    if (!teamId) return;
    setApplyingClient(true);
    try {
      const res = await fetch('/api/clients/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          teamId,
          clientId,
          weekStartDate: start.toISOString(),
        }),
      });

      if (res.ok) {
        const data = await res.json();
        showToast(`Applied ${data.appliedCount} client shift(s) for Week ${data.isoWeek}!`);
        await loadData();
      } else {
        const data = await res.json().catch(() => ({}));
        showToast(data.error || 'Failed to apply client shifts', 'error');
      }
    } catch {
      showToast('Error applying client shifts', 'error');
    } finally {
      setApplyingClient(false);
    }
  };

  // Add Member
  const addEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEmpName.trim() || !newEmpEmail.trim()) {
      alert('Please fill in both name and email');
      return;
    }
    const teamId = selectedTeamId || currentTeam?.id;
    if (!teamId) return;
    try {
      await fetch('/api/employees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newEmpName.trim(),
          email: newEmpEmail.trim(),
          group: addingMemberGroup || 'DEFAULT',
          teamId,
        }),
      });
      setNewEmpName('');
      setNewEmpEmail('');
      setAddingMemberGroup(null);
      await loadData();
      showToast(`Member added to ${currentTeam?.name}`);
    } catch (err) {
      console.error('Failed to add employee', err);
      showToast('Failed to add employee', 'error');
    }
  };

  // Update Member Details & Constraints
  const saveMemberConstraints = async (emp: Employee) => {
    try {
      const res = await fetch('/api/employees', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(emp),
      });
      if (res.ok) {
        setMemberEditModalOpen(null);
        await loadData();
        showToast(`Updated member details for ${emp.name}`);
      } else {
        const data = await res.json().catch(() => ({}));
        showToast(data.error || 'Failed to update member', 'error');
      }
    } catch (err) {
      console.error(err);
      showToast('Failed to update member details', 'error');
    }
  };

  // Remove Member
  const removeEmployee = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to remove ${name} from this team?`)) return;
    await fetch(`/api/employees?id=${id}`, { method: 'DELETE' });
    await loadData();
    showToast(`Removed ${name}`);
  };

  // Shift Modal Open
  const openShiftModal = (empId: string, date: Date, currentShift: Shift | undefined) => {
    setSelectedShift({ empId, date, shift: currentShift });
    setCopyToEmpIds([]);
    if (currentShift && currentShift.type !== 'OFF') {
      setModalData({
        type: currentShift.type,
        location: currentShift.location,
        customStart: currentShift.customStart || '',
        customEnd: currentShift.customEnd || '',
        notes: currentShift.notes || '',
        color: currentShift.color || 'PINK',
        endDate: format(date, 'yyyy-MM-dd'),
      });
    } else {
      setModalData({
        type: 'EARLY',
        location: 'OFFICE',
        customStart: '',
        customEnd: '',
        notes: '',
        color: 'PINK',
        endDate: format(date, 'yyyy-MM-dd'),
      });
    }
  };

  // Save Shift
  const saveShift = async () => {
    if (!selectedShift) return;
    const { date } = selectedShift;
    const { type, location, customStart, customEnd, notes, color, endDate } = modalData;

    const targetEmpIds = [selectedShift.empId, ...copyToEmpIds];
    const isMultiDay = (type === 'SICK' || type === 'VACATION') && endDate;
    const datesToSave: Date[] = [];

    if (isMultiDay) {
      let cur = new Date(date);
      const end = new Date(endDate);
      while (cur <= end) {
        const dow = cur.getDay();
        if (dow !== 0 && dow !== 6) {
          datesToSave.push(new Date(cur));
        }
        cur = addDays(cur, 1);
      }
    } else {
      datesToSave.push(date);
    }

    const cleanNotes = notes?.trim() ? notes.trim() : null;

    // Optimistic UI Update: remove any existing shifts for these employees on these dates first
    setShifts((prev) => {
      const next = prev.filter(
        s => !(targetEmpIds.includes(s.employeeId) && datesToSave.some(d => isSameDay(new Date(s.date), d)))
      );
      for (const empId of targetEmpIds) {
        for (const sDate of datesToSave) {
          next.push({
            id: 'temp-' + empId + sDate.getTime(),
            employeeId: empId,
            date: sDate.toISOString(),
            type: type as any,
            location: location as any,
            isManual: true,
            customStart,
            customEnd,
            notes: cleanNotes,
            color,
          });
        }
      }
      return next;
    });

    setSelectedShift(null);
    setCopyToEmpIds([]);

    const requests: Promise<any>[] = [];
    for (const empId of targetEmpIds) {
      for (const sDate of datesToSave) {
        requests.push(
          fetch('/api/shifts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              employeeId: empId,
              date: sDate.toISOString(),
              type,
              location,
              isManual: true,
              customStart: type === 'CUSTOM' ? customStart : '',
              customEnd: type === 'CUSTOM' ? customEnd : '',
              notes: cleanNotes,
              color: type === 'CUSTOM' ? color : '',
            }),
          })
        );
      }
    }
    await Promise.all(requests);
    await loadData();
    showToast('Shift saved');
  };

  // Clear Shift
  const clearShift = async () => {
    if (!selectedShift) return;
    const { empId, date } = selectedShift;

    setShifts(prev => prev.filter(s => !(s.employeeId === empId && isSameDay(new Date(s.date), date))));
    setSelectedShift(null);
    setCopyToEmpIds([]);

    await fetch(`/api/shifts?employeeId=${empId}&date=${date.toISOString()}`, { method: 'DELETE' });
    await loadData();
    showToast('Shift cleared');
  };

  // Auto-Fill Generator (applies recurring fixed days + generates shifts with team rules)
  const generateShifts = async () => {
    const teamId = selectedTeamId || currentTeam?.id;
    if (!teamId) return;
    setLoading(true);
    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: start.toISOString(),
          teamId,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        await loadData();
        const total = data.summary?.totalGenerated || 0;
        const fixed = data.summary?.fixedAppliedCount || 0;
        if (fixed > 0) {
          showToast(`Auto-fill complete: ${fixed} fixed day(s) applied & ${total} total shifts scheduled with team rules!`);
        } else {
          showToast(`Auto-fill complete: ${total} shifts scheduled with team rules!`);
        }
      } else {
        const errData = await res.json();
        showToast(errData.error || 'Auto-fill failed', 'error');
      }
    } catch (err) {
      console.error(err);
      showToast('Error during auto-fill', 'error');
    }
    setLoading(false);
  };

  // Clear all shifts for the current week
  const clearWeekShifts = async () => {
    const teamId = selectedTeamId || currentTeam?.id;
    if (!teamId) return;
    if (!window.confirm(`Weet je zeker dat je het hele rooster voor de week van ${format(start, 'd MMMM yyyy')} wilt wissen?`)) {
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/shifts?clearWeek=true&teamId=${teamId}&date=${start.toISOString()}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        await loadData();
        showToast('Het rooster voor deze week is volledig gewist!', 'success');
      } else {
        const errData = await res.json().catch(() => ({}));
        showToast(errData.error || 'Kon weekrooster niet wissen', 'error');
      }
    } catch (err) {
      console.error(err);
      showToast('Fout bij wissen van weekrooster', 'error');
    }
    setLoading(false);
  };

  // Copy Shifts
  const handleCopyShifts = async () => {
    const teamId = selectedTeamId || currentTeam?.id;
    if (!teamId) return;
    setCopying(true);
    try {
      const source = new Date(copySourceDate || start);
      const target = new Date(copyTargetDate || targetWeekDate);
      const res = await fetch('/api/shifts/copy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: copyType,
          sourceDate: source.toISOString(),
          targetDate: target.toISOString(),
          teamId,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setCopyModalOpen(false);
        await loadData();
        showToast(`Successfully copied ${data.count || 0} shifts to week of ${format(target, 'MMM d, yyyy')}`);
        if (jumpAfterCopy && !isSameDay(start, target)) {
          setCurrentDate(target);
        }
      } else {
        showToast('Failed to copy shifts', 'error');
      }
    } catch (err) {
      console.error(err);
      showToast('Error copying shifts', 'error');
    }
    setCopying(false);
  };

  // Copy active week to clipboard buffer
  const handleCopyWeekToBuffer = () => {
    const bufferData: WeekBuffer = {
      sourceStart: start.toISOString(),
      count: shifts.length,
      teamId: selectedTeamId || currentTeam?.id,
    };
    setCopiedWeekBuffer(bufferData);
    if (typeof window !== 'undefined') {
      localStorage.setItem('teams_shifts_copied_week', JSON.stringify(bufferData));
    }
    showToast(`Copied week of ${format(start, 'MMM d')} to clipboard (${shifts.length} shifts)`);
  };

  // Clear week clipboard buffer
  const handleClearWeekBuffer = () => {
    setCopiedWeekBuffer(null);
    if (typeof window !== 'undefined') {
      localStorage.removeItem('teams_shifts_copied_week');
    }
    showToast('Cleared shift clipboard');
  };

  // Paste week from buffer to target date
  const handlePasteWeekFromBuffer = async (targetDate: Date) => {
    if (!copiedWeekBuffer) return;
    const teamId = selectedTeamId || currentTeam?.id;
    if (!teamId) return;
    setCopying(true);
    try {
      const res = await fetch('/api/shifts/copy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'WEEK',
          sourceDate: copiedWeekBuffer.sourceStart,
          targetDate: targetDate.toISOString(),
          teamId,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setCopyModalOpen(false);
        await loadData();
        showToast(`Pasted ${data.count || 0} shifts into week of ${format(targetDate, 'MMM d, yyyy')}!`);
        if (jumpAfterCopy && !isSameDay(start, targetDate)) {
          setCurrentDate(targetDate);
        }
      } else {
        const data = await res.json();
        showToast(data.error || 'Failed to paste shifts', 'error');
      }
    } catch (err) {
      console.error(err);
      showToast('Error pasting shifts', 'error');
    }
    setCopying(false);
  };

  // Calendar Picker Helpers
  const handlePrevMonth = () => {
    if (calendarViewMonth === 0) {
      setCalendarViewMonth(11);
      setCalendarViewYear(prev => prev - 1);
    } else {
      setCalendarViewMonth(prev => prev - 1);
    }
  };

  const handleNextMonth = () => {
    if (calendarViewMonth === 11) {
      setCalendarViewMonth(0);
      setCalendarViewYear(prev => prev + 1);
    } else {
      setCalendarViewMonth(prev => prev + 1);
    }
  };

  const selectWeekPreset = (weeksOffset: number) => {
    const newTarget = addWeeks(start, weeksOffset);
    setTargetWeekDate(newTarget);
    setCopyTargetDate(format(newTarget, 'yyyy-MM-dd'));
    setCalendarViewYear(newTarget.getFullYear());
    setCalendarViewMonth(newTarget.getMonth());
  };

  const handleSelectCalendarDay = (day: Date) => {
    const weekStart = startOfWeek(day, { weekStartsOn: 1 });
    setTargetWeekDate(weekStart);
    setCopyTargetDate(format(copyType === 'WEEK' ? weekStart : day, 'yyyy-MM-dd'));
    if (day.getMonth() !== calendarViewMonth) {
      setCalendarViewMonth(day.getMonth());
      setCalendarViewYear(day.getFullYear());
    }
  };

  // 1-Click Copy Current Week to Next Week
  const handleCopyCurrentWeekToNextWeek = async () => {
    const teamId = selectedTeamId || currentTeam?.id;
    if (!teamId) return;
    setCopying(true);
    try {
      const nextWeekStart = addWeeks(start, 1);
      const res = await fetch('/api/shifts/copy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'WEEK',
          sourceDate: start.toISOString(),
          targetDate: nextWeekStart.toISOString(),
          teamId,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setCopyModalOpen(false);
        showToast(`Copied ${data.count || 0} shifts to next week!`);
        setCurrentDate(nextWeekStart);
      } else {
        const data = await res.json();
        showToast(data.error || 'Failed to copy shifts', 'error');
      }
    } catch (err) {
      console.error(err);
      showToast('Error copying shifts', 'error');
    }
    setCopying(false);
  };

  // Apply Fixed Days to Current Week
  const handleApplyFixedDays = async () => {
    const teamId = selectedTeamId || currentTeam?.id;
    if (!teamId) return;
    setApplyingFixed(true);
    try {
      const res = await fetch('/api/shifts/apply-fixed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: currentDate.toISOString(),
          teamId,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        await loadData();
        showToast(`Applied fixed schedules: ${data.count || 0} shift(s) set for this week!`);
      } else {
        const data = await res.json();
        showToast(data.error || 'Failed to apply fixed days', 'error');
      }
    } catch (err) {
      console.error(err);
      showToast('Error applying fixed days', 'error');
    }
    setApplyingFixed(false);
  };

  // Import Excel
  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const teamId = selectedTeamId || currentTeam?.id;
    setLoading(true);
    const formData = new FormData();
    formData.append('file', file);
    if (teamId) formData.append('teamId', teamId);

    try {
      const res = await fetch('/api/import', {
        method: 'POST',
        body: formData,
      });

      if (res.ok) {
        const data = await res.json();
        showToast(`Successfully imported ${data.count} shifts into ${currentTeam?.name}!`);
        await loadData();
      } else {
        const err = await res.json();
        showToast(`Import failed: ${err.error}`, 'error');
      }
    } catch (err) {
      console.error(err);
      showToast('Error importing shifts', 'error');
    }

    e.target.value = '';
    setLoading(false);
  };

  const getShiftTimeText = (shift: Shift) => {
    if (shift.type === 'SICK') return 'Sick Leave';
    if (shift.type === 'VACATION') return 'Vacation';
    const earlySt = currentTeam?.shiftTypes?.find(st => st.code === 'EARLY');
    const lateSt = currentTeam?.shiftTypes?.find(st => st.code === 'LATE');
    if (shift.type === 'EARLY') return `${earlySt?.defaultStart || '07:30'} - ${earlySt?.defaultEnd || '16:00'}`;
    if (shift.type === 'LATE') return `${lateSt?.defaultStart || '09:30'} - ${lateSt?.defaultEnd || '18:00'}`;
    if (shift.type === 'CUSTOM') return `${shift.customStart || '08:30'} - ${shift.customEnd || '17:00'}`;
    const customSt = currentTeam?.shiftTypes?.find(st => st.code === shift.type);
    if (customSt) return `${customSt.defaultStart} - ${customSt.defaultEnd}`;
    return 'OFF';
  };

  const renderGroupTable = (title: string, groupKey: string) => {
    const groupEmployees = employees.filter(e => (e.group || 'DEFAULT') === groupKey);

    return (
      <div style={{ overflowX: 'auto', marginBottom: '2.5rem' }} key={groupKey}>
        <table className="schedule-table schedule-grid-table">
          <thead>
            <tr>
              <th className="member-cell">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
                  <div style={{ fontSize: '0.875rem', color: 'var(--slate-200)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.4rem', minWidth: 0 }}>
                    <Users size={16} style={{ color: 'var(--primary)', flexShrink: 0 }} />
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</span>
                    <span className="group-count-badge">({groupEmployees.length})</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
                    <button
                      className="group-action-btn"
                      onClick={() => {
                        setRenameGroupModalOpen({ id: groupKey, name: title });
                        setRenameGroupName(title);
                      }}
                      title={`Rename group "${title}"`}
                    >
                      <Edit2 size={13} />
                    </button>
                    <button
                      className="group-action-btn delete"
                      onClick={() => {
                        const otherGroups = teamGroups.filter(g => g.id !== groupKey);
                        setReassignTargetGroup(otherGroups[0]?.id || '');
                        setDeleteGroupMembersAction('reassign');
                        setDeleteGroupModalOpen({
                          id: groupKey,
                          name: title,
                          memberCount: groupEmployees.length,
                        });
                      }}
                      title={`Delete group "${title}"`}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              </th>
              {weekDays.map(day => (
                <th key={day.toISOString()} className="day-col-header" style={{ textAlign: 'center' }} suppressHydrationWarning>
                  <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--slate-400)', fontWeight: 700, letterSpacing: '0.05em' }} suppressHydrationWarning>
                    {format(day, 'EEEE')}
                  </div>
                  <div style={{ fontSize: '1.15rem', color: 'white', fontWeight: 600 }} suppressHydrationWarning>
                    {format(day, 'MMM d')}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {groupEmployees.map(emp => {
              let fixedOffs: number[] = [];
              try { fixedOffs = JSON.parse(emp.fixedOffDays || '[]'); } catch { fixedOffs = []; }
              const dayNames = ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

              return (
                <tr key={emp.id}>
                  <td className="member-cell">
                    <div className="member-info">
                      <div
                        className="member-profile"
                        onClick={() => setMemberEditModalOpen(emp)}
                        style={{ cursor: 'pointer' }}
                        title={`Click to edit ${emp.name}'s name, email, or schedule rules`}
                      >
                        <div className="avatar">{emp.name.charAt(0).toUpperCase()}</div>
                        <div className="member-details">
                          <span className="member-name" title={emp.name}>{emp.name}</span>
                          {emp.email && <span className="member-email" title={emp.email}>{emp.email}</span>}
                          <div className="member-tags">
                            {emp.allowedLocation === 'HOME_ONLY' && (
                              <span className="member-tag tag-home" title="Configured to only work from Home">Home Only</span>
                            )}
                            {emp.allowedLocation === 'OFFICE_ONLY' && (
                              <span className="member-tag tag-office" title="Configured to only work at the Office">Office Only</span>
                            )}
                            {fixedOffs.length > 0 && (
                              <span className="member-tag tag-off" title="Fixed Days Off">
                                {fixedOffs.map(d => dayNames[d]).join(', ')} Off
                              </span>
                            )}
                            {emp.maxOfficeDays !== null && emp.maxOfficeDays !== undefined && (
                              <span className="member-tag tag-office" title="Custom office limit">Max {emp.maxOfficeDays} Offc</span>
                            )}
                            {!emp.autoSchedule && (
                              <span className="member-tag tag-manual-only" title="Excluded from auto-fill (manual scheduling only)">Manual Only</span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="member-actions">
                        <button
                          className="action-btn"
                          onClick={() => setMemberEditModalOpen(emp)}
                          title={`Rename ${emp.name} or change email`}
                        >
                          <Edit2 size={15} />
                        </button>
                        <button
                          className="action-btn"
                          onClick={() => setMemberEditModalOpen(emp)}
                          title="Configure rules & constraints for this member"
                        >
                          <Sliders size={15} />
                        </button>
                        <button
                          className="action-btn delete"
                          onClick={() => removeEmployee(emp.id, emp.name)}
                          title="Remove member"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </div>
                  </td>

                  {weekDays.map(day => {
                    const shift = shifts.find(s => s.employeeId === emp.id && isSameDay(new Date(s.date), day));
                    let shiftClass = 'shift-btn is-off';

                    if (shift && shift.type !== 'OFF') {
                      let bgClass = 'bg-custom';
                      if (shift.location !== 'HOME' && shift.location !== 'OFFICE') bgClass = 'bg-custom';
                      else if (shift.type === 'SICK') bgClass = 'bg-sick';
                      else if (shift.type === 'VACATION') bgClass = 'bg-vacation';
                      else if (shift.type === 'EARLY') bgClass = 'bg-early';
                      else if (shift.type === 'LATE') bgClass = 'bg-late';

                      shiftClass = `shift-btn ${bgClass} ${shift.isManual ? 'is-manual' : ''}`;
                    }

                    return (
                      <td key={day.toISOString()} className="day-col-cell">
                        <button className={shiftClass} onClick={() => openShiftModal(emp.id, day, shift)}>
                          {shift?.isManual && <div className="manual-pin" title="Manual shift override" />}
                          {shift && shift.type !== 'OFF' ? (
                            <>
                              <span className={`time-badge time-${shift.type.toLowerCase()}`}>
                                {getShiftTimeText(shift)}
                              </span>
                              {shift.type !== 'SICK' && shift.type !== 'VACATION' && (
                                <span
                                  className={`loc-badge ${shift.location === 'OFFICE' ? 'loc-office' : shift.location === 'HOME' ? 'loc-home' : 'loc-custom'}`}
                                  title={shift.location === 'OFFICE' ? 'Office' : shift.location === 'HOME' ? 'Home' : (shift.location || '')}
                                >
                                  <div className="loc-dot" />
                                  {shift.location === 'OFFICE' ? (
                                    <>
                                      <Building size={11} style={{ flexShrink: 0 }} /> <span className="loc-text">Office</span>
                                    </>
                                  ) : shift.location === 'HOME' ? (
                                    <>
                                      <HomeIcon size={11} style={{ flexShrink: 0 }} /> <span className="loc-text">Home</span>
                                    </>
                                  ) : (
                                    <span className="loc-text">{shift.location}</span>
                                  )}
                                </span>
                              )}
                              {shift.notes && (
                                <span className="shift-notes" title={shift.notes}>
                                  {shift.notes}
                                </span>
                              )}
                            </>
                          ) : (
                            <span style={{ color: 'var(--slate-500)', fontSize: '0.85rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                              <Plus size={14} /> Off
                            </span>
                          )}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              );
            })}

            {/* Add Member Row */}
            <tr>
              <td className="member-cell">
                {addingMemberGroup !== groupKey ? (
                  <button
                    onClick={() => setAddingMemberGroup(groupKey)}
                    style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--primary)', fontWeight: 600, fontSize: '0.875rem' }}
                  >
                    <Plus size={16} /> Add Member
                  </button>
                ) : (
                  <form onSubmit={addEmployee} style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    <input
                      type="text"
                      autoFocus
                      className="input"
                      placeholder="Full Name..."
                      value={newEmpName}
                      onChange={e => setNewEmpName(e.target.value)}
                    />
                    <input
                      type="email"
                      className="input"
                      placeholder="Work Email..."
                      value={newEmpEmail}
                      onChange={e => setNewEmpEmail(e.target.value)}
                    />
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button type="submit" className="btn btn-primary" style={{ flex: 1, padding: '0.4rem' }}>
                        <Plus size={15} /> Save
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        style={{ padding: '0.4rem 0.6rem' }}
                        onClick={() => setAddingMemberGroup(null)}
                      >
                        <X size={15} />
                      </button>
                    </div>
                  </form>
                )}
              </td>
              <td colSpan={5}></td>
            </tr>
          </tbody>
        </table>
      </div>
    );
  };

  if (!mounted) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0f172a', color: '#94a3b8' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', fontSize: '1rem', fontWeight: 500 }}>
          <div style={{ width: 20, height: 20, border: '2px solid rgba(255,255,255,0.2)', borderTopColor: '#6366f1', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
          Loading Schedule...
        </div>
      </div>
    );
  }

  return (
    <div className="layout-wrapper">
      {/* Top Header */}
      {/* Update Notification Banner */}
      {updateInfo?.hasUpdate && !dismissedUpdate && (
        <div className="update-banner">
          <div className="update-banner-content">
            <span className="update-badge-pill">UPDATE AVAILABLE</span>
            <span>
              Teams Shifts <strong>v{updateInfo.latestVersion}</strong> is available!
              {updateInfo.releaseName ? ` — ${updateInfo.releaseName}` : ''}
              <span style={{ marginLeft: 6, fontSize: '0.75rem', opacity: 0.85 }}>
                ({updateInfo.isInstalled ? 'Full Installed Edition' : 'Portable Edition'})
              </span>
            </span>
          </div>
          <div className="update-banner-actions">
            {updateInfo.isInstalled ? (
              <button
                className="btn btn-sm btn-primary"
                onClick={() => {
                  setVersionModalOpen(true);
                  triggerOneClickUpdateModal('installer');
                }}
                style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#10b981', borderColor: '#059669' }}
              >
                <Play size={13} /> 1-Click Update & Restart
              </button>
            ) : (
              <a
                href={updateInfo.portableUrl || `https://github.com/${customRepo || updateInfo.repo || 'Doffo-1/Teams-Shifts'}/releases/latest/download/TeamsShifts-Standalone.zip`}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-sm btn-primary"
                style={{ display: 'flex', alignItems: 'center', gap: 6, textDecoration: 'none' }}
              >
                <Download size={13} /> Download Portable (.zip)
              </a>
            )}
            <button className="btn btn-sm btn-secondary" onClick={() => setVersionModalOpen(true)}>
              View Details
            </button>
            <button
              className="update-dismiss-btn"
              onClick={() => setDismissedUpdate(true)}
              title="Dismiss notification"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      <header className="top-header">
        <div className="header-title-group">
          <div className="brand-badge">
            <div className="brand-icon">
              <Briefcase size={22} />
            </div>
            <div className="brand-text">
              <h1>
                Teams Shifts
                <Sparkles size={16} style={{ color: '#fbbf24' }} />
              </h1>
              <div className="brand-sub">Multi-team Schedule Generator</div>
            </div>
          </div>

          {/* Team Selector Pill */}
          <div className="team-switcher">
            <button
              className="team-pill"
              onClick={() => setTeamDropdownOpen(!teamDropdownOpen)}
              title="Switch or manage teams"
            >
              <Users size={16} style={{ color: 'var(--primary)' }} />
              <span>{currentTeam?.name || 'Select Team'}</span>
              <ChevronDown size={14} style={{ opacity: 0.7 }} />
            </button>

            {teamDropdownOpen && (
              <>
                <div
                  className="dropdown-backdrop"
                  onClick={() => setTeamDropdownOpen(false)}
                />
                <div className="team-dropdown">
                  <div style={{ padding: '0.4rem 0.6rem', fontSize: '0.75rem', fontWeight: 700, color: 'var(--slate-400)', textTransform: 'uppercase' }}>
                    Teams ({teams.length})
                  </div>
                  {teams.map(t => (
                    <button
                      key={t.id}
                      className={`team-option ${t.id === selectedTeamId ? 'active' : ''}`}
                      onClick={() => switchTeam(t.id)}
                    >
                      <span>{t.name}</span>
                      {t.id === selectedTeamId && <Check size={16} />}
                    </button>
                  ))}
                  <div className="team-dropdown-divider" />
                  <button
                    className="team-add-btn"
                    onClick={() => {
                      setTeamDropdownOpen(false);
                      setTeamFormName('');
                      setTeamFormExportGroup('');
                      setTeamFormBreak(30);
                      setNewTeamModalOpen(true);
                    }}
                  >
                    <Plus size={16} /> Create New Team
                  </button>
                  <button
                    className="team-option"
                    style={{ color: 'var(--slate-300)', marginTop: '0.2rem' }}
                    onClick={() => {
                      setTeamDropdownOpen(false);
                      if (currentTeam) {
                        setTeamFormName(currentTeam.name);
                        setTeamFormExportGroup(currentTeam.exportGroupName);
                        setTeamFormBreak(currentTeam.breakMinutes || 30);
                        const earlySt = currentTeam.shiftTypes?.find(st => st.code === 'EARLY');
                        const lateSt = currentTeam.shiftTypes?.find(st => st.code === 'LATE');
                        setTeamFormEarlyStart(earlySt?.defaultStart || '07:30');
                        setTeamFormEarlyEnd(earlySt?.defaultEnd || '16:00');
                        setTeamFormLateStart(lateSt?.defaultStart || '09:30');
                        setTeamFormLateEnd(lateSt?.defaultEnd || '18:00');
                      }
                      setTeamSettingsModalOpen(true);
                    }}
                  >
                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <Settings size={15} /> Team Settings
                    </span>
                  </button>
                </div>
              </>
            )}
          </div>

          {/* Client Selector Pill */}
          <div className="client-switcher">
            <button
              className="client-pill"
              onClick={() => setClientDropdownOpen(!clientDropdownOpen)}
              title="Select a client or manage customer assignments"
            >
              <Building2 size={16} style={{ color: 'var(--accent)' }} />
              <span>Clients ({teamClients.length})</span>
              <ChevronDown size={14} style={{ opacity: 0.7 }} />
            </button>

            {clientDropdownOpen && (
              <>
                <div
                  className="dropdown-backdrop"
                  onClick={() => setClientDropdownOpen(false)}
                />
                <div className="client-dropdown">
                  <div style={{ padding: '0.4rem 0.6rem', fontSize: '0.75rem', fontWeight: 700, color: 'var(--slate-400)', textTransform: 'uppercase', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span>Clients for {currentTeam?.name || 'Team'}</span>
                    <span style={{ fontSize: '0.7rem', color: 'var(--slate-500)' }}>{teamClients.length} Configured</span>
                  </div>

                  {teamClients.length === 0 ? (
                    <div style={{ padding: '0.85rem 0.6rem', textAlign: 'center', color: 'var(--slate-400)', fontSize: '0.82rem' }}>
                      No clients configured yet for this team.
                    </div>
                  ) : (
                    teamClients.map(c => {
                      const dayLabels = ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
                      const daysText = c.days?.map((d: number) => dayLabels[d]).join(', ');
                      let freqText = 'Every week';
                      if (c.frequency === 'EVERY_OTHER_WEEK') {
                        freqText = `Every other week (${c.weekParity === 'EVEN' ? 'Even' : 'Odd'})`;
                      } else if (c.frequency === 'EVERY_MONTH') {
                        freqText = `Monthly (Wk ${c.monthlyWeek || 1})`;
                      }

                      return (
                        <button
                          key={c.id}
                          className="client-option-item"
                          onClick={() => openClientEditor(c)}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: 0 }}>
                            <div
                              style={{
                                width: 8,
                                height: 8,
                                borderRadius: '50%',
                                flexShrink: 0,
                                background: c.color === 'GREEN' ? '#10b981' : c.color === 'BLUE' ? '#3b82f6' : c.color === 'PURPLE' ? '#a855f7' : c.color === 'ORANGE' ? '#f97316' : '#ec4899',
                              }}
                            />
                            <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                              <span style={{ fontWeight: 600, color: 'white', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {c.name}
                              </span>
                              <span style={{ fontSize: '0.72rem', color: 'var(--slate-400)' }}>
                                {freqText} • {daysText || 'No days'}
                              </span>
                            </div>
                          </div>
                          <span style={{ fontSize: '0.72rem', background: 'rgba(255,255,255,0.08)', padding: '0.15rem 0.4rem', borderRadius: 4, color: 'var(--slate-300)', whiteSpace: 'nowrap' }}>
                            {c.assignedEmployeeIds?.length || 0} mbrs
                          </span>
                        </button>
                      );
                    })
                  )}

                  <div className="team-dropdown-divider" />
                  <button
                    className="team-add-btn"
                    onClick={() => openClientEditor(null)}
                  >
                    <Plus size={16} /> Add New Client
                  </button>
                  {teamClients.length > 0 && (
                    <button
                      className="team-option"
                      style={{ color: 'var(--accent)', marginTop: '0.2rem' }}
                      onClick={() => openClientEditor(teamClients[0])}
                    >
                      <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <Sliders size={15} /> Open Clients Screen
                      </span>
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Date Navigator & Actions */}
        <div className="header-actions">
          <div className="date-nav">
            <button onClick={() => setCurrentDate(subWeeks(currentDate, 1))} title="Previous week">
              <ChevronLeft size={18} />
            </button>
            <button
              className="today-btn"
              onClick={() => setCurrentDate(new Date())}
              title="Jump to current week"
            >
              Today
            </button>
            <div className="date-display" suppressHydrationWarning>
              <Calendar size={15} style={{ color: 'var(--primary)' }} />
              <span suppressHydrationWarning>{format(start, 'MMM d')} - {format(addDays(start, 4), 'MMM d, yyyy')}</span>
            </div>
            <button onClick={() => setCurrentDate(addWeeks(currentDate, 1))} title="Next week">
              <ChevronRight size={18} />
            </button>
          </div>

          <div className="divider" />

          {/* Action Buttons */}
          <button
            onClick={() => {
              if (!currentTeam) {
                showToast('Please create or select a team first', 'error');
                setNewTeamModalOpen(true);
                return;
              }
              setRulesModalOpen(true);
            }}
            className="btn btn-secondary"
            title="Configure scheduling rules, attendance targets, and member constraints"
          >
            <Sliders size={16} style={{ color: '#a855f7' }} /> Rules Engine
          </button>

          <button
            onClick={() => setCopyModalOpen(true)}
            disabled={loading || employees.length === 0}
            className="btn btn-secondary"
            title="Copy or paste schedule between weeks or days"
          >
            <Copy size={16} /> Copy / Paste
          </button>

          {copiedWeekBuffer && (
            <button
              onClick={() => handlePasteWeekFromBuffer(start)}
              disabled={loading || copying}
              className="btn"
              style={{
                background: 'rgba(56, 189, 248, 0.18)',
                color: '#38bdf8',
                border: '1px solid rgba(56, 189, 248, 0.4)',
                boxShadow: '0 0 12px rgba(56, 189, 248, 0.25)',
              }}
              title={`Paste ${copiedWeekBuffer.count} shifts copied from week of ${format(new Date(copiedWeekBuffer.sourceStart), 'MMM d')} into this week`}
            >
              <ClipboardPaste size={16} /> Paste Week ({format(new Date(copiedWeekBuffer.sourceStart), 'MMM d')})
            </button>
          )}

          <button
            onClick={generateShifts}
            disabled={loading || employees.length === 0}
            className="btn btn-primary"
            title="Auto-fill schedule: applies recurring fixed days and generates shifts using team rules"
          >
            <Wand2 size={16} /> Auto-Fill
          </button>

          <button
            onClick={clearWeekShifts}
            disabled={loading}
            className="btn btn-secondary"
            style={{
              color: '#f87171',
              borderColor: 'rgba(239, 68, 68, 0.35)',
              background: 'rgba(239, 68, 68, 0.08)',
            }}
            title="Wis het gehele shift rooster voor deze week"
          >
            <Trash2 size={16} /> Clear Week
          </button>

          <label className="btn btn-secondary" style={{ cursor: 'pointer', margin: 0 }} title="Import Teams Shifts Excel">
            <Download size={16} /> Import
            <input type="file" accept=".xlsx" onChange={handleImport} style={{ display: 'none' }} />
          </label>

          <button
            className="btn btn-secondary"
            onClick={handleExport}
            disabled={exporting}
            title="Export to Microsoft Teams Shifts Excel format"
          >
            <Upload size={16} className={exporting ? 'spin-icon' : ''} /> {exporting ? 'Exporting...' : 'Export'}
          </button>

          {/* In-App Version & Update Pill */}
          <button
            className={`version-pill ${updateInfo?.hasUpdate ? 'update-available' : ''}`}
            onClick={() => setVersionModalOpen(true)}
            title={updateInfo?.hasUpdate ? `Update available: v${updateInfo.latestVersion}` : `Teams Shifts v${updateInfo?.currentVersion || '1.0.0'} (Click to check for updates)`}
          >
            <span className="version-dot" />
            <span>v{updateInfo?.currentVersion || '1.0.0'}</span>
            {updateInfo?.hasUpdate && <span className="version-pulse-tag">New</span>}
          </button>
        </div>
      </header>

      {/* Main Schedule Grid Card */}
      <div className="schedule-card">
        {loading && (
          <div className="loading-overlay">
            <div className="loading-badge">
              <div className="spinner" />
              Syncing Schedule...
            </div>
          </div>
        )}

        {teams.length === 0 && !loading ? (
          <div style={{ textAlign: 'center', padding: '5rem 2rem', color: 'var(--slate-400)' }}>
            <Briefcase size={56} style={{ opacity: 0.3, marginBottom: '1.25rem', color: 'var(--primary)' }} />
            <h2 style={{ color: 'white', marginBottom: '0.75rem', fontSize: '1.5rem', fontWeight: 700 }}>
              No Teams Yet
            </h2>
            <p style={{ fontSize: '0.95rem', marginBottom: '2rem', maxWidth: '480px', margin: '0 auto 2rem', color: 'var(--slate-400)' }}>
              Create your first team or import an existing Teams Shifts spreadsheet to start scheduling.
            </p>
            <button
              className="btn btn-primary"
              style={{ padding: '0.75rem 1.5rem', fontSize: '0.95rem' }}
              onClick={() => {
                setTeamFormName('');
                setTeamFormExportGroup('');
                setTeamFormBreak(30);
                setNewTeamModalOpen(true);
              }}
            >
              <Plus size={18} /> Create First Team
            </button>
          </div>
        ) : (
          <>
            {/* Dynamic Team Groups */}
            {teamGroups.map(group => renderGroupTable(group.name, group.id))}

        {/* Add Group Section */}
        <div className="add-group-section">
          <button
            className="btn btn-secondary add-group-btn"
            onClick={() => {
              setNewGroupName('');
              setNewGroupModalOpen(true);
            }}
          >
            <Plus size={16} style={{ color: 'var(--primary)' }} />
            <span>Add Group</span>
          </button>
        </div>

        </>
        )}

        {teams.length > 0 && employees.length === 0 && !loading && (
          <div style={{ textAlign: 'center', padding: '4rem 2rem', color: 'var(--slate-400)' }}>
            <Users size={48} style={{ opacity: 0.3, marginBottom: '1rem' }} />
            <h3 style={{ color: 'white', marginBottom: '0.5rem' }}>No team members in {currentTeam?.name || 'this team'} yet</h3>
            <p style={{ fontSize: '0.875rem', marginBottom: '1.5rem' }}>Add your first team member or import an existing Teams Shifts spreadsheet to get started.</p>
            <button
              className="btn btn-primary"
              onClick={() => setAddingMemberGroup('DEFAULT')}
            >
              <Plus size={16} /> Add First Member
            </button>
          </div>
        )}
      </div>

      {/* EDIT SHIFT MODAL */}
      {selectedShift && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setSelectedShift(null); }}>
          <div className="modal-content">
            <div className="modal-header">
              <h2><Calendar size={18} /> Edit Shift</h2>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <button
                  onClick={() => { setCopiedShiftData(modalData); showToast('Shift config copied'); }}
                  title="Copy shift configuration"
                  style={{ color: 'var(--primary)', padding: '0.35rem', display: 'flex', alignItems: 'center' }}
                >
                  <ClipboardCopy size={18} />
                </button>
                {copiedShiftData && (
                  <button
                    onClick={() => { setModalData(copiedShiftData); showToast('Pasted copied shift'); }}
                    title="Paste copied shift"
                    style={{ color: 'var(--primary)', padding: '0.35rem', display: 'flex', alignItems: 'center' }}
                  >
                    <ClipboardPaste size={18} />
                  </button>
                )}
                <div className="divider" style={{ margin: '0 0.25rem', height: '1.25rem' }} />
                <button onClick={() => setSelectedShift(null)} style={{ color: 'var(--slate-400)' }}>
                  <X size={20} />
                </button>
              </div>
            </div>

            <div className="modal-body">
              <div className="type-grid">
                <button
                  className={`type-btn ${modalData.type === 'EARLY' ? 'active-EARLY' : ''}`}
                  onClick={() => setModalData({ ...modalData, type: 'EARLY' })}
                >
                  <span className="title">Early</span>
                  <span className="sub">
                    {currentTeam?.shiftTypes?.find(st => st.code === 'EARLY')?.defaultStart || '07:30'} - {currentTeam?.shiftTypes?.find(st => st.code === 'EARLY')?.defaultEnd || '16:00'}
                  </span>
                </button>
                <button
                  className={`type-btn ${modalData.type === 'LATE' ? 'active-LATE' : ''}`}
                  onClick={() => setModalData({ ...modalData, type: 'LATE' })}
                >
                  <span className="title">Late</span>
                  <span className="sub">
                    {currentTeam?.shiftTypes?.find(st => st.code === 'LATE')?.defaultStart || '09:30'} - {currentTeam?.shiftTypes?.find(st => st.code === 'LATE')?.defaultEnd || '18:00'}
                  </span>
                </button>
                <button
                  className={`type-btn ${modalData.type === 'CUSTOM' ? 'active-CUSTOM' : ''}`}
                  onClick={() => setModalData({ ...modalData, type: 'CUSTOM' })}
                >
                  <span className="title">Custom</span>
                  <span className="sub">Specific Hours</span>
                </button>
                <button
                  className={`type-btn ${modalData.type === 'SICK' ? 'active-SICK' : ''}`}
                  onClick={() => setModalData({ ...modalData, type: 'SICK' })}
                >
                  <span className="title">Sick</span>
                  <span className="sub">Ziek / Leave</span>
                </button>
                <button
                  className={`type-btn ${modalData.type === 'VACATION' ? 'active-VACATION' : ''}`}
                  onClick={() => setModalData({ ...modalData, type: 'VACATION' })}
                >
                  <span className="title">Vacation</span>
                  <span className="sub">Vakantie</span>
                </button>
                <button
                  className={`type-btn ${modalData.type === 'OFF' ? 'active-OFF' : ''}`}
                  onClick={() => setModalData({ ...modalData, type: 'OFF' })}
                >
                  <span className="title">Off</span>
                  <span className="sub">No shift</span>
                </button>
              </div>

              {(modalData.type === 'SICK' || modalData.type === 'VACATION') && (
                <div>
                  <label className="label"><Calendar size={14} /> End Date (for multi-day period)</label>
                  <input
                    type="date"
                    className="input"
                    value={modalData.endDate}
                    onChange={e => setModalData({ ...modalData, endDate: e.target.value })}
                  />
                </div>
              )}

              {modalData.type === 'CUSTOM' && (
                <div className="custom-times">
                  <div style={{ flex: 1 }}>
                    <label className="label"><Clock size={14} /> Start Time</label>
                    <input
                      type="time"
                      className="input"
                      value={modalData.customStart}
                      onChange={e => setModalData({ ...modalData, customStart: e.target.value })}
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label className="label"><Clock size={14} /> End Time</label>
                    <input
                      type="time"
                      className="input"
                      value={modalData.customEnd}
                      onChange={e => setModalData({ ...modalData, customEnd: e.target.value })}
                    />
                  </div>
                </div>
              )}

              {modalData.type !== 'OFF' && (
                <>
                  {modalData.type !== 'SICK' && modalData.type !== 'VACATION' && (
                    <div>
                      <label className="label">Location</label>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        <div className="loc-toggle">
                          <button
                            className={modalData.location === 'OFFICE' || modalData.location === 'Kantoor' ? 'active-OFFICE' : ''}
                            onClick={() => setModalData({ ...modalData, location: 'OFFICE' })}
                          >
                            <Building size={14} style={{ display: 'inline', marginRight: '4px' }} /> Office
                          </button>
                          <button
                            className={modalData.location === 'HOME' || modalData.location === 'Thuis' ? 'active-HOME' : ''}
                            onClick={() => setModalData({ ...modalData, location: 'HOME' })}
                          >
                            <HomeIcon size={14} style={{ display: 'inline', marginRight: '4px' }} /> Home
                          </button>
                        </div>
                        <input
                          type="text"
                          placeholder="Or type a custom client/site location (e.g. HQ, Amsterdam Office)"
                          className="input"
                          value={modalData.location === 'OFFICE' || modalData.location === 'HOME' ? '' : modalData.location}
                          onChange={e => setModalData({ ...modalData, location: e.target.value })}
                        />
                      </div>
                    </div>
                  )}

                  {modalData.type === 'CUSTOM' && (
                    <div>
                      <label className="label">Shift Color (MS Teams Theme)</label>
                      <div className="loc-toggle">
                        <button
                          className={modalData.color === 'PINK' ? 'active-HOME' : ''}
                          onClick={() => setModalData({ ...modalData, color: 'PINK' })}
                        >
                          Pink (Default)
                        </button>
                        <button
                          className={modalData.color === 'GREEN' ? 'active-OFFICE' : ''}
                          onClick={() => setModalData({ ...modalData, color: 'GREEN' })}
                        >
                          Green
                        </button>
                        <button
                          className={modalData.color === 'BLUE' ? 'active-HOME' : ''}
                          onClick={() => setModalData({ ...modalData, color: 'BLUE' })}
                        >
                          Blue
                        </button>
                      </div>
                    </div>
                  )}

                  <div>
                    <label className="label"><FileText size={14} /> Notes (Task, Client, Info)</label>
                    <input
                      type="text"
                      placeholder="e.g. Client X On-call, Standby..."
                      className="input"
                      value={modalData.notes}
                      onChange={e => setModalData({ ...modalData, notes: e.target.value })}
                    />
                  </div>

                  {/* Multi-member assign */}
                  {employees.length > 1 && (
                    <div>
                      <label className="label"><Users size={14} /> Also apply to other members on this day:</label>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', maxHeight: '100px', overflowY: 'auto' }}>
                        {employees
                          .filter(e => e.id !== selectedShift.empId)
                          .map(emp => {
                            const isSelected = copyToEmpIds.includes(emp.id);
                            return (
                              <button
                                key={emp.id}
                                type="button"
                                onClick={() => {
                                  if (isSelected) setCopyToEmpIds(copyToEmpIds.filter(id => id !== emp.id));
                                  else setCopyToEmpIds([...copyToEmpIds, emp.id]);
                                }}
                                style={{
                                  padding: '0.25rem 0.6rem',
                                  borderRadius: 'var(--radius-sm)',
                                  fontSize: '0.75rem',
                                  fontWeight: 600,
                                  background: isSelected ? 'var(--primary)' : 'var(--slate-800)',
                                  color: isSelected ? 'white' : 'var(--slate-300)',
                                  border: '1px solid var(--border)',
                                }}
                              >
                                {emp.name}
                              </button>
                            );
                          })}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>

            <div className="modal-footer">
              <button
                className="btn"
                style={{ color: '#ef4444', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.25)' }}
                onClick={clearShift}
              >
                <Trash2 size={16} /> Clear Shift
              </button>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button className="btn btn-secondary" onClick={() => setSelectedShift(null)}>
                  Cancel
                </button>
                <button className="btn btn-primary" onClick={saveShift}>
                  Save Shift
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* RULES ENGINE & CONSTRAINTS MODAL */}
      {rulesModalOpen && currentTeam && (
        <RulesModal
          team={currentTeam}
          employees={employees}
          teamGroups={teamGroups}
          onClose={() => setRulesModalOpen(false)}
          onRulesUpdated={() => {
            loadTeams();
            loadData();
            showToast('Rules successfully updated!');
          }}
          tab={rulesTab}
          setTab={setRulesTab}
          onOpenAddGroup={() => {
            setNewGroupName('');
            setNewGroupModalOpen(true);
          }}
          onPromptDeleteGroup={(groupId, groupName, count) => {
            const otherGroups = teamGroups.filter(g => g.id !== groupId);
            setReassignTargetGroup(otherGroups[0]?.id || '');
            setDeleteGroupMembersAction('reassign');
            setDeleteGroupModalOpen({
              id: groupId,
              name: groupName,
              memberCount: count,
            });
          }}
          onOpenRenameGroup={(groupId, currentName) => {
            setRenameGroupModalOpen({ id: groupId, name: currentName });
            setRenameGroupName(currentName);
          }}
          onEditMember={(emp) => {
            setRulesModalOpen(false);
            setMemberEditModalOpen(emp);
          }}
        />
      )}

      {/* MEMBER CONSTRAINTS MODAL */}
      {memberEditModalOpen && (
        <MemberEditModal
          employee={memberEditModalOpen}
          teamGroups={teamGroups}
          teamBreakMinutes={currentTeam?.breakMinutes || 30}
          onClose={() => setMemberEditModalOpen(null)}
          onSave={saveMemberConstraints}
        />
      )}

      {/* NEW GROUP MODAL */}
      {newGroupModalOpen && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setNewGroupModalOpen(false); }}>
          <div className="modal-content" style={{ maxWidth: '480px' }}>
            <div className="modal-header">
              <h2><Layers size={18} style={{ color: 'var(--primary)' }} /> Add New Group</h2>
              <button onClick={() => setNewGroupModalOpen(false)} style={{ color: 'var(--slate-400)' }}>
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleCreateGroup}>
              <div className="modal-body">
                <div>
                  <label className="label">Group Name</label>
                  <input
                    type="text"
                    required
                    autoFocus
                    className="input"
                    placeholder="e.g. Front Office, Back Office, Interns..."
                    value={newGroupName}
                    onChange={e => setNewGroupName(e.target.value)}
                  />
                  <div style={{ fontSize: '0.75rem', color: 'var(--slate-400)', marginTop: '0.4rem' }}>
                    Creates a dedicated section for this group on the schedule grid and groups members in Microsoft Teams Shifts exports.
                  </div>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setNewGroupModalOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={groupLoading || !newGroupName.trim()}>
                  <Plus size={16} /> {groupLoading ? 'Creating...' : 'Create Group'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* RENAME GROUP MODAL */}
      {renameGroupModalOpen && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setRenameGroupModalOpen(null); }}>
          <div className="modal-content" style={{ maxWidth: '480px' }}>
            <div className="modal-header">
              <h2><Edit2 size={18} style={{ color: 'var(--primary)' }} /> Rename Group</h2>
              <button onClick={() => setRenameGroupModalOpen(null)} style={{ color: 'var(--slate-400)' }}>
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleRenameGroup}>
              <div className="modal-body">
                <div>
                  <label className="label">Group Name</label>
                  <input
                    type="text"
                    required
                    autoFocus
                    className="input"
                    value={renameGroupName}
                    onChange={e => setRenameGroupName(e.target.value)}
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setRenameGroupModalOpen(null)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={groupLoading || !renameGroupName.trim()}>
                  {groupLoading ? 'Saving...' : 'Save Name'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DELETE GROUP MODAL */}
      {deleteGroupModalOpen && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setDeleteGroupModalOpen(null); }}>
          <div className="modal-content" style={{ maxWidth: '520px' }}>
            <div className="modal-header">
              <h2><Trash2 size={18} style={{ color: 'var(--danger)' }} /> Delete Group: {deleteGroupModalOpen.name}</h2>
              <button onClick={() => setDeleteGroupModalOpen(null)} style={{ color: 'var(--slate-400)' }}>
                <X size={20} />
              </button>
            </div>
            <div className="modal-body">
              {deleteGroupModalOpen.memberCount === 0 ? (
                <div>
                  <p style={{ color: 'var(--slate-200)', marginBottom: '0.5rem' }}>
                    Are you sure you want to delete the group <strong>&quot;{deleteGroupModalOpen.name}&quot;</strong>?
                  </p>
                  <p style={{ fontSize: '0.8rem', color: 'var(--slate-400)' }}>
                    This group currently has 0 members and will be permanently removed.
                  </p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <div style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', padding: '0.85rem 1rem', borderRadius: 'var(--radius)' }}>
                    <div style={{ color: '#fca5a5', fontWeight: 600, fontSize: '0.875rem' }}>
                      This group currently contains {deleteGroupModalOpen.memberCount} member(s).
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--slate-300)', marginTop: '0.25rem' }}>
                      Please choose what to do with the members before deleting the group:
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.6rem', cursor: 'pointer' }}>
                      <input
                        type="radio"
                        name="deleteAction"
                        checked={deleteGroupMembersAction === 'reassign'}
                        onChange={() => setDeleteGroupMembersAction('reassign')}
                        style={{ marginTop: '0.2rem' }}
                      />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 600, fontSize: '0.85rem', color: 'white' }}>
                          Move members to another group:
                        </div>
                        <select
                          className="input"
                          style={{ marginTop: '0.4rem' }}
                          value={reassignTargetGroup}
                          onChange={e => setReassignTargetGroup(e.target.value)}
                          disabled={deleteGroupMembersAction !== 'reassign'}
                        >
                          {teamGroups
                            .filter(g => g.id !== deleteGroupModalOpen.id)
                            .map(g => (
                              <option key={g.id} value={g.id}>
                                {g.name}
                              </option>
                            ))}
                        </select>
                      </div>
                    </label>

                    <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.6rem', cursor: 'pointer' }}>
                      <input
                        type="radio"
                        name="deleteAction"
                        checked={deleteGroupMembersAction === 'delete'}
                        onChange={() => setDeleteGroupMembersAction('delete')}
                        style={{ marginTop: '0.2rem' }}
                      />
                      <div>
                        <div style={{ fontWeight: 600, fontSize: '0.85rem', color: '#f87171' }}>
                          Delete all {deleteGroupModalOpen.memberCount} member(s) and their shifts
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--slate-400)' }}>
                          Permanently deletes these members and all their scheduled shifts.
                        </div>
                      </div>
                    </label>
                  </div>
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" onClick={() => setDeleteGroupModalOpen(null)}>
                Cancel
              </button>
              <button
                type="button"
                className="btn"
                style={{ background: 'var(--danger)', color: 'white' }}
                onClick={handleDeleteGroup}
                disabled={groupLoading || (deleteGroupModalOpen.memberCount > 0 && deleteGroupMembersAction === 'reassign' && !reassignTargetGroup && teamGroups.filter(g => g.id !== deleteGroupModalOpen.id).length === 0)}
              >
                <Trash2 size={16} /> {groupLoading ? 'Deleting...' : 'Delete Group'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CREATE NEW TEAM MODAL */}
      {newTeamModalOpen && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setNewTeamModalOpen(false); }}>
          <div className="modal-content" style={{ maxWidth: '520px' }}>
            <div className="modal-header">
              <h2><Users size={18} /> Create New Team</h2>
              <button onClick={() => setNewTeamModalOpen(false)} style={{ color: 'var(--slate-400)' }}>
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleCreateTeam}>
              <div className="modal-body">
                <div>
                  <label className="label">Team Name *</label>
                  <input
                    type="text"
                    required
                    autoFocus
                    placeholder="e.g. Infrastructure Ops, Customer Support..."
                    className="input"
                    value={teamFormName}
                    onChange={e => setTeamFormName(e.target.value)}
                  />
                </div>
                <div>
                  <label className="label">MS Teams Export Group Name</label>
                  <input
                    type="text"
                    placeholder="Defaults to team name"
                    className="input"
                    value={teamFormExportGroup}
                    onChange={e => setTeamFormExportGroup(e.target.value)}
                  />
                </div>
                <div>
                  <label className="label">Unpaid Break (Minutes)</label>
                  <input
                    type="number"
                    min="0"
                    max="120"
                    className="input"
                    value={teamFormBreak}
                    onChange={e => setTeamFormBreak(Number(e.target.value))}
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setNewTeamModalOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  <Plus size={16} /> Create Team
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* FULL-SCREEN CLIENT MANAGER & EDITOR */}
      {clientModalOpen && (
        <div className="client-fullscreen-screen">
          {/* Header Bar */}
          <div className="client-screen-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
              <button
                className="btn btn-secondary"
                onClick={() => setClientModalOpen(false)}
                style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.45rem 0.85rem' }}
              >
                <ArrowLeft size={16} /> Back to Shifts Schedule
              </button>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <div
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 'var(--radius-lg)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: clientForm.color === 'GREEN' ? 'rgba(16, 185, 129, 0.2)' : clientForm.color === 'BLUE' ? 'rgba(59, 130, 246, 0.2)' : clientForm.color === 'PURPLE' ? 'rgba(168, 85, 247, 0.2)' : clientForm.color === 'ORANGE' ? 'rgba(249, 115, 22, 0.2)' : 'rgba(236, 72, 153, 0.2)',
                    color: clientForm.color === 'GREEN' ? '#34d399' : clientForm.color === 'BLUE' ? '#60a5fa' : clientForm.color === 'PURPLE' ? '#c084fc' : clientForm.color === 'ORANGE' ? '#fb923c' : '#f472b6',
                    border: '1px solid rgba(255,255,255,0.1)',
                  }}
                >
                  <Building2 size={18} />
                </div>
                <div>
                  <h1 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'white', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    {selectedClientId ? clientForm.name || 'Edit Client' : 'New Client'}
                    <span style={{ fontSize: '0.75rem', fontWeight: 600, padding: '0.2rem 0.5rem', borderRadius: 9999, background: 'rgba(99, 102, 241, 0.15)', color: '#a5b4fc', border: '1px solid rgba(99, 102, 241, 0.3)' }}>
                      Team: {currentTeam?.name}
                    </span>
                  </h1>
                </div>
              </div>

              {/* Quick Switch Client Dropdown */}
              {teamClients.length > 0 && (
                <div style={{ marginLeft: '1rem' }}>
                  <select
                    className="input"
                    style={{ padding: '0.4rem 0.75rem', fontSize: '0.85rem', width: 'auto' }}
                    value={selectedClientId || 'new'}
                    onChange={e => {
                      if (e.target.value === 'new') {
                        openClientEditor(null);
                      } else {
                        const target = teamClients.find(c => c.id === e.target.value);
                        if (target) openClientEditor(target);
                      }
                    }}
                  >
                    <option value="new">+ Add Another Client...</option>
                    <optgroup label={`Clients in ${currentTeam?.name}`}>
                      {teamClients.map(c => (
                        <option key={c.id} value={c.id}>
                          {c.name} ({c.frequency === 'EVERY_OTHER_WEEK' ? 'Bi-weekly' : c.frequency === 'EVERY_MONTH' ? 'Monthly' : 'Weekly'})
                        </option>
                      ))}
                    </optgroup>
                  </select>
                </div>
              )}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => applyClientToSchedule(selectedClientId || undefined)}
                disabled={applyingClient || !selectedClientId}
                title="Populate this client's shifts on the current week's schedule"
                style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
              >
                <CalendarCheck size={16} />
                {applyingClient ? 'Applying...' : 'Apply to Current Week'}
              </button>

              <button
                type="button"
                className="btn btn-primary"
                onClick={saveClientForm}
                style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
              >
                <Check size={16} /> Save Client
              </button>

              {selectedClientId && (
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => deleteClient(selectedClientId, clientForm.name)}
                  title="Delete this client"
                  style={{ color: 'var(--danger)', padding: '0.5rem' }}
                >
                  <Trash2 size={16} />
                </button>
              )}

              <button
                type="button"
                className="action-btn"
                onClick={() => setClientModalOpen(false)}
                title="Close"
                style={{ marginLeft: '0.5rem' }}
              >
                <X size={20} />
              </button>
            </div>
          </div>

          {/* Screen Body */}
          <div className="client-screen-body">
            <div className="client-grid-layout">
              {/* LEFT COLUMN: Client Details & Recurrence */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                {/* Card 1: Client Identity & Appearance */}
                <div className="client-card">
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <Building2 size={18} style={{ color: 'var(--accent)' }} />
                      <h2 style={{ fontSize: '1rem', fontWeight: 700, color: 'white' }}>Client Identity & Shift Setup</h2>
                    </div>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem', color: 'var(--slate-300)', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={clientForm.isActive}
                        onChange={e => setClientForm({ ...clientForm, isActive: e.target.checked })}
                      />
                      Active for Auto-fill
                    </label>
                  </div>

                  <div>
                    <label className="label">Client Name *</label>
                    <input
                      type="text"
                      className="input"
                      placeholder="e.g. Acme Corp, Client X, Project Site"
                      value={clientForm.name}
                      onChange={e => setClientForm({ ...clientForm, name: e.target.value })}
                      required
                    />
                  </div>

                  <div>
                    <label className="label">Location Label (Displayed in Shift Card Badge)</label>
                    <input
                      type="text"
                      className="input"
                      placeholder="e.g. Client Site - leave empty to use Client Name"
                      value={clientForm.location}
                      onChange={e => setClientForm({ ...clientForm, location: e.target.value })}
                    />
                  </div>

                  {/* Theme Color Selector */}
                  <div>
                    <label className="label">Shift Color (MS Teams Theme)</label>
                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                      {[
                        { code: 'PINK', label: 'Pink', bg: 'rgba(236, 72, 153, 0.25)', border: '#ec4899' },
                        { code: 'PURPLE', label: 'Purple', bg: 'rgba(168, 85, 247, 0.25)', border: '#a855f7' },
                        { code: 'BLUE', label: 'Blue', bg: 'rgba(59, 130, 246, 0.25)', border: '#3b82f6' },
                        { code: 'GREEN', label: 'Green', bg: 'rgba(16, 185, 129, 0.25)', border: '#10b981' },
                        { code: 'ORANGE', label: 'Orange', bg: 'rgba(249, 115, 22, 0.25)', border: '#f97316' },
                        { code: 'TEAL', label: 'Teal', bg: 'rgba(20, 184, 166, 0.25)', border: '#14b8a6' },
                      ].map(c => (
                        <button
                          key={c.code}
                          type="button"
                          onClick={() => setClientForm({ ...clientForm, color: c.code })}
                          style={{
                            padding: '0.4rem 0.85rem',
                            borderRadius: 'var(--radius)',
                            background: clientForm.color === c.code ? c.bg : 'var(--slate-800)',
                            border: `2px solid ${clientForm.color === c.code ? c.border : 'var(--slate-700)'}`,
                            color: clientForm.color === c.code ? 'white' : 'var(--slate-300)',
                            fontWeight: 600,
                            fontSize: '0.8rem',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.4rem',
                            cursor: 'pointer',
                          }}
                        >
                          <div style={{ width: 8, height: 8, borderRadius: '50%', background: c.border }} />
                          {c.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Shift Timing */}
                  <div>
                    <label className="label">Shift Hours (Start & End Time)</label>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                      <div>
                        <span style={{ fontSize: '0.75rem', color: 'var(--slate-400)' }}>Start Time</span>
                        <input
                          type="time"
                          className="input"
                          value={clientForm.startTime}
                          onChange={e => setClientForm({ ...clientForm, startTime: e.target.value })}
                        />
                      </div>
                      <div>
                        <span style={{ fontSize: '0.75rem', color: 'var(--slate-400)' }}>End Time</span>
                        <input
                          type="time"
                          className="input"
                          value={clientForm.endTime}
                          onChange={e => setClientForm({ ...clientForm, endTime: e.target.value })}
                        />
                      </div>
                    </div>
                    {/* Quick Presets */}
                    <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.5rem' }}>
                      {[
                        { s: '07:30', e: '16:00', label: 'Early (07:30 - 16:00)' },
                        { s: '08:30', e: '17:00', label: 'Standard (08:30 - 17:00)' },
                        { s: '09:30', e: '18:00', label: 'Late (09:30 - 18:00)' },
                      ].map(p => (
                        <button
                          key={p.label}
                          type="button"
                          onClick={() => setClientForm({ ...clientForm, startTime: p.s, endTime: p.e })}
                          style={{
                            padding: '0.2rem 0.5rem',
                            fontSize: '0.72rem',
                            borderRadius: 'var(--radius-xs)',
                            background: 'var(--slate-800)',
                            color: 'var(--slate-300)',
                            border: '1px solid var(--slate-700)',
                          }}
                        >
                          {p.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="label">Custom Shift Notes (Optional - left blank by default)</label>
                    <input
                      type="text"
                      className="input"
                      placeholder="e.g. On-call, Standby (leave empty for no note)"
                      value={clientForm.notes}
                      onChange={e => setClientForm({ ...clientForm, notes: e.target.value })}
                    />
                  </div>
                </div>

                {/* Card 2: Recurrence Pattern & Days of Week */}
                <div className="client-card">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <CalendarDays size={18} style={{ color: 'var(--primary)' }} />
                    <h2 style={{ fontSize: '1rem', fontWeight: 700, color: 'white' }}>Recurrence Schedule & Frequency</h2>
                  </div>

                  {/* Frequency Buttons */}
                  <div>
                    <label className="label">How often does this client require coverage?</label>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem' }}>
                      {[
                        { id: 'EVERY_WEEK', label: 'Every Week', desc: 'Weekly recurrence' },
                        { id: 'EVERY_OTHER_WEEK', label: 'Every Other Week', desc: 'Bi-weekly (2-week cycle)' },
                        { id: 'EVERY_MONTH', label: 'Every Month', desc: 'Monthly recurrence' },
                      ].map(f => (
                        <button
                          key={f.id}
                          type="button"
                          onClick={() => setClientForm({ ...clientForm, frequency: f.id as any })}
                          style={{
                            padding: '0.75rem 0.6rem',
                            borderRadius: 'var(--radius)',
                            background: clientForm.frequency === f.id ? 'rgba(99, 102, 241, 0.2)' : 'var(--slate-800)',
                            border: `2px solid ${clientForm.frequency === f.id ? 'var(--primary)' : 'var(--slate-700)'}`,
                            color: clientForm.frequency === f.id ? 'white' : 'var(--slate-300)',
                            textAlign: 'center',
                            cursor: 'pointer',
                          }}
                        >
                          <div style={{ fontWeight: 700, fontSize: '0.85rem' }}>{f.label}</div>
                          <div style={{ fontSize: '0.72rem', color: 'var(--slate-400)', marginTop: 2 }}>{f.desc}</div>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Bi-weekly (Every other week) Parity Options */}
                  {clientForm.frequency === 'EVERY_OTHER_WEEK' && (
                    <div style={{ background: 'rgba(15, 23, 42, 0.7)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '1rem' }}>
                      <label className="label" style={{ marginBottom: '0.5rem' }}>Bi-Weekly Cycle (ISO Week Parity)</label>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                        <button
                          type="button"
                          onClick={() => setClientForm({ ...clientForm, weekParity: 'ODD' })}
                          style={{
                            padding: '0.55rem',
                            borderRadius: 'var(--radius-sm)',
                            background: clientForm.weekParity === 'ODD' ? 'rgba(16, 185, 129, 0.2)' : 'var(--slate-800)',
                            border: `1.5px solid ${clientForm.weekParity === 'ODD' ? '#10b981' : 'var(--slate-700)'}`,
                            color: clientForm.weekParity === 'ODD' ? 'white' : 'var(--slate-400)',
                            fontWeight: 600,
                            fontSize: '0.82rem',
                          }}
                        >
                          Odd Weeks (1, 3, 5, 7, 9...)
                        </button>
                        <button
                          type="button"
                          onClick={() => setClientForm({ ...clientForm, weekParity: 'EVEN' })}
                          style={{
                            padding: '0.55rem',
                            borderRadius: 'var(--radius-sm)',
                            background: clientForm.weekParity === 'EVEN' ? 'rgba(16, 185, 129, 0.2)' : 'var(--slate-800)',
                            border: `1.5px solid ${clientForm.weekParity === 'EVEN' ? '#10b981' : 'var(--slate-700)'}`,
                            color: clientForm.weekParity === 'EVEN' ? 'white' : 'var(--slate-400)',
                            fontWeight: 600,
                            fontSize: '0.82rem',
                          }}
                        >
                          Even Weeks (2, 4, 6, 8, 10...)
                        </button>
                      </div>

                      {/* Current Week Status Banner */}
                      {(() => {
                        const curWk = getISOWeek(start);
                        const isCurActive = (clientForm.weekParity === 'ODD' && curWk % 2 === 1) || (clientForm.weekParity === 'EVEN' && curWk % 2 === 0);
                        return (
                          <div style={{ marginTop: '0.75rem', padding: '0.5rem 0.75rem', borderRadius: 'var(--radius-xs)', background: isCurActive ? 'rgba(16, 185, 129, 0.15)' : 'rgba(148, 163, 184, 0.1)', border: `1px solid ${isCurActive ? 'rgba(16, 185, 129, 0.3)' : 'rgba(148, 163, 184, 0.2)'}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.8rem' }}>
                            <span style={{ color: isCurActive ? '#34d399' : '#94a3b8' }}>
                              Current Week (ISO Week {curWk}) is:
                            </span>
                            <span style={{ fontWeight: 700, color: isCurActive ? '#34d399' : '#cbd5e1' }}>
                              {isCurActive ? '✅ ACTIVE WEEK (Shift Will Trigger)' : '⏸️ OFF WEEK (No Shift Scheduled)'}
                            </span>
                          </div>
                        );
                      })()}
                    </div>
                  )}

                  {/* Monthly Week Options */}
                  {clientForm.frequency === 'EVERY_MONTH' && (
                    <div style={{ background: 'rgba(15, 23, 42, 0.7)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '1rem' }}>
                      <label className="label">Which week of the month?</label>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.5rem' }}>
                        {[1, 2, 3, 4].map(w => (
                          <button
                            key={w}
                            type="button"
                            onClick={() => setClientForm({ ...clientForm, monthlyWeek: w })}
                            style={{
                              padding: '0.55rem',
                              borderRadius: 'var(--radius-sm)',
                              background: clientForm.monthlyWeek === w ? 'rgba(99, 102, 241, 0.2)' : 'var(--slate-800)',
                              border: `1.5px solid ${clientForm.monthlyWeek === w ? 'var(--primary)' : 'var(--slate-700)'}`,
                              color: clientForm.monthlyWeek === w ? 'white' : 'var(--slate-400)',
                              fontWeight: 600,
                              fontSize: '0.82rem',
                            }}
                          >
                            Week {w}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Days of Week Selector (Mon - Fri) */}
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
                      <label className="label" style={{ margin: 0 }}>Required Days of the Week (Mon - Fri)</label>
                      <div style={{ display: 'flex', gap: '0.4rem' }}>
                        <button
                          type="button"
                          onClick={() => setClientForm({ ...clientForm, days: [3] })}
                          style={{ fontSize: '0.72rem', color: 'var(--primary)', background: 'none' }}
                        >
                          Wed only
                        </button>
                        <span style={{ color: 'var(--slate-600)' }}>•</span>
                        <button
                          type="button"
                          onClick={() => setClientForm({ ...clientForm, days: [1, 2, 3, 4, 5] })}
                          style={{ fontSize: '0.72rem', color: 'var(--primary)', background: 'none' }}
                        >
                          All Weekdays
                        </button>
                      </div>
                    </div>

                    <div className="day-pills-row">
                      {[
                        { day: 1, name: 'Monday', short: 'Mon' },
                        { day: 2, name: 'Tuesday', short: 'Tue' },
                        { day: 3, name: 'Wednesday', short: 'Wed' },
                        { day: 4, name: 'Thursday', short: 'Thu' },
                        { day: 5, name: 'Friday', short: 'Fri' },
                      ].map(d => {
                        const isSelected = clientForm.days.includes(d.day);
                        return (
                          <button
                            key={d.day}
                            type="button"
                            className={`day-pill-btn ${isSelected ? 'active' : ''}`}
                            onClick={() => {
                              if (isSelected) {
                                setDayRequirement(d.day, 0);
                              } else {
                                const prev = clientForm.dailyRequirements[d.day];
                                setDayRequirement(d.day, prev && prev > 0 ? prev : 1);
                              }
                            }}
                          >
                            {d.short}
                          </button>
                        );
                      })}
                    </div>
                    {clientForm.days.length === 0 && (
                      <div style={{ fontSize: '0.75rem', color: '#f87171', marginTop: '0.4rem' }}>
                        Please select at least one day for this client.
                      </div>
                    )}
                  </div>

                  {/* Dynamic Daily Staff Requirements (Mon - Fri) */}
                  <div style={{ background: 'rgba(15, 23, 42, 0.7)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '1rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                      <div>
                        <label className="label" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                          <Users size={15} style={{ color: 'var(--primary)' }} />
                          Daily Staff Requirements (Mon – Fri)
                        </label>
                        <div style={{ fontSize: '0.75rem', color: 'var(--slate-400)' }}>
                          Custom staff count per day (e.g. Monday 1, Tuesday 7, Wednesday 3, etc.)
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '0.72rem', color: 'var(--slate-400)', marginRight: '0.1rem' }}>Bulk set:</span>
                        {[1, 2, 3, 4, 5].map(n => (
                          <button
                            key={n}
                            type="button"
                            onClick={() => bulkSetDayRequirements(n)}
                            title={`Set all 5 weekdays to require ${n} staff`}
                            style={{
                              padding: '0.2rem 0.5rem',
                              fontSize: '0.72rem',
                              fontWeight: 700,
                              borderRadius: 'var(--radius-sm)',
                              background: 'var(--slate-800)',
                              border: '1px solid var(--slate-700)',
                              color: 'var(--slate-300)',
                              cursor: 'pointer',
                              transition: 'all 0.15s ease',
                            }}
                          >
                            {n}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Per-Weekday Steppers and Direct Inputs */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                      {[
                        { day: 1, name: 'Monday', short: 'Mon' },
                        { day: 2, name: 'Tuesday', short: 'Tue' },
                        { day: 3, name: 'Wednesday', short: 'Wed' },
                        { day: 4, name: 'Thursday', short: 'Thu' },
                        { day: 5, name: 'Friday', short: 'Fri' },
                      ].map(d => {
                        const isDayActive = clientForm.days.includes(d.day);
                        const dayCount = isDayActive ? (clientForm.dailyRequirements[d.day] ?? 1) : 0;
                        return (
                          <div
                            key={d.day}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              background: isDayActive ? 'rgba(30, 41, 59, 0.65)' : 'rgba(15, 23, 42, 0.4)',
                              border: `1px solid ${isDayActive ? 'rgba(99, 102, 241, 0.35)' : 'rgba(255, 255, 255, 0.05)'}`,
                              borderRadius: 'var(--radius-sm)',
                              padding: '0.45rem 0.65rem',
                              transition: 'all 0.15s ease',
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                              <button
                                type="button"
                                className={`day-pill-btn ${isDayActive ? 'active' : ''}`}
                                style={{ width: 44, height: 28, fontSize: '0.75rem', margin: 0, padding: 0 }}
                                onClick={() => {
                                  if (isDayActive) {
                                    setDayRequirement(d.day, 0);
                                  } else {
                                    const prev = clientForm.dailyRequirements[d.day];
                                    setDayRequirement(d.day, prev && prev > 0 ? prev : 1);
                                  }
                                }}
                                title={isDayActive ? `Click to mark ${d.name} inactive` : `Click to activate ${d.name}`}
                              >
                                {d.short}
                              </button>
                              <div>
                                <span style={{ fontWeight: 600, fontSize: '0.85rem', color: isDayActive ? 'white' : 'var(--slate-500)' }}>
                                  {d.name}
                                </span>
                                <div style={{ fontSize: '0.72rem', color: isDayActive ? (dayCount > 0 ? 'var(--accent)' : 'var(--slate-400)') : 'var(--slate-600)' }}>
                                  {isDayActive ? (dayCount > 0 ? `${dayCount} ${dayCount === 1 ? 'person required' : 'people required'}` : '0 staff (inactive)') : 'Not scheduled'}
                                </div>
                              </div>
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', background: 'var(--slate-850)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '0.2rem 0.35rem' }}>
                              <button
                                type="button"
                                className="staff-counter-btn"
                                onClick={() => setDayRequirement(d.day, Math.max(0, dayCount - 1))}
                                title={`Decrease staff for ${d.name}`}
                                style={{ width: 26, height: 26 }}
                              >
                                <Minus size={13} />
                              </button>
                              <input
                                type="number"
                                min={0}
                                max={50}
                                className="clean-number-input"
                                value={dayCount}
                                onChange={e => {
                                  const val = parseInt(e.target.value, 10);
                                  setDayRequirement(d.day, isNaN(val) ? 0 : Math.max(0, val));
                                }}
                                style={{
                                  width: 44,
                                  background: 'transparent',
                                  border: 'none',
                                  color: dayCount > 0 ? 'white' : 'var(--slate-500)',
                                  fontWeight: 800,
                                  fontSize: '0.95rem',
                                  textAlign: 'center',
                                  padding: 0,
                                  outline: 'none',
                                }}
                              />
                              <button
                                type="button"
                                className="staff-counter-btn"
                                onClick={() => setDayRequirement(d.day, dayCount + 1)}
                                title={`Increase staff for ${d.name}`}
                                style={{ width: 26, height: 26 }}
                              >
                                <Plus size={13} />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>

              {/* RIGHT COLUMN: Assigned Members & Forecast */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                {/* Card 3: Assigned Members (Add Solely via Searchbar & Set Weekly Days) */}
                <div className="client-card">
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <Users size={18} style={{ color: 'var(--accent)' }} />
                      <h2 style={{ fontSize: '1rem', fontWeight: 700, color: 'white' }}>
                        Assigned Team Members ({clientForm.assignedEmployeeIds.length})
                      </h2>
                    </div>
                    {clientForm.assignedEmployeeIds.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setClientForm({ ...clientForm, assignedEmployeeIds: [], memberDayMap: {} })}
                        style={{ fontSize: '0.75rem', color: '#f87171', background: 'none', cursor: 'pointer' }}
                      >
                        Remove All
                      </button>
                    )}
                  </div>

                  {/* Add Member Solely via Searchbar */}
                  <div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--slate-400)', marginBottom: '0.45rem' }}>
                      Add team members solely by typing in the search bar. Then toggle which days each member goes:
                    </div>
                    <div className="client-search-wrapper">
                      <div style={{ position: 'relative' }}>
                        <Search size={16} style={{ position: 'absolute', left: 12, top: 11, color: 'var(--slate-400)', pointerEvents: 'none' }} />
                        <input
                          type="text"
                          className="input"
                          placeholder="Search and add team member to client..."
                          value={clientMemberSearch}
                          onChange={e => setClientMemberSearch(e.target.value)}
                          style={{ paddingLeft: '2.4rem', fontSize: '0.85rem' }}
                        />
                        {clientMemberSearch && (
                          <button
                            type="button"
                            onClick={() => setClientMemberSearch('')}
                            style={{ position: 'absolute', right: 10, top: 8, background: 'none', color: 'var(--slate-400)', cursor: 'pointer' }}
                          >
                            <X size={16} />
                          </button>
                        )}
                      </div>

                      {/* Search Dropdown Results */}
                      {clientMemberSearch.trim().length > 0 && (
                        <div className="client-search-dropdown">
                          {(() => {
                            const unassigned = employees.filter(
                              emp => !clientForm.assignedEmployeeIds.includes(emp.id) &&
                                (emp.name.toLowerCase().includes(clientMemberSearch.toLowerCase()) ||
                                 (emp.email && emp.email.toLowerCase().includes(clientMemberSearch.toLowerCase())))
                            );
                            if (unassigned.length === 0) {
                              return (
                                <div style={{ padding: '0.85rem', textAlign: 'center', fontSize: '0.8rem', color: 'var(--slate-400)' }}>
                                  No matching unassigned team members found.
                                </div>
                              );
                            }
                            return unassigned.map(emp => (
                              <div
                                key={emp.id}
                                className="client-search-item"
                                onClick={() => addMemberToClient(emp.id)}
                              >
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                                  <div
                                    style={{
                                      width: 28,
                                      height: 28,
                                      borderRadius: '50%',
                                      background: 'linear-gradient(135deg, #6366f1, #a855f7)',
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      fontWeight: 700,
                                      fontSize: '0.75rem',
                                      color: 'white',
                                    }}
                                  >
                                    {emp.name.charAt(0).toUpperCase()}
                                  </div>
                                  <div>
                                    <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'white' }}>{emp.name}</div>
                                    {emp.email && <div style={{ fontSize: '0.7rem', color: 'var(--slate-400)' }}>{emp.email}</div>}
                                  </div>
                                </div>
                                <button
                                  type="button"
                                  className="btn btn-primary"
                                  style={{ padding: '0.25rem 0.65rem', fontSize: '0.75rem' }}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    addMemberToClient(emp.id);
                                  }}
                                >
                                  <Plus size={14} /> Add
                                </button>
                              </div>
                            ));
                          })()}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Members list with Mon-Fri toggle pills */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem', maxHeight: 380, overflowY: 'auto' }}>
                    {clientForm.assignedEmployeeIds.length === 0 ? (
                      <div style={{ padding: '2rem 1rem', textAlign: 'center', background: 'rgba(15, 23, 42, 0.4)', borderRadius: 'var(--radius)', border: '1px dashed var(--border)' }}>
                        <Users size={32} style={{ color: 'var(--slate-500)', margin: '0 auto 0.5rem auto' }} />
                        <div style={{ fontWeight: 600, color: 'white', fontSize: '0.9rem' }}>No team members assigned yet</div>
                        <div style={{ fontSize: '0.78rem', color: 'var(--slate-400)', marginTop: 4 }}>
                          Use the search bar above to find and add team members to this client.
                        </div>
                      </div>
                    ) : (
                      clientForm.assignedEmployeeIds.map(empId => {
                        const emp = employees.find(e => e.id === empId);
                        if (!emp) return null;
                        const memberDays = getClientMemberDays(emp.id);
                        const dayLabels = ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
                        const scheduledDaysText = memberDays.length > 0 ? memberDays.map(d => dayLabels[d]).join(', ') : 'None';

                        return (
                          <div key={emp.id} className="client-member-card">
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                                <div
                                  style={{
                                    width: 32,
                                    height: 32,
                                    borderRadius: '50%',
                                    background: 'linear-gradient(135deg, #6366f1, #a855f7)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontWeight: 700,
                                    fontSize: '0.8rem',
                                    color: 'white',
                                  }}
                                >
                                  {emp.name.charAt(0).toUpperCase()}
                                </div>
                                <div>
                                  <div style={{ fontSize: '0.88rem', fontWeight: 700, color: 'white' }}>{emp.name}</div>
                                  <div style={{ fontSize: '0.72rem', color: 'var(--slate-400)' }}>
                                    {emp.group || 'Team Member'} {emp.email ? `• ${emp.email}` : ''}
                                  </div>
                                </div>
                              </div>

                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <span
                                  style={{
                                    fontSize: '0.72rem',
                                    fontWeight: 700,
                                    padding: '0.2rem 0.55rem',
                                    borderRadius: 9999,
                                    background: memberDays.length > 0 ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                                    color: memberDays.length > 0 ? '#34d399' : '#f87171',
                                    border: `1px solid ${memberDays.length > 0 ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
                                  }}
                                >
                                  {memberDays.length} {memberDays.length === 1 ? 'day/wk' : 'days/wk'} ({scheduledDaysText})
                                </span>
                                <button
                                  type="button"
                                  className="action-btn delete"
                                  onClick={() => removeMemberFromClient(emp.id)}
                                  title={`Remove ${emp.name} from client`}
                                  style={{ opacity: 1, padding: '0.35rem', color: 'var(--slate-400)' }}
                                >
                                  <Trash2 size={16} />
                                </button>
                              </div>
                            </div>

                            {/* Day Selection Row for this Member */}
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', background: 'rgba(0,0,0,0.25)', padding: '0.45rem 0.65rem', borderRadius: 'var(--radius)' }}>
                              <span style={{ fontSize: '0.75rem', color: 'var(--slate-400)', fontWeight: 600 }}>
                                Days on Client:
                              </span>
                              <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                                {[
                                  { day: 1, short: 'Mon' },
                                  { day: 2, short: 'Tue' },
                                  { day: 3, short: 'Wed' },
                                  { day: 4, short: 'Thu' },
                                  { day: 5, short: 'Fri' },
                                ].map(d => {
                                  const isDayActive = memberDays.includes(d.day);
                                  return (
                                    <button
                                      key={d.day}
                                      type="button"
                                      className={`member-day-pill ${isDayActive ? 'active' : ''}`}
                                      onClick={() => toggleClientMemberDay(emp.id, d.day)}
                                    >
                                      {d.short} {isDayActive ? '✓' : ''}
                                    </button>
                                  );
                                })}
                              </div>
                              <div style={{ display: 'flex', gap: '0.3rem' }}>
                                <button
                                  type="button"
                                  onClick={() => setClientMemberDaysAll(emp.id, [1, 2, 3, 4, 5])}
                                  style={{ fontSize: '0.7rem', color: 'var(--primary)', background: 'none', cursor: 'pointer' }}
                                >
                                  All
                                </button>
                                <span style={{ color: 'var(--slate-600)', fontSize: '0.7rem' }}>•</span>
                                <button
                                  type="button"
                                  onClick={() => setClientMemberDaysAll(emp.id, [])}
                                  style={{ fontSize: '0.7rem', color: 'var(--slate-500)', background: 'none', cursor: 'pointer' }}
                                >
                                  None
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>

                {/* Card 4: Integrated Day-by-Day Coverage & Member Overview */}
                <div className="client-card">
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <CalendarCheck size={18} style={{ color: 'var(--success)' }} />
                      <h2 style={{ fontSize: '1rem', fontWeight: 700, color: 'white' }}>
                        Day-by-Day Coverage & Member Overview
                      </h2>
                    </div>
                    <span style={{ fontSize: '0.75rem', color: 'var(--accent)', fontWeight: 600 }}>
                      Dynamic targets configured per weekday
                    </span>
                  </div>

                  <div style={{ fontSize: '0.8rem', color: 'var(--slate-400)' }}>
                    Weekly breakdown showing which assigned members will be on site for each weekday:
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {[
                      { day: 1, name: 'Monday', short: 'Mon' },
                      { day: 2, name: 'Tuesday', short: 'Tue' },
                      { day: 3, name: 'Wednesday', short: 'Wed' },
                      { day: 4, name: 'Thursday', short: 'Thu' },
                      { day: 5, name: 'Friday', short: 'Fri' },
                    ].map(d => {
                      const isClientActiveDay = clientForm.days.includes(d.day);
                      const required = isClientActiveDay ? (clientForm.dailyRequirements?.[d.day] ?? (clientForm.requiredMembersPerDay || 1)) : 0;
                      const assignedOnThisDay = clientForm.assignedEmployeeIds
                        .map(id => employees.find(e => e.id === id))
                        .filter(Boolean)
                        .filter(emp => getClientMemberDays(emp!.id).includes(d.day));

                      const count = assignedOnThisDay.length;
                      let cardClass = 'empty';
                      if (!isClientActiveDay) cardClass = 'inactive';
                      else if (count >= required && required > 0) cardClass = 'complete';
                      else if (count > 0) cardClass = 'needed';

                      return (
                        <div key={d.day} className={`day-overview-card ${cardClass}`}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                              <span style={{ fontWeight: 700, fontSize: '0.88rem', color: isClientActiveDay ? 'white' : 'var(--slate-500)', minWidth: 80 }}>
                                {d.name}
                              </span>
                              <span style={{ fontSize: '0.75rem', color: isClientActiveDay ? 'var(--slate-400)' : 'var(--slate-600)' }}>
                                {isClientActiveDay ? `Required: ${required} ${required === 1 ? 'person' : 'staff'}` : 'Not scheduled for this client'}
                              </span>
                            </div>

                            {isClientActiveDay && (
                              <span
                                style={{
                                  fontSize: '0.72rem',
                                  fontWeight: 700,
                                  padding: '0.2rem 0.55rem',
                                  borderRadius: 9999,
                                  background: count >= required ? 'rgba(16, 185, 129, 0.2)' : count > 0 ? 'rgba(245, 158, 11, 0.2)' : 'rgba(239, 68, 68, 0.15)',
                                  color: count >= required ? '#34d399' : count > 0 ? '#fbbf24' : '#f87171',
                                  border: `1px solid ${count >= required ? 'rgba(16, 185, 129, 0.4)' : count > 0 ? 'rgba(245, 158, 11, 0.4)' : 'rgba(239, 68, 68, 0.3)'}`,
                                }}
                              >
                                {count >= required ? `✓ ${count}/${required} Complete` : count > 0 ? `⚠ ${count}/${required} (Needs ${required - count} more)` : `✕ 0/${required} Unstaffed`}
                              </span>
                            )}
                          </div>

                          {/* Assigned members list for this day */}
                          {isClientActiveDay && (
                            <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', alignItems: 'center', marginTop: '0.2rem' }}>
                              {assignedOnThisDay.length === 0 ? (
                                <span style={{ fontSize: '0.75rem', color: '#f87171', fontStyle: 'italic' }}>
                                  No team member selected for {d.name}. Toggle "{d.short}" on a member card above.
                                </span>
                              ) : (
                                assignedOnThisDay.map(emp => (
                                  <div
                                    key={emp!.id}
                                    style={{
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: '0.35rem',
                                      background: 'rgba(99, 102, 241, 0.18)',
                                      border: '1px solid rgba(99, 102, 241, 0.4)',
                                      borderRadius: 9999,
                                      padding: '0.15rem 0.55rem',
                                      fontSize: '0.75rem',
                                      color: 'white',
                                      fontWeight: 600,
                                    }}
                                  >
                                    <span>{emp!.name}</span>
                                    <button
                                      type="button"
                                      onClick={() => toggleClientMemberDay(emp!.id, d.day)}
                                      title={`Remove ${emp!.name} from ${d.name}`}
                                      style={{ background: 'none', color: 'var(--slate-400)', cursor: 'pointer', padding: 0, display: 'flex' }}
                                    >
                                      <X size={12} />
                                    </button>
                                  </div>
                                ))
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Card 5: Live 6-Week Forecast Preview */}
                <div className="client-card">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <Repeat size={18} style={{ color: 'var(--accent)' }} />
                    <h2 style={{ fontSize: '1rem', fontWeight: 700, color: 'white' }}>Live 6-Week Recurrence Forecast</h2>
                  </div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--slate-400)' }}>
                    Visual projection verifying how this client will be scheduled across upcoming weeks:
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                    {[0, 1, 2, 3, 4, 5].map(i => {
                      const weekDate = addWeeks(start, i);
                      const wkNum = getISOWeek(weekDate);
                      const mNum = getWeekOfMonth(weekDate);
                      let isWkActive = false;

                      if (clientForm.frequency === 'EVERY_WEEK') {
                        isWkActive = true;
                      } else if (clientForm.frequency === 'EVERY_OTHER_WEEK') {
                        if (clientForm.weekParity === 'ODD') isWkActive = wkNum % 2 === 1;
                        else if (clientForm.weekParity === 'EVEN') isWkActive = wkNum % 2 === 0;
                        else isWkActive = wkNum % 2 === 0;
                      } else if (clientForm.frequency === 'EVERY_MONTH') {
                        isWkActive = mNum === (clientForm.monthlyWeek || 1);
                      }

                      const dayLabels = ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
                      const activeDaysText = clientForm.days.map(d => dayLabels[d]).join(', ');

                      return (
                        <div key={i} className={`forecast-week-card ${isWkActive ? 'active-week' : ''}`}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                            <div style={{ fontWeight: 700, fontSize: '0.85rem', color: isWkActive ? '#34d399' : 'var(--slate-400)', minWidth: 65 }}>
                              Week {wkNum}
                            </div>
                            <div>
                              <div style={{ fontSize: '0.78rem', color: 'white', fontWeight: 500 }}>
                                {format(weekDate, 'MMM d')} – {format(addDays(weekDate, 4), 'MMM d, yyyy')}
                              </div>
                              <div style={{ fontSize: '0.72rem', color: isWkActive ? '#a7f3d0' : 'var(--slate-500)' }}>
                                {isWkActive ? `Scheduled on: ${activeDaysText || 'None'}` : 'No client shift scheduled (Off week)'}
                              </div>
                            </div>
                          </div>
                          <span
                            style={{
                              fontSize: '0.7rem',
                              fontWeight: 700,
                              padding: '0.2rem 0.5rem',
                              borderRadius: 9999,
                              background: isWkActive ? 'rgba(16, 185, 129, 0.25)' : 'rgba(100, 116, 139, 0.2)',
                              color: isWkActive ? '#34d399' : 'var(--slate-400)',
                              border: `1px solid ${isWkActive ? 'rgba(16, 185, 129, 0.4)' : 'rgba(100, 116, 139, 0.3)'}`,
                            }}
                          >
                            {isWkActive ? 'ACTIVE' : 'OFF'}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TEAM SETTINGS MODAL */}
      {teamSettingsModalOpen && currentTeam && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setTeamSettingsModalOpen(false); }}>
          <div className="modal-content" style={{ maxWidth: '540px' }}>
            <div className="modal-header">
              <h2><Settings size={18} /> Team Settings: {currentTeam.name}</h2>
              <button onClick={() => setTeamSettingsModalOpen(false)} style={{ color: 'var(--slate-400)' }}>
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleUpdateTeamSettings}>
              <div className="modal-body">
                <div>
                  <label className="label">Team Name</label>
                  <input
                    type="text"
                    required
                    className="input"
                    value={teamFormName}
                    onChange={e => setTeamFormName(e.target.value)}
                  />
                </div>
                <div>
                  <label className="label">MS Teams Export Group Name</label>
                  <input
                    type="text"
                    className="input"
                    value={teamFormExportGroup}
                    onChange={e => setTeamFormExportGroup(e.target.value)}
                  />
                  <div style={{ fontSize: '0.75rem', color: 'var(--slate-400)', marginTop: '0.25rem' }}>
                    This group title will appear in the exported Microsoft Teams Shifts file.
                  </div>
                </div>
                <div>
                  <label className="label">Unpaid Break Duration (Minutes)</label>
                  <input
                    type="number"
                    min="0"
                    max="180"
                    className="input"
                    value={teamFormBreak}
                    onChange={e => setTeamFormBreak(Number(e.target.value))}
                  />
                  <div style={{ fontSize: '0.75rem', color: 'var(--slate-400)', marginTop: '0.25rem' }}>
                    Default break duration for all team shifts (can be overridden per person).
                  </div>
                </div>

                <div style={{ background: 'rgba(30, 41, 59, 0.4)', padding: '0.85rem 1rem', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>
                  <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--slate-200)', marginBottom: '0.65rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <Clock size={15} style={{ color: 'var(--primary)' }} />
                    Default Shift Hours
                  </div>
                  <div className="form-grid">
                    <div>
                      <label className="label" style={{ fontSize: '0.75rem' }}>Early Shift Start</label>
                      <input
                        type="time"
                        className="input"
                        value={teamFormEarlyStart}
                        onChange={e => setTeamFormEarlyStart(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="label" style={{ fontSize: '0.75rem' }}>Early Shift End</label>
                      <input
                        type="time"
                        className="input"
                        value={teamFormEarlyEnd}
                        onChange={e => setTeamFormEarlyEnd(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="form-grid" style={{ marginTop: '0.6rem' }}>
                    <div>
                      <label className="label" style={{ fontSize: '0.75rem' }}>Late Shift Start</label>
                      <input
                        type="time"
                        className="input"
                        value={teamFormLateStart}
                        onChange={e => setTeamFormLateStart(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="label" style={{ fontSize: '0.75rem' }}>Late Shift End</label>
                      <input
                        type="time"
                        className="input"
                        value={teamFormLateEnd}
                        onChange={e => setTeamFormLateEnd(e.target.value)}
                      />
                    </div>
                  </div>
                </div>
              </div>
              <div className="modal-footer">
                <button
                  type="button"
                  className="btn"
                  style={{ color: 'var(--danger)', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.25)' }}
                  onClick={handleDeleteTeam}
                >
                  <Trash2 size={16} /> Delete Team
                </button>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button type="button" className="btn btn-secondary" onClick={() => setTeamSettingsModalOpen(false)}>
                    Cancel
                  </button>
                  <button type="submit" className="btn btn-primary">
                    Save Changes
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* COPY SHIFTS MODAL */}
      {copyModalOpen && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setCopyModalOpen(false); }}>
          <div className="modal-content" style={{ maxWidth: '720px' }}>
            <div className="modal-header">
              <h2><Copy size={18} /> Copy & Paste Schedule</h2>
              <button onClick={() => setCopyModalOpen(false)} style={{ color: 'var(--slate-400)' }}>
                <X size={20} />
              </button>
            </div>

            <div className="modal-body" style={{ maxHeight: '82vh', overflowY: 'auto' }}>
              {/* 1. CLIPBOARD COPY / PASTE HUB */}
              <div style={{ background: 'rgba(15, 23, 42, 0.65)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '0.85rem 1rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    {copiedWeekBuffer ? (
                      <ClipboardCheck size={20} style={{ color: '#38bdf8' }} />
                    ) : (
                      <ClipboardCopy size={20} style={{ color: 'var(--slate-400)' }} />
                    )}
                    <div>
                      <div style={{ fontWeight: 700, color: 'white', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        Clipboard Memory
                        {copiedWeekBuffer && (
                          <span style={{ fontSize: '0.7rem', padding: '0.1rem 0.4rem', borderRadius: 4, background: 'rgba(56, 189, 248, 0.2)', color: '#38bdf8', border: '1px solid rgba(56, 189, 248, 0.3)' }}>
                            Active ({copiedWeekBuffer.count} shifts)
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--slate-400)' }}>
                        {copiedWeekBuffer
                          ? `Week of ${format(new Date(copiedWeekBuffer.sourceStart), 'MMM d, yyyy')} is ready to paste.`
                          : 'Copy any week into memory to paste across any week in 1 click.'}
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      style={{ padding: '0.35rem 0.7rem', fontSize: '0.75rem' }}
                      onClick={handleCopyWeekToBuffer}
                      title="Copy currently viewed week into clipboard"
                    >
                      <ClipboardCopy size={13} /> Copy Active Week ({format(start, 'MMM d')})
                    </button>
                    {copiedWeekBuffer && (
                      <>
                        <button
                          type="button"
                          className="btn btn-primary"
                          style={{ padding: '0.35rem 0.7rem', fontSize: '0.75rem' }}
                          onClick={() => handlePasteWeekFromBuffer(start)}
                          disabled={copying}
                          title="Paste copied week into currently viewed week"
                        >
                          <ClipboardPaste size={13} /> Paste to Active
                        </button>
                        <button
                          type="button"
                          className="btn btn-secondary"
                          style={{ padding: '0.35rem 0.5rem', fontSize: '0.75rem' }}
                          onClick={handleClearWeekBuffer}
                          title="Clear clipboard"
                        >
                          <Trash2 size={13} />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* 2. INTERACTIVE CALENDAR WEEK SELECTOR (DAY / MONTH / YEAR) */}
              {(() => {
                const firstDay = new Date(calendarViewYear, calendarViewMonth, 1);
                const gridStart = startOfWeek(firstDay, { weekStartsOn: 1 });
                const calendarWeeks: Date[][] = [];
                for (let w = 0; w < 6; w++) {
                  const week: Date[] = [];
                  for (let d = 0; d < 7; d++) {
                    week.push(addDays(gridStart, w * 7 + d));
                  }
                  if (w < 5 || week.some(d => d.getMonth() === calendarViewMonth)) {
                    calendarWeeks.push(week);
                  }
                }
                const monthNames = [
                  'January', 'February', 'March', 'April', 'May', 'June',
                  'July', 'August', 'September', 'October', 'November', 'December'
                ];
                const currentYear = new Date().getFullYear();
                const years = Array.from({ length: 8 }, (_, i) => currentYear - 2 + i);

                return (
                  <div style={{ background: 'rgba(30, 41, 59, 0.45)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '0.9rem', marginTop: '0.75rem' }}>
                    {/* Header Controls (Month / Year / Prev / Next) */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <button
                          type="button"
                          className="btn btn-secondary"
                          style={{ padding: '0.3rem 0.55rem' }}
                          onClick={handlePrevMonth}
                          title="Previous month"
                        >
                          <ChevronLeft size={15} />
                        </button>

                        {/* Month Selector */}
                        <select
                          className="input"
                          style={{ width: '130px', padding: '0.35rem 0.5rem', fontSize: '0.82rem', fontWeight: 600 }}
                          value={calendarViewMonth}
                          onChange={e => setCalendarViewMonth(Number(e.target.value))}
                        >
                          {monthNames.map((m, idx) => (
                            <option key={idx} value={idx}>{m}</option>
                          ))}
                        </select>

                        {/* Year Selector */}
                        <select
                          className="input"
                          style={{ width: '90px', padding: '0.35rem 0.5rem', fontSize: '0.82rem', fontWeight: 600 }}
                          value={calendarViewYear}
                          onChange={e => setCalendarViewYear(Number(e.target.value))}
                        >
                          {years.map(y => (
                            <option key={y} value={y}>{y}</option>
                          ))}
                        </select>

                        <button
                          type="button"
                          className="btn btn-secondary"
                          style={{ padding: '0.3rem 0.55rem' }}
                          onClick={handleNextMonth}
                          title="Next month"
                        >
                          <ChevronRight size={15} />
                        </button>

                        <button
                          type="button"
                          className="btn btn-secondary"
                          style={{ padding: '0.35rem 0.65rem', fontSize: '0.75rem' }}
                          onClick={() => {
                            const now = new Date();
                            setCalendarViewMonth(now.getMonth());
                            setCalendarViewYear(now.getFullYear());
                          }}
                        >
                          This Month
                        </button>
                      </div>

                      {/* Week Jump Presets */}
                      <div style={{ display: 'flex', gap: '0.3rem' }}>
                        <button
                          type="button"
                          className="btn btn-secondary"
                          style={{ padding: '0.3rem 0.55rem', fontSize: '0.72rem' }}
                          onClick={() => selectWeekPreset(1)}
                        >
                          +1 Wk (Next)
                        </button>
                        <button
                          type="button"
                          className="btn btn-secondary"
                          style={{ padding: '0.3rem 0.55rem', fontSize: '0.72rem' }}
                          onClick={() => selectWeekPreset(2)}
                        >
                          +2 Wks
                        </button>
                        <button
                          type="button"
                          className="btn btn-secondary"
                          style={{ padding: '0.3rem 0.55rem', fontSize: '0.72rem' }}
                          onClick={() => selectWeekPreset(3)}
                        >
                          +3 Wks
                        </button>
                        <button
                          type="button"
                          className="btn btn-secondary"
                          style={{ padding: '0.3rem 0.55rem', fontSize: '0.72rem' }}
                          onClick={() => selectWeekPreset(4)}
                        >
                          +4 Wks
                        </button>
                      </div>
                    </div>

                    {/* Interactive Calendar Days Grid */}
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: '0 3px', fontSize: '0.8rem' }}>
                        <thead>
                          <tr>
                            <th style={{ padding: '0.25rem 0.3rem', color: 'var(--slate-400)', fontWeight: 600, fontSize: '0.7rem', textAlign: 'center', width: '45px' }}>Wk</th>
                            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(dayName => (
                              <th key={dayName} style={{ padding: '0.25rem 0.3rem', color: 'var(--slate-400)', fontWeight: 600, fontSize: '0.72rem', textAlign: 'center' }}>
                                {dayName}
                              </th>
                            ))}
                            <th style={{ padding: '0.25rem 0.3rem', color: 'var(--slate-400)', fontWeight: 600, fontSize: '0.7rem', textAlign: 'center', width: '75px' }}>Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {calendarWeeks.map((week, wIdx) => {
                            const weekStart = week[0];
                            const isTarget = isSameDay(weekStart, targetWeekDate);
                            const isSource = isSameDay(weekStart, start);

                            return (
                              <tr
                                key={wIdx}
                                onClick={() => handleSelectCalendarDay(weekStart)}
                                style={{
                                  cursor: 'pointer',
                                  background: isTarget
                                    ? 'rgba(59, 130, 246, 0.25)'
                                    : isSource
                                    ? 'rgba(245, 158, 11, 0.12)'
                                    : 'rgba(30, 41, 59, 0.25)',
                                  outline: isTarget
                                    ? '2px solid var(--primary)'
                                    : isSource
                                    ? '1px dashed rgba(245, 158, 11, 0.6)'
                                    : '1px solid rgba(51, 65, 85, 0.3)',
                                  borderRadius: '6px',
                                  transition: 'all 0.15s ease',
                                }}
                              >
                                <td style={{ textAlign: 'center', fontSize: '0.68rem', color: 'var(--slate-400)', fontWeight: 600, padding: '0.4rem 0.2rem' }}>
                                  #{wIdx + 1}
                                </td>
                                {week.map((day, dIdx) => {
                                  const inCurrentMonth = day.getMonth() === calendarViewMonth;
                                  const isToday = isSameDay(day, new Date());
                                  return (
                                    <td
                                      key={dIdx}
                                      style={{
                                        textAlign: 'center',
                                        padding: '0.4rem 0.2rem',
                                        fontWeight: isTarget ? 700 : inCurrentMonth ? 500 : 400,
                                        color: isTarget
                                          ? 'white'
                                          : inCurrentMonth
                                          ? 'var(--slate-200)'
                                          : 'var(--slate-600)',
                                      }}
                                    >
                                      <span>{day.getDate()}</span>
                                      {isToday && (
                                        <div style={{ width: 4, height: 4, borderRadius: '50%', background: '#38bdf8', margin: '2px auto 0' }} />
                                      )}
                                    </td>
                                  );
                                })}
                                <td style={{ textAlign: 'center', padding: '0.25rem 0.3rem' }}>
                                  {isTarget && (
                                    <span style={{ fontSize: '0.65rem', fontWeight: 700, padding: '0.12rem 0.4rem', borderRadius: 4, background: 'var(--primary)', color: 'white' }}>
                                      Target
                                    </span>
                                  )}
                                  {isSource && !isTarget && (
                                    <span style={{ fontSize: '0.65rem', fontWeight: 700, padding: '0.12rem 0.4rem', borderRadius: 4, background: 'rgba(245, 158, 11, 0.3)', color: '#fbbf24' }}>
                                      Source
                                    </span>
                                  )}
                                  {!isTarget && !isSource && (
                                    <span style={{ fontSize: '0.65rem', color: 'var(--slate-500)' }}>
                                      Click
                                    </span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    <div style={{ fontSize: '0.72rem', color: 'var(--slate-400)', marginTop: '0.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span>Click any week row to choose it as your target copy destination.</span>
                      <span style={{ color: 'var(--slate-300)' }}>{monthNames[calendarViewMonth]} {calendarViewYear}</span>
                    </div>
                  </div>
                );
              })()}

              {/* 3. SOURCE & TARGET SUMMARY */}
              <div style={{ marginTop: '0.85rem', background: 'rgba(15, 23, 42, 0.5)', padding: '0.85rem 1rem', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem' }}>
                  <div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--slate-400)', textTransform: 'uppercase', fontWeight: 700 }}>Source Week</div>
                    <div style={{ fontSize: '0.88rem', fontWeight: 700, color: '#fbbf24' }}>
                      {format(new Date(copySourceDate || start), 'MMM d, yyyy')} – {format(addDays(new Date(copySourceDate || start), 4), 'MMM d, yyyy')}
                    </div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--slate-400)' }}>{shifts.length} active shift(s)</div>
                  </div>

                  <div style={{ fontSize: '1.25rem', color: 'var(--slate-500)' }}>➔</div>

                  <div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--slate-400)', textTransform: 'uppercase', fontWeight: 700 }}>Target Week</div>
                    <div style={{ fontSize: '0.88rem', fontWeight: 700, color: '#60a5fa' }}>
                      {format(targetWeekDate, 'MMM d, yyyy')} – {format(addDays(targetWeekDate, 4), 'MMM d, yyyy')}
                    </div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--slate-400)' }}>Will receive copied schedule</div>
                  </div>
                </div>

                <div style={{ marginTop: '0.75rem', paddingTop: '0.65rem', borderTop: '1px solid rgba(51, 65, 85, 0.4)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.78rem', color: 'var(--slate-300)', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={jumpAfterCopy}
                      onChange={e => setJumpAfterCopy(e.target.checked)}
                      style={{ accentColor: 'var(--primary)', width: 15, height: 15 }}
                    />
                    Automatically navigate to target week after copy
                  </label>

                  <div style={{ display: 'flex', gap: '0.4rem' }}>
                    <button
                      type="button"
                      className={`btn ${copyType === 'WEEK' ? 'btn-primary' : 'btn-secondary'}`}
                      style={{ padding: '0.25rem 0.6rem', fontSize: '0.72rem' }}
                      onClick={() => setCopyType('WEEK')}
                    >
                      Entire Week
                    </button>
                    <button
                      type="button"
                      className={`btn ${copyType === 'DAY' ? 'btn-primary' : 'btn-secondary'}`}
                      style={{ padding: '0.25rem 0.6rem', fontSize: '0.72rem' }}
                      onClick={() => setCopyType('DAY')}
                    >
                      Single Day
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div className="modal-footer" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <button className="btn btn-secondary" onClick={() => setCopyModalOpen(false)} disabled={copying}>
                Cancel
              </button>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                {copiedWeekBuffer && (
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => handlePasteWeekFromBuffer(targetWeekDate)}
                    disabled={copying}
                    title="Paste clipboard week onto selected calendar target"
                  >
                    <ClipboardPaste size={15} /> Paste Clipboard to Target
                  </button>
                )}
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={handleCopyShifts}
                  disabled={copying}
                >
                  <Copy size={15} /> {copying ? 'Copying...' : `Copy Week to Target (${format(targetWeekDate, 'MMM d')})`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TOAST NOTIFICATION */}
      {toastMessage && (
        <div className="toast-container">
          <div className={`toast ${toastMessage.type}`}>
            {toastMessage.type === 'success' ? <Check size={18} style={{ color: 'var(--success)' }} /> : <X size={18} style={{ color: 'var(--danger)' }} />}
            <span>{toastMessage.text}</span>
          </div>
        </div>
      )}
      {/* Version Control & Updates Modal */}
      {versionModalOpen && (
        <div className="modal-backdrop version-modal-overlay" onClick={() => setVersionModalOpen(false)}>
          <div className="modal-card version-modal-card" onClick={e => e.stopPropagation()}>
            <div className="modal-header" style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid rgba(51, 65, 85, 0.4)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.9rem' }}>
                <div className="brand-icon" style={{ width: '2.6rem', height: '2.6rem', borderRadius: 12, background: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)', boxShadow: '0 0 15px rgba(59, 130, 246, 0.4)' }}>
                  <Package size={22} color="white" />
                </div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <h2 style={{ fontSize: '1.25rem', fontWeight: 800, margin: 0, letterSpacing: '-0.02em', color: 'white' }}>
                      Version Control & Updates
                    </h2>
                    <span className="badge" style={{ fontSize: '0.7rem', padding: '0.15rem 0.5rem', background: 'rgba(59, 130, 246, 0.2)', color: '#93c5fd', border: '1px solid rgba(59, 130, 246, 0.3)' }}>
                      v{updateInfo?.currentVersion || '1.0.4'}
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
                    window.open('/version', 'TeamsShiftsVersion', 'width=840,height=760,menubar=no,toolbar=no,location=no,status=no,resizable=yes');
                    setVersionModalOpen(false);
                  }}
                  title="Pop out into separate window"
                  style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.78rem', padding: '0.35rem 0.7rem' }}
                >
                  <ExternalLink size={13} /> Pop out screen
                </button>
                <button className="modal-close-btn" onClick={() => setVersionModalOpen(false)}>✕</button>
              </div>
            </div>

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
                    {/* If Update in Progress: Show Dedicated In-App Update Tracking Card */}
                    {isModalUpdatingActive ? (
                      <div className="update-screen-card">
                        {/* Status Top Row */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.85rem' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <div style={{ width: 38, height: 38, borderRadius: 10, background: 'rgba(59, 130, 246, 0.2)', border: '1px solid rgba(59, 130, 246, 0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#60a5fa' }}>
                              {applyState?.status === 'restarting' ? (
                                <CheckCircle2 size={22} color="#34d399" />
                              ) : (
                                <RefreshCw size={20} className="spin-icon" />
                              )}
                            </div>
                            <div>
                              <div style={{ fontWeight: 800, fontSize: '1.05rem', color: 'white', display: 'flex', alignItems: 'center', gap: 8 }}>
                                {modalStepTitle}
                                <span className="badge" style={{ background: 'rgba(59, 130, 246, 0.2)', color: '#93c5fd', border: '1px solid rgba(59, 130, 246, 0.3)', fontSize: '0.72rem' }}>
                                  {modalMasterProgress}%
                                </span>
                              </div>
                              <div style={{ fontSize: '0.78rem', color: 'var(--slate-300)', marginTop: 2 }}>
                                {modalStepDetail}
                              </div>
                            </div>
                          </div>

                          {applyState?.status !== 'restarting' && (
                            <button
                              type="button"
                              className="btn btn-secondary"
                              onClick={cancelModalUpdate}
                              style={{ padding: '0.35rem 0.75rem', fontSize: '0.75rem' }}
                            >
                              Cancel
                            </button>
                          )}
                        </div>

                        {/* Master Progress Track */}
                        <div className="download-progress-track" style={{ height: 10, marginBottom: '1.25rem' }}>
                          <div
                            className="download-progress-bar"
                            style={{
                              width: `${Math.max(4, modalMasterProgress)}%`,
                              background: applyState?.status === 'restarting'
                                ? 'linear-gradient(90deg, #10b981, #34d399)'
                                : 'linear-gradient(90deg, #3b82f6, #38bdf8)',
                            }}
                          />
                        </div>

                        {/* 4-Stage Visual Stepper */}
                        <div className="update-stage-grid">
                          <div className={`update-stage-card ${modalStep === 1 ? 'active' : modalStep > 1 ? 'completed' : 'pending'}`}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                              <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#93c5fd' }}>STAGE 1</span>
                              {modalStep > 1 ? (
                                <Check size={14} color="#34d399" />
                              ) : modalStep === 1 ? (
                                <RefreshCw size={12} className="spin-icon" color="#60a5fa" />
                              ) : (
                                <Clock size={12} color="#64748b" />
                              )}
                            </div>
                            <div style={{ fontWeight: 700, fontSize: '0.8rem', color: 'white' }}>Download Package</div>
                            <div style={{ fontSize: '0.7rem', color: 'var(--slate-400)' }}>
                              {modalDownloadPct > 0 ? `${modalDownloadPct}% • In-App` : 'Release Asset'}
                            </div>
                          </div>

                          <div className={`update-stage-card ${modalStep === 2 ? 'active' : modalStep > 2 ? 'completed' : 'pending'}`}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                              <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#93c5fd' }}>STAGE 2</span>
                              {modalStep > 2 ? (
                                <Check size={14} color="#34d399" />
                              ) : modalStep === 2 ? (
                                <RefreshCw size={12} className="spin-icon" color="#60a5fa" />
                              ) : (
                                <Clock size={12} color="#64748b" />
                              )}
                            </div>
                            <div style={{ fontWeight: 700, fontSize: '0.8rem', color: 'white' }}>Unpack & Stage</div>
                            <div style={{ fontSize: '0.7rem', color: 'var(--slate-400)' }}>
                              {modalStep >= 2 ? 'Staging payload' : 'Pending'}
                            </div>
                          </div>

                          <div className={`update-stage-card ${modalStep === 3 ? 'active' : modalStep > 3 ? 'completed' : 'pending'}`}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                              <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#93c5fd' }}>STAGE 3</span>
                              {modalStep > 3 ? (
                                <Check size={14} color="#34d399" />
                              ) : modalStep === 3 ? (
                                <RefreshCw size={12} className="spin-icon" color="#60a5fa" />
                              ) : (
                                <Clock size={12} color="#64748b" />
                              )}
                            </div>
                            <div style={{ fontWeight: 700, fontSize: '0.8rem', color: 'white' }}>Verify & Secure DB</div>
                            <div style={{ fontSize: '0.7rem', color: 'var(--slate-400)' }}>
                              {modalStep >= 3 ? 'shifts.db preserved' : 'Pending'}
                            </div>
                          </div>

                          <div className={`update-stage-card ${modalStep === 4 ? 'active completed' : 'pending'}`}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                              <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#93c5fd' }}>STAGE 4</span>
                              {modalStep === 4 ? (
                                <Check size={14} color="#34d399" />
                              ) : (
                                <Clock size={12} color="#64748b" />
                              )}
                            </div>
                            <div style={{ fontWeight: 700, fontSize: '0.8rem', color: 'white' }}>Silent Relaunch</div>
                            <div style={{ fontSize: '0.7rem', color: 'var(--slate-400)' }}>
                              {modalStep === 4 ? 'Restarting in 3s' : 'Zero console window'}
                            </div>
                          </div>
                        </div>

                        {/* Terminal Live Event Log */}
                        <div style={{ marginBottom: '0.85rem' }}>
                          <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--slate-400)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.35rem', display: 'flex', alignItems: 'center', gap: 6 }}>
                            <Layers size={13} /> Update Progress Event Log
                          </div>
                          <div className="update-terminal-box" ref={modalTerminalRef}>
                            {combinedModalLogs.length === 0 ? (
                              <div style={{ color: '#64748b', fontStyle: 'italic' }}>Initializing updater sequence...</div>
                            ) : (
                              combinedModalLogs.map((log, idx) => (
                                <div key={idx} className="update-terminal-log">
                                  <span className="update-terminal-time">[{log.time}]</span>
                                  <span className={`update-terminal-text ${log.type || 'info'}`}>
                                    {log.type === 'success' ? '✓ ' : log.type === 'error' ? '✗ ' : '› '}
                                    {log.text}
                                  </span>
                                </div>
                              ))
                            )}
                          </div>
                        </div>

                        {/* Zero-Shell Reassurance Banner */}
                        <div className="update-reassurance-box">
                          <Shield size={18} color="#38bdf8" style={{ flexShrink: 0 }} />
                          <div>
                            <strong>Zero Shell Window:</strong> No command prompt or console window will open. Teams Shifts updates completely silently in the background and will relaunch automatically with your shifts database (<code style={{ color: '#93c5fd' }}>shifts.db</code>) intact.
                          </div>
                        </div>
                      </div>
                    ) : (
                      /* Normal Hero Card & Package Cards */
                      <>
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

                          <div className="version-leap-row">
                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                                <span style={{ fontSize: '0.72rem', color: 'var(--slate-400)', textTransform: 'uppercase', fontWeight: 600 }}>Active Edition</span>
                                {updateInfo?.isInstalled ? (
                                  <span className="badge" style={{ background: 'rgba(59, 130, 246, 0.2)', color: '#93c5fd', border: '1px solid rgba(59, 130, 246, 0.3)', fontSize: '0.62rem' }}>
                                    Full Installed
                                  </span>
                                ) : (
                                  <span className="badge" style={{ background: 'rgba(245, 158, 11, 0.2)', color: '#fcd34d', border: '1px solid rgba(245, 158, 11, 0.3)', fontSize: '0.62rem' }}>
                                    Portable
                                  </span>
                                )}
                              </div>
                              <span style={{ fontSize: '1.15rem', fontWeight: 800, color: 'white', fontFamily: 'monospace' }}>
                                v{updateInfo?.currentVersion || '1.1.7'}
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
                                v{updateInfo?.latestVersion || updateInfo?.currentVersion || '1.1.7'}
                              </span>
                            </div>
                          </div>

                          {/* Update Area if Update Available */}
                          {updateInfo?.hasUpdate && (
                            updateInfo?.isInstalled ? (
                              /* Full Installed Edition: In-app 1-click update with auto-restart */
                              <div style={{ marginTop: '1.25rem', paddingTop: '1rem', borderTop: '1px solid rgba(59, 130, 246, 0.25)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                  <div style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(16, 185, 129, 0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#34d399' }}>
                                    <Sparkles size={18} />
                                  </div>
                                  <div>
                                    <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'white' }}>
                                      1-Click In-App Update Ready
                                    </div>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--slate-300)' }}>
                                      Closes cleanly, runs installer silently, and relaunches automatically with the new version.
                                    </div>
                                  </div>
                                </div>

                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                  <button
                                    type="button"
                                    className="btn"
                                    onClick={() => triggerOneClickUpdateModal('installer')}
                                    style={{
                                      padding: '0.65rem 1.25rem',
                                      fontWeight: 700,
                                      fontSize: '0.85rem',
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: 8,
                                      background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                                      color: 'white',
                                      borderRadius: 8,
                                      border: '1px solid #059669',
                                      boxShadow: '0 4px 15px rgba(16, 185, 129, 0.3)',
                                    }}
                                  >
                                    <Play size={16} /> ⚡ 1-Click Update & Restart
                                  </button>
                                </div>
                              </div>
                            ) : (
                              /* Portable Edition: Notification banner and download links (No in-app update runner) */
                              <div style={{
                                marginTop: '1.25rem',
                                padding: '1rem 1.15rem',
                                background: 'rgba(245, 158, 11, 0.08)',
                                border: '1px solid rgba(245, 158, 11, 0.3)',
                                borderRadius: 10,
                              }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: '0.5rem' }}>
                                  <AlertCircle size={18} style={{ color: '#fbbf24', flexShrink: 0 }} />
                                  <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#fef3c7' }}>
                                    Portable Edition Update Available (v{updateInfo?.latestVersion})
                                  </div>
                                </div>
                                <div style={{ fontSize: '0.78rem', color: '#fde68a', lineHeight: 1.5, marginBottom: '0.85rem' }}>
                                  You are currently using the <strong>Portable Edition</strong> of Teams Shifts.
                                  Automatic in-app updating is exclusive to the <strong>Full Installed Version</strong>.
                                  To update your portable edition, download the latest standalone ZIP below and extract the files to your folder. Your database in <code>shifts.db</code> is kept safe.
                                </div>
                                <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
                                  <a
                                    href={updateInfo?.portableUrl || `https://github.com/${customRepo || updateInfo?.repo || 'Doffo-1/Teams-Shifts'}/releases/latest/download/TeamsShifts-Standalone.zip`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="btn btn-primary"
                                    style={{ padding: '0.5rem 0.9rem', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: 6, textDecoration: 'none' }}
                                  >
                                    <Download size={14} /> Download Portable ZIP (v{updateInfo?.latestVersion})
                                  </a>
                                  <a
                                    href={updateInfo?.downloadUrl || `https://github.com/${customRepo || updateInfo?.repo || 'Doffo-1/Teams-Shifts'}/releases/latest/download/TeamsShifts-Setup.exe`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="btn btn-secondary"
                                    style={{ padding: '0.5rem 0.9rem', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: 6, textDecoration: 'none' }}
                                  >
                                    <Package size={14} /> Switch to Full Version (Setup.exe)
                                  </a>
                                  <a
                                    href={updateInfo?.releaseUrl || `https://github.com/${customRepo || updateInfo?.repo || 'Doffo-1/Teams-Shifts'}/releases`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="btn btn-secondary"
                                    style={{ padding: '0.5rem 0.9rem', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: 6, textDecoration: 'none' }}
                                  >
                                    <ExternalLink size={14} /> View GitHub Release
                                  </a>
                                </div>
                              </div>
                            )
                          )}
                        </div>

                        {/* Package Selection Cards */}
                        <div style={{ marginBottom: '1.25rem' }}>
                          <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--slate-300)', marginBottom: '0.6rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                            Available Packages
                          </div>

                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                            {/* Windows Setup Card (Full Version) */}
                            <div style={{ background: 'rgba(30, 41, 59, 0.6)', border: '1px solid rgba(59, 130, 246, 0.3)', borderRadius: 10, padding: '1rem', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                              <div>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                                  <span style={{ fontSize: '0.92rem', fontWeight: 700, color: 'white' }}>Windows Setup (.exe)</span>
                                  <span className="badge" style={{ background: 'rgba(59, 130, 246, 0.2)', color: '#93c5fd', border: '1px solid rgba(59, 130, 246, 0.3)', fontSize: '0.65rem' }}>
                                    Full Version
                                  </span>
                                </div>
                                <div style={{ fontSize: '0.75rem', color: 'var(--slate-300)', marginBottom: '0.85rem' }}>
                                  Standard Windows installer with Start Menu integration, desktop shortcuts, and seamless in-app automatic updates.
                                </div>
                              </div>

                              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                {updateInfo?.isInstalled && (
                                  <button
                                    type="button"
                                    className="btn version-btn-glow"
                                    onClick={() => triggerOneClickUpdateModal('installer')}
                                    style={{ padding: '0.55rem 0.8rem', fontSize: '0.8rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                                  >
                                    <Download size={14} /> 🚀 Update via Setup In-App
                                  </button>
                                )}
                                <a
                                  href={updateInfo?.downloadUrl || `https://github.com/${customRepo || updateInfo?.repo || 'Doffo-1/Teams-Shifts'}/releases/latest/download/TeamsShifts-Setup.exe`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  style={{ fontSize: '0.68rem', color: 'var(--slate-400)', textAlign: 'center', textDecoration: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}
                                >
                                  <ExternalLink size={11} /> Save exe via browser
                                </a>
                              </div>
                            </div>

                            {/* Portable Edition Card */}
                            <div style={{ background: 'rgba(30, 41, 59, 0.6)', border: '1px solid rgba(71, 85, 105, 0.5)', borderRadius: 10, padding: '1rem', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                              <div>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                                  <span style={{ fontSize: '0.92rem', fontWeight: 700, color: 'white' }}>Portable Edition (.zip)</span>
                                  <span className="badge" style={{ background: 'rgba(100, 116, 139, 0.2)', color: '#cbd5e1', border: '1px solid rgba(100, 116, 139, 0.3)', fontSize: '0.65rem' }}>Portable</span>
                                </div>
                                <div style={{ fontSize: '0.75rem', color: 'var(--slate-300)', marginBottom: '0.85rem' }}>
                                  Standalone portable ZIP. Requires zero installation. Updates are applied manually by extracting over your folder.
                                </div>
                              </div>

                              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                <a
                                  href={updateInfo?.portableUrl || `https://github.com/${customRepo || updateInfo?.repo || 'Doffo-1/Teams-Shifts'}/releases/latest/download/TeamsShifts-Standalone.zip`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="btn btn-secondary"
                                  style={{ padding: '0.55rem 0.8rem', fontSize: '0.8rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, textDecoration: 'none' }}
                                >
                                  <Download size={14} /> Save Portable ZIP via browser
                                </a>
                              </div>
                            </div>
                          </div>
                        </div>
                      </>
                    )}

                    {/* Highlights of latest enhancements */}
                    <div style={{ background: 'rgba(15, 23, 42, 0.6)', border: '1px solid rgba(51, 65, 85, 0.5)', borderRadius: 12, padding: '1rem 1.15rem' }}>
                    <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--slate-300)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.5rem' }}>
                      Recent Release Highlights
                    </div>
                    <div className="version-feature-item">
                      <span className="version-feature-tag tag-fix">FIX</span>
                      <div>
                        <strong>Excel Export Compatibility:</strong> Fully resolved Node 22 module-sync generator polyfill, restoring instant <code>.xlsx</code> roster downloads.
                      </div>
                    </div>
                    <div className="version-feature-item">
                      <span className="version-feature-tag tag-feat">FEAT</span>
                      <div>
                        <strong>Redesigned Software Updates Dashboard:</strong> Comprehensive 3-tab version screen with dual download binaries and diagnostic inspection.
                      </div>
                    </div>
                    <div className="version-feature-item">
                      <span className="version-feature-tag tag-perf">PERF</span>
                      <div>
                        <strong>Zero-Rate-Limit Updates:</strong> Resilient GitHub HTTP redirect engine bypasses API rate limits for reliable update alerts.
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
                        {updateInfo?.releaseName || `Release v${updateInfo?.latestVersion || updateInfo?.currentVersion || '1.0.4'}`}
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
                        Rate-Limit Resilient (REST API + Location Redirect Fallback)
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

              {/* Error Banner if any */}
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
                  onClick={() => checkForUpdates(customRepo)}
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
                    onClick={() => setVersionModalOpen(false)}
                    style={{ fontSize: '0.85rem' }}
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// RULES ENGINE MODAL COMPONENT
function RulesModal({
  team,
  employees,
  teamGroups,
  onClose,
  onRulesUpdated,
  tab,
  setTab,
  onOpenAddGroup,
  onPromptDeleteGroup,
  onOpenRenameGroup,
  onEditMember,
}: {
  team: Team;
  employees: Employee[];
  teamGroups: { id: string; name: string }[];
  onClose: () => void;
  onRulesUpdated: () => void;
  tab: 'team' | 'members' | 'shifts' | 'groups';
  setTab: (t: 'team' | 'members' | 'shifts' | 'groups') => void;
  onOpenAddGroup: () => void;
  onPromptDeleteGroup: (groupId: string, groupName: string, count: number) => void;
  onOpenRenameGroup: (groupId: string, currentName: string) => void;
  onEditMember?: (emp: Employee) => void;
}) {
  const [maxOffice, setMaxOffice] = useState(team.rule?.maxOfficeDaysPerWeek ?? 3);
  const [maxLate, setMaxLate] = useState(team.rule?.maxLateShiftsPerWeek ?? 3);
  const [priorityDay, setPriorityDay] = useState(
    team.rule?.priorityDayOfWeek === 4 && team.rule?.dailyOfficeTargets?.includes('"4":100')
      ? -1
      : (team.rule?.priorityDayOfWeek ?? -1)
  );
  const [minEarly, setMinEarly] = useState(team.rule?.minOfficeEarlyPerDay ?? 1);
  const [minLate, setMinLate] = useState(team.rule?.minLatePerDay ?? 2);

  // Parse daily targets
  let initialTargets: Record<string, number> = { '1': 50, '2': 50, '3': 50, '4': 50, '5': 50 };
  try {
    if (team.rule?.dailyOfficeTargets) {
      initialTargets = JSON.parse(team.rule.dailyOfficeTargets);
      if (initialTargets['4'] === 100 && initialTargets['1'] === 50 && initialTargets['2'] === 50 && initialTargets['3'] === 50 && initialTargets['5'] === 50) {
        initialTargets['4'] = 50;
      }
    }
  } catch {}

  const [targets, setTargets] = useState<Record<string, number>>(initialTargets);
  const [saving, setSaving] = useState(false);

  const saveTeamRules = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/teams/${team.id}/rules`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          maxOfficeDaysPerWeek: maxOffice,
          maxLateShiftsPerWeek: maxLate,
          priorityDayOfWeek: priorityDay,
          dailyOfficeTargets: JSON.stringify(targets),
          minOfficeEarlyPerDay: minEarly,
          minLatePerDay: minLate,
          workingDays: JSON.stringify([1, 2, 3, 4, 5]),
        }),
      });
      if (res.ok) {
        onRulesUpdated();
      }
    } catch (err) {
      console.error(err);
    }
    setSaving(false);
  };

  const setTargetPreset = (preset: 'equal' | 'heavy' | 'full') => {
    if (preset === 'equal') {
      setTargets({ '1': 50, '2': 50, '3': 50, '4': 50, '5': 50 });
      setPriorityDay(-1);
    } else if (preset === 'heavy') {
      setTargets({ '1': 75, '2': 75, '3': 75, '4': 75, '5': 75 });
      setPriorityDay(-1);
    } else if (preset === 'full') {
      setTargets({ '1': 100, '2': 100, '3': 100, '4': 100, '5': 100 });
      setPriorityDay(-1);
    }
  };

  const days = [
    { num: '1', name: 'Monday' },
    { num: '2', name: 'Tuesday' },
    { num: '3', name: 'Wednesday' },
    { num: '4', name: 'Thursday' },
    { num: '5', name: 'Friday' },
  ];

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-content" style={{ maxWidth: '860px' }}>
        <div className="modal-header">
          <h2>
            <Sliders size={20} style={{ color: 'var(--primary)' }} />
            Rules & Constraints: {team.name}
          </h2>
          <button onClick={onClose} style={{ color: 'var(--slate-400)' }}>
            <X size={20} />
          </button>
        </div>

        {/* Tab Headers */}
        <div className="tabs-header">
          <button
            className={`tab-btn ${tab === 'team' ? 'active' : ''}`}
            onClick={() => setTab('team')}
          >
            <Shield size={16} /> Team Scheduling Rules
          </button>
          <button
            className={`tab-btn ${tab === 'members' ? 'active' : ''}`}
            onClick={() => setTab('members')}
          >
            <Users size={16} /> Member Overrides ({employees.length})
          </button>
          <button
            className={`tab-btn ${tab === 'groups' ? 'active' : ''}`}
            onClick={() => setTab('groups')}
          >
            <Layers size={16} /> Groups ({teamGroups.length})
          </button>
        </div>

        <div className="modal-body">
          {tab === 'team' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              {/* Presets */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(30, 41, 59, 0.4)', padding: '0.75rem 1rem', borderRadius: 'var(--radius)' }}>
                <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--slate-300)' }}>Quick Presets:</span>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button type="button" className="btn btn-secondary" style={{ padding: '0.35rem 0.75rem', fontSize: '0.75rem' }} onClick={() => setTargetPreset('equal')}>
                    Equal 50% All Days
                  </button>
                  <button type="button" className="btn btn-secondary" style={{ padding: '0.35rem 0.75rem', fontSize: '0.75rem' }} onClick={() => setTargetPreset('heavy')}>
                    Office Heavy (75%)
                  </button>
                  <button type="button" className="btn btn-secondary" style={{ padding: '0.35rem 0.75rem', fontSize: '0.75rem' }} onClick={() => setTargetPreset('full')}>
                    100% Office
                  </button>
                </div>
              </div>

              {/* Weekly Limits */}
              <div className="form-grid">
                <div className="slider-group">
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <label className="label">Target Office Days / Week</label>
                    <span className="slider-val">{maxOffice} days</span>
                  </div>
                  <input
                    type="range"
                    min="1"
                    max="5"
                    value={maxOffice}
                    onChange={e => setMaxOffice(Number(e.target.value))}
                  />
                  <div style={{ fontSize: '0.75rem', color: 'var(--slate-400)' }}>
                    Guaranteed office days per member per week (e.g. 3 = exactly 3 days in office, 5 = full office).
                  </div>
                </div>

                <div className="slider-group">
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <label className="label">Max Late Shifts / Week</label>
                    <span className="slider-val">{maxLate} shifts</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="5"
                    value={maxLate}
                    onChange={e => setMaxLate(Number(e.target.value))}
                  />
                  <div style={{ fontSize: '0.75rem', color: 'var(--slate-400)' }}>
                    Maximum late shifts (09:30-18:00) per member per week.
                  </div>
                </div>
              </div>

              {/* Priority Day & Minimums */}
              <div className="form-grid">
                <div>
                  <label className="label">Priority Office Day</label>
                  <select
                    className="input"
                    value={priorityDay}
                    onChange={e => setPriorityDay(Number(e.target.value))}
                  >
                    <option value="-1">None (Balanced evenly)</option>
                    <option value="1">Monday</option>
                    <option value="2">Tuesday</option>
                    <option value="3">Wednesday</option>
                    <option value="4">Thursday</option>
                    <option value="5">Friday</option>
                  </select>
                  <div style={{ fontSize: '0.75rem', color: 'var(--slate-400)', marginTop: '0.25rem' }}>
                    The generator fills this day first to maximize office presence before other days.
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '0.75rem' }}>
                  <div style={{ flex: 1 }}>
                    <label className="label">Min Early in Office</label>
                    <input
                      type="number"
                      min="0"
                      max="10"
                      className="input"
                      value={minEarly}
                      onChange={e => setMinEarly(Number(e.target.value))}
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label className="label">Min Late Staff</label>
                    <input
                      type="number"
                      min="0"
                      max="10"
                      className="input"
                      value={minLate}
                      onChange={e => setMinLate(Number(e.target.value))}
                    />
                  </div>
                </div>
              </div>

              {/* Daily Office Attendance Target Sliders */}
              <div>
                <label className="label" style={{ marginBottom: '0.75rem' }}>
                  Daily Target Office Presence (%)
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '0.75rem' }}>
                  {days.map(d => {
                    const currentVal = targets[d.num] ?? 50;
                    return (
                      <div
                        key={d.num}
                        style={{
                          background: 'rgba(30, 41, 59, 0.45)',
                          padding: '0.75rem',
                          borderRadius: 'var(--radius)',
                          border: Number(priorityDay) === Number(d.num) ? '1px solid var(--primary)' : '1px solid var(--border)',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '0.4rem',
                          textAlign: 'center',
                        }}
                      >
                        <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'white' }}>{d.name}</span>
                        <span style={{ fontSize: '1.1rem', fontWeight: 800, color: currentVal >= 100 ? '#34d399' : 'var(--primary)' }}>
                          {currentVal}%
                        </span>
                        <input
                          type="range"
                          min="0"
                          max="100"
                          step="10"
                          value={currentVal}
                          onChange={e => setTargets({ ...targets, [d.num]: Number(e.target.value) })}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {tab === 'members' && (
            <div style={{ overflowX: 'auto' }}>
              <table className="schedule-table" style={{ minWidth: '700px' }}>
                <thead>
                  <tr>
                    <th>Member</th>
                    <th>Allowed Location</th>
                    <th>Fixed Schedule</th>
                    <th>Break</th>
                    <th>Max Office</th>
                    <th>Auto-Fill</th>
                  </tr>
                </thead>
                <tbody>
                  {employees.map(emp => {
                    let fixedOffs: number[] = [];
                    try { fixedOffs = JSON.parse(emp.fixedOffDays || '[]'); } catch {}
                    const dayLabels = ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri'];

                    let fixedSummary = '';
                    try {
                      if (emp.fixedDaySchedule) {
                        const parsed = JSON.parse(emp.fixedDaySchedule);
                        const parts: string[] = [];
                        for (let d = 1; d <= 5; d++) {
                          const p = parsed[d] || parsed[d.toString()];
                          if (p && p.type && p.type !== 'AUTO') {
                            parts.push(`${dayLabels[d]}: ${p.type === 'OFF' ? 'Off' : p.type === 'OFFICE' ? 'Offc' : p.type === 'HOME' ? 'Home' : 'Cust'}`);
                          }
                        }
                        if (parts.length > 0) fixedSummary = parts.join(', ');
                      }
                    } catch {}

                    return (
                      <tr key={emp.id}>
                        <td style={{ fontWeight: 600, color: 'white' }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
                            <div>
                              <div
                                style={{ cursor: onEditMember ? 'pointer' : 'default', color: 'white' }}
                                onClick={() => onEditMember?.(emp)}
                                title={onEditMember ? `Click to edit ${emp.name}'s name, email, or schedule` : undefined}
                              >
                                {emp.name}
                              </div>
                              {emp.email && <div style={{ fontSize: '0.72rem', color: 'var(--slate-400)', fontWeight: 400 }}>{emp.email}</div>}
                            </div>
                            {onEditMember && (
                              <button
                                type="button"
                                className="action-btn"
                                style={{ padding: '0.2rem 0.35rem', minWidth: 'auto', background: 'rgba(255, 255, 255, 0.05)' }}
                                onClick={() => onEditMember(emp)}
                                title={`Edit ${emp.name}`}
                              >
                                <Edit2 size={13} style={{ color: 'var(--primary)' }} />
                              </button>
                            )}
                          </div>
                        </td>
                        <td>
                          <span className={`member-tag ${emp.allowedLocation === 'HOME_ONLY' ? 'tag-home' : emp.allowedLocation === 'OFFICE_ONLY' ? 'tag-office' : ''}`}>
                            {emp.allowedLocation === 'HOME_ONLY' ? 'Home Only' : emp.allowedLocation === 'OFFICE_ONLY' ? 'Office Only' : 'Flexible (Any)'}
                          </span>
                        </td>
                        <td>
                          {fixedSummary ? (
                            <span className="member-tag tag-office" style={{ fontSize: '0.75rem' }}>{fixedSummary}</span>
                          ) : fixedOffs.length > 0 ? (
                            <span className="member-tag tag-off">{fixedOffs.map(d => dayLabels[d]).join(', ')}</span>
                          ) : (
                            <span style={{ color: 'var(--slate-500)', fontSize: '0.75rem' }}>Flexible</span>
                          )}
                        </td>
                        <td>
                          <span style={{ color: emp.breakMinutes != null ? '#38bdf8' : 'var(--slate-400)', fontSize: '0.8rem', fontWeight: emp.breakMinutes != null ? 700 : 400 }}>
                            {emp.breakMinutes != null ? `${emp.breakMinutes}m` : `${team.breakMinutes || 30}m`}
                          </span>
                        </td>
                        <td>
                          {emp.maxOfficeDays !== null && emp.maxOfficeDays !== undefined ? (
                            <span style={{ fontWeight: 700, color: '#93c5fd' }}>{emp.maxOfficeDays} days</span>
                          ) : (
                            <span style={{ color: 'var(--slate-400)', fontSize: '0.8rem' }}>Default ({maxOffice})</span>
                          )}
                        </td>
                        <td>
                          <span style={{ color: emp.autoSchedule ? '#34d399' : '#f87171', fontWeight: 600, fontSize: '0.8rem' }}>
                            {emp.autoSchedule ? 'Enabled' : 'Manual Only'}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div style={{ marginTop: '1rem', fontSize: '0.8rem', color: 'var(--slate-400)' }}>
                Tip: Click the slider icon <Sliders size={12} style={{ display: 'inline' }} /> next to any member in the main schedule table to customize their individual location, days off, and limits.
              </div>
            </div>
          )}

          {tab === 'groups' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(30, 41, 59, 0.4)', padding: '0.85rem 1rem', borderRadius: 'var(--radius)' }}>
                <div>
                  <div style={{ fontWeight: 600, color: 'white', fontSize: '0.9rem' }}>Team Groups</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--slate-400)' }}>
                    Groups define the sections on your schedule grid and in Microsoft Teams Shifts exports.
                  </div>
                </div>
                <button
                  type="button"
                  className="btn btn-primary"
                  style={{ padding: '0.45rem 0.85rem', fontSize: '0.8rem' }}
                  onClick={onOpenAddGroup}
                >
                  <Plus size={15} /> Add Group
                </button>
              </div>

              <table className="schedule-table" style={{ width: '100%', minWidth: '100%', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
                <thead>
                  <tr>
                    <th style={{ background: 'var(--slate-800)' }}>Group Name</th>
                    <th style={{ background: 'var(--slate-800)', width: '130px', textAlign: 'center' }}>Identifier</th>
                    <th style={{ background: 'var(--slate-800)', width: '110px', textAlign: 'center' }}>Members</th>
                    <th style={{ background: 'var(--slate-800)', width: '120px', textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {teamGroups.map(g => {
                    const count = employees.filter(e => (e.group || 'DEFAULT') === g.id).length;
                    return (
                      <tr key={g.id}>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', fontWeight: 600, color: 'white' }}>
                            <Users size={16} style={{ color: 'var(--primary)' }} />
                            <span>{g.name}</span>
                          </div>
                        </td>
                        <td style={{ textAlign: 'center', color: 'var(--slate-400)', fontSize: '0.75rem', fontFamily: 'monospace' }}>
                          {g.id}
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <span style={{ padding: '0.2rem 0.5rem', background: 'rgba(59, 130, 246, 0.15)', color: '#60a5fa', borderRadius: 'var(--radius-sm)', fontWeight: 600, fontSize: '0.8rem' }}>
                            {count} member{count !== 1 ? 's' : ''}
                          </span>
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.4rem' }}>
                            <button
                              type="button"
                              className="action-btn"
                              onClick={() => onOpenRenameGroup(g.id, g.name)}
                              title="Rename group"
                            >
                              <Edit2 size={15} />
                            </button>
                            <button
                              type="button"
                              className="action-btn delete"
                              onClick={() => onPromptDeleteGroup(g.id, g.name, count)}
                              title="Delete group"
                            >
                              <Trash2 size={15} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={saveTeamRules} disabled={saving}>
            {saving ? 'Saving...' : 'Save Rules'}
          </button>
        </div>
      </div>
    </div>
  );
}

// MEMBER EDIT MODAL COMPONENT
interface DayPattern {
  type: 'AUTO' | 'OFF' | 'OFFICE' | 'HOME' | 'CUSTOM';
  shiftType?: 'EARLY' | 'LATE';
  start?: string;
  end?: string;
  location?: string;
  notes?: string;
}

function MemberEditModal({
  employee,
  teamGroups,
  teamBreakMinutes = 30,
  onClose,
  onSave,
}: {
  employee: Employee;
  teamGroups: { id: string; name: string }[];
  teamBreakMinutes?: number;
  onClose: () => void;
  onSave: (emp: Employee) => void;
}) {
  const [name, setName] = useState(employee.name || '');
  const [email, setEmail] = useState(employee.email || '');
  const [allowedLocation, setAllowedLocation] = useState(employee.allowedLocation || 'ANY');
  const [breakMinutes, setBreakMinutes] = useState<string>(
    employee.breakMinutes !== null && employee.breakMinutes !== undefined ? String(employee.breakMinutes) : ''
  );
  const [maxOfficeDays, setMaxOfficeDays] = useState<string>(
    employee.maxOfficeDays !== null && employee.maxOfficeDays !== undefined ? String(employee.maxOfficeDays) : ''
  );
  const [maxLateShifts, setMaxLateShifts] = useState<string>(
    employee.maxLateShifts !== null && employee.maxLateShifts !== undefined ? String(employee.maxLateShifts) : ''
  );
  const [autoSchedule, setAutoSchedule] = useState(employee.autoSchedule !== false);
  const [group, setGroup] = useState(employee.group || 'DEFAULT');

  // Recurring Fixed Day Patterns (1..5: Mon..Fri)
  const [selectedDayTab, setSelectedDayTab] = useState<number>(1);
  const [schedulePatterns, setSchedulePatterns] = useState<Record<number, DayPattern>>(() => {
    const initial: Record<number, DayPattern> = {
      1: { type: 'AUTO' },
      2: { type: 'AUTO' },
      3: { type: 'AUTO' },
      4: { type: 'AUTO' },
      5: { type: 'AUTO' },
    };
    try {
      if (employee.fixedDaySchedule) {
        const parsed = JSON.parse(employee.fixedDaySchedule);
        for (let d = 1; d <= 5; d++) {
          if (parsed[d] || parsed[d.toString()]) {
            initial[d] = parsed[d] || parsed[d.toString()];
          }
        }
      }
    } catch {}

    // Check legacy fixedOffDays if day is still AUTO
    try {
      if (employee.fixedOffDays) {
        const legacyOffs = JSON.parse(employee.fixedOffDays);
        if (Array.isArray(legacyOffs)) {
          for (const d of legacyOffs) {
            if (initial[d]?.type === 'AUTO') {
              initial[d] = { type: 'OFF' };
            }
          }
        }
      }
    } catch {}

    return initial;
  });

  const updateCurrentDayPattern = (updates: Partial<DayPattern>) => {
    setSchedulePatterns(prev => ({
      ...prev,
      [selectedDayTab]: {
        ...prev[selectedDayTab],
        ...updates,
      },
    }));
  };

  const setAllDaysPattern = (type: 'AUTO' | 'OFFICE' | 'HOME' | 'OFF') => {
    const updated: Record<number, DayPattern> = {};
    for (let d = 1; d <= 5; d++) {
      if (type === 'OFFICE') updated[d] = { type: 'OFFICE', shiftType: 'EARLY' };
      else if (type === 'HOME') updated[d] = { type: 'HOME', shiftType: 'EARLY' };
      else if (type === 'OFF') updated[d] = { type: 'OFF' };
      else updated[d] = { type: 'AUTO' };
    }
    setSchedulePatterns(updated);
  };

  const handleSave = () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      alert('Member name cannot be empty');
      return;
    }

    const fixedOffs: number[] = [];
    for (let d = 1; d <= 5; d++) {
      if (schedulePatterns[d]?.type === 'OFF') {
        fixedOffs.push(d);
      }
    }

    onSave({
      ...employee,
      name: trimmedName,
      email: email.trim(),
      allowedLocation,
      fixedOffDays: JSON.stringify(fixedOffs),
      fixedDaySchedule: JSON.stringify(schedulePatterns),
      breakMinutes: breakMinutes !== '' && breakMinutes !== null ? Number(breakMinutes) : null,
      maxOfficeDays: maxOfficeDays ? Number(maxOfficeDays) : null,
      maxLateShifts: maxLateShifts ? Number(maxLateShifts) : null,
      autoSchedule,
      group,
    });
  };

  const dayTabs = [
    { num: 1, name: 'Monday', short: 'Mon' },
    { num: 2, name: 'Tuesday', short: 'Tue' },
    { num: 3, name: 'Wednesday', short: 'Wed' },
    { num: 4, name: 'Thursday', short: 'Thu' },
    { num: 5, name: 'Friday', short: 'Fri' },
  ];

  const currentPattern = schedulePatterns[selectedDayTab] || { type: 'AUTO' };

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-content" style={{ maxWidth: '620px' }}>
        <div className="modal-header">
          <h2><UserCheck size={18} /> Edit Member & Rules: {name.trim() || employee.name}</h2>
          <button onClick={onClose} style={{ color: 'var(--slate-400)' }}>
            <X size={20} />
          </button>
        </div>

        <div className="modal-body" style={{ maxHeight: '80vh', overflowY: 'auto' }}>
          {/* Member Profile Details */}
          <div style={{ background: 'rgba(30, 41, 59, 0.45)', padding: '1rem', borderRadius: 'var(--radius)', border: '1px solid var(--border)', marginBottom: '1rem' }}>
            <div style={{ fontWeight: 600, color: 'white', fontSize: '0.875rem', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
              <Edit2 size={16} style={{ color: 'var(--primary)' }} />
              Member Profile Details
            </div>
            <div className="form-grid">
              <div>
                <label className="label">Full Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. John Doe"
                  className="input"
                  value={name}
                  onChange={e => setName(e.target.value)}
                />
              </div>
              <div>
                <label className="label">Email Address</label>
                <input
                  type="email"
                  placeholder="e.g. john.doe@company.com"
                  className="input"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                />
              </div>
            </div>
            <div style={{ marginTop: '0.75rem' }}>
              <label className="label">Group / Department</label>
              <select
                className="input"
                value={group}
                onChange={e => setGroup(e.target.value)}
              >
                {teamGroups.map(g => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {/* General Constraints Grid */}
          <div className="form-grid">
            <div>
              <label className="label">Allowed Work Location</label>
              <div className="loc-toggle">
                <button
                  type="button"
                  className={allowedLocation === 'ANY' ? 'active-OFFICE' : ''}
                  onClick={() => setAllowedLocation('ANY')}
                >
                  Flexible
                </button>
                <button
                  type="button"
                  className={allowedLocation === 'HOME_ONLY' ? 'active-HOME' : ''}
                  onClick={() => setAllowedLocation('HOME_ONLY')}
                >
                  Home
                </button>
                <button
                  type="button"
                  className={allowedLocation === 'OFFICE_ONLY' ? 'active-OFFICE' : ''}
                  onClick={() => setAllowedLocation('OFFICE_ONLY')}
                >
                  Office
                </button>
              </div>
            </div>

            <div>
              <label className="label">Break Duration (Minutes)</label>
              <input
                type="number"
                min="0"
                max="180"
                placeholder={`Team default (${teamBreakMinutes}m)`}
                className="input"
                value={breakMinutes}
                onChange={e => setBreakMinutes(e.target.value)}
              />
              <div style={{ fontSize: '0.725rem', color: 'var(--slate-400)', marginTop: '0.25rem' }}>
                Per-person break duration override (blank = {teamBreakMinutes}m).
              </div>
            </div>
          </div>

          {/* Weekly Fixed Schedule (Recurring Pattern) */}
          <div style={{ background: 'rgba(30, 41, 59, 0.45)', padding: '1rem', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
              <div>
                <div style={{ fontWeight: 600, color: 'white', fontSize: '0.875rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <CalendarCheck size={16} style={{ color: 'var(--primary)' }} />
                  Weekly Fixed Day Schedule
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--slate-400)' }}>
                  Set fixed attendance/location per weekday or let Auto-Fill balance flexibly.
                </div>
              </div>
              <div style={{ display: 'flex', gap: '0.35rem' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ padding: '0.25rem 0.55rem', fontSize: '0.7rem' }}
                  onClick={() => setAllDaysPattern('AUTO')}
                  title="Make all days flexible"
                >
                  All Auto
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ padding: '0.25rem 0.55rem', fontSize: '0.7rem' }}
                  onClick={() => setAllDaysPattern('OFFICE')}
                  title="Set all days to Office"
                >
                  All Office
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ padding: '0.25rem 0.55rem', fontSize: '0.7rem' }}
                  onClick={() => setAllDaysPattern('HOME')}
                  title="Set all days to Home"
                >
                  All Home
                </button>
              </div>
            </div>

            {/* Day Selector Tabs */}
            <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '0.85rem' }}>
              {dayTabs.map(d => {
                const pat = schedulePatterns[d.num] || { type: 'AUTO' };
                const isActive = selectedDayTab === d.num;
                let badgeColor = 'var(--slate-400)';
                let badgeBg = 'transparent';
                let label = 'Auto';

                if (pat.type === 'OFF') {
                  badgeColor = '#fca5a5';
                  badgeBg = 'rgba(239, 68, 68, 0.2)';
                  label = 'Off';
                } else if (pat.type === 'OFFICE') {
                  badgeColor = '#93c5fd';
                  badgeBg = 'rgba(59, 130, 246, 0.2)';
                  label = pat.shiftType === 'LATE' ? 'Late' : 'Office';
                } else if (pat.type === 'HOME') {
                  badgeColor = '#c084fc';
                  badgeBg = 'rgba(168, 85, 247, 0.2)';
                  label = pat.shiftType === 'LATE' ? 'H-Late' : 'Home';
                } else if (pat.type === 'CUSTOM') {
                  badgeColor = '#f472b6';
                  badgeBg = 'rgba(236, 72, 153, 0.2)';
                  label = 'Custom';
                }

                return (
                  <button
                    key={d.num}
                    type="button"
                    onClick={() => setSelectedDayTab(d.num)}
                    style={{
                      flex: 1,
                      padding: '0.55rem 0.25rem',
                      borderRadius: 'var(--radius)',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: '0.25rem',
                      background: isActive ? 'var(--primary)' : 'var(--slate-800)',
                      color: isActive ? 'white' : 'var(--slate-300)',
                      border: isActive ? '1px solid var(--primary)' : '1px solid var(--border)',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <span style={{ fontSize: '0.8rem', fontWeight: 700 }}>{d.short}</span>
                    <span
                      style={{
                        fontSize: '0.65rem',
                        fontWeight: 600,
                        padding: '0.1rem 0.35rem',
                        borderRadius: '4px',
                        background: isActive ? 'rgba(255,255,255,0.2)' : badgeBg,
                        color: isActive ? 'white' : badgeColor,
                      }}
                    >
                      {label}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Selected Day Configuration Area */}
            <div style={{ background: 'var(--slate-900)', padding: '0.85rem', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>
              <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--slate-300)', marginBottom: '0.5rem' }}>
                Schedule for {dayTabs.find(d => d.num === selectedDayTab)?.name}:
              </div>

              {/* Status Pills */}
              <div className="loc-toggle" style={{ marginBottom: '0.75rem' }}>
                <button
                  type="button"
                  className={currentPattern.type === 'AUTO' ? 'active-OFFICE' : ''}
                  onClick={() => updateCurrentDayPattern({ type: 'AUTO' })}
                >
                  Flexible (Auto)
                </button>
                <button
                  type="button"
                  className={currentPattern.type === 'OFF' ? 'active-HOME' : ''}
                  style={currentPattern.type === 'OFF' ? { background: '#ef4444', color: 'white', borderColor: '#ef4444' } : {}}
                  onClick={() => updateCurrentDayPattern({ type: 'OFF' })}
                >
                  Day Off
                </button>
                <button
                  type="button"
                  className={currentPattern.type === 'OFFICE' ? 'active-OFFICE' : ''}
                  onClick={() => updateCurrentDayPattern({ type: 'OFFICE', shiftType: currentPattern.shiftType || 'EARLY' })}
                >
                  Office
                </button>
                <button
                  type="button"
                  className={currentPattern.type === 'HOME' ? 'active-HOME' : ''}
                  onClick={() => updateCurrentDayPattern({ type: 'HOME', shiftType: currentPattern.shiftType || 'EARLY' })}
                >
                  Home
                </button>
                <button
                  type="button"
                  className={currentPattern.type === 'CUSTOM' ? 'active-OFFICE' : ''}
                  style={currentPattern.type === 'CUSTOM' ? { background: '#ec4899', color: 'white', borderColor: '#ec4899' } : {}}
                  onClick={() => updateCurrentDayPattern({ type: 'CUSTOM', start: currentPattern.start || '08:30', end: currentPattern.end || '17:00' })}
                >
                  Custom
                </button>
              </div>

              {/* Sub-options for OFFICE or HOME */}
              {(currentPattern.type === 'OFFICE' || currentPattern.type === 'HOME') && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginTop: '0.5rem', background: 'rgba(15, 23, 42, 0.4)', padding: '0.6rem 0.8rem', borderRadius: 'var(--radius)' }}>
                  <span style={{ fontSize: '0.75rem', color: 'var(--slate-400)', fontWeight: 600 }}>Shift Timing:</span>
                  <div style={{ display: 'flex', gap: '0.4rem', flex: 1 }}>
                    <button
                      type="button"
                      style={{
                        flex: 1,
                        padding: '0.35rem 0.6rem',
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        borderRadius: 'var(--radius-sm)',
                        background: (currentPattern.shiftType || 'EARLY') === 'EARLY' ? 'rgba(34, 197, 94, 0.25)' : 'var(--slate-800)',
                        color: (currentPattern.shiftType || 'EARLY') === 'EARLY' ? '#86efac' : 'var(--slate-400)',
                        border: (currentPattern.shiftType || 'EARLY') === 'EARLY' ? '1px solid #22c55e' : '1px solid var(--border)',
                      }}
                      onClick={() => updateCurrentDayPattern({ shiftType: 'EARLY' })}
                    >
                      Early Shift
                    </button>
                    <button
                      type="button"
                      style={{
                        flex: 1,
                        padding: '0.35rem 0.6rem',
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        borderRadius: 'var(--radius-sm)',
                        background: currentPattern.shiftType === 'LATE' ? 'rgba(59, 130, 246, 0.25)' : 'var(--slate-800)',
                        color: currentPattern.shiftType === 'LATE' ? '#93c5fd' : 'var(--slate-400)',
                        border: currentPattern.shiftType === 'LATE' ? '1px solid #3b82f6' : '1px solid var(--border)',
                      }}
                      onClick={() => updateCurrentDayPattern({ shiftType: 'LATE' })}
                    >
                      Late Shift
                    </button>
                  </div>
                </div>
              )}

              {/* Sub-options for CUSTOM */}
              {currentPattern.type === 'CUSTOM' && (
                <div style={{ marginTop: '0.5rem', background: 'rgba(15, 23, 42, 0.4)', padding: '0.75rem', borderRadius: 'var(--radius)' }}>
                  <div className="form-grid">
                    <div>
                      <label className="label" style={{ fontSize: '0.725rem' }}>Start Time</label>
                      <input
                        type="time"
                        className="input"
                        value={currentPattern.start || '08:30'}
                        onChange={e => updateCurrentDayPattern({ start: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="label" style={{ fontSize: '0.725rem' }}>End Time</label>
                      <input
                        type="time"
                        className="input"
                        value={currentPattern.end || '17:00'}
                        onChange={e => updateCurrentDayPattern({ end: e.target.value })}
                      />
                    </div>
                  </div>
                  <div style={{ marginTop: '0.5rem' }}>
                    <label className="label" style={{ fontSize: '0.725rem' }}>Location / Note</label>
                    <input
                      type="text"
                      placeholder="e.g. Office, Site Visit, Remote..."
                      className="input"
                      value={currentPattern.location || ''}
                      onChange={e => updateCurrentDayPattern({ location: e.target.value })}
                    />
                  </div>
                </div>
              )}

              {/* Explanatory text */}
              <div style={{ fontSize: '0.725rem', color: 'var(--slate-400)', marginTop: '0.5rem' }}>
                {currentPattern.type === 'AUTO' && 'Auto-fill will flexibly assign this day based on team rules and weekly targets.'}
                {currentPattern.type === 'OFF' && 'Employee will always be scheduled as OFF on this day.'}
                {currentPattern.type === 'OFFICE' && `Employee will always be scheduled at the Office (${currentPattern.shiftType || 'EARLY'}).`}
                {currentPattern.type === 'HOME' && `Employee will always work from Home (${currentPattern.shiftType || 'EARLY'}).`}
                {currentPattern.type === 'CUSTOM' && `Employee will be scheduled with custom hours (${currentPattern.start || '08:30'} - ${currentPattern.end || '17:00'}).`}
              </div>
            </div>

            {/* Weekly Summary Strip */}
            <div style={{ marginTop: '0.75rem', padding: '0.4rem 0.6rem', background: 'rgba(15, 23, 42, 0.3)', borderRadius: 'var(--radius-sm)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.725rem', color: 'var(--slate-400)' }}>
              <span style={{ fontWeight: 600 }}>Pattern Summary:</span>
              <span style={{ color: 'var(--slate-300)' }}>
                {dayTabs.map(d => {
                  const p = schedulePatterns[d.num] || { type: 'AUTO' };
                  let s = 'Auto';
                  if (p.type === 'OFF') s = 'Off';
                  else if (p.type === 'OFFICE') s = p.shiftType === 'LATE' ? 'Offc(L)' : 'Offc(E)';
                  else if (p.type === 'HOME') s = p.shiftType === 'LATE' ? 'Home(L)' : 'Home(E)';
                  else if (p.type === 'CUSTOM') s = 'Cust';
                  return `${d.short}: ${s}`;
                }).join(' • ')}
              </span>
            </div>
          </div>

          {/* Limits */}
          <div className="form-grid">
            <div>
              <label className="label">Target Office Days / Week</label>
              <input
                type="number"
                min="0"
                max="5"
                placeholder="Team default (3)"
                className="input"
                value={maxOfficeDays}
                onChange={e => setMaxOfficeDays(e.target.value)}
              />
              <div style={{ fontSize: '0.725rem', color: 'var(--slate-400)', marginTop: '0.2rem' }}>
                Guaranteed office days (blank = team default).
              </div>
            </div>
            <div>
              <label className="label">Max Late Shifts / Week</label>
              <input
                type="number"
                min="0"
                max="5"
                placeholder="Team default (3)"
                className="input"
                value={maxLateShifts}
                onChange={e => setMaxLateShifts(e.target.value)}
              />
            </div>
          </div>

          {/* Auto-Schedule Toggle */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(30, 41, 59, 0.4)', padding: '0.75rem 1rem', borderRadius: 'var(--radius)' }}>
            <div>
              <div style={{ fontWeight: 600, color: 'white', fontSize: '0.875rem' }}>Auto-Fill Scheduling</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--slate-400)' }}>
                If disabled, this member will only receive shifts you manually assign.
              </div>
            </div>
            <button
              type="button"
              onClick={() => setAutoSchedule(!autoSchedule)}
              style={{
                width: '46px',
                height: '26px',
                borderRadius: '13px',
                background: autoSchedule ? 'var(--primary)' : 'var(--slate-700)',
                position: 'relative',
                transition: 'background 0.2s',
              }}
            >
              <div
                style={{
                  width: '20px',
                  height: '20px',
                  borderRadius: '50%',
                  background: 'white',
                  position: 'absolute',
                  top: '3px',
                  left: autoSchedule ? '23px' : '3px',
                  transition: 'left 0.2s',
                }}
              />
            </button>
          </div>
        </div>

        <div className="modal-footer">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" onClick={handleSave} disabled={!name.trim()}>
            Save Member Details & Rules
          </button>
        </div>
      </div>
    </div>
  );
}
