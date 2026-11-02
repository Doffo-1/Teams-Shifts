import { NextResponse } from 'next/server';
import { prisma, ensureDefaultData } from '@/lib/db';

export async function GET(req: Request) {
  await ensureDefaultData();
  const { searchParams } = new URL(req.url);
  const teamId = searchParams.get('teamId');

  const employees = await prisma.employee.findMany({
    where: teamId ? { teamId } : {},
    orderBy: { name: 'asc' },
  });

  return NextResponse.json(employees);
}

export async function POST(req: Request) {
  try {
    await ensureDefaultData();
    const body = await req.json();
    const {
      name,
      email,
      group,
      teamId,
      allowedLocation,
      fixedOffDays,
      fixedDaySchedule,
      breakMinutes,
      maxOfficeDays,
      maxLateShifts,
      autoSchedule,
      preferredShift,
    } = body;

    if (!name || !name.trim() || !email || !email.trim()) {
      return NextResponse.json({ error: 'Name and email are required' }, { status: 400 });
    }

    let targetTeamId = teamId;
    if (!targetTeamId) {
      const defaultTeam = await prisma.team.findFirst();
      targetTeamId = defaultTeam?.id;
    }

    const employee = await prisma.employee.create({
      data: {
        name: name.trim(),
        email: email.trim(),
        group: group || 'DEFAULT',
        teamId: targetTeamId,
        allowedLocation: allowedLocation || 'ANY',
        fixedOffDays: fixedOffDays ? (typeof fixedOffDays === 'string' ? fixedOffDays : JSON.stringify(fixedOffDays)) : '[]',
        fixedDaySchedule: fixedDaySchedule ? (typeof fixedDaySchedule === 'string' ? fixedDaySchedule : JSON.stringify(fixedDaySchedule)) : '{}',
        breakMinutes: breakMinutes !== undefined && breakMinutes !== null && breakMinutes !== '' ? Number(breakMinutes) : null,
        maxOfficeDays: maxOfficeDays !== undefined && maxOfficeDays !== '' ? Number(maxOfficeDays) : null,
        maxLateShifts: maxLateShifts !== undefined && maxLateShifts !== '' ? Number(maxLateShifts) : null,
        autoSchedule: autoSchedule !== undefined ? Boolean(autoSchedule) : true,
        preferredShift: preferredShift || 'ANY',
      },
    });

    return NextResponse.json(employee, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Failed to create employee' }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const body = await req.json();
    const {
      id,
      name,
      email,
      group,
      teamId,
      allowedLocation,
      fixedOffDays,
      fixedDaySchedule,
      breakMinutes,
      maxOfficeDays,
      maxLateShifts,
      autoSchedule,
      preferredShift,
      isActive,
    } = body;

    if (!id) {
      return NextResponse.json({ error: 'Employee ID is required' }, { status: 400 });
    }

    const updated = await prisma.employee.update({
      where: { id },
      data: {
        ...(name ? { name: name.trim() } : {}),
        ...(email ? { email: email.trim() } : {}),
        ...(group !== undefined ? { group } : {}),
        ...(teamId !== undefined ? { teamId } : {}),
        ...(allowedLocation !== undefined ? { allowedLocation } : {}),
        ...(fixedOffDays !== undefined ? { fixedOffDays: typeof fixedOffDays === 'string' ? fixedOffDays : JSON.stringify(fixedOffDays) } : {}),
        ...(fixedDaySchedule !== undefined ? { fixedDaySchedule: typeof fixedDaySchedule === 'string' ? fixedDaySchedule : JSON.stringify(fixedDaySchedule) } : {}),
        ...(breakMinutes !== undefined ? { breakMinutes: breakMinutes === null || breakMinutes === '' ? null : Number(breakMinutes) } : {}),
        ...(maxOfficeDays !== undefined ? { maxOfficeDays: maxOfficeDays === null || maxOfficeDays === '' ? null : Number(maxOfficeDays) } : {}),
        ...(maxLateShifts !== undefined ? { maxLateShifts: maxLateShifts === null || maxLateShifts === '' ? null : Number(maxLateShifts) } : {}),
        ...(autoSchedule !== undefined ? { autoSchedule: Boolean(autoSchedule) } : {}),
        ...(preferredShift !== undefined ? { preferredShift } : {}),
        ...(isActive !== undefined ? { isActive: Boolean(isActive) } : {}),
      },
    });

    return NextResponse.json(updated);
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Failed to update employee' }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'Missing employee id' }, { status: 400 });

    await prisma.employee.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Failed to delete employee' }, { status: 500 });
  }
}
