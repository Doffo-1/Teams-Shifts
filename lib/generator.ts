import { addDays, startOfWeek, isSameDay, getDay, format, getISOWeek, getWeekOfMonth } from 'date-fns';

export type ShiftType = 'EARLY' | 'LATE' | 'OFF' | 'CUSTOM' | 'SICK' | 'VACATION' | string;
export type LocationType = 'HOME' | 'OFFICE' | string;

export interface ShiftInput {
  id?: string;
  employeeId: string;
  date: Date;
  type: ShiftType;
  location: LocationType;
  isManual: boolean;
  customStart?: string | null;
  customEnd?: string | null;
  notes?: string | null;
  color?: string | null;
}

export interface GeneratorClient {
  id: string;
  name: string;
  color?: string | null;
  location?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  frequency: string; // 'EVERY_WEEK' | 'EVERY_OTHER_WEEK' | 'EVERY_MONTH'
  weekParity?: string | null; // 'ALL' | 'EVEN' | 'ODD'
  monthlyWeek?: number | null;
  days: string | number[];
  assignedEmployeeIds: string | string[];
  memberDayMap?: string | Record<string, string> | null;
  requiredMembersPerDay?: number;
  notes?: string | null;
  isActive?: boolean;
}

export interface GeneratorEmployee {
  id: string;
  name: string;
  email?: string;
  group?: string;
  isActive?: boolean;
  allowedLocation?: string; // 'ANY' | 'HOME_ONLY' | 'OFFICE_ONLY'
  fixedOffDays?: string;    // JSON array of day numbers: 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat, 0=Sun
  fixedDaySchedule?: string; // JSON map of day numbers to fixed schedule config
  breakMinutes?: number | null;
  maxOfficeDays?: number | null;
  maxLateShifts?: number | null;
  autoSchedule?: boolean;
  preferredShift?: string;  // 'ANY' | 'EARLY' | 'LATE'
}

export interface GeneratorRules {
  maxOfficeDaysPerWeek: number;
  maxLateShiftsPerWeek: number;
  priorityDayOfWeek: number; // 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat, 0=Sun, -1=None
  dailyOfficeTargets: string; // JSON map: {"1":50,"2":50,"3":50,"4":100,"5":50}
  minOfficeEarlyPerDay: number;
  minLatePerDay: number;
  workingDays: string; // JSON array: [1,2,3,4,5]
  autoBalanceShiftTypes?: boolean;
  autoBalanceLocations?: boolean;
}

export interface GenerationSummary {
  totalGenerated: number;
  fixedAppliedCount: number;
  shiftsByDay: Record<string, { office: number; home: number; early: number; late: number; off: number }>;
  employeeStats: Record<string, { officeDays: number; earlyCount: number; lateCount: number; offDays: number }>;
}

// Convert JS getDay() (0=Sun, 1=Mon, ..., 6=Sat) to 1-indexed Monday week (1=Mon, 2=Tue, ..., 7=Sun)
export function getIsoDayNumber(date: Date): number {
  const d = getDay(date);
  return d === 0 ? 7 : d;
}

export function generateWeeklySchedule(
  employees: GeneratorEmployee[],
  startDate: Date,
  existingShifts: ShiftInput[],
  rules?: Partial<GeneratorRules>,
  clients?: GeneratorClient[]
): { shifts: ShiftInput[]; summary: GenerationSummary } {
  const start = startOfWeek(startDate, { weekStartsOn: 1 }); // Monday

  // Apply default rules if none provided
  const config: GeneratorRules = {
    maxOfficeDaysPerWeek: rules?.maxOfficeDaysPerWeek ?? 3,
    maxLateShiftsPerWeek: rules?.maxLateShiftsPerWeek ?? 3,
    priorityDayOfWeek: rules?.priorityDayOfWeek ?? -1,
    dailyOfficeTargets: rules?.dailyOfficeTargets ?? '{"1":50,"2":50,"3":50,"4":50,"5":50}',
    minOfficeEarlyPerDay: rules?.minOfficeEarlyPerDay ?? 1,
    minLatePerDay: rules?.minLatePerDay ?? 2,
    workingDays: rules?.workingDays ?? '[1,2,3,4,5]',
    autoBalanceShiftTypes: rules?.autoBalanceShiftTypes ?? true,
    autoBalanceLocations: rules?.autoBalanceLocations ?? true,
  };

  let workingDaysArray: number[] = [1, 2, 3, 4, 5];
  try {
    workingDaysArray = JSON.parse(config.workingDays);
    if (!Array.isArray(workingDaysArray) || workingDaysArray.length === 0) {
      workingDaysArray = [1, 2, 3, 4, 5];
    }
  } catch {
    workingDaysArray = [1, 2, 3, 4, 5];
  }

  let targetsMap: Record<string, number> = { '1': 50, '2': 50, '3': 50, '4': 50, '5': 50 };
  try {
    targetsMap = JSON.parse(config.dailyOfficeTargets);
  } catch {
    // fallback
  }

  // Active employees
  const allActiveEmployees = employees.filter(e => e.isActive !== false);
  const schedulableEmployees = allActiveEmployees.filter(e => e.autoSchedule !== false);

  // 1. Start with all existing shifts (manual shifts already created on calendar)
  const generatedShifts: ShiftInput[] = [...existingShifts];
  let fixedAppliedCount = 0;

  // 2. APPLY ALL FIXED DAYS UPFRONT FOR THE FULL WEEK
  // This guarantees that before ANY slot is auto-filled, each member's recurring fixed days
  // are already locked in and accurately counted towards weekly constraints (maxOfficeDays, maxLateShifts, off days)
  for (const dayOffset of workingDaysArray.map(d => d - 1)) {
    const currentDate = addDays(start, dayOffset);
    const dayIsoNum = dayOffset + 1; // 1=Mon, ..., 5=Fri

    for (const emp of allActiveEmployees) {
      // Check if employee ALREADY has a manual shift on this day
      const alreadyHasShift = generatedShifts.some(
        s => s.employeeId === emp.id && isSameDay(new Date(s.date), currentDate)
      );
      if (alreadyHasShift) continue;

      let fixedSchedule: Record<string, any> = {};
      try {
        if (emp.fixedDaySchedule) {
          fixedSchedule = JSON.parse(emp.fixedDaySchedule);
        }
      } catch {
        fixedSchedule = {};
      }

      const dayConfig = fixedSchedule[dayIsoNum.toString()] || fixedSchedule[dayIsoNum];

      if (dayConfig && dayConfig.type && dayConfig.type !== 'AUTO') {
        if (dayConfig.type === 'OFF') {
          generatedShifts.push({
            employeeId: emp.id,
            date: currentDate,
            type: 'OFF',
            location: 'HOME',
            isManual: true,
            notes: dayConfig.notes || null,
          });
          fixedAppliedCount++;
        } else if (dayConfig.type === 'OFFICE') {
          const shiftType = dayConfig.shiftType && dayConfig.shiftType !== 'AUTO' ? dayConfig.shiftType : 'EARLY';
          generatedShifts.push({
            employeeId: emp.id,
            date: currentDate,
            type: shiftType,
            location: 'OFFICE',
            isManual: true,
            notes: dayConfig.notes || null,
          });
          fixedAppliedCount++;
        } else if (dayConfig.type === 'HOME') {
          const shiftType = dayConfig.shiftType && dayConfig.shiftType !== 'AUTO' ? dayConfig.shiftType : 'EARLY';
          generatedShifts.push({
            employeeId: emp.id,
            date: currentDate,
            type: shiftType,
            location: 'HOME',
            isManual: true,
            notes: dayConfig.notes || null,
          });
          fixedAppliedCount++;
        } else if (dayConfig.type === 'CUSTOM') {
          const loc = dayConfig.location || 'OFFICE';
          generatedShifts.push({
            employeeId: emp.id,
            date: currentDate,
            type: 'CUSTOM',
            location: loc,
            customStart: dayConfig.start || '08:30',
            customEnd: dayConfig.end || '17:00',
            isManual: true,
            notes: dayConfig.notes || null,
          });
          fixedAppliedCount++;
        }
      } else {
        // Fallback to legacy fixedOffDays
        let fixedOffs: number[] = [];
        try {
          if (emp.fixedOffDays) {
            fixedOffs = JSON.parse(emp.fixedOffDays);
          }
        } catch {
          fixedOffs = [];
        }

        if (fixedOffs.includes(dayIsoNum)) {
          generatedShifts.push({
            employeeId: emp.id,
            date: currentDate,
            type: 'OFF',
            location: 'HOME',
            isManual: true,
            notes: null,
          });
          fixedAppliedCount++;
        }
      }
    }
  }

  // 2.5 APPLY RECURRING CLIENT SHIFTS (e.g. Wednesday every other week, etc.)
  if (clients && clients.length > 0) {
    const isoWeek = getISOWeek(start);
    const monthWeek = getWeekOfMonth(start);

    for (const client of clients) {
      if (client.isActive === false) continue;

      let isWeekActive = false;
      const freq = client.frequency || 'EVERY_WEEK';
      const parity = client.weekParity || 'ALL';

      if (freq === 'EVERY_WEEK') {
        isWeekActive = true;
      } else if (freq === 'EVERY_OTHER_WEEK') {
        if (parity === 'ODD') isWeekActive = isoWeek % 2 === 1;
        else if (parity === 'EVEN') isWeekActive = isoWeek % 2 === 0;
        else isWeekActive = isoWeek % 2 === 0;
      } else if (freq === 'EVERY_MONTH') {
        isWeekActive = monthWeek === (client.monthlyWeek || 1);
      }

      if (!isWeekActive) continue;

      let activeDays: number[] = [1, 2, 3, 4, 5];
      try {
        if (typeof client.days === 'string') activeDays = JSON.parse(client.days);
        else if (Array.isArray(client.days)) activeDays = client.days;
      } catch {
        activeDays = [1, 2, 3, 4, 5];
      }

      let assignedEmpIds: string[] = [];
      try {
        if (typeof client.assignedEmployeeIds === 'string') assignedEmpIds = JSON.parse(client.assignedEmployeeIds);
        else if (Array.isArray(client.assignedEmployeeIds)) assignedEmpIds = client.assignedEmployeeIds;
      } catch {
        assignedEmpIds = [];
      }

      let memberDayMap: Record<string, any> = {};
      try {
        if (typeof client.memberDayMap === 'string') memberDayMap = JSON.parse(client.memberDayMap);
        else if (client.memberDayMap && typeof client.memberDayMap === 'object') memberDayMap = client.memberDayMap;
      } catch {
        memberDayMap = {};
      }

      const assignedEmps = assignedEmpIds
        .map(id => allActiveEmployees.find(e => e.id === id))
        .filter(Boolean) as GeneratorEmployee[];

      if (assignedEmps.length === 0) continue;

      const requiredCount = client.requiredMembersPerDay && client.requiredMembersPerDay > 0
        ? client.requiredMembersPerDay
        : 1;

      for (const dayNum of activeDays) {
        if (!workingDaysArray.includes(dayNum)) continue;
        const currentDate = addDays(start, dayNum - 1);

        const targetEmps: GeneratorEmployee[] = [];

        // 1. Check member-specific assigned days (e.g. memberDayMap[empId] = [1, 5])
        for (const emp of assignedEmps) {
          const empDays = memberDayMap[emp.id];
          if (Array.isArray(empDays) && empDays.includes(dayNum)) {
            targetEmps.push(emp);
          }
        }

        // 2. Check day-keyed fallback (e.g. memberDayMap["1"] = "empId" or ["emp1", "emp2"])
        const dayConfig = memberDayMap[dayNum.toString()] || memberDayMap[dayNum];
        if (dayConfig) {
          if (Array.isArray(dayConfig)) {
            for (const id of dayConfig) {
              const emp = assignedEmps.find(e => e.id === id);
              if (emp && !targetEmps.some(te => te.id === emp.id)) {
                targetEmps.push(emp);
              }
            }
          } else if (typeof dayConfig === 'string') {
            const emp = assignedEmps.find(e => e.id === dayConfig);
            if (emp && !targetEmps.some(te => te.id === emp.id)) {
              targetEmps.push(emp);
            }
          }
        }

        // 3. If fewer than requiredCount are explicitly assigned, fill from available assigned members
        if (targetEmps.length === 0) {
          for (const emp of assignedEmps) {
            if (targetEmps.length >= requiredCount) break;
            if (!targetEmps.some(te => te.id === emp.id)) {
              targetEmps.push(emp);
            }
          }
        } else if (targetEmps.length < requiredCount) {
          for (const emp of assignedEmps) {
            if (targetEmps.length >= requiredCount) break;
            if (!targetEmps.some(te => te.id === emp.id)) {
              targetEmps.push(emp);
            }
          }
        }

        // 4. For each target employee, remove any old entry on this day and add client shift
        for (const targetEmp of targetEmps) {
          // Remove any existing shift for this employee on this day first
          const oldIdx = generatedShifts.findIndex(
            s => s.employeeId === targetEmp.id && isSameDay(new Date(s.date), currentDate)
          );
          if (oldIdx >= 0) {
            generatedShifts.splice(oldIdx, 1);
          }

          generatedShifts.push({
            employeeId: targetEmp.id,
            date: currentDate,
            type: 'CUSTOM',
            location: client.location || client.name,
            customStart: client.startTime || '08:30',
            customEnd: client.endTime || '17:00',
            color: client.color || 'PINK',
            notes: client.notes || null,
            isManual: true,
          });
          fixedAppliedCount++;
        }
      }
    }
  }

  // 3. ACCURATELY INITIALIZE EMPLOYEE STATS ACROSS THE ENTIRE WEEK
  // Includes all manual shifts AND fixed day shifts!
  const empState = new Map<string, {
    officeDays: number;
    earlyCount: number;
    lateCount: number;
    offDays: number;
  }>();

  for (const emp of allActiveEmployees) {
    const empShiftsThisWeek = generatedShifts.filter((s) => {
      if (s.employeeId !== emp.id) return false;
      const sDate = new Date(s.date);
      return sDate >= start && sDate < addDays(start, 7);
    });

    const officeDays = empShiftsThisWeek.filter(
      (s) => s.location !== 'HOME' && s.type !== 'OFF' && s.type !== 'SICK' && s.type !== 'VACATION'
    ).length;
    const earlyCount = empShiftsThisWeek.filter((s) => s.type === 'EARLY').length;
    const lateCount = empShiftsThisWeek.filter((s) => s.type === 'LATE').length;
    const offDays = empShiftsThisWeek.filter((s) => s.type === 'OFF').length;

    empState.set(emp.id, { officeDays, earlyCount, lateCount, offDays });
  }

  // 4. ORDER DAYS TO PROCESS: Priority day first (e.g. Thursday), then remaining days
  const orderedDayIndices: number[] = [];
  const priorityDay = config.priorityDayOfWeek;

  if (priorityDay > 0 && workingDaysArray.includes(priorityDay)) {
    orderedDayIndices.push(priorityDay - 1);
  }
  for (const dayNum of workingDaysArray) {
    const idx = dayNum - 1;
    if (!orderedDayIndices.includes(idx)) {
      orderedDayIndices.push(idx);
    }
  }

  let autoFilledCount = 0;

  // 5. FILL REMAINING OPEN SLOTS DAY BY DAY WITH ALL CONSTRAINTS IN MIND
  for (const dayOffset of orderedDayIndices) {
    const currentDate = addDays(start, dayOffset);
    const dayIsoNum = dayOffset + 1; // 1=Mon, 2=Tue, ..., 7=Sun

    // Schedulable employees available today (who do NOT have a manual or fixed shift today)
    let availableEmployees = schedulableEmployees.filter(
      emp => !generatedShifts.some(s => s.employeeId === emp.id && isSameDay(new Date(s.date), currentDate))
    );

    // Calculate daily shift tallies from ALREADY PLACED shifts (manual + fixed)
    const dailyShifts = generatedShifts.filter(
      s => isSameDay(new Date(s.date), currentDate) &&
           s.type !== 'OFF' && s.type !== 'SICK' && s.type !== 'VACATION' && s.type !== 'CUSTOM'
    );
    const coreDailyShifts = dailyShifts.filter(s => s.location === 'HOME' || s.location === 'OFFICE');

    let earlyOfficeCount = coreDailyShifts.filter(s => s.type === 'EARLY' && s.location !== 'HOME').length;
    let lateOfficeCount = coreDailyShifts.filter(s => s.type === 'LATE' && s.location !== 'HOME').length;
    let earlyHomeCount = coreDailyShifts.filter(s => s.type === 'EARLY' && s.location === 'HOME').length;
    let lateHomeCount = coreDailyShifts.filter(s => s.type === 'LATE' && s.location === 'HOME').length;

    // Daily office target calculation
    const targetPercent = targetsMap[dayIsoNum.toString()] ?? 50;
    const totalStaff = availableEmployees.length + coreDailyShifts.length;
    let targetOffice = Math.round((totalStaff * targetPercent) / 100);
    if (targetPercent >= 100) targetOffice = totalStaff;
    if (targetPercent <= 0) targetOffice = 0;

    while (availableEmployees.length > 0) {
      const totalEarly = earlyOfficeCount + earlyHomeCount;
      const totalLate = lateOfficeCount + lateHomeCount;
      const totalOffice = earlyOfficeCount + lateOfficeCount;

      // Check if any available employee can be placed in office without exceeding their weekly office limit
      const someoneCanBeInOffice = availableEmployees.some(emp => {
        if (emp.allowedLocation === 'HOME_ONLY') return false;
        const state = empState.get(emp.id)!;
        const maxOffice = emp.maxOfficeDays ?? config.maxOfficeDaysPerWeek;
        return state.officeDays < maxOffice;
      });

      let neededType: ShiftType = 'EARLY';
      let neededLocation: LocationType | null = null;

      // Rule Priority 1: Team minimum Early in office
      if (earlyOfficeCount < config.minOfficeEarlyPerDay && someoneCanBeInOffice) {
        neededType = 'EARLY';
        neededLocation = 'OFFICE';
      }
      // Rule Priority 2: At least 1 Early shift if none yet
      else if (totalEarly === 0) {
        neededType = 'EARLY';
        neededLocation = someoneCanBeInOffice && totalOffice < targetOffice ? 'OFFICE' : 'HOME';
      }
      // Rule Priority 3: Team minimum Late shifts
      else if (totalLate < config.minLatePerDay) {
        neededType = 'LATE';
        neededLocation = someoneCanBeInOffice && totalOffice < targetOffice ? 'OFFICE' : 'HOME';
      }
      // Rule Priority 4: Balance Early vs Late and Office vs Home
      else {
        if (totalEarly < totalLate) {
          neededType = 'EARLY';
        } else if (totalLate < totalEarly) {
          neededType = 'LATE';
        } else {
          neededType = Math.random() > 0.5 ? 'EARLY' : 'LATE';
        }

        if (totalOffice < targetOffice && someoneCanBeInOffice) {
          neededLocation = 'OFFICE';
        } else {
          neededLocation = 'HOME';
        }
      }

      // Best candidate selection
      let bestEmpIndex = -1;
      let bestScore = Infinity;

      for (let j = 0; j < availableEmployees.length; j++) {
        const emp = availableEmployees[j];
        const state = empState.get(emp.id)!;
        const maxLate = emp.maxLateShifts ?? config.maxLateShiftsPerWeek;
        const maxOffice = emp.maxOfficeDays ?? config.maxOfficeDaysPerWeek;

        let score = 0;

        // Hard check: Office limit
        if (neededLocation === 'OFFICE') {
          if (emp.allowedLocation === 'HOME_ONLY') continue;
          if (state.officeDays >= maxOffice) continue;
        }

        // Hard check: Home limit
        if (neededLocation === 'HOME') {
          if (emp.allowedLocation === 'OFFICE_ONLY') continue;
        }

        // Hard check: Late shift limit
        if (neededType === 'LATE' && state.lateCount >= maxLate) {
          if (totalLate < config.minLatePerDay) {
            score += 1000; // emergency fallback
          } else {
            continue;
          }
        }

        // Preference scoring
        if (emp.preferredShift && emp.preferredShift !== 'ANY') {
          if (emp.preferredShift === neededType) score -= 15;
          else score += 15;
        }

        if (neededType === 'LATE') score += state.lateCount * 10;
        else score += state.earlyCount * 10;

        if (neededLocation === 'OFFICE') score += state.officeDays * 10;

        score += Math.random() * 0.5;

        if (score < bestScore) {
          bestScore = score;
          bestEmpIndex = j;
        }
      }

      // Fallback 1: Relax location constraint if office was requested but no one can do office
      if (bestEmpIndex === -1 && neededLocation === 'OFFICE') {
        neededLocation = 'HOME';
        for (let j = 0; j < availableEmployees.length; j++) {
          const emp = availableEmployees[j];
          if (emp.allowedLocation === 'OFFICE_ONLY') continue;
          const state = empState.get(emp.id)!;
          let score = (neededType === 'LATE' ? state.lateCount : state.earlyCount) * 10 + Math.random();
          if (score < bestScore) {
            bestScore = score;
            bestEmpIndex = j;
          }
        }
      }

      // Fallback 2: Toggle shift type if no candidate for neededType
      if (bestEmpIndex === -1) {
        neededType = neededType === 'EARLY' ? 'LATE' : 'EARLY';
        for (let j = 0; j < availableEmployees.length; j++) {
          const emp = availableEmployees[j];
          const state = empState.get(emp.id)!;
          let score = Math.random();
          if (score < bestScore) {
            bestScore = score;
            bestEmpIndex = j;
          }
        }
      }

      // Ultimate fallback: Pick first available
      if (bestEmpIndex === -1) {
        bestEmpIndex = 0;
        neededType = 'EARLY';
      }

      const chosenEmp = availableEmployees[bestEmpIndex];
      availableEmployees.splice(bestEmpIndex, 1);
      const state = empState.get(chosenEmp.id)!;

      // Final location resolution
      let finalLocation = neededLocation;
      if (!finalLocation) {
        const maxOffice = chosenEmp.maxOfficeDays ?? config.maxOfficeDaysPerWeek;
        if (chosenEmp.allowedLocation === 'HOME_ONLY') {
          finalLocation = 'HOME';
        } else if (chosenEmp.allowedLocation === 'OFFICE_ONLY') {
          finalLocation = 'OFFICE';
        } else if (state.officeDays >= maxOffice) {
          finalLocation = 'HOME';
        } else {
          finalLocation = totalOffice < targetOffice ? 'OFFICE' : 'HOME';
        }
      }

      generatedShifts.push({
        employeeId: chosenEmp.id,
        date: currentDate,
        type: neededType,
        location: finalLocation,
        isManual: false,
      });
      autoFilledCount++;

      if (finalLocation !== 'HOME') {
        if (neededType === 'EARLY') earlyOfficeCount++;
        else lateOfficeCount++;
        state.officeDays++;
      } else {
        if (neededType === 'EARLY') earlyHomeCount++;
        else lateHomeCount++;
      }

      if (neededType === 'EARLY') state.earlyCount++;
      else state.lateCount++;
    }
  }

  // Build summary stats
  const shiftsByDay: Record<string, { office: number; home: number; early: number; late: number; off: number }> = {};
  for (const dayOffset of workingDaysArray) {
    const curDate = addDays(start, dayOffset - 1);
    const dateKey = format(curDate, 'yyyy-MM-dd');
    const dayShifts = generatedShifts.filter(s => isSameDay(new Date(s.date), curDate));

    shiftsByDay[dateKey] = {
      office: dayShifts.filter(s => s.location === 'OFFICE').length,
      home: dayShifts.filter(s => s.location === 'HOME' && s.type !== 'OFF').length,
      early: dayShifts.filter(s => s.type === 'EARLY').length,
      late: dayShifts.filter(s => s.type === 'LATE').length,
      off: dayShifts.filter(s => s.type === 'OFF').length,
    };
  }

  const employeeStats: Record<string, { officeDays: number; earlyCount: number; lateCount: number; offDays: number }> = {};
  for (const [empId, st] of empState.entries()) {
    employeeStats[empId] = { ...st };
  }

  return {
    shifts: generatedShifts,
    summary: {
      totalGenerated: autoFilledCount + fixedAppliedCount,
      fixedAppliedCount,
      shiftsByDay,
      employeeStats,
    },
  };
}
