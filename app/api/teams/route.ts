import { NextResponse } from 'next/server';
import { prisma, ensureDefaultData } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  await ensureDefaultData();
  const teams = await prisma.team.findMany({
    include: {
      rule: true,
      shiftTypes: true,
      _count: { select: { employees: true } },
    },
    orderBy: { createdAt: 'asc' },
  });

  try {
    const rawTeams = (await prisma.$queryRawUnsafe(`SELECT id, "groups" FROM "Team"`)) as any[];
    const groupMap: Record<string, string> = {};
    for (const r of rawTeams) {
      if (r.groups) groupMap[r.id] = r.groups;
    }
    for (const t of teams) {
      (t as any).groups = groupMap[t.id] || (t as any).groups || '[]';
    }
  } catch (err) {
    console.error('Error attaching raw groups to teams:', err);
  }

  return NextResponse.json(teams);
}

export async function POST(req: Request) {
  try {
    await ensureDefaultData();
    const body = await req.json();
    const { name, description, exportGroupName, breakMinutes, groups } = body;

    if (!name || !name.trim()) {
      return NextResponse.json({ error: 'Team name is required' }, { status: 400 });
    }

    const slug = name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || `team-${Date.now()}`;

    // Ensure slug uniqueness
    let finalSlug = slug;
    let counter = 1;
    while (await prisma.team.findUnique({ where: { slug: finalSlug } })) {
      finalSlug = `${slug}-${counter++}`;
    }

    const team = await prisma.team.create({
      data: {
        name: name.trim(),
        slug: finalSlug,
        description: description?.trim() || null,
        exportGroupName: exportGroupName?.trim() || name.trim(),
        breakMinutes: breakMinutes ? Number(breakMinutes) : 30,
        rule: {
          create: {
            maxOfficeDaysPerWeek: 3,
            maxLateShiftsPerWeek: 3,
            priorityDayOfWeek: -1,
            dailyOfficeTargets: JSON.stringify({ '1': 50, '2': 50, '3': 50, '4': 50, '5': 50 }),
            minOfficeEarlyPerDay: 1,
            minLatePerDay: 2,
            workingDays: JSON.stringify([1, 2, 3, 4, 5]),
            autoBalanceShiftTypes: true,
            autoBalanceLocations: true,
          },
        },
        shiftTypes: {
          create: [
            { code: 'EARLY', label: 'Early', defaultStart: '07:30', defaultEnd: '16:00', themeColor: '3. Green', isSystem: true },
            { code: 'LATE', label: 'Late', defaultStart: '09:30', defaultEnd: '18:00', themeColor: '2. Blue', isSystem: true },
            { code: 'CUSTOM', label: 'Custom', defaultStart: '08:30', defaultEnd: '17:00', themeColor: '5. Pink', isSystem: true },
            { code: 'SICK', label: 'Sick', defaultStart: '08:30', defaultEnd: '17:00', themeColor: '1. White', isSystem: true },
            { code: 'VACATION', label: 'Vacation', defaultStart: '08:30', defaultEnd: '17:00', themeColor: '1. White', isSystem: true },
          ],
        },
      } as any,
      include: {
        rule: true,
        shiftTypes: true,
        _count: { select: { employees: true } },
      },
    });

    const initialGroups = groups
      ? typeof groups === 'string'
        ? groups
        : JSON.stringify(groups)
      : JSON.stringify([
          { id: 'DEFAULT', name: 'Team Members' },
        ]);
    try {
      await prisma.$executeRawUnsafe(`UPDATE "Team" SET "groups" = ? WHERE id = ?`, initialGroups, team.id);
    } catch {}
    (team as any).groups = initialGroups;

    return NextResponse.json(team, { status: 201 });
  } catch (error: any) {
    console.error('Failed to create team:', error);
    return NextResponse.json({ error: error?.message || 'Failed to create team' }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const body = await req.json();
    const { id, name, description, exportGroupName, breakMinutes, groups } = body;

    if (!id) {
      return NextResponse.json({ error: 'Team ID is required' }, { status: 400 });
    }

    if (groups !== undefined) {
      const groupsStr = typeof groups === 'string' ? groups : JSON.stringify(groups);
      try {
        await prisma.$executeRawUnsafe(`UPDATE "Team" SET "groups" = ? WHERE id = ?`, groupsStr, id);
      } catch (e) {
        console.error('Failed to update groups with raw SQL:', e);
      }
    }

    const team = await prisma.team.update({
      where: { id },
      data: {
        ...(name ? { name: name.trim() } : {}),
        ...(description !== undefined ? { description: description?.trim() || null } : {}),
        ...(exportGroupName ? { exportGroupName: exportGroupName.trim() } : {}),
        ...(breakMinutes !== undefined ? { breakMinutes: Number(breakMinutes) } : {}),
      } as any,
      include: {
        rule: true,
        shiftTypes: true,
        _count: { select: { employees: true } },
      },
    });

    try {
      const [raw] = (await prisma.$queryRawUnsafe(`SELECT "groups" FROM "Team" WHERE id = ?`, id)) as any[];
      if (raw) (team as any).groups = raw.groups;
    } catch {}

    return NextResponse.json(team);
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Failed to update team' }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Team ID is required' }, { status: 400 });
    }

    await prisma.team.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Failed to delete team' }, { status: 500 });
  }
}
