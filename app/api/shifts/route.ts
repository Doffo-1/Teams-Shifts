import { NextResponse } from 'next/server';
import { prisma, ensureDefaultData } from '@/lib/db';
import { startOfWeek, addDays, startOfDay, endOfDay } from 'date-fns';

export async function GET(req: Request) {
  await ensureDefaultData();
  const { searchParams } = new URL(req.url);
  const dateStr = searchParams.get('date');
  const teamId = searchParams.get('teamId');

  if (!dateStr) return NextResponse.json({ error: 'Missing date' }, { status: 400 });

  const date = new Date(dateStr);
  const start = startOfWeek(date, { weekStartsOn: 1 });
  const end = addDays(start, 7);

  const shifts = await prisma.shift.findMany({
    where: {
      date: {
        gte: start,
        lt: end,
      },
      ...(teamId ? { employee: { teamId } } : {}),
    },
    include: {
      employee: {
        select: { id: true, name: true, email: true, group: true, teamId: true },
      },
    },
    orderBy: { date: 'asc' },
  });

  return NextResponse.json(shifts);
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { employeeId, date, type, location, isManual, customStart, customEnd, notes, color } = body;

    if (!employeeId || !date) {
      return NextResponse.json({ error: 'Missing employeeId or date' }, { status: 400 });
    }

    const d = new Date(date);
    const dayStart = startOfDay(d);
    const dayEnd = endOfDay(d);

    // Always remove any existing shift for this employee on this day first
    // to guarantee no duplicate or stale entries exist
    await prisma.shift.deleteMany({
      where: {
        employeeId,
        date: {
          gte: dayStart,
          lte: dayEnd,
        },
      },
    });

    const shift = await prisma.shift.create({
      data: {
        employeeId,
        date: dayStart,
        type: type || 'EARLY',
        location: location || 'OFFICE',
        isManual: isManual !== undefined ? Boolean(isManual) : true,
        customStart: customStart || null,
        customEnd: customEnd || null,
        notes: notes || null,
        color: color || null,
      },
    });

    return NextResponse.json(shift);
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Failed to save shift' }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const clearWeek = searchParams.get('clearWeek');
    const teamId = searchParams.get('teamId');
    const dateStr = searchParams.get('date');

    // Clear whole week for a team
    if (clearWeek === 'true' && dateStr) {
      const d = new Date(dateStr);
      const weekStart = startOfWeek(d, { weekStartsOn: 1 });
      const weekEnd = addDays(weekStart, 7);

      let employeesWhere = {};
      if (teamId) {
        const teamEmps = await prisma.employee.findMany({
          where: { teamId },
          select: { id: true },
        });
        employeesWhere = { employeeId: { in: teamEmps.map(e => e.id) } };
      }

      const res = await prisma.shift.deleteMany({
        where: {
          date: { gte: weekStart, lt: weekEnd },
          ...employeesWhere,
        },
      });

      return NextResponse.json({ success: true, deletedCount: res.count });
    }

    const employeeId = searchParams.get('employeeId');
    if (!employeeId || !dateStr) {
      return NextResponse.json({ error: 'Missing parameters' }, { status: 400 });
    }

    const d = new Date(dateStr);
    await prisma.shift.deleteMany({
      where: {
        employeeId,
        date: {
          gte: startOfDay(d),
          lte: endOfDay(d),
        },
      },
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Failed to delete shift' }, { status: 500 });
  }
}
