import { NextResponse } from 'next/server';
import { prisma, ensureDefaultData } from '@/lib/db';

export const dynamic = 'force-dynamic';

interface GroupItem {
  id: string;
  name: string;
}

function parseGroups(groupsJson?: string | null): GroupItem[] {
  try {
    if (groupsJson) {
      const parsed = JSON.parse(groupsJson);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch {
    // fallback
  }
  return [
    { id: 'DEFAULT', name: 'Team Members' },
    { id: 'NIET_IN_DE_LIJN', name: 'Niet in de lijn' },
  ];
}

async function getTeamGroups(teamId: string): Promise<GroupItem[]> {
  try {
    const rows = await prisma.$queryRawUnsafe<any[]>(`SELECT "groups" FROM "Team" WHERE id = ?`, teamId);
    if (rows && rows.length > 0) {
      return parseGroups(rows[0].groups);
    }
  } catch (err) {
    console.error('Error reading groups from database:', err);
  }
  return [
    { id: 'DEFAULT', name: 'Team Members' },
    { id: 'NIET_IN_DE_LIJN', name: 'Niet in de lijn' },
  ];
}

async function setTeamGroups(teamId: string, groups: GroupItem[]): Promise<void> {
  const jsonStr = JSON.stringify(groups);
  await prisma.$executeRawUnsafe(`UPDATE "Team" SET "groups" = ? WHERE id = ?`, jsonStr, teamId);
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  await ensureDefaultData();
  const { id } = await params;

  const team = await prisma.team.findUnique({
    where: { id },
    include: { employees: true },
  });

  if (!team) {
    return NextResponse.json({ error: 'Team not found' }, { status: 404 });
  }

  const groups = await getTeamGroups(id);

  // Augment groups with member count
  const groupsWithCounts = groups.map(g => ({
    ...g,
    memberCount: team.employees.filter(e => (e.group || 'DEFAULT') === g.id).length,
  }));

  return NextResponse.json(groupsWithCounts);
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await ensureDefaultData();
    const { id } = await params;
    const body = await req.json();
    const { name, id: customId } = body;

    if (!name || !name.trim()) {
      return NextResponse.json({ error: 'Group name is required' }, { status: 400 });
    }

    const team = await prisma.team.findUnique({ where: { id } });
    if (!team) {
      return NextResponse.json({ error: 'Team not found' }, { status: 404 });
    }

    const groups = await getTeamGroups(id);
    const trimmedName = name.trim();

    // Check duplicate name
    if (groups.some(g => g.name.toLowerCase() === trimmedName.toLowerCase())) {
      return NextResponse.json({ error: `Group "${trimmedName}" already exists` }, { status: 400 });
    }

    // Generate unique ID
    let groupId = (customId || trimmedName.toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '')).trim();
    if (!groupId) groupId = `GROUP_${Date.now()}`;

    // Ensure ID uniqueness
    let finalId = groupId;
    let counter = 1;
    while (groups.some(g => g.id === finalId)) {
      finalId = `${groupId}_${counter++}`;
    }

    const newGroup: GroupItem = { id: finalId, name: trimmedName };
    const updatedGroups = [...groups, newGroup];

    await setTeamGroups(id, updatedGroups);

    return NextResponse.json({ success: true, group: newGroup, groups: updatedGroups }, { status: 201 });
  } catch (error: any) {
    console.error('Failed to create group:', error);
    return NextResponse.json({ error: error?.message || 'Failed to create group' }, { status: 500 });
  }
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await ensureDefaultData();
    const { id } = await params;
    const body = await req.json();
    const { id: groupId, name } = body;

    if (!groupId || !name || !name.trim()) {
      return NextResponse.json({ error: 'Group ID and name are required' }, { status: 400 });
    }

    const team = await prisma.team.findUnique({ where: { id } });
    if (!team) {
      return NextResponse.json({ error: 'Team not found' }, { status: 404 });
    }

    const groups = await getTeamGroups(id);
    const targetIdx = groups.findIndex(g => g.id === groupId);
    if (targetIdx === -1) {
      return NextResponse.json({ error: 'Group not found' }, { status: 404 });
    }

    const trimmedName = name.trim();
    groups[targetIdx].name = trimmedName;

    await setTeamGroups(id, groups);

    return NextResponse.json({ success: true, group: groups[targetIdx], groups });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Failed to rename group' }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await ensureDefaultData();
    const { id } = await params;
    const { searchParams } = new URL(req.url);
    const groupId = searchParams.get('groupId');
    const reassignTo = searchParams.get('reassignTo');
    const deleteMembers = searchParams.get('deleteMembers') === 'true';

    if (!groupId) {
      return NextResponse.json({ error: 'groupId is required' }, { status: 400 });
    }

    const team = await prisma.team.findUnique({
      where: { id },
      include: { employees: true },
    });

    if (!team) {
      return NextResponse.json({ error: 'Team not found' }, { status: 404 });
    }

    const groups = await getTeamGroups(id);
    if (groups.length <= 1) {
      return NextResponse.json({ error: 'Cannot delete the only remaining group' }, { status: 400 });
    }

    const groupToDelete = groups.find(g => g.id === groupId);
    if (!groupToDelete) {
      return NextResponse.json({ error: 'Group not found' }, { status: 404 });
    }

    const remainingGroups = groups.filter(g => g.id !== groupId);
    const affectedEmployees = team.employees.filter(e => (e.group || 'DEFAULT') === groupId);

    if (affectedEmployees.length > 0) {
      const empIds = affectedEmployees.map(e => e.id);
      if (deleteMembers) {
        // Delete all shifts and employees in this group
        await prisma.shift.deleteMany({
          where: { employeeId: { in: empIds } },
        });
        await prisma.employee.deleteMany({
          where: { id: { in: empIds } },
        });
      } else {
        // Reassign members to specified group or first remaining group
        const targetGroup = reassignTo && remainingGroups.some(g => g.id === reassignTo)
          ? reassignTo
          : remainingGroups[0].id;

        await prisma.employee.updateMany({
          where: { id: { in: empIds } },
          data: { group: targetGroup },
        });
      }
    }

    // Update team groups
    await setTeamGroups(id, remainingGroups);

    return NextResponse.json({
      success: true,
      message: `Group "${groupToDelete.name}" deleted successfully`,
      groups: remainingGroups,
    });
  } catch (error: any) {
    console.error('Failed to delete group:', error);
    return NextResponse.json({ error: error?.message || 'Failed to delete group' }, { status: 500 });
  }
}
