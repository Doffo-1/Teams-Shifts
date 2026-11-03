import { NextResponse } from 'next/server';
import { prisma, ensureDefaultData } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    await ensureDefaultData();
    const { searchParams } = new URL(request.url);
    const teamId = searchParams.get('teamId');

    if (!teamId) {
      return NextResponse.json({ error: 'teamId is required' }, { status: 400 });
    }

    let clients: any[] = [];
    try {
      clients = await (prisma as any).client.findMany({
        where: { teamId },
        orderBy: { name: 'asc' },
      });
    } catch {
      // Fallback raw query if Prisma client wasn't re-generated locally yet
      clients = (await prisma.$queryRawUnsafe(
        `SELECT * FROM "Client" WHERE "teamId" = ? ORDER BY "name" ASC`,
        teamId
      )) as any[];
    }

    return NextResponse.json({ clients });
  } catch (error: any) {
    console.error('Failed to get clients:', error);
    return NextResponse.json({ error: error.message || 'Failed to fetch clients' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await ensureDefaultData();
    const body = await request.json();
    const {
      teamId,
      name,
      color = 'PINK',
      location = '',
      startTime = '08:30',
      endTime = '17:00',
      frequency = 'EVERY_WEEK',
      weekParity = 'ALL',
      monthlyWeek = 1,
      days = '[1,2,3,4,5]',
      assignedEmployeeIds = '[]',
      memberDayMap = '{}',
      requiredMembersPerDay = 1,
      notes = null,
      isActive = true,
    } = body;

    if (!teamId || !name?.trim()) {
      return NextResponse.json({ error: 'teamId and client name are required' }, { status: 400 });
    }

    const clientData = {
      teamId,
      name: name.trim(),
      color,
      location: location?.trim() || name.trim(),
      startTime: startTime || '08:30',
      endTime: endTime || '17:00',
      frequency,
      weekParity: weekParity || 'ALL',
      monthlyWeek: monthlyWeek ? parseInt(monthlyWeek.toString(), 10) : 1,
      days: typeof days === 'string' ? days : JSON.stringify(days),
      assignedEmployeeIds: typeof assignedEmployeeIds === 'string' ? assignedEmployeeIds : JSON.stringify(assignedEmployeeIds),
      memberDayMap: typeof memberDayMap === 'string' ? memberDayMap : JSON.stringify(memberDayMap),
      requiredMembersPerDay: parseInt(requiredMembersPerDay?.toString() || '1', 10) || 1,
      notes: notes?.trim() || null,
      isActive: isActive !== false,
    };

    let client: any = null;
    try {
      client = await (prisma as any).client.create({
        data: clientData,
      });
    } catch {
      const id = 'cl_' + Date.now().toString(36) + Math.random().toString(36).substring(2, 7);
      await prisma.$executeRawUnsafe(
        `INSERT INTO "Client" ("id", "teamId", "name", "color", "location", "startTime", "endTime", "frequency", "weekParity", "monthlyWeek", "days", "assignedEmployeeIds", "memberDayMap", "requiredMembersPerDay", "notes", "isActive", "createdAt", "updatedAt")
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        id,
        clientData.teamId,
        clientData.name,
        clientData.color,
        clientData.location,
        clientData.startTime,
        clientData.endTime,
        clientData.frequency,
        clientData.weekParity,
        clientData.monthlyWeek,
        clientData.days,
        clientData.assignedEmployeeIds,
        clientData.memberDayMap,
        clientData.requiredMembersPerDay,
        clientData.notes,
        clientData.isActive ? 1 : 0
      );
      client = { id, ...clientData, createdAt: new Date(), updatedAt: new Date() };
    }

    return NextResponse.json({ client }, { status: 201 });
  } catch (error: any) {
    console.error('Failed to create client:', error);
    return NextResponse.json({ error: error.message || 'Failed to create client' }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    await ensureDefaultData();
    const body = await request.json();
    const {
      id,
      name,
      color,
      location,
      startTime,
      endTime,
      frequency,
      weekParity,
      monthlyWeek,
      days,
      assignedEmployeeIds,
      memberDayMap,
      requiredMembersPerDay,
      notes,
      isActive,
    } = body;

    if (!id) {
      return NextResponse.json({ error: 'Client id is required' }, { status: 400 });
    }

    const updateData: any = {};
    if (name !== undefined) updateData.name = name.trim();
    if (color !== undefined) updateData.color = color;
    if (location !== undefined) updateData.location = location?.trim() || name?.trim();
    if (startTime !== undefined) updateData.startTime = startTime;
    if (endTime !== undefined) updateData.endTime = endTime;
    if (frequency !== undefined) updateData.frequency = frequency;
    if (weekParity !== undefined) updateData.weekParity = weekParity;
    if (monthlyWeek !== undefined) updateData.monthlyWeek = parseInt(monthlyWeek.toString(), 10) || 1;
    if (days !== undefined) updateData.days = typeof days === 'string' ? days : JSON.stringify(days);
    if (assignedEmployeeIds !== undefined) {
      updateData.assignedEmployeeIds = typeof assignedEmployeeIds === 'string' ? assignedEmployeeIds : JSON.stringify(assignedEmployeeIds);
    }
    if (memberDayMap !== undefined) {
      updateData.memberDayMap = typeof memberDayMap === 'string' ? memberDayMap : JSON.stringify(memberDayMap);
    }
    if (requiredMembersPerDay !== undefined) {
      updateData.requiredMembersPerDay = parseInt(requiredMembersPerDay.toString(), 10) || 1;
    }
    if (notes !== undefined) updateData.notes = notes?.trim() || null;
    if (isActive !== undefined) updateData.isActive = Boolean(isActive);

    let client: any = null;
    try {
      client = await (prisma as any).client.update({
        where: { id },
        data: updateData,
      });
    } catch {
      await prisma.$executeRawUnsafe(
        `UPDATE "Client" SET
          "name" = COALESCE(?, "name"),
          "color" = COALESCE(?, "color"),
          "location" = COALESCE(?, "location"),
          "startTime" = COALESCE(?, "startTime"),
          "endTime" = COALESCE(?, "endTime"),
          "frequency" = COALESCE(?, "frequency"),
          "weekParity" = COALESCE(?, "weekParity"),
          "monthlyWeek" = COALESCE(?, "monthlyWeek"),
          "days" = COALESCE(?, "days"),
          "assignedEmployeeIds" = COALESCE(?, "assignedEmployeeIds"),
          "memberDayMap" = COALESCE(?, "memberDayMap"),
          "requiredMembersPerDay" = COALESCE(?, "requiredMembersPerDay"),
          "notes" = ?,
          "isActive" = COALESCE(?, "isActive"),
          "updatedAt" = CURRENT_TIMESTAMP
         WHERE "id" = ?`,
        updateData.name ?? null,
        updateData.color ?? null,
        updateData.location ?? null,
        updateData.startTime ?? null,
        updateData.endTime ?? null,
        updateData.frequency ?? null,
        updateData.weekParity ?? null,
        updateData.monthlyWeek ?? null,
        updateData.days ?? null,
        updateData.assignedEmployeeIds ?? null,
        updateData.memberDayMap ?? null,
        updateData.requiredMembersPerDay ?? null,
        updateData.notes ?? null,
        updateData.isActive !== undefined ? (updateData.isActive ? 1 : 0) : null,
        id
      );
      const rows = (await prisma.$queryRawUnsafe(`SELECT * FROM "Client" WHERE "id" = ? LIMIT 1`, id)) as any[];
      client = rows[0];
    }

    return NextResponse.json({ client });
  } catch (error: any) {
    console.error('Failed to update client:', error);
    return NextResponse.json({ error: error.message || 'Failed to update client' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    await ensureDefaultData();
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    try {
      await (prisma as any).client.delete({ where: { id } });
    } catch {
      await prisma.$executeRawUnsafe(`DELETE FROM "Client" WHERE "id" = ?`, id);
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Failed to delete client:', error);
    return NextResponse.json({ error: error.message || 'Failed to delete client' }, { status: 500 });
  }
}

