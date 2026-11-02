import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const rule = await prisma.teamRule.findUnique({
      where: { teamId: id },
    });

    if (!rule) {
      // Create default if not found
      const newRule = await prisma.teamRule.create({
        data: {
          teamId: id,
          maxOfficeDaysPerWeek: 3,
          maxLateShiftsPerWeek: 3,
          priorityDayOfWeek: -1,
          dailyOfficeTargets: JSON.stringify({ '1': 50, '2': 50, '3': 50, '4': 50, '5': 50 }),
          minOfficeEarlyPerDay: 1,
          minLatePerDay: 2,
          workingDays: JSON.stringify([1, 2, 3, 4, 5]),
        },
      });
      return NextResponse.json(newRule);
    }

    return NextResponse.json(rule);
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Failed to fetch rules' }, { status: 500 });
  }
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const {
      maxOfficeDaysPerWeek,
      maxLateShiftsPerWeek,
      priorityDayOfWeek,
      dailyOfficeTargets,
      minOfficeEarlyPerDay,
      minLatePerDay,
      workingDays,
      autoBalanceShiftTypes,
      autoBalanceLocations,
    } = body;

    const updated = await prisma.teamRule.upsert({
      where: { teamId: id },
      update: {
        ...(maxOfficeDaysPerWeek !== undefined ? { maxOfficeDaysPerWeek: Number(maxOfficeDaysPerWeek) } : {}),
        ...(maxLateShiftsPerWeek !== undefined ? { maxLateShiftsPerWeek: Number(maxLateShiftsPerWeek) } : {}),
        ...(priorityDayOfWeek !== undefined ? { priorityDayOfWeek: Number(priorityDayOfWeek) } : {}),
        ...(dailyOfficeTargets !== undefined ? { dailyOfficeTargets: typeof dailyOfficeTargets === 'string' ? dailyOfficeTargets : JSON.stringify(dailyOfficeTargets) } : {}),
        ...(minOfficeEarlyPerDay !== undefined ? { minOfficeEarlyPerDay: Number(minOfficeEarlyPerDay) } : {}),
        ...(minLatePerDay !== undefined ? { minLatePerDay: Number(minLatePerDay) } : {}),
        ...(workingDays !== undefined ? { workingDays: typeof workingDays === 'string' ? workingDays : JSON.stringify(workingDays) } : {}),
        ...(autoBalanceShiftTypes !== undefined ? { autoBalanceShiftTypes: Boolean(autoBalanceShiftTypes) } : {}),
        ...(autoBalanceLocations !== undefined ? { autoBalanceLocations: Boolean(autoBalanceLocations) } : {}),
      },
      create: {
        teamId: id,
        maxOfficeDaysPerWeek: maxOfficeDaysPerWeek ? Number(maxOfficeDaysPerWeek) : 3,
        maxLateShiftsPerWeek: maxLateShiftsPerWeek ? Number(maxLateShiftsPerWeek) : 3,
        priorityDayOfWeek: priorityDayOfWeek !== undefined ? Number(priorityDayOfWeek) : -1,
        dailyOfficeTargets: dailyOfficeTargets ? (typeof dailyOfficeTargets === 'string' ? dailyOfficeTargets : JSON.stringify(dailyOfficeTargets)) : '{"1":50,"2":50,"3":50,"4":50,"5":50}',
        minOfficeEarlyPerDay: minOfficeEarlyPerDay !== undefined ? Number(minOfficeEarlyPerDay) : 1,
        minLatePerDay: minLatePerDay !== undefined ? Number(minLatePerDay) : 2,
        workingDays: workingDays ? (typeof workingDays === 'string' ? workingDays : JSON.stringify(workingDays)) : '[1,2,3,4,5]',
        autoBalanceShiftTypes: autoBalanceShiftTypes !== undefined ? Boolean(autoBalanceShiftTypes) : true,
        autoBalanceLocations: autoBalanceLocations !== undefined ? Boolean(autoBalanceLocations) : true,
      },
    });

    return NextResponse.json(updated);
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Failed to update rules' }, { status: 500 });
  }
}
