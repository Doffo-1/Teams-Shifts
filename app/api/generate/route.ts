import { NextResponse } from 'next/server';
import { prisma, ensureDefaultData } from '@/lib/db';
import { generateWeeklySchedule, ShiftInput } from '@/lib/generator';
import { startOfWeek, addDays } from 'date-fns';

export async function POST(req: Request) {
  try {
    await ensureDefaultData();
    const body = await req.json();
    const { date: dateStr, teamId } = body;

    if (!dateStr) return NextResponse.json({ error: 'Missing date' }, { status: 400 });

    const date = new Date(dateStr);
    const start = startOfWeek(date, { weekStartsOn: 1 });
    const end = addDays(start, 7);

    // Fetch team with rules
    let team = null;
    if (teamId) {
      team = await prisma.team.findUnique({
        where: { id: teamId },
        include: { rule: true },
      });
    }

    if (!team) {
      team = await prisma.team.findFirst({
        include: { rule: true },
      });
    }

    if (!team) {
      return NextResponse.json({ error: 'No team found' }, { status: 404 });
    }

    // Fetch employees for this team
    const employees = await prisma.employee.findMany({
      where: {
        teamId: team.id,
        isActive: true,
      },
    });

    if (employees.length === 0) {
      return NextResponse.json({ error: 'No active employees in team to schedule' }, { status: 400 });
    }

    const employeeIds = employees.map((e: any) => e.id);

    // Fetch existing manual shifts for this week & team
    const existingShifts = await prisma.shift.findMany({
      where: {
        date: { gte: start, lt: end },
        employeeId: { in: employeeIds },
        isManual: true,
      },
    });

    const inputShifts: ShiftInput[] = existingShifts.map((s: any) => ({
      employeeId: s.employeeId,
      date: s.date,
      type: s.type,
      location: s.location,
      isManual: s.isManual,
      customStart: s.customStart,
      customEnd: s.customEnd,
      notes: s.notes,
      color: s.color,
    }));

    // Generate schedule using team's configured rules
    const result = generateWeeklySchedule(
      employees.map((e: any) => ({
        id: e.id,
        name: e.name,
        email: e.email,
        group: e.group,
        isActive: e.isActive,
        allowedLocation: e.allowedLocation,
        fixedOffDays: e.fixedOffDays,
        maxOfficeDays: e.maxOfficeDays,
        maxLateShifts: e.maxLateShifts,
        autoSchedule: e.autoSchedule,
        preferredShift: e.preferredShift,
      })),
      start,
      inputShifts,
      team.rule ? {
        maxOfficeDaysPerWeek: team.rule.maxOfficeDaysPerWeek,
        maxLateShiftsPerWeek: team.rule.maxLateShiftsPerWeek,
        priorityDayOfWeek: team.rule.priorityDayOfWeek,
        dailyOfficeTargets: team.rule.dailyOfficeTargets,
        minOfficeEarlyPerDay: team.rule.minOfficeEarlyPerDay,
        minLatePerDay: team.rule.minLatePerDay,
        workingDays: team.rule.workingDays,
        autoBalanceShiftTypes: team.rule.autoBalanceShiftTypes,
        autoBalanceLocations: team.rule.autoBalanceLocations,
      } : undefined
    );

    // Save in transaction: delete non-manual shifts and insert generated ones
    await prisma.$transaction(async (tx: any) => {
      await tx.shift.deleteMany({
        where: {
          date: { gte: start, lt: end },
          employeeId: { in: employeeIds },
          isManual: false,
        },
      });

      for (const shift of result.shifts) {
        if (!shift.isManual) {
          await tx.shift.create({
            data: {
              employeeId: shift.employeeId,
              date: shift.date,
              type: shift.type,
              location: shift.location,
              isManual: false,
              notes: shift.notes || null,
            },
          });
        }
      }
    });

    return NextResponse.json({ success: true, summary: result.summary });
  } catch (error: any) {
    console.error('Generation error:', error);
    return NextResponse.json({ error: error?.message || 'Failed to generate schedule' }, { status: 500 });
  }
}
