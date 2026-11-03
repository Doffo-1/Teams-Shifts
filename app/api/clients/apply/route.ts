import { NextResponse } from 'next/server';
import { prisma, ensureDefaultData } from '@/lib/db';
import { getISOWeek, getWeekOfMonth, startOfWeek, addDays } from 'date-fns';

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
      if (!client.isActive) continue;

      // 1. Check week frequency recurrence
      let isWeekActive = false;
      const freq = client.frequency || 'EVERY_WEEK';
      const parity = client.weekParity || 'ALL';

      if (freq === 'EVERY_WEEK') {
        isWeekActive = true;
      } else if (freq === 'EVERY_OTHER_WEEK') {
        if (parity === 'ODD') {
          isWeekActive = isoWeek % 2 === 1;
        } else if (parity === 'EVEN') {
          isWeekActive = isoWeek % 2 === 0;
        } else {
          // Default to even weeks if ALL / not specified
          isWeekActive = isoWeek % 2 === 0;
        }
      } else if (freq === 'EVERY_MONTH') {
        const targetMonthlyWeek = client.monthlyWeek || 1;
        isWeekActive = monthWeek === targetMonthlyWeek;
      }

      if (!isWeekActive) {
        continue;
      }

      // 2. Parse active days (1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri)
      let activeDays: number[] = [1, 2, 3, 4, 5];
      try {
        if (typeof client.days === 'string') {
          activeDays = JSON.parse(client.days);
        } else if (Array.isArray(client.days)) {
          activeDays = client.days;
        }
      } catch {
        activeDays = [1, 2, 3, 4, 5];
      }

      // 3. Parse assigned employees & member day map
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

      let memberDayMap: Record<string, string> = {};
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

      if (validAssignedEmps.length === 0) {
        // No members assigned to this client yet
        continue;
      }

      // 4. For each active day in the week
      for (const dayNum of activeDays) {
        if (dayNum < 1 || dayNum > 5) continue;
        const shiftDate = addDays(monday, dayNum - 1);

        // Determine which employee goes on this day
        let targetEmp: any = null;

        // Check if there's a day-specific assignment
        const designatedEmpId = memberDayMap[dayNum.toString()] || memberDayMap[dayNum];
        if (designatedEmpId && empMap.has(designatedEmpId)) {
          targetEmp = empMap.get(designatedEmpId);
        } else {
          // Round-robin or pick first available assigned employee who doesn't have a fixed off on this day
          for (const emp of validAssignedEmps) {
            let isOff = false;
            try {
              if (emp.fixedDaySchedule) {
                const sched = JSON.parse(emp.fixedDaySchedule);
                const daySched = sched[dayNum.toString()] || sched[dayNum];
                if (daySched?.type === 'OFF') isOff = true;
              }
              if (emp.fixedOffDays) {
                const offs = JSON.parse(emp.fixedOffDays);
                if (offs.includes(dayNum)) isOff = true;
              }
            } catch {}

            if (!isOff) {
              targetEmp = emp;
              break;
            }
          }
        }

        if (!targetEmp) {
          targetEmp = validAssignedEmps[0];
        }

        if (!targetEmp) continue;

        const shiftPayload = {
          employeeId: targetEmp.id,
          date: shiftDate,
          type: 'CUSTOM',
          location: client.location || client.name,
          customStart: client.startTime || '08:30',
          customEnd: client.endTime || '17:00',
          color: client.color || 'PINK',
          notes: client.notes || null,
          isManual: true,
        };

        await prisma.shift.upsert({
          where: {
            employeeId_date: {
              employeeId: targetEmp.id,
              date: shiftDate,
            },
          },
          update: shiftPayload,
          create: shiftPayload,
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
