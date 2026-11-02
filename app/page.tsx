'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  format,
  addWeeks,
  subWeeks,
  startOfWeek,
  addDays,
  isSameDay,
} from 'date-fns';
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  Download,
  Users,
  Plus,
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
  CheckCircle2,
  Package,
  HardDrive,
  CalendarCheck,
  Repeat,
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

export default function Home() {
  const [mounted, setMounted] = useState(false);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [teams, setTeams] = useState<Team[]>([]);
  const [selectedTeamId, setSelectedTeamId] = useState<string>('');
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [loading, setLoading] = useState(true);

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
      const url = repoOverride ? `/api/version?repo=${encodeURIComponent(repoOverride)}` : '/api/version';
      const res = await fetch(url);
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
    const timer = setTimeout(() => {
      checkForUpdates();
    }, 1500);
    return () => clearTimeout(timer);
  }, []);

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

  // Load Schedule & Employees for selected team and date
  const loadData = async (teamIdOverride?: string) => {
    const teamId = teamIdOverride || selectedTeamId || currentTeam?.id;
    if (!teamId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [empRes, shiftRes] = await Promise.all([
        fetch(`/api/employees?teamId=${teamId}`, { cache: 'no-store' }),
        fetch(`/api/shifts?date=${start.toISOString()}&teamId=${teamId}`, { cache: 'no-store' }),
      ]);
      if (empRes.ok) setEmployees(await empRes.json());
      if (shiftRes.ok) setShifts(await shiftRes.json());
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

  // Update Member Constraints
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
        showToast(`Updated rules for ${emp.name}`);
      }
    } catch (err) {
      console.error(err);
      showToast('Failed to update member rules', 'error');
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

    // Optimistic UI Update
    setShifts((prev) => {
      const next = [...prev];
      for (const empId of targetEmpIds) {
        for (const sDate of datesToSave) {
          const newShift: Shift = {
            id: 'temp-' + empId + sDate.getTime(),
            employeeId: empId,
            date: sDate.toISOString(),
            type: type as any,
            location: location as any,
            isManual: true,
            customStart,
            customEnd,
            notes,
            color,
          };
          const idx = next.findIndex(s => s.employeeId === empId && isSameDay(new Date(s.date), sDate));
          if (idx >= 0) next[idx] = newShift;
          else next.push(newShift);
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
              notes,
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

  // Auto-Fill Generator
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
        showToast(`Auto-fill complete: ${data.summary?.totalGenerated || 0} shifts generated with team rules!`);
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
        <table className="schedule-table">
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
                <th key={day.toISOString()} style={{ textAlign: 'center' }} suppressHydrationWarning>
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
                      <div className="member-profile">
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
                      <td key={day.toISOString()}>
                        <button className={shiftClass} onClick={() => openShiftModal(emp.id, day, shift)}>
                          {shift?.isManual && <div className="manual-pin" title="Manual shift override" />}
                          {shift && shift.type !== 'OFF' ? (
                            <>
                              <span className={`time-badge time-${shift.type.toLowerCase()}`}>
                                {getShiftTimeText(shift)}
                              </span>
                              {shift.type !== 'SICK' && shift.type !== 'VACATION' && (
                                <span className={`loc-badge ${shift.location === 'OFFICE' ? 'loc-office' : shift.location === 'HOME' ? 'loc-home' : 'loc-custom'}`}>
                                  <div className="loc-dot" />
                                  {shift.location === 'OFFICE' ? (
                                    <>
                                      <Building size={11} /> Office
                                    </>
                                  ) : shift.location === 'HOME' ? (
                                    <>
                                      <HomeIcon size={11} /> Home
                                    </>
                                  ) : (
                                    shift.location
                                  )}
                                </span>
                              )}
                              {shift.notes && <span className="shift-notes">{shift.notes}</span>}
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
            </span>
          </div>
          <div className="update-banner-actions">
            <button className="btn btn-sm btn-primary" onClick={() => setVersionModalOpen(true)}>
              View Details & Download
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
            onClick={handleApplyFixedDays}
            disabled={loading || applyingFixed || employees.length === 0}
            className="btn btn-secondary"
            title="Apply recurring fixed days (Off, Office, Home, Custom) to this week"
          >
            <CalendarCheck size={16} style={{ color: '#38bdf8' }} /> {applyingFixed ? 'Applying...' : 'Apply Fixed Days'}
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
            title="Auto-fill schedule applying team constraints and member preferences"
          >
            <Wand2 size={16} /> Auto-Fill
          </button>

          <label className="btn btn-secondary" style={{ cursor: 'pointer', margin: 0 }} title="Import Teams Shifts Excel">
            <Download size={16} /> Import
            <input type="file" accept=".xlsx" onChange={handleImport} style={{ display: 'none' }} />
          </label>

          <a
            suppressHydrationWarning
            href={`/api/export?date=${start.toISOString()}&teamId=${selectedTeamId}`}
            className="btn btn-secondary"
            title="Export to Microsoft Teams Shifts Excel format"
          >
            <Upload size={16} /> Export
          </a>

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
                  {/* Hero Leap Card */}
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

                    {/* Version Leap Row */}
                    <div className="version-leap-row">
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <span style={{ fontSize: '0.72rem', color: 'var(--slate-400)', textTransform: 'uppercase', fontWeight: 600 }}>Installed Edition</span>
                        <span style={{ fontSize: '1.15rem', fontWeight: 800, color: 'white', fontFamily: 'monospace' }}>
                          v{updateInfo?.currentVersion || '1.0.4'}
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
                          v{updateInfo?.latestVersion || updateInfo?.currentVersion || '1.0.4'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Dual Download Action Cards if update is available or download options */}
                  <div style={{ marginBottom: '1.25rem' }}>
                    <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--slate-300)', marginBottom: '0.6rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      {updateInfo?.hasUpdate ? 'Choose Installation Package' : 'Available Downloads & Reinstalls'}
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                      {/* Windows Installer Setup.exe */}
                      <a
                        href={updateInfo?.downloadUrl || `https://github.com/${updateInfo?.repo || 'Doffo-1/Teams-Shifts'}/releases/latest/download/TeamsShifts-Setup.exe`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn version-btn-glow"
                        style={{ padding: '0.85rem 1rem', display: 'flex', flexDirection: 'column', alignItems: 'flex-start', textAlign: 'left', textDecoration: 'none', borderRadius: 10 }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', marginBottom: 4 }}>
                          <span style={{ fontSize: '0.9rem', fontWeight: 700 }}>Windows Setup (.exe)</span>
                          <Download size={16} />
                        </div>
                        <span style={{ fontSize: '0.72rem', color: 'rgba(255, 255, 255, 0.85)', fontWeight: 400 }}>
                          Recommended • Desktop installer with Start Menu & Shortcuts
                        </span>
                      </a>

                      {/* Standalone Portable ZIP */}
                      <a
                        href={updateInfo?.portableUrl || `https://github.com/${updateInfo?.repo || 'Doffo-1/Teams-Shifts'}/releases/latest/download/TeamsShifts-Standalone.zip`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn btn-secondary"
                        style={{ padding: '0.85rem 1rem', display: 'flex', flexDirection: 'column', alignItems: 'flex-start', textAlign: 'left', textDecoration: 'none', borderRadius: 10, background: 'rgba(30, 41, 59, 0.8)', borderColor: 'rgba(71, 85, 105, 0.6)' }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', marginBottom: 4 }}>
                          <span style={{ fontSize: '0.9rem', fontWeight: 700, color: 'white' }}>Portable Edition (.zip)</span>
                          <Download size={16} />
                        </div>
                        <span style={{ fontSize: '0.72rem', color: 'var(--slate-400)', fontWeight: 400 }}>
                          Zero installation • Extract and launch anywhere
                        </span>
                      </a>
                    </div>
                  </div>

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
                    <label className="label">Max Office Days / Week</label>
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
                    Maximum times any member can be assigned to the Office per week.
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
                        <td style={{ fontWeight: 600, color: 'white' }}>{emp.name}</td>
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
    const fixedOffs: number[] = [];
    for (let d = 1; d <= 5; d++) {
      if (schedulePatterns[d]?.type === 'OFF') {
        fixedOffs.push(d);
      }
    }

    onSave({
      ...employee,
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
          <h2><UserCheck size={18} /> Rules & Schedule for {employee.name}</h2>
          <button onClick={onClose} style={{ color: 'var(--slate-400)' }}>
            <X size={20} />
          </button>
        </div>

        <div className="modal-body" style={{ maxHeight: '80vh', overflowY: 'auto' }}>
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
              <label className="label">Max Office Days / Week</label>
              <input
                type="number"
                min="0"
                max="5"
                placeholder="Team default (3)"
                className="input"
                value={maxOfficeDays}
                onChange={e => setMaxOfficeDays(e.target.value)}
              />
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

          {/* Subgroup */}
          <div>
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
          <button type="button" className="btn btn-primary" onClick={handleSave}>
            Save Rules & Schedule
          </button>
        </div>
      </div>
    </div>
  );
}
