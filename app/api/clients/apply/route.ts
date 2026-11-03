import { NextResponse } from 'next/server';
import { prisma, ensureDefaultData } from '@/lib/db';
import { getISOWeek, getWeekOfMonth, startOfWeek, addDays, startOfDay, endOfDay } from 'date-fns';

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

    // Fetch team employees
    let employees: any[] = [];
    try {
      employees = await prisma.employee.findMany({
        where: { teamId, isActive: true },
        select: { id: true, name: true, fixedOffDays: true, fixedDaySchedule: true },
      });
    } catch {
      employees = (await prisma.$queryRawUnsafe(
        `SELECT "id", "name", "fixedOffDays", "fixedDaySchedule" FROM "Employee" WHERE "teamId" = ? AND "isActive" = 1`,
        teamId
      )) as any[];
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

      const requiredCount = client.requiredMembersPerDay && client.requiredMembersPerDay > 0
        ? client.requiredMembersPerDay
        : 1;

      // 4. For each active day in the week
      for (const dayNum of activeDays) {
        if (dayNum < 1 || dayNum > 5) continue;
        const shiftDate = addDays(monday, dayNum - 1);
        const dayStart = startOfDay(shiftDate);
        const dayEnd = endOfDay(shiftDate);

        const targetEmps: any[] = [];

        // 4a. Check member-specific assigned days (e.g. memberDayMap[empId] = [1, 5])
        for (const emp of validAssignedEmps) {
          const empDays = memberDayMap[emp.id];
          if (Array.isArray(empDays) && empDays.includes(dayNum)) {
            targetEmps.push(emp);
          }
        }

        // 4b. Check day-keyed fallback
        const dayConfig = memberDayMap[dayNum.toString()] || memberDayMap[dayNum];
        if (dayConfig) {
          if (Array.isArray(dayConfig)) {
            for (const id of dayConfig) {
              const emp = empMap.get(id);
              if (emp && !targetEmps.some(te => te.id === emp.id)) {
                targetEmps.push(emp);
              }
            }
          } else if (typeof dayConfig === 'string') {
            const emp = empMap.get(dayConfig);
            if (emp && !targetEmps.some(te => te.id === emp.id)) {
              targetEmps.push(emp);
            }
          }
        }

        // 4c. Fill up to requiredCount if needed
        if (targetEmps.length === 0) {
          for (const emp of validAssignedEmps) {
            if (targetEmps.length >= requiredCount) break;
            if (!targetEmps.some(te => te.id === emp.id)) {
              targetEmps.push(emp);
            }
          }
        } else if (targetEmps.length < requiredCount) {
          for (const emp of validAssignedEmps) {
            if (targetEmps.length >= requiredCount) break;
            if (!targetEmps.some(te => te.id === emp.id)) {
              targetEmps.push(emp);
            }
          }
        }

        // 4d. For each targetEmp, delete any existing shift on that day first, then create client shift
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

          appliedCount++;
          appliedShifts.push({
            clientName: client.name,
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
