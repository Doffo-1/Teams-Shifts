import { NextResponse } from 'next/server';
import { prisma, ensureDefaultData } from '@/lib/db';
import ExcelJS from 'exceljs';

export async function POST(req: Request) {
  try {
    await ensureDefaultData();
    const formData = await req.formData();
    const file = formData.get('file') as File;
    const teamIdParam = formData.get('teamId') as string | null;

    if (!file) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
    }

    let team = null;
    if (teamIdParam) {
      team = await prisma.team.findUnique({ where: { id: teamIdParam } });
    }
    if (!team) {
      team = await prisma.team.findFirst();
    }
    if (!team) {
      const defaultName = file.name ? file.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ').trim() : 'Imported Team';
      const cleanName = defaultName.charAt(0).toUpperCase() + defaultName.slice(1);
      team = await prisma.team.create({
        data: {
          name: cleanName,
          slug: cleanName.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-' + Date.now(),
          exportGroupName: cleanName,
          rule: { create: {} },
        },
      });
    }
    const targetTeamId = team.id;

    const buffer = Buffer.from(await file.arrayBuffer());
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as any);

    let worksheet = workbook.getWorksheet('Shifts') || workbook.getWorksheet('Diensten');
    if (!worksheet) {
      worksheet = workbook.worksheets.find(ws => ws.name.toLowerCase().includes('shift') || ws.name.toLowerCase().includes('dienst')) || workbook.worksheets[0];
    }

    if (!worksheet) {
      return NextResponse.json({ error: 'No worksheets found in the Excel file' }, { status: 400 });
    }

    let headerRow: ExcelJS.Row | null = null;
    let headerRowNumber = 1;
    const colMap: Record<string, number> = {};

    for (let i = 1; i <= 10; i++) {
      const row = worksheet.getRow(i);
      const tempMap: Record<string, number> = {};

      row.eachCell((cell, colNumber) => {
        let cellText = '';
        if (cell.value) {
          if (typeof cell.value === 'object' && 'richText' in cell.value) {
            cellText = (cell.value as any).richText.map((rt: any) => rt.text).join('');
          } else {
            cellText = cell.value.toString();
          }
        }
        if (cellText) {
          tempMap[cellText.trim().toLowerCase()] = colNumber;
        }
      });

      if (tempMap['lid'] || tempMap['member'] || tempMap['members']) {
        headerRow = row;
        headerRowNumber = i;
        Object.assign(colMap, tempMap);
        break;
      }
    }

    if (!headerRow) {
      return NextResponse.json({ error: 'Invalid Excel format: Could not find header row with Lid/Member column' }, { status: 400 });
    }

    const lidCol = colMap['lid'] || colMap['member'] || colMap['members'];
    const emailCol = colMap['e-mailadres werk'] || colMap['work email'] || colMap['wrok email'];
    const startDateCol = colMap['begindatum'] || colMap['start date'] || colMap['startdate'];
    const startTimeCol = colMap['begintijd'] || colMap['start time'] || colMap['starttime'];
    const endTimeCol = colMap['eindtijd'] || colMap['end time'] || colMap['endtime'];
    const colorCol = colMap['themakleur'] || colMap['theme color'] || colMap['themecolor'];
    const labelCol = colMap['aangepast label'] || colMap['custom label'] || colMap['customlabel'];
    const notesCol = colMap['notities'] || colMap['notes'];
    const groupCol = colMap['groep'] || colMap['group'];

    if (!lidCol || !startDateCol) {
      return NextResponse.json({ error: 'Invalid Excel format: Missing Lid or Begindatum column' }, { status: 400 });
    }

    const rowsToProcess: any[] = [];
    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber <= headerRowNumber) return;

      const member = row.getCell(lidCol).value?.toString().trim();
      const email = emailCol ? row.getCell(emailCol).value?.toString().trim() : '';
      let startDateStr = row.getCell(startDateCol).value;
      const startTime = startTimeCol ? row.getCell(startTimeCol).value?.toString().trim() : '';
      const endTime = endTimeCol ? row.getCell(endTimeCol).value?.toString().trim() : '';
      const color = colorCol ? row.getCell(colorCol).value?.toString().trim() : '';
      const label = labelCol ? row.getCell(labelCol).value?.toString().trim() : '';
      const notes = notesCol ? row.getCell(notesCol).value?.toString().trim() : '';
      const group = groupCol ? row.getCell(groupCol).value?.toString().trim() : '';

      if (!member || !startDateStr) return;

      let startDate: Date;
      if (startDateStr instanceof Date) {
        startDate = startDateStr;
      } else {
        startDate = new Date(startDateStr.toString());
      }

      if (isNaN(startDate.getTime())) {
        return;
      }

      rowsToProcess.push({ member, email, startDate, startTime, endTime, color, label, notes, group });
    });

    await prisma.$transaction(async (tx: any) => {
      for (const row of rowsToProcess) {
        let employee = null;

        if (row.email) {
          employee = await tx.employee.findFirst({
            where: {
              email: row.email,
              ...(targetTeamId ? { teamId: targetTeamId } : {}),
            },
          });
        }
        if (!employee) {
          employee = await tx.employee.findFirst({
            where: {
              name: row.member,
              ...(targetTeamId ? { teamId: targetTeamId } : {}),
            },
          });
        }

        let assignedGroup = 'DEFAULT';
        if (row.group) {
          assignedGroup = row.group;
        }

        if (!employee) {
          employee = await tx.employee.create({
            data: {
              name: row.member,
              email: row.email || '',
              group: assignedGroup,
              teamId: targetTeamId,
            },
          });
        } else if (row.group && employee.group === 'DEFAULT') {
          employee = await tx.employee.update({
            where: { id: employee.id },
            data: { group: assignedGroup },
          });
        }

        let type = 'CUSTOM';
        let location = 'OFFICE';
        let customStart = row.startTime || '';
        let customEnd = row.endTime || '';
        let shiftColor = 'PINK';
        let shiftNotes = row.notes || '';

        if (row.label) {
          const lbl = row.label.toString().trim();
          const lowerLbl = lbl.toLowerCase();

          if (lowerLbl === 'ziek' || lowerLbl === 'sick') {
            type = 'SICK';
            location = 'OFFICE';
            customStart = row.startTime || '08:30';
            customEnd = row.endTime || '17:00';
          } else if (lowerLbl === 'vakantie' || lowerLbl === 'vacation') {
            type = 'VACATION';
            location = 'OFFICE';
            customStart = row.startTime || '08:30';
            customEnd = row.endTime || '17:00';
          } else if (lowerLbl === 'thuis' || lowerLbl === 'home') {
            location = 'HOME';
            shiftNotes = (shiftNotes ? shiftNotes + ' ' : '') + 'Thuis';
          } else if (lowerLbl === 'kantoor' || lowerLbl === 'office') {
            location = 'OFFICE';
            shiftNotes = (shiftNotes ? shiftNotes + ' ' : '') + 'Kantoor';
          } else if (lbl) {
            location = lbl;
          }
        }

        if (type !== 'SICK' && type !== 'VACATION') {
          if (customStart === '07:30' && customEnd === '16:00') {
            type = 'EARLY';
          } else if (customStart === '09:30' && customEnd === '18:00') {
            type = 'LATE';
          }
        }

        if (type === 'CUSTOM') {
          if (row.color?.includes('Groen') || row.color?.includes('Green')) shiftColor = 'GREEN';
          else if (row.color?.includes('Blauw') || row.color?.includes('Blue')) shiftColor = 'BLUE';
        }

        await tx.shift.upsert({
          where: {
            employeeId_date: {
              employeeId: employee.id,
              date: row.startDate,
            },
          },
          update: {
            type,
            location,
            isManual: true,
            customStart: (type === 'CUSTOM' || type === 'VACATION' || type === 'SICK') ? customStart : '',
            customEnd: (type === 'CUSTOM' || type === 'VACATION' || type === 'SICK') ? customEnd : '',
            notes: shiftNotes,
            color: type === 'CUSTOM' ? shiftColor : '',
          },
          create: {
            employeeId: employee.id,
            date: row.startDate,
            type,
            location,
            isManual: true,
            customStart: (type === 'CUSTOM' || type === 'VACATION' || type === 'SICK') ? customStart : '',
            customEnd: (type === 'CUSTOM' || type === 'VACATION' || type === 'SICK') ? customEnd : '',
            notes: shiftNotes,
            color: type === 'CUSTOM' ? shiftColor : '',
          },
        });
      }
    });

    return NextResponse.json({ success: true, count: rowsToProcess.length });
  } catch (error: any) {
    console.error('Import error:', error);
    return NextResponse.json({ error: error?.message || 'Failed to import file' }, { status: 500 });
  }
}
