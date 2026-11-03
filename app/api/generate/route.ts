import { NextResponse } from 'next/server';
import { prisma, ensureDefaultData } from '@/lib/db';
import { generateWeeklySchedule, ShiftInput } from '@/lib/generator';
import { startOfWeek, addDays, isSameDay } from 'date-fns';

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

    // Fetch active clients for this team
    let teamClients: any[] = [];
    try {
      teamClients = await (prisma as any).client.findMany({
        where: { teamId: team.id, isActive: true },
      });
    } catch {
      try {
        teamClients = (await prisma.$queryRawUnsafe(
          `SELECT * FROM "Client" WHERE "teamId" = ? AND "isActive" = 1`,
          team.id
        )) as any[];
      } catch { }
    }

    // Generate schedule using team's configured rules, applying fixed days & client shifts upfront
    const result = generateWeeklySchedule(
      employees.map((e: any) => ({
        id: e.id,
        name: e.name,
        email: e.email,
        group: e.group,
        isActive: e.isActive,
        allowedLocation: e.allowedLocation,
        fixedOffDays: e.fixedOffDays,
        fixedDaySchedule: e.fixedDaySchedule,
        breakMinutes: e.breakMinutes,
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
      } : undefined,
      teamClients
    );

    // Save in transaction: delete previous non-manual shifts and upsert generated & fixed ones
    await prisma.$transaction(async (tx: any) => {
      await tx.shift.deleteMany({
        where: {
          date: { gte: start, lt: end },
          employeeId: { in: employeeIds },
          isManual: false,
        },
      });

      for (const shift of result.shifts) {
        const isExistingManual = existingShifts.some(
          es => es.employeeId === shift.employeeId && isSameDay(new Date(es.date), new Date(shift.date))
        );

        if (!isExistingManual) {
          await tx.shift.upsert({
            where: {
              employeeId_date: {
                employeeId: shift.employeeId,
                date: new Date(shift.date),
              },
            },
            update: {
              type: shift.type,
              location: shift.location,
              isManual: Boolean(shift.isManual),
              customStart: shift.customStart || null,
              customEnd: shift.customEnd || null,
              notes: shift.notes || null,
              color: shift.color || null,
            },
            create: {
              employeeId: shift.employeeId,
              date: new Date(shift.date),
              type: shift.type,
              location: shift.location,
              isManual: Boolean(shift.isManual),
              customStart: shift.customStart || null,
              customEnd: shift.customEnd || null,
              notes: shift.notes || null,
              color: shift.color || null,
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
