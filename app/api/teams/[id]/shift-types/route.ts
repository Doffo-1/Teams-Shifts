import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const shiftTypes = await prisma.shiftTypeConfig.findMany({
      where: { teamId: id },
      orderBy: { createdAt: 'asc' },
    });
    return NextResponse.json(shiftTypes);
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Failed to fetch shift types' }, { status: 500 });
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { code, label, defaultStart, defaultEnd, themeColor } = body;

    if (!code || !label) {
      return NextResponse.json({ error: 'Code and label are required' }, { status: 400 });
    }

    const created = await prisma.shiftTypeConfig.create({
      data: {
        teamId: id,
        code: code.trim().toUpperCase(),
        label: label.trim(),
        defaultStart: defaultStart || '08:00',
        defaultEnd: defaultEnd || '16:30',
        themeColor: themeColor || '5. Pink',
        isSystem: false,
      },
    });

    return NextResponse.json(created, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Failed to create shift type' }, { status: 500 });
  }
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { typeId, label, defaultStart, defaultEnd, themeColor } = body;

    if (!typeId) {
      return NextResponse.json({ error: 'Type ID is required' }, { status: 400 });
    }

    const updated = await prisma.shiftTypeConfig.update({
      where: { id: typeId, teamId: id },
      data: {
        ...(label ? { label: label.trim() } : {}),
        ...(defaultStart ? { defaultStart: defaultStart.trim() } : {}),
        ...(defaultEnd ? { defaultEnd: defaultEnd.trim() } : {}),
        ...(themeColor ? { themeColor: themeColor.trim() } : {}),
      },
    });

    return NextResponse.json(updated);
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Failed to update shift type' }, { status: 500 });
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(req.url);
    const typeId = searchParams.get('typeId');

    if (!typeId) {
      return NextResponse.json({ error: 'Type ID is required' }, { status: 400 });
    }

    const item = await prisma.shiftTypeConfig.findUnique({
      where: { id: typeId, teamId: id },
    });

    if (item?.isSystem) {
      return NextResponse.json({ error: 'Cannot delete built-in system shift type' }, { status: 400 });
    }

    await prisma.shiftTypeConfig.delete({
      where: { id: typeId, teamId: id },
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Failed to delete shift type' }, { status: 500 });
  }
}
