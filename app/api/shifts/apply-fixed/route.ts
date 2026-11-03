import { NextResponse } from 'next/server';
import { prisma, ensureDefaultData } from '@/lib/db';
import { startOfWeek, addDays } from 'date-fns';

export async function POST(req: Request) {
  try {
    await ensureDefaultData();
    const body = await req.json();
    const { date: dateStr, teamId } = body;

    if (!dateStr) return NextResponse.json({ error: 'Missing date' }, { status: 400 });

    const date = new Date(dateStr);
    const start = startOfWeek(date, { weekStartsOn: 1 }); // Monday

    let targetTeamId = teamId;
    if (!targetTeamId) {
      const defaultTeam = await prisma.team.findFirst();
      targetTeamId = defaultTeam?.id;
    }

    if (!targetTeamId) {
      return NextResponse.json({ error: 'No team found' }, { status: 404 });
    }

    const employees = await prisma.employee.findMany({
      where: {
        teamId: targetTeamId,
        isActive: true,
      },
    });

    let appliedCount = 0;

    await prisma.$transaction(async (tx: any) => {
      for (const emp of employees) {
        let fixedSchedule: Record<string, any> = {};
        try {
          if (emp.fixedDaySchedule) {
            fixedSchedule = JSON.parse(emp.fixedDaySchedule);
          }
        } catch {
          fixedSchedule = {};
        }

        // Weekdays Mon-Fri (1..5)
        for (let dayOffset = 0; dayOffset < 5; dayOffset++) {
          const shiftDate = addDays(start, dayOffset);
          const dayNum = dayOffset + 1; // 1=Mon, ..., 5=Fri
          const dayConfig = fixedSchedule[dayNum.toString()] || fixedSchedule[dayNum];

          if (dayConfig && dayConfig.type && dayConfig.type !== 'AUTO') {
            let type = 'EARLY';
            let location = 'OFFICE';
            let customStart: string | null = null;
            let customEnd: string | null = null;
            let notes = dayConfig.notes || null;

            if (dayConfig.type === 'OFF') {
              type = 'OFF';
              location = 'HOME';
              notes = notes || null;
            } else if (dayConfig.type === 'OFFICE') {
              type = dayConfig.shiftType && dayConfig.shiftType !== 'AUTO' ? dayConfig.shiftType : 'EARLY';
              location = 'OFFICE';
              notes = notes || null;
            } else if (dayConfig.type === 'HOME') {
              type = dayConfig.shiftType && dayConfig.shiftType !== 'AUTO' ? dayConfig.shiftType : 'EARLY';
              location = 'HOME';
              notes = notes || null;
            } else if (dayConfig.type === 'CUSTOM') {
              type = 'CUSTOM';
              location = dayConfig.location || 'OFFICE';
              customStart = dayConfig.start || '08:30';
              customEnd = dayConfig.end || '17:00';
              notes = notes || null;
            }

            await tx.shift.upsert({
              where: {
                employeeId_date: {
                  employeeId: emp.id,
                  date: shiftDate,
                },
              },
              update: {
                type,
                location,
                isManual: true,
                customStart,
                customEnd,
                notes,
              },
              create: {
                employeeId: emp.id,
                date: shiftDate,
                type,
                location,
                isManual: true,
                customStart,
                customEnd,
                notes,
              },
            });
            appliedCount++;
          } else {
            // Check legacy fixedOffDays
            let fixedOffs: number[] = [];
            try {
              if (emp.fixedOffDays) fixedOffs = JSON.parse(emp.fixedOffDays);
            } catch {}

            if (fixedOffs.includes(dayNum)) {
              await tx.shift.upsert({
                where: {
                  employeeId_date: {
                    employeeId: emp.id,
                    date: shiftDate,
                  },
                },
                update: {
                  type: 'OFF',
                  location: 'HOME',
                  isManual: true,
                  notes: null,
                },
                create: {
                  employeeId: emp.id,
                  date: shiftDate,
                  type: 'OFF',
                  location: 'HOME',
                  isManual: true,
                  notes: null,
                },
              });
              appliedCount++;
            }
          }
        }
      }
    });

    return NextResponse.json({ success: true, count: appliedCount });
  } catch (error: any) {
    console.error('Failed to apply fixed shifts:', error);
    return NextResponse.json({ error: error?.message || 'Failed to apply fixed shifts' }, { status: 500 });
  }
}

