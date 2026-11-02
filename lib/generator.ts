import { addDays, startOfWeek, isSameDay, getDay, format } from 'date-fns';

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
  rules?: Partial<GeneratorRules>
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

  // Filter schedulable employees (active and autoSchedule !== false)
  const schedulableEmployees = employees.filter(e => e.isActive !== false && e.autoSchedule !== false);

  const generatedShifts: ShiftInput[] = [...existingShifts];

  // Track state per employee
  const empState = new Map<string, {
    officeDays: number;
    earlyCount: number;
    lateCount: number;
    offDays: number;
  }>();

  for (const emp of employees) {
    const empShiftsThisWeek = generatedShifts.filter(
      (s) => s.employeeId === emp.id && s.date >= start && s.date < addDays(start, 7)
    );
    const officeDays = empShiftsThisWeek.filter(
      (s) => s.location !== 'HOME' && s.type !== 'OFF' && s.type !== 'SICK' && s.type !== 'VACATION'
    ).length;
    const earlyCount = empShiftsThisWeek.filter((s) => s.type === 'EARLY').length;
    const lateCount = empShiftsThisWeek.filter((s) => s.type === 'LATE').length;
    const offDays = empShiftsThisWeek.filter((s) => s.type === 'OFF').length;
    empState.set(emp.id, { officeDays, earlyCount, lateCount, offDays });
  }

  // Order days to process: priority day first, followed by others
  const orderedDayIndices: number[] = [];
  const priorityDay = config.priorityDayOfWeek; // e.g. 4 for Thursday

  if (priorityDay > 0 && workingDaysArray.includes(priorityDay)) {
    orderedDayIndices.push(priorityDay - 1); // 0-indexed offset from Monday
  }
  for (const dayNum of workingDaysArray) {
    const idx = dayNum - 1;
    if (!orderedDayIndices.includes(idx)) {
      orderedDayIndices.push(idx);
    }
  }

  let newlyCreatedCount = 0;

  for (const dayOffset of orderedDayIndices) {
    const currentDate = addDays(start, dayOffset);
    const dayIsoNum = dayOffset + 1; // 1=Mon, 2=Tue, ..., 7=Sun

    // 1. Check fixed days schedule (or fixed off days) for each employee
    for (const emp of schedulableEmployees) {
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
        const state = empState.get(emp.id)!;
        if (dayConfig.type === 'OFF') {
          generatedShifts.push({
            employeeId: emp.id,
            date: currentDate,
            type: 'OFF',
            location: 'HOME',
            isManual: false,
            notes: dayConfig.notes || 'Fixed day off',
          });
          newlyCreatedCount++;
          state.offDays++;
        } else if (dayConfig.type === 'OFFICE') {
          const shiftType = dayConfig.shiftType && dayConfig.shiftType !== 'AUTO' ? dayConfig.shiftType : 'EARLY';
          generatedShifts.push({
            employeeId: emp.id,
            date: currentDate,
            type: shiftType,
            location: 'OFFICE',
            isManual: false,
            notes: dayConfig.notes || 'Fixed office',
          });
          newlyCreatedCount++;
          state.officeDays++;
          if (shiftType === 'LATE') state.lateCount++;
          else if (shiftType === 'EARLY') state.earlyCount++;
        } else if (dayConfig.type === 'HOME') {
          const shiftType = dayConfig.shiftType && dayConfig.shiftType !== 'AUTO' ? dayConfig.shiftType : 'EARLY';
          generatedShifts.push({
            employeeId: emp.id,
            date: currentDate,
            type: shiftType,
            location: 'HOME',
            isManual: false,
            notes: dayConfig.notes || 'Fixed home',
          });
          newlyCreatedCount++;
          if (shiftType === 'LATE') state.lateCount++;
          else if (shiftType === 'EARLY') state.earlyCount++;
        } else if (dayConfig.type === 'CUSTOM') {
          const loc = dayConfig.location || 'OFFICE';
          generatedShifts.push({
            employeeId: emp.id,
            date: currentDate,
            type: 'CUSTOM',
            location: loc,
            customStart: dayConfig.start || '08:30',
            customEnd: dayConfig.end || '17:00',
            isManual: false,
            notes: dayConfig.notes || 'Fixed custom',
          });
          newlyCreatedCount++;
          if (loc !== 'HOME') state.officeDays++;
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
            isManual: false,
            notes: 'Fixed day off',
          });
          newlyCreatedCount++;
          const state = empState.get(emp.id)!;
          state.offDays++;
        }
      }
    }

    // 2. Find employees available today
    let availableEmployees = schedulableEmployees.filter(
      emp => !generatedShifts.some(s => s.employeeId === emp.id && isSameDay(new Date(s.date), currentDate))
    );

    // 3. Calculate current daily shift tallies
    const dailyShifts = generatedShifts.filter(
      s => isSameDay(new Date(s.date), currentDate) &&
           s.type !== 'OFF' && s.type !== 'SICK' && s.type !== 'VACATION' && s.type !== 'CUSTOM'
    );
    const coreDailyShifts = dailyShifts.filter(s => s.location === 'HOME' || s.location === 'OFFICE');

    let earlyOfficeCount = coreDailyShifts.filter(s => s.type === 'EARLY' && s.location !== 'HOME').length;
    let lateOfficeCount = coreDailyShifts.filter(s => s.type === 'LATE' && s.location !== 'HOME').length;
    let earlyHomeCount = coreDailyShifts.filter(s => s.type === 'EARLY' && s.location === 'HOME').length;
    let lateHomeCount = coreDailyShifts.filter(s => s.type === 'LATE' && s.location === 'HOME').length;

    // Daily office target percentage
    const targetPercent = targetsMap[dayIsoNum.toString()] ?? 50;

    while (availableEmployees.length > 0) {
      const totalEarly = earlyOfficeCount + earlyHomeCount;
      const totalLate = lateOfficeCount + lateHomeCount;
      const totalOffice = earlyOfficeCount + lateOfficeCount;
      const totalStaff = availableEmployees.length + totalEarly + totalLate;

      // Calculate target office count for this day
      let targetOffice = Math.round((totalStaff * targetPercent) / 100);
      if (targetPercent >= 100) targetOffice = totalStaff;
      if (targetPercent <= 0) targetOffice = 0;

      // Check if any available employee can be in office
      const someoneCanBeInOffice = availableEmployees.some(emp => {
        if (emp.allowedLocation === 'HOME_ONLY') return false;
        const state = empState.get(emp.id)!;
        const maxOffice = emp.maxOfficeDays ?? config.maxOfficeDaysPerWeek;
        return state.officeDays < maxOffice;
      });

      let neededType: ShiftType = 'EARLY';
      let neededLocation: LocationType | null = null;

      // Determine required shift type and location
      if (earlyOfficeCount < config.minOfficeEarlyPerDay && someoneCanBeInOffice) {
        neededType = 'EARLY';
        neededLocation = 'OFFICE';
      } else if (totalEarly === 0) {
        neededType = 'EARLY';
        neededLocation = someoneCanBeInOffice && totalOffice < targetOffice ? 'OFFICE' : 'HOME';
      } else if (totalLate < config.minLatePerDay) {
        neededType = 'LATE';
        neededLocation = totalOffice < targetOffice && someoneCanBeInOffice ? 'OFFICE' : 'HOME';
      } else {
        // Balance Early vs Late
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

        // Hard checks
        if (neededLocation === 'OFFICE') {
          if (emp.allowedLocation === 'HOME_ONLY') continue;
          if (state.officeDays >= maxOffice) continue;
        }

        if (neededLocation === 'HOME') {
          if (emp.allowedLocation === 'OFFICE_ONLY') continue;
        }

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

      // Fallback 1: Relax location constraint if needed
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

      // Fallback 2: Toggle shift type if no one can take the requested type
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
      newlyCreatedCount++;

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
      totalGenerated: newlyCreatedCount,
      shiftsByDay,
      employeeStats,
    },
  };
}
