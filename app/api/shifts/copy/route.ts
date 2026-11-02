import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { startOfWeek, addDays, differenceInDays } from 'date-fns';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { type, sourceDate, targetDate, teamId } = body;

    if (!type || !sourceDate || !targetDate) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const source = new Date(sourceDate);
    const target = new Date(targetDate);

    let dayOffset = 0;
    let shiftsToCopy: any[] = [];

    const employeeFilter = teamId ? { employee: { teamId } } : {};

    if (type === 'WEEK') {
      const sourceStart = startOfWeek(source, { weekStartsOn: 1 });
      const targetStart = startOfWeek(target, { weekStartsOn: 1 });
      dayOffset = differenceInDays(targetStart, sourceStart);
      const sourceEnd = addDays(sourceStart, 7);

      shiftsToCopy = await prisma.shift.findMany({
        where: {
          date: { gte: sourceStart, lt: sourceEnd },
          ...employeeFilter,
        },
      });
    } else if (type === 'DAY') {
      dayOffset = differenceInDays(target, source);
      const nextDay = addDays(source, 1);
      shiftsToCopy = await prisma.shift.findMany({
        where: {
          date: { gte: source, lt: nextDay },
          ...employeeFilter,
        },
      });
    }

    if (shiftsToCopy.length === 0) {
      return NextResponse.json({ message: 'No shifts found to copy', count: 0 });
    }

    await prisma.$transaction(async (tx: any) => {
      for (const shift of shiftsToCopy) {
        const newDate = addDays(new Date(shift.date), dayOffset);

        await tx.shift.upsert({
          where: {
            employeeId_date: {
              employeeId: shift.employeeId,
              date: newDate,
            },
          },
          update: {
            type: shift.type,
            location: shift.location,
            isManual: shift.isManual,
            customStart: shift.customStart,
            customEnd: shift.customEnd,
            notes: shift.notes,
            color: shift.color,
          },
          create: {
            employeeId: shift.employeeId,
            date: newDate,
            type: shift.type,
            location: shift.location,
            isManual: shift.isManual,
            customStart: shift.customStart,
            customEnd: shift.customEnd,
            notes: shift.notes,
            color: shift.color,
          },
        });
      }
    });

    return NextResponse.json({ success: true, count: shiftsToCopy.length });
  } catch (error: any) {
    console.error('Copy shifts error:', error);
    return NextResponse.json({ error: error?.message || 'Failed to copy shifts' }, { status: 500 });
  }
}
