import { NextResponse } from 'next/server';
import { prisma, ensureDefaultData } from '@/lib/db';
import { getISOWeek, getWeekOfMonth, startOfWeek, addDays, startOfDay, endOfDay, isSameDay } from 'date-fns';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    await ensureDefaultData();
    const body = await request.json();
    const { teamId, clientId, weekStartDate } = body;

    if (!teamId || !weekStartDate) {
      return NextResponse.json({ error: 'teamId and weekStartDate are required' }, { status: 400 });
    }

    const startDate = new Date(weekStartDate);
    const monday = startOfWeek(startDate, { weekStartsOn: 1 });
    const isoWeek = getISOWeek(monday);
    const monthWeek = getWeekOfMonth(monday);
    const weekEnd = addDays(monday, 6);

    // Fetch clients
    let clients: any[] = [];
    try {
      clients = await (prisma as any).client.findMany({
        where: {
          teamId,
          ...(clientId ? { id: clientId } : { isActive: true }),
        },
      });
    } catch {
      if (clientId) {
        clients = (await prisma.$queryRawUnsafe(
          `SELECT * FROM "Client" WHERE "id" = ? AND "teamId" = ?`,
          clientId,
          teamId
        )) as any[];
      } else {
        clients = (await prisma.$queryRawUnsafe(
          `SELECT * FROM "Client" WHERE "teamId" = ? AND "isActive" = 1`,
          teamId
        )) as any[];
      }
    }

    // Fetch team employees with office preferences & rules
    let employees: any[] = [];
    try {
      employees = await prisma.employee.findMany({
        where: { teamId, isActive: true },
        select: { id: true, name: true, fixedOffDays: true, fixedDaySchedule: true, maxOfficeDays: true, allowedLocation: true },
      });
    } catch {
      employees = (await prisma.$queryRawUnsafe(
        `SELECT "id", "name", "fixedOffDays", "fixedDaySchedule", "maxOfficeDays", "allowedLocation" FROM "Employee" WHERE "teamId" = ? AND "isActive" = 1`,
        teamId
      )) as any[];
    }

    // Fetch team rules for maxOfficeDaysPerWeek default
    let defaultMaxOfficeDays = 3;
    try {
      const rule = await prisma.rule.findUnique({ where: { teamId } });
      if (rule && rule.maxOfficeDaysPerWeek) defaultMaxOfficeDays = rule.maxOfficeDaysPerWeek;
    } catch {
      try {
        const rules = (await prisma.$queryRawUnsafe(
          `SELECT "maxOfficeDaysPerWeek" FROM "Rule" WHERE "teamId" = ? LIMIT 1`,
          teamId
        )) as any[];
        if (rules.length > 0 && rules[0].maxOfficeDaysPerWeek) {
          defaultMaxOfficeDays = rules[0].maxOfficeDaysPerWeek;
        }
      } catch {}
    }

    // Fetch all existing shifts for the week
    let existingShifts: any[] = [];
    try {
      existingShifts = await prisma.shift.findMany({
        where: {
          employeeId: { in: employees.map(e => e.id) },
          date: {
            gte: startOfDay(monday),
            lte: endOfDay(weekEnd),
          },
        },
      });
    } catch {
      try {
        existingShifts = (await prisma.$queryRawUnsafe(
          `SELECT "id", "employeeId", "date", "type", "location" FROM "Shift"
           WHERE "date" >= ? AND "date" <= ?`,
          startOfDay(monday).toISOString(),
          endOfDay(weekEnd).toISOString()
        )) as any[];
      } catch {}
    }

    // Running office days counter for fair accountability across the week
    const empOfficeCountMap = new Map<string, number>();
    for (const emp of employees) {
      const count = existingShifts.filter(s =>
        s.employeeId === emp.id &&
        s.location !== 'HOME' &&
        s.location !== 'Thuis' &&
        s.type !== 'OFF' &&
        s.type !== 'SICK' &&
        s.type !== 'VACATION'
      ).length;
      empOfficeCountMap.set(emp.id, count);
    }

    const empMap = new Map<string, any>(employees.map(e => [e.id, e]));

    let appliedCount = 0;
    const appliedShifts: any[] = [];

    for (const client of clients) {
      // 1. Check Frequency & Week Parity
      const freq = client.frequency || 'EVERY_WEEK';
      let isWeekActive = false;

      if (freq === 'EVERY_WEEK') {
        isWeekActive = true;
      } else if (freq === 'EVERY_OTHER_WEEK') {
        const parity = client.weekParity || 'ALL';
        if (parity === 'ODD') isWeekActive = isoWeek % 2 === 1;
        else if (parity === 'EVEN') isWeekActive = isoWeek % 2 === 0;
        else isWeekActive = isoWeek % 2 === 0;
      } else if (freq === 'EVERY_MONTH') {
        isWeekActive = monthWeek === (client.monthlyWeek || 1);
      }

      if (!isWeekActive) continue;

      // 2. Active Days
      let activeDays: number[] = [1, 2, 3, 4, 5];
      try {
        if (typeof client.days === 'string') activeDays = JSON.parse(client.days);
        else if (Array.isArray(client.days)) activeDays = client.days;
      } catch {
        activeDays = [1, 2, 3, 4, 5];
      }

      // 3. Assigned Employees
      let assignedEmpIds: string[] = [];
      try {
        if (typeof client.assignedEmployeeIds === 'string') {
          assignedEmpIds = JSON.parse(client.assignedEmployeeIds);
        } else if (Array.isArray(client.assignedEmployeeIds)) {
          assignedEmpIds = client.assignedEmployeeIds;
        }
      } catch {
        assignedEmpIds = [];
      }

      let memberDayMap: Record<string, any> = {};
      try {
        if (typeof client.memberDayMap === 'string') {
          memberDayMap = JSON.parse(client.memberDayMap);
        } else if (client.memberDayMap && typeof client.memberDayMap === 'object') {
          memberDayMap = client.memberDayMap;
        }
      } catch {
        memberDayMap = {};
      }

      const validAssignedEmps = assignedEmpIds
        .map(id => empMap.get(id))
        .filter(Boolean);

      if (validAssignedEmps.length === 0) continue;

      let dailyReqs: Record<string, number> = {};
      try {
        if (typeof client.dailyRequirements === 'string') dailyReqs = JSON.parse(client.dailyRequirements);
        else if (client.dailyRequirements && typeof client.dailyRequirements === 'object') dailyReqs = client.dailyRequirements;
      } catch {
        dailyReqs = {};
      }

      const isClientOffice = client.location !== 'HOME' && client.location !== 'Thuis';

      // 4. For each active day in the week
      for (const dayNum of activeDays) {
        if (dayNum < 1 || dayNum > 5) continue;
        const shiftDate = addDays(monday, dayNum - 1);
        const dayStart = startOfDay(shiftDate);
        const dayEnd = endOfDay(shiftDate);

        // Dynamic per-day staff requirement (e.g. Mon: 1, Tue: 7, Wed: 3, etc.)
        const requiredForThisDay = dailyReqs[dayNum.toString()] !== undefined
          ? Number(dailyReqs[dayNum.toString()])
          : (dailyReqs[dayNum] !== undefined
            ? Number(dailyReqs[dayNum])
            : (client.requiredMembersPerDay && client.requiredMembersPerDay > 0 ? client.requiredMembersPerDay : 1));

        if (requiredForThisDay <= 0) continue;

        // Check availability on this date
        const isCandidateAvailable = (emp: any): boolean => {
          // Check if employee already has OFF, SICK, or VACATION on this date
          const existing = existingShifts.find(s =>
            s.employeeId === emp.id &&
            isSameDay(new Date(s.date), shiftDate)
          );
          if (existing && (existing.type === 'OFF' || existing.type === 'SICK' || existing.type === 'VACATION')) {
            return false;
          }
          if (emp.fixedOffDays) {
            try {
              const offDays = JSON.parse(emp.fixedOffDays);
              if (Array.isArray(offDays) && offDays.includes(dayNum)) return false;
            } catch {}
          }
          if (emp.allowedLocation === 'HOME_ONLY' && isClientOffice) {
            return false;
          }
          // Don't double book if already scheduled on another client today
          if (appliedShifts.some(as => as.employeeId === emp.id && as.dayNum === dayNum)) {
            return false;
          }
          return true;
        };

        // 4a. Gather candidate members configured for this day
        let dayCandidates: any[] = [];
        for (const emp of validAssignedEmps) {
          const empDays = memberDayMap[emp.id];
          if (Array.isArray(empDays) && empDays.includes(dayNum)) {
            dayCandidates.push(emp);
          }
        }

        // 4b. Day-keyed fallback
        const dayConfig = memberDayMap[dayNum.toString()] || memberDayMap[dayNum];
        if (dayConfig) {
          if (Array.isArray(dayConfig)) {
            for (const id of dayConfig) {
              const emp = empMap.get(id);
              if (emp && !dayCandidates.some(te => te.id === emp.id)) {
                dayCandidates.push(emp);
              }
            }
          } else if (typeof dayConfig === 'string') {
            const emp = empMap.get(dayConfig);
            if (emp && !dayCandidates.some(te => te.id === emp.id)) {
              dayCandidates.push(emp);
            }
          }
        }

        // 4c. If nobody has this day explicitly set, all assigned are candidates
        if (dayCandidates.length === 0) {
          dayCandidates = [...validAssignedEmps];
        }

        let availableCandidates = dayCandidates.filter(isCandidateAvailable);
        if (availableCandidates.length === 0) {
          availableCandidates = validAssignedEmps.filter(isCandidateAvailable);
        }

        // 4d. Randomize candidates so order of who was added first does NOT dictate selection
        const shuffled = [...availableCandidates].sort(() => Math.random() - 0.5);

        // 4e. Hold maximum office days accountable
        const underLimit: any[] = [];
        const atLimit: any[] = [];

        for (const emp of shuffled) {
          const maxOffice = emp.maxOfficeDays ?? defaultMaxOfficeDays;
          const currentOffice = empOfficeCountMap.get(emp.id) || 0;
          if (isClientOffice && currentOffice >= maxOffice) {
            atLimit.push(emp);
          } else {
            underLimit.push(emp);
          }
        }

        // Sort underLimit by office days ascending for fair weekly balance
        underLimit.sort((a, b) => (empOfficeCountMap.get(a.id) || 0) - (empOfficeCountMap.get(b.id) || 0));

        const orderedCandidates = [...underLimit, ...atLimit];

        // 4f. Select STRICTLY up to requiredForThisDay (never schedule all candidates when client only needs N)
        const targetEmps: any[] = [];
        for (const emp of orderedCandidates) {
          if (targetEmps.length >= requiredForThisDay) break;
          if (!targetEmps.some(te => te.id === emp.id)) {
            targetEmps.push(emp);
          }
        }

        // 4g. For each targetEmp, delete any existing shift on that day first, then create client shift
        for (const targetEmp of targetEmps) {
          // Clean up old entries on this day
          await prisma.shift.deleteMany({
            where: {
              employeeId: targetEmp.id,
              date: {
                gte: dayStart,
                lte: dayEnd,
              },
            },
          });

          await prisma.shift.create({
            data: {
              employeeId: targetEmp.id,
              date: dayStart,
              type: 'CUSTOM',
              location: client.location || client.name,
              customStart: client.startTime || '08:30',
              customEnd: client.endTime || '17:00',
              color: client.color || 'PINK',
              notes: client.notes || null,
              isManual: true,
            },
          });

          if (isClientOffice) {
            empOfficeCountMap.set(targetEmp.id, (empOfficeCountMap.get(targetEmp.id) || 0) + 1);
          }

          appliedCount++;
          appliedShifts.push({
            clientName: client.name,
            employeeId: targetEmp.id,
            employeeName: targetEmp.name,
            date: shiftDate.toISOString(),
            dayNum,
          });
        }
      }
    }

    return NextResponse.json({
      success: true,
      appliedCount,
      isoWeek,
      appliedShifts,
    });
  } catch (error: any) {
    console.error('Failed to apply client shifts:', error);
    return NextResponse.json({ error: error.message || 'Failed to apply client shifts' }, { status: 500 });
  }
}
